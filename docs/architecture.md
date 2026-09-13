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
| Excel parsing (Part 14) | `exceljs` (already a dependency since Part 02's `prisma/seed.ts`) | Read-only against the uploaded file; original file is never mutated. `src/services/excel-station-parser.ts` shares its parsing/mapping logic with `prisma/seed.ts` rather than a second implementation. |

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
- **Ownership checks:** any action that touches a `Favorite`, `Review`, or `Profile` row must verify the row's `user_id` equals the authenticated session's `userId` before mutating it. The client-submitted user id, if any, is never trusted. `src/services/favorite-service.ts` (Part 10) takes this further structurally, not just by a runtime check: every function requires `userId` as an explicit parameter the *caller* (a Route Handler via `requireUserForApi()`, a page via `requireUser()`) derives from the session — there is no code path where a `userId` from the request body/params could reach it at all.

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
- **Verification-field changes are logged automatically at the mutation point**, not deferred to a later "verification feature": `PUT /api/stations/[id]` (`src/services/station-service.ts`) diffs old vs. new values for every field listed in §5 and writes one `VerificationLog` row per changed field, in the same transaction as the update. The log itself has existed since the first mutation endpoint that could touch these fields; Part 11 added a platform-wide last-15 view of it, and Part 13 added a per-station full history — neither reads the log any differently, they just query it at different scopes.
- **A page can call the service layer directly instead of fetching its own API route** — and which one it does is a deliberate per-page choice, not an inconsistency. `/map` (Part 05) is a Client Component that fetches `GET /api/stations` over HTTP, because it needs the same data reachable from client-side JS regardless of origin. `/stations` (Part 06) is a Server Component that calls `listStations()` from `src/services/station-service.ts` directly — same validation (`StationListQuerySchema`), same query-building logic, zero duplication, no self-HTTP-round-trip latency for a page that only ever renders server-side. Both sit on the identical service layer; only the entry point differs.
- **Search/filter pages are URL-driven, not client-state-driven.** `/stations`' filter panel (`src/components/features/StationFilterPanel.tsx`) navigates via `router.push('/stations?...')` on every change (debounced for the free-text search field) rather than holding filter state in React and fetching client-side — this is what makes filtering, pagination, and results genuinely server-rendered per this section's pagination rule, and makes every filtered view a shareable/bookmarkable URL. This is a different pattern from `MapFilterPanel.tsx` (Part 05), which holds filter state locally because the map is inherently a client-interactive surface (pan/zoom/geolocation) already paying the client-JS cost. Pick the URL-driven pattern by default for any future list/search page; only reach for local state when the surface has a good independent reason to be client-rendered anyway.
- **Filters that narrow to "at least one charger matching everything selected"** (connector, charging mode, power bucket, vehicle type, availability — see `buildStationWhere` in `station-service.ts`) all live inside the *same* `chargers: { some: { ... } }` block, not separate `some` blocks. This matters: it requires one physical charger to satisfy every selected condition together (e.g. a CCS2 **and** DC **and** 60–120kW charger on the *same plug*), not "the station has some CCS2 charger and separately some unrelated 100kW charger." Any new charger-level filter added later must join this same block to preserve that semantic.
- **Power-range buckets are canonical, not raw min/max query params** — `src/lib/config/power-buckets.ts` is the single source of truth for the five ranges plus "Unknown" (a charger with no recorded `power_kw`, an honest bucket rather than a default), consumed by both the filter UI and `buildStationWhere`. This mirrors `nepal-provinces.ts`'s pattern: one list, never restated.
- **A service module doesn't need `"server-only"` unless it touches the database/session.** Every other `src/services/*` file does and is marked accordingly (see `station-service.ts`, `vehicle-service.ts`, ...). `src/services/charging-calculator.ts` (Part 08) is pure math with no such dependency, so it's called directly from a Client Component (`ChargingCalculatorTool.tsx`) on every keystroke — still "business logic lives in services, not components" per §2, just callable from either side.
- **The charging calculator (`/charging-calculator`, Part 08) is client-local-state, not URL-driven** — a deliberate extension of the choice above (§4, "Search/filter pages are URL-driven"): it's a calculator a visitor tweaks interactively, not a list whose current view is worth bookmarking, so it holds vehicle/charger/percentage inputs in local React state rather than the URL. It still calls the service layer directly for its one server-rendered need (the seeded vehicle catalog, via `listVehicles()`) and reuses `GET /api/stations`/`GET /api/stations/[id]` client-side to let a visitor source a charger's real mode/power from an actual station instead of typing it blind. `/recommendations` (Part 09) follows the identical pattern for the identical reason.
- **Batch, don't N+1, when scoring/listing many stations at once** — `station-service.ts`'s `getStationRatingsBatch()` (Part 09) fetches every needed station's rating with one `prisma.review.groupBy`, not one `aggregate` call per station. `getStationById()`'s single-station `getStationRating()` (Part 04) is unchanged and still correct for that one-station case; the batched sibling exists specifically for `recommendation-engine.ts`, which scores every eligible station (up to ~460) per request.
- **`apiSuccess`'s `meta` isn't only pagination-shaped.** Most list endpoints' `meta` matches `ApiMeta` (`page`/`pageSize`/`total`/`totalPages`), but `GET /api/recommendations` (Part 09) has a genuinely different, still-documented `meta` shape (`docs/recommendation-engine.md §5`) — `apiSuccess()` (`src/lib/api/response.ts`) accepts either rather than that endpoint hand-rolling its own `NextResponse.json` and stepping outside the `{ data, meta }` envelope.
- **A "Station rendered as a list card" projection has one canonical shape.** `station-service.ts` exports its `stationListInclude` Prisma include and `toStationListItem()` mapper specifically so other services that ultimately render a `Station` as a `StationListItem` reuse them rather than redefining a second, possibly-drifting version — `favorite-service.ts`'s `listFavoriteStations()` (Part 10) does exactly that instead of hand-rolling its own include.
- **A card that both links somewhere and carries its own action button never nests one inside the other.** `<button>` inside `<a>` is invalid HTML and double-fires on click. `StationCard.tsx`'s favorite toggle (Part 10) sits in a `relative` wrapper as a sibling of the `<Link>`, absolutely positioned over the card's corner — not nested inside the link's markup. Any future per-card action button on a linked card should follow this same structure, not `stopPropagation()` tricks on a nested element.
- **A `groupBy` count is represented for every enum value, even the ones at 0.** `/admin` (`admin-dashboard-service.ts`, Part 11) maps its station-status and verification-status `groupBy` results onto the *full* enum list, filling in `0` for any value the query didn't return a row for — the same "unknown/absent is real information, not a gap to silently drop" rule §5 already applies to a single station's verification badge, now applied to an aggregate view. Never render only the enum values a `groupBy` happened to return.
- **The admin dashboard is read-only by design.** `/admin` (Part 11) reports what's true right now; it has no mutation path of its own. Creating/editing stations through a UI is `/admin/stations` (Part 12), and the verification-specific workflow is `/admin/verification` (Part 13) — both deliberately out of `/admin`'s own scope so it stays a fast, simple overview that links out rather than growing into either of those.
- **A workflow queue is not the same page as a general list, even over the same data.** `/admin/verification` (Part 13) deliberately does not reuse `StationFilterPanel`/the `/admin/stations` table — a verification queue's job is "show me what needs attention, richly, so I rarely need to click through," not "let me slice 460 stations by eight independent filters." Its tabs map onto a small, fixed, task-specific grouping (`NEEDS_REVIEW`/`ASSUMED`/`UNVERIFIED` combined as the default "needs attention" view, per the master brief's own framing, plus each status alone and "all") rather than exposing the general filter panel's connector/power/vehicle axes, which aren't verification concerns. What *is* shared: the underlying `VerificationStatus` groupBy counts (already computed by `admin-dashboard-service.ts`), the `VerificationChecklist` component (`src/components/ui/VerificationChecklist.tsx`, extracted from the station detail page, Part 07), and the `VerificationLogTable` component (extracted from the admin dashboard's recent-activity feed, Part 11) — the data-shaped pieces are reused; the page-level UX is purpose-built.
- **A queue reviews inline and edits by linking out, not by embedding a second form.** `/admin/verification`'s rows render a station's full current verification state (status, source, checklist) without a click, but "Review & edit verification" is a link to `/admin/stations/[id]/edit#verification` — the exact Part 12 form, scrolled to its Verification section (`scroll-mt-20` on that `<section id="verification">` clears the sticky header). There is no second verification-editing form anywhere in the codebase; the queue is a lens onto data plus a link, not a parallel mutation path.
- **A "cleared to empty" field is not the same value in every schema — check nullability per-schema, not per-field-name.** `Station.operatorId` is genuinely represented two different ways depending on which Zod schema is in play: `StationCreateSchema`'s `operatorId` is optional but **not nullable** (`undefined` = "no operator"; the field doesn't exist yet, so there's nothing to clear), while `StationUpdateSchema`'s is **nullable** (`null` = "disconnect the operator this station currently has"). `AdminStationForm.tsx` (Part 12) has to build a different "empty" representation for the same blank dropdown depending on `mode`, rather than reusing one `blankToNull()` helper for every field — a reminder that "what does blank mean here" is a per-field, per-schema question, not something safe to assume is consistent across a create schema and its update sibling.
- **A destructive admin action (soft-delete) confirms via the platform's native `window.confirm()`**, not a custom dialog component — there is no `Modal`/`Dialog` primitive anywhere else in this codebase, and building one for a single confirm-before-delete button would be new UI infrastructure for a project whose whole ethos (`docs/architecture.md`'s own opening line) is staying "simple enough for one developer." Reach for this same native-`confirm()` pattern for the next destructive admin action before introducing a dialog component.
- **A soft-deleted record's admin edit page renders read-only, not absent.** `AdminStationForm.tsx` wraps its editable fields in a single `<fieldset disabled={isDeletedStation}>` rather than either hiding the form or leaving it live — `updateStation()`/`updateCharger()` already refuse writes to a deleted row (`404`), so an enabled form would just be a dead end; showing the station's last-known field values with saving disabled and a clear banner is more honest than either extreme.
- **A multi-step admin workflow doesn't always need a database table for its "in-progress" state.** `/admin/import` (Part 14) parses and diffs an uploaded file in one request and returns the full result as JSON; the browser holds it and sends back only the approved subset in a second request, which is what writes. No `ImportBatch` model, no migration, no cleanup job for abandoned imports — see `docs/data-import.md §3` for the accepted tradeoff (no staleness check between the two requests) this simplification carries, stated deliberately rather than discovered later.
- **Zod's default "strip unknown object keys" behavior is a real security boundary here, not just convenience.** `src/lib/validation/import.ts`'s apply-request schema never defines a verification field, a coordinate field, or charger `availability` anywhere — so even a hand-crafted request that includes one is silently dropped before it ever reaches a mutation function, the same way `StationUpdateSchema`/`ChargerUpdateSchema` already protect every other endpoint. Prefer "the schema doesn't define this field" over "the code checks for and rejects this field" whenever a value must never be writable through a given path — the former can't be bypassed by a code path that forgets the check.
- **Reused mutation functions, not a parallel write path.** `/admin/import`'s apply step (`src/services/import-service.ts`) calls `createStation()`/`updateStation()`/`createCharger()`/`updateCharger()` — the identical functions Parts 04/12 already built and tested — for every write. This is also *why* its verification-field guarantee holds: those functions already only touch a field when it's present in their input, and the import tool's input type simply never includes those fields, so the existing functions' own behavior does the protecting.
- **A "fully resend the whole thing" mutation gets a required-but-nullable field, not an optional one.** `ReviewUpsertSchema` (Part 15) always takes a review's complete state in one call — `rating` and `comment` together, never a partial patch — so `comment` is `z.string().nullable()` (present, can be explicitly `null`) rather than `.optional()` (key may be omitted, meaning "don't touch"). This is the opposite call from `StationUpdateSchema`'s partial-update fields (`.partial()` + per-field `.optional()`, this section) for the same underlying reason this section's earlier `.nullable()` vs `.optional()` note gives: what "blank" means is a per-schema question, and a schema that never patches has no "leave it alone" case to represent.
- **`Report` deliberately has no `[userId, stationId]` uniqueness**, unlike `Favorite`/`Review` — a user reporting two different problems on the same station is two different reports, not an edit of one. `createReport()` (`src/services/report-service.ts`, Part 15) is a plain `create`, never an `upsert`.
- **A queue whose only real mutation is the triage action itself stays a Client Component**, unlike `/admin/verification` (which only reviews inline and links out to Part 12's form for its one edit path). `/admin/reports`' `ReportQueueList.tsx` (Part 15) `PATCH`es `/api/reports/[id]` and updates local state in place — the same fetch-then-filter-local-array pattern `AdminChargerManager.tsx` (Part 12) and `MyFavoritesList.tsx` (Part 10) already established, applied to a third resource rather than inventing a fourth mutation pattern (a Server Action was considered and rejected here specifically to keep every resource mutation in this app going through the same `/api/*` Route Handler + `fetch()` shape — Auth.js's login/register forms are the one place Server Actions are used, and that's an auth-flow convention, not a resource-CRUD one).
- **`resolved_at` is a timestamp with real meaning, not a "has this ever been touched" flag.** `updateReportStatus()` (Part 15) sets it the moment a report reaches a terminal state (`RESOLVED`/`REJECTED`) and clears it back to `null` if the status is ever moved out of one — matching `docs/data-model.md`'s documented meaning for the field, not just recording history.
- **A deliberate two-tier validation split can still be a real bug once real data hits it.** `StationCreateSchema`/`StationUpdateSchema`'s `mapUrl` used to be `z.url()` — a considered, documented choice (Part 14, `docs/data-import.md §4`) to keep the admin manual-edit form stricter than the Excel import tool's lenient `mapUrl` (`src/lib/validation/import.ts`), on the theory that a human typing a fresh value should be held to a real URL. That theory broke on `EVNP-0448`, whose *existing* `mapUrl` is garbled legacy text (`"Listed"` — `docs/data-model.md §8.4`): because `AdminStationForm.tsx` always resends a station's full current state rather than a diff, that one bad legacy field permanently failed `z.url()` on every save attempt, blocking edits to *every other field* on that station too. Part 16 fixed this by matching `mapUrl`'s validation to `docs/data-model.md §4`'s own definition of the field ("raw source URL/description," never guaranteed to actually be a URL) everywhere — both schemas are now `z.string().trim().max(2000).nullable()`, same as the import tool. Lesson: a stricter validation rule applied only to *new* input is still validated against a full-resend payload that includes *old* input — a partial-update (`PATCH`-style, only-the-changed-fields) mutation shape doesn't have this failure mode, but a full-resend one does, so a deliberately-asymmetric strictness rule needs the mutation shape checked before being trusted.

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
- **Coordinates:** the map only ever renders `latitude`/`longitude` pulled from the database via `GET /api/stations` (Part 04). A station with `NULL` coordinates is excluded from the marker layer; the UI states the live count honestly (computed from the real query result, never hard-coded) rather than hiding the gap. Coordinates are never invented or defaulted — a real, traceable geocoding pass fills this gap where it can be done honestly (`docs/data-model.md §10`), and every station's `CoordinateSource` (`EXACT`/`APPROXIMATE`/`UNKNOWN`) is kept in the database and returned by the API. **By a later, explicit product decision, this precision distinction is deliberately not surfaced in the UI** — every marker renders identically and no coordinate-status label/legend is shown, so the data exists for a future feature or admin view without being exposed to visitors today. `CoordinateSource` remains a separate concept from `VerificationStatus`/`locationVerified` regardless — it describes how a coordinate was *obtained*, not whether an admin has confirmed it.
- **Station status is a two-value concept (`ACTIVE`/`INACTIVE`) by the same kind of explicit product decision.** `StationStatus.UNKNOWN` still exists in the Prisma enum (so this was never a breaking schema migration — see `prisma/migrations/*_station_status_defaults_active`), but nothing in the app sets, filters by, or displays it: every station defaults `ACTIVE` unless the source data explicitly says `"Not Available"` (`mapStationStatus()`, `src/services/excel-station-parser.ts`), and `station-service.ts`'s `normalizeStationStatus()` defensively coerces any legacy/edge-case `UNKNOWN` row to `ACTIVE` at the read layer too — a real structural guarantee, not just a one-time data fix. This is a deliberate simplification, not a claim that every station's real-world operating status is actually known.
- **`VerificationStatus.ASSUMED` is hidden from every visitor-facing surface, by the same kind of decision** — `PublicVerificationBadge` (`src/components/ui/PublicVerificationBadge.tsx`) wraps `VerificationBadge` and renders nothing specifically for `ASSUMED`, used by every public component that shows a station (`StationCard`, `StationPopupContent`, the station detail page, `RecommendationTool`). Every other real status (including `NEEDS_REVIEW`) still renders normally through it. `VerificationBadge` itself is untouched and still used unfiltered by every admin-only surface (`/admin`, `/admin/verification`, `/admin/stations/[id]/edit`) — that workflow still needs to see and manage the real status, `ASSUMED` included; only the public wrapper hides it.
- **CHAdeMO is hidden from every connector picker** (`SELECTABLE_CONNECTORS`, `src/services/connector-service.ts`) because zero chargers in the seeded dataset use it — an always-empty option removed, not real data hidden. The canonical connector list and alias-recognition logic it's built from are untouched, so a genuinely CHAdeMO-equipped station added later would still import/normalize correctly even though no picker currently offers it as a filter choice.
- **Clustering:** `react-leaflet-cluster`'s `MarkerClusterGroup`, with a custom `iconCreateFunction` (brand-colored count bubble) — a rendering concern entirely inside the wrapper; does not affect the underlying data contract.
- **Overlay UI z-index, learned the hard way:** Leaflet's own panes are `tilePane:200 < overlayPane:400 < shadowPane:500 < markerPane:600 < tooltipPane:650 < popupPane:700`, and its built-in zoom control sits at `z-index:1000` — all as *siblings* competing in the same stacking context as anything else positioned over the map (`.leaflet-container` doesn't isolate its own context by default). A feature-level overlay (the filter/status bar in `MapExplorer.tsx`) that naively used `z-[1000]` buried every popup. Fixed by dropping that overlay to `z-[650]` (between markers and popups) and adding `autoPanPaddingTopLeft` to `<Popup>` so Leaflet's own auto-pan keeps newly-opened popups clear of the fixed UI. Any future fixed UI drawn over the map must stay below `700` for this same reason.

---

## 7. Recommendation Engine Architecture

Implemented (Part 09) as a standalone service module (`src/services/recommendation-engine.ts`), not as logic embedded in the `/recommendations` page. Its full contract — every factor's exact formula, the vehicle input shape, the output/meta shape, and what today's real (mostly coordinate/review-less) dataset means for it in practice — is locked in `docs/recommendation-engine.md`, written before implementation per this section's original instruction. Summary:

1. **Hard eligibility filters first** (connector compatibility, charger not confirmed unavailable, station not confirmed inactive) — a station that fails these is excluded, not merely scored low.
2. **Scored ranking second**, using a single configuration object (`src/lib/config/recommendation-weights.ts`) for the weights (compatibility/distance/power/availability/rating/verification). No component or route hard-codes a weight; everything reads from that one config.
3. **Unknown data never scores as if it were good data** — an unknown rating, unknown availability, or unknown verification status is scored as unknown/neutral-low (`0.25`, `UNKNOWN_FACTOR_SCORE`), never defaulted to a perfect score.
4. **`GET /api/recommendations`, not a mutating route** — a read with no side effects and no persistence (no ML, no per-user history), so it's a `GET` with query params like every other public list endpoint, not a `POST`.

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

The standing rules from Part 00 onward, all verified against the actual implementation in Part 16 (final testing/security review), not just restated:

- Never trust the frontend for authorization or ownership — every sensitive check is re-verified server-side. **Verified:** every mutating Route Handler calls `requireUserForApi()`/`requireAdminForApi()` before touching the database (audited file-by-file in Part 16 — see `src/app/api/**`); every admin page calls `requireAdmin()` independently of `src/proxy.ts`'s redirect.
- Never accept a client-submitted `role` or `user_id` for write operations; both are derived from the authenticated session. **Verified:** `favorite-service.ts`/`review-service.ts`/`report-service.ts` all take `userId` as a caller-derived parameter with no code path for a request body to supply one; registration never reads a `role` field.
- Never return password hashes or internal audit detail through any user-facing API. **Verified:** `passwordHash` is read only in `auth.ts`/`auth-service.ts`, never selected into any API response; `VerificationLog`/`Report` rows are only ever queried by admin-gated code paths.
- Never commit secrets; `.env*` (except `.env.example`) is git-ignored from Part 01 onward. **Verified:** `git ls-files` shows only `.env.example` tracked, containing placeholders only.
- Prisma only — no hand-built raw SQL string concatenation with user input. **Verified:** no `$queryRawUnsafe`/string-concatenated `$queryRaw` calls anywhere in `src/`.
- No XSS-risk patterns: **verified** no `dangerouslySetInnerHTML`, `eval()`, or `new Function()` anywhere in `src/` — user-submitted text (review comments, report descriptions) only ever renders as plain JSX text content, which React escapes by default.
- Every external `target="_blank"` link carries `rel="noopener noreferrer"` (tabnabbing protection) — **verified** across all three occurrences (`/stations/[id]`'s source-map link, Navigate link, and operator website link).
- **A `callbackUrl` query param (used by `/login`'s redirect-after-sign-in, and by `FavoriteButton`/`ReportButton`/`ReviewSection`'s "log in to continue" links) is not a self-built open-redirect risk here.** `src/app/login/actions.ts` passes it straight through to Auth.js's `signIn({ redirectTo })`, and this project's `auth.ts` defines no custom `redirect` callback — so Auth.js's own default one applies (`node_modules/@auth/core/lib/init.js`'s `defaultCallbacks.redirect`), which only allows a relative path or a same-origin absolute URL, silently falling back to the app's own base URL for anything else (e.g. `callbackUrl=https://evil.example`). Confirmed by reading that function directly rather than assuming NextAuth v4-era behavior carried over — this is exactly the kind of installed-version check this project's whole `AGENTS.md` ritual exists for.
- **A deliberately-asymmetric validation rule needs its mutation shape checked.** See §4's `mapUrl` bullet — a stricter rule meant only for "a human typing a fresh value" still ran against a full-state resend that included old, already-invalid data, turning a considered design choice into a real availability bug (an admin locked out of editing one station entirely). Fixed in Part 16; the general lesson is recorded there.

---

## 11. What Part 00 Does *Not* Do

Per the master plan, Part 00 defines decisions and documentation only. No Next.js project, no `package.json`, no Prisma schema file, and no UI code are created in this part — those begin at Part 01 (foundation) and Part 02 (database + dataset import).
