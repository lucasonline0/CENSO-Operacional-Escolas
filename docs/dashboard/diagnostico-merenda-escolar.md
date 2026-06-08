# Diagnóstico Técnico — Merenda Escolar

> **Status atualizado:** MER-01A/B/C e **MER-RH-01** foram entregues. Este documento preserva o diagnóstico original da aba Merenda e registra que Recursos Humanos / Merendeiras foi efetivamente migrado para Serviços Terceirizados.
>
> MER-RH-01 não criou migration/view nova, não alterou formulário, schemas, autenticação ou Google Sheets, e manteve `/v1/admin/analytics/merenda/recursos-humanos` como endpoint legado.

## 1. Objetivo

Confirmar, por leitura estática do código, o estado real da aba **Merenda Escolar** do `/admin` frente aos **gráficos mínimos** preservados do painel original do Data Studio/Looker Studio, classificando cada gráfico como **completo**, **parcial** ou **ausente** e indicando, para cada um:

- se exige **backend**, apenas **frontend**, ou **decisão de produto**;
- qual arquivo será provavelmente alterado;
- qual é o **menor PR** possível para fechar as lacunas.

A aba foi realinhada (ver `matriz-abas-e-graficos.md` §5.5) a **quatro blocos finalísticos**:

- **Oferta e Adequação da Merenda**
- **Estrutura Física**
- **Equipamentos da Merenda**
- **Condições Sanitárias e Segurança**

O antigo bloco **Recursos Humanos / Merendeiras** **deixou de ser finalístico de Merenda** e foi migrado para o menu **Serviços Terceirizados** como **Manipulador de Alimentos** (`sec-servicos-manipuladores`). A aba Merenda não renderiza mais `sec-merenda-rh`.

## 2. Fontes analisadas

Documentação:

- `docs/dashboard/matriz-abas-e-graficos.md` — §2.8 (decisão RH), §4, §5.5 (Merenda), §5.6 (Serviços Terceirizados), §7.
- `docs/dashboard/lacunas-backend-frontend-por-bloco.md` — §3 (resumo executivo), §6.4 (Merenda), §8.
- `docs/dashboard/especificacao-entrega-dados-por-grafico.md` — §6.1 (tamanho da cozinha), §6.6 (Merenda — gráficos mínimos do Data Studio).

Frontend:

- `web/src/components/admin/AbaMerenda.tsx`
- `web/src/components/admin/AbaServicosTerceirizados.tsx`
- `web/src/components/admin/shared/types.ts` (`MerendaOferta`, `MerendaEquipamentos`, `MerendaRH`, `EquipTotais`, `EstadoEquipStat`, `EmpresaStat`, `CategoricStat`)
- `web/src/components/admin/shared/Donut.tsx`, `BarChart.tsx`, `StatCard.tsx`
- `web/src/app/admin/page.tsx` (montagem da aba)

Backend e banco:

- `api/cmd/api/main.go` — registro das rotas (linhas 358–360).
- `api/cmd/api/analytics_infra_merenda_servicos.go` — handlers `AdminAnalyticsMerendaOferta` (282), `AdminAnalyticsMerendaEquipamentos` (347), `AdminAnalyticsMerendaRH` (412); structs de payload (47–83).
- `api/cmd/api/migrations/0009_vw_censo_equipamentos_merenda.sql` (espelhada idêntica em `infra/migrations/0009_*`).
- `api/cmd/api/migrations/0010_vw_censo_rh_merendeiras.sql` (espelhada idêntica em `infra/migrations/0010_*`).

Observação metodológica: diagnóstico por **leitura estática**. Os endpoints **não** foram executados contra banco local/homologação nesta rodada. A confirmação de cardinalidades, categorias reais e percentuais fica para a fase de implementação + validação.

## 3. Organização Data Studio ↔ Aplicação

```txt
Data Studio: Oferta e Adequação da Merenda     → Aplicação: Oferta e Adequação da Merenda      (sec-merenda-oferta)
Data Studio: Estrutura Física                  → Aplicação: Estrutura Física                   (sec-merenda-estrutura)
Data Studio: Equipamentos                      → Aplicação: Equipamentos da Merenda            (sec-merenda-equipamentos)
Data Studio: Condições Sanitárias e Segurança  → Aplicação: Condições Sanitárias e Segurança  (sec-merenda-sanitarias) — MER-01C
Data Studio: Recursos Humanos                  → Aplicação: Serviços Terceirizados / Manipulador de Alimentos (sec-servicos-manipuladores)
```

Mapeamento técnico:

- **Oferta e Adequação** + **Estrutura Física** são servidos pelo **mesmo endpoint** `GET /v1/admin/analytics/merenda/oferta` (payload `MerendaOferta`), que lê **duas views**: `vw_censo_rh_merendeiras` (oferta/qualidade/atende) e `vw_censo_equipamentos_merenda` (condições da cozinha/refeitório).
- **Equipamentos da Merenda** é servido por `GET /v1/admin/analytics/merenda/equipamentos` (payload `MerendaEquipamentos`), lendo `vw_censo_equipamentos_merenda`.
- **Condições Sanitárias e Segurança** (MER-01C) é servido por `GET /v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`), lendo `vw_censo_equipamentos_merenda` (`despensa_exclusiva`, `deposito_conserva`, `sistema_exaustao`, `bancadas_inox`, `estoque_epi_extintor`, `manutencao_extintores`); renderizado em `sec-merenda-sanitarias`.
- **Recursos Humanos / merendeiras** agora é servido em Serviços Terceirizados por `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos`, lendo `vw_censo_rh_merendeiras`. O endpoint `GET /v1/admin/analytics/merenda/recursos-humanos` permanece ativo como legado.

> **Boa notícia estrutural:** as duas views (`0009` e `0010`) **já contêm todos os campos** dos gráficos mínimos dos quatro blocos finalísticos. **Nenhuma migration/view nova é necessária.** As lacunas são de **exposição em endpoint** e de **renderização**, mais algumas **decisões de produto** (faixas de quantidade, criticidade).

## 4. Estado atual dos endpoints

Observação transversal: os três handlers de Merenda usam um **filtro fixo** no código —
`status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL` —
e **não aceitam filtros por query string** (`year`, `dre`, `municipio`, `zona`, `porte_escola`), diferentemente dos endpoints de Pessoal/Tecnologia. Isso não bloqueia os gráficos mínimos, mas é uma lacuna de padronização a registrar (alinha com a observação transversal da B2 em `lacunas-backend-frontend-por-bloco.md`).

### 4.1 GET /v1/admin/analytics/merenda/oferta

Handler: `AdminAnalyticsMerendaOferta` (`analytics_infra_merenda_servicos.go:282`). Lê `vw_censo_rh_merendeiras` e `vw_censo_equipamentos_merenda`.

Payload atual (`MerendaOferta`):

| Campo | Tipo | Cálculo no backend | Bloco |
|---|---|---|---|
| `dist_oferta_regular` | `CategoricStat[]` | distribuição de `oferta_regular` (COUNT DISTINCT + %) | Oferta |
| `dist_qualidade` | `CategoricStat[]` | distribuição de `qualidade_merenda` | Oferta |
| `pct_atende_necessidades` | float | `% onde lower(atende_necessidades) = 'sim'` | Oferta |
| `dist_condicoes_cozinha` | `CategoricStat[]` | distribuição de `condicoes_cozinha` | Estrutura |
| `pct_possui_refeitorio` | float | `% onde lower(possui_refeitorio) = 'sim'` | Estrutura |

Observações relevantes:

- Há um **helper local `distQ(view, campo)`** que computa distribuição categórica completa (`COUNT(DISTINCT school_id)` + percentual). **É diretamente reaproveitável** para `atende_necessidades`, `possui_refeitorio`, `tamanho_cozinha` e `refeitorio_adequado` — o custo de expandir é mínimo.
- `atende_necessidades` é **colapsado para % de "Sim"**; a distribuição Sim/Parcialmente/Não **não** é exposta.
- `possui_refeitorio` é **colapsado para % de "Sim"**; a distribuição Sim/Não **não** é exposta.
- `tamanho_cozinha` e `refeitorio_adequado` **existem na view mas não são lidos** por este handler.

### 4.2 GET /v1/admin/analytics/merenda/equipamentos

Handler: `AdminAnalyticsMerendaEquipamentos` (`analytics_infra_merenda_servicos.go:347`). Lê `vw_censo_equipamentos_merenda`.

Payload atual (`MerendaEquipamentos`):

| Campo | Tipo | Cálculo no backend |
|---|---|---|
| `freezers` | `EquipTotais` | `SUM(qtd_freezers)` + `AVG(qtd_freezers) FILTER (qtd IS NOT NULL)` |
| `geladeiras` | `EquipTotais` | idem `qtd_geladeiras` |
| `fogoes` | `EquipTotais` | idem `qtd_fogoes` |
| `fornos` | `EquipTotais` | idem `qtd_fornos` |
| `bebedouros` | `EquipTotais` | idem `qtd_bebedouros` |
| `dist_estados` | `EstadoEquipStat[]` | `UNION ALL` por tipo → `(equipamento, estado, COUNT(*))` |

`EquipTotais = { total, media_por_escola }`. `EstadoEquipStat = { equipamento, estado, escolas }`.

Observações relevantes:

- Entrega **totais e médias por tipo** (cobre "quantidade média de equipamentos por escola").
- A **média** usa `AVG(... ) FILTER (WHERE qtd IS NOT NULL)` — ou seja, média **entre escolas declarantes** (não força 0). Coerente com a média de projetores em Tecnologia.
- `dist_estados` entrega a distribuição **por equipamento × estado** (linha a linha), já normalizada com `lower()` na view.
- **MER-01B** acrescentou ao payload: `presenca_por_tipo` (% de escolas com `qtd > 0`), `faixas_qtd_tipos` (faixas cumulativas 1+/2+/3+ por nº de tipos), `estado_consolidado` (Bom/Regular/Ruim-Inoperante por equipamento), `media_por_tipo` (espelha a média dos cards) e `criticidade_por_equipamento` (% ruim/inoperante por equipamento). Campos anteriores preservados.

### 4.3 GET /v1/admin/analytics/merenda/recursos-humanos

Handler: `AdminAnalyticsMerendaRH` (`analytics_infra_merenda_servicos.go:412`). Lê `vw_censo_rh_merendeiras`.

Payload atual (`MerendaRH`):

| Campo | Tipo | Cálculo no backend |
|---|---|---|
| `total_estatutaria` | float | `SUM(qtd_merendeiras_estatutaria)` |
| `total_terceirizada` | float | `SUM(qtd_merendeiras_terceirizada)` |
| `total_temporaria` | float | `SUM(qtd_merendeiras_temporaria)` |
| `pct_com_supervisor` | float | `% onde lower(possui_supervisor_merenda) = 'sim'` |
| `top_empresas` | `EmpresaStat[]` | Top 10 `empresa_terceirizada_merenda` por nº de escolas |

Observações relevantes (para a frente futura de Serviços Terceirizados):

- A view `vw_censo_rh_merendeiras` também contém `qtd_atende_necessidade_merenda` (texto) e `quantitativo_necessario_merenda` (numérico) — **insumos para "a quantidade atual atende à necessidade?"** — que **não** são expostos hoje.
- **Não há** campo de **avaliação do serviço das merendeiras** nesta view. Pela `especificacao-entrega-dados-por-grafico.md` §5.4.3, a avaliação provável (`avaliacao_merendeiras`) está em `vw_censo_servicos_terceirizados` — a confirmar na rodada de Serviços Terceirizados.
- **Quantidade média de merendeiras por escola** não é exposta (derivável de `qtd_merendeiras_*`).

## 5. Estado atual do frontend

`AbaMerenda.tsx` consome os endpoints finalísticos de Merenda em paralelo (`/oferta`, `/equipamentos`, `/condicoes-sanitarias`) e renderiza:

**Resumo executivo:** % atende necessidades e % possui refeitório. Os cards de supervisor e total de merendeiras foram removidos em MER-RH-01.

**Oferta e Adequação (`#sec-merenda-oferta`):**
- Donut **Oferta regular da merenda** (de `dist_oferta_regular`).
- `HBarChart` **Qualidade da merenda** (de `dist_qualidade`).

**Estrutura Física (`#sec-merenda-estrutura`):**
- `HBarChart` **Condições da cozinha** (de `dist_condicoes_cozinha`).
- Donut **Possui refeitório?** (`dist_possui_refeitorio`).
- `HBarChart` **Tamanho da cozinha** (`dist_tamanho_cozinha`).
- `HBarChart` **O refeitório atende a necessidade da escola adequadamente?** (`dist_refeitorio_adequado`).

**Equipamentos (`#sec-merenda-equipamentos`):**
- 5 `EquipCard` (Freezers, Geladeiras, Fogões, Fornos, Bebedouros) — cada um com **total** + **média por escola**.
- Tabela **Distribuição do estado dos equipamentos** (de `dist_estados`, agrupada por equipamento).

**Recursos Humanos / Merendeiras:** removido de Merenda em MER-RH-01; o bloco equivalente está em Serviços Terceirizados (`#sec-servicos-manipuladores`).

**Condições Sanitárias e Segurança (`#sec-merenda-sanitarias`, MER-01C):**
- Donut **Despensa exclusiva p/ gêneros alimentícios** (`dist_despensa_exclusiva`).
- Donut **O depósito conserva adequadamente os alimentos?** (`dist_deposito_conserva`).
- `HBarChart` **Presença de itens básicos** (`presenca_itens_basicos`: despensa exclusiva, sistema de exaustão, bancadas de inox; denominador = escolas concluídas no recorte).
- `HBarChart` **Estoque de EPIs e extintor de incêndio** (`dist_estoque_epi_extintor`).
- `HBarChart` **Recarga e manutenção dos extintores** (`dist_manutencao_extintores`).

Componentes compartilhados disponíveis (sem criar novos): `StatCard` (KPI), `Donut`/`PieChart` (distribuições, `{ label, value, color, pct? }[]`), `VBarChart`/`HBarChart` (barras). Convenção de payload de distribuição: `CategoricStat = { valor, escolas, percentual }`.

## 6. Diagnóstico por gráfico mínimo

Legenda das 10 respostas (na ordem): (1) existe no frontend; (2) dado no payload; (3) campo na view; (4) cálculo no backend; (5) cálculo possível no frontend com payload atual; (6) precisa expandir endpoint; (7) precisa endpoint novo; (8) precisa migration/view; (9) depende de produto; (10) arquivo provável.

### 6.1 Oferta e Adequação da Merenda

#### 6.1.1 Oferta regular da merenda

- **Estado: COMPLETO.** Donut renderizado a partir de `dist_oferta_regular`.
- (1) Sim. (2) Sim. (3) Sim — `vw_censo_rh_merendeiras.oferta_regular`. (4) Sim (distribuição). (5) n/a. (6–9) Não. (10) Nenhum.

#### 6.1.2 Qualidade da merenda

- **Estado: COMPLETO.** `HBarChart` renderizado a partir de `dist_qualidade`.
- (1) Sim. (2) Sim. (3) Sim — `qualidade_merenda`. (4) Sim. (5) n/a. (6) Não. (7) Não. (8) Não. (9) Refino menor: confirmar normalização das opções. (10) Nenhum.

#### 6.1.3 Merenda atende às necessidades

- **Estado: ENTREGUE (MER-01A).** `dist_atende_necessidades` exposto em `/merenda/oferta` via `distQ("vw_censo_rh_merendeiras", "atende_necessidades")` e renderizado como `Donut` em `sec-merenda-oferta`. O KPI `pct_atende_necessidades` foi mantido no resumo executivo (duplicidade KPI + gráfico aceita).
- (1) Não (só StatCard %). (2) Não (só o %). (3) **Sim** — `vw_censo_rh_merendeiras.atende_necessidades` (categórico). (4) Calcula só o % de "Sim". (5) **Não** — sem o array por categoria, o frontend não reconstrói Parcialmente/Não. (6) **Sim** — expandir `/merenda/oferta` (helper `distQ` já existe). (7) Não. (8) Não. (9) Confirmar categorias reais (esperado "Sim"/"Parcialmente"/"Não"). (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Recomendação:** reusar `distQ("vw_censo_rh_merendeiras", "atende_necessidades")` e renderizar donut, mantendo o KPI.

### 6.2 Estrutura Física

#### 6.2.1 Condições da cozinha

- **Estado: COMPLETO.** `HBarChart` renderizado a partir de `dist_condicoes_cozinha`.
- (1) Sim. (2) Sim. (3) Sim — `vw_censo_equipamentos_merenda.condicoes_cozinha`. (4) Sim. (5) n/a. (6–9) Não. (10) Nenhum.

#### 6.2.2 Possui refeitório

- **Estado: ENTREGUE (MER-01A).** `dist_possui_refeitorio` exposto em `/merenda/oferta` via `distQ("vw_censo_equipamentos_merenda", "possui_refeitorio")` e renderizado como `Donut` em `sec-merenda-estrutura`. KPI `pct_possui_refeitorio` mantido no resumo executivo. Nuance `NULL` ("não informado" fica fora da distribuição) preservada — ver §6.5 / observações.
- (1) Parcial (StatCard %). (2) Parcial (só o %). (3) Sim — `possui_refeitorio`. (4) Calcula só % "Sim". (5) **Parcial** — `Não = 100 − pct` é derivável, mas a contagem absoluta de escolas "Não" não está no payload (o total não é exposto). (6) **Sim** (recomendado) — expandir `/merenda/oferta` via `distQ`. (7) Não. (8) Não. (9) Nuance: a view usa `NULLIF('','')`, então "não informado" vira `NULL` e **fica fora** da distribuição (diferente do booleano de Tecnologia). Decidir se "não informado" entra como categoria. (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Recomendação:** expor `dist_possui_refeitorio` via `distQ` (mais coerente que derivar no frontend, pois dá contagens corretas e trata o `NULL`).

#### 6.2.3 Tamanho da cozinha

- **Estado: ENTREGUE (MER-01A).** `dist_tamanho_cozinha` exposto em `/merenda/oferta` via `distQ("vw_censo_equipamentos_merenda", "tamanho_cozinha")` e renderizado como `HBarChart` em `sec-merenda-estrutura`.
- (1) Não. (2) Não. (3) **Sim** — `vw_censo_equipamentos_merenda.tamanho_cozinha`. (4) Não. (5) Não. (6) **Sim** — expandir `/merenda/oferta` via `distQ`. (7) Não. (8) Não. (9) Confirmar categorias válidas e tratamento de texto livre. (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Recomendação:** reusar `distQ("vw_censo_equipamentos_merenda", "tamanho_cozinha")` e renderizar donut em `sec-merenda-estrutura`.

#### 6.2.4 Refeitório adequado

- **Estado: ENTREGUE (MER-01A).** `dist_refeitorio_adequado` exposto em `/merenda/oferta` via `distQ("vw_censo_equipamentos_merenda", "refeitorio_adequado")` e renderizado como `HBarChart` em `sec-merenda-estrutura`. Denominador: escolas com o campo informado (padrão atual do `distQ`); decisão de usar "apenas quem possui refeitório" fica como observação para fase futura.
- (1) Não. (2) Não. (3) **Sim** — `vw_censo_equipamentos_merenda.refeitorio_adequado`. (4) Não. (5) Não. (6) **Sim** — expandir `/merenda/oferta` via `distQ`. (7) Não. (8) Não. (9) Confirmar se o denominador é "todas as concluídas" ou "apenas as que possuem refeitório". (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Recomendação:** reusar `distQ` e renderizar; documentar a decisão de denominador.

### 6.3 Equipamentos da Merenda

#### 6.3.1 Presença de equipamentos por tipo

- **Estado: ENTREGUE (MER-01B).** `presenca_por_tipo` exposto em `/merenda/equipamentos` via `COUNT(DISTINCT school_id) FILTER (WHERE qtd_tipo > 0)` por tipo, com percentual sobre escolas concluídas no recorte. Renderizado como HBar em `sec-merenda-equipamentos`. Critério "possui = qtd > 0" confirmado.
- (1) Sim. (2) Sim. (3) Sim — `qtd_freezers`, `qtd_geladeiras`, `qtd_fogoes`, `qtd_fornos`, `qtd_bebedouros`. (4) Sim. (5) n/a. (6–9) Não. (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.

#### 6.3.2 Escolas com 1, 2 ou mais equipamentos

- **Estado: ENTREGUE (MER-01B).** Decisão de produto tomada: **Interpretação (A) por nº de tipos**, com faixas **cumulativas** "1 ou mais tipos" / "2 ou mais tipos" / "3 ou mais tipos" (rótulos explícitos para evidenciar percentuais decrescentes). Para cada escola conta-se quantos dos 5 tipos têm `qtd > 0`; `faixas_qtd_tipos` exposto em `/merenda/equipamentos` (denominador = escolas concluídas no recorte) e renderizado como HBar.
- (1) Sim. (2) Sim. (3) Sim — `qtd_*`. (4) Sim. (5) n/a. (6–9) Não (decisão de produto resolvida nesta task). (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.

#### 6.3.3 Estado de conservação consolidado

- **Estado: ENTREGUE (MER-01B; refinamento visual MER-EQP-REFINE-01).** Consolidado **no backend** (não derivado no frontend) para padronizar os agrupamentos: `estado_consolidado` agrupa por equipamento em **Bom** / **Regular** / **Ruim/Inoperante** (`lower()` + `LIKE` defensivo), contando **escolas**, com denominador = escolas com estado informado para aquele equipamento. Renderizado, após MER-EQP-REFINE-01, como **gráfico de barras empilhadas horizontais** (uma barra 100% por equipamento) acima da tabela detalhada (`dist_estados` mantida) — frontend puro, sem alteração de backend.
- (1) Sim. (2) Sim. (3) Sim — `estado_*` (normalizados com `lower()`). (4) Sim. (5) n/a. (6) Sim (consolidado no servidor). (7) Não. (8) Não. (9) Decisão tomada: conta **escolas**; rótulos Bom/Regular/Ruim-Inoperante. (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.

#### 6.3.4 Quantidade média de equipamentos por escola

- **Estado: COMPLETO.** Cada `EquipCard` exibe `media_por_escola` (de `EquipTotais.media`).
- (1) Sim. (2) Sim. (3) Sim — `qtd_*`. (4) Sim — `AVG(qtd) FILTER (qtd IS NOT NULL)`. (5) n/a. (6–9) Não. (10) Nenhum.
- Nota: a média é **entre escolas declarantes** (não força 0). Se o produto preferir "média sobre todas as escolas", seria mudança de denominador — registrar como refino, não como lacuna.

#### 6.3.5 Criticidade por equipamento

- **Estado: ENTREGUE (MER-01B).** Definição fixada: **% de escolas com estado ruim ou inoperante** por equipamento. Numerador = escolas com `lower(estado) LIKE 'ruim%' OR LIKE 'inoperante%'` (cobre tanto `ruim`/`inoperante` curtos quanto `"ruim — funcionamento comprometido"`); denominador = escolas com estado informado para aquele equipamento. `criticidade_por_equipamento` exposto em `/merenda/equipamentos` e renderizado como HBar com destaque (cor rosa).
- (1) Sim. (2) Sim. (3) Sim — `estado_*`. (4) Sim. (5) n/a. (6) Sim. (7) Não. (8) Não. (9) Decisão tomada (estados críticos + denominador). (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Nota:** o uso de `LIKE` por prefixo (em vez de `IN`) torna a regra robusta a variações textuais longas, conforme alerta original.

### 6.4 Condições Sanitárias e Segurança

> **Bloco ENTREGUE (MER-01C).** Endpoint dedicado `GET /v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`) lê `vw_censo_equipamentos_merenda`; rota registrada em `main.go`; tipos em `types.ts`; bloco renderizado em `AbaMerenda.tsx` sob `sec-merenda-sanitarias`, com item de menu em `page.tsx`. **Nenhuma migration/view nova.** As distribuições categóricas usam denominador = escolas com valor informado; `presenca_itens_basicos` usa denominador = total de escolas concluídas no recorte. As subseções abaixo refletem o diagnóstico original (pré-entrega).

#### 6.4.1 Despensa exclusiva para gêneros alimentícios

- **Estado: AUSENTE.** Campo `despensa_exclusiva` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6) Sim (se expandir `/oferta`) **ou** (7) Sim (se endpoint dedicado). (9) Confirmar semântica/respostas equivalentes a "Sim". 
- **Recomendação:** KPI % ou distribuição Sim/Não no novo bloco.

#### 6.4.2 Depósito conserva adequadamente os alimentos

- **Estado: AUSENTE.** Campo `deposito_conserva` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6)/(7) conforme decisão de endpoint. (9) Confirmar normalização das respostas.
- **Recomendação:** KPI % ou distribuição no novo bloco.

#### 6.4.3 Presença de itens básicos

- **Estado: AUSENTE.** Campos `possui_balanca`, `bancadas_inox`, `sistema_exaustao` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6)/(7) conforme decisão. (9) Confirmar lista oficial de "itens básicos".
- **Recomendação:** barra horizontal de presença por item (% de escolas com cada item) no novo bloco.

> **Observação (MER-01C):** o campo `possui_balanca` existe na view `vw_censo_equipamentos_merenda`, mas **não compõe** `presenca_itens_basicos` nesta entrega. A composição adotada segue o escopo da MER-01C: **despensa exclusiva, sistema de exaustão e bancadas de inox**. A inclusão de balança pode ser avaliada futuramente se a área finalística considerar o item essencial para o indicador.

#### 6.4.4 Estoque de EPIs e extintor

- **Estado: AUSENTE.** Campo `estoque_epi_extintor` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6)/(7) conforme decisão. (9) Confirmar se o campo agrega EPI + extintor numa só resposta.
- **Recomendação:** KPI % ou distribuição no novo bloco.

#### 6.4.5 Recarga/manutenção dos extintores

- **Estado: AUSENTE.** Campo `manutencao_extintores` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6)/(7) conforme decisão. (9) Confirmar categorias (em dia / vencida / não informado).
- **Recomendação:** distribuição categórica no novo bloco.

### 6.5 Recursos Humanos / Merendeiras

> **MER-RH-01 entregue.** Não é gráfico mínimo da aba Merenda. O bloco foi removido de Merenda e adicionado em Serviços Terceirizados como **Manipulador de Alimentos**.

#### 6.5.1 Situação atual após MER-RH-01

- O endpoint novo `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` entrega: `total_estatutaria`, `total_terceirizada`, `total_temporaria`, `total_geral`, `media_por_escola`, `pct_com_supervisor`, `dist_vinculo`, `dist_atende_necessidade`, `top_empresas`.
- `AbaServicosTerceirizados.tsx` renderiza o bloco `sec-servicos-manipuladores` com KPIs, Donut de distribuição por vínculo, Donut de atendimento à necessidade e `HBarChart` de top empresas terceirizadas.
- `AbaMerenda.tsx` deixou de consumir `/merenda/recursos-humanos` e não renderiza mais `sec-merenda-rh`, nem os cards "Com Supervisor" e "Total de Merendeiras" no resumo executivo.
- Cobre, do Data Studio: **total por vínculo**, **empresas e abrangência** (top empresas), **supervisão pelas empresas**, **média por escola** e **adequação do quantitativo** por `atende_necessidades`.
- **Não há na view `0010`** campo de **avaliação do serviço das merendeiras** — provável origem em `vw_censo_servicos_terceirizados.avaliacao_merendeiras` (a confirmar).

#### 6.5.2 Decisão de migração para Serviços Terceirizados

- Por decisão de produto (`matriz-abas-e-graficos.md` §2.8), o bloco RH migrou para o menu **Serviços Terceirizados**, como bloco **"Manipulador de Alimentos"**, ao lado de Serviços Gerais e Portaria.
- O endpoint `/merenda/recursos-humanos` permanece ativo como legado para compatibilidade.
- A avaliação do serviço das merendeiras permanece pendência futura/produto, sem payload consolidado nesta entrega.

#### 6.5.3 Endpoint entregue

- `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` reaproveita `vw_censo_rh_merendeiras` e o filtro fixo de Frente 2 (`status = 'completed'`, ano corrente, `census_id IS NOT NULL`).
- `dist_vinculo` representa a composição percentual dos quantitativos somados por vínculo; `dist_atende_necessidade` representa escolas por resposta informada em `atende_necessidades`.
- `GET /v1/admin/analytics/merenda/recursos-humanos` não foi removido.

## 7. Tabela consolidada de lacunas

| Bloco | Gráfico | Estado | Backend | Frontend | Produto | Próxima ação |
|---|---|---|---|---|---|---|
| Oferta | Oferta regular da merenda | Completo | — | — | — | Manter |
| Oferta | Qualidade da merenda | Completo | — | — | Refino normalização | Manter |
| Oferta | Atende necessidades (Sim/Parc./Não) | **Entregue (MER-01A)** | `dist_atende_necessidades` em `/oferta` | Donut | Confirmar categorias | — |
| Estrutura | Condições da cozinha | Completo | — | — | — | Manter |
| Estrutura | Possui refeitório (Sim/Não) | **Entregue (MER-01A)** | `dist_possui_refeitorio` em `/oferta` | Donut | Nuance "não informado" (`NULL`) | — |
| Estrutura | Tamanho da cozinha | **Entregue (MER-01A)** | `dist_tamanho_cozinha` em `/oferta` | HBar | Categorias válidas | — |
| Estrutura | Refeitório adequado | **Entregue (MER-01A)** | `dist_refeitorio_adequado` em `/oferta` | HBar | Denominador | — |
| Equipamentos | Presença por tipo | **Entregue (MER-01B)** | `presenca_por_tipo` em `/equipamentos` (`COUNT FILTER qtd>0`) | HBar | Critério "possui = qtd>0" | — |
| Equipamentos | Escolas com 1/2/3+ tipos | **Entregue (MER-01B)** | `faixas_qtd_tipos` em `/equipamentos` (faixas cumulativas) | HBar | Interpretação A + faixas definidas | — |
| Equipamentos | Estado consolidado | **Entregue (MER-01B + MER-EQP-REFINE-01)** | `estado_consolidado` em `/equipamentos` (Bom/Regular/Ruim-Inoperante) | Barras empilhadas horizontais (100%) | Conta escolas | — |
| Equipamentos | Média por escola | Completo | `media_por_tipo` (espelho) | Card + HBar | Denominador (refino) | Manter |
| Equipamentos | Criticidade por equipamento | **Entregue (MER-01B)** | `criticidade_por_equipamento` em `/equipamentos` | HBar destaque | % ruim/inoperante definido | — |
| Cond. Sanitárias | Despensa exclusiva | Ausente | Novo endpoint/bloco | Novo bloco | Semântica | Criar bloco |
| Cond. Sanitárias | Depósito conserva | Ausente | Novo endpoint/bloco | Novo bloco | Normalização | Criar bloco |
| Cond. Sanitárias | Presença de itens básicos | Ausente | Novo endpoint/bloco | Novo bloco | Lista oficial | Criar bloco |
| Cond. Sanitárias | Estoque EPIs/extintor | Ausente | Novo endpoint/bloco | Novo bloco | Campo agregado? | Criar bloco |
| Cond. Sanitárias | Manutenção dos extintores | Ausente | Novo endpoint/bloco | Novo bloco | Categorias | Criar bloco |
| RH | Total/empresas/supervisão | **Entregue em Serviços (MER-RH-01)** | `/servicos-terceirizados/manipuladores-alimentos` | `sec-servicos-manipuladores` | — | `/merenda/recursos-humanos` legado |
| RH | Atende necessidade (quantitativo) | **Entregue em Serviços (MER-RH-01)** | `dist_atende_necessidade` | Donut | — | Usa `atende_necessidades` |
| RH | Avaliação do serviço | Ausente | — | — | Escala/fonte de avaliação | Produto futuro |
| RH | Média de merendeiras/escola | **Entregue em Serviços (MER-RH-01)** | `media_por_escola` | StatCard | — | Média do total por escola |

Resumo dos quatro blocos finalísticos (excluindo RH): após MER-01A, MER-01B e MER-01C, os blocos **Oferta**, **Estrutura Física**, **Equipamentos da Merenda** e **Condições Sanitárias e Segurança** estão **completos**. **Nenhuma migration/view nova** foi necessária. A pendência não finalística RH/Merendeiras foi resolvida em MER-RH-01 com migração para Serviços Terceirizados.

> **MER-01A entregue.** Os 4 itens de Oferta/Estrutura que estavam parciais/ausentes (atende necessidades, possui refeitório, tamanho da cozinha, refeitório adequado) foram entregues expandindo `/merenda/oferta` com `dist_*`, sem nova view/migration/endpoint.
>
> **MER-01B entregue.** Os itens avançados de Equipamentos (presença por tipo, faixas por nº de tipos, estado consolidado, média por tipo, criticidade) foram entregues expandindo `/merenda/equipamentos`, sem nova view/migration/endpoint.
>
> **MER-01C entregue.** O bloco **Condições Sanitárias e Segurança** foi entregue com o endpoint dedicado `GET /v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`) sobre `vw_censo_equipamentos_merenda`, renderizado em `sec-merenda-sanitarias`, sem nova view/migration.
>
> **MER-RH-01 entregue.** RH/Merendeiras foi migrado para Serviços Terceirizados como **Manipulador de Alimentos**, sem remover o endpoint legado `/merenda/recursos-humanos`.

## 8. Payloads recomendados

> **Convenção.** O projeto já usa o prefixo `dist_*` com `CategoricStat = { valor, escolas, percentual }` (ex.: `dist_oferta_regular`, `dist_condicoes_cozinha`). **Recomenda-se seguir essa convenção** (`dist_atende_necessidades`, `dist_possui_refeitorio`, …) em vez de sufixos `*_dist`, por consistência com o código atual e reuso de `scanCategoricRows`/`distQ`.

Expansão de `MerendaOferta` (`GET /merenda/oferta`):

```ts
// Distribuições reaproveitando o helper distQ() existente:
dist_atende_necessidades: CategoricStat[]; // vw_censo_rh_merendeiras.atende_necessidades
dist_possui_refeitorio:   CategoricStat[]; // vw_censo_equipamentos_merenda.possui_refeitorio
dist_tamanho_cozinha:     CategoricStat[]; // vw_censo_equipamentos_merenda.tamanho_cozinha
dist_refeitorio_adequado: CategoricStat[]; // vw_censo_equipamentos_merenda.refeitorio_adequado
// (manter pct_atende_necessidades e pct_possui_refeitorio atuais)
```

Expansão de `MerendaEquipamentos` (`GET /merenda/equipamentos`) — **entregue em MER-01B** (campos anteriores preservados):

```ts
presenca_por_tipo: Array<{ equipamento: string; escolas: number; percentual: number }>;
faixas_qtd_tipos: Array<{ label: string; escolas: number; percentual: number }>;       // "1 ou mais tipos" / "2 ou mais tipos" / "3 ou mais tipos"
estado_consolidado: Array<{ equipamento: string; estado: string; escolas: number; percentual: number }>; // estado ∈ Bom | Regular | Ruim/Inoperante
media_por_tipo: Array<{ equipamento: string; media: number }>;                          // espelha a média dos cards
criticidade_por_equipamento: Array<{ equipamento: string; escolas_criticas: number; percentual: number }>;
```

Bloco **Condições Sanitárias e Segurança** — **entregue (MER-01C)** via endpoint dedicado `GET /v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`):

```ts
{
  dist_despensa_exclusiva:   CategoricStat[]; // despensa_exclusiva
  dist_deposito_conserva:    CategoricStat[]; // deposito_conserva
  presenca_itens_basicos: Array<{ item: string; escolas: number; percentual: number }>; // despensa exclusiva, sistema de exaustão, bancadas de inox — denominador = escolas concluídas no recorte
  dist_estoque_epi_extintor: CategoricStat[]; // estoque_epi_extintor
  dist_manutencao_extintores: CategoricStat[]; // manutencao_extintores
}
```

MER-RH-01 entregue em Serviços Terceirizados: `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` reaproveita `vw_censo_rh_merendeiras` e expõe totais, média por escola, supervisor, distribuição por vínculo, atendimento à necessidade e top empresas. Avaliação do serviço segue fora do escopo por falta de fonte/escala consolidada.

## 9. Arquivos prováveis da implementação

```txt
api/cmd/api/analytics_infra_merenda_servicos.go  # expandir handlers de oferta/equipamentos; novo handler de condições sanitárias
api/cmd/api/main.go                              # registrar rota nova SE optar por endpoint dedicado de condições sanitárias
web/src/components/admin/shared/types.ts          # novos campos em MerendaOferta/MerendaEquipamentos; nova interface de condições sanitárias
web/src/components/admin/AbaMerenda.tsx           # renderizar distribuições faltantes + novo bloco Condições Sanitárias
web/src/app/admin/page.tsx                        # item de menu/anchor do novo bloco Condições Sanitárias (sec-merenda-sanitarias)
docs/dashboard/*                                  # nota de validação/parity
```

**Nenhuma migration/view nova** — `vw_censo_equipamentos_merenda` (0009) e `vw_censo_rh_merendeiras` (0010) já contêm todos os campos. `main.go` **só muda** se for criado endpoint dedicado de condições sanitárias (opção recomendada).

## 10. Menor PR recomendado

**Recomendação: PRs separados por bloco (Opção B), em fatias verticais (backend + frontend juntos por bloco).** Justificativa baseada no código:

- Diferentemente de Tecnologia (2 endpoints, 1 view, tudo em 3 arquivos), Merenda envolve **um bloco inteiramente novo** (Condições Sanitárias), que exige **endpoint novo + item de menu + anchor + bloco frontend** (toca `main.go` e `page.tsx`, fronteira mais ampla).
- Há **mudança conceitual transversal** (RH migrando de aba), que não cabe no mesmo PR dos gráficos de Merenda.
- Há **itens bloqueados por produto** (faixas de quantidade, criticidade) que não devem travar os itens prontos.
- Fatias verticais por bloco são **mais reversíveis** e **validáveis isoladamente** (cada uma com sua nota de paridade).

Ordem sugerida:

1. **MER-01A — Oferta e Estrutura Física. ✅ ENTREGUE.** `/merenda/oferta` expandido com `dist_atende_necessidades`, `dist_possui_refeitorio`, `dist_tamanho_cozinha`, `dist_refeitorio_adequado` (reuso de `distQ`); renderizado donut/HBar em `sec-merenda-oferta`/`sec-merenda-estrutura`. Sem nova view/migration/endpoint; campos `pct_*` preservados.
2. **MER-01B — Equipamentos. ✅ ENTREGUE.** `/merenda/equipamentos` expandido com `presenca_por_tipo`, `faixas_qtd_tipos` (faixas cumulativas por nº de tipos — Interpretação A), `estado_consolidado` (Bom/Regular/Ruim-Inoperante, consolidado no backend), `media_por_tipo` e `criticidade_por_equipamento` (% ruim/inoperante). Renderizados em `sec-merenda-equipamentos` com HBars, gráfico de barras empilhadas horizontais para o estado consolidado e tabela detalhada complementar, preservando os cards. As decisões de produto antes bloqueadas (interpretação/faixas e definição de criticidade) foram tomadas nesta task. Sem nova view/migration/endpoint.
3. **MER-01C — Condições Sanitárias e Segurança. ✅ ENTREGUE.** Criado `GET /v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`), rota registrada em `main.go`, bloco/anchor `sec-merenda-sanitarias` e item de menu em `page.tsx`, renderizando despensa exclusiva (donut), depósito conserva (donut), presença de itens básicos (HBar), estoque de EPIs/extintor (HBar) e manutenção dos extintores (HBar). Sem nova view/migration. RH/Merendeiras mantido intacto.
4. **MER-RH-01 — Migrar Merendeiras para Serviços Terceirizados. ✅ ENTREGUE.** Criado bloco "Manipulador de Alimentos" em `AbaServicosTerceirizados.tsx`, com endpoint dedicado `/servicos-terceirizados/manipuladores-alimentos`; `sec-merenda-rh` foi removido de `AbaMerenda.tsx`; `/merenda/recursos-humanos` foi mantido como legado. Governança / Supervisão e avaliação do serviço permanecem frentes futuras.

**Decisão sobre endpoint de Estrutura/Sanitárias (§8.9):** **expandir `/merenda/oferta`** para as distribuições de Estrutura Física (já vêm dessa rota) e **criar `/merenda/condicoes-sanitarias`** para o bloco novo. **Não** criar `/merenda/estrutura-fisica` movendo `condicoes_cozinha`/`possui_refeitorio` — isso quebraria o contrato atual do frontend sem ganho. (Opção A descartada por misturar bloco novo + mudança conceitual num PR grande; Opção C de backend-first descartada porque as expansões são pequenas e acopladas à renderização de cada bloco.)

## 11. Itens fora de escopo

Não implementar nesta etapa histórica de MER-01:

- código frontend/backend, migrations, endpoints novos;
- alteração de formulário, schemas Zod, autenticação ou sincronização Google Sheets;
- alteração de outras abas (Caracterização, Pessoal, Tecnologia, Infraestrutura, Serviços, Perfil dos Alunos, Gestão Financeira);
- remover o endpoint legado `/merenda/recursos-humanos` sem fase de depreciação;
- implementar **faixas de quantidade de equipamentos** ou **criticidade** sem decisão de produto;
- criar categoria "não informado" nas distribuições sem pedido explícito de produto.

## 12. Conclusão

A aba **Merenda Escolar** está estruturalmente correta e com a **base de dados completa**: os quatro blocos finalísticos estão entregues após MER-01A, MER-01B e MER-01C. **Nenhuma migration/view nova** foi necessária; as lacunas resolvidas foram de **exposição em endpoint** e de **renderização**. O bloco **Recursos Humanos / Merendeiras** foi migrado para **Serviços Terceirizados** em **MER-RH-01**, como **Manipulador de Alimentos**, mantendo `/merenda/recursos-humanos` como legado. Governança / Supervisão e eventual avaliação do serviço das merendeiras seguem como frentes futuras/produto.
