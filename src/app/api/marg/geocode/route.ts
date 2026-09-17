import type { NextRequest } from "next/server";
import { apiSuccess, apiValidationError, apiInternalError } from "@/lib/api/response";
import { MargGeocodeQuerySchema } from "@/lib/validation/marg";
import { geocodePlace } from "@/lib/geo/nominatim";

/**
 * GET /api/marg/geocode?q= — place-name search for E Sakhi Marg's Starting
 * Point / Destination fields. Public, read-only, no persistence. Proxies
 * OpenStreetMap Nominatim server-side (see src/lib/geo/nominatim.ts for
 * why: its usage policy needs a real User-Agent header the browser can't
 * set for you).
 */
export async function GET(request: NextRequest) {
  const parsed = MargGeocodeQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const data = await geocodePlace(parsed.data.q);
    return apiSuccess(data);
  } catch (error) {
    return apiInternalError("GET /api/marg/geocode", error);
  }
}
