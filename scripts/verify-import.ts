/**
 * Sanity-checks the database after prisma/seed.ts has run: row counts,
 * relationship integrity (every station has chargers, every charger
 * resolves at least one connector), that no station picked up an invented
 * coordinate, and the verification-status / connector-usage distribution.
 *
 * Run with: npx tsx scripts/verify-import.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const stationCount = await prisma.station.count();
  const chargerCount = await prisma.charger.count();
  const operatorCount = await prisma.operator.count();
  const connectorCount = await prisma.connector.count();
  const aliasCount = await prisma.connectorAlias.count();
  const chargerConnectorCount = await prisma.chargerConnector.count();

  console.log({
    stationCount,
    chargerCount,
    operatorCount,
    connectorCount,
    aliasCount,
    chargerConnectorCount,
  });

  // Charger.stationId is a required, FK-enforced column, so orphan chargers
  // are structurally impossible — no need to check for them.
  const stationsWithNoChargers = await prisma.station.count({
    where: { chargers: { none: {} } },
  });
  console.log("stations with zero chargers:", stationsWithNoChargers);

  const chargersWithNoConnector = await prisma.charger.count({
    where: { connectors: { none: {} } },
  });
  console.log("chargers with zero resolved connectors:", chargersWithNoConnector);

  // Coordinates — must be null for all rows in this initial import.
  const withCoords = await prisma.station.count({
    where: { OR: [{ latitude: { not: null } }, { longitude: { not: null } }] },
  });
  console.log("stations with non-null coordinates (should be 0):", withCoords);

  // Verification distribution
  const byVerification = await prisma.station.groupBy({
    by: ["verificationStatus"],
    _count: true,
  });
  console.log("verificationStatus distribution:", byVerification);

  // Connector usage distribution
  const byConnector = await prisma.connector.findMany({
    select: {
      code: true,
      label: true,
      _count: { select: { chargerConnectors: true } },
    },
  });
  console.log("connector usage:", byConnector);

  // Sample station with its chargers/connectors, to eyeball shape
  const sample = await prisma.station.findFirst({
    where: { stationId: "EVNP-0001" },
    include: { chargers: { include: { connectors: { include: { connector: true } } } }, operator: true },
  });
  console.log("\nsample station EVNP-0001:", JSON.stringify(sample, null, 2));

  // The one NEEDS_REVIEW station
  const needsReview = await prisma.station.findMany({
    where: { verificationStatus: "NEEDS_REVIEW" },
    select: { stationId: true, stationName: true, verificationSource: true },
  });
  console.log("\nNEEDS_REVIEW stations:", needsReview);

  // Duplicate plug_id check (should be impossible given unique constraint, but confirm via count)
  const distinctPlugIds = await prisma.charger.findMany({ select: { plugId: true } });
  const uniquePlugIds = new Set(distinctPlugIds.map((c) => c.plugId));
  console.log("charger rows:", distinctPlugIds.length, "unique plugIds:", uniquePlugIds.size);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
