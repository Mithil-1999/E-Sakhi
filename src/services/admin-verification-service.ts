import "server-only";
import { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type { VerificationQueueQuery, VerificationQueueTab } from "@/lib/validation/admin-verification";

/**
 * The verification workflow (Part 13) — a queue of stations that need
 * admin attention, and a station's full VerificationLog history (the
 * admin dashboard, Part 11, only shows the last 15 platform-wide). This
 * file only reads and reports; the actual verification-field *update*
 * still happens through updateStation() (src/services/station-service.ts,
 * Part 04) via the existing admin station edit form (Part 12) — this
 * queue links to that form rather than duplicating it.
 */

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/**
 * ATTENTION is the queue's default tab and the master brief's own framing:
 * "NEEDS_REVIEW and low-confidence (ASSUMED/UNVERIFIED)" stations. ALL
 * removes the status filter entirely; every other tab name is a real
 * VerificationStatus value, filtered to just that one.
 */
function statusesForTab(tab: VerificationQueueTab): VerificationStatus[] | null {
  if (tab === "ATTENTION") return ["NEEDS_REVIEW", "ASSUMED", "UNVERIFIED"];
  if (tab === "ALL") return null;
  return [tab];
}

const verificationQueueInclude = {
  _count: { select: { chargers: { where: { isDeleted: false } } } },
} satisfies Prisma.StationInclude;

type VerificationQueueRow = Prisma.StationGetPayload<{ include: typeof verificationQueueInclude }>;

function toVerificationQueueItem(station: VerificationQueueRow) {
  return {
    id: station.id,
    stationName: station.stationName,
    province: station.province,
    district: station.district,
    city: station.city,
    status: station.status,
    verificationStatus: station.verificationStatus,
    assumptionFlag: station.assumptionFlag,
    verificationSource: station.verificationSource,
    lastVerified: station.lastVerified,
    locationVerified: station.locationVerified,
    connectorVerified: station.connectorVerified,
    powerVerified: station.powerVerified,
    contactVerified: station.contactVerified,
    availabilityVerified: station.availabilityVerified,
    chargerCount: station._count.chargers,
  };
}

export type VerificationQueueItem = ReturnType<typeof toVerificationQueueItem>;

/**
 * Soft-deleted stations are excluded — there's nothing to verify about a
 * record that's been taken down. Ordered by station name, same
 * predictable default as every other admin list (station-service.ts's
 * listStations()) rather than a bespoke "urgency" ranking; the tabs
 * themselves are what narrow to what actually needs attention.
 */
export async function listVerificationQueue(query: VerificationQueueQuery) {
  const statuses = statusesForTab(query.tab);

  const where: Prisma.StationWhereInput = {
    isDeleted: false,
    ...(statuses ? { verificationStatus: { in: statuses } } : {}),
    ...(query.search
      ? {
          OR: [
            { stationName: { contains: query.search, mode: "insensitive" as const } },
            { city: { contains: query.search, mode: "insensitive" as const } },
            { district: { contains: query.search, mode: "insensitive" as const } },
            { province: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, stations] = await Promise.all([
    prisma.station.count({ where }),
    prisma.station.findMany({
      where,
      orderBy: { stationName: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: verificationQueueInclude,
    }),
  ]);

  return {
    data: stations.map(toVerificationQueueItem),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

// ---------------------------------------------------------------------------
// Per-station history
// ---------------------------------------------------------------------------

const verificationLogInclude = {
  admin: { select: { id: true, name: true } },
} satisfies Prisma.VerificationLogInclude;

export type StationVerificationLogEntry = Prisma.VerificationLogGetPayload<{
  include: typeof verificationLogInclude;
}>;

/**
 * Full (not last-15) history for one station. `limit` is a generous cap
 * (not a "recent activity" style truncation) — at this app's real scale
 * a station accumulates a handful of entries per verification pass, not
 * thousands, so 200 is "effectively all of it" while still bounding the
 * query.
 */
export async function getVerificationLogForStation(
  stationId: string,
  limit = 200
): Promise<StationVerificationLogEntry[]> {
  return prisma.verificationLog.findMany({
    where: { stationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: verificationLogInclude,
  });
}
