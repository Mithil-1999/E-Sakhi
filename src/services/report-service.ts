import "server-only";
import { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPaginationMeta } from "@/lib/validation/pagination";
import type { ReportCreateInput, ReportStatusUpdateInput } from "@/lib/validation/report";
import type { ReportQueueQuery, ReportQueueTab } from "@/lib/validation/admin-report";

/**
 * Report business logic (Part 15) — a signed-in user's "Report Incorrect
 * Information" submission (replacing the disabled stub Part 07 left on
 * the station detail page) and the admin triage queue that finally
 * populates `/admin`'s "Reports"/"Pending reports" stats (genuine `0`s
 * since Part 11, because nothing had ever created a `Report` row until
 * now). Unlike `Favorite`/`Review`, `Report` has no unique constraint on
 * `[userId, stationId]` — a user can file more than one report against
 * the same station; two different problems on one station are two
 * different reports, not edits of the same one.
 */

export type ReportMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

/** `userId` is always the caller-derived session id, never client-submitted — same ownership rule as favorite-service.ts/review-service.ts (docs/architecture.md §3). */
export async function createReport(
  userId: string,
  stationId: string,
  input: ReportCreateInput
): Promise<ReportMutationResult<{ id: string }>> {
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station || station.isDeleted) {
    return { ok: false, error: "Station not found.", status: 404 };
  }

  const report = await prisma.report.create({
    data: {
      userId,
      stationId,
      reportType: input.reportType,
      description: input.description ?? null,
    },
  });
  return { ok: true, data: { id: report.id } };
}

// ---------------------------------------------------------------------------
// Admin triage queue
// ---------------------------------------------------------------------------

function statusForTab(tab: ReportQueueTab): ReportStatus | null {
  if (tab === "ALL") return null;
  return tab;
}

const reportQueueInclude = {
  user: { select: { id: true, name: true } },
  station: { select: { id: true, stationName: true, city: true, district: true, province: true } },
} satisfies Prisma.ReportInclude;

type ReportQueueRow = Prisma.ReportGetPayload<{ include: typeof reportQueueInclude }>;

function toReportQueueItem(report: ReportQueueRow) {
  return {
    id: report.id,
    reportType: report.reportType,
    description: report.description,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
    user: { id: report.user.id, name: report.user.name },
    station: report.station,
  };
}

export type AdminReportItem = ReturnType<typeof toReportQueueItem>;

/**
 * Ordered oldest-first — a triage queue's job is clearing the backlog, so
 * the report that's been waiting longest surfaces first (deliberately the
 * opposite of the verification queue, which is station-name-ordered
 * because it isn't ranking by urgency at all — see
 * admin-verification-service.ts).
 */
export async function listReportQueue(query: ReportQueueQuery) {
  const status = statusForTab(query.tab);
  const where: Prisma.ReportWhereInput = status ? { status } : {};

  const [total, reports] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: reportQueueInclude,
    }),
  ]);

  return {
    data: reports.map(toReportQueueItem),
    meta: buildPaginationMeta(query.page, query.pageSize, total),
  };
}

/**
 * `resolvedAt` is set the moment a report reaches a terminal state
 * (`RESOLVED` or `REJECTED`) and cleared if it's ever moved back out of
 * one — mirrors `Report.resolved_at`'s documented meaning in
 * docs/data-model.md (a timestamp, not a boolean), not just "has ever
 * been resolved."
 */
export async function updateReportStatus(
  id: string,
  input: ReportStatusUpdateInput
): Promise<ReportMutationResult<{ id: string; status: ReportStatus; resolvedAt: string | null }>> {
  const existing = await prisma.report.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "Report not found.", status: 404 };
  }

  const isTerminal = input.status === "RESOLVED" || input.status === "REJECTED";
  const updated = await prisma.report.update({
    where: { id },
    data: { status: input.status, resolvedAt: isTerminal ? new Date() : null },
  });
  return {
    ok: true,
    data: {
      id: updated.id,
      status: updated.status,
      resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
    },
  };
}
