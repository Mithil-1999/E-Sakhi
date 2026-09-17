/**
 * Client-facing E Sakhi Marg types — mirror what GET /api/marg/geocode
 * and POST /api/marg/plan actually return (src/services/marg-service.ts),
 * kept separate so client components never import "server-only" code.
 */

export type MargConnectorRef = { code: string; label: string };

/** A charger's real, honestly-labeled availability — never fabricated when unknown. */
export type MargAvailabilityStatus = "AVAILABLE" | "BUSY" | "UNAVAILABLE" | "UNKNOWN";

export type MargCheckpoint = {
  stationId: string;
  stationName: string;
  province: string;
  district: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Road distance from the previous point (start, or the prior checkpoint), km. */
  distanceFromPreviousKm: number;
  /** Cumulative road distance from the start, km. */
  distanceAlongRouteKm: number;
  /** How far this station sits off the route's own path, km — 0 means directly on it. */
  detourKm: number;
  connectors: MargConnectorRef[];
  chargingModes: string[];
  powerKwMax: number | null;
  availability: MargAvailabilityStatus;
  status: "ACTIVE" | "INACTIVE";
};

export type MargRoute = {
  startLabel: string;
  destLabel: string;
  start: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  /** The real driving route's path, [latitude, longitude] pairs, in travel order. */
  geometry: [number, number][];
  totalDistanceKm: number;
  durationMin: number;
  checkpoints: MargCheckpoint[];
  /** Road distance from the last checkpoint (or the start, if there are none) to the destination, km. */
  finalLegKm: number;
  connector: string;
  chargingMode: "AC" | "DC" | null;
};

export type MargPlanApiResponse = { data: MargRoute };

export type MargGeocodeApiResponse = {
  data: { label: string; latitude: number; longitude: number }[];
};

export type MargApiErrorResponse = {
  error: { message: string; code: string };
};
