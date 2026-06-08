# Diagnóstico Técnico — Migração de RH da Merenda e Refinamento de Equipamentos

> Diagnóstico **somente documental** (MER-RH-01 + MER-EQP-REFINE-01). Destina-se a orientar o(s) PR(s) de implementação. **Não implementa código.** Não altera frontend, backend, endpoints, views ou migrations. As assinaturas de payload descrevem o **contrato lógico desejado**, não necessariamente o formato atual.

## 1. Objetivo

Diagnosticar, por leitura estática do código na branch `feat/merenda-oferta-estrutura` (já atualizada com `develop`), duas frentes pendentes da aba **Merenda Escolar**:

- **Frente A — MER-RH-01:** migrar o bloco **Recursos Humanos / Merendeiras** da aba Merenda para o menu **Serviços Terceirizados**, como bloco **"Manipulador de Alimentos"** (ou "Manipuladores de Alimentos / Merendeiras"). Responder: que dados existem, onde são buscados/renderizados, como remover de Merenda sem quebrar a tela, como adicionar em Serviços Terceirizados, se reaproveita o endpoint atual ou cria endpoint novo, e quais documentos atualizar.
- **Frente B — MER-EQP-REFINE-01:** converter a tabela **"Estado de conservação — visão consolidada"** (Equipamentos da Merenda) em **gráfico de barras empilhadas horizontais** (cada equipamento = barra 100%, segmentada em Bom / Regular / Ruim-Inoperante), conforme o painel original do Data Studio. Responder: se o payload `estado_consolidado` basta, se há componente de barra empilhada, se cria componente novo, o menor componente possível, se mantém a tabela detalhada e quais documentos atualizar.

Esta tarefa é **apenas diagnóstico**; nenhum código foi alterado.

## 2. Fontes analisadas

Frontend:

- `web/src/app/admin/page.tsx` — menu/submenu e montagem das abas (linhas 185–265, 535–545).
- `web/src/components/admin/AbaMerenda.tsx` — consumo dos 4 endpoints de Merenda e render dos blocos.
- `web/src/components/admin/AbaServicosTerceirizados.tsx` — consumo dos 3 endpoints de Serviços Terceirizados e blocos.
- `web/src/components/admin/shared/types.ts` — `MerendaRH`, `MerendaEquipamentos`, `EstadoConsolidadoEquipamentoStat`, `ServicosVisaoGeral`, `ServicosGerais`, `ServicosPortaria`, `EmpresaStat`, `CategoricStat`.
- `web/src/components/admin/shared/BarChart.tsx` — `VBarChart`, `HBarChart` (não há barra empilhada).
- `web/src/components/admin/shared/Donut.tsx`, `StatCard.tsx`.

Backend e banco:

- `api/cmd/api/analytics_infra_merenda_servicos.go` — handlers `AdminAnalyticsMerendaRH` (849), `AdminAnalyticsMerendaEquipamentos` (644), `AdminAnalyticsServicos*` (1008/1080/1114); structs de payload.
- `api/cmd/api/main.go` — registro das rotas (linhas 359–365).
- `api/cmd/api/migrations/0010_vw_censo_rh_merendeiras.sql` (espelhada idêntica em `infra/migrations/0010_*`).

Documentação:

- `docs/dashboard/matriz-abas-e-graficos.md` — §2.8 (decisão RH), §5.5 (Merenda), §5.6 (Serviços Terceirizados).
- `docs/dashboard/lacunas-backend-frontend-por-bloco.md` — §6.4 (Merenda), §6.5 (Serviços Terceirizados).
- `docs/dashboard/especificacao-entrega-dados-por-grafico.md` — §5.4 (Governança), §6.6.7 (estado consolidado), §6.6.14 (migração RH).
- `docs/dashboard/diagnostico-merenda-escolar.md` — §6.5 (RH), §10 (MER-RH-01 já antecipado).

Observação metodológica: diagnóstico por **leitura estática**. Os endpoints **não** foram executados contra banco local/homologação. Confirmação de categorias reais e cardinalidades fica para a fase de implementação + validação.

## 3. Situação atual na branch

- A aba **Merenda Escolar** tem 5 blocos renderizados em `AbaMerenda.tsx`: Oferta e Adequação (`sec-merenda-oferta`), Estrutura Física (`sec-merenda-estrutura`), Equipamentos (`sec-merenda-equipamentos`), Condições Sanitárias e Segurança (`sec-merenda-sanitarias`) e **Recursos Humanos** (`sec-merenda-rh`).
- Os quatro primeiros são os blocos finalísticos entregues (MER-01A/B/C). **Recursos Humanos** já está documentado como **não-finalístico de Merenda**, com migração conceitual decidida para Serviços Terceirizados (matriz §2.8). O código, porém, **ainda não foi migrado** — o bloco RH continua em `AbaMerenda.tsx`.
- A aba **Serviços Terceirizados** (`AbaServicosTerceirizados.tsx`) tem 4 blocos: Visão Geral, Serviços Gerais, Portaria e Governança / Supervisão (este último é apenas um empty state). **Não existe** bloco de Manipuladores/Merendeiras.
- O bloco **Equipamentos da Merenda** renderiza o estado consolidado como **tabela compacta** (`AbaMerenda.tsx:476–524`) — é o alvo do refinamento visual da Frente B.

## 4. Frente A — Recursos Humanos da Merenda

### 4.1 Estado atual na aba Merenda

Em `AbaMerenda.tsx`:

- **Estado/fetch:** `rh` e `rhErr` (linhas 66, 70); fetch `apiFetch<MerendaRH>("/v1/admin/analytics/merenda/recursos-humanos", token)` (linha 91); promessa incluída no `Promise.all` (linha 99) e no guard de "nada carregado" (linha 114).
- **Cálculos derivados:** `totalMerendeiras = round(total_estatutaria + total_terceirizada + total_temporaria)` (linhas 123–124); `vinculoSegments` (linhas 159–165, donut por vínculo); `topEmpresasRows` (linhas 167–170).
- **Banner de erro parcial de RH:** linhas 271–276 (`rhErr && (oferta || equip)`).
- **Cards no resumo executivo de Oferta** que usam `rh`:
  - **"Com Supervisor"** → `fmtPct(rh?.pct_com_supervisor)` (linhas 306–312).
  - **"Total de Merendeiras"** → `totalMerendeiras` (linhas 313–319).
  - (Os outros dois cards do resumo — "Atende às Necessidades" e "Possui Refeitório" — vêm de `oferta`, não de `rh`.)
- **Bloco `sec-merenda-rh`** (linhas 633–694):
  - Cabeçalho "Recursos Humanos" (633–638).
  - 4 `StatCard`: Merendeiras Estatutárias, Terceirizadas, Temporárias, Supervisor de Merenda (640–669).
  - Donut **"Distribuição por vínculo"** (672–682).
  - `HBarChart` **"Top empresas terceirizadas"** (683–693).

Em `page.tsx`:

- Submenu **"Recursos Humanos"** com `anchor: "sec-merenda-rh"` dentro da aba `merenda` (linha 256).

> **Observação importante (acoplamento de view).** A view `vw_censo_rh_merendeiras` (0010) é **compartilhada**: além de alimentar `/merenda/recursos-humanos`, ela também serve o handler `AdminAnalyticsMerendaOferta` para `oferta_regular`, `qualidade_merenda` e `atende_necessidades` (ver `analytics_infra_merenda_servicos.go:594–602`). Portanto **a view não pode ser removida nem renomeada** ao migrar RH — só muda quem expõe os campos de merendeiras.

### 4.2 Estado atual no backend

- **Handler:** `AdminAnalyticsMerendaRH` (`analytics_infra_merenda_servicos.go:849`). **Rota:** `/admin/analytics/merenda/recursos-humanos` (`main.go:361`).
- **View usada:** `vw_censo_rh_merendeiras` (0010).
- **Payload atual (`MerendaRH`):**

| Campo | Tipo | Cálculo |
|---|---|---|
| `total_estatutaria` | float | `SUM(qtd_merendeiras_estatutaria)` |
| `total_terceirizada` | float | `SUM(qtd_merendeiras_terceirizada)` |
| `total_temporaria` | float | `SUM(qtd_merendeiras_temporaria)` |
| `pct_com_supervisor` | float | `% onde lower(possui_supervisor_merenda) = 'sim'` |
| `top_empresas` | `EmpresaStat[]` | Top 10 `empresa_terceirizada_merenda` por nº de escolas |

- **Campos existentes na view `0010` mas NÃO expostos hoje:**
  - `qtd_atende_necessidade_merenda` (texto) e `quantitativo_necessario_merenda` (numérico) → insumo para **"a quantidade atual atende à necessidade?"**.
  - `atende_necessidades` (categórico) → exposto, mas pelo handler de **Oferta** (não pelo de RH).
  - Quantidade **média de merendeiras por escola** → derivável de `qtd_merendeiras_*` (não calculada hoje).
- **Campos AUSENTES na view `0010`:**
  - **Avaliação do serviço das merendeiras** — não existe em `0010`. Origem provável: `vw_censo_servicos_terceirizados.avaliacao_merendeiras` (especificação §5.4.3), a confirmar na implementação.

Cruzamento dos campos pedidos no diagnóstico (§5.2 do briefing) com a view `0010`:

| Campo pedido | Existe em `vw_censo_rh_merendeiras`? | Exposto hoje? |
|---|---|---|
| `total_estatutaria` | Sim (`qtd_merendeiras_estatutaria`) | Sim |
| `total_terceirizada` | Sim (`qtd_merendeiras_terceirizada`) | Sim |
| `total_temporaria` | Sim (`qtd_merendeiras_temporaria`) | Sim |
| `pct_com_supervisor` | Sim (`possui_supervisor_merenda`) | Sim |
| `top_empresas` | Sim (`empresa_terceirizada_merenda`) | Sim |
| `atende_necessidades` (adequação do quantitativo) | Sim (`qtd_atende_necessidade_merenda`, `quantitativo_necessario_merenda`, `atende_necessidades`) | **Não** (no endpoint de RH) |
| avaliação do serviço | **Não** (provável em `vw_censo_servicos_terceirizados`) | **Não** |
| média por escola | Derivável | **Não** |

### 4.3 Estado atual na documentação

A migração já está **documentada como decisão**, mas ainda não como entrega:

- `matriz-abas-e-graficos.md` §2.8 e §5.5 (nota) e §5.6 (nota "Bloco futuro — Manipuladores de Alimentos / Merendeiras").
- `lacunas-backend-frontend-por-bloco.md` §6.4 (nota final) e linha 63 da tabela de prioridades.
- `especificacao-entrega-dados-por-grafico.md` §6.6.14 (migração RH → Serviços Terceirizados) e §5.4 (Governança / avaliações), além das linhas 1685 (endpoint futuro `…/manipuladores-alimentos`) e 1722 (passo de rollout).
- `diagnostico-merenda-escolar.md` §6.5 e §10 (item 4 — MER-RH-01).

Todos descrevem o estado "decisão tomada, código intacto". Após a implementação, precisam migrar para "entregue".

### 4.4 Opções de migração

| Opção | Descrição | Vantagem | Desvantagem |
|---|---|---|---|
| **A — Reaproveitar endpoint atual** | `AbaServicosTerceirizados` consome `/v1/admin/analytics/merenda/recursos-humanos` | Menor diff; nenhum backend | Semântica ruim: aba de terceirizados consumindo rota `merenda/*` |
| **B — Endpoint novo (substitui)** | Criar `/v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` e **remover** `/merenda/recursos-humanos` | Semântica correta; sem duplicação | Quebra qualquer consumidor do endpoint antigo; remoção de endpoint exige fase de depreciação (regra do CLAUDE.md) |
| **C — Endpoint novo + manter legado** | Criar `…/servicos-terceirizados/manipuladores-alimentos` (mesma view `0010`) e **manter** `/merenda/recursos-humanos` ativo, deixando de renderizá-lo em Merenda | Semântica correta + compatibilidade preservada; respeita "não remover endpoints sem depreciação" | Duplica temporariamente endpoints de payload semelhante |

### 4.5 Endpoint recomendado

**Recomendação: Opção C** (alinhada à preferência do solicitante e à diretriz do CLAUDE.md de não remover endpoints sem fase de depreciação).

- Criar `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos`, lendo a **mesma view** `vw_censo_rh_merendeiras` (e, se a avaliação entrar no escopo, juntando `vw_censo_servicos_terceirizados`).
- **Manter** `/merenda/recursos-humanos` ativo e inalterado (compatibilidade; mesma rota que `AbaMerenda` deixará de consumir). Sua eventual retirada vira uma fase de depreciação futura, depois que nenhuma UI o consumir.
- Registrar a rota nova no grupo protegido de `main.go` (junto das demais `/servicos-terceirizados/*`, linhas 363–365).
- **Nenhuma migration/view nova** é necessária — `0010` já tem os campos de merendeiras; a avaliação, se incluída, virá de `vw_censo_servicos_terceirizados` (já existente).

### 4.6 Payload recomendado

Reaproveitar a struct `MerendaRH` como base, criando uma struct semanticamente nomeada (ex.: `ManipuladoresAlimentos`) que a estenda, cobrindo os gráficos mínimos pedidos:

```ts
// GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos
export interface ManipuladoresAlimentos {
  // já calculáveis sobre vw_censo_rh_merendeiras (reuso direto de MerendaRH):
  total_estatutaria:   number;       // SUM(qtd_merendeiras_estatutaria)
  total_terceirizada:  number;       // SUM(qtd_merendeiras_terceirizada)
  total_temporaria:    number;       // SUM(qtd_merendeiras_temporaria)
  pct_com_supervisor:  number;       // % possui_supervisor_merenda = 'sim'
  top_empresas:        EmpresaStat[]; // Top 10 empresa_terceirizada_merenda

  // a ACRESCENTAR (campos já na view 0010, hoje não expostos):
  media_por_escola:        number;          // média do total de merendeiras por escola declarante
  dist_atende_necessidade: CategoricStat[]; // qtd_atende_necessidade_merenda / atende_necessidades

  // OPCIONAL — depende de produto (escala de avaliação) + fonte externa à 0010:
  dist_avaliacao_servico?: CategoricStat[]; // vw_censo_servicos_terceirizados.avaliacao_merendeiras (a confirmar)
}
```

Mapeamento dos **gráficos mínimos pedidos** → disponibilidade:

| Gráfico mínimo pedido | Disponível no payload atual? | Ação |
|---|---|---|
| Total de merendeiras por vínculo | Sim (`total_*`) | Reuso |
| Quantidade atual atende à necessidade? | Não (campo na view, não exposto) | **Adicionar** `dist_atende_necessidade` |
| Avaliação do serviço das merendeiras | Não (fora da `0010`) | **Adicionar** se produto definir escala; fonte `vw_censo_servicos_terceirizados` |
| Quantidade média de merendeiras por escola | Não (derivável) | **Adicionar** `media_por_escola` |
| Empresas que atuam na rede e abrangência | Sim (`top_empresas`) | Reuso |
| Há supervisão do serviço pelas empresas? | Sim (`pct_com_supervisor`) | Reuso |

Ou seja: **3 dos 6** gráficos mínimos já estão no payload; **2** dependem de campos existentes na view (basta expor); **1** (avaliação) depende de produto + fonte adicional e pode ficar para uma fatia posterior, compartilhada com o bloco Governança / Supervisão (§5.4 da especificação).

### 4.7 Alterações necessárias no frontend

**Em `AbaServicosTerceirizados.tsx` (adicionar):**

- Novo estado `manip`/`manipErr` + fetch do endpoint recomendado, no mesmo padrão dos demais (`apiFetch`, `Promise.all`, banner de erro parcial).
- Novo bloco com `id="sec-servicos-manipuladores"` e cabeçalho "Manipulador de Alimentos" (ícone `ChefHat`/`Utensils`).
- Migrar os gráficos do antigo `sec-merenda-rh`: StatCards de vínculo + supervisor, `Donut` "Distribuição por vínculo", `HBarChart` "Empresas e abrangência". Acrescentar, conforme payload: card "Média de merendeiras por escola" e gráfico de "Atende à necessidade".

**Em `AbaMerenda.tsx` (remover, somente após o bloco existir em Serviços):**

- Estado `rh`/`rhErr`, fetch `/merenda/recursos-humanos` (linha 91), entradas no `Promise.all` (99) e no guard (114).
- Cálculo `totalMerendeiras` (123–124), `vinculoSegments` (159–165), `topEmpresasRows` (167–170).
- Banner de erro parcial de RH (271–276).
- Bloco `sec-merenda-rh` inteiro (633–694).
- Imports que ficarem órfãos (`Briefcase`, `Building`, `UserCheck`, eventualmente `Users`).
- **Cards "Com Supervisor" e "Total de Merendeiras" do resumo executivo de Oferta** (306–319): **recomenda-se removê-los de Merenda** também, pois pertencem à frente de serviços/manipuladores. Sua remoção deixa o resumo executivo com 2 cards (Atende às Necessidades, Possui Refeitório) — avaliar se vale recompor o grid (`lg:grid-cols-4` → `lg:grid-cols-2`) ou preencher com outro KPI de Oferta. **Esta é a única decisão de produto da Frente A.**

> **Regra de ordem (sem regressão):** a remoção de `sec-merenda-rh` de `AbaMerenda.tsx` só deve ocorrer **depois** que o bloco equivalente já estiver renderizando em `AbaServicosTerceirizados.tsx`, idealmente no mesmo PR.

### 4.8 Alterações necessárias no menu

Em `page.tsx`:

- **Remover** o submenu `{ label: "Recursos Humanos", anchor: "sec-merenda-rh" }` da aba `merenda` (linha 256).
- **Adicionar** em `servicos` um submenu `{ label: "Manipulador de Alimentos", anchor: "sec-servicos-manipuladores" }` (junto das linhas 262–265), na posição desejada (sugestão: após "Portaria").

### 4.9 Riscos e compatibilidade

- **View compartilhada:** não remover/renomear `vw_censo_rh_merendeiras` — alimenta também `/merenda/oferta` (§4.1). A Opção C não toca a view.
- **Endpoint legado:** com a Opção C, `/merenda/recursos-humanos` continua respondendo; nenhum consumidor quebra. Sua depreciação é fase futura.
- **Ordem de remoção no frontend:** risco de regressão visual se `sec-merenda-rh` sair antes do bloco existir em Serviços — mitigado fazendo as duas pontas no mesmo PR.
- **Cards do resumo de Oferta:** se removidos, o grid de 4 colunas fica desbalanceado — tratar layout no mesmo PR.
- **Avaliação do serviço:** depende de escala de avaliação ainda não validada (especificação §5.4) e de fonte fora da `0010`. **Recomenda-se deixar este gráfico fora do PR de migração** e tratá-lo junto do bloco Governança / Supervisão, para não travar a migração dos itens prontos.
- **Filtro fixo:** o handler atual usa filtro fixo (`status='completed' AND year=…`) sem query string; o endpoint novo deve manter o mesmo critério para paridade numérica com o bloco antigo.

## 5. Frente B — Estado de conservação em barras empilhadas

> **Status: ✅ Implementado (MER-EQP-REFINE-01).** O bloco "Estado de conservação — visão consolidada" foi refinado de **tabela compacta** para **gráfico de barras empilhadas horizontais** (100% por equipamento, segmentos Bom / Regular / Ruim-Inoperante) via o componente local `StackedConservationBar` em `AbaMerenda.tsx`, reaproveitando o pivô `consolidadoPorEquip` já existente. A tabela detalhada "Distribuição do estado dos equipamentos" permanece como detalhamento complementar. Frontend puro: nenhum backend, endpoint, view, migration ou tipo compartilhado foi alterado. As subseções abaixo descrevem o diagnóstico original.

### 5.1 Estado atual

O bloco Equipamentos da Merenda renderiza o estado consolidado como **tabela compacta** "Estado de conservação — visão consolidada" (`AbaMerenda.tsx:476–524`): uma linha por equipamento (`Freezers`, `Geladeiras`, `Fogões`, `Fornos`, `Bebedouros`) e colunas `Bom | Regular | Ruim/Inoperante`, cada célula mostrando `escolas (percentual%)`. Logo abaixo há uma segunda tabela, "Distribuição do estado dos equipamentos" (526–566), que detalha `dist_estados` (equipamento × estado × escolas).

A referência do Data Studio mostra o item consolidado como **gráfico de barras empilhadas horizontais**, cada equipamento como uma barra total 100%, segmentada em Bom / Regular / Ruim-Inoperante.

### 5.2 Payload disponível

`estado_consolidado` (em `MerendaEquipamentos`, tipo `EstadoConsolidadoEquipamentoStat`) já entrega exatamente o necessário:

```ts
{ equipamento: string; estado: string; escolas: number; percentual: number }
```

São 3 linhas por equipamento (Bom, Regular, Ruim/Inoperante), com `percentual` já calculado no backend sobre o denominador "escolas com estado informado para aquele equipamento" (`analytics_infra_merenda_servicos.go:796–840`). No frontend já existe o pivô pronto: `consolidadoPorEquip[equip][estado] = { escolas, percentual }` (`AbaMerenda.tsx:211–223`), com `consolidadoEquipList` na ordem oficial e `estadoCorClasse` mapeando as cores (Bom=emerald, Regular=amber, Ruim/Inoperante=rose).

### 5.3 Necessidade ou não de backend

**Nenhuma alteração de backend é necessária.** O payload `estado_consolidado` já traz `equipamento`, `estado`, `escolas` e `percentual` — suficiente para renderizar a barra empilhada (largura por `percentual`, rótulo por `escolas`). Frente B é **frontend puro**.

### 5.4 Componente recomendado

- **Componentes existentes:** `VBarChart` e `HBarChart` (`BarChart.tsx`) e `Donut`. **Nenhum** faz empilhamento (stacked) — `HBarChart` desenha uma única série por linha. Não há `StackedBar`/`StackedHBar`/`BarStack`/`HorizontalStackedBar`.
- **Recomendação (alinhada à preferência do solicitante):** criar um **componente local simples em `AbaMerenda.tsx`**, já que o uso, por ora, é exclusivo deste bloco. Promover a um componente compartilhado em `shared/` só se houver uso previsto em outras abas (não há hoje).
- **Menor componente possível:** uma função local que recebe as linhas já pivotadas e renderiza, por equipamento, um `flex` horizontal de 3 segmentos com `width: ${percentual}%` e as cores de `estadoCorClasse`. Algo como:

```tsx
// Local em AbaMerenda.tsx — reusa estadosConsolidados, consolidadoPorEquip, equipNome.
function EstadoStackedBar({ equipamentos }: { equipamentos: string[] }) {
  const cores: Record<string, string> = {
    "Bom": "#059669", "Regular": "#D97706", "Ruim/Inoperante": "#E11D48",
  };
  // por equipamento: barra 100% com 3 segmentos proporcionais a percentual
}
```

Reaproveita `estadosConsolidados`, `consolidadoPorEquip`, `consolidadoEquipList` e `equipNome`, que **já existem** no componente — diff mínimo.

### 5.5 Comportamento visual recomendado

Por equipamento (Freezers, Geladeiras, Fogões, Fornos, Bebedouros), uma barra horizontal total 100% com segmentos Bom / Regular / Ruim-Inoperante:

- **Legenda** das três categorias (cores de `estadoCorClasse`/Looker).
- **Valor absoluto** (`escolas`) dentro do segmento quando couber, ou ao lado.
- **Percentual** em texto complementar simples (não exige tooltip complexo — manter escopo enxuto).
- **Fallback `NoData`** quando `consolidadoEquipList` estiver vazio (reusar o `NoData` já definido no arquivo).
- Substituir **apenas** a tabela compacta "Estado de conservação — visão consolidada" (476–524) pela barra empilhada, mantendo o card/cabeçalho atual.

### 5.6 Riscos de UI

- **Soma de percentuais ≠ 100%:** como o denominador é "escolas com estado informado", a soma Bom+Regular+Ruim deve dar ~100% por equipamento; arredondamentos podem gerar 99,9/100,1 — usar `percentual` direto para largura e aceitar pequena folga visual (último segmento pode preencher o resto).
- **Categoria ausente:** se algum equipamento não tiver uma das categorias, o segmento simplesmente não aparece (largura 0) — o pivô já lida com isso (`consolidadoPorEquip[eq]?.[est]`).
- **Acessibilidade/contraste:** texto branco dentro de segmento amber pode ter contraste baixo — preferir valor ao lado quando o segmento for estreito.
- **Tabela detalhada:** manter "Distribuição do estado dos equipamentos" (`dist_estados`, 526–566) como **detalhamento complementar** — não remover (preferência do solicitante e do diagnóstico anterior).

## 6. Tabela consolidada de tarefas

| Frente | Item | Backend | Frontend | Docs | Produto | Observação |
|---|---|---|---|---|---|---|
| A | Endpoint `…/servicos-terceirizados/manipuladores-alimentos` | **Novo** handler + rota em `main.go` (Opção C) | — | matriz §5.5/§5.6, lacunas §6.4/§6.5, especificação §6.6.14, diag-merenda §10 | — | Reusa `vw_censo_rh_merendeiras`; nenhuma view nova |
| A | Manter `/merenda/recursos-humanos` (legado) | Sem mudança | Deixa de consumir | Marcar como legado | — | Depreciação é fase futura |
| A | Bloco `sec-servicos-manipuladores` | — | **Adicionar** em `AbaServicosTerceirizados.tsx` | — | — | Migra StatCards + donut vínculo + HBar empresas |
| A | Remover bloco `sec-merenda-rh` | — | **Remover** de `AbaMerenda.tsx` (após bloco em Serviços) | — | — | Estados `rh`/`rhErr`, cálculos, banner |
| A | Cards "Com Supervisor" e "Total de Merendeiras" no resumo de Oferta | — | **Remover** + ajustar grid | — | **Decidir** (tendência: remover) | Pertencem à frente de serviços |
| A | Submenu de menu | — | `page.tsx`: remover "Recursos Humanos", adicionar "Manipulador de Alimentos" | — | — | Linhas 256 / 262–265 |
| A | "Atende à necessidade" + "média por escola" | **Expor** campos da `0010` | Renderizar | — | — | Campos já na view |
| A | "Avaliação do serviço das merendeiras" | Expor de `vw_censo_servicos_terceirizados` | Renderizar | especificação §5.4 | **Escala de avaliação** | Sugerido fora do PR de migração |
| B | `estado_consolidado` em barra empilhada | **Nenhum** (payload já basta) | Componente local em `AbaMerenda.tsx` | matriz §5.5 (linha estado consolidado), especificação §6.6.7 | — | Substitui só a tabela compacta |
| B | Tabela detalhada `dist_estados` | — | **Manter** | — | — | Detalhamento complementar |

## 7. Menor PR recomendado

**Recomendação: dois PRs separados** (alinhada à preferência do solicitante).

- **MER-EQP-REFINE-01 — Barra empilhada.** Escopo enxuto, **frontend puro**, toca só `AbaMerenda.tsx` (substitui a tabela compacta por componente local) e, se houver, uma nota de doc. Sem backend, sem menu, sem migração de endpoint. Reversível e validável isoladamente (paridade visual com o Data Studio).
- **MER-RH-01 — Migração de RH para Serviços Terceirizados.** Escopo transversal: novo endpoint (`main.go` + handler/struct), novo bloco em `AbaServicosTerceirizados.tsx`, remoção do bloco em `AbaMerenda.tsx`, ajuste de menu em `page.tsx` e atualização de 4 documentos. Mistura migração de menu/endpoint com remoção de bloco — merece PR próprio.

Justificativa: a Frente B é um refino visual pequeno e independente; a Frente A é uma reorganização conceitual com superfície ampla (backend + 3 arquivos de frontend + docs). Juntá-las misturaria naturezas diferentes de mudança e dificultaria o review e o rollback. Só faria sentido um **PR único** se o diff da Frente A se mostrasse muito pequeno — o que não é o caso, dado o novo endpoint e a movimentação entre duas abas.

Ordem sugerida: **MER-EQP-REFINE-01 primeiro** (menor risco, fecha a pendência visual da Merenda), depois **MER-RH-01**.

## 8. Fora de escopo

- Implementar qualquer código nesta etapa (este é diagnóstico).
- Remover o endpoint `/merenda/recursos-humanos` (Opção C mantém; depreciação é fase futura).
- Criar/alterar migrations ou views (`vw_censo_rh_merendeiras` e `vw_censo_equipamentos_merenda` já bastam).
- Implementar o bloco **Governança / Supervisão** de Serviços Terceirizados e a **escala oficial de avaliação** (frente própria; só se cruza com a Frente A no item opcional "avaliação do serviço").
- Alterar formulário, schemas Zod, autenticação ou sincronização Google Sheets.
- Tocar outras abas (Caracterização, Pessoal, Tecnologia, Infraestrutura, Perfil dos Alunos, Gestão Financeira).
- Adicionar filtros por query string aos endpoints de Merenda/Serviços (lacuna de padronização registrada à parte).

## 9. Conclusão

As duas frentes estão **tecnicamente desbloqueadas**:

- **Frente A (MER-RH-01)** é uma reorganização conceitual, não uma lacuna de dado. A view `vw_censo_rh_merendeiras` já contém os campos de merendeiras (e ainda os de adequação do quantitativo, hoje não expostos). Recomenda-se a **Opção C** — criar `GET /v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos` reaproveitando a view, manter `/merenda/recursos-humanos` como legado, mover o bloco de `AbaMerenda.tsx` para `AbaServicosTerceirizados.tsx` (com o submenu correspondente), e remover os cards de RH do resumo de Oferta. A "avaliação do serviço" depende de produto e de fonte externa à `0010`, e deve ficar para uma fatia posterior.
- **Frente B (MER-EQP-REFINE-01)** é **frontend puro**: `estado_consolidado` já entrega `{ equipamento, estado, escolas, percentual }`, e o pivô `consolidadoPorEquip` já existe em `AbaMerenda.tsx`. Basta um **componente local de barra empilhada** substituindo a tabela compacta, preservando a tabela detalhada.

Recomenda-se **dois PRs separados** (B primeiro, A depois). Nenhuma migration/view nova é necessária em qualquer das frentes. Tarefa somente documental — nenhum código foi alterado.
