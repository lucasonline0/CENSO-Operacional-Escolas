# Plano de Trabalho Paralelo — Dashboard Admin (3 frentes)

**Documentos companheiros:**
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
- [validacao-fase-1.md](validacao-fase-1.md)
- [validacao-fase-2.md](validacao-fase-2.md)
- [jsonb-field-inventory.md](jsonb-field-inventory.md)
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md)

**Guias por frente (leitura obrigatória para o dev de cada frente):**
- [frente-1-perfil-alunos.md](frente-1-perfil-alunos.md)
- [frente-2-oferta-infra.md](frente-2-oferta-infra.md)
- [frente-3-frontend-qualidade.md](frente-3-frontend-qualidade.md)

## 1. Objetivo

Permitir que **três desenvolvedores avancem em paralelo** sobre o roadmap do dashboard sem conflito de escopo. Cada frente tem:

- branch própria, partindo de `develop`;
- conjunto disjunto de arquivos que pode alterar;
- entregável bem definido;
- guia próprio com tarefas detalhadas.

Histórico: o plano original previa apenas 2 frentes (Frente A docs + Frente B Fase 2A). Ambas já foram entregues — Fase 1, 1B, 2A e 2B.1 estão em produção. Este documento substitui aquele plano e passa a coordenar as 3 frentes seguintes.

## 2. Estado atual (baseline)

- Fase 1 validada em produção (Railway + Vercel).
- Fase 1B documentada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md).
- Fase 2A validada em produção — `vw_censo_enriquecida` + `/v1/admin/analytics/caracterizacao/{perfil,dre}`.
- Fase 2B.1 validada visualmente — aba "Caracterização da Rede" consome PostgreSQL.
- Lint cleanup landed (`738a3b8`).
- Google Sheets continua ativo (sink + fallback). `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `POST /v1/admin/sync-sheets` e `sheetSyncRetryJob` permanecem intactos.

## 3. Mapa das 3 frentes

| Frente | Branch | Escopo (alto nível) | Toca | Não toca |
|---|---|---|---|---|
| **1 — Backend Perfil dos Alunos (Fase 3)** | `feat/analytics-perfil-alunos` | Migration `0003_*`, endpoint `/v1/admin/analytics/alunos/permanencia`, paridade contra `indicadores-metrics` | `infra/migrations/0003_*.sql`, `api/cmd/api/migrations/0003_*.sql`, `api/cmd/api/analytics_alunos.go` *(novo)*, `api/cmd/api/main.go` (registro de rota), `docs/dashboard/validacao-fase-3.md` *(novo)* | `web/`, demais migrations, `analytics.go` existente, `POST /v1/census`, Sheets, `/v1/locations` |
| **2 — Backend Oferta e Infraestrutura Educacional (Fase 4)** | `feat/analytics-oferta-infra` | Migrations `0004_` a `0007_`, endpoints `/v1/admin/analytics/caracterizacao/oferta-funcionamento` e `.../infraestrutura-educacional` | `infra/migrations/0004_*.sql` a `0007_*.sql`, espelhos em `api/cmd/api/migrations/`, `api/cmd/api/analytics_oferta.go` *(novo)*, `api/cmd/api/main.go` (registro de rotas), `docs/dashboard/validacao-fase-4.md` *(novo)* | `web/`, `analytics.go` existente, `analytics_alunos.go` (Frente 1), `POST /v1/census`, Sheets, `/v1/locations` |
| **3 — Frontend + Qualidade de Dados** | `refactor/admin-page-componentes` | Quebrar `admin/page.tsx` em componentes por aba; preencher tabela de paridade da Fase 2A; investigar decimais em `total_alunos` | `web/src/app/admin/page.tsx`, `web/src/components/admin/*` *(novo)*, `docs/dashboard/validacao-fase-2.md` (preenchimento), `docs/dashboard/criterios-contagem-e-qualidade-dados.md` (extensão), eventualmente `web/src/schemas/steps/*.ts` (validação Zod) | `api/`, `infra/migrations/`, fluxo `POST /v1/census`, comportamento dos endpoints Sheets, submit do formulário |

## 4. Regras de integração

- **Branch base.** Todas as 3 branches partem de `develop`. Não fazer rebase contra `main` direto; sincronizar com `develop`.
- **Tamanho de PR.** Cada frente entrega em múltiplos PRs pequenos (≤ 400 linhas líquidas idealmente).
- **Migrations.**
  - Frente 1 reserva o prefixo `0003_`.
  - Frente 2 reserva os prefixos `0004_` a `0007_`.
  - Sem sobreposição. Quem chegar primeiro no banco aplica primeiro — todas são idempotentes (`CREATE OR REPLACE VIEW`).
- **Handlers Go.**
  - Frente 1 cria `api/cmd/api/analytics_alunos.go` (novo).
  - Frente 2 cria `api/cmd/api/analytics_oferta.go` (novo).
  - Nenhuma das duas mexe no `analytics.go` existente (mantido como está, com os handlers da Fase 1 e 2A).
- **`api/cmd/api/main.go`.** Único ponto onde Frente 1 e Frente 2 colidem — apenas o registro das rotas no grupo `protected`. Resolver com rebase simples; manter blocos contíguos por frente no diff.
- **Frontend.**
  - Frente 3 quebra `web/src/app/admin/page.tsx` em componentes por aba **mantendo as fontes de dados atuais**. Nenhuma migração de fonte (PG ↔ Sheets) acontece nesta frente.
  - As migrações visuais futuras (Fase 3-UI = aba "Perfil dos Alunos" → PG; Fase 4-UI = nova seção em "Caracterização da Rede" → PG) serão PRs separados, **após** as 3 frentes entregarem, plugando os endpoints da Frente 1 e da Frente 2 nos componentes da Frente 3.
- **Sheets intacto.** Nenhuma das 3 frentes pode desligar `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob` ou `POST /v1/admin/sync-sheets`.
- **Critérios de contagem.** Todas as 3 frentes respeitam [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md): `status = 'completed'`, `year = ano corrente`, `COUNT(DISTINCT school_id)`, sem deduplicação automática.
- **SQL parametrizado.** `$1`, `$2`, ... — nunca interpolar.
- **ORM.** Proibido. Mantém-se `database/sql` + `pgx/v5`.

## 5. Critérios de aceite por frente

### Frente 1
- Migration `0003_*` idempotente, espelhada em `api/cmd/api/migrations/0003_*.sql`.
- Endpoint `GET /v1/admin/analytics/alunos/permanencia` responde 200 sob `requireAdminAuth`.
- `docs/dashboard/validacao-fase-3.md` com tabela de paridade endpoint × `indicadores-metrics` (margem ≤ 2% aceita).
- UI **não** migrada nesta frente.

### Frente 2
- Migrations `0004_`, `0005_`, `0006_`, `0007_` aplicadas em ordem, idempotentes, espelhadas em `api/cmd/api/migrations/`.
- Endpoints `/v1/admin/analytics/caracterizacao/oferta-funcionamento` e `.../infraestrutura-educacional` respondem 200 sob `requireAdminAuth`.
- `docs/dashboard/validacao-fase-4.md` com inspeção manual (top 5 turnos / etapas / modalidades / ambientes em 3 escolas amostradas).
- UI **não** migrada nesta frente.

### Frente 3
- `web/src/app/admin/page.tsx` quebrado em componentes por aba em `web/src/components/admin/`. Comportamento e fontes de dados idênticos ao baseline.
- `npm run build` OK. `npm run lint` sem erros novos.
- Tabela "Métricas comparadas" em `validacao-fase-2.md` preenchida com valores reais de homologação.
- Seção "Decimais em total_alunos" adicionada a `criterios-contagem-e-qualidade-dados.md` com hipóteses e escolas afetadas listadas.
- Se houver alteração em `web/src/schemas/steps/*.ts` (validação Zod): PR isolado, revisado, sem mudar o submit.

## 6. O que nenhuma das frentes pode fazer

- Alterar `POST /v1/census` ou o fluxo do formulário.
- Remover ou desabilitar `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`, `POST /v1/admin/sync-sheets`.
- Introduzir ORM.
- Aplicar deduplicação automática no banco.
- Alterar `vw_censo_base` ou `vw_censo_enriquecida` (são fundação das Fases 1 e 2A já em produção).

## 7. Ordem recomendada para integração

Quando as 3 frentes entregarem em `develop`:

1. Merge Frente 3 primeiro (refactor de UI sem mudar fonte) → permite reduzir blast radius dos próximos PRs.
2. Merge Frente 1 (backend Perfil dos Alunos).
3. Merge Frente 2 (backend Oferta e Infra).
4. Em seguida, PRs separados de migração visual (Fase 3-UI e Fase 4-UI) plugam Frente 1 e Frente 2 nos componentes da Frente 3.
5. Promover `develop` → `main` somente após validação online de cada bloco.
