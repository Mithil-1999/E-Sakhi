import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import type { VehicleListQuery } from "@/lib/validation/vehicle";

/**
 * Vehicles are read-only through the API — the catalog is seeded (see
 * prisma/seed-vehicles.ts, Part 08) and there's no admin vehicle-editing
 * UI yet. Powers the charging calculator's "pick a vehicle" list (Part 08)
 * and, later, the recommendation engine's compatibility scoring (Part 09).
 */

const vehicleListInclude = {
  connectors: { select: { connector: { select: { code: true, label: true } } } },
} satisfies Prisma.VehicleInclude;

type VehicleListRow = Prisma.VehicleGetPayload<{ include: typeof vehicleListInclude }>;

function toVehicleListItem(vehicle: VehicleListRow) {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    vehicleType: vehicle.vehicleType,
    batteryCapacityKwh: decimalToNumber(vehicle.batteryCapacityKwh) as number,
    maxDcPowerKw: decimalToNumber(vehicle.maxDcPowerKw),
    maxAcPowerKw: decimalToNumber(vehicle.maxAcPowerKw),
    connectors: vehicle.connectors.map((vc) => ({
      code: vc.connector.code,
      label: vc.connector.label,
    })),
  };
}

export type VehicleListItem = ReturnType<typeof toVehicleListItem>;

export async function listVehicles(query: VehicleListQuery = {}) {
  const where: Prisma.VehicleWhereInput = query.vehicleType
    ? { vehicleType: query.vehicleType }
    : {};

  const vehicles = await prisma.vehicle.findMany({
    where,
    orderBy: [{ brand: "asc" }, { model: "asc" }],
    include: vehicleListInclude,
  });

  return vehicles.map(toVehicleListItem);
}
