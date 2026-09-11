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
One row per physical plug/connector at a station — never merged.
```text
id                PK
station_id         FK → Station
plug_id             external/source plug identifier (unique within its station)
connector_id         FK → Connector
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

**Why one `power_kw` field, not `power_kw_ac`/`power_kw_dc`/`power_kw_max`:** a single charger/plug row already carries `charging_mode` (AC or DC) — a plug is one or the other, not both — so a mode-qualified power value is redundant across three columns. `power_kw` paired with `charging_mode` fully answers "what does this plug deliver." If the real Excel dataset (inspected in Part 02) turns out to genuinely need multiple simultaneous power ratings for one physical connector, that finding — and the resulting schema change — is documented in Part 02, not assumed here.

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

## 8. Deferred to Part 02

This document defines shape and meaning. Part 02 additionally:
- Inspects the actual Excel file's sheets/columns and documents exactly how each source column maps to the fields above.
- Writes the real `prisma/schema.prisma` and initial migration from this design.
- Seeds the canonical `Connector`/`ConnectorAlias` rows.
- Builds the repeatable import/seed script and reports on duplicates, missing values, and any structural surprises the real data reveals.
