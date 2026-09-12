"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StationCard } from "@/components/features/StationCard";
import type { StationListItem } from "@/types/station";

/**
 * Client wrapper around /my-favorites' station grid — needed only because
 * "remove this card from the list the moment it's unfavorited" requires a
 * real client-side callback, and a Server Component page (see
 * src/app/my-favorites/page.tsx) can't pass a function prop across the
 * server/client boundary. Local state is seeded from the server-fetched
 * initial list; toggling a favorite off here just filters it out of that
 * local array — no full page refresh, no second round trip.
 */
export function MyFavoritesList({ initialFavorites }: { initialFavorites: StationListItem[] }) {
  const [favorites, setFavorites] = useState(initialFavorites);

  return (
    <>
      {/* Derived from live local state, not the server-rendered initial
          count — stays correct immediately after a card is removed below,
          with no full page reload. */}
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {favorites.length} station{favorites.length === 1 ? "" : "s"} you&apos;ve saved.
      </p>

      {favorites.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Heart className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No favorites yet</h2>
          <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Save a station from its detail page or from a search result to find it here quickly
            next time.
          </p>
          <Button href="/stations" variant="outline" className="mt-2">
            Find Chargers
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              favorite={{
                isLoggedIn: true,
                isFavorited: true,
                onToggled: (favorited) => {
                  if (!favorited) {
                    setFavorites((prev) => prev.filter((s) => s.id !== station.id));
                  }
                },
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
