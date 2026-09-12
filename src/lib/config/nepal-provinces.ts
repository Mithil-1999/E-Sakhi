/**
 * Nepal's 7 provinces — a fixed geographic fact (not derived from the
 * dataset), used to populate the province filter without a round-trip.
 * Matches the values actually present in the seeded Station.province
 * column (see docs/data-model.md §8.2).
 */
export const NEPAL_PROVINCES = [
  "Koshi",
  "Madhesh",
  "Bagmati",
  "Gandaki",
  "Lumbini",
  "Karnali",
  "Sudurpashchim",
] as const;
