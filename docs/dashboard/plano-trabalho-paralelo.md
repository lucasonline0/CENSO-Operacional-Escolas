# Plano de Trabalho Paralelo — Dashboard Admin (3 frentes)

**Documentos companheiros:**
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
- [validacao-fase-1.md](validacao-fase-1.md)
- [validacao-fase-2.md](validacao-fase-2.md)
- [jsonb-field-inventory.md](jsonb-field-inventory.md)
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md)

**Guias por frente (leitura obrigatória para o dev de cada frente):**
- [frente-1-pessoal-tecnologia.md](frente-1-pessoal-tecnologia.md)
- [frente-2-infra-merenda-servicos.md](frente-2-infra-merenda-servicos.md)
- [frente-3-frontend-qualidade.md](frente-3-frontend-qualidade.md)

## 1. Objetivo

Permitir que **três desenvolvedores avancem em paralelo** sobre o roadmap do dashboard sem conflito de escopo. Cada frente tem:

- branch própria, partindo de `develop`;
- conjunto disjunto de arquivos que pode alterar;
- entregável bem definido;
- guia próprio com tarefas detalhadas.

Histórico: o plano original previa 2 frentes (Frente A docs + Frente B Fase 2A) — ambas concluídas (Fase 1, 1B, 2A e 2B.1 em produção). Em seguida foi rascunhado um plano em 3 frentes que incluía a Fase 3 (Perfil dos Alunos) e a Fase 4 (Oferta/Infra Educacional como expansão da Caracterização). **Esse rascunho foi descartado** porque as abas "Perfil dos Alunos e Resultados" e "Gestão Financeira e Governança" serão remodeladas para consumir outra planilha — não o banco — e ainda estão em definição. Este documento substitui o rascunho e coordena as 3 frentes vigentes.

## 2. Estado atual (baseline)

- Fase 1 validada em produção (Railway + Vercel).
- Fase 1B documentada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md).
- Fase 2A validada em produção — `vw_censo_enriquecida` + `/v1/admin/analytics/caracterizacao/{perfil,dre}`.
- Fase 2B.1 validada visualmente — aba "Caracterização da Rede" consome PostgreSQL.
- Lint cleanup landed (`738a3b8`).
- Google Sheets continua ativo (sink + fallback). `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `POST /v1/admin/sync-sheets` e `sheetSyncRetryJob` permanecem intactos.

## 3. Abas-alvo das 3 frentes

Estas são as 5 abas autorizadas para esta rodada de trabalho — todas serão **novas** no `/admin`:

1. **Pessoal e Gestão Escolar** (Frente 1)
2. **Tecnologia e Equipamentos** (Frente 1)
3. **Infraestrutura e Segurança** (Frente 2)
4. **Merenda Escolar** (Frente 2)
5. **Serviços Terceirizados** (Frente 2)

**Aba adicional autorizada apenas como placeholder institucional (Frente 3):** **Gestão Financeira e Governança**. Por decisão de produto, esta aba deve aparecer na navegação do `/admin` exibindo skeleton/empty state — **sem consumir o banco PostgreSQL do censo operacional**, sem endpoint, sem view SQL e sem dado fake. A fonte de dados será definida futuramente a partir de bases próprias já validadas pelas coordenações responsáveis. A criação do placeholder não antecipa regra de cálculo, endpoint, view SQL ou integração de dados.

**Fora de escopo nesta rodada (dados/endpoints/views):** abas "Perfil dos Alunos e Resultados" e "Gestão Financeira e Governança". Ambas serão remodeladas para consumir **outra planilha** (não o banco) — ainda em definição. Nenhuma frente deve criar views, endpoints ou consumo de dados para esses dois temas. A única ação autorizada nesta rodada para "Gestão Financeira e Governança" é o **placeholder visual** descrito acima.

A aba "Caracterização da Rede" (já em produção, alimentada por PostgreSQL) **não é alvo** desta rodada — não tocar.

## 4. Mapa das 3 frentes

| Frente | Branch | Escopo (alto nível) | Toca | Não toca |
|---|---|---|---|---|
| **1 — Backend Pessoal/Gestão Escolar + Tecnologia** | `feat/analytics-pessoal-tecnologia` | 4 views temáticas (`vw_censo_direcao_escolar`, `_coordenacao_area`, `_quadro_pessoal`, `_equipamentos_tecnologia`); endpoints `/v1/admin/analytics/pessoal-gestao/*` e `/v1/admin/analytics/tecnologia/*` | `infra/migrations/0003_*` a `0006_*`, espelhos em `api/cmd/api/migrations/`, `api/cmd/api/analytics_pessoal_tecnologia.go` *(novo)*, `api/cmd/api/main.go` (registro de rotas), `infra/init.sql`, `docs/dashboard/validacao-fase-pessoal-tecnologia.md` *(novo)* | `web/`, demais migrations, `analytics.go`/`analytics_*.go` da Frente 2, `POST /v1/census`, Sheets, `/v1/locations`, `vw_censo_base` e `vw_censo_enriquecida` |
| **2 — Backend Infra/Segurança + Merenda + Serviços Terceirizados** | `feat/analytics-infra-merenda-servicos` | Até 6 views temáticas (`vw_censo_ambientes`, `_infraestrutura_seguranca`, `_equipamentos_merenda`, `_rh_merendeiras`, `_rh_servicos_gerais`, `_servicos_terceirizados`); endpoints `/v1/admin/analytics/infraestrutura/*`, `/merenda/*`, `/servicos-terceirizados/*` | `infra/migrations/0007_*` a `0012_*`, espelhos em `api/cmd/api/migrations/`, `api/cmd/api/analytics_infra_merenda_servicos.go` *(novo)*, `api/cmd/api/main.go` (registro de rotas), `infra/init.sql`, `docs/dashboard/validacao-fase-infra-merenda-servicos.md` *(novo)* | `web/`, demais migrations, `analytics.go`/`analytics_*.go` da Frente 1, `POST /v1/census`, Sheets, `/v1/locations`, `vw_censo_base` e `vw_censo_enriquecida` |
| **3 — Frontend + Qualidade de Dados** | `refactor/admin-page-componentes` | Quebrar `admin/page.tsx` em componentes por aba; criar **placeholders** das 5 novas abas temáticas + placeholder institucional de "Gestão Financeira e Governança" (sem dados); preencher tabela de paridade da Fase 2A; investigar decimais em `total_alunos` | `web/src/app/admin/page.tsx`, `web/src/components/admin/*` *(novo)*, `docs/dashboard/validacao-fase-2.md`, `docs/dashboard/criterios-contagem-e-qualidade-dados.md` (extensão), eventualmente `web/src/schemas/steps/*.ts` (validação Zod, PR isolado) | `api/`, `infra/migrations/`, fluxo `POST /v1/census`, comportamento dos endpoints Sheets, submit do formulário, **consumo de dados / endpoints / views** das abas "Perfil dos Alunos" e "Gestão Financeira e Governança" (esta última liberada apenas como placeholder visual) |

## 5. Regras de integração

- **Branch base.** Todas as 3 branches partem de `develop`. Sincronizar com `develop`, não com `main`.
- **Tamanho de PR.** Cada frente entrega em múltiplos PRs pequenos (≤ 400 linhas líquidas idealmente).
- **Migrations.**
  - Frente 1 reserva os prefixos `0003_` a `0006_`.
  - Frente 2 reserva os prefixos `0007_` a `0012_`.
  - Sem sobreposição. Todas idempotentes (`CREATE OR REPLACE VIEW`).
- **Handlers Go.**
  - Frente 1 cria `api/cmd/api/analytics_pessoal_tecnologia.go` (novo).
  - Frente 2 cria `api/cmd/api/analytics_infra_merenda_servicos.go` (novo).
  - Nenhuma das duas mexe em `analytics.go` (mantido com handlers das Fases 1 e 2A).
- **`api/cmd/api/main.go`.** Único ponto onde Frente 1 e Frente 2 colidem — apenas o registro das rotas no grupo `protected`. Resolver com rebase simples; manter blocos contíguos por frente no diff.
- **Frontend.**
  - Frente 3 quebra `web/src/app/admin/page.tsx` em componentes por aba **mantendo as fontes de dados atuais**. Nenhuma migração de fonte (PG ↔ Sheets) acontece nesta frente.
  - Frente 3 também cria **placeholders** das 5 abas novas (skeleton/empty state, sem chamadas a endpoint) na navegação do `/admin`. As 5 abas ficam visíveis e selecionáveis, mas exibem apenas "Em construção" ou skeleton — esperando os endpoints das Frentes 1 e 2.
  - A integração visual (plugar os endpoints da Frente 1 e 2 nos placeholders) acontece em PRs posteriores, **fora desta rodada**.
- **Sheets intacto.** Nenhuma das 3 frentes pode desligar `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob` ou `POST /v1/admin/sync-sheets`.
- **Critérios de contagem.** Todas as 3 frentes respeitam [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md): `status = 'completed'`, `year = ano corrente`, `COUNT(DISTINCT school_id)`, sem deduplicação automática.
- **SQL parametrizado.** `$1`, `$2`, ... — nunca interpolar.
- **ORM.** Proibido. Mantém-se `database/sql` + `pgx/v5`.

## 6. Critérios de aceite por frente

### Frente 1
- 4 migrations idempotentes (`0003_` a `0006_`), espelhadas em `api/cmd/api/migrations/` e replicadas em `infra/init.sql`.
- Endpoints `/v1/admin/analytics/pessoal-gestao/{estrutura,coordenacao,quadro-pessoal}` e `/v1/admin/analytics/tecnologia/{infraestrutura,uso-pedagogico}` respondem 200 sob `requireAdminAuth`.
- `docs/dashboard/validacao-fase-pessoal-tecnologia.md` com payloads + inspeção manual em 3 escolas amostradas.
- UI **não** migrada nesta frente.

### Frente 2
- Até 6 migrations idempotentes (`0007_` a `0012_`), espelhadas em `api/cmd/api/migrations/` e replicadas em `infra/init.sql`.
- Endpoints `/v1/admin/analytics/infraestrutura/{condicoes,seguranca}`, `/merenda/{oferta,equipamentos,recursos-humanos}` e `/servicos-terceirizados/{visao-geral,servicos-gerais,portaria}` respondem 200 sob `requireAdminAuth`.
- `docs/dashboard/validacao-fase-infra-merenda-servicos.md` com payloads + inspeção manual em 3 escolas amostradas.
- UI **não** migrada nesta frente.

### Frente 3
- `web/src/app/admin/page.tsx` quebrado em componentes por aba em `web/src/components/admin/`. Comportamento e fontes de dados idênticos ao baseline para as abas existentes.
- 5 abas novas (Pessoal e Gestão Escolar, Tecnologia e Equipamentos, Infraestrutura e Segurança, Merenda Escolar, Serviços Terceirizados) criadas como placeholders na navegação — visíveis, selecionáveis, exibindo skeleton/empty state.
- `npm run build` OK. `npm run lint` sem erros novos.
- Tabela "Métricas comparadas" em [validacao-fase-2.md](validacao-fase-2.md) preenchida com valores reais de homologação.
- Seção "Decimais em `total_alunos`" adicionada a [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) com hipóteses e escolas afetadas.
- Se houver alteração em `web/src/schemas/steps/*.ts` (validação Zod): PR isolado, revisado, sem mudar o submit.

## 7. O que nenhuma das frentes pode fazer

- Alterar `POST /v1/census` ou o fluxo do formulário.
- Remover ou desabilitar `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`, `POST /v1/admin/sync-sheets`.
- Introduzir ORM.
- Aplicar deduplicação automática no banco.
- Alterar `vw_censo_base` ou `vw_censo_enriquecida` (são fundação das Fases 1 e 2A em produção).
- Criar views, endpoints ou consumo de dados para "Perfil dos Alunos e Resultados" ou "Gestão Financeira e Governança" — fora de escopo nesta rodada. **Exceção autorizada para Frente 3:** placeholder visual de "Gestão Financeira e Governança" no `/admin` (skeleton/empty state, sem fetch, sem endpoint, sem view SQL, sem dado fake).
- Modificar a aba "Caracterização da Rede" (já em produção).

## 8. Ordem recomendada para integração

Quando as 3 frentes entregarem em `develop`:

1. Merge Frente 3 primeiro (refactor + placeholders, sem mudar fonte) — reduz blast radius dos próximos PRs e deixa as 5 abas visíveis.
2. Merge Frente 1 (backend Pessoal/Gestão + Tecnologia).
3. Merge Frente 2 (backend Infra + Merenda + Serviços Terceirizados).
4. PRs posteriores (fora desta rodada) plugam os endpoints das Frentes 1 e 2 nos placeholders da Frente 3 — uma aba por PR, com fallback de erro próprio.
5. Promover `develop` → `main` somente após validação online de cada bloco.
