# E Sakhi — Data Model

This document locks the relational structure for E Sakhi. It is written **before** the actual Excel dataset has been inspected (that inspection happens in Part 02), so it defines the *shape* of the schema and the meaning of every field, without assuming exact source-column names. Part 02 maps the real Excel columns onto this model — and if the real data reveals a gap in this model, this document is updated there, not silently worked around.

No Prisma schema file is created yet; this is the design that Part 02 turns into `prisma/schema.prisma` and migrations.

---

## 1. Entity Overview

```text
User ──< Favorite >── Station
User ──< Review    >── Station
User ──< Report    >── Station
Admin(User) ──< VerificationLog >── Station

Operator ──< Station

Station ──< Charger >── Connector
                 │
                 └── (charging_mode: AC | DC | UNKNOWN)

Vehicle ──< VehicleConnector >── Connector
```

Core relationship to preserve exactly, per the source dataset (~460 stations / ~517 plugs):

```text
Station
 ├── Charger  (plug 1)  → Connector, charging_mode, power_kw
 ├── Charger  (plug 2)  → Connector, charging_mode, power_kw
 └── ...
```

A station's charger/plug records are never merged into one row, and a charger never loses its individual connector/power identity during import or normalization.

---

## 2. Enums (fixed, controlled vocabularies)

Uncontrolled string variants (`"verified"`, `"Verified"`, `"yes"`, `"CCS-2"`, `"CCS 2"`, etc.) are never stored directly — every such concept is one of these enums, with raw source strings normalized into them at import time (Part 02/14).

```text
UserRole              USER | ADMIN

VerificationStatus     VERIFIED | PARTIALLY_VERIFIED | UNVERIFIED
                        | NEEDS_REVIEW | UNKNOWN | ASSUMED

StationStatus           ACTIVE | INACTIVE | UNKNOWN

ChargerAvailability     AVAILABLE | BUSY | UNAVAILABLE | UNKNOWN
                        (real-time-shaped concept; see §7 — until a live
                        data source exists, this stays UNKNOWN)

ChargingMode             AC | DC | UNKNOWN

VehicleType               CAR | SCOOTER | MOTORCYCLE | OTHER

ReportType                 WRONG_LOCATION | WRONG_CONNECTOR | WRONG_POWER
                           | STATION_UNAVAILABLE | WRONG_CONTACT
                           | DUPLICATE_STATION | OTHER

ReportStatus                PENDING | REVIEWING | RESOLVED | REJECTED
```

**Connector type is deliberately not a hard enum** — see §3.

---

## 3. Connector Model — lookup table, not an enum

Connector values need (a) a fixed canonical set today (`CCS2`, `GB/T`, `Type 2`, `CHAdeMO`, `Other`, `Unknown`) and (b) room to add more later, plus alias handling for messy source strings (`"CCS-2"`, `"CCS 2"`, `"CCS Type 2"` → `CCS2`). A Prisma enum would satisfy (a) but requires a migration for (b)/every new connector; a lookup table satisfies both without code changes, so:

```text
Connector
──────────
id            PK
code          unique, canonical short code — "CCS2", "GBT", "TYPE2", "CHADEMO", "OTHER", "UNKNOWN"
label         display label — "CCS2", "GB/T", "Type 2", "CHAdeMO", "Other", "Unknown"
created_at
updated_at

ConnectorAlias
──────────────
id            PK
connector_id  FK → Connector
alias_text    raw string this alias maps to, e.g. "CCS-2", "CCS 2", "CCS Type 2"
created_at
```

Import/normalization logic (Part 02, Part 14) looks up an incoming raw connector string against `ConnectorAlias.alias_text` (case/whitespace-insensitive) to resolve the canonical `Connector`. An unmatched raw string is imported as `Connector.code = "UNKNOWN"` and flagged for admin review — it is never dropped and never guessed into an arbitrary canonical value.

The six connector types from the spec are seeded as the initial `Connector` rows in Part 02; more can be added later by an admin (future part) or a migration without touching this model.

---

## 4. Entities

### User
```text
id                PK
name
email             unique, required
password_hash     required, never exposed via any API response
role              UserRole, default USER
created_at
updated_at
```

### Operator
```text
id           PK
name
contact
website
logo
created_at
updated_at
```

### Station
```text
id                      PK
station_id              external/source id from the initial dataset, unique where present
                        (kept distinct from the internal PK so re-imports can match on it)
station_name
operator_id             FK → Operator, nullable (operator may be unknown)
province
district
city
address
latitude                nullable Decimal — NULL means "no usable coordinates," not 0
longitude               nullable Decimal
map_url                 raw source URL/description if that's all the source data had
                        (e.g. a Google Maps search link) — not treated as a coordinate
contact
status                  StationStatus, default UNKNOWN

-- verification --
verification_status     VerificationStatus, default UNKNOWN
assumption_flag         boolean, default false — true if any field on this record
                        is a documented assumption rather than sourced fact
verification_source     text, nullable — who/what confirmed this record
last_verified            timestamp, nullable
location_verified        boolean, default false
connector_verified       boolean, default false
power_verified            boolean, default false
contact_verified          boolean, default false
availability_verified     boolean, default false

-- soft delete --
is_deleted                boolean, default false
deleted_at                 timestamp, nullable
deleted_by                  FK → User, nullable

created_at
updated_at
```

Design note: verification sub-flags live at the **station** level (matching the master spec's `STATIONS` field list) rather than being duplicated per charger. This keeps the model simple for a single-developer project; if real-world use later shows per-charger verification granularity is needed, that's an additive migration, not a redesign.

### Charger
One row per physical plug at a station — never merged.
```text
id                PK
station_id         FK → Station
plug_id             external/source plug identifier (unique within its station)
charging_mode         ChargingMode, default UNKNOWN
power_kw               nullable Decimal — the rated maximum output power of *this plug*,
                       in the unit implied by charging_mode (AC or DC). One canonical
                       power field, not separate ac/dc/max columns — see rationale below.
vehicle_type            VehicleType, nullable — set only when the source data ties a
                        specific plug to a vehicle category (e.g. a 2-wheeler-only plug)
availability             ChargerAvailability, default UNKNOWN
is_deleted                boolean, default false
deleted_at                 timestamp, nullable
deleted_by                  FK → User, nullable
created_at
updated_at
```

**Why one `power_kw` field, not `power_kw_ac`/`power_kw_dc`/`power_kw_max`:** a single charger/plug row already carries `charging_mode` (AC or DC) — a plug is one or the other, not both — so a mode-qualified power value is redundant across three columns. `power_kw` paired with `charging_mode` fully answers "what does this plug deliver." Part 02's inspection of the real dataset confirmed this: `power_kw_max` was populated on every row and always equaled whichever of `power_kw_dc`/`power_kw_ac` was non-null — no row needed more than one number.

### ChargerConnector (join table — a charger may offer more than one connector)
```text
id             PK
charger_id      FK → Charger
connector_id     FK → Connector
@@unique([charger_id, connector_id])
```

**This table did not appear in the original Part 00 design** — that version sketched a single `connector_id` FK directly on `Charger`. Part 02's inspection of the real dataset found `connector_type` values like `"CCS2;GB/T"`: a single physical plug (one `plug_id`, one `power_kw`, one `charging_mode`) that offers two connector heads. A single FK cannot represent that without either dropping one connector or fabricating a second `Charger` row for a plug that doesn't physically exist — both violate the "never merge or invent charger/plug records" rule. The many-to-many join table is the fix, and per §8 below, this is exactly the kind of real-data-driven revision this document exists to record.

### Vehicle
```text
id                    PK
brand
model
vehicle_type           VehicleType
battery_capacity_kwh    Decimal
max_dc_power_kw          Decimal, nullable
max_ac_power_kw           Decimal, nullable
created_at
updated_at
```

### VehicleConnector (join table — a vehicle may support multiple connectors)
```text
id             PK
vehicle_id      FK → Vehicle
connector_id     FK → Connector
@@unique([vehicle_id, connector_id])
```

### Favorite
```text
id           PK
user_id       FK → User
station_id     FK → Station
created_at
@@unique([user_id, station_id])
```

### Review
```text
id           PK
user_id       FK → User
station_id     FK → Station
rating          Int, 1–5 (enforced by application validation; documented as a check
                constraint to add at the database level during Part 02 migration if the
                target Postgres/Prisma version in use supports it cleanly)
comment
created_at
updated_at
@@unique([user_id, station_id])   -- one active review per user per station
```

Average rating and review count are **always computed from `Review` rows at query time** (or cached in a clearly-labeled, regenerable cache column later if performance requires it) — never hand-maintained as an independent source of truth.

### Report
```text
id              PK
user_id           FK → User
station_id         FK → Station
report_type          ReportType
description
status                ReportStatus, default PENDING
created_at
resolved_at            timestamp, nullable
```

### VerificationLog
```text
id              PK
station_id        FK → Station
admin_id           FK → User
field_changed
old_value
new_value
notes
created_at
```

Visible only to `ADMIN` sessions. Written automatically whenever an admin changes a verification-related (or otherwise significant) field on a `Station`/`Charger` — the write happens in the service layer, not left to be remembered by each call site.

---

## 5. Indexes (initial)

Finalized against the real query patterns in Part 02/04, but the model anticipates indexes on:
- `Station.province`, `Station.district`, `Station.city`, `Station.status`, `Station.verification_status`
- `Station.operator_id`, `Station.latitude`/`Station.longitude` (for bounding-box map queries)
- `Charger.station_id`, `Charger.connector_id`, `Charger.charging_mode`
- `Review.station_id`, `Favorite.user_id`
- `Report.status`

---

## 6. Data Confidence — Why This Isn't Optional

The initial dataset (~460 stations, ~517 plugs) will contain a mix of confirmed and assumed information. Nothing in this model allows an assumed value to silently present as verified:

- A station with unknown coordinates has `latitude`/`longitude` = `NULL` and is rendered as "Location unavailable" — never a fabricated or default coordinate.
- A station whose connector/power data came from an unverifiable source is imported with `verification_status = ASSUMED` or `UNVERIFIED`, not `VERIFIED`.
- `assumption_flag` exists specifically so a record can carry known-uncertain data without pretending otherwise.

## 7. Static vs. Real-Time Data

`Station.status` (operational status: ACTIVE/INACTIVE/UNKNOWN) and `Charger.availability` (AVAILABLE/BUSY/UNAVAILABLE/UNKNOWN) are **separate concepts** stored on separate fields, per the master spec. The initial system has no live telemetry feed, so `Charger.availability` is expected to sit at `UNKNOWN` for essentially all records until (if ever) a real-time integration is added — the UI must display "Availability: Unknown" rather than imply real-time accuracy it doesn't have.

---

## 8. Part 02 Addendum — What The Real Dataset Actually Looks Like

The sections above were written before the Excel file was inspected. This section records what Part 02 actually found and exactly how the source columns map to the schema — the promised update, not a hypothetical.

### 8.1 Source file

`prisma/seed-data/e-sakhi-data.xlsx` (a copy of the file the project owner supplied, committed to the repo so the seed is reproducible without depending on a path outside it — see the seed script's scope note). Two sheets:

- **`EV_Stations`** — 517 data rows, one per plug. 460 distinct `station_id` values, 517 distinct `plug_id` values — matches the ~460 stations / ~517 plugs the project brief described exactly.
- **`City_Lookup`** — 296 rows mapping locality keywords to district/province, with methodology notes (e.g. "Low-confidence keywords: ... "). This is the compiler's own working reference for how they derived the `district`/`province` columns already baked into `EV_Stations` — not itself app data. It is **not imported as a database table**; kept only as background context here. `city`/`district`/`province` in `EV_Stations` are populated with zero blanks, but per the City_Lookup notes, some are keyword-inferred rather than confirmed — one more reason the whole dataset imports as `ASSUMED`, not `VERIFIED` (§8.4).

### 8.2 Column → field mapping (`EV_Stations`)

| Source column | Maps to | Notes |
|---|---|---|
| `station_id` | `Station.station_id` | External id, e.g. `EVNP-0001`. Unique. Stations are grouped by this column — all plug-rows sharing a `station_id` become one `Station` with many `Charger` rows. |
| `plug_id` | `Charger.plug_id` | e.g. `EVNP-0001-P1`. Globally unique across the whole dataset. |
| `station_name` | `Station.station_name` | |
| `operator` | `Operator.name` (FK) | 14 distinct operators (`NEA`, `CG Motors (Neta)`, `Hyundai`, `BYD`, `Independent Host (Hotel/Resort/Restaurant)`, etc.) — upserted by name. |
| `address`, `city`, `district`, `province` | `Station.address/city/district/province` | Always populated (0 blanks), but see §8.1 — some are keyword-inferred, not surveyed. |
| `connector_type` | `Charger` ↔ `Connector` via `ChargerConnector` | Raw values: `"CCS2"` (216 rows), `"GB/T"` (94 rows), `"CCS2;GB/T"` (207 rows — a combo plug). Split on `;` **only** — a first implementation also split on `/`, which incorrectly shredded `"GB/T"` into `"GB"` + `"T"`; fixed in `src/services/connector-service.ts` before the data landed. Every token in the real dataset matches a canonical connector after normalization — zero fell through to `UNKNOWN`. |
| `charging_mode` | `Charger.charging_mode` | Clean `AC` (80 rows) / `DC` (437 rows) throughout — no blanks, no other values. |
| `power_kw_dc`, `power_kw_ac`, `power_kw_max` | `Charger.power_kw` | `power_kw_max` is populated on all 517 rows and always equals whichever of `power_kw_dc`/`power_kw_ac` is non-null (never both). Imported as `power_kw_max`, confirming the single-field design in §4. |
| `plug_count` | *(not imported)* | A per-station redundant count that always matched the actual number of plug-rows for that station (verified, 0 mismatches) — the real row count is used directly instead of trusting a separate declared total. |
| `map_url` | `Station.map_url` | **Every single one of the 517 `map_url` values is a Google Maps *text-search* link** (`.../maps/search/?api=1&query=<place name>`), never a pinned coordinate — confirmed by pattern-matching all 517 for an embedded lat/lng pair (found: 0). This is exactly the "Google Maps search URL, not an exact coordinate" case called out in the location-data rule. |
| *(none)* | `Station.latitude` / `Station.longitude` | **`NULL` for all 460 stations.** No usable coordinates exist anywhere in the source data — none were invented. See §8.5 for a real, non-fabricating way to improve this later. |
| `status` | `Station.status` | `"Listed"` (516 rows) → `UNKNOWN` (being listed by the compiler doesn't confirm operational status — that's a different claim). `"Not Available"` (1 row) → `INACTIVE`. |
| `rating` | *(not imported)* | `"Not Available"` on 516 rows, `0` on 1. Per architecture.md, station ratings are always computed from real `Review` rows, never from a static source column — so this column is intentionally ignored rather than seeded into anything. |
| `verified`, `assumption_flag`, `source`, `last_verified` | `Station.verification_status`, `assumption_flag`, `verification_source` | See §8.4 — this needed real judgment, not a 1:1 copy. |
| `contact`, `contact_best`, `contact_e164`, ... | `Station.contact` | The raw `contact` column is `"Not Available"` on every sampled row; `contact_best` carries the compiler's already-normalized phone number and is what's actually stored. The other derived columns (`contact_clean`, `contact_core`, `contact_national`, `contact_type`, `contact_format_check`) are the compiler's own working/QA columns and are not imported as separate fields — that level of per-contact provenance isn't part of the locked schema, and adding six more columns for it would be exactly the kind of unrequested field growth §9 of architecture.md warns against. |
| `contact_basis` | *(not imported directly)* | Often says things like "Operator hotline (web, not station-specific)" — i.e. many contacts are a generic operator number, not a station-specific line. This nuance is real but doesn't have a modeled field to live in; it's implicitly covered by the whole record importing as `ASSUMED`. |

### 8.3 A schema-model finding, not just a data finding

`connector_type` containing `"CCS2;GB/T"` is what forced the `ChargerConnector` many-to-many join table described in §4/§8's Charger section — see that section for the reasoning. This is the one place the real data changed the *shape* of the schema, not just how a column gets read.

### 8.4 Verification status: the source data is almost entirely self-declared as assumed

Two source columns encode confidence: `verified` (`YES`/`NO`) and `assumption_flag`. Actually inspecting them:

- `assumption_flag = 'YES'` on **all 517 rows**, with no exceptions.
- `verified = 'NO'` on 516 rows; `verified = 'YES'` on exactly one (`EVNP-0448`).

That one `verified = 'YES'` row is internally self-contradictory: the same row has `source = 'NO'` (not a real source citation), `status = 'Not Available'`, and `rating = 0` — all signs of an incomplete/garbled record, not a confirmed one. Trusting `verified = 'YES'` at face value there would mean presenting the messiest row in the whole dataset as `VERIFIED`, which is precisely what the no-fabrication rule exists to prevent.

The import rule actually implemented (`prisma/seed.ts`, `resolveVerification()`):
- `verified = 'YES'` **and** none of those contradiction signals present → `VERIFIED`. (No row in the current dataset satisfies this — it's there for future/re-imports, not because any row hit it this time.)
- `verified = 'YES'` **and** a contradiction signal present → `NEEDS_REVIEW` (this is `EVNP-0448`'s actual outcome — flagged for an admin to look at, not silently trusted or silently dropped).
- Everything else (`verified = 'NO'`, i.e. 516 of 517 rows) → `ASSUMED`, not the weaker `UNVERIFIED` — because the source isn't merely silent on confidence, it's *affirmatively saying* this is a compiled/best-guess record (`assumption_flag = YES`).

Result: **459 stations import as `ASSUMED`, 1 (`EVNP-0448`) as `NEEDS_REVIEW`, 0 as `VERIFIED`.** All five per-field `*_verified` booleans import as `false` across the board — nothing in this initial dataset is actually confirmed. `Station.last_verified` is left `NULL` for every row on import, deliberately: the source's own `last_verified` date (`2026-09-03` on 516 rows) means "compiled/reviewed on," not "confirmed accurate on," and conflating the two would be exactly the kind of silently-upgraded confidence the architecture forbids. That compile date is preserved as context inside `verification_source` instead (e.g. `"... (source-compiled 2026-09-03)"`).

### 8.5 Known follow-up, deliberately not built now

60 of the 517 `address` values look like Google Plus Codes (e.g. `XQP9+7G9, H10, Waling 33801`) — a real, decodable geocode format, not free text. Decoding these would give a real (non-fabricated) latitude/longitude for those specific stations. This is a genuine improvement opportunity, but it's a geocoding feature, not a Part 02 import concern, so it wasn't built here — flagged instead as a good candidate for a future, separately-scoped task.

### 8.6 Import is idempotent and was verified from a clean database

`prisma/seed.ts` upserts everything by external id (`Station.station_id`, `Charger.plug_id`, `Operator.name`, `Connector.code`, `ConnectorAlias.aliasText`) and was run twice with identical results, then verified again after a full `prisma migrate reset` (drop database, reapply migrations, reseed) — same 460 stations / 517 chargers / 724 charger-connector links both times. See `scripts/verify-import.ts` for the repeatable check (row counts, orphan checks, coordinate check, verification-status and connector-usage distributions).

**Scope boundary worth restating:** this seed script's `update` clauses deliberately never touch a `Station`'s verification fields or a `Charger`'s `availability` — so re-running it can't undo admin verification work done after the initial import. But it is still a *bootstrap* script, not the admin-safe merge/diff/approval tool described for Part 14. Don't point it at a database with real admin edits expecting Part-14-style conflict detection; it doesn't have any.
