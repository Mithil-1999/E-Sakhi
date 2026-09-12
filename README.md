# E Sakhi

**Find. Charge. Go.**

E Sakhi is a smart Electric Vehicle (EV) charging-station discovery and recommendation platform focused primarily on Nepal. It helps EV drivers find charging stations, understand which chargers actually fit their vehicle, estimate charging time, and get station recommendations that account for compatibility, distance, power, availability, rating, and how well-verified the station's data actually is.

> **Status:** early development (through Part 10 — user dashboard & favorites). The project foundation, database schema, the real initial dataset (460 stations / 517 chargers), auth, the station/charger/operator/vehicle/favorites API, an interactive Nepal map, a full search/filter station list, station detail pages, a charging calculator, multi-factor station recommendations, and real per-user favorites (`/dashboard`, `/my-favorites`) are live; reviews and admin tooling are not built yet. See [Development Roadmap](#development-roadmap) for what's actually implemented today.

---

## Why E Sakhi

Nepal's EV charging landscape is growing quickly and unevenly documented — station lists circulate as spreadsheets and word of mouth, connector and power information is often incomplete or unverified, and there's no single place to check "will this station actually charge my vehicle, and how long will it take." E Sakhi is built to be that place, starting from a real but imperfect initial dataset (~460 stations, ~517 charger/plug records) and improving it over time through admin verification and user reporting — rather than waiting for perfect data before shipping anything useful.

## Main Features (planned)

- Interactive map of EV charging stations across Nepal, with search and filters (connector, charging mode, power range, vehicle type, status).
- Station detail pages: chargers, connectors, power, operator, contact, verification status, reviews.
- A charging calculator: pick a vehicle, enter current and target battery %, get the energy required and an estimated charging time.
- A recommendation engine that ranks stations by compatibility, distance, effective charging power, availability (when known), rating, and data verification quality — not just "nearest station."
- User accounts: favorites, reviews, and the ability to report incorrect station information.
- Admin tools: station/charger/operator management, data verification workflow, an Excel import pipeline with conflict detection, and report moderation.

## Data Honesty

E Sakhi does **not** claim its dataset is fully verified. The initial data came from a spreadsheet compiled from available sources and is a mix of confirmed and assumed information — some coordinates, connectors, or power ratings may be estimated, outdated, or unverified. Rather than hiding this, every station carries an explicit, visible verification status (`Verified`, `Partially Verified`, `Unverified`, `Needs Review`, `Unknown`, or `Assumed`), and the platform is designed to improve this data progressively through admin verification and user-submitted reports — never by silently presenting a guess as a fact. See [docs/data-model.md](docs/data-model.md) for the full verification model.

Similarly, charger **availability** shown by the app reflects known/static information only. E Sakhi does not claim real-time charger availability unless a genuine real-time data source is connected in a future phase; until then, availability is honestly labeled "Unknown" rather than implied.

## Technology Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend:** Next.js Route Handlers & Server Actions, with business logic in a dedicated service layer
- **Database:** PostgreSQL + Prisma ORM
- **Authentication:** Auth.js (NextAuth v5), Credentials provider, bcrypt password hashing, `USER`/`ADMIN` roles enforced server-side
- **Maps:** Leaflet + `react-leaflet` over OpenStreetMap-compatible tiles, behind a swappable provider abstraction

Full rationale and conventions: [docs/architecture.md](docs/architecture.md).

## Architecture at a Glance

```text
Next.js App (App Router)
 ├── Public pages: home, map, search, station details, charging calculator, recommendations
 ├── Auth pages: login, register
 ├── User pages: dashboard, favorites, profile        (protected — USER/ADMIN)
 ├── Admin pages: /admin/**                            (protected — ADMIN only)
 └── API (Route Handlers) ── Service layer ── Prisma ── PostgreSQL
```

Business logic (charging math, recommendation scoring, connector normalization, import matching) lives in `src/services/`, never inside React components. Every sensitive action is authorized **server-side**, regardless of what the UI hides. Full detail: [docs/architecture.md](docs/architecture.md).

## Database Overview

Core relationship — a station has many chargers/plugs, and this relationship is never collapsed:

```text
Station
 ├── Charger (plug 1) → Connector, charging_mode, power_kw
 ├── Charger (plug 2) → Connector, charging_mode, power_kw
 └── ...
```

Plus `Operator`, `Vehicle` (with multi-connector compatibility), `User`, `Favorite`, `Review`, `Report`, and `VerificationLog` for admin audit history. Full schema design: [docs/data-model.md](docs/data-model.md).

## Getting Started

Prerequisites: Node.js 20+, PostgreSQL 16+ (developed against 17).

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL and AUTH_SECRET at minimum
npx prisma migrate dev
npm run db:seed
npm run dev
```

`npm run dev` currently serves the home page, a working `/map`, `/stations` (search/filters), `/stations/[id]` (station details), `/charging-calculator`, `/recommendations`, `/dashboard`, and `/my-favorites`, plus `/login`, `/register`, `/profile`, and `/admin` (stub). Reviews and admin tooling aren't built yet.

### Environment Variables

See `.env.example` for the full list with placeholder values. Required for local dev:

```text
DATABASE_URL=   # PostgreSQL connection string, e.g.
                # postgresql://postgres:postgres@localhost:5432/e_sakhi?schema=public
AUTH_SECRET=    # Auth.js session-signing secret — generate with:
                # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`NEXT_PUBLIC_MAP_TILE_URL` powers the `/map` page (Part 05) — it defaults to the public `tile.openstreetmap.org` endpoint if left blank, so it's optional for local dev too, but set it explicitly before deploying anywhere with real traffic (OpenStreetMap's public tile server has a usage policy that doesn't cover production apps). No real secrets are ever committed — `.env` / `.env.local` are git-ignored; `.env.example` documents variable names only.

**Note on Prisma 7:** the database connection is configured in `prisma.config.ts` (which reads `DATABASE_URL`) rather than in `prisma/schema.prisma` — Prisma 7 moved connection config out of the schema file. The Prisma Client is constructed with an explicit `@prisma/adapter-pg` driver adapter (see `src/lib/db/prisma.ts`), not an implicit URL.

### Excel Data Import

The initial dataset (460 stations / 517 plugs, exactly matching the project brief) is imported from `prisma/seed-data/e-sakhi-data.xlsx` — a committed copy of the source spreadsheet, so `npm run db:seed` is reproducible without depending on a path outside the repo. The mapping from source columns to database fields, and every judgment call involved (verification-status resolution, the `CCS2;GB/T` combo-connector finding, why coordinates are `NULL` for every station, etc.), is documented in [docs/data-model.md §8](docs/data-model.md#8-part-02-addendum--what-the-real-dataset-actually-looks-like).

`prisma/seed.ts` is idempotent (safe to re-run) and never overwrites a station's verification fields or a charger's availability on re-run — but it is a *bootstrap* script, not the admin-facing conflict-detection/approval tool described for Part 14. Verify a fresh import with `npm run db:verify`.

### Authentication

Auth.js (NextAuth v5) with a Credentials provider, `bcryptjs` password hashing, and JWT sessions. There is no public sign-up path to the `ADMIN` role — `/register` always creates a `USER`. Create (or promote) the first administrator with:

```bash
# Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in .env first
npm run db:create-admin
```

Safe to re-run: if that email already has an account, it's promoted to `ADMIN` without touching its password; otherwise a new `ADMIN` account is created. Route protection lives in `src/proxy.ts` — note that's Next.js 16's renamed `middleware.ts` convention (see `docs/architecture.md §3`), not a typo.

### Station API

All station data is served from the database through these endpoints — nothing is hard-coded in components. Full list responses use the `{ data, meta }` envelope, errors use `{ error: { message, code } }` (`docs/architecture.md §4`).

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/stations` | Public | Paginated (`page`, `pageSize`, max 100), filterable by `search`, `province`, `district`, `city`, `operatorId`, `status`, `verificationStatus`, `connector`, `chargingMode`, `powerBucket`, `vehicleType`, `availability` (the last three added in Part 06). Excludes soft-deleted stations unless the caller is an authenticated `ADMIN` and passes `includeDeleted=true` (silently ignored otherwise). |
| `GET /api/stations/[id]` | Public | `[id]` is the internal `Station.id`, not the source `station_id` (e.g. `EVNP-0001`). Includes full chargers/connectors and a `rating` computed live from `Review` rows (always `{ average: null, count: 0 }` until Part 15 adds reviews). |
| `POST /api/stations` | `ADMIN` | Creates a station. Coordinates are never invented — omit `latitude`/`longitude` rather than guessing. |
| `PUT /api/stations/[id]` | `ADMIN` | Partial update (send only the fields you're changing). Any verification-field change is written to `VerificationLog` automatically, in the same transaction. |
| `DELETE /api/stations/[id]` | `ADMIN` | Soft delete only (`is_deleted`/`deleted_at`/`deleted_by`) — also soft-deletes that station's chargers. Returns the updated (now-deleted) station rather than `204`. |
| `GET /api/chargers` | Public | Read-only; filterable by `stationId`, `connector`, `chargingMode`. Charger/operator mutation endpoints arrive with admin station management (Part 12). |
| `GET /api/operators` | Public | Read-only; includes each operator's active station count. |
| `GET /api/vehicles` | Public | Read-only; optional `vehicleType` filter. Serves the seeded reference vehicle catalog (Part 08) that powers the charging calculator. |
| `GET /api/recommendations` | Public | Read-only, `vehicleId` or manual `connector`/`maxAcPowerKw`/`maxDcPowerKw`, optional `latitude`/`longitude`, `limit` (max 50). Ranks real stations for a vehicle — see [docs/recommendation-engine.md](docs/recommendation-engine.md). |
| `GET /api/favorites` | Signed-in | Lists the current session's favorited stations. |
| `POST /api/favorites` | Signed-in | Body `{ stationId }`. Idempotent — favoriting an already-favorited station just succeeds. |
| `DELETE /api/favorites/[stationId]` | Signed-in | Unfavorites a station. Idempotent — succeeds even if it wasn't favorited. `userId` always comes from the session, never from client input (`docs/architecture.md §3`). |

### Testing the API

```bash
curl "http://localhost:3000/api/stations?search=Kathmandu&pageSize=5"
curl "http://localhost:3000/api/stations/<id>"
```

Mutating endpoints need an authenticated `ADMIN` session cookie — easiest to test by logging in through the browser at `/login` and using the same browser tab's `fetch()` (devtools console), since Auth.js's Credentials sign-in needs a CSRF token round-trip that a plain `curl -d` won't do for you.

### Interactive Map

`/map` renders every non-deleted station matched by the current filters, using `GET /api/stations` — nothing hard-coded. Only stations with confirmed `latitude`/`longitude` get a marker; as of this dataset that's **0 of 460** (see [docs/data-model.md §8](docs/data-model.md#8-part-02-addendum--what-the-real-dataset-actually-looks-like) for why), and the map says so plainly rather than hiding the gap. Markers cluster via `react-leaflet-cluster`; a popup shows name, operator, city, connector(s), power, status, and the verification badge, with a "View Details" link to `/stations/[id]` (the real station detail page — Part 07). "Use my location" falls back to a clear message and a manual "Nepal view" recenter button if geolocation is denied or unsupported.

All Leaflet-specific code is isolated in `src/components/map/MapProvider.tsx` (see `docs/architecture.md §6`) — swapping tile/map providers later means editing one file, not hunting through feature code.

### Search + Filters

`/stations` is a fully server-rendered, URL-driven search page — every filter change navigates to a new `?...` URL (debounced for free-text search), so results, filters, and pagination are all shareable/bookmarkable links, not client-side-only state. It's built on the same `listStations()` service Part 04's API uses (see `docs/architecture.md §4` for why it calls the service directly rather than fetching its own API route), extended with three filters Part 04 deliberately deferred:

- **Power range** — the five fixed buckets from the project brief (`src/lib/config/power-buckets.ts`), plus "Unknown" for a charger with no recorded power rather than a silent default.
- **Vehicle type** and **Availability** — real filters against real schema fields, honest about current data: no charger in the seeded dataset has a vehicle type or a non-"Unknown" availability yet (no real-time source is connected), so selecting either correctly returns zero results today rather than something fabricated.

Try it: [`/stations?province=Bagmati`](http://localhost:3000/stations?province=Bagmati) (171 matches), [`/stations?powerBucket=60_TO_120`](http://localhost:3000/stations?powerBucket=60_TO_120) (35 matches — a real, populated range, unlike vehicle/availability).

### Station Details

`/stations/[id]` (linked from every station card, map popup, and search result) shows a station's full record: address/province/district/city, an embedded single-station map (only rendered when real coordinates exist — "Location unavailable" otherwise, never a guessed pin), every charger with connector(s)/mode/power/availability, contact, status, live-computed rating, and the full verification picture (status, source, last-verified date, per-field verified checklist). Navigate/Call only appear when real coordinates/contact exist; Favorite and Report Incorrect Information are honestly inert stubs (disabled with an explanatory tooltip) until Parts 10/15 build them for real.

### Charging Calculator

`/charging-calculator` estimates the energy and time needed to charge a vehicle at a given charger. All math lives in `src/services/charging-calculator.ts` (pure functions, no database access) — the page only collects input and renders the result:

- **Vehicle** — pick from a small seeded reference catalog of real EVs sold in Nepal (`prisma/seed-vehicles.ts`; currently cars only — see that file for why scooters/motorcycles aren't guessed at), or enter any vehicle's own battery capacity/AC/DC power manually.
- **Charger** — search real stations (reuses `GET /api/stations` and `GET /api/stations/[id]`, same endpoints as `/map`/`/stations`) and pick one of its real chargers, or enter a charging mode/power manually.
- **Estimate** — energy required is always computable from battery capacity alone; a time estimate is only shown when both the vehicle's max power for that charging mode *and* the charger's power rating are on record — otherwise the gap is stated plainly instead of guessing. Every estimate carries a caveat: it assumes constant charging power, while real charging (especially DC fast charging) typically tapers above ~80%.

`GET /api/vehicles` (public, optional `vehicleType` filter) serves the same catalog the calculator uses.

### Recommendations

`/recommendations` ranks real, compatible stations for a vehicle — not just the nearest one. Full model locked in [docs/recommendation-engine.md](docs/recommendation-engine.md); in brief:

1. **Hard eligibility first**: a station is excluded outright (not scored low) unless it has a non-deleted charger whose connector matches the vehicle, isn't confirmed unavailable, and the station itself isn't confirmed inactive.
2. **Weighted scoring second**, over five factors (power/distance/rating/verification/availability) via one config object (`src/lib/config/recommendation-weights.ts`) — an unknown value always scores neutral-low, never as if it were good data.
3. **Honest about today's data**: every one of the 460 seeded stations has `NULL` coordinates and there are no reviews yet, so distance/rating (and, per `docs/data-model.md §7`, availability) can't meaningfully differentiate results today — the summary banner on `/recommendations` states that with live counts (never a hard-coded claim), and compatibility + charging speed (reusing `getEffectiveChargingPowerKw()` from the Part 08 calculator) end up doing most of the ranking work until more data exists.

`GET /api/recommendations` (public, `vehicleId` *or* manual `connector`/`maxAcPowerKw`/`maxDcPowerKw`, optional `latitude`/`longitude`) returns each result's full per-factor breakdown, not just a bare score.

### Dashboard & Favorites

Real per-user favorites (Part 10) — the `Favorite` model has existed since Part 02; this is the part that gives it a UI. Toggle a favorite from a station's detail page (replacing the disabled stub Part 07 left there) or directly from a station card on `/stations`, `/dashboard`, or `/my-favorites` — a small heart icon that requires no page reload (`src/components/features/FavoriteButton.tsx`). Signed out, the same control is a real link to `/login?callbackUrl=...`, not a fake-working button.

- **`/dashboard`** — a light, signed-in landing hub: a favorites preview (first 3) plus quick links to the rest of the app. It doesn't duplicate `/profile`'s account fields or `/my-favorites`' full grid; it links to both.
- **`/my-favorites`** — the full list, reusing `StationCard` rather than a second rendering of the same data. Unfavoriting a card removes it from the list immediately (local client state seeded from the server-fetched list, not a full page refresh).
- **Ownership is structural, not just checked** — every mutation derives `userId` from the authenticated session (`requireUserForApi()`) and never reads it from the request; a client literally cannot submit a `userId` for `POST`/`DELETE /api/favorites`, satisfying `docs/architecture.md §3`'s ownership rule by construction, not just by a runtime check that could be forgotten later.
- Both `POST` (favorite) and `DELETE` (unfavorite) are idempotent — clicking twice, or a retried request, never errors.

## Development Roadmap

Built incrementally, in the order below. Each part is tested, committed, and left in a runnable state before the next begins.

- [x] **Part 00** — Architecture and requirements lock *(this document + `docs/architecture.md` + `docs/data-model.md`)*
- [x] **Part 01** — Project foundation (Next.js app, layout, home page)
- [x] **Part 02** — Database schema + Excel dataset import *(460 stations / 517 chargers seeded; see `docs/data-model.md §8`)*
- [x] **Part 03** — Authentication *(Auth.js v5, Credentials + bcryptjs, `/login` `/register` `/profile`, role-based route protection)*
- [x] **Part 04** — Station API *(GET/POST `/api/stations`, GET/PUT/DELETE `/api/stations/[id]`, GET `/api/chargers`, GET `/api/operators` — paginated, filterable, admin-only mutations, soft delete, verification audit log)*
- [x] **Part 05** — Interactive map *(Leaflet/react-leaflet behind a single provider wrapper, clustering, filters, geolocation with manual fallback, honest "0 confirmed locations" messaging)*
- [x] **Part 06** — Search + filters *(server-rendered, URL-driven `/stations` search; power-range/vehicle-type/availability filters added to the Part 04 API; station cards; pagination)*
- [x] **Part 07** — Station details *(`/stations/[id]`, embedded single-station map, full verification detail, honest Navigate/Call/Favorite/Report actions)*
- [x] **Part 08** — Charging calculator *(`/charging-calculator`, `src/services/charging-calculator.ts`, seeded reference vehicle catalog, real-station-charger lookup)*
- [x] **Part 09** — Smart recommendation engine *(`/recommendations`, `src/services/recommendation-engine.ts`, hard eligibility + weighted scoring over compatibility/distance/power/rating/verification/availability — model locked in `docs/recommendation-engine.md`)*
- [x] **Part 10** — User dashboard & favorites *(`/dashboard`, `/my-favorites`, real favorite/unfavorite from the station detail page and station cards, `GET/POST /api/favorites`, `DELETE /api/favorites/[stationId]`, ownership always derived from the session — never a client-submitted user id)*
- [ ] Part 11 — Admin dashboard
- [ ] Part 12 — Admin station management
- [ ] Part 13 — Data verification dashboard
- [ ] Part 14 — Excel import/update tool
- [ ] Part 15 — Reviews + reports
- [ ] Part 16 — Final testing, security review, polish

## Future Features (not yet implemented, by design)

Real-time charger availability, operator APIs, payment/booking, charging-session tracking, electricity-cost calculation, route planning, push notifications, a mobile app, a station-owner portal, QR codes, and user-submitted stations are all explicitly **out of scope** until requested — the architecture is written so they can be added later without a rebuild, not so they're half-built now.

## Security Considerations

- Passwords are hashed (bcrypt), never stored or logged in plaintext.
- Every sensitive server action re-checks authentication and role/ownership server-side — the frontend is never the authorization boundary.
- Admin-only data (verification logs, audit history, other users' data) is never exposed through user-facing APIs.
- No secrets are committed; all configuration is environment-variable driven.
- Prisma is used for all database access — no hand-built SQL string concatenation with user input.

Full checklist (applied progressively, finalized in Part 16): see [docs/architecture.md](docs/architecture.md).

---

*E Sakhi — Find. Charge. Go.*
