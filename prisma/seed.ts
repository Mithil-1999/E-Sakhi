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
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CANONICAL_CONNECTORS,
  buildAliasLookup,
  splitConnectorTokens,
  resolveConnectorToken,
} from "../src/services/connector-service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EXCEL_PATH =
  process.env.EXCEL_DATA_PATH ??
  path.join(__dirname, "seed-data", "e-sakhi-data.xlsx");

const STATIONS_SHEET = "EV_Stations";

// -----------------------------------------------------------------------
// Small typed helpers over ExcelJS's loosely-typed cell values
// -----------------------------------------------------------------------

type RawRow = Record<string, unknown>;

function cellToPlainValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && "text" in value) {
    // Rich text cell
    return (value as { text: string }).text;
  }
  if (value && typeof value === "object" && "result" in value) {
    // Formula cell — use the computed result
    return (value as { result: unknown }).result;
  }
  return value;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function strOrDefault(value: unknown, fallback: string): string {
  return str(value) ?? fallback;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Excel "Not Available" / blank sentinels used throughout this dataset. */
function isRealValue(value: string | null): value is string {
  return value !== null && value.toLowerCase() !== "not available";
}

async function readStationRows(filePath: string): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(STATIONS_SHEET);
  if (!sheet) {
    throw new Error(
      `Sheet "${STATIONS_SHEET}" not found in ${filePath}. Sheets present: ${workbook.worksheets
        .map((w) => w.name)
        .join(", ")}`
    );
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cellToPlainValue(cell.value) ?? "").trim();
  });

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const record: RawRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) record[key] = cellToPlainValue(cell.value);
    });
    rows.push(record);
  });

  return rows;
}

// -----------------------------------------------------------------------
// Mapping rules derived from actually inspecting the dataset (see the
// Part 02 addendum in docs/data-model.md for the full rationale).
// -----------------------------------------------------------------------

function mapStationStatus(rawStatus: string | null): "ACTIVE" | "INACTIVE" | "UNKNOWN" {
  if (rawStatus === "Not Available") return "INACTIVE";
  // "Listed" only confirms the compiler listed it, not that it is
  // operationally active — that is a real-time-shaped fact we don't have.
  return "UNKNOWN";
}

type VerificationOutcome = {
  status: "VERIFIED" | "NEEDS_REVIEW" | "ASSUMED";
  note: string;
};

/**
 * The source dataset marks `assumption_flag = 'YES'` on literally every
 * row and `verified = 'NO'` on all but one. That one `verified = 'YES'`
 * row is internally self-contradictory (source='NO', status='Not
 * Available', rating=0) — so rather than trust a self-contradictory
 * "verified" flag at face value, a row is only ever treated as VERIFIED
 * when it says verified=YES *and* shows none of those contradiction
 * signals. Everything else self-declared as an assumption imports as
 * ASSUMED, never as a stronger status than the source actually claims.
 */
function resolveVerification(row: RawRow): VerificationOutcome {
  const verified = str(row.verified);
  const source = str(row.source);
  const status = str(row.status);
  const rating = row.rating;

  const looksContradictory =
    source === "NO" ||
    status === "Not Available" ||
    (typeof rating === "number" && rating === 0);

  if (verified === "YES") {
    if (looksContradictory) {
      return {
        status: "NEEDS_REVIEW",
        note: "Source marked this record verified=YES, but other fields on the same row (source/status/rating) contradict that — flagged for admin review rather than trusted at face value.",
      };
    }
    return { status: "VERIFIED", note: "Source-reported as verified." };
  }

  return {
    status: "ASSUMED",
    note: "Source dataset self-declared this record as an assumption (assumption_flag=YES), not independently verified.",
  };
}

function buildVerificationSource(row: RawRow): string {
  const source = str(row.source);
  const lastVerifiedRaw = row.last_verified;
  const compiledDate =
    lastVerifiedRaw instanceof Date
      ? lastVerifiedRaw.toISOString().slice(0, 10)
      : str(lastVerifiedRaw);

  if (source && source !== "NO") {
    return compiledDate ? `${source} (source-compiled ${compiledDate})` : source;
  }
  return "Source metadata missing or invalid in the original dataset row; flagged for review.";
}

function pickContact(row: RawRow): string | null {
  const best = str(row.contact_best);
  if (best) return best;
  const raw = str(row.contact);
  return isRealValue(raw) ? raw : null;
}

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

type StationConsistencyIssue = {
  stationId: string;
  field: string;
  values: string[];
};

/** Fields expected to be identical across every plug-row of one station. */
const STATION_LEVEL_FIELDS = [
  "station_name",
  "operator",
  "address",
  "city",
  "district",
  "province",
  "map_url",
  "status",
] as const;

function groupByStation(rows: RawRow[]): Map<string, RawRow[]> {
  const groups = new Map<string, RawRow[]>();
  for (const row of rows) {
    const sid = str(row.station_id);
    if (!sid) continue;
    const arr = groups.get(sid) ?? [];
    arr.push(row);
    groups.set(sid, arr);
  }
  return groups;
}

function checkStationConsistency(
  stationId: string,
  rows: RawRow[]
): StationConsistencyIssue[] {
  const issues: StationConsistencyIssue[] = [];
  for (const field of STATION_LEVEL_FIELDS) {
    const values = new Set(rows.map((r) => str(r[field]) ?? ""));
    if (values.size > 1) {
      issues.push({ stationId, field, values: Array.from(values) });
    }
  }
  return issues;
}

async function main() {
  console.log(`Reading dataset from: ${EXCEL_PATH}`);
  const rows = await readStationRows(EXCEL_PATH);
  console.log(`Read ${rows.length} plug rows from "${STATIONS_SHEET}".`);

  console.log("Seeding canonical connectors + aliases...");
  const connectorIdByCode = await seedConnectors();

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
