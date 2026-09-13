/**
 * Excel row parsing/mapping — extracted from prisma/seed.ts (Part 02) so
 * this exact logic is shared by two consumers instead of duplicated: the
 * bootstrap seed script and the admin Excel import/update tool (Part 14,
 * src/services/import-service.ts). See docs/data-import.md §4.
 *
 * Pure functions only — no database access, no "server-only" (mirrors
 * src/services/connector-service.ts and charging-calculator.ts, which are
 * likewise safe to import from either side for the same reason). Every
 * mapping rule here is unchanged from what Part 02 derived by actually
 * inspecting the real dataset — see docs/data-model.md §8 for the
 * rationale behind each one; this file only relocates the code.
 */

import type ExcelJS from "exceljs";

export type RawRow = Record<string, unknown>;

const STATIONS_SHEET = "EV_Stations";

// ---------------------------------------------------------------------------
// Small typed helpers over ExcelJS's loosely-typed cell values
// ---------------------------------------------------------------------------

export function cellToPlainValue(value: ExcelJS.CellValue): unknown {
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

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

export function strOrDefault(value: unknown, fallback: string): string {
  return str(value) ?? fallback;
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Excel "Not Available" / blank sentinels used throughout this dataset. */
export function isRealValue(value: string | null): value is string {
  return value !== null && value.toLowerCase() !== "not available";
}

/**
 * Reads the "EV_Stations" sheet from a workbook buffer — Buffer-based
 * (not file-path-based) so the same function serves prisma/seed.ts
 * (reads the committed file into a Buffer first) and the admin import
 * tool (already has a Buffer from an uploaded file, never touches disk).
 */
export async function readStationRows(buffer: Buffer | ArrayBuffer): Promise<RawRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ExcelJS.Buffer);

  const sheet = workbook.getWorksheet(STATIONS_SHEET);
  if (!sheet) {
    throw new Error(
      `Sheet "${STATIONS_SHEET}" not found. Sheets present: ${workbook.worksheets
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

// ---------------------------------------------------------------------------
// Mapping rules derived from actually inspecting the dataset (see the
// Part 02 addendum in docs/data-model.md for the full rationale).
// ---------------------------------------------------------------------------

export function mapStationStatus(rawStatus: string | null): "ACTIVE" | "INACTIVE" {
  if (rawStatus === "Not Available") return "INACTIVE";
  // Simplified to a two-value status by product decision: every station
  // defaults to ACTIVE unless the source data explicitly says otherwise
  // ("Not Available" -> INACTIVE, above). StationStatus.UNKNOWN still
  // exists in the schema (see prisma/schema.prisma) so it isn't a
  // breaking migration, but nothing in this app sets or displays it
  // anymore — see docs/architecture.md's station-status note.
  return "ACTIVE";
}

export type VerificationOutcome = {
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
export function resolveVerification(row: RawRow): VerificationOutcome {
  const verified = str(row.verified);
  const source = str(row.source);
  const status = str(row.status);
  const rating = row.rating;

  const looksContradictory =
    source === "NO" || status === "Not Available" || (typeof rating === "number" && rating === 0);

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

export function buildVerificationSource(row: RawRow): string {
  const source = str(row.source);
  const lastVerifiedRaw = row.last_verified;
  const compiledDate =
    lastVerifiedRaw instanceof Date ? lastVerifiedRaw.toISOString().slice(0, 10) : str(lastVerifiedRaw);

  if (source && source !== "NO") {
    return compiledDate ? `${source} (source-compiled ${compiledDate})` : source;
  }
  return "Source metadata missing or invalid in the original dataset row; flagged for review.";
}

export function pickContact(row: RawRow): string | null {
  const best = str(row.contact_best);
  if (best) return best;
  const raw = str(row.contact);
  return isRealValue(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// Grouping + consistency check
// ---------------------------------------------------------------------------

export type StationConsistencyIssue = {
  stationId: string;
  field: string;
  values: string[];
};

/** Fields expected to be identical across every plug-row of one station. */
export const STATION_LEVEL_FIELDS = [
  "station_name",
  "operator",
  "address",
  "city",
  "district",
  "province",
  "map_url",
  "status",
] as const;

export function groupByStation(rows: RawRow[]): Map<string, RawRow[]> {
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

export function checkStationConsistency(stationId: string, rows: RawRow[]): StationConsistencyIssue[] {
  const issues: StationConsistencyIssue[] = [];
  for (const field of STATION_LEVEL_FIELDS) {
    const values = new Set(rows.map((r) => str(r[field]) ?? ""));
    if (values.size > 1) {
      issues.push({ stationId, field, values: Array.from(values) });
    }
  }
  return issues;
}
