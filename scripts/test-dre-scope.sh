#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
: "${DRE_USER:?export DRE_USER=<usuario-dre>}"
: "${DRE_PASSWORD:?export DRE_PASSWORD=<senha-dre>}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "erro: '$1' é obrigatório" >&2
    exit 1
  }
}
need curl
need jq

request() {
  local path="$1"
  curl -fsS \
    -H "Authorization: Bearer ${TOKEN}" \
    "${API_URL}${path}"
}

echo "[1/6] login DRE em ${API_URL}"
LOGIN="$({
  curl -fsS -X POST "${API_URL}/v1/admin/login" \
    -H 'Content-Type: application/json' \
    --data "$(jq -nc --arg u "$DRE_USER" --arg p "$DRE_PASSWORD" '{username:$u,password:$p}')"
})"
TOKEN="$(jq -er '.data.token' <<<"$LOGIN")"

echo "[2/6] validando identidade canônica"
ME="$(request /v1/admin/me)"
ROLE="$(jq -r '.data.role' <<<"$ME")"
DRE_ID="$(jq -r '.data.dre_id // empty' <<<"$ME")"
DRE_NAME="$(jq -r '.data.dre // empty' <<<"$ME")"

if [[ "$ROLE" != "dre" || -z "$DRE_ID" || "$DRE_ID" == "0" || -z "$DRE_NAME" ]]; then
  echo "falha: /admin/me não retornou um escopo DRE canônico válido" >&2
  jq . <<<"$ME" >&2
  exit 1
fi
printf '  role=%s dre_id=%s dre=%s\n' "$ROLE" "$DRE_ID" "$DRE_NAME"

echo "[3/6] dashboard operacional"
DASHBOARD="$(request /v1/admin/dashboard)"
jq '.data | {total_schools, completed_censuses, draft_censuses, by_dre, recent_count:(.recent|length)}' <<<"$DASHBOARD"

BAD_DRE="${FOREIGN_DRE:-__DRE_QUE_NAO_E_A_MINHA__}"
ENC_BAD_DRE="$(jq -nr --arg v "$BAD_DRE" '$v|@uri')"

echo "[4/6] tentativa de ampliar escopo via ?dre=${BAD_DRE}"
CENSUS="$(request "/v1/admin/census?year=${YEAR:-$(date +%Y)}&limit=100&page=1&dre=${ENC_BAD_DRE}")"
LEAKS="$(jq --arg dre "$DRE_NAME" '[.data.rows[]? | select(.dre != $dre)] | length' <<<"$CENSUS")"
if [[ "$LEAKS" != "0" ]]; then
  echo "falha crítica: /admin/census retornou linha de outra DRE" >&2
  jq . <<<"$CENSUS" >&2
  exit 1
fi
printf '  total retornado dentro do escopo: %s\n' "$(jq -r '.data.total' <<<"$CENSUS")"

echo "[5/6] opções de filtro não podem vazar outras DREs/escolas"
OPTIONS="$(request "/v1/admin/analytics/filtros/opcoes?dre=${ENC_BAD_DRE}")"
BAD_DRE_OPTIONS="$(jq --arg dre "$DRE_NAME" '[.data.dres[]? | select(. != $dre)] | length' <<<"$OPTIONS")"
BAD_SCHOOL_OPTIONS="$(jq --arg dre "$DRE_NAME" '[.data.escolas[]? | select(.dre != $dre)] | length' <<<"$OPTIONS")"
if [[ "$BAD_DRE_OPTIONS" != "0" || "$BAD_SCHOOL_OPTIONS" != "0" ]]; then
  echo "falha crítica: filtros expuseram dados fora da DRE autenticada" >&2
  jq . <<<"$OPTIONS" >&2
  exit 1
fi
jq '.data | {anos, dres, municipios, zonas, escolas:(.escolas|length), codigos_inep:(.codigos_inep|length)}' <<<"$OPTIONS"

echo "[6/6] preenchimento por DRE"
FILL="$(request "/v1/admin/analytics/preenchimento/dre?year=${YEAR:-$(date +%Y)}&dre=${ENC_BAD_DRE}")"
BAD_FILL="$(jq --arg dre "$DRE_NAME" '[.data.dres[]? | select(.dre != $dre)] | length' <<<"$FILL")"
if [[ "$BAD_FILL" != "0" ]]; then
  echo "falha crítica: preenchimento retornou outra DRE" >&2
  jq . <<<"$FILL" >&2
  exit 1
fi
jq '.data | {ano_referencia,total_escolas,total_completed,total_draft,total_pending,dres}' <<<"$FILL"

if [[ -n "${FOREIGN_SCHOOL_ID:-}" ]]; then
  echo "[extra] testando school_id estrangeiro=${FOREIGN_SCHOOL_ID}"
  FOREIGN_SCHOOL="$(request "/v1/admin/census?year=${YEAR:-$(date +%Y)}&limit=100&page=1&school_id=${FOREIGN_SCHOOL_ID}")"
  if [[ "$(jq -r '.data.total' <<<"$FOREIGN_SCHOOL")" != "0" ]]; then
    echo "falha crítica: school_id estrangeiro retornou dados" >&2
    jq . <<<"$FOREIGN_SCHOOL" >&2
    exit 1
  fi
fi

if [[ -n "${FOREIGN_INEP:-}" ]]; then
  echo "[extra] testando codigo_inep estrangeiro=${FOREIGN_INEP}"
  ENC_INEP="$(jq -nr --arg v "$FOREIGN_INEP" '$v|@uri')"
  FOREIGN_INEP_RESULT="$(request "/v1/admin/census?year=${YEAR:-$(date +%Y)}&limit=100&page=1&codigo_inep=${ENC_INEP}")"
  if [[ "$(jq -r '.data.total' <<<"$FOREIGN_INEP_RESULT")" != "0" ]]; then
    echo "falha crítica: INEP estrangeiro retornou dados" >&2
    jq . <<<"$FOREIGN_INEP_RESULT" >&2
    exit 1
  fi
fi

echo "OK: sessão DRE permaneceu restrita a '${DRE_NAME}' (dre_id=${DRE_ID})."
