/**
 * Place-name search (geocoding) for E Sakhi Marg's Starting Point /
 * Destination fields, via OpenStreetMap's public Nominatim API — the same
 * service already used (offline, via a one-time Python script) for the
 * station coordinate backfill in docs/data-model.md §10. Restricted to
 * Nepal, English labels. No API key — but Nominatim's usage policy
 * requires a real User-Agent and a light request rate, which is exactly
 * why this is called server-side (via /api/marg/geocode) rather than
 * directly from the browser.
 */

export type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function geocodePlace(query: string): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    format: "json",
    countrycodes: "np",
    "accept-language": "en",
    limit: "6",
    q: query,
  });

  let response: Response;
  try {
    response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { "User-Agent": "e-sakhi-marg/1.0 (EV route planning, student project)" },
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];

  const body = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return body
    .map((r) => ({ label: r.display_name, latitude: Number(r.lat), longitude: Number(r.lon) }))
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
}

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

/**
 * Reverse geocoding — a coordinate back to the name of the real place it
 * sits in, used only to label a point *along* a computed route (e.g. "this
 * route passes through Dhulikhel") for the route cards in E Sakhi Marg.
 * Never used to invent a place: if Nominatim has nothing for a point, this
 * returns null and the caller simply omits that waypoint from the label
 * rather than guessing a name.
 *
 * `zoom=10` asks Nominatim for a town/city-level address, not a street
 * number — the right granularity for "what town is the route passing
 * near", not "what building is here".
 */
export async function reverseGeocodePlace(point: { latitude: number; longitude: number }): Promise<string | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(point.latitude),
    lon: String(point.longitude),
    zoom: "10",
    addressdetails: "1",
    "accept-language": "en",
  });

  let response: Response;
  try {
    response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: { "User-Agent": "e-sakhi-marg/1.0 (EV route planning, student project)" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let body: { address?: Record<string, string> };
  try {
    body = (await response.json()) as { address?: Record<string, string> };
  } catch {
    return null;
  }
  const address = body.address ?? {};
  // Most-specific real field first — never fabricated, just the first one
  // Nominatim actually gave us for this coordinate.
  const name =
    address.city ?? address.town ?? address.municipality ?? address.village ?? address.suburb ??
    address.county ?? address.state_district ?? null;
  return name ? name.trim() : null;
}
