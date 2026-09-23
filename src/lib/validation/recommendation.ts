import * as z from "zod";

/**
 * GET /api/recommendations query params. Location and a search range are
 * both required now — the whole model is "stations within my range,
 * nearest first," which isn't meaningful without a real point to measure
 * from. See docs/recommendation-engine.md for why exactly one of
 * vehicleId/connector is required.
 */
export const RecommendationQuerySchema = z
  .object({
    vehicleId: z.string().trim().min(1).optional(),
    connector: z.string().trim().min(1).optional(),
    maxAcPowerKw: z.coerce.number().min(0).optional(),
    maxDcPowerKw: z.coerce.number().min(0).optional(),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    /** How far the visitor is willing to travel, km. No hard-coded preset values — any positive number they type. */
    rangeKm: z.coerce.number().positive().max(500),
  })
  .refine((data) => Boolean(data.vehicleId) || Boolean(data.connector), {
    message: "Provide either vehicleId or connector.",
    path: ["vehicleId"],
  });

export type RecommendationQuery = z.infer<typeof RecommendationQuerySchema>;
