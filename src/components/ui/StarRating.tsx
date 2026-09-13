import { Star } from "lucide-react";

/**
 * Shared read-only star display — the station detail page's rating
 * summary and every review row (ReviewSection.tsx) render through this
 * one component rather than each drawing its own five icons. `Review.
 * rating` is always a whole 1-5 integer (docs/data-model.md), so there's
 * no half-star case to support; an aggregate average (station-service.ts's
 * getStationRating()) rounds to the nearest whole star for this display,
 * same as it already rounds to one decimal place for the numeric label
 * next to it.
 */
export function StarRating({
  value,
  outOf = 5,
  size = "h-4 w-4",
  className = "",
}: {
  value: number;
  outOf?: number;
  size?: string;
  className?: string;
}) {
  const filled = Math.round(value);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={`${value} out of ${outOf} stars`}
    >
      {Array.from({ length: outOf }, (_, i) => (
        <Star
          key={i}
          className={`${size} ${
            i < filled ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
