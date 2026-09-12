import "server-only";
import { prisma } from "@/lib/db/prisma";
import { stationListInclude, toStationListItem, type StationListItem } from "@/services/station-service";

/**
 * Favorite business logic. Every function here takes `userId` as an
 * explicit parameter derived from the authenticated session by the
 * caller (a page via requireUser(), a Route Handler via
 * requireUserForApi()) — never from client-submitted input. See
 * docs/architecture.md §3 "Ownership checks."
 */

export type FavoriteMutationResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string; status: number };

/**
 * A favorited station that's since been soft-deleted is excluded here,
 * same as every other public station listing — the Favorite row itself
 * is left alone (not auto-removed) so it can reappear honestly if the
 * station is ever restored, but a deleted station never renders as if it
 * were still a normal favorite.
 */
export async function listFavoriteStations(userId: string): Promise<StationListItem[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId, station: { isDeleted: false } },
    orderBy: { createdAt: "desc" },
    include: { station: { include: stationListInclude } },
  });
  return favorites.map((favorite) => toStationListItem(favorite.station));
}

/** The current user's favorited station ids, for batch "is this favorited?" checks on a list of stations (StationCard etc.) without one query per card. */
export async function listFavoriteStationIds(userId: string): Promise<Set<string>> {
  const favorites = await prisma.favorite.findMany({
    where: { userId, station: { isDeleted: false } },
    select: { stationId: true },
  });
  return new Set(favorites.map((f) => f.stationId));
}

export async function isFavorited(userId: string, stationId: string): Promise<boolean> {
  const favorite = await prisma.favorite.findUnique({
    where: { userId_stationId: { userId, stationId } },
  });
  return favorite !== null;
}

export async function countFavorites(userId: string): Promise<number> {
  return prisma.favorite.count({ where: { userId, station: { isDeleted: false } } });
}

export async function addFavorite(userId: string, stationId: string): Promise<FavoriteMutationResult> {
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station || station.isDeleted) {
    return { ok: false, error: "Station not found.", status: 404 };
  }

  // Upsert rather than create: favoriting an already-favorited station is
  // not an error (the unique constraint on [userId, stationId] exists to
  // prevent duplicates, not to reject a repeat click) — idempotent.
  await prisma.favorite.upsert({
    where: { userId_stationId: { userId, stationId } },
    create: { userId, stationId },
    update: {},
  });
  return { ok: true, favorited: true };
}

/**
 * Idempotent: unfavoriting a station that isn't currently favorited still
 * succeeds (no ok:false case — there's nothing that can fail here beyond
 * the try/catch every Route Handler already wraps calls in).
 */
export async function removeFavorite(userId: string, stationId: string): Promise<{ favorited: false }> {
  await prisma.favorite.deleteMany({ where: { userId, stationId } });
  return { favorited: false };
}
