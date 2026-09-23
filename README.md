# E Sakhi

**हर यात्रा मे अहाँक संग**

E Sakhi is a smart Electric Vehicle (EV) charging-station discovery and recommendation platform focused primarily on Nepal. It helps EV drivers find charging stations, understand which chargers actually fit their vehicle, estimate charging time, and get station recommendations that account for compatibility, distance, power, availability, rating, and how well-verified the station's data actually is.

> **Status:** feature-complete through Part 16 (final testing, security review, polish — the last planned part), plus later addenda. The project foundation, database schema, the real initial dataset (460 stations / 517 chargers), auth, the station/charger/operator/vehicle/favorites API, an interactive Nepal map, station detail pages, a charging calculator, multi-factor station recommendations, an EV journey/route planner (`/marg`), real per-user favorites (`/dashboard`, `/my-favorites`), a live admin overview (`/admin`), real admin station/charger management (`/admin/stations`), a dedicated verification workflow (`/admin/verification`), a diff/approve Excel re-import tool (`/admin/import`), real reviews and a report-triage queue (`/admin/reports`) are all live. (The original `/stations` search/filter list was later removed by product decision — see "Search + Filters" below — in favor of `/map` and `/marg` as the two ways to discover stations.) See [Development Roadmap](#development-roadmap) for the full build history.

---

## Why E Sakhi

Nepal's EV charging landscape is growing quickly and unevenly documented — station lists circulate as spreadsheets and word of mouth, connector and power information is often incomplete or unverified, and there's no single place to check "will this station actually charge my vehicle, and how long will it take." E Sakhi is built to be that place, starting from a real but imperfect initial dataset (~460 stations, ~517 charger/plug records) and improving it over time through admin verification and user reporting — rather than waiting for perfect data before shipping anything useful.

## Main Features (planned)

- Interactive map of EV charging stations across Nepal, with search and filters (connector, charging mode, power range, vehicle type, status).
- Station detail pages: chargers, connectors, power, operator, contact, verification status, reviews.
- A charging calculator: pick a vehicle, enter current and target battery %, get the energy required and an estimated charging time.
- A recommendation engine that ranks stations by compatibility, distance, effective charging power, availability (when known), rating, and data verification quality — not just "nearest station."
- E Sakhi Marg: an EV journey planner — enter a starting point and destination and get a real driving route with charging checkpoints along the way, not just the single nearest charger.
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

## Project Structure

E Sakhi is a **Next.js full-stack app** — frontend and backend are not two separate servers/folders, they're two layers of one codebase, which is the standard architecture for a Next.js (App Router) project. There is nothing "missing" or "external": every page, every API endpoint, every database query, and every style rule is a real file inside `src/`, committed to this repo, and runs from the one `npm run dev` command below.

```text
e-sakhi/
├── prisma/                      # DATABASE layer
│   ├── schema.prisma             # Models/tables (Station, Charger, Vehicle, User, ...)
│   ├── migrations/               # Every schema change, in order, applied via `prisma migrate`
│   ├── seed.ts, seed-vehicles.ts # Seed scripts — load the real dataset into a fresh database
│   └── seed-data/                # The committed source Excel workbook
│
├── src/
│   ├── app/                      # FRONTEND (pages) + BACKEND (API), Next.js App Router convention
│   │   ├── page.tsx, layout.tsx, .../page.tsx   # Every route the browser renders (frontend)
│   │   ├── admin/**                              # Admin-only pages (frontend, route-protected)
│   │   └── api/**/route.ts                       # Every backend API endpoint (see table below) —
│   │                                                each route.ts's GET/POST/PUT/DELETE exports
│   │                                                ARE the backend, no separate server needed
│   │
│   ├── components/               # FRONTEND — React components
│   │   ├── ui/                    # Small generic building blocks (Button, Container, ...)
│   │   ├── layout/                # Header, Footer
│   │   ├── map/                   # Leaflet map wrapper
│   │   └── features/              # Page-specific components (StationCard, filters, admin forms, ...)
│   │
│   ├── services/                 # BACKEND — business logic (station/charger/vehicle/recommendation/
│   │                                charging-calculator/import/report/review services). API routes
│   │                                stay thin wrappers around these; a Server Component page can
│   │                                also call them directly (see docs/architecture.md §4).
│   │
│   ├── lib/                      # BACKEND (+ shared) — cross-cutting code
│   │   ├── auth/                  # Auth.js config, session helpers, route-protection guards
│   │   ├── db/                    # Prisma client singleton, Decimal→number serialization
│   │   ├── validation/            # Zod schemas — every API input is validated here
│   │   ├── api/                   # Shared JSON response helpers ({ data, meta } / { error })
│   │   ├── config/                # Canonical lookup lists (provinces, power buckets, ...)
│   │   └── geo/                   # Haversine distance helper
│   │
│   └── types/                     # Shared TypeScript types the frontend imports (never imports
│                                     "server-only" backend code, just the shapes it returns)
│
├── public/                       # Static assets (currently empty — no custom images are used;
│                                    icons come from the lucide-react component library)
├── scripts/                      # One-off admin scripts (create-admin, verify-import)
├── .env.example                  # Every environment variable this project uses, documented
├── package.json                  # Single package.json — one `npm install` for the whole app
└── prisma.config.ts               # Prisma 7's connection config (see note below)
```

**Why one project, not `frontend/` + `backend/` folders:** in Next.js's App Router, a page (`page.tsx`) and its API (`api/.../route.ts`) live in the same `src/app` tree by framework convention, share the same TypeScript types, the same `npm install`, and the same dev server — splitting them into separate folders/servers would mean duplicating types, running two servers for one app, and fighting the framework rather than using it. This is the same architecture Vercel (Next.js's creator), and most modern full-stack JS/TS projects, use in production. Everything your supervisor would look for — real API endpoints, real database queries, real validation, real auth — is present; it's just organized by Next.js's `app/` and `api/` convention instead of a `frontend/`/`backend/` folder split.

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

Prerequisites: Node.js 20+, PostgreSQL 16+ (developed against 17), npm.

**One server, one terminal, one command** — this is a single Next.js app, not a separate frontend server and backend server, so there is only one `npm install` and one `npm run dev` to run, not two:

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL and AUTH_SECRET at minimum
npx prisma migrate dev
npm run db:seed
npm run dev
```

Then open **http://localhost:3000** in a browser — that single dev server serves every page (frontend) and every `/api/*` endpoint (backend) at once.

`npm run dev` serves the home page, a working `/map`, `/marg` (the EV journey planner), `/stations/[id]` (station details, real reviews, and a report flow), `/charging-calculator`, `/recommendations`, `/dashboard`, `/my-favorites`, plus `/login`, `/register`, `/profile`, a real `/admin` overview dashboard, admin station/charger management at `/admin/stations`, a verification workflow at `/admin/verification`, an Excel re-import tool at `/admin/import`, and a report-triage queue at `/admin/reports`.

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

`prisma/seed.ts` is idempotent (safe to re-run) and never overwrites a station's verification fields or a charger's availability on re-run — but it is a *bootstrap* script, not the admin-facing conflict-detection/approval tool. That tool is `/admin/import` (Part 14, see below) — its parsing/mapping logic is shared with this script (`src/services/excel-station-parser.ts`), not a second implementation. Verify a fresh import with `npm run db:verify`.

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
| `GET /api/stations/[id]` | Public | `[id]` is the internal `Station.id`, not the source `station_id` (e.g. `EVNP-0001`). Includes full chargers/connectors and a `rating` computed live from real `Review` rows (Part 15). |
| `GET /api/stations/nearby` | Public | Query `latitude`, `longitude`, optional `limit` (max 20, default 5). Straight-line-distance lookup over stations with a confirmed coordinate only — powers the Charging Calculator's "Find stations near me". Distinct from `/api/recommendations`: no vehicle input, no compatibility scoring, just distance. |
| `POST /api/stations` | `ADMIN` | Creates a station. Coordinates are never invented — omit `latitude`/`longitude` rather than guessing. |
| `PUT /api/stations/[id]` | `ADMIN` | Partial update (send only the fields you're changing). Any verification-field change is written to `VerificationLog` automatically, in the same transaction. |
| `DELETE /api/stations/[id]` | `ADMIN` | Soft delete only (`is_deleted`/`deleted_at`/`deleted_by`) — also soft-deletes that station's chargers. Returns the updated (now-deleted) station rather than `204`. |
| `GET /api/chargers` | Public | Read-only; filterable by `stationId`, `connector`, `chargingMode`. |
| `POST /api/chargers` | `ADMIN` | Creates a charger on an existing station. `connectorCodes` must each name a real `Connector` row (Part 12). |
| `PUT /api/chargers/[id]` | `ADMIN` | Partial update. Providing `connectorCodes` re-syncs the charger's full connector set (deletes and recreates), not a merge. |
| `DELETE /api/chargers/[id]` | `ADMIN` | Soft delete only, same rule as stations. |
| `GET /api/operators` | Public | Read-only; includes each operator's active station count. |
| `GET /api/vehicles` | Public | Read-only; optional `vehicleType` filter. Serves the seeded reference vehicle catalog (Part 08) that powers the charging calculator. |
| `GET /api/recommendations` | Public | Read-only, `vehicleId` or manual `connector`/`maxAcPowerKw`/`maxDcPowerKw`, optional `latitude`/`longitude`, `limit` (max 50). Ranks real stations for a vehicle — see [docs/recommendation-engine.md](docs/recommendation-engine.md). |
| `GET /api/favorites` | Signed-in | Lists the current session's favorited stations. |
| `POST /api/favorites` | Signed-in | Body `{ stationId }`. Idempotent — favoriting an already-favorited station just succeeds. |
| `DELETE /api/favorites/[stationId]` | Signed-in | Unfavorites a station. Idempotent — succeeds even if it wasn't favorited. `userId` always comes from the session, never from client input (`docs/architecture.md §3`). |
| `POST /api/import/preview` | `ADMIN` | Multipart upload (`file`, an `.xlsx`). Read-only — parses and diffs against the live database, writes nothing. See [docs/data-import.md](docs/data-import.md). |
| `POST /api/import/apply` | `ADMIN` | JSON body of admin-approved entries (as returned by the preview call). Writes only via the existing station/charger mutation functions — never a station's verification fields, coordinates, or a charger's availability. |
| `GET /api/stations/[id]/reviews` | Public | Lists a station's reviews, most-recently-updated first. |
| `POST /api/stations/[id]/reviews` | Signed-in | Body `{ rating, comment }`. Upsert — creates or updates the caller's own review for this station (one per user per station). |
| `DELETE /api/stations/[id]/reviews` | Signed-in | Deletes the caller's own review for this station. Idempotent. |
| `POST /api/stations/[id]/reports` | Signed-in | Body `{ reportType, description? }`. Creates a "Report Incorrect Information" submission for admin triage. |
| `PATCH /api/reports/[id]` | `ADMIN` | Body `{ status }`. Moves a report between `PENDING`/`REVIEWING`/`RESOLVED`/`REJECTED`; used by the `/admin/reports` triage queue. |
| `GET /api/marg/geocode` | Public | Query `q` (min 2 chars). Place-name search (OpenStreetMap Nominatim) for E Sakhi Marg's Starting Point/Destination fields. |
| `POST /api/marg/plan` | Public | Body `{ startLabel, startLatitude, startLongitude, destLabel, destLatitude, destLongitude, connector, chargingMode? }`. Plans a real driving route (OSRM) with real charging-station checkpoints along it. `404` with a plain-language message if no route or no compatible station exists — see the E Sakhi Marg section below. |

### Testing the API

```bash
curl "http://localhost:3000/api/stations?search=Kathmandu&pageSize=5"
curl "http://localhost:3000/api/stations/<id>"
```

Mutating endpoints need an authenticated `ADMIN` session cookie — easiest to test by logging in through the browser at `/login` and using the same browser tab's `fetch()` (devtools console), since Auth.js's Credentials sign-in needs a CSRF token round-trip that a plain `curl -d` won't do for you.

### Interactive Map

`/map` renders every non-deleted station matched by the current filters, using `GET /api/stations` — nothing hard-coded. Only stations with a real `latitude`/`longitude` get a marker; the source spreadsheet itself never had any (see [docs/data-model.md §8](docs/data-model.md#8-part-02-addendum--what-the-real-dataset-actually-looks-like)), so a later geocoding backfill (`docs/data-model.md §10`) filled this in — 221 of 460 stations exactly geocoded, 239 approximated from a real related place in the same record. `Station.coordinateSource` (`EXACT`/`APPROXIMATE`) is kept in the database/API for exactly this reason, but by product decision every marker renders identically (uniform emerald) and no coordinate-precision label/legend is shown — see `docs/architecture.md`'s map-architecture note. Markers cluster via `react-leaflet-cluster`; a popup shows name, address, operator, connector(s)/power, status, and a coordinate (with a "View Details" link to `/stations/[id]`, the real station detail page — Part 07). "Use my location" falls back to a clear message and a manual "Nepal view" recenter button if geolocation is denied or unsupported.

All Leaflet-specific code is isolated in `src/components/map/MapProvider.tsx` (see `docs/architecture.md §6`) — swapping tile/map providers later means editing one file, not hunting through feature code.

### Search + Filters — removed (later product decision)

The public `/stations` search/filter list ("Find Chargers") — a fully server-rendered, URL-driven search page built on `listStations()` — was **removed by explicit product decision**, in favor of `/map` (browse visually) and `/marg` (plan a journey) as the two ways to discover stations. `StationFilterPanel.tsx` (its filter UI) is **not** deleted — `/admin/stations` still uses the exact same component for the admin station list, so it stays. Nothing else about it changed:

- `src/app/stations/[id]/page.tsx` (station detail pages) are untouched and still linked from the map, recommendations, and favorites — only the *list* page (`src/app/stations/page.tsx`) was deleted.
- `GET /api/stations`, `GET /api/stations/[id]`, and every other station API endpoint are untouched — the map, calculator, recommendations, and admin all still depend on them.
- Every link that used to point to `/stations` (nav, footer, the homepage's primary button, the dashboard's quick links, the favorites empty state, the station detail page's "back" link) was repointed to `/map` or `/marg` rather than left dangling.

### Station Details

`/stations/[id]` (linked from every station card, map popup, and search result) shows a station's full record: address/province/district/city, an embedded single-station map (only rendered when real coordinates exist — "Location unavailable" otherwise, never a guessed pin), every charger with connector(s)/mode/power/availability, contact, status, live-computed rating, the full verification picture (status, source, last-verified date, per-field verified checklist), and — since Part 15 — real reviews and a real report flow. Navigate/Call only appear when real coordinates/contact exist; Favorite (Part 10), leaving a review, and Report Incorrect Information (both Part 15) are all real, session-backed actions.

### Charging Calculator

`/charging-calculator` estimates the energy and time needed to charge a vehicle at a given charger. All math lives in `src/services/charging-calculator.ts` (pure functions, no database access) — the page only collects input and renders the result:

- **Vehicle** — pick from a small seeded reference catalog of real EVs sold in Nepal (`prisma/seed-vehicles.ts`; currently cars only — see that file for why scooters/motorcycles aren't guessed at), or enter any vehicle's own battery capacity/AC/DC power manually.
- **Charger** — search real stations (reuses `GET /api/stations` and `GET /api/stations/[id]`, the same endpoints `/map` uses) and pick one of its real chargers, or enter a charging mode/power manually.
- **Estimate** — energy required is always computable from battery capacity alone; a time estimate is only shown when both the vehicle's max power for that charging mode *and* the charger's power rating are on record — otherwise the gap is stated plainly instead of guessing. Every estimate carries a caveat: it assumes constant charging power, while real charging (especially DC fast charging) typically tapers above ~80%.

`GET /api/vehicles` (public, optional `vehicleType` filter) serves the same catalog the calculator uses.

### E Sakhi Marg — EV Journey Planner

`/marg` ("marg" = route/journey/path) plans a whole start→destination journey, not just "the nearest charger." It was originally built as a new feature alongside the "Find Chargers" search list (`/stations`); that list page was later removed entirely (see "Search + Filters" above) while `/marg` was unaffected. Given a starting point, destination, connector type, and charging mode, it returns a real driving route with real charging-station checkpoints along the way:

- **Route** — computed by `src/services/marg-service.ts` via a real driving-route lookup (`src/lib/geo/osrm.ts`, OSRM's public routing API — actual road-following geometry and distance, never a straight line). No API key needed; documented there as the one place to swap in a paid routing provider later.
- **Place search** — `GET /api/marg/geocode?q=` proxies OpenStreetMap's Nominatim (server-side, for its required User-Agent header) so a visitor can type "Kathmandu"/"Pokhara"/any Nepali place name for Starting Point/Destination, or use their browser location for the start.
- **Checkpoints** — real `Station` rows only, never invented: candidates are filtered to ACTIVE stations with a confirmed coordinate and a real, non-deleted charger matching the selected connector and charging mode, then kept only if they sit within 8 km of the route's own path (a "route detour" is shown honestly when non-zero). A handful are chosen, spaced along the route (skipped entirely for a short trip that doesn't need one), with real road-distance segments between each point and the total. Availability is shown honestly per checkpoint — `Status unavailable` rather than a guess, exactly like everywhere else in this app, whenever no real-time source is on record.
- **No route or no compatible station** are both reported in plain language (`GET .../plan` returns `404` with a human-readable message), never papered over with a placeholder result.
- **Battery-aware planning** (current %, estimated range, minimum arrival %) is intentionally not required input yet — `MargPlanInput`/`MargCheckpoint` (`src/types/marg.ts`) are shaped so that upgrade doesn't need a redesign, only new optional fields and a reachability check layered onto the same checkpoint list.

`POST /api/marg/plan` (public, body: start/destination coordinates+labels, `connector`, optional `chargingMode`) does the actual planning; `GET /api/marg/geocode?q=` powers the two search fields.

### Recommendations

`/recommendations` ranks real, compatible stations for a vehicle — not just the nearest one. Full model locked in [docs/recommendation-engine.md](docs/recommendation-engine.md); in brief:

1. **Hard eligibility first**: a station is excluded outright (not scored low) unless it has a non-deleted charger whose connector matches the vehicle, isn't confirmed unavailable, and the station itself isn't confirmed inactive.
2. **Weighted scoring second**, over five factors (power/distance/rating/verification/availability) via one config object (`src/lib/config/recommendation-weights.ts`) — an unknown value always scores neutral-low, never as if it were good data.
3. **Honest about today's data**: every one of the 460 seeded stations has `NULL` coordinates and there are no reviews yet, so distance/rating (and, per `docs/data-model.md §7`, availability) can't meaningfully differentiate results today — the summary banner on `/recommendations` states that with live counts (never a hard-coded claim), and compatibility + charging speed (reusing `getEffectiveChargingPowerKw()` from the Part 08 calculator) end up doing most of the ranking work until more data exists.

`GET /api/recommendations` (public, `vehicleId` *or* manual `connector`/`maxAcPowerKw`/`maxDcPowerKw`, optional `latitude`/`longitude`) returns each result's full per-factor breakdown, not just a bare score.

### Dashboard & Favorites

Real per-user favorites (Part 10) — the `Favorite` model has existed since Part 02; this is the part that gives it a UI. Toggle a favorite from a station's detail page (replacing the disabled stub Part 07 left there) or directly from a station card on `/dashboard` or `/my-favorites` — a small heart icon that requires no page reload (`src/components/features/FavoriteButton.tsx`). Signed out, the same control is a real link to `/login?callbackUrl=...`, not a fake-working button.

- **`/dashboard`** — a light, signed-in landing hub: a favorites preview (first 3) plus quick links to the rest of the app. It doesn't duplicate `/profile`'s account fields or `/my-favorites`' full grid; it links to both.
- **`/my-favorites`** — the full list, reusing `StationCard` rather than a second rendering of the same data. Unfavoriting a card removes it from the list immediately (local client state seeded from the server-fetched list, not a full page refresh).
- **Ownership is structural, not just checked** — every mutation derives `userId` from the authenticated session (`requireUserForApi()`) and never reads it from the request; a client literally cannot submit a `userId` for `POST`/`DELETE /api/favorites`, satisfying `docs/architecture.md §3`'s ownership rule by construction, not just by a runtime check that could be forgotten later.
- Both `POST` (favorite) and `DELETE` (unfavorite) are idempotent — clicking twice, or a retried request, never errors.

### Admin Dashboard

`/admin` (`ADMIN`-only, real-server-checked via `requireAdmin()` regardless of what `src/proxy.ts` already redirected) replaces the old "coming soon" stub with a real overview, computed fresh from the database on every request — nothing cached, nothing hard-coded:

- **Counts**: stations, chargers, operators, connectors, users (and how many are admins), favorites, reviews, and reports. Reviews/reports were genuinely `0` before Part 15 built the features that create them — the "Reports" card now also links to `/admin/reports`, the triage queue.
- **Station status breakdown**, confirmed-coordinate count, and soft-deleted station/charger counts.
- **Verification status distribution** — all six `VerificationStatus` values shown even at `0`, a status nobody currently has is real information, not a gap to hide.
- **Recent verification activity** — the last 15 `VerificationLog` rows (every verification-field change `PUT /api/stations/[id]` makes has been logged automatically since Part 04; this is the first page that actually shows that log). Read-only: this page reports, it never mutates. Managing stations through a UI is Part 12; a full verification-approval workflow (bulk actions on `NEEDS_REVIEW` stations, etc.) is Part 13 — kept deliberately out of scope here.

### Admin Station Management

`/admin/stations` (list, using `StationFilterPanel`/the same search/filter panel and pagination the now-removed public `/stations` search page used, plus an admin-only "show soft-deleted" toggle) → `/admin/stations/new` (create) and `/admin/stations/[id]/edit` (edit — station fields, the full verification checklist, chargers, and soft-delete) give real create/edit/delete UI to endpoints that mostly already existed:

- **Stations** use the exact `POST`/`PUT`/`DELETE /api/stations[/id]` endpoints from Part 04 — no new station mutation logic, just a real form in front of it. Client-side validation reuses the identical Zod schemas (`src/lib/validation/station.ts`) those routes already validate with.
- **Chargers had no mutation endpoints until this part** — `POST /api/chargers` and `PUT`/`DELETE /api/chargers/[id]` are new (`src/services/charger-service.ts`), soft-delete only, admin-only, and every `connectorCodes` value is checked against the real `Connector` table rather than trusted as free text.
- **Coordinates stay honest**: the location form explicitly says never to estimate a latitude/longitude, a blank field saves as `NULL` (not `0,0`), and the same `z.coerce.number()` schema the public API already enforces (range-checked, no silent defaulting) runs client-side too.
- **Verification-field edits still write to `VerificationLog`** exactly as they did before this part — nothing about that mechanism changed, this just gives it a UI. Confirmed live on `/admin`'s Recent Activity feed.
- **Operator management is explicitly out of scope here** — the station form picks from existing operators (`GET /api/operators`, Part 04) or leaves a station independent; creating/editing operators isn't built (no admin need for it yet, given the 14 real operators already in the seeded dataset).

### Data Verification Dashboard

`/admin/verification` (Part 13) is the verification-specific workflow the general `/admin/stations` list deliberately isn't — a queue, not a browser:

- **Tabs, not a generic filter panel** — "Needs attention" (the default: `NEEDS_REVIEW` + `ASSUMED` + `UNVERIFIED` combined, the master brief's own framing of "low confidence"), each single `VerificationStatus` on its own, and "All" — each a live count pulled from the same aggregate `/admin` already computes, and each a plain link (`?tab=...`), no client JS.
- **Review happens in the queue itself** — every row renders that station's full verification state inline (status, source, last-verified date, the same five-item checklist the public station detail page shows, via a newly-shared `VerificationChecklist` component) so an admin can scan many stations without a click per station.
- **Editing reuses Part 12's form, not a second one** — "Review & edit verification" links straight to `/admin/stations/[id]/edit#verification`, that page's existing Verification section. No new mutation path was added; `updateStation()` (Part 04) and its automatic `VerificationLog` write are untouched.
- **A station's full history**, not just the dashboard's platform-wide last-15 — the station edit page now has its own "Verification history" section showing everything on record for that one station. The table itself (`VerificationLogTable`) is shared with `/admin`'s recent-activity feed rather than a second implementation.

### Excel Import & Update Tool

`/admin/import` (Part 14) is what makes re-uploading an updated version of the source spreadsheet safe once real admin edits (Parts 12/13) exist in the database. Full model locked in [docs/data-import.md](docs/data-import.md); in brief:

- **Upload, then preview, then apply** — two requests, no persisted "pending import" state. `POST /api/import/preview` parses the file and diffs it against the live database (writes nothing); the browser holds the computed diff and sends back only the admin-approved subset to `POST /api/import/apply`, which is what actually writes.
- **The exact same parsing/mapping rules `prisma/seed.ts` uses** — extracted into `src/services/excel-station-parser.ts` so the bootstrap script and this tool share one implementation, not two. An uploaded file is diffed with identical column-mapping logic to what originally built the dataset.
- **Structurally incapable of touching a station's verification fields, coordinates, or a charger's availability** — not a runtime check, a type-level one: nothing in the apply request's schema defines those fields, so even a hand-crafted request has them silently stripped (Zod's default behavior for unknown object keys). Applying writes only ever call the existing `createStation()`/`updateStation()`/`createCharger()`/`updateCharger()` (Parts 04/12) — no new mutation logic exists anywhere in this tool.
- **A soft-deleted station reappearing in a new upload is skipped, never revived** — same for a charger whose plug id now belongs to a different station. Both are surfaced with a clear reason in the review UI, not silently dropped.
- **A genuinely new station gets the same honest verification classification** `prisma/seed.ts` gives every row on first import (`VERIFIED`/`NEEDS_REVIEW`/`ASSUMED`, never a default "trusted" status) — there's no existing admin decision to protect for a record that didn't exist before.

### Reviews & Reports

Part 15 gives real content to the two things the station detail page (Part 07) had shown, since launch, as honest stubs — a `rating` field the API always computed but nothing ever wrote, and a disabled "Report Incorrect Information" button:

- **Reviews** — a signed-in user leaves a 1-5 star rating plus an optional comment (`ReviewSection.tsx`); one review per user per station (`Review.@@unique([userId, stationId])`, existed since Part 02), always editable — resubmitting updates the same row via `POST /api/stations/[id]/reviews`' upsert rather than creating a second one. `DELETE /api/stations/[id]/reviews` removes it. A station's average rating and review count were already computed fresh from `Review` rows at query time since Part 04 (`getStationRating()`) — this part is what finally puts real rows there to compute from, not a change to how the number is computed.
- **Reports** — a signed-in user picks an issue type (`ReportType`, existed since Part 02) and an optional description; `POST /api/stations/[id]/reports` creates the row (`Report`, status `PENDING`). Unlike Favorite/Review there's no `[userId, stationId]` uniqueness — different problems on the same station are different reports.
- **`/admin/reports`** (Part 15) is the triage queue that finally populates `/admin`'s "Reports"/"Pending reports" stat cards for real — tabbed by `ReportStatus` (`PENDING` the default), oldest-first (clearing the backlog, not browsing it). Unlike `/admin/verification`, which only reviews inline and links out to Part 12's edit form, this queue's one mutation (`PENDING` → `REVIEWING`/`RESOLVED`/`REJECTED`) happens right here via `PATCH /api/reports/[id]`.
- **Ownership is structural, not just checked** — `review-service.ts`/`report-service.ts` take `userId` as a caller-derived parameter exactly like `favorite-service.ts` (Part 10); a client can never submit a `userId` for any of these endpoints.

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
- [x] **Part 11** — Admin dashboard *(`/admin`, real-time station/charger/operator/user/favorite/review/report counts, verification-status distribution, recent `VerificationLog` activity — read-only reporting only; managing stations and the verification-approval workflow are Parts 12/13)*
- [x] **Part 12** — Admin station management *(`/admin/stations`, `/admin/stations/new`, `/admin/stations/[id]/edit` — create/edit/soft-delete stations and their chargers/connectors through a real UI, built on Part 04's station API plus new `POST /api/chargers` / `PUT`&`DELETE /api/chargers/[id]`; coordinates stay honest — never defaulted or fabricated by the form)*
- [x] **Part 13** — Data verification dashboard *(`/admin/verification` — a queue of NEEDS_REVIEW/ASSUMED/UNVERIFIED stations with the full checklist rendered inline, linking to Part 12's existing edit form rather than a second one; a station's complete VerificationLog history, not just the dashboard's last-15 feed)*
- [x] **Part 14** — Excel import/update tool *(`/admin/import` — upload, diff against the live database, review, approve; reuses `createStation`/`updateStation`/`createCharger`/`updateCharger` for every write, adds none; structurally can never touch verification fields, coordinates, or charger availability on an existing record — see `docs/data-import.md`)*
- [x] **Part 15** — Reviews + reports *(real 1-5 star reviews with comments, `POST`/`DELETE /api/stations/[id]/reviews`, one editable review per user per station; a real "Report Incorrect Information" flow, `POST /api/stations/[id]/reports`; `/admin/reports` triage queue, `PATCH /api/reports/[id]` — finally populates `/admin`'s Reviews/Reports stat cards for real)*
- [x] **Part 16** — Final testing, security review, polish *(full end-to-end pass as visitor/user/admin; `docs/architecture.md §10`'s security conventions verified line-by-line against the real implementation, not just restated; fixed a real bug where `Station.mapUrl`'s stricter admin-form validation (`z.url()`) permanently blocked saving any field on a station whose legacy `mapUrl` was already non-URL text — both validation schemas now match `docs/data-model.md`'s own lenient definition of the field; removed unused `create-next-app` boilerplate assets; corrected stale "reviews arrive in a later part" copy on `/profile`)*

## Future Features (not yet implemented, by design)

Real-time charger availability, operator APIs, payment/booking, charging-session tracking, electricity-cost calculation, route planning, push notifications, a mobile app, a station-owner portal, QR codes, and user-submitted stations are all explicitly **out of scope** until requested — the architecture is written so they can be added later without a rebuild, not so they're half-built now.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run dev` fails with a Prisma/`PrismaClient` error | Run `npx prisma generate` (regenerates the Prisma Client from `schema.prisma` — needed after `npm install` or any schema change; `postinstall` should do this automatically, but a manual run never hurts). |
| `P1001: Can't reach database server` | PostgreSQL isn't running, or `DATABASE_URL` in `.env` is wrong. Check the service is started and the connection string's host/port/credentials/database name match your local Postgres setup. |
| `relation "stations" does not exist` (or similar) | Migrations haven't been applied yet — run `npx prisma migrate dev`. |
| Pages load but show 0 stations / empty lists | The database has no data yet — run `npm run db:seed` (idempotent, safe to re-run). |
| Can't log in as admin | No admin account exists yet — set `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` in `.env`, then run `npm run db:create-admin`. |
| PowerShell blocks `npm` with an execution-policy error | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in that PowerShell profile, or run the commands from a Command Prompt/Git Bash terminal instead. |
| Port 3000 already in use | Another `next dev` is already running (check other terminals/VS Code windows), or run `npm run dev -- -p 3001` to use a different port. |
| Map tiles don't load | `NEXT_PUBLIC_MAP_TILE_URL` is unset — it defaults to the public OpenStreetMap tile server, which is fine for local development. |
| TypeScript/build errors after pulling new code | Run `npm install` (new dependency) and `npx prisma generate` (schema may have changed), then retry. |

## Security Considerations

- Passwords are hashed (bcrypt), never stored or logged in plaintext.
- Every sensitive server action re-checks authentication and role/ownership server-side — the frontend is never the authorization boundary.
- Admin-only data (verification logs, audit history, other users' data) is never exposed through user-facing APIs.
- No secrets are committed; all configuration is environment-variable driven.
- Prisma is used for all database access — no hand-built SQL string concatenation with user input.

Full checklist, verified line-by-line against the actual implementation in Part 16 (not just restated): see [docs/architecture.md §10](docs/architecture.md).

---

*E Sakhi — हर यात्रा मे अहाँक संग*
