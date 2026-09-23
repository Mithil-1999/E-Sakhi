import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireSuperAdminForApi } from "@/lib/auth/api";
import { ChangeUserStatusSchema } from "@/lib/validation/user";
import { changeUserStatus } from "@/services/user-service";

/** PATCH /api/users/[id]/status — activate/deactivate; see changeUserStatus()'s own guard against self-deactivation. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]/status">) {
  const auth = await requireSuperAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ChangeUserStatusSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await changeUserStatus(id, parsed.data.status, auth.user.id);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("PATCH /api/users/[id]/status", error);
  }
}
