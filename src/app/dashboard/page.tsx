import type { Metadata } from "next";
import Link from "next/link";
import { Award, Heart, MapPin, SearchX, Zap } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { StationCard } from "@/components/features/StationCard";
import { requireUser } from "@/lib/auth/session";
import { listFavoriteStations } from "@/services/favorite-service";

export const metadata: Metadata = {
  title: "Dashboard",
};

const QUICK_LINKS = [
  { href: "/map", label: "Map", icon: MapPin },
  { href: "/stations", label: "Find Chargers", icon: SearchX },
  { href: "/charging-calculator", label: "Charging Calculator", icon: Zap },
  { href: "/recommendations", label: "Recommendations", icon: Award },
];

const PREVIEW_COUNT = 3;

/**
 * The signed-in landing hub (distinct from /profile's account-details
 * page and /my-favorites' full list) — a favorites preview plus quick
 * links to the rest of the app. Kept intentionally light: it doesn't
 * duplicate /profile's account fields or /my-favorites' full grid, it
 * links to both.
 */
export default async function DashboardPage() {
  // requireUser() redirects to /login if there's no session — the real
  // authorization check; src/proxy.ts's redirect is only a UX shortcut,
  // not a substitute for this. See docs/architecture.md §3.
  const user = await requireUser();

  const favorites = await listFavoriteStations(user.id);
  const preview = favorites.slice(0, PREVIEW_COUNT);

  return (
    <Container className="py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Welcome back{user.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Your favorites and quick links to the rest of E Sakhi.
        </p>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Heart className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Favorites
          </h2>
          <Link
            href="/my-favorites"
            className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            View all ({favorites.length})
          </Link>
        </div>

        {preview.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No favorites yet — save a station from its detail page to see it here.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((station) => (
              <StationCard
                key={station.id}
                station={{
                  ...station,
                  createdAt: station.createdAt.toISOString(),
                  updatedAt: station.updatedAt.toISOString(),
                }}
                favorite={{ isLoggedIn: true, isFavorited: true }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quick links</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <Button key={link.href} href={link.href} variant="outline" className="flex-col py-4">
              <link.icon className="h-5 w-5" aria-hidden="true" />
              {link.label}
            </Button>
          ))}
        </div>
      </section>
    </Container>
  );
}
