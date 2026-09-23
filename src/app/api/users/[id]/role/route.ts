import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireSuperAdminForApi } from "@/lib/auth/api";
import { ChangeUserRoleSchema } from "@/lib/validation/user";
import { changeUserRole } from "@/services/user-service";

/** PATCH /api/users/[id]/role — Member <-> Admin only; see changeUserRole()'s own guard against a Super Admin target. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]/role">) {
  const auth = await requireSuperAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ChangeUserRoleSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await changeUserRole(id, parsed.data.role);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("PATCH /api/users/[id]/role", error);
  }
}
