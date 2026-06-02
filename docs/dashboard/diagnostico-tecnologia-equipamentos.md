# Diagnóstico Técnico — Tecnologia e Equipamentos

> Tarefa **somente documental** (TEC-01). Nenhum código de frontend, backend, endpoint, view ou migration foi alterado. Este documento orienta o próximo PR de implementação da aba **Tecnologia e Equipamentos**.

## 1. Objetivo

Confirmar, por leitura estática do código, o estado real da aba **Tecnologia e Equipamentos** do `/admin` em relação aos **gráficos mínimos** preservados do painel original do Data Studio/Looker Studio, classificando cada gráfico como **completo**, **parcial** ou **ausente** e indicando, para cada um:

- se exige **backend**, apenas **frontend**, ou **decisão de produto**;
- qual arquivo será provavelmente alterado;
- qual é o **menor PR** possível para fechar as lacunas.

A divisão interna em três blocos — **Infraestrutura Digital**, **Parque Tecnológico** e **Uso Pedagógico** — está correta e deve ser mantida.

## 2. Fontes analisadas

Documentação:

- `docs/dashboard/matriz-abas-e-graficos.md` — seção 5.3 Tecnologia e Equipamentos.
- `docs/dashboard/lacunas-backend-frontend-por-bloco.md` — seção 6.2 Tecnologia e Equipamentos.
- `docs/dashboard/especificacao-entrega-dados-por-grafico.md` — seção 6.4 Tecnologia e Equipamentos — Parque Tecnológico.

Frontend:

- `web/src/components/admin/AbaTecnologia.tsx`
- `web/src/components/admin/shared/types.ts`
- `web/src/components/admin/shared/Donut.tsx` (`Donut`, `PieChart`)
- `web/src/components/admin/shared/BarChart.tsx` (`VBarChart`, `HBarChart`)
- `web/src/components/admin/shared/StatCard.tsx` (`StatCard`)
- `web/src/app/admin/page.tsx` (montagem da aba)

Backend e banco:

- `api/cmd/api/main.go` — registro das rotas (linhas 348–353).
- `api/cmd/api/analytics_pessoal_tecnologia.go` — handlers `AdminAnalyticsTecnologiaInfra` e `AdminAnalyticsTecnologiaUso`.
- `api/cmd/api/migrations/0006_vw_censo_equipamentos_tecnologia.sql` (espelhada em `infra/migrations/0006_*`).

Observação metodológica: diagnóstico por leitura estática. Os endpoints **não** foram executados contra banco local/homologação nesta rodada.

## 3. Equivalência Data Studio ↔ Aplicação

```txt
Data Studio: Infraestrutura Digital e Capacidade Instalada
→ Aplicação: Infraestrutura Digital + Parque Tecnológico

Data Studio: Uso Pedagógico e Adequação Tecnológica
→ Aplicação: Uso Pedagógico
```

Na aplicação:

- **Infraestrutura Digital** e **Parque Tecnológico** são servidos pelo **mesmo endpoint** `GET /v1/admin/analytics/tecnologia/infraestrutura` (payload `TecnologiaInfra`).
- **Uso Pedagógico** é servido por `GET /v1/admin/analytics/tecnologia/uso-pedagogico` (payload `TecnologiaUso`).

Ambos os endpoints leem a **mesma view** `vw_censo_equipamentos_tecnologia` (migration `0006`), que já contém **todos os campos** necessários para os gráficos mínimos. **Nenhuma migration/view nova é necessária.**

## 4. Estado atual dos endpoints

### 4.1 GET /v1/admin/analytics/tecnologia/infraestrutura

Handler: `AdminAnalyticsTecnologiaInfra` (`analytics_pessoal_tecnologia.go:361`).
Filtros aceitos: `year`, `dre`, `municipio`, `zona`, `porte_escola`.

Payload atual (`TecnologiaInfra`):

| Campo | Tipo | Cálculo no backend |
|---|---|---|
| `escolas_com_internet` | int | `COUNT(DISTINCT school_id) FILTER (WHERE internet_disponivel)` |
| `percentual_internet` | float | `% de escolas com internet sobre o total` |
| `por_provedor` | `CategoricStat[]` | distribuição categórica de `provedor_internet` |
| `por_qualidade` | `CategoricStat[]` | distribuição categórica de `qualidade_internet` |
| `total_desktops_adm` | float | `SUM(qtd_desktop_adm)` |
| `total_desktops_alunos` | float | `SUM(qtd_desktop_alunos)` |
| `total_notebooks` | float | `SUM(qtd_notebooks)` |
| `total_chromebooks` | float | `SUM(qtd_chromebooks)` |
| `escolas_com_computadores_inoperantes` | int | `COUNT(DISTINCT school_id) FILTER (WHERE qtd_computadores_inoperantes > 0)` |
| `percentual_computadores_atendem` | float | `% de escolas onde computadores_atendem = 'Sim'` |

Observações relevantes:

- O endpoint **não** entrega medianas (só `SUM`).
- **Não** entrega o **total** de computadores inoperantes (só a **contagem de escolas** que declararam ≥ 1 inoperante) e **não** entrega percentual de inoperantes.
- `percentual_computadores_atendem` é colapsado para **% de "Sim"**; a distribuição completa (Sim/Parcialmente/Não) **não** é exposta.
- **Não** expõe o denominador (`COUNT(DISTINCT school_id)`) usado internamente — ele é consumido apenas nos cálculos de percentual e descartado.

### 4.2 GET /v1/admin/analytics/tecnologia/uso-pedagogico

Handler: `AdminAnalyticsTecnologiaUso` (`analytics_pessoal_tecnologia.go:475`).
Filtros aceitos: `year`, `dre`, `municipio`, `zona`, `porte_escola`.

Payload atual (`TecnologiaUso`):

| Campo | Tipo | Cálculo no backend |
|---|---|---|
| `escolas_com_projetor` | int | `COUNT(DISTINCT school_id) FILTER (WHERE possui_projetor)` |
| `percentual_com_projetor` | float | `% de escolas com projetor` |
| `total_projetores` | float | `SUM(qtd_projetores)` |
| `escolas_com_lousa_digital` | int | `COUNT(DISTINCT school_id) FILTER (WHERE possui_lousa_digital)` |
| `percentual_com_lousa_digital` | float | `% de escolas com lousa` |

Observações relevantes:

- **Não** entrega média de projetores por escola (`AVG(qtd_projetores)` ausente).
- **Não** entrega distribuição Sim/Não de projetor nem de lousa (apenas o percentual de "Sim").
- **Não** expõe o denominador (`COUNT(DISTINCT school_id)`), o que impede o frontend de derivar a média de projetores.

### 4.3 View `vw_censo_equipamentos_tecnologia` (migration 0006)

A view já cobre **todos** os campos necessários. Tratamento de NULL relevante para o diagnóstico:

- **Booleanos** `internet_disponivel`, `possui_projetor`, `possui_lousa_digital`: `TRUE` quando o valor ∈ `('sim','true','t','1')`, **`FALSE` em qualquer outro caso** — inclusive vazio/`null`/"não informado". Ou seja, a view **colapsa** "Não" e "Não informado" em `FALSE`. Uma distribuição Sim/Não derivada da view tratará "não informado" como "Não".
- **Numéricos** (`qtd_*`): cast seguro → `NULL` se não-numérico (não força `0`, para distinguir "não informado" de zero declarado).
- **Categóricos** (`provedor_internet`, `qualidade_internet`, `computadores_atendem`): `NULLIF('','')` → `NULL` se vazio. `computadores_atendem` preserva o texto original (ex.: "Sim"/"Parcialmente"/"Não"), permitindo distribuição completa.

## 5. Estado atual do frontend

`AbaTecnologia.tsx` consome os dois endpoints em paralelo e renderiza:

**Resumo executivo (5 StatCards):** % com internet, % computadores atendem, escolas c/ inoperantes (contagem), total de projetores, % com lousa digital.

**Infraestrutura Digital (`#sec-tecnologia-digital`):**
- Donut **Provedores de internet** (de `por_provedor`).
- Donut **Qualidade da conexão** (de `por_qualidade`).

**Parque Tecnológico (`#sec-tecnologia-parque`):**
- 5 StatCards: desktops adm, desktops alunos, notebooks, chromebooks, escolas c/ inoperantes.
- Card de "Notas semânticas" alertando que a contagem de escolas com inoperantes **não** é percentual do parque.

**Uso Pedagógico (`#sec-tecnologia-pedagogico`):**
- 3 StatCards: % com projetor, total de projetores, % com lousa.

Componentes compartilhados disponíveis (sem necessidade de criar novos): `StatCard` (KPI), `Donut`/`PieChart` (distribuições categóricas, props `{ label, value, color, pct? }[]`), `VBarChart`/`HBarChart` (barras).

## 6. Diagnóstico por gráfico mínimo

Legenda das respostas: as 10 perguntas do enunciado são respondidas em cada item na ordem (1) existe no frontend; (2) dado no payload; (3) campo na view; (4) cálculo no backend; (5) cálculo possível no frontend com payload atual; (6) precisa expandir endpoint; (7) precisa endpoint novo; (8) precisa migration/view; (9) depende de produto; (10) arquivo provável.

### 6.1 Infraestrutura Digital

#### 6.1.1 Disponibilidade de internet — distribuição Sim/Não

- **Estado: PARCIAL.** Existe o KPI `% com internet`, mas **não** há gráfico de distribuição Sim/Não.
- (1) Não (só StatCard de %). (2) Parcial — há `percentual_internet`/`escolas_com_internet`, não um array Sim/Não. (3) Sim — `internet_disponivel` (boolean). (4) Calcula só o % de "Sim". (5) **Sim** — o frontend pode derivar `Não = 100 − percentual_internet` e `escolas_Não = total − escolas_com_internet` (o total pode ser inferido por regra de três). (6) Opcional. (7) Não. (8) Não. (9) Nuance de produto: a view colapsa "Não informado" em "Não" (o booleano é `FALSE` para vazio). Decidir se o gráfico é estritamente Sim/Não ou Sim/Não/Não informado. (10) `AbaTecnologia.tsx` (+ opcionalmente `analytics_pessoal_tecnologia.go`/`types.ts` se preferir array no payload).
- **Recomendação:** renderizar Donut **Sim/Não** no frontend a partir de `percentual_internet` (rótulo "Não" = complemento). Aceitável como bloco Sim/Não simples. Só promover a backend se for exigida a categoria "Não informado" separada.

#### 6.1.2 Provedor de internet

- **Estado: COMPLETO.** Donut renderizado a partir de `por_provedor` (`CategoricStat[]`).
- (1) Sim. (2) Sim. (3) Sim. (4) Sim. (5) n/a. (6–9) Não. (10) Nenhum.

#### 6.1.3 Qualidade da internet

- **Estado: COMPLETO.** Donut renderizado a partir de `por_qualidade`.
- (1) Sim. (2) Sim. (3) Sim. (4) Sim. (5) n/a. (6) Não. (7) Não. (8) Não. (9) Refino menor: confirmar normalização das opções (Boa/Regular/Ruim) — não bloqueia. (10) Nenhum.

### 6.2 Parque Tecnológico

#### 6.2.1 Quantidade mediana de equipamentos por escola

- **Estado: AUSENTE.** O backend só calcula `SUM`; não há mediana.
- (1) Não. (2) Não. (3) Sim — `qtd_chromebooks`, `qtd_desktop_alunos`, `qtd_desktop_adm`, `qtd_notebooks`. (4) Não. (5) **Não** — mediana **não** é derivável dos totais; exige a série por escola. (6) **Sim** — expandir `/tecnologia/infraestrutura`. (7) Não. (8) Não. (9) Não. (10) `analytics_pessoal_tecnologia.go` + `types.ts` + `AbaTecnologia.tsx`.
- **A mediana deve ser feita no backend, não no frontend**, via `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY campo)` por tipo de equipamento.

#### 6.2.2 Distribuição do parque tecnológico (%)

- **Estado: AUSENTE como gráfico** (os totais existem, mas não há donut/barra de participação %).
- (1) Não. (2) **Sim** — `total_desktops_adm`, `total_desktops_alunos`, `total_notebooks`, `total_chromebooks` já estão no payload. (3) Sim. (4) Parcial (entrega os totais). (5) **Sim** — a participação % é simples regra de três sobre os 4 totais existentes. (6) Não. (7) Não. (8) Não. (9) Não. (10) `AbaTecnologia.tsx`.
- **Recomendação:** calcular **no frontend** a partir dos 4 totais já entregues e renderizar como `Donut`. Não justifica trabalho de backend.

#### 6.2.3 Totais por tipo de equipamento

- **Estado: COMPLETO.** 4 StatCards renderizados (desktops adm, desktops alunos, notebooks, chromebooks).
- (1) Sim. (2) Sim. (3) Sim. (4) Sim. (5) n/a. (6–9) Não. (10) Nenhum.

#### 6.2.4 Computadores inoperantes

- **Estado: PARCIAL.** O payload entrega **a contagem de escolas** com ≥ 1 inoperante (`escolas_com_computadores_inoperantes`); **não** entrega o **total** de computadores inoperantes nem percentual.
- (1) Parcial (StatCard com a contagem de escolas). (2) Parcial — só `escolas_com_computadores_inoperantes`. (3) Sim — `qtd_computadores_inoperantes` está na view, mas **não** é somado no endpoint. (4) Calcula só a contagem de escolas. (5) Não para o total/percentual (o `SUM` não está no payload). (6) **Sim** para expor `total_computadores_inoperantes` (trivial: `SUM(qtd_computadores_inoperantes)`). (7) Não. (8) Não. (9) **Sim para o percentual** — falta numerador/denominador oficial. (10) `analytics_pessoal_tecnologia.go` + `types.ts` + `AbaTecnologia.tsx`.
- **Decisão pendente de produto — denominador oficial do percentual de computadores inoperantes.** Opções:
  - todas as escolas concluídas;
  - somente escolas com algum computador declarado;
  - total do parque computacional declarado (`adm + alunos + notebooks + chromebooks`);
  - somente computadores de uso dos alunos.
- **Não implementar o percentual sem essa decisão.** O **total absoluto** (`SUM`) pode ser implementado de imediato, pois não depende de denominador.

### 6.3 Uso Pedagógico

#### 6.3.1 Equipamentos atendem à demanda — distribuição Sim/Parcialmente/Não

- **Estado: PARCIAL.** O backend só calcula `percentual_computadores_atendem` como **% de "Sim"**; a distribuição completa não é exposta.
- (1) Não (só KPI %). (2) Não (só o %). (3) **Sim** — `computadores_atendem` é categórico e preserva o texto original. (4) Calcula só o % de "Sim". (5) Não — sem o array por categoria, o frontend não reconstrói Parcialmente/Não. (6) **Sim** — expandir `/tecnologia/infraestrutura` (há helper `distCateg` reutilizável no próprio handler). (7) Não. (8) Não. (9) Confirmar as categorias reais armazenadas (esperado "Sim"/"Parcialmente"/"Não"; pode haver variações). (10) `analytics_pessoal_tecnologia.go` + `types.ts` + `AbaTecnologia.tsx`.
- Payload sugerido: `computadores_atendem_demanda: Array<{ label: string; escolas: number; percentual: number }>`.

#### 6.3.2 Projetor multimídia — distribuição Sim/Não

- **Estado: PARCIAL.** Entrega `escolas_com_projetor`, `percentual_com_projetor`, `total_projetores`; não há array Sim/Não.
- (1) Parcial (KPI %). (2) Parcial. (3) Sim — `possui_projetor` (boolean). (4) Calcula só % de "Sim". (5) **Sim** — `Não = 100 − percentual_com_projetor` é derivável. (6) Opcional. (7) Não. (8) Não. (9) Mesma nuance Sim/Não vs. "Não informado" (booleano colapsa). (10) `AbaTecnologia.tsx`.
- **Recomendação:** Donut Sim/Não derivado no frontend.

#### 6.3.3 Lousa digital — distribuição Sim/Não

- **Estado: PARCIAL.** Entrega `escolas_com_lousa_digital` e `percentual_com_lousa_digital`; não há array Sim/Não.
- (1) Parcial (KPI %). (2) Parcial. (3) Sim — `possui_lousa_digital` (boolean). (4) Calcula só % de "Sim". (5) **Sim** — derivável no frontend. (6) Opcional. (7) Não. (8) Não. (9) Mesma nuance Sim/Não. (10) `AbaTecnologia.tsx`.
- **Recomendação:** Donut Sim/Não derivado no frontend.

#### 6.3.4 Quantidade média de projetores por escola

- **Estado: AUSENTE.** Entrega só `total_projetores`; sem média e sem denominador exposto.
- (1) Não. (2) Não. (3) Sim — `qtd_projetores`. (4) Não. (5) **Não** — o endpoint `/uso-pedagogico` não expõe `COUNT(DISTINCT school_id)`, então o frontend não tem denominador. (6) **Sim** — expandir `/tecnologia/uso-pedagogico`. (7) Não. (8) Não. (9) Não. (10) `analytics_pessoal_tecnologia.go` + `types.ts` + `AbaTecnologia.tsx`.
- **Cálculo recomendado:** `AVG(qtd_projetores)` (média por escola declarante, coerente com a média de equipamentos e com o tratamento `NULL`-safe da view, que **não** força `0`). Alternativa `SUM(qtd_projetores) / COUNT(DISTINCT school_id)` mudaria o denominador para "todas as escolas", inclusive as que não declararam projetor — menos coerente com a view atual. **Preferir `AVG(qtd_projetores)`.**

## 7. Tabela consolidada de lacunas

| Bloco | Gráfico | Estado | Backend | Frontend | Produto | Próxima ação |
|---|---|---|---|---|---|---|
| Infra Digital | Disponibilidade de internet (Sim/Não) | Parcial | Opcional | Sim | Nuance "Não informado" | Donut Sim/Não derivado no frontend |
| Infra Digital | Provedor de internet | Completo | — | — | — | Manter |
| Infra Digital | Qualidade da internet | Completo | — | — | Refino normalização | Manter |
| Parque Tec. | Mediana de equipamentos/escola | Ausente | **Sim** (PERCENTILE_CONT) | Sim (render) | — | Expandir `/infraestrutura` |
| Parque Tec. | Distribuição do parque (%) | Ausente | — | **Sim** | — | Donut calculado no frontend |
| Parque Tec. | Totais por tipo | Completo | — | — | — | Manter |
| Parque Tec. | Computadores inoperantes (total) | Parcial | **Sim** (SUM) | Sim (render) | — | Expor total no payload |
| Parque Tec. | Computadores inoperantes (%) | Ausente | Sim (após decisão) | Sim (render) | **Sim — denominador** | Bloquear até decisão de produto |
| Uso Pedag. | Atendem à demanda (Sim/Parc./Não) | Parcial | **Sim** (distCateg) | Sim (render) | Confirmar categorias | Expandir `/infraestrutura` |
| Uso Pedag. | Projetor multimídia (Sim/Não) | Parcial | Opcional | Sim | Nuance "Não informado" | Donut Sim/Não derivado no frontend |
| Uso Pedag. | Lousa digital (Sim/Não) | Parcial | Opcional | Sim | Nuance "Não informado" | Donut Sim/Não derivado no frontend |
| Uso Pedag. | Média de projetores/escola | Ausente | **Sim** (AVG) | Sim (render) | — | Expandir `/uso-pedagogico` |

Resumo: **2 completos**, **6 parciais**, **3 ausentes** (contando inoperantes-total e inoperantes-% separadamente, 11 itens da matriz mínima). Itens que exigem **somente frontend**: distribuição do parque (%), e (por escolha) os Sim/Não de internet, projetor e lousa. Itens que exigem **backend**: mediana de equipamentos, total de inoperantes, distribuição "atendem à demanda", média de projetores. Único item **bloqueado por produto**: **percentual** de computadores inoperantes.

## 8. Payloads recomendados

Expansão de `TecnologiaInfra` (`GET /tecnologia/infraestrutura`):

```ts
// Mediana por tipo de equipamento (PERCENTILE_CONT no backend)
mediana_desktops_adm: number;
mediana_desktops_alunos: number;
mediana_notebooks: number;
mediana_chromebooks: number;

// Total absoluto de inoperantes (SUM — implementável de imediato)
total_computadores_inoperantes: number;

// Distribuição completa "atendem à demanda"
computadores_atendem_demanda: Array<{
  label: string;       // "Sim" | "Parcialmente" | "Não" | ...
  escolas: number;
  percentual: number;
}>;

// BLOQUEADO por produto — só após definição do denominador:
// percentual_computadores_inoperantes: number;
```

Expansão de `TecnologiaUso` (`GET /tecnologia/uso-pedagogico`):

```ts
// Média de projetores por escola declarante
media_projetores_por_escola: number; // AVG(qtd_projetores)
```

Itens **sem mudança de payload** (resolvidos no frontend a partir do payload atual):

```ts
// Distribuição do parque tecnológico (%) — derivada dos 4 totais existentes
// Sim/Não de internet — derivado de percentual_internet
// Sim/Não de projetor — derivado de percentual_com_projetor
// Sim/Não de lousa — derivado de percentual_com_lousa_digital
```

Observação: os campos Sim/Não também podem ser promovidos a arrays no backend (`disponibilidade_internet`, `possui_projetor`, `possui_lousa_digital` como `Array<{label,escolas,percentual}>`) **se e somente se** o produto exigir a categoria "Não informado" separada — caso contrário, o cálculo no frontend é suficiente e mais barato.

## 9. Arquivos prováveis da implementação

Diff esperado restrito a:

```txt
api/cmd/api/analytics_pessoal_tecnologia.go   # expandir os 2 handlers (mediana, total inoperantes, distCateg atende, AVG projetores)
web/src/components/admin/shared/types.ts       # novos campos em TecnologiaInfra/TecnologiaUso
web/src/components/admin/AbaTecnologia.tsx      # renderizar gráficos faltantes + derivações no frontend
docs/dashboard/*                                # nota de validação/parity
```

**Nenhuma migration/view nova** — `vw_censo_equipamentos_tecnologia` (0006) já contém todos os campos. **Nenhum endpoint novo** — apenas expansão dos dois existentes. `main.go` **não** muda (as rotas já existem).

## 10. Menor PR recomendado

**Opção A — PR único moderado para completar a aba Tecnologia.** Recomendada.

Justificativa:

- Os **dois endpoints existentes concentram quase tudo** e leem a **mesma view**, que **já tem todos os campos**. Não há endpoint novo, migration nem `main.go` no caminho.
- O diff fica restrito a 3 arquivos de código (`analytics_pessoal_tecnologia.go`, `types.ts`, `AbaTecnologia.tsx`) + docs — exatamente a fronteira preferida.
- As lacunas são pequenas e coesas: 4 expansões de backend simples (mediana via `PERCENTILE_CONT`, `SUM` de inoperantes, `distCateg` para "atendem", `AVG` de projetores) e renderizações frontend, várias delas puramente derivadas do payload atual.
- Opção B (PRs por bloco) fragmentaria mudanças que tocam os mesmos 3 arquivos, gerando conflito e overhead sem ganho de reversibilidade. Opção C (backend-first/frontend-depois) só se justificaria se o backend fosse grande ou arriscado — aqui é incremental e idempotente.

**Carve-out obrigatório:** o **percentual de computadores inoperantes** fica **fora do PR** até a decisão de produto sobre o denominador. O **total absoluto** de inoperantes entra normalmente. Assim o PR único não fica bloqueado por produto.

Escopo sugerido do PR único (TEC-02, "Completar gráficos mínimos de Tecnologia"):

1. Backend `/tecnologia/infraestrutura`: medianas por tipo, `total_computadores_inoperantes`, `computadores_atendem_demanda`.
2. Backend `/tecnologia/uso-pedagogico`: `media_projetores_por_escola`.
3. Frontend: Donut de distribuição do parque (%), Donuts Sim/Não (internet, projetor, lousa) derivados, Donut "atendem à demanda", KPIs de mediana, total de inoperantes e média de projetores.
4. Docs: nota de paridade.

Caso o time prefira reduzir ainda mais o primeiro PR, há um **mínimo absoluto** viável só-frontend (zero backend): distribuição do parque (%) + Sim/Não de internet/projetor/lousa — todos derivados do payload atual. Mas, dado o baixo custo das expansões de backend, **o PR único moderado (Opção A) é a melhor relação esforço/cobertura.**

## 11. Itens fora de escopo

- Não implementar código frontend/backend, migrations, endpoints novos nesta etapa (TEC-01 é diagnóstico).
- Não alterar formulário, schemas Zod, autenticação ou sincronização Google Sheets.
- Não tocar nas abas Caracterização, Pessoal, Infraestrutura, Merenda, Serviços, Perfil dos Alunos, Gestão Financeira.
- Não implementar o **percentual de computadores inoperantes** sem decisão de produto sobre o denominador.
- Não criar a categoria "Não informado" nas distribuições Sim/Não sem pedido explícito de produto.

## 12. Conclusão

A aba **Tecnologia e Equipamentos** está estruturalmente correta (3 blocos) e com a base de dados completa: a view `0006` já contém todos os campos dos gráficos mínimos. Das 11 entregas mínimas, **2 estão completas**, **6 parciais** e **3 ausentes**. Nenhuma exige view/migration nova e nenhuma exige endpoint novo — tudo cabe em **expansão dos dois handlers existentes + renderização no componente**. Vários gráficos (distribuição do parque %, Sim/Não de internet/projetor/lousa) são resolvíveis **apenas no frontend** com o payload atual. **A mediana de equipamentos e a média de projetores devem ser calculadas no backend** (não derivam de totais). O **único bloqueio de produto** é o **denominador do percentual de computadores inoperantes**, que deve ser carved-out do PR. Recomenda-se um **PR único moderado (Opção A)** restrito a `analytics_pessoal_tecnologia.go`, `shared/types.ts`, `AbaTecnologia.tsx` e `docs/dashboard/*`.
