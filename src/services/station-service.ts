import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import { findPowerBucket } from "@/lib/config/power-buckets";
import { SELECTABLE_CONNECTORS } from "@/services/connector-service";
import { haversineDistanceKm, type LatLng } from "@/lib/geo/distance";
import type {
  StationListQuery,
  StationCreateInput,
  StationUpdateInput,
} from "@/lib/validation/station";

/**
 * Station business logic — the only place Station queries/mutations
 * happen. Route Handlers (src/app/api/stations/**) stay thin wrappers
 * around these functions, per docs/architecture.md §2/§4.
 */

// ---------------------------------------------------------------------------
// Shared Prisma include shapes
// ---------------------------------------------------------------------------

// Exported so other services that ultimately render a Station as a
// StationListItem (favorite-service.ts, Part 10) reuse this exact shape
// and toStationListItem() below instead of redefining a second, possibly
// drifting, "list card" projection of Station.
export const stationListInclude = {
  operator: { select: { id: true, name: true, contact: true, website: true } },
  chargers: {
    where: { isDeleted: false },
    select: {
      chargingMode: true,
      powerKw: true,
      connectors: { select: { connector: { select: { code: true, label: true } } } },
    },
  },
} satisfies Prisma.StationInclude;

const stationDetailInclude = {
  operator: { select: { id: true, name: true, contact: true, website: true } },
  chargers: {
    where: { isDeleted: false },
    orderBy: { createdAt: "asc" },
    include: {
      connectors: { include: { connector: { select: { code: true, label: true } } } },
    },
  },
} satisfies Prisma.StationInclude;

export type StationListRow = Prisma.StationGetPayload<{ include: typeof stationListInclude }>;
type StationDetailRow = Prisma.StationGetPayload<{ include: typeof stationDetailInclude }>;

export type StationRating = { average: number | null; count: number };

// ---------------------------------------------------------------------------
// Mapping — DB rows -> API shapes. Decimal fields are converted to real
// JSON numbers (see src/lib/db/serialize.ts); nothing sensitive (no
// password hashes, no VerificationLog rows) is ever included here.
// ---------------------------------------------------------------------------

/**
 * Station status is a simplified, two-value concept by product decision
 * (every station is ACTIVE unless explicitly INACTIVE) — see
 * src/lib/validation/station.ts and src/services/excel-station-parser.ts's
 * mapStationStatus(). `StationStatus.UNKNOWN` still exists in the Prisma
 * enum (so this wasn't a breaking schema migration) and every known row
 * was bulk-updated off it, but this normalizes any legacy/edge-case
 * UNKNOWN row defensively at the read layer too, rather than relying
 * solely on the one-time data fix — a real structural guarantee, not
 * just a point-in-time cleanup.
 */
function normalizeStationStatus(status: "ACTIVE" | "INACTIVE" | "UNKNOWN"): "ACTIVE" | "INACTIVE" {
  return status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
}

function summarizeChargers(chargers: StationListRow["chargers"] | StationDetailRow["chargers"]) {
  const connectorByCode = new Map<string, string>();
  const chargingModes = new Set<string>();
  let powerKwMax: number | null = null;

  for (const charger of chargers) {
    chargingModes.add(charger.chargingMode);
    for (const cc of charger.connectors) {
      connectorByCode.set(cc.connector.code, cc.connector.label);
    }
    const power = decimalToNumber(charger.powerKw);
    if (power !== null && (powerKwMax === null || power > powerKwMax)) {
      powerKwMax = power;
    }
  }

  return {
    count: chargers.length,
    connectors: Array.from(connectorByCode, ([code, label]) => ({ code, label })),
    chargingModes: Array.from(chargingModes),
    powerKwMax,
  };
}

export function toStationListItem(station: StationListRow) {
  return {
    id: station.id,
    stationId: station.stationId,
    stationName: station.stationName,
    operator: station.operator,
    province: station.province,
    district: station.district,
    city: station.city,
    address: station.address,
    latitude: decimalToNumber(station.latitude),
    longitude: decimalToNumber(station.longitude),
    coordinateSource: station.coordinateSource,
    mapUrl: station.mapUrl,
    status: normalizeStationStatus(station.status),
    verificationStatus: station.verificationStatus,
    assumptionFlag: station.assumptionFlag,
    chargerSummary: summarizeChargers(station.chargers),
    isDeleted: station.isDeleted,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
  };
}

export function toStationDetail(station: StationDetailRow, rating: StationRating) {
  return {
    id: station.id,
    stationId: station.stationId,
    stationName: station.stationName,
    operator: station.operator,
    province: station.province,
    district: station.district,
    city: station.city,
    address: station.address,
    contact: station.contact,
    latitude: decimalToNumber(station.latitude),
    longitude: decimalToNumber(station.longitude),
    coordinateSource: station.coordinateSource,
    mapUrl: station.mapUrl,
    status: normalizeStationStatus(station.status),
    verificationStatus: station.verificationStatus,
    assumptionFlag: station.assumptionFlag,
    verificationSource: station.verificationSource,
    lastVerified: station.lastVerified,
    locationVerified: station.locationVerified,
    connectorVerified: station.connectorVerified,
    powerVerified: station.powerVerified,
    contactVerified: station.contactVerified,
    availabilityVerified: station.availabilityVerified,
    chargerSummary: summarizeChargers(station.chargers),
    chargers: station.chargers.map((charger) => ({
      id: charger.id,
      plugId: charger.plugId,
      chargingMode: charger.chargingMode,
      powerKw: decimalToNumber(charger.powerKw),
      vehicleType: charger.vehicleType,
      availability: charger.availability,
      connectors: charger.connectors.map((cc) => ({
        code: cc.connector.code,
        label: cc.connector.label,
      })),
    })),
    rating,
    isDeleted: station.isDeleted,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
  };
}

export type StationListItem = ReturnType<typeof toStationListItem>;
export type StationDetail = ReturnType<typeof toStationDetail>;

async function getStationRating(stationId: string): Promise<StationRating> {
  const agg = await prisma.review.aggregate({
    where: { stationId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return {
    // Rounded to 1 decimal place for display; always computed fresh from
    // Review rows, never cached — see docs/architecture.md's Review rule.
    average: agg._avg.rating !== null ? Math.round(agg._avg.rating * 10) / 10 : null,
    count: agg._count.rating,
  };
}

// ---------------------------------------------------------------------------
// Public homepage stats
// ---------------------------------------------------------------------------

export type PublicStats = {
  stationCount: number;
  chargerCount: number;
  districtCount: number;
  connectorTypeCount: number;
};

/**
 * Lean, public-safe aggregate for the homepage stats strip. Deliberately
 * separate from admin-dashboard-service.ts's getAdminDashboardStats() —
 * that one pulls in user/report/favorite counts a homepage visitor has no
 * business triggering queries for. Every number here is computed fresh
 * from the live database, same "no invented numbers" rule as everywhere
 * else in this app.
 */
export async function getPublicStats(): Promise<PublicStats> {
  const [stationCount, chargerCount, districts, connectors] = await Promise.all([
    prisma.station.count({ where: { isDeleted: false } }),
    prisma.charger.count({ where: { isDeleted: false, station: { isDeleted: false } } }),
    prisma.station.findMany({
      where: { isDeleted: false },
      select: { district: true },
      distinct: ["district"],
    }),
    prisma.chargerConnector.findMany({
      where: { charger: { isDeleted: false, station: { isDeleted: false } } },
      select: { connector: { select: { code: true } } },
      distinct: ["connectorId"],
    }),
  ]);

  // "Connector Types" counts only the picker-facing types (see
  // SELECTABLE_CONNECTORS in connector-service.ts) — Unknown isn't a real
  // connector type, and CHAdeMO has zero real usage in the seeded dataset.
  const selectableCodes = new Set(SELECTABLE_CONNECTORS.map((c) => c.code));
  const connectorTypeCount = connectors.filter((c) => selectableCodes.has(c.connector.code)).length;

  return {
    stationCount,
    chargerCount,
    districtCount: districts.filter((d) => d.district.trim().length > 0).length,
    connectorTypeCount,
  };
}

// ---------------------------------------------------------------------------
// Nearest stations (Charging Calculator's "find a nearby station")
// ---------------------------------------------------------------------------

export type NearbyStation = ReturnType<typeof toStationListItem> & { distanceKm: number };

/**
 * The nearest `limit` stations to a point, straight-line distance. Only
 * stations with a real, confirmed latitude/longitude are ever considered —
 * a station with no coordinate is silently excluded rather than assigned a
 * guessed distance (same "never invent a location" rule as the map, see
 * docs/architecture.md §6). Two queries: a lightweight one over every
 * coordinate-bearing station to rank by distance, then a second fetching
 * full display data (operator, chargers) for just the top matches — avoids
 * pulling every station's full include just to throw most of it away.
 */
export async function getNearestStations(
  origin: LatLng,
  limit: number
): Promise<NearbyStation[]> {
  const candidates = await prisma.station.findMany({
    where: { isDeleted: false, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, latitude: true, longitude: true },
  });

  const ranked = candidates
    .map((s) => ({
      id: s.id,
      distanceKm: haversineDistanceKm(origin, {
        latitude: decimalToNumber(s.latitude) as number,
        longitude: decimalToNumber(s.longitude) as number,
      }),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const distanceById = new Map(ranked.map((r) => [r.id, r.distanceKm]));
  const stations = await prisma.station.findMany({
    where: { id: { in: ranked.map((r) => r.id) } },
    include: stationListInclude,
  });

  return stations
    .map((station) => ({
      ...toStationListItem(station),
      distanceKm: Math.round((distanceById.get(station.id) as number) * 10) / 10,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function buildStationWhere(
  query: StationListQuery,
  includeDeleted: boolean
): Prisma.StationWhereInput {
  const where: Prisma.StationWhereInput = {
    isDeleted: includeDeleted ? undefined : false,
  };

  if (query.province) where.province = query.province;
  if (query.district) where.district = query.district;
  if (query.city) where.city = query.city;
  if (query.operatorId) where.operatorId = query.operatorId;
  if (query.status) where.status = query.status;
  if (query.verificationStatus) where.verificationStatus = query.verificationStatus;

  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [
      { stationName: contains },
      { city: contains },
      { district: contains },
      { province: contains },
      { address: contains },
      { operator: { is: { name: contains } } },
    ];
  }

  if (query.chargingMode || query.connector || query.powerBucket || query.vehicleType || query.availability) {
    const bucket = query.powerBucket ? findPowerBucket(query.powerBucket) : undefined;
    const powerCondition: Prisma.ChargerWhereInput | undefined = !bucket
      ? undefined
      : {
          powerKw: {
            ...(bucket.min !== null ? { gt: bucket.min } : {}),
            ...(bucket.max !== null ? { lte: bucket.max } : {}),
          },
        };

    where.chargers = {
      some: {
        isDeleted: false,
        ...(query.chargingMode ? { chargingMode: query.chargingMode } : {}),
        ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
        ...(query.availability ? { availability: query.availability } : {}),
        ...(powerCondition ?? {}),
        ...(query.connector
          ? {
              connectors: {
                some: {
                  connector: {
                    OR: [
                      { code: { equals: query.connector, mode: "insensitive" } },
                      { label: { equals: query.connector, mode: "insensitive" } },
                    ],
                  },
                },
              },
            }
          : {}),
      },
    };
  }

  return where;
}

export async function listStations(query: StationListQuery, includeDeleted: boolean) {
  const where = buildStationWhere(query, includeDeleted);

  const [total, stations] = await Promise.all([
    prisma.station.count({ where }),
    prisma.station.findMany({
      where,
      orderBy: { stationName: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: stationListInclude,
    }),
  ]);

  return {
    data: stations.map(toStationListItem),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function getStationById(
  id: string,
  includeDeleted: boolean
): Promise<StationDetail | null> {
  const station = await prisma.station.findFirst({
    where: { id, ...(includeDeleted ? {} : { isDeleted: false }) },
    include: stationDetailInclude,
  });
  if (!station) return null;

  const rating = await getStationRating(id);
  return toStationDetail(station, rating);
}

// ---------------------------------------------------------------------------
// Mutations (ADMIN-only — enforced by the calling Route Handler via
// requireAdminForApi(), not re-checked here; this layer trusts its caller
// the same way any internal service layer does)
// ---------------------------------------------------------------------------

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function createStation(
  input: StationCreateInput
): Promise<MutationResult<StationDetail>> {
  if (input.operatorId) {
    const operator = await prisma.operator.findUnique({ where: { id: input.operatorId } });
    if (!operator) {
      return { ok: false, error: "operatorId does not reference an existing operator.", status: 400 };
    }
  }

  try {
    const station = await prisma.station.create({
      data: {
        stationId: input.stationId,
        stationName: input.stationName,
        operatorId: input.operatorId ?? null,
        province: input.province,
        district: input.district,
        city: input.city,
        address: input.address,
        contact: input.contact ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        mapUrl: input.mapUrl ?? null,
        status: input.status,
        verificationStatus: input.verificationStatus,
        assumptionFlag: input.assumptionFlag,
        verificationSource: input.verificationSource ?? null,
      },
      include: stationDetailInclude,
    });
    return { ok: true, data: toStationDetail(station, { average: null, count: 0 }) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A station with this station ID already exists.", status: 409 };
    }
    throw error;
  }
}

type LogEntry = { fieldChanged: string; oldValue: string | null; newValue: string | null };

function stringifyLogValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function pushIfChanged(logs: LogEntry[], field: string, oldValue: unknown, newValue: unknown) {
  const oldStr = stringifyLogValue(oldValue);
  const newStr = stringifyLogValue(newValue);
  if (oldStr !== newStr) {
    logs.push({ fieldChanged: field, oldValue: oldStr, newValue: newStr });
  }
}

/**
 * Partial update. Every changed verification-related field is written to
 * VerificationLog in the same transaction — see docs/architecture.md §5
 * ("every change is written to VerificationLog"). Non-verification fields
 * (name, address, contact, ...) are updated without a log entry.
 */
export async function updateStation(
  id: string,
  input: StationUpdateInput,
  adminId: string
): Promise<MutationResult<StationDetail>> {
  const existing = await prisma.station.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) {
    return { ok: false, error: "Station not found.", status: 404 };
  }

  if (input.operatorId !== undefined && input.operatorId !== null) {
    const operator = await prisma.operator.findUnique({ where: { id: input.operatorId } });
    if (!operator) {
      return { ok: false, error: "operatorId does not reference an existing operator.", status: 400 };
    }
  }

  const data: Prisma.StationUpdateInput = {};
  const logs: LogEntry[] = [];

  if (input.stationName !== undefined) data.stationName = input.stationName;
  if (input.operatorId !== undefined) {
    data.operator =
      input.operatorId === null ? { disconnect: true } : { connect: { id: input.operatorId } };
  }
  if (input.province !== undefined) data.province = input.province;
  if (input.district !== undefined) data.district = input.district;
  if (input.city !== undefined) data.city = input.city;
  if (input.address !== undefined) data.address = input.address;
  if (input.contact !== undefined) data.contact = input.contact;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.mapUrl !== undefined) data.mapUrl = input.mapUrl;
  if (input.status !== undefined) data.status = input.status;

  if (input.verificationStatus !== undefined) {
    pushIfChanged(logs, "verification_status", existing.verificationStatus, input.verificationStatus);
    data.verificationStatus = input.verificationStatus;
  }
  if (input.assumptionFlag !== undefined) {
    pushIfChanged(logs, "assumption_flag", existing.assumptionFlag, input.assumptionFlag);
    data.assumptionFlag = input.assumptionFlag;
  }
  if (input.verificationSource !== undefined) {
    pushIfChanged(logs, "verification_source", existing.verificationSource, input.verificationSource);
    data.verificationSource = input.verificationSource;
  }
  if (input.lastVerified !== undefined) {
    const newDate = input.lastVerified === null ? null : new Date(input.lastVerified);
    pushIfChanged(logs, "last_verified", existing.lastVerified, newDate);
    data.lastVerified = newDate;
  }
  if (input.locationVerified !== undefined) {
    pushIfChanged(logs, "location_verified", existing.locationVerified, input.locationVerified);
    data.locationVerified = input.locationVerified;
  }
  if (input.connectorVerified !== undefined) {
    pushIfChanged(logs, "connector_verified", existing.connectorVerified, input.connectorVerified);
    data.connectorVerified = input.connectorVerified;
  }
  if (input.powerVerified !== undefined) {
    pushIfChanged(logs, "power_verified", existing.powerVerified, input.powerVerified);
    data.powerVerified = input.powerVerified;
  }
  if (input.contactVerified !== undefined) {
    pushIfChanged(logs, "contact_verified", existing.contactVerified, input.contactVerified);
    data.contactVerified = input.contactVerified;
  }
  if (input.availabilityVerified !== undefined) {
    pushIfChanged(
      logs,
      "availability_verified",
      existing.availabilityVerified,
      input.availabilityVerified
    );
    data.availabilityVerified = input.availabilityVerified;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const station = await tx.station.update({ where: { id }, data, include: stationDetailInclude });
    if (logs.length > 0) {
      await tx.verificationLog.createMany({
        data: logs.map((log) => ({
          stationId: id,
          adminId,
          fieldChanged: log.fieldChanged,
          oldValue: log.oldValue,
          newValue: log.newValue,
        })),
      });
    }
    return station;
  });

  const rating = await getStationRating(id);
  return { ok: true, data: toStationDetail(updated, rating) };
}

/**
 * Soft delete only — never a hard DELETE, per docs/architecture.md §4.
 * Cascades to that station's chargers (also soft-deleted) so a "deleted"
 * station never has active-looking chargers hanging off it.
 */
export async function softDeleteStation(
  id: string,
  adminId: string
): Promise<MutationResult<StationDetail>> {
  const existing = await prisma.station.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) {
    return { ok: false, error: "Station not found.", status: 404 };
  }

  const now = new Date();
  // Chargers are soft-deleted FIRST so the station.update's include (which
  // filters chargers to isDeleted: false) reflects the post-delete state.
  const [, station] = await prisma.$transaction([
    prisma.charger.updateMany({
      where: { stationId: id, isDeleted: false },
      data: { isDeleted: true, deletedAt: now, deletedById: adminId },
    }),
    prisma.station.update({
      where: { id },
      data: { isDeleted: true, deletedAt: now, deletedById: adminId },
      include: stationDetailInclude,
    }),
  ]);

  const rating = await getStationRating(id);
  return { ok: true, data: toStationDetail(station, rating) };
}
