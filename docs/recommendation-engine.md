# E Sakhi — Recommendation Engine

Locks the model for `src/services/recommendation-engine.ts`, per `docs/architecture.md §7`'s instruction to write this document before implementing. Implementation must match what's written here; if reality forces a change, this document is updated in the same commit, not silently diverged from.

> **Rewritten (later revision).** The original Part 09 design scored five weighted factors (power/distance/rating/verification/availability) into one 0–100% score. That model is **fully removed** — no weighted score, no rating factor, no verification factor exists anywhere in this file or its output type any more. This document describes the model that replaced it: a straightforward range-and-distance filter, by explicit product decision. The rest of this document describes only the current, live model.

---

## 1. What this is (and isn't)

Given a vehicle (its supported connector(s) and max AC/DC charging power), the visitor's location, and a search range they choose, return every real, compatible station within that range, nearest first. It is a **read-only filter+sort over existing station/charger data** (`GET /api/recommendations`, public, no side effects) — no ML, no per-user history, no persistence, and — as of this revision — no computed score of any kind. "Nearest suitable station within your range" is a fact you can verify by looking at the numbers, not an opinion produced by a formula.

## 2. The model

```
STEP 1: Get the visitor's location (required — "Use my location").
STEP 2: Get the visitor's chosen search range, km (required — no hard-coded presets; any positive number they type).
STEP 3: For every non-deleted, ACTIVE station with a real coordinate, compute real distance (haversine, src/lib/geo/distance.ts).
STEP 4: Drop any station further than the chosen range.
STEP 5: Drop any station with no real, non-deleted, non-UNAVAILABLE charger matching the requested connector (and charging mode, if the vehicle's AC/DC max was given).
STEP 6: Compute one Open/Closed label (06:00–20:00, Nepal time — see §4) and apply it to every result.
STEP 7: Sort the remaining stations by distance, nearest first (ties broken by station name only).
STEP 8: Return the list.
```

Steps 3–5 can run in either order with the same result — the implementation does the compatibility/status/coordinate filter first (cheaper, no distance math needed for a station that's already excluded), then computes distance only for what's left, then applies the range filter.

**Nothing here is a ranking factor in the old sense.** A station is either in range and compatible, or it isn't; among the stations that qualify, the only ordering rule is "closer sorts first." Rating and verification status play no role anywhere in this file — `Station.verificationStatus` isn't even selected from the database here, and no `Review` data is queried.

## 3. Vehicle input — unchanged from the original design

Two ways to supply a vehicle:

1. **`vehicleId`** — a real catalog `Vehicle` (`prisma/seed-vehicles.ts`, `GET /api/vehicles`). Its `connectors` and `maxAcPowerKw`/`maxDcPowerKw` are used directly.
2. **Manual** — `connector` (a single canonical `Connector.code`, required since compatibility can't be checked without it) plus optional `maxAcPowerKw`/`maxDcPowerKw`.

Exactly one of `vehicleId` or `connector` must be given (enforced by `src/lib/validation/recommendation.ts`); an unresolvable `vehicleId` or an unrecognized `connector` code is a `400`, not a silent empty result. `getEffectiveChargingPowerKw()` (`src/services/charging-calculator.ts`, shared with the Charging Calculator and E Sakhi Marg) still computes each station's real charging speed for display — `min(vehicle's max AC/DC acceptance for that charger's mode, charger's own power rating)` — but that number is now purely informational (shown on the card), never a score input.

## 4. Availability — a fixed operating-hours label, not real-time status

`src/lib/time/operating-hours.ts`'s `getStationOperatingStatus()`: **Open** 06:00–19:59, **Closed** 20:00–05:59, Nepal local time (`Asia/Kathmandu`, computed via `Intl.DateTimeFormat`, so it's correct regardless of the server's own timezone). This is a deliberate, simple, clearly-labeled assumption — this project has no real-time charger telemetry (see `docs/data-model.md §7`), so "Open" here never means "a charger is confirmed free right now," only "within E Sakhi's assumed opening hours." It's computed **once per request** and applied identically to every returned station — it is a function of the current time only, not of any per-station data, so seeing the same label on every card in one response is expected, not a bug.

## 5. Range and location — both required

Unlike the original design (where location was optional and distance simply didn't rank results without it), this model is meaningless without a real point to measure from — so `latitude`, `longitude`, and `rangeKm` are all required query parameters (`src/lib/validation/recommendation.ts`). The frontend (`RecommendationTool.tsx`) also validates this client-side before submitting, with a plain-language message rather than letting the request fail server-side first. `rangeKm` has no hard-coded preset values or dropdown — any positive number up to 500 km the visitor types is accepted.

A station with no confirmed coordinate is excluded outright (same rule as the map and E Sakhi Marg) — distance/range can't be honestly evaluated without a real coordinate, so it's left out rather than guessed into or out of range.

## 6. Output shape

`GET /api/recommendations` returns (via the standard `{ data, meta }` envelope, `docs/architecture.md §4`):

- `data`: every compatible station within range (capped at 100 as a safety limit, not a "top N" ranking cutoff), each with `distanceKm`, `power` (effective kW + which connector(s) + what limited it, or `null` when not on record — never guessed), and `availability` (`"OPEN"`/`"CLOSED"`, per §4 above). No `score`, no `rating`, no `verificationStatus` field exists on this type.
- `meta`: `stationsConsidered` (non-deleted stations checked), `stationsCompatible` (ACTIVE, real coordinate, connector/mode match — before the range filter), `stationsWithinRange` (the final count, equal to `data.length`), the `rangeKm` used, and the one `availability` value applied to every result.

## 7. What was removed, and why nothing else needed to change

Removing the weighted score meant deleting `src/lib/config/recommendation-weights.ts` entirely (nothing else imported it) and `station-service.ts`'s `getStationRatingsBatch()` (its only caller was this file's old rating factor — `getStationRating()`, the single-station version real reviews still use on the station detail page, is untouched). Nothing about `Review`, `VerificationStatus`, `ChargerAvailability`, or any other shared model/table changed — this was purely a change to how `recommendation-engine.ts` reads and orders that data, not to the data itself. The Charging Calculator, E Sakhi Marg, station detail pages, and admin verification tooling all still show real ratings/verification/live-charger-availability data exactly as before; only this one feature stopped using them.

## 8. Not built here (by design)

- No ML/learning, no personalization beyond the one vehicle/location/range given per request.
- No caching — every request recomputes from the live database.
- No real-time charger availability — see §4.
- No new mutation surface — purely a read over data other parts of the app already produce.
