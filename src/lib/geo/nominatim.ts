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
