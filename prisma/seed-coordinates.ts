/**
 * E Sakhi — real station coordinate backfill.
 *
 * `docs/data-model.md §8.5` flagged this as a real, deferred improvement:
 * the original source spreadsheet has NULL coordinates for every one of
 * the 460 stations (its `map_url` is a text-search link, never a pin —
 * see `prisma/seed.ts`). This file fills that gap honestly, from an
 * actual geocoding pass (OpenStreetMap Nominatim, plus exact Plus Code
 * decoding where the source address was one) rather than leaving it
 * unaddressed or guessing.
 *
 * Every station gets a `CoordinateSource`:
 * - `EXACT` — the station itself was confidently geocoded.
 * - `APPROXIMATE` — the station couldn't be confidently located, so a
 *   real, named related place from the same record (the station's own
 *   name, its town, or its district) was used instead. Still a real,
 *   traceable coordinate — just lower precision, and always labeled as
 *   such (see `src/components/features/StationPopupContent.tsx` and
 *   `docs/data-model.md §10`).
 * - `UNKNOWN` (the default) — no coordinate could be found at all for
 *   this station; left NULL, same as before this backfill.
 *
 * Source data: `prisma/seed-data/station-coordinates.json`, a
 * `station_id -> { latitude, longitude, source }` map (station_id is the
 * same external id `prisma/seed.ts` upserts stations by, so this can
 * only ever update a station that already exists — never invents one).
 *
 * Idempotent (upsert-by-known-id, safe to re-run) and deliberately
 * separate from `prisma/seed.ts`'s own station upsert: that script's
 * `stationUpdateData` never lists `latitude`/`longitude`/
 * `coordinateSource` specifically so re-running the bootstrap import can
 * never clobber what this file sets — the same "never touch verification
 * fields on update" guarantee, extended to coordinates. Called from
 * `prisma/seed.ts`'s `main()` so `npm run db:seed` stays the single
 * onboarding command; also directly runnable on its own.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type CoordinateSource } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type CoordinateEntry = {
  latitude: number;
  longitude: number;
  source: CoordinateSource;
};

const DATA_PATH =
  process.env.COORDINATES_DATA_PATH ??
  path.join(__dirname, "seed-data", "station-coordinates.json");

export async function seedCoordinates(
  prisma: PrismaClient
): Promise<{ updated: number; skipped: number; exact: number; approximate: number }> {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  const entries: Record<string, CoordinateEntry> = JSON.parse(raw);

  let updated = 0;
  let skipped = 0;
  let exact = 0;
  let approximate = 0;

  for (const [stationId, entry] of Object.entries(entries)) {
    const result = await prisma.station.updateMany({
      where: { stationId },
      data: {
        latitude: entry.latitude,
        longitude: entry.longitude,
        coordinateSource: entry.source,
      },
    });

    if (result.count > 0) {
      updated += result.count;
      if (entry.source === "EXACT") exact += result.count;
      if (entry.source === "APPROXIMATE") approximate += result.count;
    } else {
      // station_id in the coordinates file doesn't match any real
      // station currently in the database — never inserted, only
      // reported, so a stale entry can't silently create bad data.
      skipped += 1;
    }
  }

  return { updated, skipped, exact, approximate };
}

// Standalone runnable (`npx tsx prisma/seed-coordinates.ts`), independent
// of prisma/seed.ts's own main() — useful for re-applying just the
// coordinate backfill (e.g. after a fresh `prisma migrate deploy` on a
// database that already has stations but predates this field).
if (require.main === module) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  seedCoordinates(prisma)
    .then((r) =>
      console.log(
        `Updated ${r.updated} stations (${r.exact} exact, ${r.approximate} approximate); ${r.skipped} entries had no matching station.`
      )
    )
    .catch((err) => {
      console.error("Coordinate seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
