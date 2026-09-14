/**
 * The fixed power-range buckets from the project brief's Part 06 filter
 * spec ("Up to 7 kW / 7–22 kW / 22–60 kW / 60–120 kW / 120+ kW"). Single
 * source of truth for both the filter UI and the server-side query
 * (src/services/station-service.ts) so the boundaries can't drift between
 * the two — same pattern as src/lib/config/nepal-provinces.ts.
 *
 * Boundary convention: each bucket is `min < power <= max`, except the
 * first bucket (`power <= 7`) and the last (`power > 120`, no upper
 * bound).
 *
 * There used to be a 6th "Unknown" bucket matching a charger with no
 * recorded power_kw at all. By explicit product decision it's been
 * removed from the picker entirely (see docs/architecture.md §6) — a
 * charger's real `powerKw` is untouched by this, only the ability to
 * filter specifically for "unknown power" chargers is gone.
 */

export type PowerBucketId = "UP_TO_7" | "7_TO_22" | "22_TO_60" | "60_TO_120" | "120_PLUS";

export type PowerBucket = {
  id: PowerBucketId;
  label: string;
  min: number | null; // exclusive lower bound (null = no lower bound)
  max: number | null; // inclusive upper bound (null = no upper bound)
};

export const POWER_BUCKETS: PowerBucket[] = [
  { id: "UP_TO_7", label: "Up to 7 kW", min: null, max: 7 },
  { id: "7_TO_22", label: "7–22 kW", min: 7, max: 22 },
  { id: "22_TO_60", label: "22–60 kW", min: 22, max: 60 },
  { id: "60_TO_120", label: "60–120 kW", min: 60, max: 120 },
  { id: "120_PLUS", label: "120+ kW", min: 120, max: null },
];

export const POWER_BUCKET_IDS = POWER_BUCKETS.map((b) => b.id) as [PowerBucketId, ...PowerBucketId[]];

export function findPowerBucket(id: string): PowerBucket | undefined {
  return POWER_BUCKETS.find((b) => b.id === id);
}
