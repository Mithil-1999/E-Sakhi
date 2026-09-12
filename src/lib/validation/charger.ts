import * as z from "zod";
import { PaginationQuerySchema } from "@/lib/validation/pagination";

const CHARGING_MODE_VALUES = ["AC", "DC", "UNKNOWN"] as const;

export const ChargerListQuerySchema = PaginationQuerySchema.extend({
  stationId: z.string().trim().min(1).optional(),
  connector: z.string().trim().min(1).max(50).optional(),
  chargingMode: z.enum(CHARGING_MODE_VALUES).optional(),
});

export type ChargerListQuery = z.infer<typeof ChargerListQuerySchema>;
