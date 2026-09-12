import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireAdminForApi } from "@/lib/auth/api";
import { ChargerUpdateSchema } from "@/lib/validation/charger";
import { updateCharger, softDeleteCharger } from "@/services/charger-service";

// [id] is the internal Charger.id — same convention as
// /api/stations/[id] (docs/data-model.md).

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/chargers/[id]">) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ChargerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await updateCharger(id, parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("PUT /api/chargers/[id]", error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/chargers/[id]">) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  try {
    // Soft delete only — see docs/architecture.md §4 and
    // src/services/charger-service.ts. Returns the now-deleted charger
    // (isDeleted: true) rather than 204, matching DELETE /api/stations/[id].
    const result = await softDeleteCharger(id, auth.user.id);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("DELETE /api/chargers/[id]", error);
  }
}
