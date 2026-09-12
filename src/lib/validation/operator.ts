import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";

export const OperatorListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(1).max(200).optional(),
});

export type OperatorListQuery = z.infer<typeof OperatorListQuerySchema>;
