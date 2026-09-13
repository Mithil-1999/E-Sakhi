/**
 * Client-facing review types — mirror the shape review-service.ts's
 * toReviewItem()/the reviews API actually return, kept separate from
 * that "server-only" module so Client Components (ReviewSection.tsx) can
 * import the type without pulling in server-only code, same pattern as
 * station.ts vs station-service.ts.
 */
export type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null };
};
