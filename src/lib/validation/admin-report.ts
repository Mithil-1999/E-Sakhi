import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";
import { REPORT_STATUSES } from "@/lib/validation/report";

/**
 * "ALL" isn't a real ReportStatus — it's a queue-specific grouping that
 * removes the status filter entirely, same pattern as
 * admin-verification.ts's VERIFICATION_QUEUE_TABS. PENDING is the queue's
 * default tab (the master brief's own framing: "admins see/triage pending
 * reports").
 */
export const REPORT_QUEUE_TABS = [...REPORT_STATUSES, "ALL"] as const;

export type ReportQueueTab = (typeof REPORT_QUEUE_TABS)[number];

export const ReportQueueQuerySchema = PaginationQuerySchema.extend({
  tab: z.enum(REPORT_QUEUE_TABS).default("PENDING"),
});

export type ReportQueueQuery = z.infer<typeof ReportQueueQuerySchema>;
