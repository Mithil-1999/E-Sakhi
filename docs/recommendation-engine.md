# E Sakhi — Recommendation Engine

Locks the scoring model for `src/services/recommendation-engine.ts` (Part 09), per `docs/architecture.md §7`'s instruction to write this document before implementing. Implementation must match what's written here; if reality forces a change, this document is updated in the same commit, not silently diverged from.

---

## 1. What this is (and isn't)

Given a vehicle (its supported connector(s) and max AC/DC charging power) and, optionally, the visitor's current location, rank real stations by how good a charging choice each one actually is — not just "nearest station" (the master brief's explicit framing). It is a **read-only ranking over existing station/charger data** (`GET /api/recommendations`, public, no side effects) — it does not create, store, or learn from anything; there is no ML, no per-user history, no persistence. "Smart" here means *multi-factor and honest about missing data*, not machine learning.

## 2. Two-stage model (per `docs/architecture.md §7`)

### Stage 1 — Hard eligibility filters

A station is **excluded outright** (not scored low) unless all of the following hold:

1. **Not soft-deleted** (`isDeleted: false`) — same rule as every other public station query.
2. **Not confirmed inactive** — `Station.status !== "INACTIVE"`. `UNKNOWN` status *passes*: "we don't know if it's active" is not the same claim as "we know it's inactive," and excluding `UNKNOWN` stations would wrongly treat an unconfirmed status as a known-bad one.
3. **Has at least one *eligible charger*** — a non-deleted charger that is:
   - **connector-compatible**: at least one of its connectors matches one of the vehicle's supported connector codes, and
   - **not confirmed unavailable**: `Charger.availability !== "UNAVAILABLE"`. (`AVAILABLE`, `BUSY`, and `UNKNOWN` chargers all remain eligible — `BUSY`/`UNKNOWN` just aren't claimed as ready-right-now; see the availability score below.)

   A station can have some ineligible chargers (wrong connector, or confirmed unavailable) and still qualify via a *different* charger — eligibility and every downstream score are computed only from the charger(s) that pass this test.

If a station has zero eligible chargers, it is dropped before scoring — it is never shown at a low score, because "this can't actually charge your vehicle right now" isn't a ranking opinion, it's a fact.

### Stage 2 — Weighted scoring (eligible stations only)

Five factors, each normalized to `[0, 1]`, combined via fixed weights from the single config object `src/lib/config/recommendation-weights.ts` — no component or route hard-codes a weight:

| Factor | Weight | What it measures |
|---|---|---|
| Power | 0.30 | How fast the *best* eligible charger can actually charge this vehicle |
| Distance | 0.25 | Straight-line distance from the visitor's location, if given |
| Rating | 0.15 | Live-computed average from real `Review` rows |
| Verification | 0.15 | How confirmed the station's own data is |
| Availability | 0.15 | The best known availability among eligible chargers |

```
score = 0.30·power + 0.25·distance + 0.15·rating + 0.15·verification + 0.15·availability
```

Weights are fixed and always summed in full — an unknown factor contributes its **neutral-low** score (defined per-factor below), it is never dropped from the sum and redistributed. This is a deliberate simplification: it keeps the model easy to reason about and test, and it means a station with *more* unknowns never gets a free pass relative to one with the same knowns plus verified extras — unknowns pull the average down, which is the honest direction.

Final order: score descending, tie-broken by `stationName` ascending for deterministic, testable results (never random shuffling of ties).

### Rule 3, restated precisely: what "neutral-low" means

Per `docs/architecture.md §7`'s rule ("unknown data never scores as if it were good data... scored as unknown/neutral-low, never defaulted to a perfect score"), every factor below uses **`0.25`** as its unknown value. That number is deliberate, not arbitrary: on the rating factor, `0.25` sits *below* even a genuine 1-star average (`1/5 = 0.20`... actually just above it) and *well below* a genuine 3-star average (`0.6`) — "we don't know" must never outrank "we know it's mediocre," let alone "we know it's good."

## 3. Factor definitions

### 3.1 Power — weight 0.30

For each eligible charger, compute `getEffectiveChargingPowerKw(vehicle, charger)` — **the exact same function** `src/services/charging-calculator.ts` (Part 08) uses for its time estimate: `min(vehicle's max AC/DC acceptance for that charger's mode, charger's own power rating)`, `null` (unknown) if either side isn't on record. Take the **best** (highest) known effective power across the station's eligible chargers.

- If at least one eligible charger yields a known effective power: `powerScore = min(1, bestEffectiveKw / referenceKw)`, where `referenceKw = max(vehicle.maxAcPowerKw ?? 0, vehicle.maxDcPowerKw ?? 0)` — the vehicle's *own* fastest known acceptance rate. Scoring relative to the vehicle's own ceiling (not a fixed constant like "150 kW") means the score always means "how close to this vehicle's own best case," so it's meaningful for a slow vehicle and a fast one alike, and it can never be non-null while `referenceKw` is 0 (a non-null effective power requires a non-null vehicle max for that mode by construction).
- If every eligible charger's effective power is unknown (charging mode, vehicle max, or charger power missing) → `powerScore = 0.25` (unknown).

The winning charger (the one that produced `bestEffectiveKw`) is surfaced in the result so the UI can show *which* charger and *why* — never a bare number with no explanation.

### 3.2 Distance — weight 0.25

Only computed when the visitor supplies `latitude`/`longitude` (via "Use my location," same geolocation pattern as `/map`, Part 05 — never a default/assumed location) **and** the station has real, non-null coordinates.

- Known: `distanceKm = haversineDistanceKm(visitor, station)` (`src/lib/geo/distance.ts`); `distanceScore = 1 / (1 + distanceKm / 10)` — a smooth decay (1.0 at 0 km, 0.5 at 10 km, ~0.09 at 100 km), no arbitrary hard cutoff.
- Unknown (no visitor location provided, or station has `NULL` coordinates — true for all 460 seeded stations today, see `docs/data-model.md §8.2`) → `distanceScore = 0.25`.

### 3.3 Rating — weight 0.15

From `station.rating` (`{ average, count }`, computed live from `Review` rows exactly as `GET /api/stations/[id]` already does, batched via `getStationRatingsBatch()` in `station-service.ts` rather than one query per station).

- `count > 0`: `ratingScore = average / 5` (a 1–5 star average maps linearly to 0.2–1.0 — deliberately already below the 0.25 unknown floor at the bottom end, so a genuinely bad 1-star average still ranks slightly *below* "no reviews yet," which is correct: one confirmed bad review is worse information than none).
- `count === 0` (true for every station today — Reviews don't exist until Part 15) → `ratingScore = 0.25` (unknown).

### 3.4 Verification — weight 0.15

Direct mapping from `Station.verificationStatus` (`docs/architecture.md §5`), no computation:

| Status | Score |
|---|---|
| `VERIFIED` | 1.00 |
| `PARTIALLY_VERIFIED` | 0.70 |
| `NEEDS_REVIEW` | 0.30 |
| `ASSUMED` | 0.25 |
| `UNVERIFIED` | 0.25 |
| `UNKNOWN` | 0.25 |

`ASSUMED`/`UNVERIFIED`/`UNKNOWN` all land on the same neutral-low value — they're different *reasons* the platform doesn't consider a record confirmed, not different degrees of confirmation, so they aren't ranked against each other.

### 3.5 Availability — weight 0.15

From the eligible chargers only (Stage 1 already excluded confirmed-`UNAVAILABLE` ones), take the best known status present:

| Best eligible-charger availability | Score |
|---|---|
| At least one `AVAILABLE` | 1.00 |
| At least one `BUSY` (none `AVAILABLE`) | 0.40 |
| All `UNKNOWN` | 0.25 |

Matches `docs/data-model.md §7`'s standing warning: with no live telemetry connected, this will land on `0.25` for nearly every real station today — stated plainly in the UI's results summary rather than presented as if it meant something it doesn't.

## 4. Vehicle input

Two ways to supply a vehicle, mirroring the charging calculator's pattern (Part 08) exactly:

1. **`vehicleId`** — a real catalog `Vehicle` (`prisma/seed-vehicles.ts`, `GET /api/vehicles`). Its `connectors` and `maxAcPowerKw`/`maxDcPowerKw` are used directly.
2. **Manual** — `connector` (a single canonical `Connector.code`, required since compatibility can't be checked without it) plus optional `maxAcPowerKw`/`maxDcPowerKw`. Unlike the calculator, battery capacity is **not** collected here — the recommendation engine ranks by charging *speed* capability, not by energy/time for a specific session, so it has no use for it and doesn't ask for it.

Exactly one of `vehicleId` or `connector` must be given (enforced by `src/lib/validation/recommendation.ts`); an unresolvable `vehicleId` or an unrecognized `connector` code is a `400`, not a silent empty result.

## 5. Output shape and transparency

`GET /api/recommendations` returns (via the standard `{ data, meta }` envelope, `docs/architecture.md §4`):

- `data`: up to `limit` (default 10, max 50) ranked stations, each with its overall `score` **and** the full per-factor breakdown (`power`, `distance`, `rating`, `verification`, `availability` — each with its own score *and* the underlying raw value: the matched charger's kW, the distance in km, the average/count, the verification status, the availability label). A bare "73%" with no explanation is never shown anywhere this data reaches — see "why this order" being answerable from the response alone.
- `meta`: `stationsConsidered` (non-deleted stations checked), `stationsEligible` (passed Stage 1), and, of the eligible set, how many had a *known* value for each of distance/rating/availability (`stationsWithKnownDistance` etc.) — computed fresh from the real query result, never a hard-coded claim like "0 of 460," so this stays correct if the dataset's coordinate/review/availability coverage ever improves.

The `/recommendations` page renders that `meta` as an honest summary line (e.g. "12 of 18 compatible stations have no confirmed location yet, so distance couldn't rank them") **before** the results, for the same reason `/map` states "0 of 460 stations have a confirmed location" instead of just quietly showing an empty map.

## 6. Known consequence of today's real data (stated up front, not discovered by surprise)

Every one of the 460 seeded stations has `NULL` coordinates (`docs/data-model.md §8.2`), zero `Review` rows exist yet (Part 15), and essentially every charger's `availability` is `UNKNOWN` (`docs/data-model.md §7`). So today: `distanceScore`, `ratingScore`, and `availabilityScore` land on `0.25` for essentially every eligible station, and `verificationScore` lands on `0.25` or `0.30` for all 460 (`docs/data-model.md §8.4`). **Compatibility (the hard filter) and the power score are the only factors that meaningfully differentiate results right now.** That is a correct reflection of what this dataset actually knows, not a bug — this document (and the `/recommendations` page itself) says so plainly rather than presenting a misleadingly precise-looking ranking. As real coordinates, reviews, and availability data are added in later parts, the other factors activate automatically — no rebuild, because they're already fully implemented against real (currently mostly-empty) fields.

## 7. Not built in Part 09 (by design)

- No ML/learning, no personalization beyond the one vehicle/location given per request.
- No caching of results — every request recomputes from the live database, same as every other list endpoint in this app.
- No pagination — this is a bounded "top N" tool (`limit`, max 50), not a browsable list; `/stations` (Part 06) already is that.
- No new mutation surface — purely a read over data Parts 02/04/08 already produce.
