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
