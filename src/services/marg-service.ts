import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/db/serialize";
import { fetchDrivingRoutes, nearestPointOnRoute, type DrivingRoute } from "@/lib/geo/osrm";
import { reverseGeocodePlace } from "@/lib/geo/nominatim";
import { estimateCurrentRangeKm } from "@/services/charging-calculator";
import type { LatLng } from "@/lib/geo/distance";
import type { MargPlanInput } from "@/lib/validation/marg";
import type { MargCheckpoint, MargRouteOption, MargPlanResult as MargPlanData, MargAvailabilityStatus } from "@/types/marg";

/**
 * E Sakhi Marg — journey/route planning. Distinct from recommendation-
 * engine.ts (single-station ranking for "which station is best for me
 * right now") and getNearestStations (single-point "what's closest to
 * here") — this plans a whole start→destination journey against every
 * real alternative route OSRM offers, and for each one picks a real,
 * ordered sequence of charging checkpoints along that route's actual
 * driving path.
 *
 * No station data is ever invented: every checkpoint is a real `Station`
 * row already in the database, matched by real connector/charging-mode
 * compatibility and real proximity to a real OSRM-computed route. A
 * route with nothing compatible is still returned — never hidden — with
 * `hasCompatibleStations: false` so the caller can say so honestly.
 */

// A station further than this off the route's own path isn't "on the way"
// — it would be a real, callable-out detour, not a natural stop. Chosen
// to comfortably include a hotel/petrol-station-hosted charger set back
// from the highway itself, not to open the search radius countrywide.
const MAX_DETOUR_KM = 8;

// Checkpoints are spaced roughly this far apart along the route when no
// vehicle range is known — a reasonable "typical comfortable EV leg"
// default. When a real vehicle range + battery level ARE given (see
// chooseRangeAwareCheckpoints below), spacing is driven by that instead.
const TARGET_CHECKPOINT_SPACING_KM = 60;
const MAX_CHECKPOINTS = 6;
// Two chosen checkpoints closer together than this along the route would
// be redundant, not a real second stop.
const MIN_CHECKPOINT_SPACING_KM = 15;

// Range-aware planning only: how much of the vehicle's remaining range we
// treat as usable before recommending a stop. Leaves a real buffer (never
// plans a leg that assumes the battery hits exactly zero) rather than
// claiming a precision this simplified, linear range model doesn't have —
// same honesty standard as CHARGING_ESTIMATE_CAVEAT in
// charging-calculator.ts.
const RANGE_SAFETY_MARGIN = 0.85;

// Nominatim's usage policy asks for a light, non-parallel request rate.
// Reverse-geocoding two waypoints per route, called sequentially with this
// gap between requests (see buildPathSummary), keeps E Sakhi Marg polite
// even when planning three alternative routes in one call.
const REVERSE_GEOCODE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type MargPlanResult =
  | { ok: true; data: MargPlanData }
  | { ok: false; error: string; code: "NO_ROUTE" };

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
type EligibleChargers = MargCandidateRow["chargers"];

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
): EligibleChargers {
  return station.chargers.filter(
    (c) =>
      c.availability !== "UNAVAILABLE" &&
      connectorMatches(c, connector) &&
      (!chargingMode || c.chargingMode === chargingMode)
  );
}

function summarizeAvailability(chargers: EligibleChargers): MargAvailabilityStatus {
  if (chargers.some((c) => c.availability === "AVAILABLE")) return "AVAILABLE";
  if (chargers.some((c) => c.availability === "BUSY")) return "BUSY";
  return "UNKNOWN";
}

type OnRouteCandidate = {
  station: MargCandidateRow;
  matching: EligibleChargers;
  distanceAlongRouteKm: number;
  detourKm: number;
};

/** Projects every connector/mode-eligible station onto one specific route, dropping anything too far off its path. Route-specific (the same station sits at a different position — or off the route entirely — for each alternative). */
function candidatesOnRoute(
  route: DrivingRoute,
  eligibleStations: { station: MargCandidateRow; matching: EligibleChargers }[]
): OnRouteCandidate[] {
  return eligibleStations
    .map(({ station, matching }) => {
      const { distanceAlongRouteKm, detourKm } = nearestPointOnRoute(route, {
        latitude: decimalToNumber(station.latitude) as number,
        longitude: decimalToNumber(station.longitude) as number,
      });
      if (detourKm > MAX_DETOUR_KM) return null;
      return { station, matching, distanceAlongRouteKm, detourKm };
    })
    .filter((x): x is OnRouteCandidate => x !== null)
    .sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);
}

/** Default spacing: evenly-spaced target points along the route, closest real candidate to each — unchanged from E Sakhi Marg's original design, used whenever no usable vehicle range is given. */
function chooseFixedSpacingCheckpoints(onRoute: OnRouteCandidate[], routeDistanceKm: number): OnRouteCandidate[] {
  const checkpointCount = Math.min(MAX_CHECKPOINTS, Math.max(0, Math.floor(routeDistanceKm / TARGET_CHECKPOINT_SPACING_KM)));
  const chosen: OnRouteCandidate[] = [];
  for (let i = 0; i < checkpointCount; i++) {
    const targetKm = (routeDistanceKm * (i + 1)) / (checkpointCount + 1);
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
  return chosen;
}

/**
 * Battery-aware spacing: greedily picks, at each point, the farthest real
 * compatible station still reachable within RANGE_SAFETY_MARGIN of the
 * vehicle's remaining range — minimizing stops while never planning a leg
 * the vehicle couldn't realistically make. Assumes a full top-up at every
 * chosen stop (the plan doesn't know how long the driver will charge for,
 * so it can't assume less — stated to the user alongside the plan).
 * Returns the km into the route where planning had to stop because no
 * compatible station was reachable — null when the whole route is
 * accounted for.
 */
function chooseRangeAwareCheckpoints(
  onRoute: OnRouteCandidate[],
  routeDistanceKm: number,
  startRangeKm: number,
  fullRangeKm: number
): { chosen: OnRouteCandidate[]; strandedAtKm: number | null } {
  const chosen: OnRouteCandidate[] = [];
  let coveredKm = 0;
  let availableRangeKm = startRangeKm;

  while (chosen.length < MAX_CHECKPOINTS) {
    const reachableKm = coveredKm + availableRangeKm * RANGE_SAFETY_MARGIN;
    if (reachableKm >= routeDistanceKm) return { chosen, strandedAtKm: null };

    const window = onRoute.filter(
      (c) => c.distanceAlongRouteKm > coveredKm && c.distanceAlongRouteKm <= reachableKm && !chosen.includes(c)
    );
    if (window.length === 0) return { chosen, strandedAtKm: coveredKm };

    // Farthest reachable candidate first — covers the most ground per
    // stop, so the plan doesn't recommend charging more often than the
    // vehicle's own range actually requires.
    window.sort((a, b) => b.distanceAlongRouteKm - a.distanceAlongRouteKm || a.detourKm - b.detourKm);
    const pick = window[0];
    chosen.push(pick);
    coveredKm = pick.distanceAlongRouteKm;
    availableRangeKm = fullRangeKm;
  }
  const reachableKm = coveredKm + availableRangeKm * RANGE_SAFETY_MARGIN;
  return { chosen, strandedAtKm: reachableKm >= routeDistanceKm ? null : coveredKm };
}

function toMargCheckpoints(chosen: OnRouteCandidate[]): MargCheckpoint[] {
  return chosen.map((c, index) => {
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
}

function shortPlaceName(label: string): string {
  return label.split(",")[0].trim();
}

/** The geometry point closest to a given cumulative distance along the route — used only to pick where to reverse-geocode, never to relocate a real station. */
function pointAtDistanceKm(route: DrivingRoute, targetKm: number): [number, number] {
  let index = route.geometry.length - 1;
  for (let i = 0; i < route.cumulativeKm.length; i++) {
    if (route.cumulativeKm[i] >= targetKm) {
      index = i;
      break;
    }
  }
  return route.geometry[index];
}

/**
 * A real, dynamically-derived "Start → ... → Destination" chain for a
 * route card — start and destination labels plus up to two intermediate
 * place names reverse-geocoded from points a third and two-thirds of the
 * way along this specific route's own geometry. A name Nominatim can't
 * resolve is simply left out (never guessed), so the chain can be as
 * short as just [start, destination].
 */
async function buildPathSummary(route: DrivingRoute, startLabel: string, destLabel: string): Promise<string[]> {
  const start = shortPlaceName(startLabel);
  const dest = shortPlaceName(destLabel);
  const names: string[] = [];

  for (const fraction of [1 / 3, 2 / 3]) {
    const [lat, lng] = pointAtDistanceKm(route, route.distanceKm * fraction);
    await sleep(REVERSE_GEOCODE_DELAY_MS);
    let name: string | null;
    try {
      name = await reverseGeocodePlace({ latitude: lat, longitude: lng });
    } catch {
      name = null;
    }
    if (name && name !== start && name !== dest && !names.includes(name)) {
      names.push(name);
    }
  }

  return [start, ...names, dest];
}

async function resolveVehicleRangeKm(input: MargPlanInput): Promise<number | null> {
  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { fullRangeKm: true },
    });
    const km = decimalToNumber(vehicle?.fullRangeKm ?? null);
    return km !== null && km > 0 ? km : null;
  }
  if (input.fullRangeKm) return input.fullRangeKm;
  return null;
}

export async function planJourney(input: MargPlanInput): Promise<MargPlanResult> {
  const start: LatLng = { latitude: input.startLatitude, longitude: input.startLongitude };
  const destination: LatLng = { latitude: input.destLatitude, longitude: input.destLongitude };

  const routes = await fetchDrivingRoutes(start, destination);
  if (routes.length === 0) {
    return {
      ok: false,
      code: "NO_ROUTE",
      error: "We couldn't find a route between these locations. Please check your starting point and destination.",
    };
  }

  // Battery-aware planning is entirely optional and only ever narrows
  // spacing — it never changes which stations exist. Falls back silently
  // to fixed spacing when no resolvable vehicle range, or no battery
  // percent, was given (e.g. a guest with no vehicle selected).
  const fullRangeKm = await resolveVehicleRangeKm(input);
  const rangeAware = fullRangeKm !== null && input.currentBatteryPercent !== undefined;
  const startRangeKm = rangeAware ? estimateCurrentRangeKm(fullRangeKm as number, input.currentBatteryPercent as number) : null;

  const stations = await prisma.station.findMany({
    where: { isDeleted: false, status: "ACTIVE", latitude: { not: null }, longitude: { not: null } },
    include: margCandidateInclude,
  });
  const eligibleStations = stations
    .map((station) => ({ station, matching: eligibleChargers(station, input.connector, input.chargingMode) }))
    .filter((s) => s.matching.length > 0);

  // Sequential, not Promise.all — buildPathSummary already rate-limits its
  // own Nominatim calls, and doing all routes in parallel would defeat
  // that entirely.
  const routeOptions: MargRouteOption[] = [];
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const onRoute = candidatesOnRoute(route, eligibleStations);

    let chosen: OnRouteCandidate[];
    let strandedAtKm: number | null = null;
    if (rangeAware && startRangeKm !== null) {
      const result = chooseRangeAwareCheckpoints(onRoute, route.distanceKm, startRangeKm, fullRangeKm as number);
      chosen = result.chosen;
      strandedAtKm = result.strandedAtKm;
    } else {
      chosen = chooseFixedSpacingCheckpoints(onRoute, route.distanceKm);
    }

    const checkpoints = toMargCheckpoints(chosen);
    const lastKm = chosen.length > 0 ? chosen[chosen.length - 1].distanceAlongRouteKm : 0;
    const finalLegKm = Math.round((route.distanceKm - lastKm) * 10) / 10;
    const pathSummary = await buildPathSummary(route, input.startLabel, input.destLabel);

    routeOptions.push({
      id: `route-${i}`,
      ordinal: i + 1,
      isFastest: i === 0,
      pathSummary,
      geometry: route.geometry,
      totalDistanceKm: Math.round(route.distanceKm * 10) / 10,
      durationMin: Math.round(route.durationMin),
      checkpoints,
      finalLegKm,
      hasCompatibleStations: onRoute.length > 0,
      rangeWarning:
        strandedAtKm !== null
          ? `No compatible charging station was found within the vehicle's estimated range after ${Math.round(strandedAtKm)} km into this route — the remaining ${Math.round(route.distanceKm - strandedAtKm)} km may not be reachable on this connector without an extra detour.`
          : null,
    });
  }

  return {
    ok: true,
    data: {
      startLabel: input.startLabel,
      destLabel: input.destLabel,
      start,
      destination,
      connector: input.connector,
      chargingMode: input.chargingMode ?? null,
      rangeAware,
      routes: routeOptions,
    },
  };
}

// Re-exported so the API route can type its response without importing
// the OSRM module directly.
export type { DrivingRoute };
