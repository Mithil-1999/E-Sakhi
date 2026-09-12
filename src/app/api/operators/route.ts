import type { NextRequest } from "next/server";
import { apiSuccess, apiValidationError, apiInternalError } from "@/lib/api/response";
import { OperatorListQuerySchema } from "@/lib/validation/operator";
import { listOperators } from "@/services/operator-service";

export async function GET(request: NextRequest) {
  const parsed = OperatorListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const { data, meta } = await listOperators(parsed.data);
    return apiSuccess(data, meta);
  } catch (error) {
    return apiInternalError("GET /api/operators", error);
  }
}
