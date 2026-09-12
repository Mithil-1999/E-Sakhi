import type { NextRequest } from "next/server";
import { apiSuccess, apiValidationError, apiInternalError } from "@/lib/api/response";
import { ChargerListQuerySchema } from "@/lib/validation/charger";
import { listChargers } from "@/services/charger-service";

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
