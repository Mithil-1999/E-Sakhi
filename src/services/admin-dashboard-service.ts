import "server-only";
import { Prisma, ReportStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Read-only aggregate stats for the admin overview page (Part 11). Every
 * number here is computed fresh from the live database on each request —
 * nothing hard-coded, nothing cached — same rule as every other stat this
 * app shows (station ratings, chargerSummary, etc.).
 *
 * This is the *overview/reporting* layer only. Managing stations through
 * a UI is Part 12; a dedicated verification workflow (approving/rejecting
 * NEEDS_REVIEW stations, bulk actions) is Part 13 — this file only reads,
 * it never mutates.
 */

export type StationStatusCounts = { status: "ACTIVE" | "INACTIVE"; count: number };
export type VerificationStatusCounts = { status: VerificationStatus; count: number };
export type ReportStatusCounts = { status: ReportStatus; count: number };

export type AdminDashboardStats = {
  stations: {
    /** Non-deleted stations — matches every public listing's definition of "a station." */
    total: number;
    byStatus: StationStatusCounts[];
    /** Stations with a confirmed, non-null latitude/longitude. */
    withCoordinates: number;
    deleted: number;
    /** How many of the total this specific admin created (Station.createdById) — 0 for the ~460 seeded stations, which predate audit tracking and have no createdById. Only computed when `actingUserId` is passed to getAdminDashboardStats(). */
    createdByActingUser: number;
  };
  chargers: {
    total: number;
    deleted: number;
  };
  operators: number;
  connectors: number;
  users: {
    total: number;
    /** ADMIN + SUPER_ADMIN combined — the pre-RBAC-upgrade meaning, kept for the existing Admin Dashboard's stat card. */
    admins: number;
    /** RBAC upgrade breakdown, for the Super-Admin-only extra dashboard cards. */
    superAdminCount: number;
    adminOnlyCount: number;
    memberCount: number;
    activeCount: number;
    inactiveCount: number;
  };
  favorites: number;
  reviews: number;
  reports: {
    total: number;
    pending: number;
  };
  verificationDistribution: VerificationStatusCounts[];
  /** Every ReportStatus, even at 0 — used by /admin/reports' tab counts (Part 15), same "absent is real information" rule as verificationDistribution. */
  reportStatusDistribution: ReportStatusCounts[];
};

// Station status is a simplified two-value concept by product decision —
// every station is ACTIVE unless explicitly INACTIVE. See
// src/services/station-service.ts's normalizeStationStatus().
const ALL_STATION_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export async function getAdminDashboardStats(actingUserId?: string): Promise<AdminDashboardStats> {
  const [
    stationTotal,
    stationStatusGroups,
    stationsWithCoordinates,
    stationsDeleted,
    stationsCreatedByActingUser,
    chargerTotal,
    chargersDeleted,
    operatorCount,
    connectorCount,
    userTotal,
    adminCount,
    superAdminCount,
    adminOnlyCount,
    memberCount,
    activeUserCount,
    inactiveUserCount,
    favoriteCount,
    reviewCount,
    reportTotal,
    reportPending,
    verificationGroups,
    reportStatusGroups,
  ] = await Promise.all([
    prisma.station.count({ where: { isDeleted: false } }),
    prisma.station.groupBy({ by: ["status"], where: { isDeleted: false }, _count: true }),
    prisma.station.count({
      where: { isDeleted: false, latitude: { not: null }, longitude: { not: null } },
    }),
    prisma.station.count({ where: { isDeleted: true } }),
    actingUserId
      ? prisma.station.count({ where: { isDeleted: false, createdById: actingUserId } })
      : Promise.resolve(0),
    prisma.charger.count({ where: { isDeleted: false } }),
    prisma.charger.count({ where: { isDeleted: true } }),
    prisma.operator.count(),
    prisma.connector.count(),
    prisma.user.count(),
    prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
    prisma.user.count({ where: { role: "SUPER_ADMIN" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "USER" } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "INACTIVE" } }),
    prisma.favorite.count(),
    prisma.review.count(),
    prisma.report.count(),
    prisma.report.count({ where: { status: "PENDING" } }),
    prisma.station.groupBy({ by: ["verificationStatus"], where: { isDeleted: false }, _count: true }),
    prisma.report.groupBy({ by: ["status"], _count: true }),
  ]);

  // Every enum value is represented even at 0 — a status nobody currently
  // has is real information ("no station is INACTIVE"), not a gap to hide.
  const byStatus: StationStatusCounts[] = ALL_STATION_STATUSES.map((status) => ({
    status,
    count: stationStatusGroups.find((g) => g.status === status)?._count ?? 0,
  }));

  const verificationDistribution: VerificationStatusCounts[] = Object.values(VerificationStatus).map(
    (status) => ({
      status,
      count: verificationGroups.find((g) => g.verificationStatus === status)?._count ?? 0,
    })
  );

  const reportStatusDistribution: ReportStatusCounts[] = Object.values(ReportStatus).map((status) => ({
    status,
    count: reportStatusGroups.find((g) => g.status === status)?._count ?? 0,
  }));

  return {
    stations: {
      total: stationTotal,
      byStatus,
      withCoordinates: stationsWithCoordinates,
      deleted: stationsDeleted,
      createdByActingUser: stationsCreatedByActingUser,
    },
    chargers: { total: chargerTotal, deleted: chargersDeleted },
    operators: operatorCount,
    connectors: connectorCount,
    users: {
      total: userTotal,
      admins: adminCount,
      superAdminCount,
      adminOnlyCount,
      memberCount,
      activeCount: activeUserCount,
      inactiveCount: inactiveUserCount,
    },
    favorites: favoriteCount,
    reviews: reviewCount,
    reports: { total: reportTotal, pending: reportPending },
    verificationDistribution,
    reportStatusDistribution,
  };
}

// ---------------------------------------------------------------------------
// Recent verification activity
// ---------------------------------------------------------------------------

/**
 * Human labels for the snake_case field_changed values station-service.ts
 * actually writes (see pushIfChanged() calls in updateStation()). Falls
 * back to a readable guess for anything not in this list rather than
 * crashing or showing the raw snake_case — new verification fields don't
 * need this file updated to render honestly, just less prettily.
 */
const FIELD_LABELS: Record<string, string> = {
  verification_status: "Verification status",
  assumption_flag: "Assumption flag",
  verification_source: "Verification source",
  last_verified: "Last verified",
  location_verified: "Location verified",
  connector_verified: "Connector verified",
  power_verified: "Power verified",
  contact_verified: "Contact verified",
  availability_verified: "Availability verified",
};

export function labelForField(fieldChanged: string): string {
  return (
    FIELD_LABELS[fieldChanged] ??
    fieldChanged
      .split("_")
      .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ")
  );
}

const recentActivityInclude = {
  station: { select: { id: true, stationName: true } },
  admin: { select: { id: true, name: true } },
} satisfies Prisma.VerificationLogInclude;

export type RecentVerificationActivity = Prisma.VerificationLogGetPayload<{
  include: typeof recentActivityInclude;
}>;

export async function getRecentVerificationActivity(limit = 15): Promise<RecentVerificationActivity[]> {
  return prisma.verificationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: recentActivityInclude,
  });
}
