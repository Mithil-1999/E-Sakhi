import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireSuperAdminForApi } from "@/lib/auth/api";
import { AdminResetPasswordSchema } from "@/lib/validation/user";
import { resetUserPassword } from "@/services/user-service";

/**
 * PATCH /api/users/[id]/reset-password — the real mechanism behind
 * /forgot-password's honest "ask a Super Admin" guidance (no email
 * service exists to send a real reset link). The new password is
 * returned to the Super Admin in this response so they can pass it on
 * out of band; it is never emailed or logged anywhere.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]/reset-password">) {
  const auth = await requireSuperAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = AdminResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await resetUserPassword(id, parsed.data.newPassword);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("PATCH /api/users/[id]/reset-password", error);
  }
}
