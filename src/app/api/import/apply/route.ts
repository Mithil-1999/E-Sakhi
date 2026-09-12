import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import { requireAdminForApi } from "@/lib/auth/api";
import { ImportApplyRequestSchema } from "@/lib/validation/import";
import { applyImportEntries } from "@/services/import-service";

/**
 * Writes — but only the admin-approved subset the browser sends back
 * from a prior /api/import/preview call, and only via createStation()/
 * updateStation()/createCharger()/updateCharger() (Parts 04/12). See
 * docs/data-import.md §3/§6.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ImportApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const results = await applyImportEntries(parsed.data.entries, auth.user.id);
    return apiSuccess(results);
  } catch (error) {
    return apiInternalError("POST /api/import/apply", error);
  }
}
