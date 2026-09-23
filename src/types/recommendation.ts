/**
 * Client-facing recommendation types — mirror what GET /api/recommendations
 * actually returns (src/services/recommendation-engine.ts), kept separate
 * so client components never import "server-only" code. See
 * src/types/station.ts for the same pattern.
 */

import type { StationStatus } from "@/types/station";

export type PowerInfo = {
  effectivePowerKw: number | null;
  connectors: { code: string; label: string }[];
  limitingFactor: "vehicle" | "charger" | null;
};

/** Fixed-operating-hours label (06:00–20:00, Nepal time) — never real-time charger availability. */
export type StationOperatingStatus = "OPEN" | "CLOSED";

export type RecommendedStation = {
  id: string;
  stationName: string;
  operator: { id: string; name: string } | null;
  province: string;
  district: string;
  city: string;
  status: StationStatus;
  latitude: number;
  longitude: number;
  distanceKm: number;
  power: PowerInfo;
  availability: StationOperatingStatus;
};

export type RecommendationMeta = {
  stationsConsidered: number;
  stationsCompatible: number;
  stationsWithinRange: number;
  rangeKm: number;
  availability: StationOperatingStatus;
};

export type RecommendationApiResponse = {
  data: RecommendedStation[];
  meta: RecommendationMeta;
};

export type RecommendationApiError = {
  error: { message: string; code: string };
};
