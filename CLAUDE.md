# CLAUDE.md

Guidance for coding agents and contributors working in this repository.

## Project overview

Censo Operacional e Estrutural das Escolas — SEDUC-PA system for consolidating, analysing and monitoring school operational data.

Monorepo:

- `api/`: Go backend
- `web/`: Next.js frontend
- `infra/`: PostgreSQL bootstrap, migrations, optional Docker setup and env example
- `docs/`: dashboard, analytics, validation and operational documentation

The current administrative flow is PostgreSQL-first. The `/admin` dashboard and the analytical endpoints use PostgreSQL/Railway as their main data source.

The public census form remains in the codebase, but submissions are closed unless `CENSUS_SUBMISSIONS_ENABLED=true`.

## Development commands

### Backend

```bash
cd api

go mod download
go run ./cmd/api
go build ./cmd/api/...
go test ./...
```

Generate the bcrypt hash for the env-admin password:

```bash
cd api
go run ./cmd/genpasswd 'PasswordWithAtLeast12Characters'
```

### Frontend

```bash
cd web

npm install
npm run dev
npm run build
npm run start
npm run lint
```

### Optional local PostgreSQL

Docker is not required when the backend uses Railway PostgreSQL.

If an isolated local database is needed:

```bash
cd infra
docker compose up -d
```

## Environment configuration

Copy:

```bash
cd infra
cp .env.example .env
```

### Standard local setup

Frontend and backend run locally. PostgreSQL remains on Railway.

Use the external PostgreSQL URL exposed by the Railway Postgres service and place it in `DB_DSN`:

```env
PORT=8000
DB_DSN="postgresql://user:password@public-host:port/railway"

ADMIN_USERNAME=admin_local
ADMIN_PASSWORD_HASH=<bcrypt-hash>
ADMIN_JWT_SECRET=<32+-character-random-secret>

ALLOWED_ORIGINS=http://localhost:3000
CENSUS_SUBMISSIONS_ENABLED=false
```

Do not commit real Railway URLs or secrets.

### Database DSN precedence

`api/cmd/api/main.go` resolves the database connection in this order:

1. `DATABASE_URL`
2. `DB_DSN`
3. `DB_HOST` + `DB_PORT` + `DB_USER` + `DB_PASSWORD` + `DB_NAME`

For a backend running locally, `DB_DSN` normally contains the value copied from Railway `DATABASE_PUBLIC_URL`.

For the API service running inside Railway, prefer the private Postgres connection through a Railway reference variable, e.g.:

```text
DB_DSN=${{Postgres.DATABASE_URL}}
```

### Admin auth

Required for the environment-backed admin user:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_JWT_SECRET`

`ADMIN_JWT_SECRET` must be at least 32 characters. The API aborts startup when it is missing or too short.

DRE users can also be loaded from the database by the admin auth flow.

### CORS

The backend reads:

```env
ALLOWED_ORIGINS=http://localhost:3000
```

Do not use the old `CORS_ALLOWED_ORIGINS` name.

### Public census period

`CENSUS_SUBMISSIONS_ENABLED` controls the public write routes.

- `true`: public submissions enabled
- `false`: submissions disabled
- missing: submissions disabled

The current development/admin workflow does not require the form to be open.

### Frontend env

`NEXT_PUBLIC_API_URL` is optional when the backend is available at `http://localhost:8000`; this is already the frontend fallback.

`NEXT_PUBLIC_API_KEY` is also optional. Any `NEXT_PUBLIC_*` value is shipped to the browser and must not be treated as a secret.

## Current architecture

```text
Next.js /admin
    ↓ HTTP + Bearer JWT
Go API /v1/admin/*
    ↓ database/sql + pgx
PostgreSQL / Railway
```

### Backend

- Router: Chi
- SQL access: `database/sql` + `pgx/v5`
- No ORM
- Admin authentication: JWT + bcrypt
- Analytical routes: `/v1/admin/analytics/*`
- Public census write routes are gated by `requireCensusSubmissions`
- Migrations used by the API are embedded from `api/cmd/api/migrations/*.sql`

### Database

Main tables include:

- `schools`
- `census_responses`
- `admin_users`
- analytical/support tables and views created by migrations

`census_responses.data` stores census answers in JSONB.

### Frontend

- `web/src/app/page.tsx`: public census flow
- `web/src/app/admin/`: administrative dashboard entrypoints
- `web/src/components/admin/`: dashboard tabs/components
- `web/src/components/forms/`: public census form steps
- `web/src/components/admin/shared/api.ts`: admin HTTP client/cache

## PostgreSQL-first dashboard

New dashboard work must use PostgreSQL when the required data already exists there.

The preferred path is:

```text
PostgreSQL
  → views / parameterized analytical queries
    → /v1/admin/analytics/*
      → Next.js admin components
```

Do not create a new Google Sheets dependency for data already stored in PostgreSQL.

## Google Sheets / Drive legacy

The repository still contains legacy Google integration code, including `SheetsService`, `DriveService`, sync endpoints/jobs and a small amount of fallback code.

Important distinction:

- Google configuration is **not required** for the standard local `/admin` workflow.
- Missing Google credentials must not be treated as a blocker for the PostgreSQL-backed admin flow.
- Do not document Google Cloud/Sheets/Drive as a prerequisite for normal development.
- Do not add new features that depend on Sheets when PostgreSQL is the intended source.
- Removal of legacy Google code should be done as a dedicated cleanup change because routes/services/fallbacks still exist and must be removed coherently.

Legacy env names may include:

- `GOOGLE_CREDENTIALS_JSON`
- `SPREADSHEET_ID`
- `DRIVE_ROOT_FOLDER_ID`
- `GOOGLE_IMPERSONATE_EMAIL`

They should remain out of the standard `.env` setup instructions.

## Public API key

The optional public endpoint gate reads:

```env
PUBLIC_API_KEY=...
```

The frontend counterpart is:

```env
NEXT_PUBLIC_API_KEY=...
```

Do not confuse these with a legacy/general `API_KEY` variable. The backend code checks `PUBLIC_API_KEY`.

Because `NEXT_PUBLIC_API_KEY` is visible in the browser, it is not a security boundary equivalent to admin JWT authentication.

## Development rules

- Do not introduce an ORM; the project deliberately uses raw SQL through `database/sql` + `pgx`.
- Use parameterized SQL for all user-controlled values.
- Keep migrations idempotent where the current migration loader expects repeatable execution.
- Do not commit `.env`, Railway URLs, passwords, JWT secrets, API keys or Google service-account credentials.
- Do not change the public census form flow unless the task explicitly requires it.
- Do not silently enable `CENSUS_SUBMISSIONS_ENABLED`.
- Prefer small, scoped changes over broad rewrites.
- New admin analytics should read PostgreSQL directly rather than recreating spreadsheet-backed metrics.
- When touching admin authentication, preserve role scoping for `admin` and `dre` users.
- When running destructive SQL or migrations locally, confirm which Railway environment/database is configured first.

## Migrations

The API embeds SQL migrations from:

```text
api/cmd/api/migrations/*.sql
```

The repository also maintains infrastructure SQL under `infra/` for operational/reference purposes.

When adding analytical SQL:

- use safe casts for JSONB values
- use `NULLIF(..., '')` where empty strings should become null
- use parameterized filters in Go handlers
- prefer `CREATE OR REPLACE VIEW` / `IF NOT EXISTS` where repeatability is required

Example numeric JSONB cast pattern:

```sql
CASE
  WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$'
  THEN (data->>'campo')::numeric
END AS campo
```

## Security notes

- `ADMIN_JWT_SECRET` must stay server-side.
- `ADMIN_PASSWORD_HASH` is a bcrypt hash, never a plaintext password.
- Configure `ALLOWED_ORIGINS` explicitly for production.
- Treat a local connection to Railway production as production access.
- Avoid bulk scans/transfers of full census JSONB over the public Railway TCP proxy when a narrower SQL query can return only the needed fields.
- Prefer a staging database/environment for development when available.

## Useful references

- `README.md` — current setup and architecture
- `infra/.env.example` — current env template
- `docs/dashboard/` — analytical/dashboard implementation notes
- `docs/diagnostico-saude-operacional-execucao-local.md` — measured behaviour of local backend + remote Railway PostgreSQL
- `docs/guia_views_analiticas_baseado_repositorio_censo.md` — analytical SQL methodology

When older documents conflict with the current code, `README.md`, `infra/.env.example` and the implementation on `develop` take precedence.
