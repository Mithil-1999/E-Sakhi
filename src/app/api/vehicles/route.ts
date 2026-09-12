import type { NextRequest } from "next/server";
import { apiSuccess, apiValidationError, apiInternalError } from "@/lib/api/response";
import { VehicleListQuerySchema } from "@/lib/validation/vehicle";
import { listVehicles } from "@/services/vehicle-service";

export async function GET(request: NextRequest) {
  const parsed = VehicleListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const data = await listVehicles(parsed.data);
    return apiSuccess(data);
  } catch (error) {
    return apiInternalError("GET /api/vehicles", error);
  }
}
