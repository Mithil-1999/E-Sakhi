import type { NextRequest } from "next/server";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiErrorFromStatus,
  apiInternalError,
} from "@/lib/api/response";
import { requireUserForApi } from "@/lib/auth/api";
import { ReportCreateSchema } from "@/lib/validation/report";
import { createReport } from "@/services/report-service";

/**
 * [id] is the Station being reported on. Only creation lives here — a
 * report is never listed back to the reporting user or the public (only
 * admins triage reports, via /admin/reports and PATCH /api/reports/[id]);
 * see docs/data-model.md's Report entity.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/stations/[id]/reports">) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", "VALIDATION_ERROR", 400);
  }

  const parsed = ReportCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(parsed.error);
  }

  try {
    const result = await createReport(auth.user.id, id, parsed.data);
    if (!result.ok) {
      return apiErrorFromStatus(result.error, result.status);
    }
    return apiSuccess(result.data, undefined, 201);
  } catch (error) {
    return apiInternalError("POST /api/stations/[id]/reports", error);
  }
}
