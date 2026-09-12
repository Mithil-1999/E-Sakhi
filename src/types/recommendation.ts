/**
 * Client-facing recommendation types — mirror what GET /api/recommendations
 * actually returns (src/services/recommendation-engine.ts), kept separate
 * so client components never import "server-only" code. See
 * src/types/station.ts for the same pattern.
 */

import type { VerificationStatus, StationStatus } from "@/types/station";

export type PowerFactor = {
  score: number;
  effectivePowerKw: number | null;
  chargerId: string | null;
  connectors: { code: string; label: string }[];
  limitingFactor: "vehicle" | "charger" | null;
};

export type DistanceFactor = { score: number; distanceKm: number | null };
export type RatingFactor = { score: number; average: number | null; count: number };
export type VerificationFactor = { score: number; status: VerificationStatus };
export type AvailabilityFactor = { score: number; status: "AVAILABLE" | "BUSY" | "UNKNOWN" };

export type RecommendedStation = {
  id: string;
  stationName: string;
  operator: { id: string; name: string } | null;
  province: string;
  district: string;
  city: string;
  status: StationStatus;
  verificationStatus: VerificationStatus;
  latitude: number | null;
  longitude: number | null;
  score: number;
  factors: {
    power: PowerFactor;
    distance: DistanceFactor;
    rating: RatingFactor;
    verification: VerificationFactor;
    availability: AvailabilityFactor;
  };
};

export type RecommendationMeta = {
  stationsConsidered: number;
  stationsEligible: number;
  stationsWithKnownDistance: number;
  stationsWithKnownRating: number;
  stationsWithKnownAvailability: number;
};

export type RecommendationApiResponse = {
  data: RecommendedStation[];
  meta: RecommendationMeta;
};

export type RecommendationApiError = {
  error: { message: string; code: string };
};
