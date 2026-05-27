# Frente 3 — Frontend (refactor + placeholders das 5 novas abas) + Qualidade de Dados

> **Status:** ✅ **Concluída e integrada à `develop`.**
>
> Entregas mergeadas:
> - `web/src/app/admin/page.tsx` transformado em shell (autenticação + composição).
> - Abas existentes extraídas para `web/src/components/admin/`: `AbaCaracterizacao.tsx`, `AbaPerfilAlunos.tsx`, `AbaOperacional.tsx`, `AbaTodosCensos.tsx`, `AbaPorDre.tsx`.
> - Componentes compartilhados extraídos para `web/src/components/admin/shared/` (`Donut`, `BarChart`, `StatCard`, indicador de fonte, `EmptyStatePlaceholder`).
> - Placeholders das 5 abas temáticas criados na navegação: Pessoal e Gestão Escolar, Tecnologia e Equipamentos, Infraestrutura e Segurança, Merenda Escolar, Serviços Terceirizados.
> - Placeholder institucional de **Gestão Financeira e Governança** criado em PR posterior à Frente 3 (`feat/admin-governanca-placeholder`), também já mergeado em `develop`.
> - Documentação de paridade Fase 2A atualizada em [validacao-fase-2.md](validacao-fase-2.md).
> - Investigação de decimais em `total_alunos` documentada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) §8.
>
> **Pendências futuras (não reabrem esta frente):**
> - Coleta do lado Sheets da paridade Fase 2A (operador autorizado com acesso ao banco).
> - Coleta nominal de casos legados de `total_alunos` decimal — registro em §8.5 do documento de critérios, se necessário.
> - Avaliar `z.number().int()` para outros campos conceitualmente inteiros (PR isolado, fora desta frente).
>
> **Microfix preventivo de `total_alunos`** (PR independente já mergeado, complementar a esta frente):
> - Schema Zod da etapa Dados Gerais passou a exigir número inteiro para `total_alunos`.
> - Input recebeu ajuste local (`step`/`min`) no formulário.
> - **Não altera dados legados, views SQL ou endpoints.**
>
> O conteúdo abaixo permanece como **registro histórico** da frente concluída (escopo, decisões, riscos).

**Branch:** `refactor/admin-page-componentes` (parte de `develop`).
**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
- [validacao-fase-2.md](validacao-fase-2.md) — tabela de paridade a preencher
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) — a estender

## 1. Objetivo

Três trilhas paralelas dentro da mesma frente:

1. **Refactor de UI sem mudar fonte.** Quebrar `web/src/app/admin/page.tsx` (~50 KB, monolítico) em componentes por aba, **mantendo exatamente as mesmas fontes de dados** (PostgreSQL ou Sheets, conforme já está em produção).
2. **Criação das 5 abas novas como placeholders + placeholder institucional de Gestão Financeira e Governança.** Adicionar as abas "Pessoal e Gestão Escolar", "Tecnologia e Equipamentos", "Infraestrutura e Segurança", "Merenda Escolar", "Serviços Terceirizados" e — por decisão de produto — também "Gestão Financeira e Governança" à navegação do `/admin`, exibindo skeleton/empty state. As 5 primeiras esperam os endpoints que Frentes 1 e 2 vão entregar — a integração visual virá em PRs posteriores, fora desta rodada. A aba "Gestão Financeira e Governança" é placeholder **institucional**: a fonte de dados será definida futuramente a partir de bases próprias das coordenações responsáveis (não o banco do censo) e **não há fetch, endpoint, view SQL nem dado fake nesta etapa**.
3. **Qualidade de dados.** Preencher a tabela de paridade da Fase 2A com valores reais e investigar a origem dos decimais em `total_alunos`.

**Não é objetivo desta frente migrar nenhuma fonte de dados.** Toda mudança de PG ↔ Sheets fica para PRs posteriores em cima do que esta frente entrega.

**Não é objetivo desta frente criar consumo de dados, endpoints ou views para "Perfil dos Alunos e Resultados" nem para "Gestão Financeira e Governança".** Esses dois temas serão remodelados para consumir outra planilha e estão fora de escopo nesta rodada. A única ação autorizada para "Gestão Financeira e Governança" é o **placeholder visual** descrito no item 2.

## 2. Escopo

### Pode alterar

- `web/src/app/admin/page.tsx` — quebrar em componentes; manter API pública (a página continua sendo o entry point do `/admin`).
- `web/src/components/admin/` *(novo diretório)*:
  - Abas existentes:
    - `AbaCaracterizacao.tsx` (consome `analytics/caracterizacao/{perfil,dre}` + fallback `sheet-metrics`, **como hoje**).
    - `AbaPerfilAlunos.tsx` (consome `indicadores-metrics`, **como hoje** — não migrar).
    - `AbaOperacional.tsx` (consome `/admin/dashboard`).
    - `AbaTodosCensos.tsx` (consome `/admin/census`).
    - `AbaPorDre.tsx` (consome `/admin/dashboard.by_dre`).
  - Abas novas (placeholders):
    - `AbaPessoalGestao.tsx`
    - `AbaTecnologia.tsx`
    - `AbaInfraestruturaSeguranca.tsx`
    - `AbaMerenda.tsx`
    - `AbaServicosTerceirizados.tsx`
    - `AbaGestaoFinanceiraGovernanca.tsx` *(placeholder institucional — sem fetch, sem endpoint, sem dado fake; fonte futura: base própria das coordenações, fora do banco do censo)*
  - Componentes utilitários compartilhados (`StatCard`, `Donut`, `BarChart`, indicador de fonte, modal "ver JSON", `EmptyStatePlaceholder`) em `web/src/components/admin/shared/`.
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
- Layout visual macro das abas existentes (mesmas abas atuais, mesmos gráficos, mesmas cores). Refactor é estrutural, não visual.
- Criar abas com consumo de dados, endpoint ou view SQL para "Perfil dos Alunos e Resultados (remodelada)" — fora de escopo nesta rodada. Para "Gestão Financeira e Governança", apenas o **placeholder visual** (skeleton/empty state, sem fetch) está autorizado nesta rodada; qualquer integração de dados permanece fora de escopo.

## 3. Tarefas

### 3.1 Refactor de `admin/page.tsx` em componentes por aba

Princípios:

- **Mesma renderização, mesmas chamadas, mesmos estados.** Diff esperado: extração + import, não reescrita.
- Cada `Aba*.tsx` recebe o que precisa via props (token, callbacks) ou consome hooks dedicados.
- Estado de autenticação e de aba ativa continua em `page.tsx` (raiz).
- Indicador de fonte ("PostgreSQL · ano corrente" / "Google Sheets · fallback") continua exatamente como está hoje — apenas movido para o componente da aba relevante.
- O modal "ver JSON" e o botão "Sync Planilha" continuam no header.

Ordem sugerida de PRs no refactor:

1. **PR 1** — extrair `AbaOperacional.tsx` + `AbaPorDre.tsx` + `AbaTodosCensos.tsx` (as abas mais simples).
2. **PR 2** — extrair `AbaPerfilAlunos.tsx` (mantida lendo `indicadores-metrics`).
3. **PR 3** — extrair `AbaCaracterizacao.tsx` (a mais complexa — KPIs, donuts, barras, tabela DRE, fallback Sheets).
4. **PR 4** — extrair componentes compartilhados (`Donut`, `BarChart`, `StatCard`, indicador de fonte, `EmptyStatePlaceholder`) para `shared/`.

Cada PR deve manter `npm run build` e `npm run lint` no nível atual (zero erros novos).

### 3.2 Placeholders das 5 abas novas + placeholder institucional de Gestão Financeira e Governança

Criar 6 componentes, todos com a mesma estrutura: cabeçalho com título, descrição curta, `EmptyStatePlaceholder` (ícone + "Em construção" + texto explicativo curto), e — opcionalmente — skeleton de KPIs/cards que indica como ficará a aba depois da integração.

Adicionar as abas à navegação do `/admin` na ordem institucional acordada:

1. Caracterização da Rede (já existe)
2. **Pessoal e Gestão Escolar** *(nova — placeholder)*
3. **Tecnologia e Equipamentos** *(nova — placeholder)*
4. **Infraestrutura e Segurança** *(nova — placeholder)*
5. **Merenda Escolar** *(nova — placeholder)*
6. **Serviços Terceirizados** *(nova — placeholder)*
7. Perfil dos Alunos e Resultados (mantida como está)
8. **Gestão Financeira e Governança** *(nova — placeholder institucional, sem fonte de dados nesta etapa)*
9. Operacional (mantida como está)
10. Todos os Censos (mantida como está)
11. Por DRE (mantida como está)

(Ordem definida pelo stakeholder; manter facilmente reordenável no shell.)

Cada placeholder **não faz fetch nenhum** nesta frente. Carregar o endpoint correspondente é tarefa do PR de integração visual (fora desta rodada).

> **Distinção importante.** As 5 abas temáticas (Pessoal/Gestão, Tecnologia, Infra/Segurança, Merenda, Serviços Terceirizados) **terão** fonte de dados PostgreSQL definida — as Frentes 1 e 2 estão entregando as views e endpoints correspondentes. Já a aba **"Gestão Financeira e Governança"** é placeholder **institucional**: a fonte de dados será definida futuramente a partir de bases próprias das coordenações responsáveis (não o banco do censo operacional), portanto **nenhuma view SQL, endpoint ou integração de dados deve ser criada para ela** nesta rodada nem em PRs subsequentes de integração das 5 abas temáticas. Sem dado fake, sem mock, sem `dummy` payload.

Texto sugerido do placeholder (5 abas temáticas):

> **Em construção**
>
> Esta seção exibirá indicadores agregados sobre [tema]. A camada de dados está sendo entregue pela equipe e a visualização será habilitada em breve.

Texto sugerido do placeholder (Gestão Financeira e Governança):

> **Em construção**
>
> Esta seção exibirá indicadores de Gestão Financeira e Governança. A fonte de dados está sendo definida pelas coordenações responsáveis e a visualização será habilitada em uma próxima rodada.

PR sugerido:

- **PR 5** — criar os 6 placeholders + componente compartilhado `EmptyStatePlaceholder` + adicionar à navegação do `/admin`.

### 3.3 Tabela de paridade PG × Sheets (validação Fase 2A)

Preencher [validacao-fase-2.md](validacao-fase-2.md) — tabela "Métricas comparadas" (linhas 100–132):

- Capturar os payloads dos endpoints em homologação:
  - `GET /v1/admin/sheet-metrics`
  - `GET /v1/admin/analytics/caracterizacao/perfil`
  - `GET /v1/admin/analytics/caracterizacao/dre`
- Preencher cada linha com `valor PG`, `valor Sheets`, `delta`, `observação`.
- Para deltas > 1% em KPIs ou em categorias com volume ≥ 50 escolas: anexar hipótese de causa (INEP repetido, drafts não migrados, anexos, correção pós-sync). Cruzar com [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) seção 6.

### 3.4 Investigação dos decimais em `total_alunos`

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
- Listar escolas afetadas em uma seção nova de [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md): seção 8 "Decimais em campos conceitualmente inteiros".
- Recomendação final: validação no Zod (`z.number().int()` ou `z.coerce.number().int()` no `general-data.ts`) **se** a análise indicar que é erro de input. Implementar em PR isolado, revisado, sem mudar submit.

### 3.5 Sanity local

```bash
cd web
npm install
npm run build
npm run lint
npm run dev      # abrir http://localhost:3000/admin e navegar todas as abas
```

Verificar manualmente:
- todas as abas continuam carregando — as 5 existentes idênticas ao baseline e as 5 novas mostrando placeholder;
- indicador de fonte "PostgreSQL · ano corrente" segue verde na Caracterização da Rede;
- fallback Sheets continua sendo carregado em paralelo (DevTools › Network);
- nenhuma regressão de cor, layout, ordenação ou texto nas abas existentes.

## 4. Critérios de aceite

- [ ] `web/src/app/admin/page.tsx` reduzido a um shell (autenticação + aba ativa + composição dos componentes).
- [ ] Cada aba existente em seu próprio arquivo sob `web/src/components/admin/`.
- [ ] 5 abas temáticas novas (Pessoal/Gestão, Tecnologia, Infra/Segurança, Merenda, Serviços Terceirizados) criadas como placeholders e visíveis na navegação.
- [ ] Aba **Gestão Financeira e Governança** criada como placeholder institucional, visível na navegação, **sem fetch, sem endpoint, sem view SQL, sem dado fake**.
- [ ] Componentes compartilhados (`Donut`, `BarChart`, `StatCard`, indicador de fonte, `EmptyStatePlaceholder`) em `web/src/components/admin/shared/`.
- [ ] `npm run build` OK. `npm run lint` sem erros novos.
- [ ] Validação visual manual em homologação: abas existentes idênticas ao baseline; abas novas mostrando placeholder.
- [ ] Tabela "Métricas comparadas" em [validacao-fase-2.md](validacao-fase-2.md) preenchida com números reais.
- [ ] Seção "Decimais em `total_alunos`" criada em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) com escolas listadas e hipóteses.
- [ ] **Nenhuma mudança em `api/`, `infra/`, formulário, autenticação ou submit.**
- [ ] **Nenhuma migração de fonte (PG ↔ Sheets).**
- [ ] **Nenhuma aba com consumo de dados criada para "Perfil dos Alunos (remodelada)" nem "Gestão Financeira e Governança".** A aba "Gestão Financeira e Governança" entra apenas como **placeholder visual** (sem fetch, sem endpoint, sem view SQL, sem dado fake).

## 5. Riscos conhecidos

- `admin/page.tsx` é grande (~50 KB) e contém estado entrelaçado. Risco de regressão sutil em hidratação ou em fallback parcial. Mitigação: PRs pequenos por aba; smoke manual em cada PR.
- O refactor pode descobrir bugs latentes (ex.: erros de lint pré-existentes ainda em `tailwind.config.mjs`, `setToken` em `AdminPage`). **Não tentar consertar tudo no mesmo PR** — abrir tasks separadas.
- A investigação de decimais pode revelar problema sistêmico no formulário (campo numérico aceitando vírgula). Se for isso, a correção no Zod é uma decisão de produto — abrir issue antes de implementar.
- A ordem definitiva das abas na navegação pode mudar conforme stakeholder. Manter a ordem facilmente reordenável no shell (`page.tsx`).

## 6. Fora de escopo

- Plugar os endpoints das Frentes 1 e 2 nos placeholders — PRs posteriores, fora desta rodada.
- Refatorar componentes do formulário (`web/src/components/forms/*`).
- Mudar autenticação, persistência, navegação do wizard.
- Resolver warnings pré-existentes não relacionados ao refactor.
- Criar aba com consumo de dados para "Perfil dos Alunos e Resultados" remodelada (consumirá outra planilha — ainda em definição).
- Criar **consumo de dados / endpoint / view SQL** para "Gestão Financeira e Governança". O **placeholder visual** desta aba está autorizado nesta rodada (seção 3.2); a integração de dados permanece fora de escopo e dependerá de bases próprias das coordenações responsáveis, a serem definidas futuramente.

## 7. Coordenação com as outras frentes

- Frente 1 e Frente 2 **não tocam** em `web/`. Nenhum conflito esperado durante o desenvolvimento.
- Ao final desta frente, os 5 placeholders ficam prontos para receber, em PRs futuros, os endpoints entregues pelas Frentes 1 e 2 — sem necessidade de novo refactor estrutural.
- Nome dos componentes alinhado com os endpoints sugeridos das outras frentes:
  - `AbaPessoalGestao.tsx` ↔ `/v1/admin/analytics/pessoal-gestao/*` (Frente 1)
  - `AbaTecnologia.tsx` ↔ `/v1/admin/analytics/tecnologia/*` (Frente 1)
  - `AbaInfraestruturaSeguranca.tsx` ↔ `/v1/admin/analytics/infraestrutura/*` (Frente 2)
  - `AbaMerenda.tsx` ↔ `/v1/admin/analytics/merenda/*` (Frente 2)
  - `AbaServicosTerceirizados.tsx` ↔ `/v1/admin/analytics/servicos-terceirizados/*` (Frente 2)
  - `AbaGestaoFinanceiraGovernanca.tsx` ↔ **sem endpoint correspondente** (placeholder institucional; fonte futura: base própria das coordenações, definição fora do escopo das Frentes 1 e 2).
