import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { fetchDrivingRoute, nearestPointOnRoute, type DrivingRoute } from "@/lib/geo/osrm";
import type { LatLng } from "@/lib/geo/distance";
import type { MargPlanInput } from "@/lib/validation/marg";
import type { MargCheckpoint, MargRoute, MargAvailabilityStatus } from "@/types/marg";

/**
 * E Sakhi Marg — journey/route planning. Distinct from recommendation-
 * engine.ts (single-station ranking for "which station is best for me
 * right now") and getNearestStations (single-point "what's closest to
 * here") — this plans a whole start→destination journey and picks a real,
 * ordered sequence of charging checkpoints along the actual driving route.
 *
 * No station data is ever invented: every checkpoint is a real `Station`
 * row already in the database, matched by real connector/charging-mode
 * compatibility and real proximity to a real OSRM-computed route. If
 * nothing compatible exists, that's reported honestly (see the `ok:false`
 * branches below), never papered over with a placeholder station.
 */

// A station further than this off the route's own path isn't "on the way"
// — it would be a real, callable-out detour, not a natural stop. Chosen
// to comfortably include a hotel/petrol-station-hosted charger set back
// from the highway itself, not to open the search radius countrywide.
const MAX_DETOUR_KM = 8;

// Checkpoints are spaced roughly this far apart along the route — a
// reasonable "typical comfortable EV leg" default in the absence of any
// real battery/range input (see docs/architecture.md's E Sakhi Marg
// section, and §11/§12 of the original request: battery-aware spacing is
// a deliberate future upgrade, not required for this first version).
const TARGET_CHECKPOINT_SPACING_KM = 60;
const MAX_CHECKPOINTS = 6;
// Two chosen checkpoints closer together than this along the route would
// be redundant, not a real second stop.
const MIN_CHECKPOINT_SPACING_KM = 15;

export type MargPlanResult =
  | { ok: true; data: MargRoute }
  | { ok: false; error: string; code: "NO_ROUTE" | "NO_COMPATIBLE_STATIONS" };

const margCandidateInclude = {
  chargers: {
    where: { isDeleted: false },
    select: {
      chargingMode: true,
      powerKw: true,
      availability: true,
      connectors: { select: { connector: { select: { code: true, label: true } } } },
    },
  },
} satisfies Prisma.StationInclude;

type MargCandidateRow = Prisma.StationGetPayload<{ include: typeof margCandidateInclude }>;

function connectorMatches(charger: MargCandidateRow["chargers"][number], connector: string): boolean {
  return charger.connectors.some(
    (cc) =>
      cc.connector.code.toLowerCase() === connector.toLowerCase() ||
      cc.connector.label.toLowerCase() === connector.toLowerCase()
  );
}

/** The station's chargers that actually satisfy this journey's connector/mode requirement — never UNAVAILABLE. */
function eligibleChargers(
  station: MargCandidateRow,
  connector: string,
  chargingMode: "AC" | "DC" | undefined
) {
  return station.chargers.filter(
    (c) =>
      c.availability !== "UNAVAILABLE" &&
      connectorMatches(c, connector) &&
      (!chargingMode || c.chargingMode === chargingMode)
  );
}

function summarizeAvailability(
  chargers: ReturnType<typeof eligibleChargers>
): MargAvailabilityStatus {
  if (chargers.some((c) => c.availability === "AVAILABLE")) return "AVAILABLE";
  if (chargers.some((c) => c.availability === "BUSY")) return "BUSY";
  return "UNKNOWN";
}

export async function planJourney(input: MargPlanInput): Promise<MargPlanResult> {
  const start: LatLng = { latitude: input.startLatitude, longitude: input.startLongitude };
  const destination: LatLng = { latitude: input.destLatitude, longitude: input.destLongitude };

  const route = await fetchDrivingRoute(start, destination);
  if (!route) {
    return {
      ok: false,
      code: "NO_ROUTE",
      error: "We couldn't find a route between these locations. Please check your starting point and destination.",
    };
  }

  const candidates = await prisma.station.findMany({
    where: { isDeleted: false, status: "ACTIVE", latitude: { not: null }, longitude: { not: null } },
    include: margCandidateInclude,
  });

  const onRoute = candidates
    .map((station) => {
      const matching = eligibleChargers(station, input.connector, input.chargingMode);
      if (matching.length === 0) return null;

      const { distanceAlongRouteKm, detourKm } = nearestPointOnRoute(route, {
        latitude: decimalToNumber(station.latitude) as number,
        longitude: decimalToNumber(station.longitude) as number,
      });
      if (detourKm > MAX_DETOUR_KM) return null;

      return { station, matching, distanceAlongRouteKm, detourKm };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);

  if (onRoute.length === 0) {
    return {
      ok: false,
      code: "NO_COMPATIBLE_STATIONS",
      error:
        "No compatible charging station was found along this route for the selected connector type.",
    };
  }

  const checkpointCount = Math.min(
    MAX_CHECKPOINTS,
    Math.max(0, Math.floor(route.distanceKm / TARGET_CHECKPOINT_SPACING_KM))
  );

  const chosen: typeof onRoute = [];
  for (let i = 0; i < checkpointCount; i++) {
    const targetKm = (route.distanceKm * (i + 1)) / (checkpointCount + 1);
    const available = onRoute.filter(
      (c) =>
        !chosen.some((used) => used.station.id === c.station.id) &&
        chosen.every((used) => Math.abs(used.distanceAlongRouteKm - c.distanceAlongRouteKm) >= MIN_CHECKPOINT_SPACING_KM)
    );
    if (available.length === 0) continue;

    available.sort(
      (a, b) =>
        Math.abs(a.distanceAlongRouteKm - targetKm) - Math.abs(b.distanceAlongRouteKm - targetKm) ||
        a.detourKm - b.detourKm
    );
    chosen.push(available[0]);
  }
  chosen.sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);

  const checkpoints: MargCheckpoint[] = chosen.map((c, index) => {
    const previousKm = index === 0 ? 0 : chosen[index - 1].distanceAlongRouteKm;
    const connectorByCode = new Map<string, string>();
    const chargingModes = new Set<string>();
    let powerKwMax: number | null = null;
    for (const charger of c.matching) {
      chargingModes.add(charger.chargingMode);
      for (const cc of charger.connectors) connectorByCode.set(cc.connector.code, cc.connector.label);
      const power = decimalToNumber(charger.powerKw);
      if (power !== null && (powerKwMax === null || power > powerKwMax)) powerKwMax = power;
    }

    return {
      stationId: c.station.id,
      stationName: c.station.stationName,
      province: c.station.province,
      district: c.station.district,
      city: c.station.city,
      address: c.station.address,
      latitude: decimalToNumber(c.station.latitude) as number,
      longitude: decimalToNumber(c.station.longitude) as number,
      distanceFromPreviousKm: Math.round((c.distanceAlongRouteKm - previousKm) * 10) / 10,
      distanceAlongRouteKm: Math.round(c.distanceAlongRouteKm * 10) / 10,
      detourKm: Math.round(c.detourKm * 10) / 10,
      connectors: Array.from(connectorByCode, ([code, label]) => ({ code, label })),
      chargingModes: Array.from(chargingModes),
      powerKwMax,
      availability: summarizeAvailability(c.matching),
      status: c.station.status as "ACTIVE" | "INACTIVE",
    };
  });

  const lastKm = chosen.length > 0 ? chosen[chosen.length - 1].distanceAlongRouteKm : 0;
  const finalLegKm = Math.round((route.distanceKm - lastKm) * 10) / 10;

  return {
    ok: true,
    data: {
      startLabel: input.startLabel,
      destLabel: input.destLabel,
      start,
      destination,
      geometry: route.geometry,
      totalDistanceKm: Math.round(route.distanceKm * 10) / 10,
      durationMin: Math.round(route.durationMin),
      checkpoints,
      finalLegKm,
      connector: input.connector,
      chargingMode: input.chargingMode ?? null,
    },
  };
}

// Re-exported so the API route can type its response without importing
// the OSRM module directly.
export type { DrivingRoute };
