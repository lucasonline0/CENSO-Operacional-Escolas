# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Censo Operacional e Estrutural das Escolas — a census system for SEDUC-PA (Secretaria de Estado de Educação do Pará) to collect school infrastructure, personnel, and profile data from 800+ schools. A monorepo with a Go API backend, Next.js frontend, and PostgreSQL database.

## Development Commands

### Backend (`/api`)
```bash
# Run development server (requires DB running)
go run ./cmd/api/main.go

# Generate bcrypt password hash for ADMIN_PASSWORD_HASH
go run ./cmd/genpasswd/main.go

# Build
go build ./cmd/api/...
```

### Frontend (`/web`)
```bash
npm run dev       # Dev server on port 3000
npm run build     # Production build
npm run start     # Production server
npm run lint      # ESLint
```

### Infrastructure (`/infra`)
```bash
docker-compose up -d     # Start PostgreSQL (5432) + Adminer (8080)
docker-compose down      # Stop services
```

## Environment Configuration

Copy `/infra/.env.example` to `/infra/.env`. Key variables:
- `DB_HOST/PORT/USER/PASSWORD/NAME` — PostgreSQL connection
- `PORT=8000` — Go API port
- `ADMIN_PASSWORD_HASH` — bcrypt hash (use `go run ./cmd/genpasswd/main.go` to generate)
- `ADMIN_JWT_SECRET` — secret for JWT token signing
- `GOOGLE_CREDENTIALS_JSON` — service account JSON for Sheets/Drive
- `SPREADSHEET_ID` — target Google Sheet ID
- `NEXT_PUBLIC_API_URL=http://localhost:8000` — consumed by Next.js

## Architecture

### Data Flow
```
School Director fills multi-step form (Next.js)
  → POST /census (Go API)
  → PostgreSQL (census_responses table, JSONB data field)
  → Background sync job (every 10 min) → Google Sheets
  ← Admin dashboard reads metrics via /admin/* endpoints
```

### Backend (`/api`)
- **Entry point**: `cmd/api/main.go` — wires routes, DB connection, starts background sync job
- **Handlers**: `cmd/api/handlers.go` — public census/school endpoints; `cmd/api/admin.go` — JWT-protected admin endpoints
- **Models**: `internal/models/models.go` — `School` and `CensusResponse` structs
- **Services**: `internal/services/sheets.go` (Google Sheets sync), `internal/services/drive.go` (photo uploads)
- **No ORM** — uses `database/sql` + `pgx/v5` driver with raw SQL
- **Auth**: JWT (2-hour expiry), bcrypt passwords, rate limiting (5 login attempts / 15 min / IP)
- Router: Chi (`github.com/go-chi/chi/v5`), all routes under `/v1/`

### Database Schema (`/infra/init.sql`)
- `schools` — school master data (INEP code unique, JSON fields for turnos/etapas/modalidades)
- `census_responses` — one row per (school_id, year), `data JSONB` stores all form answers, unique constraint on (school_id, year)

### Frontend (`/web`)
- **Entry points**: `src/app/page.tsx` (11-step census wizard), `src/app/admin/page.tsx` (admin dashboard — large file ~50KB)
- **Form steps**: 11 components in `src/components/forms/` (step 1 = identification through step 11 = observations)
- **Validation**: Zod schemas in `src/schemas/` mirror backend expectations; step-specific schemas in `src/schemas/steps/`
- **Step config**: `src/config/steps.ts` defines the `CENSUS_STEPS` array that drives the wizard
- **Draft persistence**: localStorage caches school ID and current step
- **UI**: Tailwind CSS + Radix UI primitives + shadcn/ui (configured via `components.json`)
- **PDF export**: jsPDF generates downloadable census report
- **Security**: CSP headers configured in `next.config.ts` for the `/admin` route

### Google Integration
- `SheetsService` in `internal/services/sheets.go` batch-writes completed census rows
- Background retry job (10-min interval) re-syncs any census where `sheet_synced_at IS NULL`
- Drive service handles photo uploads to a configurable root folder

## Key Conventions

- Census `status` field: `'draft'` or `'completed'` — only `completed` records sync to Sheets
- INEP code is the canonical school identifier (8 digits, unique)
- Admin routes all require `Authorization: Bearer <token>` header
- CORS allowed origins are configured at startup from environment
- The frontend reads location data (DRE/município lists) from the Go API via `GET /locations`, which fetches from Google Sheets

## Active Development Track — Admin Dashboard Migration

The admin dashboard (`/admin`) is being incrementally migrated from Google Sheets to PostgreSQL as its analytical source. Treat this as an active, multi-phase track; new work should respect the current state and the documented phases.

### Current state (hybrid)

- **Operational tab** ("Operacional", "Todos os Censos", "Por DRE") already reads from PostgreSQL via `/v1/admin/dashboard` and `/v1/admin/census`.
- **Analytical tab** ("Caracterização da Rede"): main KPI cards now read from PostgreSQL via `/v1/admin/analytics/overview` (Phase 1 — landed). Donuts, bar charts and the DRE table on this tab still read from Google Sheets via `/v1/admin/sheet-metrics`.
- **Student profile tab** ("Perfil dos Alunos e Resultados") still reads entirely from Google Sheets via `/v1/admin/indicadores-metrics`.
- The form flow and Sheets sync are unchanged.

### Target architecture

```txt
PostgreSQL
  → SQL views / analytical queries / indicator services
    → protected /v1/admin/analytics/* endpoints
      → Next.js admin dashboard
```

### Sheets must remain functional

Do **not** remove or disable any of the following:

- `GET /v1/locations` — used by the public form.
- `SheetsService.AppendCenso` — writes completed censuses to the sheet.
- `sheetSyncRetryJob` (10-min ticker in `main.go`).
- `POST /v1/admin/sync-sheets` — manual resync button.
- `GET /v1/admin/sheet-metrics` and `GET /v1/admin/indicadores-metrics` — still consumed by parts of `/admin`.

`sheet-metrics` and `indicadores-metrics` will be retired only in a future phase (see roadmap), after:
1. the UI is fully decoupled from those endpoints,
2. numerical parity vs. PostgreSQL is validated and documented,
3. an explicit deprecation phase is signed off.

### Incremental development rules

- Do **not** refactor `/admin` as a whole — change one card / one section at a time.
- Do **not** alter `POST /v1/census` (form submission path) without an explicit request.
- Do **not** change the form flow (steps, schemas, persistence) unless asked.
- Do **not** introduce an ORM — the project deliberately uses `database/sql` + `pgx/v5`.
- Do **not** replace the Go backend or rewrite handlers wholesale.
- Do **not** remove existing endpoints without a deprecation phase.
- Prefer **small, reversible PRs** with a paired validation note (numbers compared against the current Sheets-backed view).

### Parallel work after Phase 1

After Phase 1 landed, the track is intentionally split into two frentes that can progress in parallel without scope conflict:

- **Frente A — documentação/qualidade de dados:** formaliza critérios de contagem, INEP repetido e divergências PostgreSQL × Sheets. Toca apenas em `docs/`.
- **Frente B — backend analítico:** entrega `vw_censo_enriquecida` e os endpoints `/v1/admin/analytics/caracterizacao/*` (Fase 2A), **sem migrar a UI inteira**.

See `docs/dashboard/plano-trabalho-paralelo.md` for what each frente may and may not touch.

### Analytical migrations

- Place new SQL in `infra/migrations/NNNN_<descricao>.sql`. A loader in `main.go` (`applyMigrations`) runs every `.sql` in that directory at startup, in alphabetical order.
- Migrations must be **idempotent** — prefer `CREATE OR REPLACE VIEW`, `IF NOT EXISTS`, etc. No version table for now; the loader simply re-applies every file.
- Replicate essential views also in `infra/init.sql` so that fresh environments (new docker-compose, new Railway DB) have them on first boot. Or, rely on `applyMigrations` if a startup hook is acceptable for that environment.
- Use **safe casts** when reading from `census_responses.data` JSONB. The canonical pattern (see `0001_vw_censo_base.sql`) is:
  ```sql
  CASE WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN (data->>'campo')::numeric END AS campo
  ```
  This tolerates missing keys, JSON `null`, empty strings and non-numeric text — it never raises.
- For categorical fields, prefer `NULLIF(data->>'campo', '')`.
- New analytical endpoints live under `/v1/admin/analytics/*` and must be registered inside the JWT-protected `chi.Router` group in `main.go`.
- All SQL uses parameterized queries (`$1`, `$2`, ...). Never interpolate user input.

### Reference documents

When working on this track, consult (in this order):

- `docs/roadmap-dashboard-proprio.md` — phases, target architecture, acceptance criteria.
- `docs/checklist-dashboard-proprio.md` — executable checklist per phase.
- `docs/dashboard/jsonb-field-inventory.md` — what is actually stored in `census_responses.data`.
- `docs/dashboard/validacao-fase-1.md` — Phase 1 parity template (filled in homologação).
- `docs/dashboard/plano-trabalho-paralelo.md` — escopo das frentes A (docs/qualidade) e B (backend Fase 2A).
- `docs/guia_views_analiticas_baseado_repositorio_censo.md` — methodological reference for the full set of views.
