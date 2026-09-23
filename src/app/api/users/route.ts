import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireSuperAdminForApi } from "@/lib/auth/api";
import { UserListQuerySchema, CreateUserSchema } from "@/lib/validation/user";
import { listUsers, createUser } from "@/services/user-service";

/**
 * User management — Super Admin only, both reads and writes (unlike
 * station endpoints, where GET is public). See docs/architecture.md's
 * RBAC section: an ADMIN or MEMBER calling these directly (Postman,
 * devtools) gets a real 403/401 here, not just a hidden frontend button.
 */

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdminForApi();
  if (!auth.ok) return auth.response;

  const parsed = UserListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const { data, meta } = await listUsers(parsed.data);
    return apiSuccess(data, meta);
  } catch (error) {
    return apiInternalError("GET /api/users", error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminForApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await createUser(parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data, undefined, 201);
  } catch (error) {
    return apiInternalError("POST /api/users", error);
  }
}
