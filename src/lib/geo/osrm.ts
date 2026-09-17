import type { LatLng } from "@/lib/geo/distance";

/**
 * Real driving-route lookup for E Sakhi Marg (the journey planner) via
 * OSRM's public demo routing server (router.project-osrm.org). No API
 * key needed, real road-following geometry and distance — not a
 * straight-line approximation.
 *
 * This is a shared *public demo* instance, not meant for heavy
 * production traffic (see https://project-osrm.org/docs/v5.24.0/api/
 * and OSRM's own usage policy). It's the right default for a project
 * with no routing budget/API key today, but this function is the one
 * place that would need to change to swap in a paid provider (Mapbox
 * Directions, Google Routes, OpenRouteService, ...) later — nothing
 * else in the app talks to a routing provider directly.
 */

export type DrivingRoute = {
  /** Total road distance, km. */
  distanceKm: number;
  /** Estimated driving duration, minutes (OSRM's own default-speed profile — not live traffic). */
  durationMin: number;
  /** The route's full path as [latitude, longitude] pairs, in travel order. */
  geometry: [number, number][];
  /** Cumulative road distance (km) from the start, at each geometry point — same length/order as `geometry`. */
  cumulativeKm: number[];
};

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

export async function fetchDrivingRoute(
  from: LatLng,
  to: LatLng
): Promise<DrivingRoute | null> {
  const url =
    `${OSRM_BASE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?overview=full&geometries=geojson`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "e-sakhi-marg/1.0 (EV route planning, student project)" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body = (await response.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (body.code !== "Ok" || !body.routes || body.routes.length === 0) return null;

  const route = body.routes[0];
  // GeoJSON coordinates are [lng, lat] — flip to this app's [lat, lng] convention everywhere else.
  const geometry: [number, number][] = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  const cumulativeKm = buildCumulativeDistances(geometry);

  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry,
    cumulativeKm,
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

function buildCumulativeDistances(geometry: [number, number][]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineKm(geometry[i - 1], geometry[i]));
  }
  return cumulative;
}

/**
 * Nearest point on the route's polyline to a candidate location — used to
 * decide whether a real station is "near enough" to this journey to count
 * as a checkpoint, and where along the route it sits. An approximation
 * (nearest vertex, not a true point-to-segment projection), acceptable
 * given OSRM's `overview=full` geometry is dense enough in practice; never
 * used to invent a station's own real coordinates, only to place a real
 * one on the route.
 */
export function nearestPointOnRoute(
  route: DrivingRoute,
  point: LatLng
): { distanceAlongRouteKm: number; detourKm: number } {
  let best = { index: 0, distanceKm: Infinity };
  for (let i = 0; i < route.geometry.length; i++) {
    const d = haversineKm(route.geometry[i], [point.latitude, point.longitude]);
    if (d < best.distanceKm) best = { index: i, distanceKm: d };
  }
  return { distanceAlongRouteKm: route.cumulativeKm[best.index], detourKm: best.distanceKm };
}
