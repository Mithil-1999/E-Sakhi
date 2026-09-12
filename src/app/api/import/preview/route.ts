import type { NextRequest } from "next/server";
import { apiSuccess, apiError, apiInternalError } from "@/lib/api/response";
import { requireAdminForApi } from "@/lib/auth/api";
import { computeImportDiff } from "@/services/import-service";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — the real seed file is ~150KB; generous headroom, not unbounded

/**
 * Read-only: parses the uploaded workbook and diffs it against the live
 * database. Never writes anything — see docs/data-import.md §3.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("Request must be multipart/form-data with a file field.", "VALIDATION_ERROR", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return apiError("No file was uploaded.", "VALIDATION_ERROR", 400);
  }
  if (file.size === 0) {
    return apiError("The uploaded file is empty.", "VALIDATION_ERROR", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return apiError(
      `The uploaded file is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).`,
      "VALIDATION_ERROR",
      400
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await computeImportDiff(buffer, file.name);
    return apiSuccess(preview);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      // A real, expected failure mode (wrong file, missing sheet) — not
      // an internal error, so it gets a real message instead of a
      // generic 500 (docs/architecture.md §4's "Error handling" is about
      // never leaking *unexpected* errors, not hiding an honest one).
      return apiError(error.message, "VALIDATION_ERROR", 400);
    }
    return apiInternalError("POST /api/import/preview", error);
  }
}
