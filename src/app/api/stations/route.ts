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
import { StationListQuerySchema, StationCreateSchema } from "@/lib/validation/station";
import { listStations, createStation } from "@/services/station-service";

export async function GET(request: NextRequest) {
  const parsed = StationListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  // includeDeleted is only honored for an authenticated ADMIN — a non-admin
  // (or anonymous) caller passing it is silently treated as false rather
  // than rejected, so the param's existence isn't itself a signal leaked
  // to unauthenticated callers.
  const query = parsed.data;
  let includeDeleted = false;
  if (query.includeDeleted) {
    const user = await getOptionalUser();
    includeDeleted = user?.role === "ADMIN";
  }

  try {
    const { data, meta } = await listStations(query, includeDeleted);
    return apiSuccess(data, meta);
  } catch (error) {
    return apiInternalError("GET /api/stations", error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = StationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await createStation(parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data, undefined, 201);
  } catch (error) {
    return apiInternalError("POST /api/stations", error);
  }
}
