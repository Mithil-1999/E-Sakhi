import type { NextRequest } from "next/server";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiErrorFromStatus,
  apiInternalError,
} from "@/lib/api/response";
import { requireAdminForApi } from "@/lib/auth/api";
import { getOptionalUser } from "@/lib/auth/session";
import { StationUpdateSchema } from "@/lib/validation/station";
import { getStationById, updateStation, softDeleteStation } from "@/services/station-service";

// [id] is the station's internal id (Station.id, a cuid) — not the
// external source station_id (e.g. "EVNP-0001"). See docs/data-model.md.

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/stations/[id]">) {
  const { id } = await ctx.params;

  const user = await getOptionalUser();
  const includeDeleted = user?.role === "ADMIN";

  try {
    const station = await getStationById(id, includeDeleted);
    if (!station) {
      return apiError("Station not found.", "NOT_FOUND", 404);
    }
    return apiSuccess(station);
  } catch (error) {
    return apiInternalError("GET /api/stations/[id]", error);
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/stations/[id]">) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = StationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await updateStation(id, parsed.data, auth.user.id);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("PUT /api/stations/[id]", error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/stations/[id]">) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  try {
    // Soft delete only — see docs/architecture.md §4 and
    // src/services/station-service.ts. Returns the now-deleted station
    // (isDeleted: true) rather than 204, so an admin UI can confirm state
    // without a follow-up request.
    const result = await softDeleteStation(id, auth.user.id);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("DELETE /api/stations/[id]", error);
  }
}
