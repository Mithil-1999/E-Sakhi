import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireUserForApi } from "@/lib/auth/api";
import { UpdateProfileSchema } from "@/lib/validation/user";
import { updateOwnProfile } from "@/services/auth-service";

/**
 * PATCH /api/profile — any authenticated role can update their own name/
 * email/phone. Deliberately cannot touch role or status: those fields
 * simply aren't in UpdateProfileSchema, so even a hand-crafted request
 * body has them silently ignored — a type-level guarantee, not a runtime
 * check that could be forgotten (same pattern as the Excel import tool's
 * inability to touch verification fields, docs/architecture.md).
 */
export async function PATCH(request: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await updateOwnProfile(auth.user.id, parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess({ ok: true });
  } catch (error) {
    return apiInternalError("PATCH /api/profile", error);
  }
}
