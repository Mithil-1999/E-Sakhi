import * as z from "zod";

/**
 * A review is always fully resent (rating + comment together), never
 * partially patched — the client-side form always submits its whole
 * current state, same pattern AdminStationForm.tsx uses for stations. So
 * unlike StationUpdateSchema, there's no `.partial()` here: `comment` is
 * required-but-nullable (an explicit `null` clears it), not optional.
 */
export const ReviewUpsertSchema = z.object({
  rating: z.coerce
    .number()
    .int({ error: "Rating must be a whole number." })
    .min(1, { error: "Rating must be between 1 and 5." })
    .max(5, { error: "Rating must be between 1 and 5." }),
  comment: z.string().trim().max(1000, { error: "Comment must be 1000 characters or fewer." }).nullable(),
});

export type ReviewUpsertInput = z.infer<typeof ReviewUpsertSchema>;
