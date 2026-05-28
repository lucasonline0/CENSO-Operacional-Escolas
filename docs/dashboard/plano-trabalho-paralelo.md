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

## 1.1 Status atual das frentes (snapshot pós-merge em `develop`)

| Frente | Branch | Status |
|---|---|---|
| **1 — Backend Pessoal/Gestão Escolar + Tecnologia** | `feat/analytics-pessoal-tecnologia` | ⏳ **Pendente.** Próxima frente backend a executar. |
| **2 — Backend Infraestrutura/Segurança + Merenda + Serviços Terceirizados** | `feat/analytics-infra-merenda-servicos` | ✅ **Concluída e integrada à `develop`.** 6 views (`0007_*` a `0012_*`) + 8 endpoints `/v1/admin/analytics/{infraestrutura,merenda,servicos-terceirizados}/*` ativos. Validação em [validacao-fase-infra-merenda-servicos.md](validacao-fase-infra-merenda-servicos.md). |
| **3 — Frontend Admin + Qualidade de Dados** | `refactor/admin-page-componentes` | ✅ **Concluída e integrada à `develop`.** `/admin/page.tsx` virou shell, abas existentes extraídas, componentes compartilhados em `shared/`, 5 placeholders temáticos criados. Investigação de `total_alunos` documentada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) §8. |
| **Microfix preventivo de `total_alunos`** | `fix/total-alunos-integer` (mergeado) | ✅ **Concluído.** Schema Zod da etapa Dados Gerais passou a exigir inteiro; input recebeu ajuste local (`step`/`min`). Sem correção retroativa de dados legados. |
| **Placeholder institucional de "Gestão Financeira e Governança"** | `feat/admin-governanca-placeholder` (mergeado) | ✅ **Concluído.** Aba visível na navegação como placeholder institucional — sem fetch, sem endpoint, sem view SQL, sem dado fake. |

> **Importante.** O microfix de `total_alunos` impede novos valores decimais, mas **não corrige registros legados**. Qualquer correção retroativa depende de coleta nominal e validação humana, fora desta rodada.

## 2. Estado atual (baseline)

- Fase 1 validada em produção (Railway + Vercel).
- Fase 1B documentada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md).
- Fase 2A validada em produção — `vw_censo_enriquecida` + `/v1/admin/analytics/caracterizacao/{perfil,dre}`.
- Fase 2B.1 validada visualmente — aba "Caracterização da Rede" consome PostgreSQL.
- Lint cleanup landed (`738a3b8`).
- Frente 2 integrada à `develop` — views `0007_*` a `0012_*` e endpoints `/v1/admin/analytics/{infraestrutura,merenda,servicos-terceirizados}/*` disponíveis. Validação em [validacao-fase-infra-merenda-servicos.md](validacao-fase-infra-merenda-servicos.md).
- Frente 3 integrada à `develop` — `/admin/page.tsx` virou shell, abas existentes extraídas para `web/src/components/admin/`, componentes compartilhados em `shared/`, placeholders das 5 abas temáticas criados.
- Microfix preventivo de `total_alunos` aplicado (validação inteira no Zod + ajuste local do input).
- Placeholder institucional de "Gestão Financeira e Governança" criado, **sem fetch e sem endpoint**.
- Google Sheets continua ativo (sink + fallback). `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `POST /v1/admin/sync-sheets` e `sheetSyncRetryJob` permanecem intactos.

### 2.1 Navegação atual do `/admin`

Abas visíveis na ordem institucional acordada (estado pós-merge em `develop`):

| # | Aba | Estado dos dados | Fonte |
|---|---|---|---|
| 1 | **Caracterização da Rede** | Dados reais | PostgreSQL (`/v1/admin/analytics/caracterizacao/*`) + fallback `sheet-metrics` |
| 2 | **Pessoal e Gestão Escolar** | Placeholder ("Em construção") | Frente 1 backend ainda pendente |
| 3 | **Tecnologia e Equipamentos** | Placeholder ("Em construção") | Frente 1 backend ainda pendente |
| 4 | **Infraestrutura e Segurança** | Placeholder ("Em construção") | Endpoints da Frente 2 já existem — aguardando integração visual (UI-FT2-01) |
| 5 | **Merenda Escolar** | Placeholder ("Em construção") | Endpoints da Frente 2 já existem — aguardando integração visual (UI-FT2-02) |
| 6 | **Serviços Terceirizados** | Placeholder ("Em construção") | Endpoints da Frente 2 já existem — aguardando integração visual (UI-FT2-03) |
| 7 | **Perfil dos Alunos e Resultados** | Dados reais (implementação atual mantida) | Google Sheets (`/v1/admin/indicadores-metrics`) |
| 8 | **Gestão Financeira e Governança** | Placeholder institucional (sem fetch) | Fonte futura: base própria das coordenações responsáveis, **fora do banco do censo** |
| 9 | **Operacional** | Dados reais | PostgreSQL (`/v1/admin/dashboard`) |
| 10 | **Todos os Censos** | Dados reais | PostgreSQL (`/v1/admin/census`) |
| 11 | **Por DRE** | Dados reais | PostgreSQL (`/v1/admin/dashboard.by_dre`) |

> **Distinção importante.** As abas 4, 5 e 6 são placeholders que **já têm endpoint pronto** (Frente 2 mergeada) — falta apenas plugar visualmente. A aba 8 é placeholder **institucional**: não terá endpoint nem view SQL nesta rodada, e a fonte futura **não** será necessariamente o banco PostgreSQL alimentado pelo formulário do censo. A aba 7 mantém a implementação atual; uma eventual remodelagem futura também poderá consumir bases externas validadas pelas coordenações.

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

> **Estado real:** Frentes 2 e 3 já foram mergeadas em `develop`. Microfix de `total_alunos` e placeholder institucional de "Gestão Financeira e Governança" também já integrados. **Frente 1 backend ainda pendente.**

Próximos passos, na ordem recomendada:

1. **Validar `develop`** após os merges das Frentes 2 e 3, o microfix de `total_alunos` e o placeholder institucional de "Gestão Financeira e Governança". Smoke manual em homologação, confirmar endpoints da Frente 2 respondendo 200 sob `requireAdminAuth`, navegação do `/admin` com as 11 abas listadas em §2.1.
2. **Atualizar documentação geral pós-merge** (este PR documental).
3. **Executar Frente 1 backend** (`feat/analytics-pessoal-tecnologia`) — views `0003_*` a `0006_*`, handlers `/pessoal-gestao/*` e `/tecnologia/*`, validação em `validacao-fase-pessoal-tecnologia.md`. Sem tocar `web/`. Detalhes em [frente-1-pessoal-tecnologia.md](frente-1-pessoal-tecnologia.md).
4. **Integrar visualmente endpoints da Frente 2** nos placeholders correspondentes (UI-FT2-01 a 03), **uma aba por PR**:
   - **UI-FT2-01** — Integrar `AbaInfraestruturaSeguranca.tsx` aos endpoints `/v1/admin/analytics/infraestrutura/{condicoes,seguranca}`.
   - **UI-FT2-02** — Integrar `AbaMerenda.tsx` aos endpoints `/v1/admin/analytics/merenda/{oferta,equipamentos,recursos-humanos}`.
   - **UI-FT2-03** — Integrar `AbaServicosTerceirizados.tsx` aos endpoints `/v1/admin/analytics/servicos-terceirizados/{visao-geral,servicos-gerais,portaria}`.
5. **Integrar visualmente endpoints da Frente 1** nos placeholders correspondentes (após conclusão do passo 3), **uma aba por PR**:
   - Integrar `AbaPessoalGestao.tsx` aos endpoints `/v1/admin/analytics/pessoal-gestao/*`.
   - Integrar `AbaTecnologia.tsx` aos endpoints `/v1/admin/analytics/tecnologia/*`.
6. **Planejar separadamente** a remodelagem de "Perfil dos Alunos e Resultados" e "Gestão Financeira e Governança" com bases externas/planilhas próprias das coordenações responsáveis. Essa remodelagem **não faz parte** desta rodada de backend e não deve criar views nem endpoints sobre o banco do censo.
7. **Promover `develop` → `main`** somente após validação online de cada bloco acima.

### 8.1 Regras dos PRs de integração visual (UI-FT2-01/02/03 e equivalentes da Frente 1)

- Uma aba por PR.
- Sem alterar backend.
- Sem alterar migrations.
- Sem alterar endpoints já validados.
- Sem alterar a aba "Caracterização da Rede".
- Sem alterar a aba "Perfil dos Alunos e Resultados" (mantida como está nesta rodada).
- Sem alterar a aba "Gestão Financeira e Governança" (continua como placeholder institucional).
- Sem remover placeholders de outras abas.
- Sem dado fake — se a aba ainda não tem endpoint pronto (caso das duas abas da Frente 1 enquanto o backend não estiver mergeado), o placeholder permanece.

> Nota: é **autorizado** começar a integração visual da Frente 2 (passo 4) **antes** da conclusão da Frente 1 backend (passo 3), desde que respeitadas as regras acima — uma aba por PR e sem tocar no backend. A ordem 3 → 4 → 5 é recomendada por reduzir retrabalho, mas não é bloqueante.
