/**
 * E Sakhi — reference vehicle catalog seed (Part 08, charging calculator).
 *
 * Unlike prisma/seed.ts (which imports the real, user-provided Excel
 * dataset), `Vehicle` has no source spreadsheet — there's no "real" list
 * of every EV in Nepal to import. This seeds a small, deliberately modest
 * catalog of electric cars actually sold in Nepal, using each
 * manufacturer's commonly published specs (battery capacity, max AC/DC
 * charging power, connector). It exists so the charging calculator (Part
 * 08) and the future recommendation engine (Part 09) have real vehicles
 * to pick from — it does not claim to be an exhaustive or independently
 * field-verified fleet list the way Station data's verification model
 * does (Vehicle has no verification_status field; this is catalog/spec
 * data, not a per-record confidence claim).
 *
 * Deliberately does NOT include electric scooters/motorcycles: most
 * consumer two-wheelers charge from a proprietary wall charger, not one
 * of this app's standardized station connectors (CCS2/GB/T/Type 2/
 * CHAdeMO), and this project doesn't have a confident source for
 * per-model power/connector figures for the two-wheelers actually
 * imported into Nepal — so rather than guess, that gap is left honest.
 * The calculator's manual-entry path covers scooters, motorcycles, and
 * any car not listed here — see
 * src/components/features/ChargingCalculatorTool.tsx.
 *
 * Idempotent: upserts by the schema's @@unique([brand, model]) and
 * @@unique([vehicleId, connectorId]) — safe to re-run. Called from
 * prisma/seed.ts's main() so `npm run db:seed` stays the single
 * onboarding command; also directly runnable on its own.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type VehicleSeed = {
  brand: string;
  model: string;
  vehicleType: "CAR";
  batteryCapacityKwh: number;
  maxDcPowerKw: number | null;
  maxAcPowerKw: number | null;
  /** Canonical Connector.code — must already exist (see seedConnectors() in prisma/seed.ts). */
  connectorCode: string;
};

export const VEHICLE_CATALOG: VehicleSeed[] = [
  {
    brand: "Tata",
    model: "Nexon EV Max",
    vehicleType: "CAR",
    batteryCapacityKwh: 40.5,
    maxDcPowerKw: 50,
    maxAcPowerKw: 7.2,
    connectorCode: "CCS2",
  },
  {
    brand: "Tata",
    model: "Tiago EV (Medium Range)",
    vehicleType: "CAR",
    batteryCapacityKwh: 24,
    maxDcPowerKw: 25,
    maxAcPowerKw: 3.3,
    connectorCode: "CCS2",
  },
  {
    brand: "Hyundai",
    model: "Kona Electric",
    vehicleType: "CAR",
    batteryCapacityKwh: 39.2,
    maxDcPowerKw: 50,
    maxAcPowerKw: 7.2,
    connectorCode: "CCS2",
  },
  {
    brand: "MG",
    model: "ZS EV",
    vehicleType: "CAR",
    batteryCapacityKwh: 50.3,
    maxDcPowerKw: 76.6,
    maxAcPowerKw: 7,
    connectorCode: "CCS2",
  },
  {
    brand: "BYD",
    model: "Atto 3",
    vehicleType: "CAR",
    batteryCapacityKwh: 60.48,
    maxDcPowerKw: 80,
    maxAcPowerKw: 7,
    connectorCode: "CCS2",
  },
];

export async function seedVehicles(prisma: PrismaClient): Promise<number> {
  let count = 0;

  for (const v of VEHICLE_CATALOG) {
    const connector = await prisma.connector.findUnique({ where: { code: v.connectorCode } });
    if (!connector) {
      throw new Error(
        `seedVehicles: connector code "${v.connectorCode}" not found — connectors must be seeded first.`
      );
    }

    const vehicle = await prisma.vehicle.upsert({
      where: { brand_model: { brand: v.brand, model: v.model } },
      create: {
        brand: v.brand,
        model: v.model,
        vehicleType: v.vehicleType,
        batteryCapacityKwh: v.batteryCapacityKwh,
        maxDcPowerKw: v.maxDcPowerKw,
        maxAcPowerKw: v.maxAcPowerKw,
      },
      update: {
        vehicleType: v.vehicleType,
        batteryCapacityKwh: v.batteryCapacityKwh,
        maxDcPowerKw: v.maxDcPowerKw,
        maxAcPowerKw: v.maxAcPowerKw,
      },
    });

    await prisma.vehicleConnector.upsert({
      where: { vehicleId_connectorId: { vehicleId: vehicle.id, connectorId: connector.id } },
      create: { vehicleId: vehicle.id, connectorId: connector.id },
      update: {},
    });

    count += 1;
  }

  return count;
}

// Standalone runnable (`npx tsx prisma/seed-vehicles.ts`), independent of
// prisma/seed.ts's own main() — useful for re-seeding just the vehicle
// catalog without re-reading the Excel workbook.
if (require.main === module) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  seedVehicles(prisma)
    .then((count) => console.log(`Seeded ${count} vehicles.`))
    .catch((err) => {
      console.error("Vehicle seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
