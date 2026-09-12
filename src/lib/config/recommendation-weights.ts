/**
 * Single source of truth for the recommendation engine's scoring weights
 * and its "unknown data" neutral-low value — see docs/recommendation-engine.md
 * §2/§3 for the full rationale. No component or route hard-codes a weight;
 * everything reads from here (mirrors the nepal-provinces.ts /
 * power-buckets.ts "one canonical list" pattern).
 */

export const RECOMMENDATION_WEIGHTS = {
  power: 0.3,
  distance: 0.25,
  rating: 0.15,
  verification: 0.15,
  availability: 0.15,
} as const;

// Weights above must always sum to 1 — scores are a straight weighted
// average, never renormalized per-request (see docs/recommendation-engine.md §2).
const WEIGHT_SUM = Object.values(RECOMMENDATION_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WEIGHT_SUM - 1) > 1e-9) {
  throw new Error(`RECOMMENDATION_WEIGHTS must sum to 1 (currently ${WEIGHT_SUM}).`);
}

/**
 * The score assigned to any factor whose real value is unknown — never 0
 * (that would claim "known bad") and never a middling ~0.5 (that would
 * claim "known average"). What matters is that it's applied identically
 * across every factor and never outranks a confirmed-good value — see
 * docs/recommendation-engine.md §2 ("Rule 3, restated precisely").
 */
export const UNKNOWN_FACTOR_SCORE = 0.25;

export const DISTANCE_DECAY_KM = 10;
