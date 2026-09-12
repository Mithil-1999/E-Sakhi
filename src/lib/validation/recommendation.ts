import * as z from "zod";

/**
 * GET /api/recommendations query params. See docs/recommendation-engine.md
 * §4 for why exactly one of vehicleId/connector is required and why
 * latitude/longitude must come as a pair.
 */
export const RecommendationQuerySchema = z
  .object({
    vehicleId: z.string().trim().min(1).optional(),
    connector: z.string().trim().min(1).optional(),
    maxAcPowerKw: z.coerce.number().min(0).optional(),
    maxDcPowerKw: z.coerce.number().min(0).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine((data) => Boolean(data.vehicleId) || Boolean(data.connector), {
    message: "Provide either vehicleId or connector.",
    path: ["vehicleId"],
  })
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: "latitude and longitude must be provided together.",
    path: ["longitude"],
  });

export type RecommendationQuery = z.infer<typeof RecommendationQuerySchema>;
