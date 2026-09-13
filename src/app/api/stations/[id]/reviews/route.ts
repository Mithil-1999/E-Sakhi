import type { NextRequest } from "next/server";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiErrorFromStatus,
  apiInternalError,
} from "@/lib/api/response";
import { requireUserForApi } from "@/lib/auth/api";
import { ReviewUpsertSchema } from "@/lib/validation/review";
import { listReviewsForStation, upsertReview, deleteOwnReview } from "@/services/review-service";

// [id] here is the Station's internal id, same convention as
// /api/stations/[id] — never the external source station_id.

/** Public — every visitor sees a station's real reviews, same as the rest of a station's public detail data. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/stations/[id]/reviews">) {
  const { id } = await ctx.params;

  try {
    const data = await listReviewsForStation(id);
    return apiSuccess(data);
  } catch (error) {
    return apiInternalError("GET /api/stations/[id]/reviews", error);
  }
}

/** Create-or-update the signed-in user's own review for this station — one review per user per station, so a second submission edits the first rather than adding a second row. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/stations/[id]/reviews">) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ReviewUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await upsertReview(auth.user.id, id, parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data, undefined, 201);
  } catch (error) {
    return apiInternalError("POST /api/stations/[id]/reviews", error);
  }
}

/** Deletes only the signed-in user's own review for this station — ownership is implicit (userId from the session, stationId from the URL), same idempotent-DELETE shape as /api/favorites/[stationId]. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/stations/[id]/reviews">) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  try {
    const result = await deleteOwnReview(auth.user.id, id);
    return apiSuccess(result);
  } catch (error) {
    return apiInternalError("DELETE /api/stations/[id]/reviews", error);
  }
}
