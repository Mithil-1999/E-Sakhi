# E Sakhi — Architecture

**E Sakhi** — *Find. Charge. Go.*

This document locks the architectural decisions for E Sakhi before implementation begins. It exists so that every future development session (and every future contributor) can rebuild the same mental model without re-deriving it. Decisions here should be treated as stable; changing them later requires a deliberate, documented reason — not a rewrite of convenience.

The system is intentionally simple enough for **one developer** to build, run, and maintain. Nothing here is designed for scale that doesn't exist yet.

---

## 1. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | Next.js (App Router) | Current stable major version at the time each part is implemented. |
| UI library | React + TypeScript | Strict TypeScript (`strict: true`). |
| Styling | Tailwind CSS | Utility-first; no separate CSS-in-JS library. |
| Icons | Lucide Icons | Single icon set, no mixing. |
| Backend | Next.js Route Handlers + Server Actions | No separate backend service/process. |
| ORM | Prisma | Single source of schema truth (`prisma/schema.prisma`). |
| Database | PostgreSQL | Relational; required for constraints/relations described in [data-model.md](./data-model.md). |
| Authentication | Auth.js (NextAuth v5) with Credentials provider | Session-based, server-verified roles. |
| Password hashing | bcrypt (via `bcryptjs` or `bcrypt`) | Never plaintext, never reversible encryption. |
| Maps | Leaflet + `react-leaflet`, OpenStreetMap-compatible tiles | Provider abstracted — see §6. |
| Validation | Zod | Shared schemas between client forms and server handlers where practical. |
| Excel parsing (Part 14) | `exceljs` or `xlsx` (decided at implementation time) | Read-only against the uploaded file; original file is never mutated. |

Exact patch/minor versions are pinned in `package.json` at Part 01 (project foundation), not here. If the existing repository already has compatible versions installed, those are preserved rather than upgraded for their own sake.

---

## 2. Project Structure

```text
e-sakhi/
├── docs/                        # Architecture & process documentation
│   ├── architecture.md
│   ├── data-model.md
│   ├── recommendation-engine.md # added in Part 09
│   └── data-import.md           # added in Part 14
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/                     # Next.js App Router routes
│   │   ├── (public)/            # Home, map, search, station details, calculator
│   │   ├── (auth)/              # /login, /register
│   │   ├── (user)/              # /dashboard, /my-favorites, /profile — protected
│   │   ├── admin/                # /admin/** — protected, ADMIN only
│   │   └── api/                  # Route handlers
│   ├── components/
│   │   ├── ui/                  # Generic reusable primitives (Button, Card, Badge, ...)
│   │   ├── layout/               # Header, Footer, Nav
│   │   ├── map/                   # Map provider wrapper + markers
│   │   └── features/              # Feature-specific composite components
│   ├── lib/
│   │   ├── auth/                  # Auth.js config, session helpers, role guards
│   │   ├── db/                    # Prisma client singleton
│   │   ├── validation/            # Zod schemas
│   │   └── config/                 # Recommendation weights, map provider config, constants
│   ├── services/                   # Business logic — the only place calculations live
│   │   ├── charging-calculator.ts
│   │   ├── recommendation-engine.ts
│   │   ├── station-service.ts
│   │   ├── verification-service.ts
│   │   └── import-service.ts
│   └── types/                      # Shared TypeScript types/enums mirrored from Prisma
├── public/
├── .env.example
└── README.md
```

**Rule:** React components render and collect input. They never contain charging math, scoring logic, or normalization logic — those live in `src/services/`. This is a hard rule (see [Data Model §"Service Layer"](#4-api--service-layer-conventions)) that must not be broken for convenience in later parts.

---

## 3. Authentication Approach

- **Library:** Auth.js (NextAuth v5, `next-auth@5.0.0-beta.32` — pinned exact; still on the `beta` npm tag but the version actually in wide production use, not experimental in practice), Credentials provider. No database adapter: Credentials + JWT sessions don't need Auth.js's Account/Session/VerificationToken tables (those exist for OAuth/database-session strategies), so `User.password_hash`/`role` on our own schema is the entire persistence story — see `src/lib/auth/auth.ts`.
- **Passwords:** hashed with `bcryptjs` (pure JS — no native build step, avoiding the install-script friction native `bcrypt` hit on this Windows machine in Part 02) before storage; never logged, never returned by any API.
- **Sessions:** an httpOnly, signed JWT cookie via Auth.js; the token/session payload carries only `id` and `role` (via the `jwt`/`session` callbacks in `auth.ts`) — never the password hash or other PII.
- **Roles:** `USER` and `ADMIN`, stored on the `User` row (see data model). Registration **always** creates `USER` — the register Server Action (`src/app/register/actions.ts`) never reads a `role` field from form input, full stop. There is no client-controllable way to request `ADMIN`.
- **First admin:** created via `scripts/create-admin.ts` (`npm run db:create-admin`), driven by `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` in `.env`. Idempotent: promotes an existing matching user to `ADMIN` without touching their password, or creates a new `ADMIN` account if the email doesn't exist yet. Never via the public UI.
- **Route protection file is `proxy.ts`, not `middleware.ts`.** Next.js 16 renamed the middleware file convention to Proxy (`node_modules/next/dist/docs/.../file-conventions/proxy.md`) — this project's version of that file is `src/proxy.ts` (next to `src/app`, per that doc's placement rule), doing an *optimistic* cookie-only check: redirect unauthenticated requests away from `/profile`/`/admin/**`, redirect non-admins away from `/admin/**`, redirect already-logged-in visitors away from `/login`/`/register`. Proxy now defaults to the Node.js runtime (Next.js 16 changed this too), so there was no need for the classic Auth.js edge-safe-config split.
- **Authorization enforcement:** every protected route and every mutating Server Action/Route Handler re-checks the session and role **on the server**, via `requireUser()`/`requireAdmin()` in `src/lib/auth/session.ts` (a Data Access Layer, per the Next.js auth guide), regardless of what the UI hides or what Proxy already redirected. This isn't optional belt-and-suspenders — Next.js's own docs explicitly warn that a Proxy `matcher` that excludes a path also skips Server Actions called from that path, so Proxy is never the only check.
- **Ownership checks:** any action that touches a `Favorite`, `Review`, or `Profile` row must verify the row's `user_id` equals the authenticated session's `userId` before mutating it. The client-submitted user id, if any, is never trusted.

---

## 4. API & Service Layer Conventions

- **Route style:** REST-ish resource routes under `/api/<resource>` (`/api/stations`, `/api/stations/[id]`, `/api/chargers`, `/api/operators`, ...), using standard HTTP verbs and status codes (200/201/204, 400 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 409 conflict, 500 unexpected).
- **Response shape (JSON APIs):**
  ```ts
  // success
  { "data": <payload>, "meta"?: { "page": 1, "pageSize": 20, "total": 137 } }
  // error
  { "error": { "message": "Human-readable message", "code"?: "VALIDATION_ERROR" } }
  ```
- **Validation:** every Route Handler/Server Action validates its input with a Zod schema before touching the database. Invalid input never reaches Prisma.
- **Service layer:** business logic (charging calculations, recommendation scoring, connector/vehicle-type normalization, station matching for import) lives in `src/services/*`, imported by both Route Handlers and Server Actions. This keeps the logic testable and reusable, and keeps it out of React components per §2.
- **Pagination:** list endpoints (`/api/stations`, etc.) use cursor or offset pagination (`page`, `pageSize`) with a sane default and maximum page size. The frontend never requests "all stations" unfiltered when a paginated/filtered query would do.
- **Error handling:** raw Prisma/database errors and stack traces are never returned to the client. They are logged server-side; the client receives a generic, safe message.
- **Soft deletion:** `Station` (and `Charger`) rows are never hard-deleted by normal admin actions. Deletion sets `is_deleted = true`, `deleted_at`, `deleted_by`, and all normal queries filter `is_deleted = false` by default. Soft-deleting a `Station` cascades to its own `Charger` rows (also soft-deleted, same admin/timestamp) so a "deleted" station never has active-looking chargers still hanging off it.
- **Route Handler auth is a different helper than page auth.** `requireUser()`/`requireAdmin()` in `src/lib/auth/session.ts` call `redirect()` — correct for pages/Server Actions, but wrong for a JSON API (a `fetch()` caller needs a `401`/`403` body, not an HTTP redirect to `/login`). Route Handlers instead use `requireUserForApi()`/`requireAdminForApi()` in `src/lib/auth/api.ts`, which return `{ ok: false, response }` instead of throwing a redirect — added in Part 04 (`src/app/api/**`), same underlying session check either way.
- **Verification-field changes are logged automatically at the mutation point**, not deferred to a later "verification feature": `PUT /api/stations/[id]` (`src/services/station-service.ts`) diffs old vs. new values for every field listed in §5 and writes one `VerificationLog` row per changed field, in the same transaction as the update. Part 13 builds the admin-facing *view* of this log; the log itself has existed since the first mutation endpoint that could touch these fields.
- **A page can call the service layer directly instead of fetching its own API route** — and which one it does is a deliberate per-page choice, not an inconsistency. `/map` (Part 05) is a Client Component that fetches `GET /api/stations` over HTTP, because it needs the same data reachable from client-side JS regardless of origin. `/stations` (Part 06) is a Server Component that calls `listStations()` from `src/services/station-service.ts` directly — same validation (`StationListQuerySchema`), same query-building logic, zero duplication, no self-HTTP-round-trip latency for a page that only ever renders server-side. Both sit on the identical service layer; only the entry point differs.
- **Search/filter pages are URL-driven, not client-state-driven.** `/stations`' filter panel (`src/components/features/StationFilterPanel.tsx`) navigates via `router.push('/stations?...')` on every change (debounced for the free-text search field) rather than holding filter state in React and fetching client-side — this is what makes filtering, pagination, and results genuinely server-rendered per this section's pagination rule, and makes every filtered view a shareable/bookmarkable URL. This is a different pattern from `MapFilterPanel.tsx` (Part 05), which holds filter state locally because the map is inherently a client-interactive surface (pan/zoom/geolocation) already paying the client-JS cost. Pick the URL-driven pattern by default for any future list/search page; only reach for local state when the surface has a good independent reason to be client-rendered anyway.
- **Filters that narrow to "at least one charger matching everything selected"** (connector, charging mode, power bucket, vehicle type, availability — see `buildStationWhere` in `station-service.ts`) all live inside the *same* `chargers: { some: { ... } }` block, not separate `some` blocks. This matters: it requires one physical charger to satisfy every selected condition together (e.g. a CCS2 **and** DC **and** 60–120kW charger on the *same plug*), not "the station has some CCS2 charger and separately some unrelated 100kW charger." Any new charger-level filter added later must join this same block to preserve that semantic.
- **Power-range buckets are canonical, not raw min/max query params** — `src/lib/config/power-buckets.ts` is the single source of truth for the five ranges plus "Unknown" (a charger with no recorded `power_kw`, an honest bucket rather than a default), consumed by both the filter UI and `buildStationWhere`. This mirrors `nepal-provinces.ts`'s pattern: one list, never restated.
- **A service module doesn't need `"server-only"` unless it touches the database/session.** Every other `src/services/*` file does and is marked accordingly (see `station-service.ts`, `vehicle-service.ts`, ...). `src/services/charging-calculator.ts` (Part 08) is pure math with no such dependency, so it's called directly from a Client Component (`ChargingCalculatorTool.tsx`) on every keystroke — still "business logic lives in services, not components" per §2, just callable from either side.
- **The charging calculator (`/charging-calculator`, Part 08) is client-local-state, not URL-driven** — a deliberate extension of the choice above (§4, "Search/filter pages are URL-driven"): it's a calculator a visitor tweaks interactively, not a list whose current view is worth bookmarking, so it holds vehicle/charger/percentage inputs in local React state rather than the URL. It still calls the service layer directly for its one server-rendered need (the seeded vehicle catalog, via `listVehicles()`) and reuses `GET /api/stations`/`GET /api/stations/[id]` client-side to let a visitor source a charger's real mode/power from an actual station instead of typing it blind.

---

## 5. Data Verification Architecture

This is the concept the whole dataset trust model is built on — see [data-model.md](./data-model.md) for the exact fields. Summary of the architectural rule:

- Every station carries an explicit `verification_status` from a **fixed enum**: `VERIFIED | PARTIALLY_VERIFIED | UNVERIFIED | NEEDS_REVIEW | UNKNOWN | ASSUMED`. No free-text or boolean stand-ins for this concept are permitted anywhere in the codebase.
- Sub-fields (`location_verified`, `connector_verified`, `power_verified`, `contact_verified`, `availability_verified`) are independent booleans/timestamps — a station can have verified coordinates but an unverified phone number.
- The UI must render verification status as a visible badge wherever station data is shown (map popup, list card, detail page) — it is never hidden or buried.
- Only `ADMIN` sessions can change verification fields, and every change is written to `VerificationLog` (station id, admin id, field changed, old value, new value, timestamp). Ordinary users never see this log's raw contents; admins do.
- Missing data is represented as `Unknown`, not zero, not empty string, not a false negative. Missing coordinates specifically render as "Location unavailable," never `(0, 0)` or a guessed pin.

---

## 6. Map Architecture

- **Library:** `react-leaflet` (v5) over `leaflet` (v1.9), clustering via `react-leaflet-cluster` (wraps `leaflet.markercluster`), tiles from an OpenStreetMap-compatible tile provider configured via `NEXT_PUBLIC_MAP_TILE_URL` (env var, no key committed; falls back to `tile.openstreetmap.org` if unset).
- **Abstraction:** `src/components/map/MapProvider.tsx` is the ONLY file that imports `leaflet`/`react-leaflet`/`react-leaflet-cluster` directly, exposing `<StationMap markers center zoom onMarkerClick userPosition flyTo />` — plain-data props only (marker `popup` content is a caller-supplied `ReactNode`, built with zero Leaflet knowledge — see `src/components/features/StationPopupContent.tsx`). This lets the tile/map provider be swapped later without touching feature code. `src/components/map/markerIcons.ts` (custom SVG `divIcon`s, brand-matched to the logo) is considered part of this same wrapper boundary.
- **SSR:** Leaflet touches `window` at import time and cannot be server-rendered. `MapProvider` is loaded exclusively via `next/dynamic(() => import(...), { ssr: false })` from a Client Component (`src/components/features/MapExplorer.tsx`) — per `node_modules/next/dist/docs/.../lazy-loading.md`, `ssr: false` only works when the `dynamic()` call itself lives in a Client Component, which is why the orchestration lives in `MapExplorer.tsx` rather than directly in `app/map/page.tsx` (kept as a plain Server Component for metadata).
- **Coordinates:** the map only ever renders `latitude`/`longitude` pulled from the database via `GET /api/stations` (Part 04). A station with `NULL` coordinates is excluded from the marker layer; the UI states the count honestly (e.g. "0 of 460 stations have a confirmed location") rather than hiding the gap. Coordinates are never invented, defaulted, or geocoded automatically from an address string.
- **Clustering:** `react-leaflet-cluster`'s `MarkerClusterGroup`, with a custom `iconCreateFunction` (brand-colored count bubble) — a rendering concern entirely inside the wrapper; does not affect the underlying data contract.
- **Overlay UI z-index, learned the hard way:** Leaflet's own panes are `tilePane:200 < overlayPane:400 < shadowPane:500 < markerPane:600 < tooltipPane:650 < popupPane:700`, and its built-in zoom control sits at `z-index:1000` — all as *siblings* competing in the same stacking context as anything else positioned over the map (`.leaflet-container` doesn't isolate its own context by default). A feature-level overlay (the filter/status bar in `MapExplorer.tsx`) that naively used `z-[1000]` buried every popup. Fixed by dropping that overlay to `z-[650]` (between markers and popups) and adding `autoPanPaddingTopLeft` to `<Popup>` so Leaflet's own auto-pan keeps newly-opened popups clear of the fixed UI. Any future fixed UI drawn over the map must stay below `700` for this same reason.

---

## 7. Recommendation Engine Architecture

Implemented as a standalone service module (`src/services/recommendation-engine.ts`), not as logic embedded in the `/recommendations` page. Its contract, in brief (fully specified in `docs/recommendation-engine.md`, written in Part 09):

1. **Hard eligibility filters first** (connector compatibility, vehicle capability, station/charger status) — a station that fails these is excluded, not merely scored low.
2. **Scored ranking second**, using a single configuration object (`src/lib/config/recommendation-weights.ts`) for the weights described in the master spec (compatibility/distance/power/availability/rating/verification). No component or route hard-codes a weight; everything reads from that one config.
3. **Unknown data never scores as if it were good data** — an unknown rating, unknown availability, or unknown verification status is scored as unknown/neutral-low, never defaulted to a perfect score.

This module is not implemented in Part 00 — this section only locks where it will live and how it will be shaped.

---

## 8. Environment Variables

All secrets and environment-specific config live in `.env` / `.env.local`, never committed. `.env.example` lists variable **names** with placeholder values only. Anticipated variables (finalized in Part 01):

```text
DATABASE_URL=
AUTH_SECRET=
NEXT_PUBLIC_MAP_TILE_URL=
NEXT_PUBLIC_APP_URL=
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
```

`.gitignore` excludes `.env`, `.env.local`, and any `.env.*` file that is not `.env.example`.

---

## 9. Naming Conventions

- **Database:** snake_case column names (via Prisma `@map`/`@@map`), plural table names (`stations`, `chargers`).
- **Prisma models / TypeScript:** PascalCase model names (`Station`, `Charger`), camelCase fields in generated client (`stationName`, `verificationStatus`).
- **Enums:** SCREAMING_SNAKE_CASE values (`VERIFIED`, `NEEDS_REVIEW`, `CCS2`), PascalCase enum type names (`VerificationStatus`, `ConnectorCode`).
- **Routes:** kebab-case URL segments (`/charging-calculator`, `/my-favorites`).
- **Files/components:** PascalCase for React components, camelCase for utilities/services.
- **Git commits:** Conventional-commit-style prefixes (`feat:`, `fix:`, `chore:`, `docs:`) as enumerated in the project's development-part checklist.

---

## 10. Security Conventions (summary)

Full checklist lives in Part 16, but the standing rules from Part 00 onward are:

- Never trust the frontend for authorization or ownership — every sensitive check is re-verified server-side.
- Never accept a client-submitted `role` or `user_id` for write operations; both are derived from the authenticated session.
- Never return password hashes or internal audit detail through any user-facing API.
- Never commit secrets; `.env*` (except `.env.example`) is git-ignored from Part 01 onward.
- Prisma only — no hand-built raw SQL string concatenation with user input.

---

## 11. What Part 00 Does *Not* Do

Per the master plan, Part 00 defines decisions and documentation only. No Next.js project, no `package.json`, no Prisma schema file, and no UI code are created in this part — those begin at Part 01 (foundation) and Part 02 (database + dataset import).
