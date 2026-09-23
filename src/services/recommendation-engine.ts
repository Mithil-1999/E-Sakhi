import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { haversineDistanceKm, type LatLng } from "@/lib/geo/distance";
import { getStationOperatingStatus, type StationOperatingStatus } from "@/lib/time/operating-hours";
import { CANONICAL_CONNECTORS } from "@/services/connector-service";
import {
  getEffectiveChargingPowerKw,
  type VehiclePowerProfile,
} from "@/services/charging-calculator";
import type { RecommendationQuery } from "@/lib/validation/recommendation";

/**
 * Station recommendation — a range-and-distance-first model (rewritten
 * from the original five-factor weighted-score design; see
 * docs/recommendation-engine.md for the current, locked model). No
 * rating, no verification status, and no computed "score"/percentage
 * anywhere in this file — distance is the only ordering criterion, after
 * two hard filters (vehicle/connector compatibility, and the user's own
 * search range). No ML, no persistence, no per-user history — a pure
 * read computed fresh from the live database on every call.
 */

// ---------------------------------------------------------------------------
// Prisma shape
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

export type PowerInfo = {
  effectivePowerKw: number | null;
  connectors: { code: string; label: string }[];
  limitingFactor: "vehicle" | "charger" | null;
};

export type RecommendedStation = {
  id: string;
  stationName: string;
  operator: { id: string; name: string } | null;
  province: string;
  district: string;
  city: string;
  status: "ACTIVE" | "INACTIVE";
  latitude: number;
  longitude: number;
  /** Real road-free-form distance (great-circle), km — the only ordering criterion. */
  distanceKm: number;
  power: PowerInfo;
  /** Fixed-operating-hours label (06:00–20:00, Nepal time) — never real-time charger availability. See src/lib/time/operating-hours.ts. */
  availability: StationOperatingStatus;
};

export type RecommendationMeta = {
  stationsConsidered: number;
  /** ACTIVE, with a real coordinate, and at least one real charger matching the requested connector/mode — before the range filter. */
  stationsCompatible: number;
  /** How many of those are within the user's requested range — equal to `data.length`. */
  stationsWithinRange: number;
  rangeKm: number;
  /** The one current Open/Closed value applied to every result — see RecommendedStation.availability. */
  availability: StationOperatingStatus;
};

export type RecommendationResult =
  | { ok: true; data: RecommendedStation[]; meta: RecommendationMeta }
  | { ok: false; error: string };

// A safety cap, not a user-facing "top N" concept — the feature's own
// intent is "show every suitable station within range," but an
// unreasonably large range shouldn't return an unbounded list.
const MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// Vehicle resolution — unchanged from the original design
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
// Compatibility + power display (no scoring — just real facts to show)
// ---------------------------------------------------------------------------

function eligibleChargers(station: StationRow, vehicle: ResolvedVehicle): ChargerRow[] {
  return station.chargers.filter(
    (charger) =>
      charger.availability !== "UNAVAILABLE" &&
      charger.connectors.some((cc) => vehicle.connectorCodes.includes(cc.connector.code))
  );
}

function describePower(vehicle: VehiclePowerProfile, chargers: ChargerRow[]): PowerInfo {
  let best: { effectivePowerKw: number; charger: ChargerRow; limitingFactor: "vehicle" | "charger" } | null =
    null;

  for (const charger of chargers) {
    const effective = getEffectiveChargingPowerKw(vehicle, {
      chargingMode: charger.chargingMode,
      powerKw: decimalToNumber(charger.powerKw),
    });
    if (effective.ok && (!best || effective.effectivePowerKw > best.effectivePowerKw)) {
      best = { effectivePowerKw: effective.effectivePowerKw, charger, limitingFactor: effective.limitingFactor };
    }
  }

  if (!best) {
    // Real chargers exist and match the connector — their power/mode just
    // isn't on record. Never guessed; shown as "Unknown" by the caller.
    return { effectivePowerKw: null, connectors: [], limitingFactor: null };
  }

  return {
    effectivePowerKw: Math.round(best.effectivePowerKw * 100) / 100,
    connectors: best.charger.connectors.map((cc) => ({ code: cc.connector.code, label: cc.connector.label })),
    limitingFactor: best.limitingFactor,
  };
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

  const userPosition: LatLng = { latitude: query.latitude, longitude: query.longitude };

  const stations = await prisma.station.findMany({
    where: { isDeleted: false },
    include: recommendationStationInclude,
  });
  const stationsConsidered = stations.length;

  // Step 5 (vehicle/connector compatibility) + station-active check —
  // hard filters, never a ranking factor. A station with no confirmed
  // coordinate is excluded here too: distance/range can't be honestly
  // evaluated without a real coordinate, so it's left out rather than
  // guessed into or out of range.
  const compatible: { station: StationRow; chargers: ChargerRow[] }[] = [];
  for (const station of stations) {
    if (station.status === "INACTIVE") continue;
    if (station.latitude === null || station.longitude === null) continue;

    const chargers = eligibleChargers(station, vehicle);
    if (chargers.length === 0) continue;

    compatible.push({ station, chargers });
  }

  // Step 3 + 4 — real distance, then the user's own range filter.
  const withinRange = compatible
    .map(({ station, chargers }) => {
      const distanceKm = haversineDistanceKm(userPosition, {
        latitude: decimalToNumber(station.latitude) as number,
        longitude: decimalToNumber(station.longitude) as number,
      });
      return { station, chargers, distanceKm };
    })
    .filter(({ distanceKm }) => distanceKm <= query.rangeKm);

  // Step 7 — sort nearest to farthest. Distance is the only ordering
  // criterion; ties break on name only for a stable, predictable order.
  withinRange.sort(
    (a, b) => a.distanceKm - b.distanceKm || a.station.stationName.localeCompare(b.station.stationName)
  );

  // Step 6 — one Open/Closed value, computed once, applied to every result.
  const availability = getStationOperatingStatus();

  const data: RecommendedStation[] = withinRange.slice(0, MAX_RESULTS).map(({ station, chargers, distanceKm }) => ({
    id: station.id,
    stationName: station.stationName,
    operator: station.operator,
    province: station.province,
    district: station.district,
    city: station.city,
    status: station.status as "ACTIVE" | "INACTIVE",
    latitude: decimalToNumber(station.latitude) as number,
    longitude: decimalToNumber(station.longitude) as number,
    distanceKm: Math.round(distanceKm * 10) / 10,
    power: describePower(vehicle, chargers),
    availability,
  }));

  const meta: RecommendationMeta = {
    stationsConsidered,
    stationsCompatible: compatible.length,
    stationsWithinRange: data.length,
    rangeKm: query.rangeKm,
    availability,
  };

  return { ok: true, data, meta };
}
