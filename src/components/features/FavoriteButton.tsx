"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/Button";

type FavoriteButtonProps = {
  stationId: string;
  initialFavorited: boolean;
  isLoggedIn: boolean;
  /** "full" = labeled button (station detail page's Actions panel). "icon" = compact round toggle (StationCard overlay). */
  variant?: "full" | "icon";
  /** Called after a successful toggle — e.g. /my-favorites uses this to drop the card and refresh the list rather than showing a now-stale "favorited" station. */
  onToggled?: (favorited: boolean) => void;
};

/**
 * Real favorite/unfavorite toggle (Part 10) — replaces the deliberately
 * inert, disabled stub Part 07 left on the station detail page. Talks to
 * POST/DELETE /api/favorites, which re-check the session server-side on
 * every call (docs/architecture.md §3) — this component never claims
 * ownership itself, it just reflects what the server confirmed.
 *
 * A signed-out visitor sees a real link to /login (with a callbackUrl
 * back to the current page), never a fake-working button — the same
 * honesty rule Part 07 applied to its stub, just resolved differently now
 * that the feature is real for signed-in users.
 */
export function FavoriteButton({
  stationId,
  initialFavorited,
  isLoggedIn,
  variant = "full",
  onToggled,
}: FavoriteButtonProps) {
  const pathname = usePathname();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isLoggedIn) {
    const loginHref = `/login?callbackUrl=${encodeURIComponent(pathname || "/")}`;
    if (variant === "icon") {
      return (
        <Link
          href={loginHref}
          title="Log in to save favorites"
          aria-label="Log in to save favorites"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm hover:text-slate-600 dark:bg-slate-900/90 dark:hover:text-slate-300"
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
        </Link>
      );
    }
    return (
      <Button href={loginHref} variant="outline">
        <Heart className="h-4 w-4" aria-hidden="true" />
        Log in to save favorites
      </Button>
    );
  }

  function toggle() {
    setErrorMessage(null);
    const next = !favorited;
    startTransition(async () => {
      try {
        const res = next
          ? await fetch("/api/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stationId }),
            })
          : await fetch(`/api/favorites/${stationId}`, { method: "DELETE" });

        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "Something went wrong.");
        }

        setFavorited(next);
        onToggled?.(next);
      } catch (error) {
        // Optimistic UI would have flipped state before the request — this
        // component only flips *after* the server confirms, so there's
        // nothing to revert, just an honest error message.
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={favorited}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        title={favorited ? "Remove from favorites" : "Add to favorites"}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900/90"
      >
        <Heart
          className={`h-4 w-4 ${favorited ? "fill-red-500 text-red-500" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"}`}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <div>
      <Button type="button" variant="outline" onClick={toggle} disabled={isPending}>
        <Heart className={`h-4 w-4 ${favorited ? "fill-red-500 text-red-500" : ""}`} aria-hidden="true" />
        {isPending ? "Saving…" : favorited ? "Favorited" : "Favorite"}
      </Button>
      {errorMessage && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
    </div>
  );
}
