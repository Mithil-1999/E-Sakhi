import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ReviewUpsertInput } from "@/lib/validation/review";

/**
 * Review business logic (Part 15) — a real 1-5 star rating + comment,
 * replacing the "reviews arrive in a later part of the build" message the
 * station detail page (Part 07) has shown since. One review per user per
 * station (`Review.@@unique([userId, stationId])`), always editable: a
 * second submission from the same user updates their existing row rather
 * than creating a second one — `upsertReview()` below relies on that same
 * compound unique key Prisma already generated for it, exactly the way
 * `favorite-service.ts` (Part 10) upserts on `userId_stationId`.
 *
 * A station's average rating and review count are — and always have
 * been, since Part 04 — computed fresh from these rows at query time by
 * `station-service.ts`'s `getStationRating()`/`getStationRatingsBatch()`.
 * This file never maintains a second, hand-kept average anywhere.
 */

const reviewListInclude = {
  user: { select: { id: true, name: true } },
} satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewListInclude }>;

export function toReviewItem(review: ReviewRow) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    user: { id: review.user.id, name: review.user.name },
  };
}

export type ReviewItem = ReturnType<typeof toReviewItem>;

/**
 * A station's reviews, most recently updated first (an edited review
 * bumps back to the top — it's the current, not the original, opinion
 * that's most relevant to a reader). Capped, not paginated — same
 * "generous cap standing in for pagination" call as
 * `admin-verification-service.ts`'s `getVerificationLogForStation()`; a
 * single station accumulating hundreds of real reviews is not this app's
 * current scale.
 */
export async function listReviewsForStation(stationId: string, limit = 200) {
  const reviews = await prisma.review.findMany({
    where: { stationId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: reviewListInclude,
  });
  return reviews.map(toReviewItem);
}

/** The current user's own review for a station, or null — used to prefill the "your review" form. Never another user's row (stationId + the caller-supplied userId only). */
export async function getOwnReview(userId: string, stationId: string): Promise<ReviewItem | null> {
  const review = await prisma.review.findUnique({
    where: { userId_stationId: { userId, stationId } },
    include: reviewListInclude,
  });
  return review ? toReviewItem(review) : null;
}

export type ReviewMutationResult =
  | { ok: true; data: ReviewItem }
  | { ok: false; error: string; status: number };

/**
 * Create-or-update in one call. `userId` is always the caller-derived
 * session id (a Route Handler via `requireUserForApi()`), never a
 * client-submitted value — the same structural ownership guarantee
 * `favorite-service.ts` documents in `docs/architecture.md §3`.
 */
export async function upsertReview(
  userId: string,
  stationId: string,
  input: ReviewUpsertInput
): Promise<ReviewMutationResult> {
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station || station.isDeleted) {
    return { ok: false, error: "Station not found.", status: 404 };
  }

  const review = await prisma.review.upsert({
    where: { userId_stationId: { userId, stationId } },
    create: { userId, stationId, rating: input.rating, comment: input.comment },
    update: { rating: input.rating, comment: input.comment },
    include: reviewListInclude,
  });
  return { ok: true, data: toReviewItem(review) };
}

/** Idempotent, same as favorite-service.ts's removeFavorite() — deleting a review that doesn't exist still succeeds rather than 404ing. */
export async function deleteOwnReview(userId: string, stationId: string): Promise<{ deleted: boolean }> {
  const result = await prisma.review.deleteMany({ where: { userId, stationId } });
  return { deleted: result.count > 0 };
}
