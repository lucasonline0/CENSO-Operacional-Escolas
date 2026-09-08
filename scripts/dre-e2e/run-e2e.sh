#!/usr/bin/env bash
# gate E2E de PERFIL DRE contra a stack REAL (sem mocks).
#
#   PostgreSQL 16 efêmero (docker) + infra/init.sql
#     -> API Go (aplica migrations reais 0001-0024 no startup)
#     -> seed canônico (dres / schools com dre_id / census_responses / usuários DRE)
#     -> Next.js production (porta isolada)
#     -> Playwright (web/e2e/dre-lifecycle.spec.ts)
#
# Tudo é descartado no final (trap). Falha em qualquer etapa = gate vermelho.
# Uso local:  scripts/dre-e2e/run-e2e.sh
# No CI:      CI=true scripts/dre-e2e/run-e2e.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI="${CI:-false}"

PG_IMAGE="${CENSUS_E2E_PG_IMAGE:-postgres:16-alpine}"
PG_PORT="${CENSUS_E2E_PG_PORT:-54329}"
API_PORT="${CENSUS_E2E_API_PORT:-8001}"
WEB_PORT="${CENSUS_E2E_WEB_PORT:-3100}"

PG_CONTAINER="censo-e2e-pg-$$"
DB_NAME="censo_e2e"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${PG_PORT}/${DB_NAME}?sslmode=disable"

E2E_DRE_A_NAME="${E2E_DRE_A_NAME:-DRE A}"
E2E_DRE_B_NAME="${E2E_DRE_B_NAME:-DRE B}"
ADMIN_USERNAME="${E2E_ADMIN_USERNAME:-e2e.admin}"
DRE_A_USERNAME="${E2E_DRE_A_USERNAME:-e2e.dre_a}"
DRE_B_USERNAME="${E2E_DRE_B_USERNAME:-e2e.dre_b}"

WORK="$(mktemp -d /tmp/censo-e2e.XXXXXX)"
LOGS="$WORK/logs"
mkdir -p "$LOGS"
API_BIN="$WORK/api"
ADMIN_USER_BIN="$WORK/admin-user"
GENPASSWD_BIN="$WORK/genpasswd"

API_PID=""
WEB_PID=""

log()  { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '\n\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
    log "teardown: parando web/api e removendo postgres efêmero ($PG_CONTAINER)"
    [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
    [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
    docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "comando obrigatório ausente: $1"; }
require_cmd docker
require_cmd curl
require_cmd openssl

pg_sql() { docker exec -i "$PG_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"; }

# ─── 1. PostgreSQL efêmero ───────────────────────────────────────────────
log "iniciando PostgreSQL 16 efêmero ($PG_IMAGE) na porta ${PG_PORT}"
docker run -d --rm --name "$PG_CONTAINER" \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB_NAME" \
    -p "127.0.0.1:${PG_PORT}:5432" "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
    docker exec "$PG_CONTAINER" pg_isready -U postgres -d "$DB_NAME" -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 1
done
docker exec "$PG_CONTAINER" pg_isready -U postgres -d "$DB_NAME" -h 127.0.0.1 >/dev/null 2>&1 \
    || fail "postgres não ficou pronto"

# ─── 2. Schema base ─────────────────────────────────────────────────────
log "aplicando infra/init.sql (schema base)"
docker exec -i "$PG_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 \
    <"$ROOT/infra/init.sql" >"$LOGS/init.log" 2>&1 || fail "init.sql falhou (veja $LOGS/init.log)"

# ─── 3. Binários Go (API com migrations embutidas; CLIs de provisionamento)
log "buildando API Go + CLIs (admin-user, genpasswd)"
(cd "$ROOT/api" && go build -o "$API_BIN" ./cmd/api \
    && go build -o "$ADMIN_USER_BIN" ./cmd/admin-user \
    && go build -o "$GENPASSWD_BIN" ./cmd/genpasswd)

# ─── 4. Credenciais efêmeras ────────────────────────────────────────────
ADMIN_PASSWORD="$(openssl rand -hex 16)"
DRE_A_PASSWORD="$(openssl rand -hex 16)"
DRE_B_PASSWORD="$(openssl rand -hex 16)"
ADMIN_JWT_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD_HASH="$("$GENPASSWD_BIN" "$ADMIN_PASSWORD" | sed -n 's/^ADMIN_PASSWORD_HASH=//p')"
[ -n "$ADMIN_PASSWORD_HASH" ] || fail "falha ao gerar hash bcrypt do admin"

cat >"$WORK/secrets.env" <<EOF
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
DRE_A_USERNAME=$DRE_A_USERNAME
DRE_A_PASSWORD=$DRE_A_PASSWORD
DRE_B_USERNAME=$DRE_B_USERNAME
DRE_B_PASSWORD=$DRE_B_PASSWORD
EOF

# ─── 5. API Go (aplica migrations 0001-0024 no startup) ────────────────
log "iniciando API Go na porta ${API_PORT} (migrations reais no startup)"
env \
    PORT="$API_PORT" \
    DATABASE_URL="$DATABASE_URL" \
    ADMIN_USERNAME="$ADMIN_USERNAME" \
    ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" \
    ADMIN_JWT_SECRET="$ADMIN_JWT_SECRET" \
    ALLOWED_ORIGINS="$WEB_URL" \
    "$API_BIN" >"$LOGS/api.log" 2>&1 &
API_PID=$!

for _ in $(seq 1 60); do
    curl -fsS "$API_URL/v1/health" >/dev/null 2>&1 && break
    sleep 1
done
curl -fsS "$API_URL/v1/health" >/dev/null 2>&1 \
    || { tail -n 80 "$LOGS/api.log"; fail "API não respondeu — migration/startup falhou"; }

# ─── 6. Verificação do schema canônico (0019/0020/0021/0024) ────────────
log "verificando schema canônico do perfil DRE"
pg_sql <<'SQL'
DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'dres') <> 1 THEN
        RAISE EXCEPTION 'bloco: tabela dres ausente (migration 0019)';
    END IF;
    IF (SELECT count(*) FROM pg_constraint
        WHERE conname IN ('fk_schools_dre_id', 'fk_admin_users_dre_id',
                          'chk_schools_dre_canonical', 'chk_admin_users_role_dre_id')) <> 4 THEN
        RAISE EXCEPTION 'bloco: vínculos canônicos dre_id ausentes (migration 0020)';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users'
          AND column_name = 'auth_version') <> 1 THEN
        RAISE EXCEPTION 'bloco: admin_users.auth_version ausente (migration 0024)';
    END IF;
END $$;
SQL

# ─── 7. Seed canônico ───────────────────────────────────────────────────
log "semeadura: dres -> schools (dre_id) -> census_responses"
pg_sql >"$LOGS/seed.log" 2>&1 <<SQL
INSERT INTO dres (nome) VALUES ('$E2E_DRE_A_NAME') ON CONFLICT (nome) DO NOTHING;
INSERT INTO dres (nome) VALUES ('$E2E_DRE_B_NAME') ON CONFLICT (nome) DO NOTHING;

INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id)
SELECT v.nome, v.inep, v.municipio, v.zona, d.id
FROM (VALUES
    ('Escola A1', '260001E1', 'Municipio A1', 'Urbana'),
    ('Escola A2', '260002E1', 'Municipio A1', 'Rural'),
    ('Escola A3', '260003E1', 'Municipio A2', 'Urbana')
) AS v(nome, inep, municipio, zona)
JOIN dres d ON d.nome = '$E2E_DRE_A_NAME';

INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id)
SELECT v.nome, v.inep, v.municipio, v.zona, d.id
FROM (VALUES
    ('Escola B1', '260101E1', 'Municipio B1', 'Urbana'),
    ('Escola B2', '260102E1', 'Municipio B1', 'Rural'),
    ('Escola B3', '260103E1', 'Municipio B2', 'Urbana')
) AS v(nome, inep, municipio, zona)
JOIN dres d ON d.nome = '$E2E_DRE_B_NAME';

INSERT INTO census_responses (school_id, year, status, data)
SELECT s.id, 2026, 'completed', '{"total_alunos":"120","alunos_pcd":"4","turmas_manha":"6"}'::jsonb
FROM schools s;
SQL

log "criando usuários DRE no banco canônico (CLI real)"
DATABASE_URL="$DATABASE_URL" "$ADMIN_USER_BIN" create \
    -username "$DRE_A_USERNAME" -dre "$E2E_DRE_A_NAME" -password "$DRE_A_PASSWORD" \
    >"$LOGS/admin-user.log" 2>&1
DATABASE_URL="$DATABASE_URL" "$ADMIN_USER_BIN" create \
    -username "$DRE_B_USERNAME" -dre "$E2E_DRE_B_NAME" -password "$DRE_B_PASSWORD" \
    >>"$LOGS/admin-user.log" 2>&1

# ─── 8. Frontend Next.js (production) ───────────────────────────────────
log "buildando frontend Next.js com NEXT_PUBLIC_API_URL=$API_URL"
(cd "$ROOT/web" && NEXT_PUBLIC_API_URL="$API_URL" npm run build) >"$LOGS/web-build.log" 2>&1 \
    || { tail -n 60 "$LOGS/web-build.log"; fail "build do frontend falhou"; }

log "iniciando Next.js production na porta ${WEB_PORT}"
(cd "$ROOT/web" && npm run start -- -p "$WEB_PORT") >"$LOGS/web.log" 2>&1 &
WEB_PID=$!
for _ in $(seq 1 60); do
    curl -fsS "$WEB_URL/admin/" >/dev/null 2>&1 && break
    sleep 1
done
curl -fsS "$WEB_URL/admin/" >/dev/null 2>&1 \
    || { tail -n 60 "$LOGS/web.log"; fail "frontend não subiu"; }

# ─── 9. Playwright ──────────────────────────────────────────────────────
log "instalando/verificando chromium (Playwright)"
cd "$ROOT/web"
if [ "$CI" = "true" ]; then
    sudo npx playwright install --with-deps chromium
else
    npx playwright install chromium
fi

log "rodando E2E de perfil DRE (stack real; portas ${API_PORT}/${WEB_PORT})"
set +e
E2E_WEB_URL="$WEB_URL" \
E2E_API_URL="$API_URL" \
E2E_ADMIN_USERNAME="$ADMIN_USERNAME" \
E2E_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
E2E_DRE_A_NAME="$E2E_DRE_A_NAME" \
E2E_DRE_A_USERNAME="$DRE_A_USERNAME" \
E2E_DRE_A_PASSWORD="$DRE_A_PASSWORD" \
E2E_DRE_B_NAME="$E2E_DRE_B_NAME" \
E2E_DRE_B_USERNAME="$DRE_B_USERNAME" \
E2E_DRE_B_PASSWORD="$DRE_B_PASSWORD" \
npm run e2e >"$LOGS/e2e.log" 2>&1
E2E_STATUS=$?
set -e

if [ "$E2E_STATUS" -ne 0 ]; then
    echo ""
    echo "═══════════════════════ LOGS E2E (tail) ═══════════════════════"
    tail -n 100 "$LOGS/e2e.log"
    echo "═══════════════════════════════════════════════════════════════"
    echo "artefatos em caso de falha: web/playwright-report e web/test-results"
    echo "credenciais efêmeras da rodada: $WORK/secrets.env (debug local)"
    exit "$E2E_STATUS"
fi

log "E2E de perfil DRE OK — suíte integra passou na stack real"