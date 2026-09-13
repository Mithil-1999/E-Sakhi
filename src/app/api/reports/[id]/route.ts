import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiValidationError, apiErrorFromStatus, apiInternalError } from "@/lib/api/response";
import { requireAdminForApi } from "@/lib/auth/api";
import { ReportStatusUpdateSchema } from "@/lib/validation/report";
import { updateReportStatus } from "@/services/report-service";

/** [id] is the Report's own id. Admin-only — this is the one mutation the triage queue (/admin/reports) needs; reports are never edited by the reporting user after submission. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/reports/[id]">) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ReportStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await updateReportStatus(id, parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data);
  } catch (error) {
    return apiInternalError("PATCH /api/reports/[id]", error);
  }
}
