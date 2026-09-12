import type { NextRequest } from "next/server";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiErrorFromStatus,
  apiInternalError,
} from "@/lib/api/response";
import { requireUserForApi } from "@/lib/auth/api";
import { FavoriteCreateSchema } from "@/lib/validation/favorite";
import { listFavoriteStations, addFavorite } from "@/services/favorite-service";

/** Every route in this file is the signed-in user's own favorites — never another user's, and never trusting a client-submitted user id (docs/architecture.md §3). */

export async function GET() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  try {
    const data = await listFavoriteStations(auth.user.id);
    return apiSuccess(data);
  } catch (error) {
    return apiInternalError("GET /api/favorites", error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = FavoriteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await addFavorite(auth.user.id, parsed.data.stationId);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess({ favorited: result.favorited }, undefined, 201);
  } catch (error) {
    return apiInternalError("POST /api/favorites", error);
  }
}
