# Diagnóstico Técnico — Merenda Escolar

> Diagnóstico **somente documental** (MER-01). Destina-se a orientar o(s) PR(s) de implementação da aba **Merenda Escolar**, no mesmo padrão do `diagnostico-tecnologia-equipamentos.md`.
>
> **Não implementa código.** Não altera frontend, backend, endpoints, views ou migrations. As assinaturas de payload descrevem o **contrato lógico desejado**, não o formato atual.

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

O antigo bloco **Recursos Humanos / Merendeiras** **deixa de ser finalístico de Merenda** e **migra conceitualmente para o menu Serviços Terceirizados** ("Manipuladores de Alimentos / Merendeiras"). Este diagnóstico **não propõe implementação de RH dentro de Merenda** — apenas registra o estado atual e a frente futura (§6.5).

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
Data Studio: Condições Sanitárias e Segurança  → Aplicação: (BLOCO AUSENTE — sem anchor)
Data Studio: Recursos Humanos                  → Aplicação: hoje em sec-merenda-rh; MIGRA para Serviços Terceirizados
```

Mapeamento técnico:

- **Oferta e Adequação** + **Estrutura Física** são servidos pelo **mesmo endpoint** `GET /v1/admin/analytics/merenda/oferta` (payload `MerendaOferta`), que lê **duas views**: `vw_censo_rh_merendeiras` (oferta/qualidade/atende) e `vw_censo_equipamentos_merenda` (condições da cozinha/refeitório).
- **Equipamentos da Merenda** é servido por `GET /v1/admin/analytics/merenda/equipamentos` (payload `MerendaEquipamentos`), lendo `vw_censo_equipamentos_merenda`.
- **Condições Sanitárias e Segurança** **não tem endpoint nem anchor** — os campos existem em `vw_censo_equipamentos_merenda`, mas não são lidos por nenhum handler.
- **Recursos Humanos** é servido por `GET /v1/admin/analytics/merenda/recursos-humanos` (payload `MerendaRH`), lendo `vw_censo_rh_merendeiras`.

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
- **Não** entrega **presença por tipo** (% de escolas com `qtd > 0`).
- **Não** entrega **distribuição por faixa de quantidade** (1/2/3+).
- **Não** entrega **visão consolidada de estado** (somatório por estado entre todos os tipos) nem **criticidade**.

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

`AbaMerenda.tsx` consome os **três** endpoints em paralelo (`/oferta`, `/equipamentos`, `/recursos-humanos`) e renderiza:

**Resumo executivo (4 StatCards):** % atende necessidades, % possui refeitório, % com supervisor, total de merendeiras (soma dos três vínculos).

**Oferta e Adequação (`#sec-merenda-oferta`):**
- Donut **Oferta regular da merenda** (de `dist_oferta_regular`).
- `HBarChart` **Qualidade da merenda** (de `dist_qualidade`).

**Estrutura Física (`#sec-merenda-estrutura`):** card "Estrutura Física da Cozinha" com:
- `HBarChart` **Condições da cozinha** (de `dist_condicoes_cozinha`).
- `StatCard` **Possui Refeitório** (% — `pct_possui_refeitorio`).

**Equipamentos (`#sec-merenda-equipamentos`):**
- 5 `EquipCard` (Freezers, Geladeiras, Fogões, Fornos, Bebedouros) — cada um com **total** + **média por escola**.
- Tabela **Distribuição do estado dos equipamentos** (de `dist_estados`, agrupada por equipamento).

**Recursos Humanos (`#sec-merenda-rh`):**
- 4 `StatCards`: estatutárias, terceirizadas, temporárias, supervisor (%).
- Donut **Distribuição por vínculo**.
- `HBarChart` **Top empresas terceirizadas**.

**Não existe** bloco/anchor para **Condições Sanitárias e Segurança** (nem em `AbaMerenda.tsx`, nem no menu de `page.tsx`).

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

- **Estado: AUSENTE.** O backend só calcula `SUM`/`AVG`; não há % de escolas que possuem cada tipo.
- (1) Não. (2) Não. (3) Sim — `qtd_freezers`, `qtd_geladeiras`, `qtd_fogoes`, `qtd_fornos`, `qtd_bebedouros`. (4) Não. (5) **Não** — presença (`qtd > 0`) não é derivável de total/média. (6) **Sim** — expandir `/merenda/equipamentos`. (7) Não. (8) Não. (9) Confirmar critério "possui = qtd > 0". (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Cálculo recomendado:** `COUNT(DISTINCT school_id) FILTER (WHERE qtd_tipo > 0)` por tipo, com percentual sobre escolas concluídas no recorte.

#### 6.3.2 Escolas com 1, 2 ou mais equipamentos

- **Estado: AUSENTE + AMBÍGUO (decisão de produto).** Há **duas leituras possíveis** do gráfico do Data Studio:
  - **(A) por nº de tipos:** para cada escola, contar quantos **tipos** têm `qtd > 0`; classificar em faixas (até 1 / até 2 / 3+).
  - **(B) por quantidade total:** somar `qtd_*` por escola e classificar por faixa de **quantidade total** de equipamentos.
- (1) Não. (2) Não. (3) Sim — `qtd_*`. (4) Não. (5) Não. (6) **Sim** — expandir `/merenda/equipamentos`. (7) Não. (8) Não. (9) **Sim — bloqueante**: definir interpretação (A vs. B) e as faixas oficiais. (10) `analytics_infra_merenda_servicos.go` + `types.ts` + `AbaMerenda.tsx`.
- **Recomendação:** **não implementar sem decisão de produto** sobre a interpretação e as faixas. Registrar a ambiguidade.

#### 6.3.3 Estado de conservação consolidado

- **Estado: PARCIAL.** Existe tabela por equipamento × estado (`dist_estados`); falta a **visão consolidada** (distribuição global por estado) e/ou o gráfico empilhado por equipamento.
- (1) Parcial (tabela). (2) **Sim** — `dist_estados` já traz `(equipamento, estado, escolas)`. (3) Sim — `estado_*` (normalizados com `lower()`). (4) Parcial (distribuição por equipamento). (5) **Sim** — tanto o **consolidado por estado** (somar `escolas` agrupando por `estado`) quanto o **empilhado por equipamento** são deriváveis do `dist_estados` atual. (6) Opcional (só se o consolidado for preferido no servidor). (7) Não. (8) Não. (9) Definir se consolida contando **escolas** ou **equipamentos**, e a normalização de rótulos. (10) `AbaMerenda.tsx` (+ opcional backend).
- **Recomendação:** resolver **no frontend** a partir de `dist_estados` (consolidar por estado e/ou empilhar por equipamento). Classifica-se como **lacuna de frontend**.

#### 6.3.4 Quantidade média de equipamentos por escola

- **Estado: COMPLETO.** Cada `EquipCard` exibe `media_por_escola` (de `EquipTotais.media`).
- (1) Sim. (2) Sim. (3) Sim — `qtd_*`. (4) Sim — `AVG(qtd) FILTER (qtd IS NOT NULL)`. (5) n/a. (6–9) Não. (10) Nenhum.
- Nota: a média é **entre escolas declarantes** (não força 0). Se o produto preferir "média sobre todas as escolas", seria mudança de denominador — registrar como refino, não como lacuna.

#### 6.3.5 Criticidade por equipamento

- **Estado: AUSENTE (depende de produto).** Não há índice de criticidade.
- (1) Não. (2) Não. (3) Sim — `estado_*`. (4) Não. (5) **Parcial** — se "criticidade" = % de um conjunto de estados sobre o `dist_estados`, é derivável **desde que** os rótulos de estado e o subconjunto "crítico" estejam definidos. (6) Opcional (cálculo pode ser frontend ou backend). (7) Não. (8) Não. (9) **Sim — bloqueante**: definir quais estados contam como "crítico" e o denominador. (10) `AbaMerenda.tsx` (+ opcional backend).
- **Atenção aos valores reais de estado.** A view aplica `lower()`; os rótulos podem ser curtos (`bom`/`regular`/`ruim`/`inoperante`) ou textos longos (ex.: `"ruim — funcionamento comprometido"`). **A regra de criticidade deve ser validada contra os valores reais** antes de implementar (risco de não casar com `IN ('ruim','inoperante')`).
- **Recomendação:** validar rótulos reais + definição de criticidade com produto; só então derivar (preferencialmente no frontend a partir de `dist_estados`).

### 6.4 Condições Sanitárias e Segurança

> **Bloco inteiro AUSENTE na aplicação.** Sem endpoint, sem payload, sem anchor, sem item de menu. **Todos os campos já existem** em `vw_censo_equipamentos_merenda` — a lacuna é de exposição + renderização (criar bloco). Para todos os itens abaixo: (3) **Sim** (campo na view), (4) Não, (5) Não, (8) Não (view já existe), (10) `analytics_infra_merenda_servicos.go` + `main.go` (se endpoint novo) + `types.ts` + `AbaMerenda.tsx` + `page.tsx` (menu/anchor).

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

#### 6.4.4 Estoque de EPIs e extintor

- **Estado: AUSENTE.** Campo `estoque_epi_extintor` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6)/(7) conforme decisão. (9) Confirmar se o campo agrega EPI + extintor numa só resposta.
- **Recomendação:** KPI % ou distribuição no novo bloco.

#### 6.4.5 Recarga/manutenção dos extintores

- **Estado: AUSENTE.** Campo `manutencao_extintores` na view.
- (1) Não. (2) Não. (3) Sim. (4) Não. (5) Não. (6)/(7) conforme decisão. (9) Confirmar categorias (em dia / vencida / não informado).
- **Recomendação:** distribuição categórica no novo bloco.

### 6.5 Recursos Humanos / Merendeiras

> **Não é gráfico mínimo da aba Merenda.** Diagnóstico do estado atual + frente futura. **Não implementar nesta rodada de Merenda.**

#### 6.5.1 Situação atual na aba Merenda

- O endpoint `GET /v1/admin/analytics/merenda/recursos-humanos` (payload `MerendaRH`) **entrega hoje**: `total_estatutaria`, `total_terceirizada`, `total_temporaria`, `pct_com_supervisor`, `top_empresas`.
- `AbaMerenda.tsx` renderiza, em `sec-merenda-rh`: 4 StatCards (vínculos + supervisor), Donut de distribuição por vínculo e `HBarChart` de top empresas.
- Cobre, do Data Studio: **total por vínculo**, **empresas e abrangência** (top empresas), **supervisão pelas empresas** (% com supervisor).
- **Não cobre hoje** (campos existem na view, mas não expostos): **"a quantidade atual atende à necessidade?"** (`qtd_atende_necessidade_merenda`, `quantitativo_necessario_merenda`), **quantidade média de merendeiras por escola** (derivável de `qtd_merendeiras_*`).
- **Não há na view `0010`** campo de **avaliação do serviço das merendeiras** — provável origem em `vw_censo_servicos_terceirizados.avaliacao_merendeiras` (a confirmar).

#### 6.5.2 Decisão de migração para Serviços Terceirizados

- Por decisão de produto (`matriz-abas-e-graficos.md` §2.8), o bloco RH **deve migrar conceitualmente** para o menu **Serviços Terceirizados**, como bloco **"Manipuladores de Alimentos / Merendeiras"**, ao lado de Serviços Gerais e Portaria.
- Nesta rodada, **nada muda no código**: o endpoint `/merenda/recursos-humanos` e o bloco `sec-merenda-rh` **permanecem ativos e intactos**.
- A retirada de `sec-merenda-rh` de `AbaMerenda.tsx` só deve ocorrer **depois** que o bloco equivalente existir em `AbaServicosTerceirizados.tsx`, para não criar regressão visual.

#### 6.5.3 Endpoint futuro recomendado

- **Opção preferida:** criar `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos`, reaproveitando `vw_censo_rh_merendeiras` e, se necessário, juntando avaliação de `vw_censo_servicos_terceirizados`. Mantém a coerência de menu (tudo de terceirizados sob `/servicos-terceirizados/*`).
- **Alternativa:** manter `/merenda/recursos-humanos` ativo e apenas **consumi-lo a partir de `AbaServicosTerceirizados.tsx`** (sem novo endpoint). É mais barato, mas deixa o contrato semanticamente "fora de lugar" (rota `merenda/*` servindo aba de terceirizados).
- **Não recomendado:** renomear/remover `/merenda/recursos-humanos` agora — quebraria o frontend atual sem ganho, antes da rodada de Serviços Terceirizados.
- **Decisão:** tratar na rodada **MER-RH-01** (ver §10), junto com o bloco **Governança / Supervisão** de Serviços Terceirizados (que compartilha a decisão de escala de avaliação).

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
| Equipamentos | Presença por tipo | Ausente | Expandir `/equipamentos` (`COUNT FILTER qtd>0`) | HBar | Critério "possui" | Expor `presenca_por_tipo` |
| Equipamentos | Escolas com 1/2/3+ | Ausente | Expandir `/equipamentos` (bucketização) | Donut/HBar | **Sim — interpretação + faixas** | Bloqueado até decisão |
| Equipamentos | Estado consolidado | Parcial | — (derivável) | Donut/empilhado | Contar escolas vs. equipamentos | Derivar de `dist_estados` no frontend |
| Equipamentos | Média por escola | Completo | — | — | Denominador (refino) | Manter |
| Equipamentos | Criticidade por equipamento | Ausente | Opcional | Barra | **Sim — definição + rótulos reais** | Bloqueado até decisão |
| Cond. Sanitárias | Despensa exclusiva | Ausente | Novo endpoint/bloco | Novo bloco | Semântica | Criar bloco |
| Cond. Sanitárias | Depósito conserva | Ausente | Novo endpoint/bloco | Novo bloco | Normalização | Criar bloco |
| Cond. Sanitárias | Presença de itens básicos | Ausente | Novo endpoint/bloco | Novo bloco | Lista oficial | Criar bloco |
| Cond. Sanitárias | Estoque EPIs/extintor | Ausente | Novo endpoint/bloco | Novo bloco | Campo agregado? | Criar bloco |
| Cond. Sanitárias | Manutenção dos extintores | Ausente | Novo endpoint/bloco | Novo bloco | Categorias | Criar bloco |
| RH | Total/empresas/supervisão | Completo (em Merenda hoje) | — | — | **Migração para Serviços Terceirizados** | Não mexer agora |
| RH | Atende necessidade (quantitativo) | Parcial (campo na view) | Futuro (Serviços) | Futuro | — | Frente futura |
| RH | Avaliação do serviço | Ausente | Futuro (Serviços) | Futuro | Escala de avaliação | Frente futura |
| RH | Média de merendeiras/escola | Ausente | Futuro (Serviços) | Futuro | — | Frente futura |

Resumo dos quatro blocos finalísticos (excluindo RH): **3 completos**, **3 parciais**, **8 ausentes** (5 deles compõem o bloco inteiro de Condições Sanitárias). **Nenhuma migration/view nova** é necessária. **2 itens bloqueados por produto**: faixas de quantidade de equipamentos e definição de criticidade.

> **MER-01A entregue.** Os 4 itens de Oferta/Estrutura que estavam parciais/ausentes (atende necessidades, possui refeitório, tamanho da cozinha, refeitório adequado) foram entregues expandindo `/merenda/oferta` com `dist_*`, sem nova view/migration/endpoint. Permanecem fora de escopo: Equipamentos avançados, Condições Sanitárias e Segurança, e a migração RH/Merendeiras para Serviços Terceirizados.

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

Expansão de `MerendaEquipamentos` (`GET /merenda/equipamentos`):

```ts
// Presença por tipo (COUNT DISTINCT school_id FILTER qtd>0):
presenca_por_tipo: Array<{ equipamento: string; escolas: number; percentual: number }>;

// BLOQUEADO por produto (interpretação + faixas):
// dist_qtd_por_escola: Array<{ valor: string; escolas: number; percentual: number }>;

// BLOQUEADO por produto (definição + rótulos reais de estado):
// criticidade_por_equipamento: Array<{ equipamento: string; escolas_criticas: number; percentual: number }>;
```

Resolvível **no frontend** sem mudança de payload (a partir de `dist_estados` atual):

```ts
// Estado de conservação consolidado (somar escolas por estado entre os 5 tipos)
// e/ou gráfico empilhado por equipamento.
```

Novo bloco **Condições Sanitárias e Segurança** — endpoint dedicado recomendado `GET /v1/admin/analytics/merenda/condicoes-sanitarias`:

```ts
{
  pct_despensa_exclusiva: number;        // ou dist_*
  pct_deposito_conserva: number;         // ou dist_*
  itens_basicos: Array<{ valor: string; escolas: number; percentual: number }>; // balança, bancadas inox, exaustão
  pct_estoque_epi_extintor: number;      // ou dist_*
  dist_manutencao_extintores: CategoricStat[];
}
```

Frente futura (Serviços Terceirizados — **não nesta rodada**): `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` reaproveitando `MerendaRH` + `qtd_atende_necessidade_merenda`/`quantitativo_necessario_merenda` + avaliação de `vw_censo_servicos_terceirizados`.

## 9. Arquivos prováveis da implementação

```txt
api/cmd/api/analytics_infra_merenda_servicos.go  # expandir handlers de oferta/equipamentos; novo handler de condições sanitárias
api/cmd/api/main.go                              # registrar rota nova SE optar por endpoint dedicado de condições sanitárias
web/src/components/admin/shared/types.ts          # novos campos em MerendaOferta/MerendaEquipamentos; nova interface de condições sanitárias
web/src/components/admin/AbaMerenda.tsx           # renderizar distribuições faltantes + novo bloco Condições Sanitárias
web/src/app/admin/page.tsx                        # item de menu/anchor do novo bloco Condições Sanitárias (sec-merenda-sanitario)
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
2. **MER-01B — Equipamentos.** Expandir `/merenda/equipamentos` com `presenca_por_tipo`; renderizar presença por tipo + **estado consolidado derivado no frontend** de `dist_estados`. **Carve-out obrigatório:** faixas de quantidade (1/2/3+) e criticidade ficam **fora**, bloqueados por produto.
3. **MER-01C — Condições Sanitárias e Segurança.** Criar `GET /v1/admin/analytics/merenda/condicoes-sanitarias`, registrar rota em `main.go`, criar bloco/anchor (`sec-merenda-sanitario`) e item de menu, renderizar despensa/depósito/itens básicos/EPIs-extintor/manutenção. Maior fronteira (toca `main.go` + `page.tsx`).
4. **MER-RH-01 — Migrar Merendeiras para Serviços Terceirizados.** Criar bloco "Manipuladores de Alimentos / Merendeiras" em `AbaServicosTerceirizados.tsx` (endpoint dedicado recomendado), e **só então** remover `sec-merenda-rh` de `AbaMerenda.tsx`. Tratar junto da rodada de Governança / Supervisão (escala de avaliação compartilhada).

**Decisão sobre endpoint de Estrutura/Sanitárias (§8.9):** **expandir `/merenda/oferta`** para as distribuições de Estrutura Física (já vêm dessa rota) e **criar `/merenda/condicoes-sanitarias`** para o bloco novo. **Não** criar `/merenda/estrutura-fisica` movendo `condicoes_cozinha`/`possui_refeitorio` — isso quebraria o contrato atual do frontend sem ganho. (Opção A descartada por misturar bloco novo + mudança conceitual num PR grande; Opção C de backend-first descartada porque as expansões são pequenas e acopladas à renderização de cada bloco.)

## 11. Itens fora de escopo

Não implementar nesta etapa (MER-01 é diagnóstico):

- código frontend/backend, migrations, endpoints novos;
- alteração de formulário, schemas Zod, autenticação ou sincronização Google Sheets;
- alteração de outras abas (Caracterização, Pessoal, Tecnologia, Infraestrutura, Serviços, Perfil dos Alunos, Gestão Financeira);
- **remover o bloco RH da aba Merenda** — apenas diagnosticar; a remoção só ocorre em MER-RH-01, após o bloco existir em Serviços Terceirizados;
- implementar **faixas de quantidade de equipamentos** ou **criticidade** sem decisão de produto;
- criar categoria "não informado" nas distribuições sem pedido explícito de produto.

## 12. Conclusão

A aba **Merenda Escolar** está estruturalmente correta nos blocos hoje existentes e com a **base de dados completa**: as views `0009` e `0010` já contêm **todos** os campos dos gráficos mínimos dos quatro blocos finalísticos. Dos itens mínimos (excluindo RH): **3 completos**, **3 parciais** e **8 ausentes** — sendo que **5 ausências formam o bloco inteiro de Condições Sanitárias e Segurança**, que **não tem endpoint, anchor nem menu**. **Nenhuma migration/view nova** é necessária; as lacunas são de **exposição em endpoint** (várias reusando o helper `distQ` já existente) e de **renderização**. Dois itens estão **bloqueados por produto** (faixas de quantidade de equipamentos e definição de criticidade) e devem ser carved-out. O **estado consolidado de equipamentos** é resolvível **só no frontend** a partir de `dist_estados`. Recomenda-se **PRs separados por bloco** (MER-01A Oferta+Estrutura → MER-01B Equipamentos → MER-01C Condições Sanitárias), por serem fatias verticais reversíveis e por o bloco novo tocar `main.go`/`page.tsx`. O bloco **Recursos Humanos / Merendeiras** permanece intacto nesta rodada e será migrado para **Serviços Terceirizados** ("Manipuladores de Alimentos / Merendeiras") em **MER-RH-01**, junto da rodada de Governança / Supervisão.
