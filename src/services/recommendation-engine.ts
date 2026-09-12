import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { haversineDistanceKm, type LatLng } from "@/lib/geo/distance";
import {
  RECOMMENDATION_WEIGHTS,
  UNKNOWN_FACTOR_SCORE,
  DISTANCE_DECAY_KM,
} from "@/lib/config/recommendation-weights";
import { CANONICAL_CONNECTORS } from "@/services/connector-service";
import { getStationRatingsBatch, type StationRating } from "@/services/station-service";
import {
  getEffectiveChargingPowerKw,
  type VehiclePowerProfile,
} from "@/services/charging-calculator";
import type { RecommendationQuery } from "@/lib/validation/recommendation";

/**
 * Station recommendation ranking — see docs/recommendation-engine.md for
 * the full, locked-before-implementation model this file implements
 * exactly. Two stages: hard eligibility filters, then a fixed weighted
 * score over five factors. No ML, no persistence, no per-user history —
 * a pure read computed fresh from the live database on every call.
 */

// ---------------------------------------------------------------------------
// Verification -> score mapping (docs/recommendation-engine.md §3.4)
// ---------------------------------------------------------------------------

const VERIFICATION_SCORES = {
  VERIFIED: 1,
  PARTIALLY_VERIFIED: 0.7,
  NEEDS_REVIEW: 0.3,
  ASSUMED: UNKNOWN_FACTOR_SCORE,
  UNVERIFIED: UNKNOWN_FACTOR_SCORE,
  UNKNOWN: UNKNOWN_FACTOR_SCORE,
} as const;

// ---------------------------------------------------------------------------
// Prisma shape — deliberately its own include (not station-service.ts's
// stationListInclude), because this needs charger `id`/`availability` that
// the list view doesn't select, and doesn't need the fuller detail-page
// include either.
// ---------------------------------------------------------------------------

const recommendationStationInclude = {
  operator: { select: { id: true, name: true } },
  chargers: {
    where: { isDeleted: false },
    select: {
      id: true,
      chargingMode: true,
      powerKw: true,
      availability: true,
      connectors: { select: { connector: { select: { code: true, label: true } } } },
    },
  },
} satisfies Prisma.StationInclude;

type StationRow = Prisma.StationGetPayload<{ include: typeof recommendationStationInclude }>;
type ChargerRow = StationRow["chargers"][number];

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type PowerFactor = {
  score: number;
  effectivePowerKw: number | null;
  chargerId: string | null;
  connectors: { code: string; label: string }[];
  limitingFactor: "vehicle" | "charger" | null;
};

export type DistanceFactor = {
  score: number;
  distanceKm: number | null;
};

export type RatingFactor = {
  score: number;
  average: number | null;
  count: number;
};

export type VerificationFactor = {
  score: number;
  status: keyof typeof VERIFICATION_SCORES;
};

export type AvailabilityFactor = {
  score: number;
  status: "AVAILABLE" | "BUSY" | "UNKNOWN";
};

export type RecommendedStation = {
  id: string;
  stationName: string;
  operator: { id: string; name: string } | null;
  province: string;
  district: string;
  city: string;
  status: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  verificationStatus: keyof typeof VERIFICATION_SCORES;
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

export type RecommendationResult =
  | { ok: true; data: RecommendedStation[]; meta: RecommendationMeta }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Vehicle resolution (docs/recommendation-engine.md §4)
// ---------------------------------------------------------------------------

type ResolvedVehicle = VehiclePowerProfile & { connectorCodes: string[] };

async function resolveVehicle(
  query: RecommendationQuery
): Promise<{ ok: true; vehicle: ResolvedVehicle } | { ok: false; error: string }> {
  if (query.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: query.vehicleId },
      include: { connectors: { include: { connector: { select: { code: true } } } } },
    });
    if (!vehicle) {
      return { ok: false, error: "Vehicle not found." };
    }
    return {
      ok: true,
      vehicle: {
        connectorCodes: vehicle.connectors.map((vc) => vc.connector.code),
        maxAcPowerKw: decimalToNumber(vehicle.maxAcPowerKw),
        maxDcPowerKw: decimalToNumber(vehicle.maxDcPowerKw),
      },
    };
  }

  // query.connector is guaranteed set here — RecommendationQuerySchema
  // requires exactly one of vehicleId/connector.
  const resolved = CANONICAL_CONNECTORS.find(
    (c) => c.code !== "UNKNOWN" && c.code.toLowerCase() === query.connector!.trim().toLowerCase()
  );
  if (!resolved) {
    return { ok: false, error: "Unrecognized connector code." };
  }
  return {
    ok: true,
    vehicle: {
      connectorCodes: [resolved.code],
      maxAcPowerKw: query.maxAcPowerKw ?? null,
      maxDcPowerKw: query.maxDcPowerKw ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-factor scoring (docs/recommendation-engine.md §3)
// ---------------------------------------------------------------------------

function scorePower(vehicle: VehiclePowerProfile, eligibleChargers: ChargerRow[]): PowerFactor {
  let best: { effectivePowerKw: number; charger: ChargerRow; limitingFactor: "vehicle" | "charger" } | null =
    null;

  for (const charger of eligibleChargers) {
    const effective = getEffectiveChargingPowerKw(vehicle, {
      chargingMode: charger.chargingMode,
      powerKw: decimalToNumber(charger.powerKw),
    });
    if (effective.ok && (!best || effective.effectivePowerKw > best.effectivePowerKw)) {
      best = { effectivePowerKw: effective.effectivePowerKw, charger, limitingFactor: effective.limitingFactor };
    }
  }

  if (!best) {
    return {
      score: UNKNOWN_FACTOR_SCORE,
      effectivePowerKw: null,
      chargerId: null,
      connectors: [],
      limitingFactor: null,
    };
  }

  // A non-null effective power always came from a known vehicle max for
  // that mode (see getEffectiveChargingPowerKw), so referenceKw > 0 here.
  const referenceKw = Math.max(vehicle.maxAcPowerKw ?? 0, vehicle.maxDcPowerKw ?? 0);
  const score = referenceKw > 0 ? Math.min(1, best.effectivePowerKw / referenceKw) : UNKNOWN_FACTOR_SCORE;

  return {
    score,
    effectivePowerKw: Math.round(best.effectivePowerKw * 100) / 100,
    chargerId: best.charger.id,
    connectors: best.charger.connectors.map((cc) => ({ code: cc.connector.code, label: cc.connector.label })),
    limitingFactor: best.limitingFactor,
  };
}

function scoreDistance(userPosition: LatLng | null, station: StationRow): DistanceFactor {
  const stationLat = decimalToNumber(station.latitude);
  const stationLng = decimalToNumber(station.longitude);

  if (!userPosition || stationLat === null || stationLng === null) {
    return { score: UNKNOWN_FACTOR_SCORE, distanceKm: null };
  }

  const distanceKm = haversineDistanceKm(userPosition, { latitude: stationLat, longitude: stationLng });
  return {
    score: 1 / (1 + distanceKm / DISTANCE_DECAY_KM),
    distanceKm: Math.round(distanceKm * 10) / 10,
  };
}

function scoreRating(rating: StationRating): RatingFactor {
  if (rating.count === 0 || rating.average === null) {
    return { score: UNKNOWN_FACTOR_SCORE, average: null, count: rating.count };
  }
  return { score: rating.average / 5, average: rating.average, count: rating.count };
}

function scoreVerification(status: keyof typeof VERIFICATION_SCORES): VerificationFactor {
  return { score: VERIFICATION_SCORES[status], status };
}

function scoreAvailability(eligibleChargers: ChargerRow[]): AvailabilityFactor {
  const hasAvailable = eligibleChargers.some((c) => c.availability === "AVAILABLE");
  const hasBusy = eligibleChargers.some((c) => c.availability === "BUSY");

  if (hasAvailable) return { score: 1, status: "AVAILABLE" };
  if (hasBusy) return { score: 0.4, status: "BUSY" };
  return { score: UNKNOWN_FACTOR_SCORE, status: "UNKNOWN" };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function getStationRecommendations(
  query: RecommendationQuery
): Promise<RecommendationResult> {
  const resolution = await resolveVehicle(query);
  if (!resolution.ok) {
    return resolution;
  }
  const vehicle = resolution.vehicle;

  const userPosition: LatLng | null =
    query.latitude !== undefined && query.longitude !== undefined
      ? { latitude: query.latitude, longitude: query.longitude }
      : null;

  const stations = await prisma.station.findMany({
    where: { isDeleted: false },
    include: recommendationStationInclude,
  });
  const stationsConsidered = stations.length;

  // Stage 1 — hard eligibility (docs/recommendation-engine.md §2, Stage 1).
  const eligible: { station: StationRow; eligibleChargers: ChargerRow[] }[] = [];
  for (const station of stations) {
    if (station.status === "INACTIVE") continue;

    const eligibleChargers = station.chargers.filter(
      (charger) =>
        charger.availability !== "UNAVAILABLE" &&
        charger.connectors.some((cc) => vehicle.connectorCodes.includes(cc.connector.code))
    );
    if (eligibleChargers.length === 0) continue;

    eligible.push({ station, eligibleChargers });
  }

  // Stage 2 — weighted scoring, ratings fetched in one batched query
  // rather than one per station (docs/recommendation-engine.md §3.3).
  const ratings = await getStationRatingsBatch(eligible.map(({ station }) => station.id));

  const scored: RecommendedStation[] = eligible.map(({ station, eligibleChargers }) => {
    const power = scorePower(vehicle, eligibleChargers);
    const distance = scoreDistance(userPosition, station);
    const rating = scoreRating(ratings.get(station.id) ?? { average: null, count: 0 });
    const verification = scoreVerification(station.verificationStatus);
    const availability = scoreAvailability(eligibleChargers);

    const score =
      RECOMMENDATION_WEIGHTS.power * power.score +
      RECOMMENDATION_WEIGHTS.distance * distance.score +
      RECOMMENDATION_WEIGHTS.rating * rating.score +
      RECOMMENDATION_WEIGHTS.verification * verification.score +
      RECOMMENDATION_WEIGHTS.availability * availability.score;

    return {
      id: station.id,
      stationName: station.stationName,
      operator: station.operator,
      province: station.province,
      district: station.district,
      city: station.city,
      status: station.status,
      verificationStatus: station.verificationStatus,
      latitude: decimalToNumber(station.latitude),
      longitude: decimalToNumber(station.longitude),
      score: Math.round(score * 1000) / 1000,
      factors: { power, distance, rating, verification, availability },
    };
  });

  scored.sort((a, b) => b.score - a.score || a.stationName.localeCompare(b.stationName));

  const meta: RecommendationMeta = {
    stationsConsidered,
    stationsEligible: scored.length,
    stationsWithKnownDistance: scored.filter((s) => s.factors.distance.distanceKm !== null).length,
    stationsWithKnownRating: scored.filter((s) => s.factors.rating.count > 0).length,
    stationsWithKnownAvailability: scored.filter((s) => s.factors.availability.status !== "UNKNOWN").length,
  };

  return { ok: true, data: scored.slice(0, query.limit), meta };
}
