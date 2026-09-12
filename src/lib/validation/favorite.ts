import * as z from "zod";

export const FavoriteCreateSchema = z.object({
  stationId: z.string().trim().min(1, "stationId is required."),
});

export type FavoriteCreateInput = z.infer<typeof FavoriteCreateSchema>;
