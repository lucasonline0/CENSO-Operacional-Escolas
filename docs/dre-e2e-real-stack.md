# E2E de Perfil DRE — stack real (gate CI)

Suíte de fim-a-fim que valida o **perfil DRE** contra a stack **real** do
produto, sem mocks:

```
PostgreSQL 16 efêmero (docker)
  → infra/init.sql (schema base/analítico)
  → API Go (migrations reais 0001-0024 aplicadas no startup via applyMigrations)
  → seed canônico (dres, schools.dre_id, census_responses, usuários DRE via CLI real)
  → Next.js production (porta isolada)
  → Playwright (web/e2e/dre-lifecycle.spec.ts)
```

Tudo é descartado ao final (teardown via `docker rm -f`). Qualquer falha de
migration, de startup da API/frontend ou de assert da suíte torna o gate
vermelho.

## Execução local

Pré-requisitos: Docker, Go, Node 20+, `curl` e `openssl`. Sem PostgreSQL
local — o gate sobe o próprio container efêmero.

```bash
scripts/dre-e2e/run-e2e.sh
```

Portas isoladas (evitam conflito com dev):

| componente | porta |
|---|---|
| PostgreSQL (efêmero) | 54329 |
| API Go | 8001 |
| Next.js | 3100 |

É possível sobrescrever com `CENSUS_E2E_PG_PORT`, `CENSUS_E2E_API_PORT` e
`CENSUS_E2E_WEB_PORT`. As credenciais são geradas aleatoriamente a cada
execução (debug local: `/tmp/censo-e2e.*/secrets.env`).

## No CI

`.github/workflows/dre-e2e-ci.yml` roda o mesmo script com `CI=true`
(instala o chromium com deps). Em falha, os artefatos
`web/playwright-report/**` e `web/test-results/**` são anexados ao job por 7
dias.

## O que a suíte valida

1. **Admin (env)**: login real, grupo "Administração"/"Gestão de DREs e
   Acessos" visível, seletor de DRE habilitado, `/admin/me` `role=admin` e
   lista ampla de DREs.
2. **DRE_A**: badge "Acesso restrito à DRE:", ações globais ausentes, seletor
   de DRE travado no valor da conta, `/admin/me` `role=dre` com a DRE
   autorizada.
3. **Isolamento**: `filtros/opcoes` e `/dashboard` de DRE_A nunca contêm DRE_B
   — inclusive forçando `?dre=<DRE_B>` na query string.
4. **BOLA fechado**: ler censo de DRE_B por ID como DRE_A → 403; rotas
   admin-only (`/admin/users`, `/admin/dres`, `/admin/sync-sheets`) negadas.
5. **Revogação (0024)**: `reset-password` do usuário DRE_A pelo admin invalida
   o token antigo (`auth_version`) e a nova senha volta a autenticar.
6. **DRE_B**: perfil próprio, sem herdar dados de DRE_A.
7. **Sessão restaurada por token** (`sessionStorage`): sem vazamento de cache
   entre contextos, opções seguem escopadas.

## Orçamento de logins (rate limit)

O endpoint `POST /v1/admin/login` tem rate limit in-memory de **5 tentativas /
15 min / IP**. A suíte é serial (`workers=1`, `retries=0`) e usa exatamente 4
logins reais: admin, DRE_A, DRE_B e relogin pós-reset. O global-setup **não**
faz login. Não aumente o número de logins sem rever este orçamento.

## Como funciona o fluxo do script

1. sobe o Postgres 16 efêmero e aplica `infra/init.sql`;
2. builda API + CLIs (`admin-user`, `genpasswd`);
3. inicia a API com `DATABASE_URL` para o container efêmero e espera
   `/v1/health` (as migrations 0001–0024 rodam no startup e falham o gate se
   quebrarem);
4. valida o schema canônico via `psql` (`dres`, `fk_schools_dre_id`,
   `chk_*_canonical`, `admin_users.auth_version`);
5. semeia `dres`, `schools` (com `dre_id`), `census_responses` e cria os
   usuários DRE com a CLI real (`admin-user create -dre ...`);
6. builda e inicia o Next.js production com `NEXT_PUBLIC_API_URL` aponando
   para a API do container;
7. instala o chromium do Playwright e roda `npm run e2e` (web) com as ENVs
   `E2E_*`;
8. teardown: mata api/web e remove o container. Exit code ≠ 0 = gate vermelho.

## Verificação do diffs

- `web/package.json` — `@playwright/test`, scripts `e2e`/`e2e:headed`.
- `web/playwright.config.ts`, `web/playwright/global-setup.ts`,
  `web/e2e/helpers.ts`, `web/e2e/dre-lifecycle.spec.ts` — suíte.
- `scripts/dre-e2e/run-e2e.sh` — orquestração local/CI.
- `.github/workflows/dre-e2e-ci.yml` — gate no PR para `develop` + artefatos.
- `docs/ci-dre-critical-gates.md` — documento dos checks obrigatórios.