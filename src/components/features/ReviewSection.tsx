"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";
import { ReviewUpsertSchema } from "@/lib/validation/review";
import type { ReviewItem } from "@/types/review";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const textareaClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900";

/**
 * Real reviews (Part 15) — a signed-in user's 1-5 star rating + comment,
 * replacing the "reviews arrive in a later part of the build" message the
 * station detail page (Part 07) showed since launch. One review per user
 * per station (Review.@@unique), always editable: submitting again just
 * updates it, via POST /api/stations/[id]/reviews' upsert (never a second
 * row). Signed-out visitors see a real link to /login, the same honesty
 * pattern FavoriteButton.tsx established in Part 10 — never a
 * fake-working form.
 *
 * Local state is seeded from the server-fetched initial list/own-review
 * (the station detail page, a Server Component, calls
 * listReviewsForStation()/getOwnReview() directly) and updated in place
 * after a successful mutation — no full page reload, same pattern
 * MyFavoritesList.tsx uses.
 */
export function ReviewSection({
  stationId,
  initialReviews,
  initialOwnReview,
  isLoggedIn,
}: {
  stationId: string;
  initialReviews: ReviewItem[];
  initialOwnReview: ReviewItem | null;
  isLoggedIn: boolean;
}) {
  const pathname = usePathname();
  const [reviews, setReviews] = useState(initialReviews);
  const [ownReview, setOwnReview] = useState(initialOwnReview);
  const [isEditing, setIsEditing] = useState(false);
  const [rating, setRating] = useState(initialOwnReview?.rating ?? 0);
  const [comment, setComment] = useState(initialOwnReview?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const otherReviews = reviews.filter((r) => r.id !== ownReview?.id);

  function startEditing() {
    setRating(ownReview?.rating ?? 0);
    setComment(ownReview?.comment ?? "");
    setError(null);
    setIsEditing(true);
  }

  function submit() {
    setError(null);
    const parsed = ReviewUpsertSchema.safeParse({
      rating,
      comment: comment.trim() === "" ? null : comment.trim(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid review.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message ?? "Could not save your review.");

        const saved = body.data as ReviewItem;
        setOwnReview(saved);
        setReviews((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your review.");
      }
    });
  }

  function remove() {
    if (!ownReview) return;
    if (!window.confirm("Delete your review?")) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/reviews`, { method: "DELETE" });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error?.message ?? "Could not delete your review.");
        }
        setReviews((prev) => prev.filter((r) => r.id !== ownReview.id));
        setOwnReview(null);
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete your review.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <Star className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        Reviews ({reviews.length})
      </h2>

      {/* Your review */}
      <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        {!isLoggedIn ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">Log in to leave a review.</p>
            <Button href={`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`} variant="outline">
              Log in
            </Button>
          </div>
        ) : isEditing ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Your rating</p>
              <div className="mt-1 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    aria-pressed={rating === n}
                    className="p-0.5"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Comment (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                className={textareaClass}
                placeholder="How was charging here?"
              />
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={submit} disabled={isPending || rating < 1}>
                {isPending ? "Saving…" : "Submit review"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isPending}>
                Cancel
              </Button>
              {ownReview && (
                <Button type="button" variant="outline" onClick={remove} disabled={isPending} className="ml-auto">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        ) : ownReview ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Your review</p>
              <StarRating value={ownReview.rating} className="mt-1" />
              {ownReview.comment && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{ownReview.comment}</p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={startEditing}>
              Edit
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">You haven&apos;t reviewed this station yet.</p>
            <Button type="button" variant="outline" onClick={startEditing}>
              Write a review
            </Button>
          </div>
        )}
      </div>

      {/* Everyone else's reviews */}
      {otherReviews.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          {ownReview ? "No other reviews yet." : "No reviews yet — be the first to leave one."}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {otherReviews.map((review) => (
            <li key={review.id} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-900 dark:text-white">
                  {review.user.name ?? "A user"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {dateFormatter.format(new Date(review.updatedAt))}
                </span>
              </div>
              <StarRating value={review.rating} className="mt-1" />
              {review.comment && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{review.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
