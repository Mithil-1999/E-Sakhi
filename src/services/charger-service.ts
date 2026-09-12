import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type { ChargerListQuery, ChargerCreateInput, ChargerUpdateInput } from "@/lib/validation/charger";

/**
 * Charger business logic. Listing has been public/read-only since Part
 * 04; creating, editing, and soft-deleting chargers (Part 12) live here
 * too, consumed by the admin station management UI (src/app/admin/stations/**)
 * — never by a public route. See docs/architecture.md §2.
 */

const chargerListInclude = {
  station: { select: { id: true, stationName: true, city: true, province: true } },
  connectors: { select: { connector: { select: { code: true, label: true } } } },
} satisfies Prisma.ChargerInclude;

type ChargerListRow = Prisma.ChargerGetPayload<{ include: typeof chargerListInclude }>;

function toChargerListItem(charger: ChargerListRow) {
  return {
    id: charger.id,
    plugId: charger.plugId,
    station: charger.station,
    chargingMode: charger.chargingMode,
    powerKw: decimalToNumber(charger.powerKw),
    vehicleType: charger.vehicleType,
    availability: charger.availability,
    connectors: charger.connectors.map((cc) => ({
      code: cc.connector.code,
      label: cc.connector.label,
    })),
    createdAt: charger.createdAt,
    updatedAt: charger.updatedAt,
  };
}

function buildChargerWhere(query: ChargerListQuery): Prisma.ChargerWhereInput {
  const where: Prisma.ChargerWhereInput = { isDeleted: false };

  if (query.stationId) where.stationId = query.stationId;
  if (query.chargingMode) where.chargingMode = query.chargingMode;
  if (query.connector) {
    where.connectors = {
      some: {
        connector: {
          OR: [
            { code: { equals: query.connector, mode: "insensitive" } },
            { label: { equals: query.connector, mode: "insensitive" } },
          ],
        },
      },
    };
  }

  return where;
}

export async function listChargers(query: ChargerListQuery) {
  const where = buildChargerWhere(query);

  const [total, chargers] = await Promise.all([
    prisma.charger.count({ where }),
    prisma.charger.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: chargerListInclude,
    }),
  ]);

  return {
    data: chargers.map(toChargerListItem),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

// ---------------------------------------------------------------------------
// Admin mutations (ADMIN-only — enforced by the calling Route Handler via
// requireAdminForApi(), not re-checked here; same trust boundary as
// station-service.ts's mutations)
// ---------------------------------------------------------------------------

const chargerAdminInclude = {
  connectors: { select: { connector: { select: { code: true, label: true } } } },
} satisfies Prisma.ChargerInclude;

type ChargerAdminRow = Prisma.ChargerGetPayload<{ include: typeof chargerAdminInclude }>;

function toChargerAdminItem(charger: ChargerAdminRow) {
  return {
    id: charger.id,
    stationId: charger.stationId,
    plugId: charger.plugId,
    chargingMode: charger.chargingMode,
    powerKw: decimalToNumber(charger.powerKw),
    vehicleType: charger.vehicleType,
    availability: charger.availability,
    connectors: charger.connectors.map((cc) => ({ code: cc.connector.code, label: cc.connector.label })),
    isDeleted: charger.isDeleted,
    createdAt: charger.createdAt,
    updatedAt: charger.updatedAt,
  };
}

export type ChargerAdminItem = ReturnType<typeof toChargerAdminItem>;

export type ChargerMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/**
 * Every connectorCodes entry must name a real Connector row — an
 * admin-entered typo is rejected here rather than silently imported as
 * "UNKNOWN" the way the Part 02/14 bulk-import normalizer does; a human
 * filling out one form is expected to pick from the real canonical list
 * (src/services/connector-service.ts's CANONICAL_CONNECTORS), not type
 * free text.
 */
async function resolveConnectorIds(
  codes: string[]
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const unique = Array.from(new Set(codes));
  const connectors = await prisma.connector.findMany({ where: { code: { in: unique } } });
  if (connectors.length !== unique.length) {
    return { ok: false, error: "One or more connector codes are not recognized." };
  }
  return { ok: true, ids: connectors.map((c) => c.id) };
}

export async function createCharger(
  input: ChargerCreateInput
): Promise<ChargerMutationResult<ChargerAdminItem>> {
  const station = await prisma.station.findUnique({ where: { id: input.stationId } });
  if (!station || station.isDeleted) {
    return { ok: false, error: "Station not found.", status: 404 };
  }

  const resolved = await resolveConnectorIds(input.connectorCodes);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, status: 400 };
  }

  try {
    const charger = await prisma.charger.create({
      data: {
        plugId: input.plugId ?? null,
        station: { connect: { id: input.stationId } },
        chargingMode: input.chargingMode,
        powerKw: input.powerKw ?? null,
        vehicleType: input.vehicleType ?? null,
        availability: input.availability,
        connectors: { create: resolved.ids.map((connectorId) => ({ connectorId })) },
      },
      include: chargerAdminInclude,
    });
    return { ok: true, data: toChargerAdminItem(charger) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A charger with this plug ID already exists.", status: 409 };
    }
    throw error;
  }
}

/**
 * Partial update. When connectorCodes is provided, the charger's full
 * connector set is re-synced (deleted and recreated) to exactly what was
 * submitted — same "re-sync, not merge" approach prisma/seed.ts already
 * uses for the same join table, safe because ChargerConnector carries no
 * verification state of its own (unlike the Station/Charger fields
 * VerificationLog tracks).
 */
export async function updateCharger(
  id: string,
  input: ChargerUpdateInput
): Promise<ChargerMutationResult<ChargerAdminItem>> {
  const existing = await prisma.charger.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) {
    return { ok: false, error: "Charger not found.", status: 404 };
  }

  let connectorIds: string[] | undefined;
  if (input.connectorCodes !== undefined) {
    const resolved = await resolveConnectorIds(input.connectorCodes);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error, status: 400 };
    }
    connectorIds = resolved.ids;
  }

  const data: Prisma.ChargerUpdateInput = {};
  if (input.plugId !== undefined) data.plugId = input.plugId;
  if (input.chargingMode !== undefined) data.chargingMode = input.chargingMode;
  if (input.powerKw !== undefined) data.powerKw = input.powerKw;
  if (input.vehicleType !== undefined) data.vehicleType = input.vehicleType;
  if (input.availability !== undefined) data.availability = input.availability;

  try {
    const charger = await prisma.$transaction(async (tx) => {
      await tx.charger.update({ where: { id }, data });
      if (connectorIds) {
        await tx.chargerConnector.deleteMany({ where: { chargerId: id } });
        if (connectorIds.length > 0) {
          await tx.chargerConnector.createMany({
            data: connectorIds.map((connectorId) => ({ chargerId: id, connectorId })),
          });
        }
      }
      return tx.charger.findUniqueOrThrow({ where: { id }, include: chargerAdminInclude });
    });
    return { ok: true, data: toChargerAdminItem(charger) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A charger with this plug ID already exists.", status: 409 };
    }
    throw error;
  }
}

/** Soft delete only — never a hard DELETE, same rule as stations (docs/architecture.md §4). */
export async function softDeleteCharger(
  id: string,
  adminId: string
): Promise<ChargerMutationResult<ChargerAdminItem>> {
  const existing = await prisma.charger.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) {
    return { ok: false, error: "Charger not found.", status: 404 };
  }

  const updated = await prisma.charger.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: adminId },
    include: chargerAdminInclude,
  });
  return { ok: true, data: toChargerAdminItem(updated) };
}
