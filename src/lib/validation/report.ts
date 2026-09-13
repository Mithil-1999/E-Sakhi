import * as z from "zod";

// Mirrors prisma/schema.prisma's enums as explicit literal tuples — same
// reasoning as src/lib/validation/station.ts: no runtime dependency on
// @prisma/client, schema.prisma stays the source of truth for the values.
export const REPORT_TYPES = [
  "WRONG_LOCATION",
  "WRONG_CONNECTOR",
  "WRONG_POWER",
  "STATION_UNAVAILABLE",
  "WRONG_CONTACT",
  "DUPLICATE_STATION",
  "OTHER",
] as const;

export const REPORT_STATUSES = ["PENDING", "REVIEWING", "RESOLVED", "REJECTED"] as const;

export const ReportCreateSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  description: z.string().trim().max(1000, { error: "Details must be 1000 characters or fewer." }).nullable().optional(),
});

export type ReportCreateInput = z.infer<typeof ReportCreateSchema>;

export const ReportStatusUpdateSchema = z.object({
  status: z.enum(REPORT_STATUSES),
});

export type ReportStatusUpdateInput = z.infer<typeof ReportStatusUpdateSchema>;
