/**
 * Client-facing import types — mirror what GET /api/import/preview and
 * /api/import/apply actually return (src/services/import-service.ts),
 * kept separate so the admin import tool's Client Component never
 * imports "server-only" code, even just for types. Same pattern as
 * src/types/station.ts, src/types/admin.ts.
 */

export type StationStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";
export type VerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "NEEDS_REVIEW" | "UNKNOWN" | "ASSUMED";
export type ChargingMode = "AC" | "DC" | "UNKNOWN";

export type ImportFieldChange = { field: string; label: string; oldValue: string | null; newValue: string | null };

export type ImportStationData = {
  stationName: string;
  operatorName: string | null;
  province: string;
  district: string;
  city: string;
  address: string;
  contact: string | null;
  mapUrl: string | null;
  status: StationStatus;
};

export type ImportChargerPreview =
  | {
      action: "create";
      externalPlugId: string | null;
      chargingMode: ChargingMode;
      powerKw: number | null;
      connectorCodes: string[];
      connectorLabels: string[];
    }
  | {
      action: "update";
      chargerDbId: string;
      externalPlugId: string | null;
      chargingMode: ChargingMode;
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
        verificationStatus: VerificationStatus;
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
  consistencyIssues: { stationId: string; field: string; values: string[] }[];
  entries: ImportStationPreview[];
  summary: { toCreate: number; toUpdate: number; skipped: number; unchanged: number };
};

export type ImportApplyItemResult = { status: "applied" | "skipped" | "failed"; reason?: string };

export type ImportApplyEntryResult = {
  externalStationId: string;
  station: ImportApplyItemResult;
  chargers: (ImportApplyItemResult & { externalPlugId: string | null })[];
};
