# Censo Operational and Structural Survey of Schools (SEDUC-PA)

> English documentation for the Censo Operational and Structural Survey of Schools.
>
> **Primary documentation:** The Portuguese (Brazil) documentation in the repository root (`README.md`) remains the canonical version for the public-sector deployment. This English document is a translation/reference for technical teams and international collaborators.

## Overview

This repository contains the source code for the school infrastructure, human resources, and school-profile survey system operated by the State Department of Education of Pará (SEDUC-PA).

The system provides a secure and robust interface through which school principals and education managers submit structured information about their schools. The survey uses a multi-step wizard with strict client- and server-side validation to maintain data consistency.

## Main Features

- **Multi-step data collection:** The survey is divided into 14 logical sections to reduce cognitive load and improve the completion experience.
- **Draft persistence:** Partially completed responses can be saved and completed asynchronously.
- **Robust validation:** Data integrity is enforced across multiple layers using Zod schemas on the web application and server-side validation in the API.
- **Google ecosystem integration:** Data can be synchronized and exported through Google Drive and Google Sheets APIs.
- **Report generation:** Census data can be exported to PDF using jsPDF.
- **Security:** Authentication, request validation, CORS controls, and protections against common web attacks are part of the application architecture.

## Technical Architecture

The project is organized as a **monorepo**, keeping the frontend, backend, and infrastructure configuration in one version-controlled repository.

### Technology Stack

#### Backend

- **Go 1.24**
- **Chi** for HTTP routing and middleware
- **PGX with `database/sql`** for PostgreSQL access, without an ORM
- **Google Drive and Google Sheets APIs** for integrations
- **Excelize** for native Excel file handling

#### Frontend

- **React 19**
- **Next.js 16** with the App Router
- **TypeScript** with strict typing
- **Tailwind CSS v3**
- **Radix UI Primitives**
- **Lucide Icons**
- **React Hook Form + Zod** for form handling and schema validation

#### Database and Infrastructure

- **PostgreSQL 16**
- **Adminer** for database administration
- **Docker and Docker Compose** for local infrastructure

## Repository Structure

```text
CENSO-Operacional-Escolas/
├── api/                          # Go backend
│   ├── cmd/
│   │   ├── api/main.go          # API entry point
│   │   └── genpasswd/main.go    # bcrypt password-hash generator
│   ├── internal/
│   │   ├── models/              # Data models
│   │   └── services/            # Application and integration services
│   ├── go.mod
│   └── go.sum
├── web/                          # Next.js frontend
│   ├── src/
│   │   ├── app/                 # Next.js routes
│   │   ├── components/          # React components
│   │   ├── schemas/             # Zod validation schemas
│   │   └── config/              # Frontend configuration
│   ├── package.json
│   └── tsconfig.json
├── infra/                        # Infrastructure configuration
│   ├── docker-compose.yml
│   ├── init.sql
│   ├── .env.example
│   └── migrations/
├── docs/                         # Additional project documentation
└── README.md                     # Canonical Portuguese documentation
```

## Running the Project Locally

### Prerequisites

Install the following tools before starting:

- Go 1.24 or later
- Node.js 20+ with npm
- Docker and Docker Compose
- Git

### 1. Configure Environment Variables

Copy the example environment file:

```bash
cd infra
cp .env.example .env
```

Configure `/infra/.env` with the values required by the local environment. The main variables include:

```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=censo_user
DB_PASSWORD=<secure-local-password>
DB_NAME=censo_operacional

PORT=8000
ADMIN_PASSWORD_HASH=<bcrypt-password-hash>
ADMIN_JWT_SECRET=<secure-secret-at-least-32-characters>

NEXT_PUBLIC_API_URL=http://localhost:8000

GOOGLE_CREDENTIALS_JSON={}
SPREADSHEET_ID=
GOOGLE_DRIVE_FOLDER_ID=

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
```

Do not commit real credentials, passwords, JWT secrets, or service-account keys.

### 2. Start PostgreSQL and Adminer

Generate an administrator password hash from the `api` directory:

```bash
cd api
go run ./cmd/genpasswd/main.go
```

Put the generated bcrypt hash in `ADMIN_PASSWORD_HASH` in the local `.env` file.

Then start the database services:

```bash
cd infra
docker-compose up -d
docker-compose ps
```

Local services:

- PostgreSQL: `localhost:5432`
- Adminer: `http://localhost:8080`

For Adminer, use PostgreSQL as the system and `postgres` as the Docker service hostname.

### 3. Start the Go API

```bash
cd api
go mod download
go run ./cmd/api
```

Verify the health endpoint:

```bash
curl http://localhost:8000/v1/health
```

Expected response:

```json
{ "status": "ok" }
```

### 4. Start the Next.js Frontend

In another terminal:

```bash
cd web
npm install
npm run dev
```

The frontend is available at:

```text
http://localhost:3000
```

The administrative dashboard is available at:

```text
http://localhost:3000/admin
```

and requires authentication.

## Google Integration

Google Sheets and Google Drive integration is optional for local development.

To enable it:

1. Create a project in Google Cloud.
2. Enable the Google Sheets API and Google Drive API.
3. Create a service account and obtain its credentials.
4. Configure `GOOGLE_CREDENTIALS_JSON`, `SPREADSHEET_ID`, and `GOOGLE_DRIVE_FOLDER_ID` in the local environment.

Without these variables, the application can run locally without automatic Google Sheets synchronization.

## Development Commands

### Backend

```bash
cd api

go run ./cmd/api/main.go
go build -o bin/census ./cmd/api
go run ./cmd/genpasswd/main.go
go mod download
go mod tidy
```

### Frontend

```bash
cd web

npm install
npm run dev
npm run build
npm run start
npm run lint
npm run format
```

### Infrastructure

```bash
cd infra

docker-compose up -d
docker-compose down
docker-compose logs -f
docker-compose down -v
```

> `docker-compose down -v` removes the local database volumes and therefore deletes locally stored database data.

## Data Flow

```text
School Principals / Managers
        │
        │ Survey submission
        ▼
Next.js Frontend
        │
        │ HTTP API
        ▼
Go Backend
  ├── Validation
  ├── Authentication (JWT)
  └── Business Logic
        │
        │ INSERT / UPDATE
        ▼
PostgreSQL
  ├── Census responses
  ├── Schools
  └── Structured survey data
        │
        │ Optional background synchronization
        ▼
Google Sheets / Google Drive
```

## Security Notes

Because this system handles information belonging to a public-sector education operation, development and deployment should follow the repository's security guidance and operational controls.

At a minimum:

- Keep secrets and credentials outside version control.
- Use strong, unique values for administrative passwords and JWT signing secrets.
- Restrict CORS origins to trusted application origins in production.
- Use HTTPS for deployed environments.
- Avoid exposing PostgreSQL or Adminer directly to the public internet.
- Validate and authorize administrative operations on the server side.
- Treat exported census data as protected operational information and apply the organization's access-control and retention requirements.

## Troubleshooting

### API connection refused on port 8000

- Confirm that the Go API is running.
- Check whether another process is using port 8000.
- Verify `NEXT_PUBLIC_API_URL`.

### Port 3000 already in use

Identify the process using port 3000 and stop it, or run Next.js on another local port.

### Database connection problems

- Confirm the PostgreSQL container is running with `docker-compose ps`.
- Verify the database variables in `/infra/.env`.
- Confirm that the API is using the same database host and credentials configured for the Docker environment.

## Documentation Language Policy

The repository intentionally keeps **Portuguese (Brazil) as the primary documentation language** because the Censo is a public-sector application operated in Pará, Brazil.

- **Primary:** [`README.md`](../README.md) — Portuguese (Brazil)
- **English reference:** this document — `docs/README.en.md`

Changes to the canonical Portuguese documentation should remain authoritative when translations differ. The English documentation is intended to improve accessibility for technical contributors and should be updated when major architectural or operational documentation changes are introduced.
