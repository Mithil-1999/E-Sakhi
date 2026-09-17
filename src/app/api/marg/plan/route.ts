import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import { MargPlanSchema } from "@/lib/validation/marg";
import { planJourney } from "@/services/marg-service";

/**
 * POST /api/marg/plan — E Sakhi Marg's core endpoint. Public, read-only
 * (computes a route + checkpoints fresh on every call; nothing is
 * persisted, no "saved journey" yet — see the request's own §22 "Journey
 * history" as a future feature). Body: MargPlanSchema (start/destination
 * coordinates + labels, connector, optional chargingMode).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = MargPlanSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await planJourney(parsed.data);
    if (!result.ok) {
      // NOT_FOUND is the closest fit in the shared ApiErrorCode union —
      // "no route" / "no compatible station" are both, semantically, "the
      // thing you asked for doesn't exist," not a validation problem with
      // the request itself.
      return apiError(result.error, "NOT_FOUND", 404);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("POST /api/marg/plan", error);
  }
}
