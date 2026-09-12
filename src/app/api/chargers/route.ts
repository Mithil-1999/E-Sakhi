import type { NextRequest } from "next/server";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiErrorFromStatus,
  apiInternalError,
} from "@/lib/api/response";
import { requireAdminForApi } from "@/lib/auth/api";
import { ChargerListQuerySchema, ChargerCreateSchema } from "@/lib/validation/charger";
import { listChargers, createCharger } from "@/services/charger-service";

export async function GET(request: NextRequest) {
  const parsed = ChargerListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const { data, meta } = await listChargers(parsed.data);
    return apiSuccess(data, meta);
  } catch (error) {
    return apiInternalError("GET /api/chargers", error);
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

  const parsed = ChargerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await createCharger(parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data, undefined, 201);
  } catch (error) {
    return apiInternalError("POST /api/chargers", error);
  }
}
