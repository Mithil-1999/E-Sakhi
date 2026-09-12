/**
 * E Sakhi — initial dataset seed / import script (Part 02).
 *
 * Reads the initial EV charging-station Excel dataset and loads it into
 * the database, preserving the Station -> many Charger/plug relationship
 * exactly (see docs/data-model.md).
 *
 * SCOPE NOTE: this script bootstraps/re-bootstraps the *initial* dataset.
 * It is safe to re-run against a fresh or already-seeded database (it
 * upserts by external id and never touches a Station's verification
 * fields or a Charger's availability on update — see the upsert calls
 * below). It is NOT the admin-facing Excel import/diff/approval tool —
 * that is Part 14 (docs/data-import.md, not yet written), which adds the
 * conflict-detection and admin-approval workflow needed to safely merge
 * a re-upload against data that admins have since verified by hand.
 * Do not point this script at a database with real admin-verified edits
 * expecting Part-14-style conflict protection; it doesn't have it.
 *
 * Run with: npx prisma db seed
 * (configured via prisma.config.ts -> migrations.seed)
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CANONICAL_CONNECTORS,
  buildAliasLookup,
  splitConnectorTokens,
  resolveConnectorToken,
} from "../src/services/connector-service";
import {
  type RawRow,
  type StationConsistencyIssue,
  readStationRows,
  mapStationStatus,
  resolveVerification,
  buildVerificationSource,
  pickContact,
  groupByStation,
  checkStationConsistency,
  str,
  strOrDefault,
  num,
} from "../src/services/excel-station-parser";
import { seedVehicles } from "./seed-vehicles";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EXCEL_PATH =
  process.env.EXCEL_DATA_PATH ??
  path.join(__dirname, "seed-data", "e-sakhi-data.xlsx");

const STATIONS_SHEET = "EV_Stations";

// -----------------------------------------------------------------------
// Seed
// -----------------------------------------------------------------------

async function seedConnectors() {
  const idByCode = new Map<string, string>();

  for (const c of CANONICAL_CONNECTORS) {
    const connector = await prisma.connector.upsert({
      where: { code: c.code },
      create: { code: c.code, label: c.label },
      update: { label: c.label },
    });
    idByCode.set(c.code, connector.id);

    for (const alias of c.aliases) {
      await prisma.connectorAlias.upsert({
        where: { aliasText: alias },
        create: { aliasText: alias, connectorId: connector.id },
        update: { connectorId: connector.id },
      });
    }
  }

  return idByCode;
}

async function seedOperators(rows: RawRow[]) {
  const names = new Set<string>();
  for (const row of rows) {
    const name = str(row.operator);
    if (name) names.add(name);
  }

  const idByName = new Map<string, string>();
  for (const name of names) {
    const operator = await prisma.operator.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    idByName.set(name, operator.id);
  }
  return idByName;
}

async function main() {
  console.log(`Reading dataset from: ${EXCEL_PATH}`);
  // readStationRows() (src/services/excel-station-parser.ts) is
  // Buffer-based — shared with the admin import tool (Part 14), which
  // only ever has an uploaded file's bytes, never a path on this
  // machine's disk. This script reads its own fixed, committed file into
  // a buffer first so both consumers hit the identical parsing code.
  const fileBuffer = fs.readFileSync(EXCEL_PATH);
  const rows = await readStationRows(fileBuffer);
  console.log(`Read ${rows.length} plug rows from "${STATIONS_SHEET}".`);

  console.log("Seeding canonical connectors + aliases...");
  const connectorIdByCode = await seedConnectors();

  // Reference vehicle catalog (Part 08) — unlike everything else in this
  // file, not sourced from the Excel workbook; see prisma/seed-vehicles.ts
  // for what it is and why it's deliberately small.
  console.log("Seeding reference vehicle catalog...");
  const vehicleCount = await seedVehicles(prisma);
  console.log(`  ${vehicleCount} vehicles.`);

  console.log("Seeding operators...");
  const operatorIdByName = await seedOperators(rows);
  console.log(`  ${operatorIdByName.size} distinct operators.`);

  const aliasLookup = buildAliasLookup();
  const stationGroups = groupByStation(rows);
  console.log(`Grouped into ${stationGroups.size} distinct stations.`);

  const consistencyIssues: StationConsistencyIssue[] = [];
  const unmatchedConnectorTokens = new Map<string, number>();
  const verificationCounts: Record<string, number> = {};
  let chargerCount = 0;
  let stationCount = 0;

  for (const [stationExternalId, stationRows] of stationGroups) {
    consistencyIssues.push(...checkStationConsistency(stationExternalId, stationRows));

    const first = stationRows[0];
    const verification = resolveVerification(first);
    verificationCounts[verification.status] =
      (verificationCounts[verification.status] ?? 0) + 1;

    const operatorName = str(first.operator);
    const operatorId = operatorName ? operatorIdByName.get(operatorName) : undefined;

    const stationCreateData: Prisma.StationCreateInput = {
      stationId: stationExternalId,
      stationName: strOrDefault(first.station_name, stationExternalId),
      province: strOrDefault(first.province, "Unknown"),
      district: strOrDefault(first.district, "Unknown"),
      city: strOrDefault(first.city, "Unknown"),
      address: strOrDefault(first.address, "Unknown"),
      contact: pickContact(first),
      // No station in this dataset has usable coordinates (map_url is a
      // text-search link, never a pin) — see docs/data-model.md addendum.
      latitude: null,
      longitude: null,
      mapUrl: str(first.map_url),
      status: mapStationStatus(str(first.status)),
      verificationStatus: verification.status,
      assumptionFlag: str(first.assumption_flag) === "YES",
      verificationSource: buildVerificationSource(first),
      lastVerified: null,
      locationVerified: false,
      connectorVerified: false,
      powerVerified: false,
      contactVerified: false,
      availabilityVerified: false,
      ...(operatorId ? { operator: { connect: { id: operatorId } } } : {}),
    };

    // Update never touches verification fields, so re-running this seed
    // can't clobber verification progress an admin makes after this
    // initial import (see the scope note at the top of this file).
    const stationUpdateData: Prisma.StationUpdateInput = {
      stationName: stationCreateData.stationName,
      province: stationCreateData.province,
      district: stationCreateData.district,
      city: stationCreateData.city,
      address: stationCreateData.address,
      contact: stationCreateData.contact,
      mapUrl: stationCreateData.mapUrl,
      status: stationCreateData.status,
      ...(operatorId ? { operator: { connect: { id: operatorId } } } : {}),
    };

    const station = await prisma.station.upsert({
      where: { stationId: stationExternalId },
      create: stationCreateData,
      update: stationUpdateData,
    });
    stationCount += 1;

    for (const plugRow of stationRows) {
      const plugId = str(plugRow.plug_id);
      if (!plugId) continue;

      const chargingModeRaw = str(plugRow.charging_mode);
      const chargingMode =
        chargingModeRaw === "AC" || chargingModeRaw === "DC" ? chargingModeRaw : "UNKNOWN";

      const powerKw = num(plugRow.power_kw_max) ?? num(plugRow.power_kw_dc) ?? num(plugRow.power_kw_ac);

      const chargerCreateData: Prisma.ChargerCreateInput = {
        plugId,
        station: { connect: { id: station.id } },
        chargingMode,
        powerKw,
        availability: "UNKNOWN",
      };
      const chargerUpdateData: Prisma.ChargerUpdateInput = {
        chargingMode,
        powerKw,
        // availability intentionally omitted from update — never reset a
        // real-time-set value back to UNKNOWN on re-import.
      };

      const charger = await prisma.charger.upsert({
        where: { plugId },
        create: chargerCreateData,
        update: chargerUpdateData,
      });
      chargerCount += 1;

      const rawConnectorType = str(plugRow.connector_type) ?? "";
      const tokens = splitConnectorTokens(rawConnectorType);
      const resolvedCodes = new Set<string>();
      for (const token of tokens) {
        const resolution = resolveConnectorToken(token, aliasLookup);
        if (!resolution.matched) {
          unmatchedConnectorTokens.set(
            token,
            (unmatchedConnectorTokens.get(token) ?? 0) + 1
          );
        }
        resolvedCodes.add(resolution.code);
      }
      if (resolvedCodes.size === 0) resolvedCodes.add("UNKNOWN");

      // Re-sync this charger's connector set to exactly what the source
      // says now (safe: ChargerConnector carries no verification state
      // of its own, unlike Station/Charger fields above).
      await prisma.chargerConnector.deleteMany({ where: { chargerId: charger.id } });
      for (const code of resolvedCodes) {
        const connectorId = connectorIdByCode.get(code);
        if (!connectorId) continue;
        await prisma.chargerConnector.create({
          data: { chargerId: charger.id, connectorId },
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Summary report
  // ---------------------------------------------------------------------
  console.log("\n=== Import summary ===");
  console.log(`Stations upserted: ${stationCount}`);
  console.log(`Chargers upserted: ${chargerCount}`);
  console.log("Verification status distribution (by station):", verificationCounts);

  if (unmatchedConnectorTokens.size > 0) {
    console.log("\nUnmatched connector tokens (imported as UNKNOWN):");
    for (const [token, count] of unmatchedConnectorTokens) {
      console.log(`  "${token}": ${count} occurrence(s)`);
    }
  } else {
    console.log("\nAll connector tokens matched a canonical connector.");
  }

  if (consistencyIssues.length > 0) {
    console.log(
      `\n${consistencyIssues.length} station-level field inconsistencies found across a station's own plug rows (used the first row's value):`
    );
    for (const issue of consistencyIssues.slice(0, 20)) {
      console.log(`  ${issue.stationId}.${issue.field}: ${issue.values.join(" | ")}`);
    }
    if (consistencyIssues.length > 20) {
      console.log(`  ...and ${consistencyIssues.length - 20} more.`);
    }
  } else {
    console.log("\nNo station-level field inconsistencies found across plug rows.");
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
