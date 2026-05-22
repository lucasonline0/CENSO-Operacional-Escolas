# Frente 3 — Frontend (refactor de `admin/page.tsx`) + Qualidade de Dados

**Branch:** `refactor/admin-page-componentes` (parte de `develop`).
**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
- [validacao-fase-2.md](validacao-fase-2.md) — tabela de paridade a preencher
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) — a estender

## 1. Objetivo

Duas trilhas paralelas dentro da mesma frente:

1. **Refactor de UI sem mudar fonte.** Quebrar `web/src/app/admin/page.tsx` (~50 KB, monolítico) em componentes por aba, **mantendo exatamente as mesmas fontes de dados** (PostgreSQL ou Sheets, conforme já está em produção). Isso prepara o terreno onde as Fases 3-UI e 4-UI vão plugar os endpoints entregues pelas Frentes 1 e 2.
2. **Qualidade de dados.** Preencher a tabela de paridade da Fase 2A com valores reais e investigar a origem dos decimais em `total_alunos`.

**Não é objetivo desta frente migrar nenhuma fonte de dados.** Toda mudança de PG ↔ Sheets fica para PRs posteriores (Fase 3-UI, 4-UI), em cima do que esta frente entrega.

## 2. Escopo

### Pode alterar

- `web/src/app/admin/page.tsx` — quebrar em componentes; manter API pública (a página continua sendo o entry point do `/admin`).
- `web/src/components/admin/` *(novo diretório)*:
  - `AbaCaracterizacao.tsx` (consome `analytics/caracterizacao/{perfil,dre}` + fallback `sheet-metrics`, como hoje).
  - `AbaPerfilAlunos.tsx` (consome `indicadores-metrics`, como hoje).
  - `AbaOperacional.tsx` (consome `/admin/dashboard`).
  - `AbaTodosCensos.tsx` (consome `/admin/census`).
  - `AbaPorDre.tsx` (consome `/admin/dashboard.by_dre`).
  - Componentes utilitários compartilhados (`StatCard`, `Donut`, `BarChart`, indicador de fonte de dados, modal "ver JSON") em `web/src/components/admin/shared/`.
- `web/src/hooks/` — eventualmente extrair hooks de fetching (`useAdminCaracterizacao`, `useAdminAlunos`, etc.). Manter o `apiFetch` existente.
- `docs/dashboard/validacao-fase-2.md` — preencher tabela "Métricas comparadas" (linhas 100–132).
- `docs/dashboard/criterios-contagem-e-qualidade-dados.md` — adicionar seção "Decimais em `total_alunos`" (origem, hipóteses, lista de escolas afetadas).
- `web/src/schemas/steps/*.ts` — **apenas** se for adicionar validação `z.number().int()` em campos conceitualmente inteiros, em PR isolado e revisado. Não tocar lógica de submit, persistência, ou navegação do wizard.

### Não pode alterar

- `api/` (qualquer arquivo).
- `infra/migrations/` ou `infra/init.sql`.
- `POST /v1/census`, payload de submit, fluxo do formulário público.
- Comportamento dos endpoints Sheets — apenas continua consumindo o que existe.
- Comportamento de autenticação (JWT, login, logout).
- Layout visual macro (mesmas abas, mesmos gráficos, mesmas cores). Refactor é estrutural, não visual.

## 3. Tarefas

### 3.1 Refactor de `admin/page.tsx` em componentes por aba

Princípios:

- **Mesma renderização, mesmas chamadas, mesmos estados.** Diff esperado: extração + import, não reescrita.
- Cada `Aba*.tsx` recebe o que precisa via props (token, callbacks) ou consome hooks dedicados.
- Estado de autenticação e de aba ativa continua em `page.tsx` (raiz).
- Indicador de fonte ("PostgreSQL · ano corrente" / "Google Sheets · fallback") continua exatamente como está hoje — apenas movido para o componente da aba relevante.
- O modal "ver JSON" e o botão "Sync Planilha" continuam no header.

Ordem sugerida de PRs:

1. **PR 1** — extrair `AbaOperacional.tsx` + `AbaPorDre.tsx` + `AbaTodosCensos.tsx` (as abas mais simples).
2. **PR 2** — extrair `AbaPerfilAlunos.tsx`.
3. **PR 3** — extrair `AbaCaracterizacao.tsx` (a mais complexa — KPIs, donuts, barras, tabela DRE, fallback Sheets).
4. **PR 4** — extrair componentes compartilhados (`Donut`, `BarChart`, `StatCard`, indicador de fonte) para `shared/`.

Cada PR deve manter `npm run build` e `npm run lint` no nível atual (zero erros novos; warnings remanescentes documentados em [validacao-fase-2.md](validacao-fase-2.md) podem permanecer).

### 3.2 Tabela de paridade PG × Sheets (validação Fase 2A)

Preencher [validacao-fase-2.md](validacao-fase-2.md) — tabela "Métricas comparadas" (linhas 100–132):

- Capturar os payloads dos endpoints em homologação:
  - `GET /v1/admin/sheet-metrics`
  - `GET /v1/admin/analytics/caracterizacao/perfil`
  - `GET /v1/admin/analytics/caracterizacao/dre`
- Preencher cada linha da tabela com `valor PG`, `valor Sheets`, `delta`, `observação`.
- Para deltas > 1% em KPIs ou em categorias com volume ≥ 50 escolas: anexar hipótese de causa (INEP repetido, drafts não migrados, anexos, correção pós-sync). Cruzar com [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) seção 6.

### 3.3 Investigação dos decimais em `total_alunos`

Hoje a Fase 2A devolve `total_alunos = 413934.03` no agregado e amostras decimais em DREs (`9187.661`, `9179.496`, ...). Conceitualmente `total_alunos` é inteiro.

Tarefas:

- Rodar em homologação:
  ```sql
  SELECT school_id, codigo_inep, nome_escola, dre, total_alunos
  FROM vw_censo_enriquecida
  WHERE status = 'completed'
    AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
    AND total_alunos IS NOT NULL
    AND total_alunos <> FLOOR(total_alunos)
  ORDER BY total_alunos DESC;
  ```
- Cruzar com os payloads originais (`SELECT data->>'total_alunos' FROM census_responses WHERE id = ?`) para identificar o formato gravado.
- Levantar hipóteses (percentual digitado no campo errado? média de algum sistema externo? valor com vírgula sendo lido como ponto?).
- Listar **escolas afetadas** em uma seção nova de [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md): seção 8 "Decimais em campos conceitualmente inteiros".
- Recomendação final: validação no Zod (`z.number().int()` ou `z.coerce.number().int()` no `general-data.ts`) **se** a análise indicar que é erro de input. Implementar em PR isolado, revisado, sem mudar submit.

### 3.4 Sanity local

```bash
cd web
npm install
npm run build
npm run lint
npm run dev      # abrir http://localhost:3000/admin e navegar todas as abas
```

Verificar manualmente:
- todas as 5 abas continuam carregando;
- indicador de fonte "PostgreSQL · ano corrente" segue verde na Caracterização da Rede;
- fallback Sheets continua sendo carregado em paralelo (DevTools › Network);
- nenhuma regressão de cor, layout, ordenação ou texto.

## 4. Critérios de aceite

- [ ] `web/src/app/admin/page.tsx` reduzido a um shell (autenticação + aba ativa + composição dos componentes).
- [ ] Cada aba em seu próprio arquivo sob `web/src/components/admin/`.
- [ ] Componentes compartilhados (`Donut`, `BarChart`, `StatCard`, indicador de fonte) em `web/src/components/admin/shared/`.
- [ ] `npm run build` OK. `npm run lint` sem erros novos.
- [ ] Validação visual manual em homologação: 5 abas carregando idêntico ao baseline; chip de fonte exibindo o mesmo estado.
- [ ] Tabela "Métricas comparadas" em [validacao-fase-2.md](validacao-fase-2.md) preenchida com números reais.
- [ ] Seção "Decimais em `total_alunos`" criada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) com escolas listadas e hipóteses.
- [ ] **Nenhuma mudança em `api/`, `infra/`, formulário, autenticação ou submit.**
- [ ] **Nenhuma migração de fonte (PG ↔ Sheets).**

## 5. Riscos conhecidos

- `admin/page.tsx` é grande (~50 KB) e contém estado entrelaçado. Risco de regressão sutil em hidratação ou em fallback parcial. Mitigação: PRs pequenos por aba; smoke manual em cada PR.
- O refactor pode descobrir bugs latentes (ex.: erros de lint pré-existentes ainda em `tailwind.config.mjs`, `setToken` em `AdminPage`). **Não tentar consertar tudo no mesmo PR** — abrir tasks separadas.
- A investigação de decimais pode revelar problema sistêmico no formulário (campo numérico aceitando vírgula). Se for isso, a correção no Zod é uma decisão de produto — abrir issue antes de implementar.

## 6. Fora de escopo

- Migrar a aba "Perfil dos Alunos" para PostgreSQL — Fase 3-UI, depois da Frente 1 entregar.
- Adicionar nova seção "Oferta e Funcionamento" — Fase 4-UI, depois da Frente 2 entregar.
- Refatorar componentes do formulário (`web/src/components/forms/*`).
- Mudar autenticação, persistência, navegação do wizard.
- Resolver os warnings pré-existentes não relacionados ao refactor.

## 7. Coordenação com as outras frentes

- Frente 1 e Frente 2 **não tocam** em `web/`. Nenhum conflito esperado durante o desenvolvimento.
- Ao final desta frente, os componentes `AbaPerfilAlunos.tsx` e `AbaCaracterizacao.tsx` ficam prontos para receber, em PRs futuros, os endpoints entregues pelas Frentes 1 e 2 sem necessidade de novo refactor estrutural.
