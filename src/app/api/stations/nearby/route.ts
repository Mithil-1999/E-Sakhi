import type { NextRequest } from "next/server";
import { apiSuccess, apiValidationError, apiInternalError } from "@/lib/api/response";
import { StationNearbyQuerySchema } from "@/lib/validation/station";
import { getNearestStations } from "@/services/station-service";

/**
 * GET /api/stations/nearby?latitude=&longitude=&limit= — the Charging
 * Calculator's "find my nearest station" (and reusable anywhere else a
 * simple nearest-N lookup is needed later, e.g. the map). Distinct from
 * GET /api/recommendations (Part 09), which additionally ranks by vehicle
 * compatibility/power/rating/verification — this route only ever sorts by
 * straight-line distance, no vehicle input required.
 */
export async function GET(request: NextRequest) {
  const parsed = StationNearbyQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const data = await getNearestStations(
      { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
      parsed.data.limit
    );
    return apiSuccess(data);
  } catch (error) {
    return apiInternalError("GET /api/stations/nearby", error);
  }
}
