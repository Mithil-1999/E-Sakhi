import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { MyFavoritesList } from "@/components/features/MyFavoritesList";
import { requireUser } from "@/lib/auth/session";
import { listFavoriteStations } from "@/services/favorite-service";

export const metadata: Metadata = {
  title: "My Favorites",
};

export default async function MyFavoritesPage() {
  // requireUser() redirects to /login if there's no session — the real
  // authorization check; src/proxy.ts's redirect is only a UX shortcut,
  // not a substitute for this. See docs/architecture.md §3.
  const user = await requireUser();

  const stations = await listFavoriteStations(user.id);

  return (
    <Container className="py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Favorites</h1>
      </div>

      {/* The service layer returns real Date objects; StationCard is typed
          against the client-facing shape (ISO strings) — serialize here,
          same as /stations (Part 06). */}
      <MyFavoritesList
        initialFavorites={stations.map((station) => ({
          ...station,
          createdAt: station.createdAt.toISOString(),
          updatedAt: station.updatedAt.toISOString(),
        }))}
      />
    </Container>
  );
}
