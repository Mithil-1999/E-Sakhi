/**
 * Client-facing station types — mirror the shape GET /api/stations
 * actually returns (src/services/station-service.ts), kept separate from
 * that server module so client components never import "server-only"
 * code, even just for types.
 */

// Simplified to two values by product decision — every station is
// ACTIVE unless explicitly INACTIVE; see src/lib/validation/station.ts.
export type StationStatus = "ACTIVE" | "INACTIVE";

export type VerificationStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "UNVERIFIED"
  | "NEEDS_REVIEW"
  | "UNKNOWN"
  | "ASSUMED";

export type ChargingMode = "AC" | "DC" | "UNKNOWN";

/**
 * How a station's latitude/longitude was obtained — see
 * docs/data-model.md §10. A different axis from VerificationStatus:
 * EXACT/APPROXIMATE describe coordinate precision, not whether an admin
 * has confirmed the record.
 */
export type CoordinateSource = "EXACT" | "APPROXIMATE" | "UNKNOWN";

export type ConnectorRef = { code: string; label: string };

export type ChargerSummary = {
  count: number;
  connectors: ConnectorRef[];
  chargingModes: string[];
  powerKwMax: number | null;
};

export type StationListItem = {
  id: string;
  stationId: string | null;
  stationName: string;
  operator: { id: string; name: string; contact: string | null; website: string | null } | null;
  province: string;
  district: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: CoordinateSource;
  mapUrl: string | null;
  status: StationStatus;
  verificationStatus: VerificationStatus;
  assumptionFlag: boolean;
  chargerSummary: ChargerSummary;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiListResponse<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type ApiErrorResponse = {
  error: { message: string; code: string };
};
