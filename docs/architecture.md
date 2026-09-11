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

- **Library:** Auth.js (NextAuth v5), Credentials provider backed by Prisma.
- **Passwords:** hashed with bcrypt before storage; never logged, never returned by any API.
- **Sessions:** server-side session/JWT via Auth.js; the session payload carries `userId` and `role` only.
- **Roles:** `USER` and `ADMIN`, stored on the `User` row (see data model). Registration **always** creates `USER`. There is no client-controllable way to request `ADMIN`.
- **First admin:** created via a seed script (`prisma/seed.ts`, run manually with an explicit admin email/password from environment variables) or by directly promoting a user's `role` in the database. Never via the public UI.
- **Authorization enforcement:** every protected route and every mutating API route re-checks the session and role **on the server** (in the Route Handler / Server Action / middleware), regardless of what the UI hides. Hiding a button is a UX nicety, never a security boundary.
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
- **Soft deletion:** `Station` (and `Charger`) rows are never hard-deleted by normal admin actions. Deletion sets `is_deleted = true`, `deleted_at`, `deleted_by`, and all normal queries filter `is_deleted = false` by default.

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

- **Library:** `react-leaflet` over Leaflet, tiles from an OpenStreetMap-compatible tile provider configured via `NEXT_PUBLIC_MAP_TILE_URL` (env var, no key committed).
- **Abstraction:** all map access goes through a single wrapper component (`src/components/map/MapProvider.tsx` — name pending Part 05) that exposes a small, provider-agnostic interface (`<StationMap markers center zoom onMarkerClick />`). Nothing outside that wrapper imports Leaflet directly. This lets the tile/provider be swapped later (e.g., to Mapbox or Google Maps) without touching feature code.
- **Coordinates:** the map only ever renders `latitude`/`longitude` pulled from the database. A station with `NULL` coordinates is excluded from the marker layer and flagged in its own UI as having no usable location — coordinates are never invented, defaulted, or geocoded automatically from an address string without explicit admin confirmation.
- **Clustering:** marker clustering is a rendering concern inside the wrapper, added in Part 05; it does not affect the underlying data contract.

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
