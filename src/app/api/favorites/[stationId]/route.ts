import { apiSuccess, apiInternalError } from "@/lib/api/response";
import { requireUserForApi } from "@/lib/auth/api";
import { removeFavorite } from "@/services/favorite-service";

/**
 * [stationId] here is the Station being unfavorited, not a Favorite row
 * id — the client never needs to know a Favorite's own id, only which
 * station it's toggling. Ownership is implicit: this always deletes
 * (userId from the session, stationId from the URL), never another
 * user's row, and it's a no-op (not a 404) if the pair doesn't exist —
 * DELETE is idempotent by design here.
 */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/favorites/[stationId]">
) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { stationId } = await ctx.params;

  try {
    const result = await removeFavorite(auth.user.id, stationId);
    return apiSuccess({ favorited: result.favorited });
  } catch (error) {
    return apiInternalError("DELETE /api/favorites/[stationId]", error);
  }
}
