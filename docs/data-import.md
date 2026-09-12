# E Sakhi — Excel Import & Update Tool

Locks the design for the admin-facing Excel re-import tool (Part 14), per `docs/architecture.md`'s instruction to write this document before implementing. Implementation must match what's written here; if reality forces a change, this document is updated in the same commit, not silently diverged from.

---

## 1. What this is (and isn't)

An admin uploads an updated copy of the source spreadsheet through the browser; the tool parses it with the **exact same column-mapping rules** `prisma/seed.ts` (Part 02) already established, computes a **diff** against the live database, and lets the admin **review and approve** changes before anything is written. Nothing is ever applied blindly.

This is **not** `prisma/seed.ts`. That script is a bootstrap tool — read a fixed local file path, upsert unconditionally, no review step (see its own docstring). It is safe *only* because, by the time this tool exists, real admins have made real verification decisions (Parts 12/13) that a blind re-import must never touch. This tool is what makes a second, third, tenth re-import of an updated spreadsheet safe against that.

This is also not a general station editor — that's `/admin/stations` (Part 12). This tool only ever proposes changes derived from an uploaded file; an admin who wants to hand-edit one field uses the existing form.

## 2. The hard rule, stated once

**This tool can never write a `Station`'s verification fields (`verification_status`, `assumption_flag`, `verification_source`, `last_verified`, the five `*_verified` booleans), a `Station`'s coordinates (`latitude`/`longitude`), or a `Charger`'s `availability` — for an *existing* record.** Not "usually doesn't," not "warns before it does" — the TypeScript type of the data this tool is capable of writing for an update **does not include those fields at all**. There is no code path, no request payload shape, no admin override that can make this tool touch them. (A brand-new station created *by* this tool does get an initial verification classification — §5 — because there's no existing admin decision to protect yet.)

This is the same principle `prisma/seed.ts` already applies to re-runs (its own `update` clauses omit these fields), made structural instead of conventional, and extended to the field this tool adds real risk around: every other station-level field (name, address, operator, ...), which a blind re-import genuinely could silently overwrite an admin's manual correction to.

## 3. Two-stage flow: Preview, then Apply

No new database table is introduced to hold "pending imports." The uploaded file is parsed and diffed in one request (`POST /api/import/preview`), which returns the full diff as JSON — nothing is written. The admin reviews it in the browser, checks which entries to approve, and the approved subset is sent back as-is in a second request (`POST /api/import/apply`), which is what actually writes. The browser holds the state between the two requests; the server holds none.

This is a deliberate simplification over a persisted "import batch" table: it needs no schema migration, no cleanup job for abandoned imports, and matches this project's standing preference for the simplest design that's still correct (`docs/architecture.md §1`). The tradeoff — accepted, not hidden — is in §8.

**Apply re-validates, it doesn't just trust the browser.** Every approved entry is checked again against the live database at apply time (does this station/charger still exist? is it still not soft-deleted?) before being written. The Zod schema for the apply request (`src/lib/validation/import.ts`) only defines the fields listed in §2 as writable — Zod's default behavior of stripping unknown object keys means even a hand-crafted request that includes a verification field is silently ignored, not rejected-then-bypassed.

## 4. What gets diffed

Reuses the identical parsing/mapping functions `prisma/seed.ts` uses, extracted into `src/services/excel-station-parser.ts` so both consumers share one implementation instead of two:

- `readStationRows()` (now Buffer-based, not just file-path-based, so an uploaded file works the same as the committed one)
- `mapStationStatus()`, `resolveVerification()`, `buildVerificationSource()`, `pickContact()`
- `groupByStation()`, `checkStationConsistency()` (surfaced as an informational banner in the review UI, not a blocker)
- Connector token resolution (`splitConnectorTokens`/`resolveConnectorToken`/`buildAliasLookup`, already shared via `src/services/connector-service.ts` since Part 02 — unchanged)

For each `station_id` group in the uploaded file:

| Case | Outcome |
|---|---|
| No `Station` with this `station_id` exists | **Create** — new station + its chargers, reviewable but always safe (nothing to lose) |
| A matching `Station` exists and is soft-deleted | **Skipped**, with the reason shown — this tool never revives a deleted station; that's a deliberate admin decision, not an import side-effect |
| A matching `Station` exists and is active | **Update** — compared field-by-field (below); only entries with at least one real change are shown |

Station fields compared for **update** (identical set to what `prisma/seed.ts`'s own re-run already touches): `stationName`, `province`, `district`, `city`, `address`, `contact`, `mapUrl`, `status`, and `operator` (by name, upserted — see below). Excluded, permanently: every field in §2.

**Operator matches `prisma/seed.ts`'s existing asymmetry exactly, not a new rule:** if the uploaded row's `operator` cell is blank, the station's current operator (however it got there — original import or an admin's manual edit) is left alone entirely, never cleared. If the row names an operator, it's upserted by name (`operator-service.ts`'s `resolveOrCreateOperatorId()`, reused by both this tool and, eventually, anything else that needs the same "find or create by name" operation) and compared against the current one.

Chargers are compared the same way, matched by `plug_id`: **create** if the plug id is new, **update** if it exists (comparing `chargingMode`/`powerKw`/`connectorCodes`; `availability` is excluded — same reasoning as `Station`'s verification fields), **skipped with a reason** if the plug id already belongs to a *different* station in the database (this tool never reassigns a charger between stations — the same rule Part 12's charger edit form already enforces by simply not exposing `stationId` as an editable field).

`mapUrl` is intentionally validated leniently on import (any non-empty string, not a strict URL), matching `prisma/seed.ts`'s own original behavior — the source spreadsheet's `map_url` column is a free-text-ish field in practice (see `docs/data-model.md §8.2`), and this tool's job is staying faithful to what the bootstrap import already accepted, not introducing new validation that legacy rows might fail. (Unrelated: the *admin manual-edit* form, `/admin/stations/[id]/edit`, does apply strict URL validation to `mapUrl` — a separate, stricter surface for a human typing a fresh value, not for re-syncing from the same messy source this dataset has always had.)

## 5. Creating a genuinely new station

A station with no existing database match has no admin verification decision to protect — it gets exactly the same honest classification `prisma/seed.ts` already gives every row on first import: `resolveVerification()`/`buildVerificationSource()` run on the row, producing `VERIFIED`/`NEEDS_REVIEW`/`ASSUMED` (never a default "trusted" status) plus a real verification source string. Coordinates are `NULL` (the source has none — never invented).

## 6. Applying — reuses existing mutation functions, adds none

`POST /api/import/apply` does not contain new station/charger-writing logic. For each approved entry it calls the **same** functions Parts 04/12 already built and already tested: `createStation()`/`updateStation()` (`src/services/station-service.ts`) and `createCharger()`/`updateCharger()` (`src/services/charger-service.ts`). `updateStation()`'s existing "diff old vs. new, write to `VerificationLog` only for changed verification fields" behavior is untouched — since this tool's update payload never includes those fields, it naturally writes nothing to `VerificationLog`, with no special-casing required. This is the concrete meaning of "structural, not conventional" in §2: the guarantee comes from never handing those fields to `updateStation()` in the first place, not from a check inside it.

## 7. What the review UI shows

Grouped into three sections — **New stations**, **Updated stations**, **Skipped** — each entry a card:

- Station name, external `station_id`, and (for updates) a caution badge if the station's current `verificationStatus` is `VERIFIED` or `PARTIALLY_VERIFIED` — informational only (the fields that made it so are never at risk, but a human reviewing a field change on an already-verified station benefits from that context).
- Every changed field as old → new (reusing the same visual pattern `VerificationLogTable` already established for exactly this shape of information).
- Charger creates/updates nested under their station.
- A per-entry checkbox (default checked) plus select-all/none; only checked entries are sent to Apply.
- A consistency-issue banner at the top when `checkStationConsistency()` found rows for the same `station_id` disagreeing with each other in the uploaded file (informational — the first row's value is what's used, matching `prisma/seed.ts`).
- After Apply: a per-entry result (`applied` / `skipped, with reason` / `failed, with reason`) — never a silent bulk "done."

## 8. Known follow-up, deliberately not built now

**No optimistic-concurrency check between Preview and Apply.** If a station is edited by an admin (or by a second concurrent import) in the window between generating a preview and approving it, Apply re-validates existence/deletion state (§3) but does not detect "the value changed out from under this specific field." At this project's real scale (one or two admins, infrequent re-imports) the risk is low and the failure mode is mild (the field gets set to what the approved diff said, which the admin did look at, just possibly a few minutes stale) — but it's a real, known gap, not an oversight. A future version could carry an "expected old value" per field and skip-with-warning if the live value no longer matches, the same shape of protection `updateStation()`'s own diff-against-current-value logic already has for a single request.

**No handling for stations present in the database but absent from the new upload.** This tool never deletes or flags-as-missing; an admin who wants a station gone still uses `/admin/stations`' existing soft-delete. Treating "not in this file" as "should be removed" would be a dangerous inference from an admin who may have simply uploaded a partial or regional update.

**`City_Lookup` (the second sheet) is still not imported** — same boundary Part 02 already drew (`docs/data-model.md §8.1`); it's the original compiler's own working reference, not app data.
