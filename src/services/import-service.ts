import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import {
  readStationRows,
  groupByStation,
  checkStationConsistency,
  mapStationStatus,
  resolveVerification,
  buildVerificationSource,
  pickContact,
  str,
  strOrDefault,
  num,
  type RawRow,
  type StationConsistencyIssue,
} from "@/services/excel-station-parser";
import { buildAliasLookup, splitConnectorTokens, resolveConnectorToken } from "@/services/connector-service";
import { createStation, updateStation } from "@/services/station-service";
import { createCharger, updateCharger } from "@/services/charger-service";
import { resolveOrCreateOperatorId } from "@/services/operator-service";
import type { ImportApplyEntry } from "@/lib/validation/import";

/**
 * The admin Excel import/update tool (Part 14) — see docs/data-import.md
 * for the full design this file implements. Two entry points:
 * computeImportDiff() (read-only — parses an uploaded workbook and diffs
 * it against the live database) and applyImportEntries() (writes, but
 * only ever by calling the same createStation()/updateStation()/
 * createCharger()/updateCharger() Parts 04/12 already built — no new
 * mutation logic is added here).
 */

// ---------------------------------------------------------------------------
// Preview types
// ---------------------------------------------------------------------------

export type ImportFieldChange = { field: string; label: string; oldValue: string | null; newValue: string | null };

type ImportStationData = {
  stationName: string;
  operatorName: string | null;
  province: string;
  district: string;
  city: string;
  address: string;
  contact: string | null;
  mapUrl: string | null;
  status: "ACTIVE" | "INACTIVE" | "UNKNOWN";
};

export type ImportChargerPreview =
  | {
      action: "create";
      externalPlugId: string | null;
      chargingMode: "AC" | "DC" | "UNKNOWN";
      powerKw: number | null;
      connectorCodes: string[];
      connectorLabels: string[];
    }
  | {
      action: "update";
      chargerDbId: string;
      externalPlugId: string | null;
      chargingMode: "AC" | "DC" | "UNKNOWN";
      powerKw: number | null;
      connectorCodes: string[];
      connectorLabels: string[];
      fieldChanges: ImportFieldChange[];
    }
  | { action: "skip"; externalPlugId: string | null; reason: string };

export type ImportStationPreview =
  | {
      action: "create";
      externalStationId: string;
      station: ImportStationData & {
        verificationStatus: "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "NEEDS_REVIEW" | "UNKNOWN" | "ASSUMED";
        assumptionFlag: boolean;
        verificationSource: string;
      };
      chargers: ImportChargerPreview[];
    }
  | {
      action: "update";
      externalStationId: string;
      stationDbId: string;
      stationName: string;
      isAdminVerified: boolean;
      station: ImportStationData;
      fieldChanges: ImportFieldChange[];
      chargers: ImportChargerPreview[];
    }
  | { action: "skip"; externalStationId: string; stationName: string; reason: string };

export type ImportPreview = {
  fileName: string;
  totalRowsRead: number;
  stationGroups: number;
  consistencyIssues: StationConsistencyIssue[];
  entries: ImportStationPreview[];
  summary: { toCreate: number; toUpdate: number; skipped: number; unchanged: number };
};

// ---------------------------------------------------------------------------
// Field labels (review UI)
// ---------------------------------------------------------------------------

const STATION_FIELD_LABELS: Record<string, string> = {
  stationName: "Station name",
  operatorName: "Operator",
  province: "Province",
  district: "District",
  city: "City",
  address: "Address",
  contact: "Contact",
  mapUrl: "Source map link",
  status: "Station status",
};

const CHARGER_FIELD_LABELS: Record<string, string> = {
  chargingMode: "Charging mode",
  powerKw: "Power (kW)",
  connectorCodes: "Connectors",
};

// ---------------------------------------------------------------------------
// Diff (preview) — read-only
// ---------------------------------------------------------------------------

function buildProposedStationData(row: RawRow, externalStationId: string): ImportStationData {
  return {
    stationName: strOrDefault(row.station_name, externalStationId),
    operatorName: str(row.operator),
    province: strOrDefault(row.province, "Unknown"),
    district: strOrDefault(row.district, "Unknown"),
    city: strOrDefault(row.city, "Unknown"),
    address: strOrDefault(row.address, "Unknown"),
    contact: pickContact(row),
    mapUrl: str(row.map_url),
    status: mapStationStatus(str(row.status)),
  };
}

function resolveChargerConnectors(row: RawRow, aliasLookup: Map<string, string>): string[] {
  const raw = str(row.connector_type) ?? "";
  const tokens = splitConnectorTokens(raw);
  const codes = new Set<string>();
  for (const token of tokens) {
    codes.add(resolveConnectorToken(token, aliasLookup).code);
  }
  if (codes.size === 0) codes.add("UNKNOWN");
  return Array.from(codes).sort();
}

function proposedChargerFields(row: RawRow, aliasLookup: Map<string, string>) {
  const chargingModeRaw = str(row.charging_mode);
  const chargingMode: "AC" | "DC" | "UNKNOWN" =
    chargingModeRaw === "AC" || chargingModeRaw === "DC" ? chargingModeRaw : "UNKNOWN";
  const powerKw = num(row.power_kw_max) ?? num(row.power_kw_dc) ?? num(row.power_kw_ac);
  const connectorCodes = resolveChargerConnectors(row, aliasLookup);
  return { chargingMode, powerKw, connectorCodes };
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function computeImportDiff(buffer: Buffer, fileName: string): Promise<ImportPreview> {
  const rows = await readStationRows(buffer);
  const groups = groupByStation(rows);

  const consistencyIssues: StationConsistencyIssue[] = [];
  for (const [stationId, groupRows] of groups) {
    consistencyIssues.push(...checkStationConsistency(stationId, groupRows));
  }

  const externalStationIds = Array.from(groups.keys());
  const plugIds = rows.map((r) => str(r.plug_id)).filter((v): v is string => v !== null);

  const [existingStations, existingChargers, connectors] = await Promise.all([
    prisma.station.findMany({
      where: { stationId: { in: externalStationIds } },
      include: { operator: { select: { name: true } } },
    }),
    plugIds.length > 0
      ? prisma.charger.findMany({
          where: { plugId: { in: plugIds } },
          include: {
            connectors: { select: { connector: { select: { code: true, label: true } } } },
            station: { select: { id: true, stationId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.connector.findMany({ select: { code: true, label: true } }),
  ]);

  const stationByExternalId = new Map(existingStations.map((s) => [s.stationId as string, s]));
  const chargerByPlugId = new Map(existingChargers.map((c) => [c.plugId as string, c]));
  const connectorLabelByCode = new Map(connectors.map((c) => [c.code, c.label]));
  const aliasLookup = buildAliasLookup();

  const entries: ImportStationPreview[] = [];
  let toCreate = 0;
  let toUpdate = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const [externalStationId, groupRows] of groups) {
    const first = groupRows[0];
    const existingStation = stationByExternalId.get(externalStationId);
    const proposed = buildProposedStationData(first, externalStationId);

    // ---- brand-new station ----
    if (!existingStation) {
      const verification = resolveVerification(first);
      const chargers: ImportChargerPreview[] = [];
      for (const plugRow of groupRows) {
        const externalPlugId = str(plugRow.plug_id);
        if (!externalPlugId) continue;
        const collision = chargerByPlugId.get(externalPlugId);
        if (collision) {
          chargers.push({
            action: "skip",
            externalPlugId,
            reason: `Plug id "${externalPlugId}" already exists on a different station.`,
          });
          continue;
        }
        const fields = proposedChargerFields(plugRow, aliasLookup);
        chargers.push({
          action: "create",
          externalPlugId,
          ...fields,
          connectorLabels: fields.connectorCodes.map((c) => connectorLabelByCode.get(c) ?? c),
        });
      }
      entries.push({
        action: "create",
        externalStationId,
        station: {
          ...proposed,
          verificationStatus: verification.status,
          assumptionFlag: str(first.assumption_flag) === "YES",
          verificationSource: buildVerificationSource(first),
        },
        chargers,
      });
      toCreate += 1;
      continue;
    }

    // ---- existing station, soft-deleted ----
    if (existingStation.isDeleted) {
      entries.push({
        action: "skip",
        externalStationId,
        stationName: existingStation.stationName,
        reason:
          "This station was soft-deleted by an admin — re-importing it would restore it, which this tool doesn't do automatically.",
      });
      skipped += 1;
      continue;
    }

    // ---- existing, active station: diff ----
    const fieldChanges: ImportFieldChange[] = [];
    const pushIfChanged = (field: keyof ImportStationData, oldValue: string | null, newValue: string | null) => {
      if (oldValue !== newValue) {
        fieldChanges.push({ field, label: STATION_FIELD_LABELS[field], oldValue, newValue });
      }
    };
    pushIfChanged("stationName", existingStation.stationName, proposed.stationName);
    // Operator: only ever compared/touched when the row actually names one
    // — matches prisma/seed.ts's own existing asymmetry. See docs/data-import.md §4.
    if (proposed.operatorName) {
      pushIfChanged("operatorName", existingStation.operator?.name ?? null, proposed.operatorName);
    }
    pushIfChanged("province", existingStation.province, proposed.province);
    pushIfChanged("district", existingStation.district, proposed.district);
    pushIfChanged("city", existingStation.city, proposed.city);
    pushIfChanged("address", existingStation.address, proposed.address);
    pushIfChanged("contact", existingStation.contact, proposed.contact);
    pushIfChanged("mapUrl", existingStation.mapUrl, proposed.mapUrl);
    pushIfChanged("status", existingStation.status, proposed.status);

    const chargerPreviews: ImportChargerPreview[] = [];
    for (const plugRow of groupRows) {
      const externalPlugId = str(plugRow.plug_id);
      if (!externalPlugId) continue;

      const fields = proposedChargerFields(plugRow, aliasLookup);
      const connectorLabels = fields.connectorCodes.map((c) => connectorLabelByCode.get(c) ?? c);
      const existingCharger = chargerByPlugId.get(externalPlugId);

      if (!existingCharger) {
        chargerPreviews.push({ action: "create", externalPlugId, ...fields, connectorLabels });
        continue;
      }
      if (existingCharger.stationId !== existingStation.id) {
        chargerPreviews.push({
          action: "skip",
          externalPlugId,
          reason: `Plug id "${externalPlugId}" already belongs to a different station (${existingCharger.station.stationId ?? existingCharger.stationId}) — this tool never reassigns a charger.`,
        });
        continue;
      }
      if (existingCharger.isDeleted) {
        chargerPreviews.push({
          action: "skip",
          externalPlugId,
          reason: "This charger was soft-deleted by an admin.",
        });
        continue;
      }

      const chargerFieldChanges: ImportFieldChange[] = [];
      const existingConnectorCodes = existingCharger.connectors.map((cc) => cc.connector.code).sort();
      if (existingCharger.chargingMode !== fields.chargingMode) {
        chargerFieldChanges.push({
          field: "chargingMode",
          label: CHARGER_FIELD_LABELS.chargingMode,
          oldValue: existingCharger.chargingMode,
          newValue: fields.chargingMode,
        });
      }
      const existingPowerKw = decimalToNumber(existingCharger.powerKw);
      if (existingPowerKw !== fields.powerKw) {
        chargerFieldChanges.push({
          field: "powerKw",
          label: CHARGER_FIELD_LABELS.powerKw,
          oldValue: existingPowerKw !== null ? String(existingPowerKw) : null,
          newValue: fields.powerKw !== null ? String(fields.powerKw) : null,
        });
      }
      if (!sameStringArray(existingConnectorCodes, fields.connectorCodes)) {
        chargerFieldChanges.push({
          field: "connectorCodes",
          label: CHARGER_FIELD_LABELS.connectorCodes,
          oldValue: existingConnectorCodes.map((c) => connectorLabelByCode.get(c) ?? c).join(", ") || null,
          newValue: connectorLabels.join(", ") || null,
        });
      }

      if (chargerFieldChanges.length > 0) {
        chargerPreviews.push({
          action: "update",
          chargerDbId: existingCharger.id,
          externalPlugId,
          ...fields,
          connectorLabels,
          fieldChanges: chargerFieldChanges,
        });
      }
      // No changes at all -> omitted entirely, matching "only show real diffs."
    }

    if (fieldChanges.length === 0 && chargerPreviews.length === 0) {
      unchanged += 1;
      continue;
    }

    entries.push({
      action: "update",
      externalStationId,
      stationDbId: existingStation.id,
      stationName: existingStation.stationName,
      isAdminVerified:
        existingStation.verificationStatus === "VERIFIED" || existingStation.verificationStatus === "PARTIALLY_VERIFIED",
      station: proposed,
      fieldChanges,
      chargers: chargerPreviews,
    });
    toUpdate += 1;
  }

  return {
    fileName,
    totalRowsRead: rows.length,
    stationGroups: groups.size,
    consistencyIssues,
    entries,
    summary: { toCreate, toUpdate, skipped, unchanged },
  };
}

// ---------------------------------------------------------------------------
// Apply — writes, but only via existing Parts 04/12 mutation functions
// ---------------------------------------------------------------------------

export type ImportApplyItemResult = { status: "applied" | "skipped" | "failed"; reason?: string };

export type ImportApplyEntryResult = {
  externalStationId: string;
  station: ImportApplyItemResult;
  chargers: (ImportApplyItemResult & { externalPlugId: string | null })[];
};

export async function applyImportEntries(
  entries: ImportApplyEntry[],
  adminId: string
): Promise<ImportApplyEntryResult[]> {
  const results: ImportApplyEntryResult[] = [];

  for (const entry of entries) {
    let stationDbId: string | null = null;
    const stationResult: ImportApplyEntryResult = {
      externalStationId: entry.externalStationId,
      station: { status: "failed" },
      chargers: [],
    };

    try {
      if (entry.action === "create") {
        const operatorId = entry.station.operatorName
          ? await resolveOrCreateOperatorId(entry.station.operatorName)
          : undefined;
        const created = await createStation({
          stationId: entry.externalStationId,
          stationName: entry.station.stationName,
          operatorId,
          province: entry.station.province,
          district: entry.station.district,
          city: entry.station.city,
          address: entry.station.address,
          contact: entry.station.contact,
          mapUrl: entry.station.mapUrl,
          status: entry.station.status,
          verificationStatus: entry.station.verificationStatus,
          assumptionFlag: entry.station.assumptionFlag,
          verificationSource: entry.station.verificationSource,
        });
        if (!created.ok) {
          stationResult.station = { status: "failed", reason: created.error };
          results.push(stationResult);
          continue;
        }
        stationDbId = created.data.id;
        stationResult.station = { status: "applied" };
      } else {
        const existing = await prisma.station.findUnique({ where: { id: entry.stationDbId } });
        if (!existing || existing.isDeleted) {
          stationResult.station = {
            status: "skipped",
            reason: "Station no longer exists or was deleted since this was previewed.",
          };
          results.push(stationResult);
          continue;
        }
        const operatorId = entry.station.operatorName
          ? await resolveOrCreateOperatorId(entry.station.operatorName)
          : undefined;
        const updated = await updateStation(
          entry.stationDbId,
          {
            stationName: entry.station.stationName,
            ...(operatorId !== undefined ? { operatorId } : {}),
            province: entry.station.province,
            district: entry.station.district,
            city: entry.station.city,
            address: entry.station.address,
            contact: entry.station.contact,
            mapUrl: entry.station.mapUrl,
            status: entry.station.status,
            // Deliberately nothing else: no verificationStatus, no
            // assumptionFlag, no verificationSource, no lastVerified, no
            // *_verified booleans, no latitude/longitude — see
            // docs/data-import.md §2.
          },
          adminId
        );
        if (!updated.ok) {
          stationResult.station = { status: "failed", reason: updated.error };
          results.push(stationResult);
          continue;
        }
        stationDbId = entry.stationDbId;
        stationResult.station = { status: "applied" };
      }
    } catch (error) {
      stationResult.station = {
        status: "failed",
        reason: error instanceof Error ? error.message : "Unexpected error.",
      };
      results.push(stationResult);
      continue;
    }

    for (const charger of entry.chargers) {
      try {
        if (charger.action === "create") {
          const created = await createCharger({
            stationId: stationDbId,
            plugId: charger.externalPlugId,
            chargingMode: charger.chargingMode,
            powerKw: charger.powerKw,
            availability: "UNKNOWN",
            connectorCodes: charger.connectorCodes,
          });
          stationResult.chargers.push({
            externalPlugId: charger.externalPlugId,
            status: created.ok ? "applied" : "failed",
            reason: created.ok ? undefined : created.error,
          });
        } else {
          const existingCharger = await prisma.charger.findUnique({ where: { id: charger.chargerDbId } });
          if (!existingCharger || existingCharger.isDeleted) {
            stationResult.chargers.push({
              externalPlugId: charger.externalPlugId,
              status: "skipped",
              reason: "Charger no longer exists or was deleted since this was previewed.",
            });
            continue;
          }
          const updated = await updateCharger(charger.chargerDbId, {
            chargingMode: charger.chargingMode,
            powerKw: charger.powerKw,
            connectorCodes: charger.connectorCodes,
            // Deliberately no availability — see docs/data-import.md §2.
          });
          stationResult.chargers.push({
            externalPlugId: charger.externalPlugId,
            status: updated.ok ? "applied" : "failed",
            reason: updated.ok ? undefined : updated.error,
          });
        }
      } catch (error) {
        stationResult.chargers.push({
          externalPlugId: charger.externalPlugId,
          status: "failed",
          reason: error instanceof Error ? error.message : "Unexpected error.",
        });
      }
    }

    results.push(stationResult);
  }

  return results;
}
