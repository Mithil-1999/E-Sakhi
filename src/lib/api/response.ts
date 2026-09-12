import { NextResponse } from "next/server";
import type * as z from "zod";

/**
 * Shared JSON response envelope for every /api/* route — see
 * docs/architecture.md §4 "Response shape (JSON APIs)". Route Handlers
 * should build responses through these helpers rather than hand-rolling
 * `NextResponse.json(...)` so the shape stays consistent everywhere.
 */

export type ApiMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function apiSuccess<T>(data: T, meta?: ApiMeta, status = 200) {
  return NextResponse.json(meta ? { data, meta } : { data }, { status });
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export function apiError(message: string, code: ApiErrorCode, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}

/** Formats a ZodError's issues into one human-readable message. */
export function apiValidationError(error: z.ZodError) {
  const message = error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join(" ");
  return apiError(message || "Invalid request.", "VALIDATION_ERROR", 400);
}

/**
 * Turns a service-layer { ok: false, error, status } result into a
 * response, picking the error code from the HTTP status so callers don't
 * have to. Use for the `!result.ok` branch of a services/*.ts mutation.
 */
export function apiErrorFromStatus(message: string, status: number) {
  const code =
    status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "VALIDATION_ERROR";
  return apiError(message, code, status);
}

/**
 * Logs the real error server-side and returns a generic, safe 500 —
 * raw Prisma/database errors and stack traces are never sent to the
 * client (docs/architecture.md §4 "Error handling").
 */
export function apiInternalError(context: string, error: unknown) {
  console.error(`[api] ${context}:`, error);
  return apiError("Something went wrong. Please try again.", "INTERNAL_ERROR", 500);
}
