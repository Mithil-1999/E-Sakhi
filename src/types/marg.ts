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

/**
 * One driving option between the same start/destination — E Sakhi Marg
 * now plans against every real alternative OSRM offers (up to three),
 * each with its own checkpoints, rather than a single fixed route.
 */
export type MargRouteOption = {
  id: string;
  /** 1-based position in the list as returned — "Route 1", "Route 2", ... */
  ordinal: number;
  /** True for the route OSRM itself returned first (its own best/default pick) — not a claim that it's "best" for charging. */
  isFastest: boolean;
  /** Real place names the route passes near, start to destination, reverse-geocoded from the route's own geometry — never invented. Falls back to just [startLabel, destLabel] when no intermediate name could be resolved. */
  pathSummary: string[];
  /** The real driving route's path, [latitude, longitude] pairs, in travel order. */
  geometry: [number, number][];
  totalDistanceKm: number;
  durationMin: number;
  checkpoints: MargCheckpoint[];
  /** Road distance from the last checkpoint (or the start, if there are none) to the destination, km. */
  finalLegKm: number;
  /** False when no charger on this route matches the requested connector/mode at all — the route is still shown, never hidden. */
  hasCompatibleStations: boolean;
  /**
   * Set only when battery-aware planning (vehicleId/fullRangeKm +
   * currentBatteryPercent) was requested and this route has a stretch
   * that can't be reached with a compatible charger before the vehicle's
   * estimated range would run out — an honest limitation, not an error.
   */
  rangeWarning: string | null;
};

export type MargPlanResult = {
  startLabel: string;
  destLabel: string;
  start: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  connector: string;
  chargingMode: "AC" | "DC" | null;
  /** Whether battery-aware checkpoint spacing was actually used (a resolvable vehicle range + battery % were both given). */
  rangeAware: boolean;
  routes: MargRouteOption[];
};

export type MargPlanApiResponse = { data: MargPlanResult };

export type MargGeocodeApiResponse = {
  data: { label: string; latitude: number; longitude: number }[];
};

export type MargApiErrorResponse = {
  error: { message: string; code: string };
};
