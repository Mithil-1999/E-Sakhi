import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";

/**
 * "ATTENTION" and "ALL" aren't real VerificationStatus values — they're
 * queue-specific groupings. ATTENTION = NEEDS_REVIEW + ASSUMED + UNVERIFIED
 * (the master brief's "NEEDS_REVIEW and low-confidence" set), the queue's
 * default tab. See admin-verification-service.ts's statusesForTab().
 */
export const VERIFICATION_QUEUE_TABS = [
  "ATTENTION",
  "NEEDS_REVIEW",
  "ASSUMED",
  "UNVERIFIED",
  "UNKNOWN",
  "PARTIALLY_VERIFIED",
  "VERIFIED",
  "ALL",
] as const;

export type VerificationQueueTab = (typeof VERIFICATION_QUEUE_TABS)[number];

export const VerificationQueueQuerySchema = PaginationQuerySchema.extend({
  tab: z.enum(VERIFICATION_QUEUE_TABS).default("ATTENTION"),
  search: z.string().trim().min(1).max(200).optional(),
});

export type VerificationQueueQuery = z.infer<typeof VerificationQueueQuerySchema>;
