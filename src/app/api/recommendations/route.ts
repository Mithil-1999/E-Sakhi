import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import { RecommendationQuerySchema } from "@/lib/validation/recommendation";
import { getStationRecommendations } from "@/services/recommendation-engine";

/**
 * GET, not POST: this is a read with no side effects (see
 * docs/recommendation-engine.md §1) — the vehicle/location inputs fit
 * comfortably in query params, so it follows the same GET-with-query-schema
 * shape as every other public list endpoint (/api/stations, /api/vehicles, ...)
 * rather than needing a request body.
 */
export async function GET(request: NextRequest) {
  const parsed = RecommendationQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await getStationRecommendations(parsed.data);
    if (!result.ok) {
      return apiError(result.error, "VALIDATION_ERROR", 400);
    }
    return apiSuccess(result.data, result.meta);
  } catch (error) {
    return apiInternalError("GET /api/recommendations", error);
  }
}
