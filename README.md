# E Sakhi

**Find. Charge. Go.**

E Sakhi is a smart Electric Vehicle (EV) charging-station discovery and recommendation platform focused primarily on Nepal. It helps EV drivers find charging stations, understand which chargers actually fit their vehicle, estimate charging time, and get station recommendations that account for compatibility, distance, power, availability, rating, and how well-verified the station's data actually is.

> **Status:** early development (Part 00 — architecture lock). No application code exists yet; this README describes the target system as it is being built, part by part. See [Development Roadmap](#development-roadmap) for what's actually implemented today.

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

Application scaffolding (Part 01) hasn't landed yet, so there's no `npm install`/`npm run dev` to run at this stage. Once it does, this section will cover:

- Prerequisites (Node.js version, PostgreSQL)
- `npm install`
- Environment variables (below)
- Database setup (`npx prisma migrate dev`, seeding)
- `npm run dev`

### Environment Variables

Anticipated variables (finalized at Part 01, documented for real in `.env.example`):

```text
DATABASE_URL=              # PostgreSQL connection string
AUTH_SECRET=                # Auth.js session secret
NEXT_PUBLIC_MAP_TILE_URL=    # OpenStreetMap-compatible tile endpoint
NEXT_PUBLIC_APP_URL=          # Public base URL
ADMIN_SEED_EMAIL=              # Used only by the one-time admin seed script
ADMIN_SEED_PASSWORD=
```

No real secrets are ever committed. `.env` / `.env.local` are git-ignored from Part 01 onward; `.env.example` documents variable names only.

### Excel Data Import

The initial dataset is imported from an Excel file (~460 stations / ~517 plug records) via a repeatable, auditable seed/import process — see [docs/data-model.md](docs/data-model.md) and (once written, in Part 14) `docs/data-import.md`. The import pipeline never blindly overwrites admin-verified data: conflicts between imported and existing verified values are surfaced for explicit admin approval.

### Admin Access

There is no public sign-up path to the `ADMIN` role. The first administrator is created via a one-time seed script or a direct, deliberate database promotion — never through the registration form.

## Development Roadmap

Built incrementally, in the order below. Each part is tested, committed, and left in a runnable state before the next begins.

- [x] **Part 00** — Architecture and requirements lock *(this document + `docs/architecture.md` + `docs/data-model.md`)*
- [ ] Part 01 — Project foundation (Next.js app, layout, home page)
- [ ] Part 02 — Database schema + Excel dataset import
- [ ] Part 03 — Authentication
- [ ] Part 04 — Station API
- [ ] Part 05 — Interactive map
- [ ] Part 06 — Search + filters
- [ ] Part 07 — Station details
- [ ] Part 08 — Charging calculator
- [ ] Part 09 — Smart recommendation engine
- [ ] Part 10 — User dashboard, favorites
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
