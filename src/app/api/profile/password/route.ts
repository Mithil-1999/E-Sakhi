import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireUserForApi } from "@/lib/auth/api";
import { ChangeOwnPasswordSchema } from "@/lib/validation/user";
import { changeOwnPassword } from "@/services/auth-service";

/** PATCH /api/profile/password — requires the caller's current password; every role can change their own. */
export async function PATCH(request: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ChangeOwnPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await changeOwnPassword(auth.user.id, parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess({ ok: true });
  } catch (error) {
    return apiInternalError("PATCH /api/profile/password", error);
  }
}
