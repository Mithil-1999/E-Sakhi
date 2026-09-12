import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type { ChargerListQuery } from "@/lib/validation/charger";

/**
 * Chargers are read-only through the API in this part — creating/editing
 * chargers happens as part of admin station management (Part 12), not
 * here. See docs/architecture.md §2.
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
