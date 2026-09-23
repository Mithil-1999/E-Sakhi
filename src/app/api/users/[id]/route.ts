import { apiSuccess, apiError, apiInternalError } from "@/lib/api/response";
import { requireSuperAdminForApi } from "@/lib/auth/api";
import { getUserById } from "@/services/user-service";

export async function GET(_request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const auth = await requireSuperAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  try {
    const user = await getUserById(id);
    if (!user) {
      return apiError("User not found.", "NOT_FOUND", 404);
    }
    return apiSuccess(user);
  } catch (error) {
    return apiInternalError("GET /api/users/[id]", error);
  }
}
