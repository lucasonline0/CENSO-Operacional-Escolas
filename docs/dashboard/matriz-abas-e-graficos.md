# Matriz de Abas, Blocos e Gráficos — Dashboard Admin

**Status:** documento oficial vivo. Substitui qualquer matriz/rascunho anterior espalhado em `frente-1-*.md`, `frente-2-*.md`, `frente-3-*.md` e no `guia_views_analiticas_baseado_repositorio_censo.md`. Sempre que houver conflito entre este documento e os guias antigos, este vale.

**Branch de origem:** `docs/dashboard-tabs-matrix` a partir de `develop`.

**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [frente-1-pessoal-tecnologia.md](frente-1-pessoal-tecnologia.md)
- [frente-2-infra-merenda-servicos.md](frente-2-infra-merenda-servicos.md)
- [frente-3-frontend-qualidade.md](frente-3-frontend-qualidade.md)
- [validacao-fase-2.md](validacao-fase-2.md)
- [validacao-fase-pessoal-tecnologia.md](validacao-fase-pessoal-tecnologia.md)
- [validacao-fase-infra-merenda-servicos.md](validacao-fase-infra-merenda-servicos.md)
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md)
- [jsonb-field-inventory.md](jsonb-field-inventory.md)
- [../guia_views_analiticas_baseado_repositorio_censo.md](../guia_views_analiticas_baseado_repositorio_censo.md) — referência metodológica histórica/preliminar; ver §3 deste documento para o recorte oficial vigente.

---

## 1. Objetivo

Consolidar, em um único lugar, a **matriz oficial** de abas / blocos / gráficos do `/admin`, refletindo o estado real da branch `develop` (pós-merge das Frentes 1, 2 e 3 backend + integração visual das 5 abas temáticas + placeholder institucional de Gestão Financeira e Governança).

A matriz tem três usos:

1. servir de **mapa único** de leitura do `/admin` para qualquer pessoa entrando no projeto;
2. **explicitar quais blocos já existem na UI, com que dados, e quais ainda são lacuna** (backend, frontend ou produto);
3. evitar que novos PRs introduzam gráficos fora de plano antes da matriz mínima ser validada com as áreas finalísticas.

Esta rodada **não implementa subabas** como navegação interna. Subabas, aqui, significam **blocos verticais internos** de cada aba — seções rotuladas dentro do conteúdo, na mesma página.

---

## 2. Decisões de produto consolidadas

Decisões registradas pelo time, válidas para todo o trabalho a partir desta branch:

1. **Estatística Descritiva** na aba "Caracterização da Rede" está **removida/adiada** por enquanto. Pode voltar em rodada futura, mas não como pré-requisito para nada nesta matriz.
2. **Caracterização da Rede** se organiza em três blocos mínimos:
   - Dimensão e Perfil da Rede;
   - Organização da Oferta e Funcionamento;
   - Infraestrutura Educacional.
3. **Perfil dos Alunos e Resultados** permanece com a implementação atual/legada (consome `/v1/admin/indicadores-metrics`, alimentado por Google Sheets). Será remodelada futuramente, provavelmente a partir de uma planilha própria — fora desta rodada.
4. **Gestão Financeira e Governança** é **placeholder institucional**. Sem fetch, sem endpoint, sem view SQL, sem dado fake.
5. **Gestão Financeira e Governança não deve consumir o banco PostgreSQL do formulário do censo** nesta rodada.
6. A **fonte futura** de "Gestão Financeira / Governança" virá de **bases próprias validadas pelas coordenações responsáveis**, não do banco do censo operacional.
7. As **5 abas temáticas já integradas em primeira versão** (Pessoal e Gestão Escolar, Tecnologia e Equipamentos, Infraestrutura e Segurança, Merenda Escolar, Serviços Terceirizados) **não devem receber gráficos inéditos** (fora do escopo do painel original) antes desta matriz mínima ser validada com as áreas finalísticas da SEDUC. **Exceção:** gráficos mínimos que já existiam no painel original (Data Studio/Looker Studio) e ainda não estão refletidos na aplicação podem ser **documentados como lacunas** nesta matriz e **implementados após diagnóstico técnico**, mesmo antes da validação — eles não são novidade de escopo, e sim recuperação da referência mínima. O caso de Tecnologia e Equipamentos (ver §5.3) é o primeiro a seguir esse caminho.

---

## 3. Estado atual das abas (pós-merge em `develop`)

Snapshot real da branch `develop`, atualizado neste PR. Suplanta a seção 2.1 de [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md).

| # | Aba | Estado | Fonte | Componente React |
|---|---|---|---|---|
| 1 | Caracterização da Rede | Integrada (1ª versão consolidada — Fase 2B.1) | PostgreSQL `/v1/admin/analytics/caracterizacao/{perfil,dre}` + fallback `sheet-metrics` | `AbaCaracterizacao.tsx` |
| 2 | Pessoal e Gestão Escolar | Integrada (1ª versão) | PostgreSQL `/v1/admin/analytics/pessoal-gestao/{estrutura,coordenacao,quadro-pessoal}` | `AbaPessoalGestao.tsx` |
| 3 | Tecnologia e Equipamentos | Integrada (1ª versão) | PostgreSQL `/v1/admin/analytics/tecnologia/{infraestrutura,uso-pedagogico}` | `AbaTecnologia.tsx` |
| 4 | Infraestrutura e Segurança | Integrada (1ª versão) | PostgreSQL `/v1/admin/analytics/infraestrutura/{condicoes,seguranca}` | `AbaInfraestruturaSeguranca.tsx` |
| 5 | Merenda Escolar | Integrada (1ª versão) | PostgreSQL `/v1/admin/analytics/merenda/{oferta,equipamentos,recursos-humanos}` | `AbaMerenda.tsx` |
| 6 | Serviços Terceirizados | Integrada (1ª versão) | PostgreSQL `/v1/admin/analytics/servicos-terceirizados/{visao-geral,servicos-gerais,portaria}` | `AbaServicosTerceirizados.tsx` |
| 7 | Perfil dos Alunos e Resultados | Implementação atual/legada mantida | Google Sheets `/v1/admin/indicadores-metrics` | `AbaPerfilAlunos.tsx` |
| 8 | Gestão Financeira e Governança | Placeholder institucional | — (sem fetch) | `AbaGestaoFinanceiraGovernanca.tsx` |
| 9 | Operacional | Integrada | PostgreSQL `/v1/admin/dashboard` | `AbaOperacional.tsx` |
| 10 | Todos os Censos | Integrada | PostgreSQL `/v1/admin/census` | `AbaTodosCensos.tsx` |
| 11 | Por DRE | Integrada | PostgreSQL `/v1/admin/dashboard.by_dre` | `AbaPorDre.tsx` |

> **Importante.** A redação anterior em `plano-trabalho-paralelo.md` (Frente 1 backend pendente, abas 2–6 como placeholder) está superada por este snapshot. As views `0003_*` a `0012_*` e os handlers `analytics_pessoal_tecnologia.go` e `analytics_infra_merenda_servicos.go` já estão em `develop`, e os 5 componentes `Aba*.tsx` correspondentes consomem esses endpoints.

---

## 4. Matriz geral

Visão consolidada das abas, **com foco analítico**. As abas operacionais (Operacional, Todos os Censos, Por DRE) estão descritas em §6 e são intencionalmente fora da matriz analítica.

| Aba | Status atual | Fonte atual | Blocos internos oficiais | Observações |
|---|---|---|---|---|
| Caracterização da Rede | Integrada (1ª versão consolidada) | PostgreSQL + fallback Sheets | Dimensão e Perfil da Rede · Organização da Oferta e Funcionamento · Infraestrutura Educacional | "Estatística Descritiva" removida/adiada. Não receber novos gráficos antes da validação. |
| Pessoal e Gestão Escolar | Integrada (1ª versão) | PostgreSQL | Estrutura de Gestão Escolar · Coordenação Pedagógica · Quadro de Pessoal | Endpoints `/pessoal-gestao/*`. Próximos gráficos só após validação. |
| Tecnologia e Equipamentos | Integrada (1ª versão) | PostgreSQL | Infraestrutura Digital · Parque Tecnológico · Uso Pedagógico | Endpoints `/tecnologia/*`. |
| Infraestrutura e Segurança | Integrada (1ª versão) | PostgreSQL | Condições Estruturais e Ambientes · Energia, Climatização e Capacidade Elétrica · Segurança Física e Patrimonial | Endpoints `/infraestrutura/*`. Bloco de Energia/Climatização possivelmente sob-coberto pelo backend atual (ver §5.4). |
| Merenda Escolar | Integrada (1ª versão) | PostgreSQL | Oferta e Adequação da Merenda · Estrutura Física · Equipamentos da Merenda · Recursos Humanos | Endpoints `/merenda/*`. Bloco "Estrutura Física" precisa ser confirmado contra payload atual (ver §5.5). |
| Serviços Terceirizados | Integrada (1ª versão) | PostgreSQL | Visão Geral · Serviços Gerais · Portaria · Governança / Supervisão | Endpoints `/servicos-terceirizados/*`. Bloco "Governança / Supervisão" depende de campos de supervisão/avaliação (ver §5.6). |
| Perfil dos Alunos e Resultados | Implementação atual mantida | Sheets `/indicadores-metrics` | Perfil Socioeducacional e Permanência (futuro) · Resultados e Desempenho (futuro) | Remodelagem futura, **fora desta rodada**. |
| Gestão Financeira e Governança | Placeholder institucional | — | Governança Institucional e Regularização (futuro) · Execução Financeira e Prestação de Contas (futuro) · Participação Comunitária e Risco de Governança (futuro) | Sem fetch. Fonte futura: base própria das coordenações, **fora do banco do censo**. |

---

## 5. Matriz detalhada por aba

Convenções das tabelas:

- **Gráfico mínimo** = item que deve aparecer na 1ª versão consolidada da aba.
- **Status atual** = `presente` (renderizado na UI hoje), `parcial` (consumido mas com lacuna), `planejado` (não renderizado, depende de backend ou de produto).
- **Lacuna backend** = view, campo ou endpoint ausente / a confirmar.
- **Lacuna frontend** = componente, card ou gráfico a criar/ajustar.
- **Observações** = decisões, dependências, riscos semânticos.

A lista de gráficos abaixo é a **matriz mínima validada nesta rodada**. Itens marcados como `planejado` não são compromisso de PR imediato — entram em backlog para a próxima rodada de validação.

### 5.1 Caracterização da Rede

Blocos oficiais (3):
- **Dimensão e Perfil da Rede**
- **Organização da Oferta e Funcionamento**
- **Infraestrutura Educacional**

Removido/adiado: **Estatística Descritiva**.

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Dimensão e Perfil da Rede | Total de escolas (KPI) | PG `/analytics/overview` ou `/caracterizacao/perfil` | presente | — | — | KPI base do dashboard. |
| Dimensão e Perfil da Rede | Total de alunos (KPI) | PG `/caracterizacao/perfil` | presente | Decimais legados em `total_alunos` (ver `criterios-contagem-e-qualidade-dados.md` §8) | — | Microfix Zod aplicado; dados legados não corrigidos. |
| Dimensão e Perfil da Rede | Média de alunos por escola (KPI) | PG `/caracterizacao/perfil` | presente | — | — | — |
| Dimensão e Perfil da Rede | Alunos PcD (KPI) | PG `/caracterizacao/perfil` | presente / a confirmar | Confirmar campo no payload | Confirmar renderização atual | Validar contra `vw_censo_enriquecida`. |
| Dimensão e Perfil da Rede | Escolas por porte (donut/barra) | PG `/caracterizacao/perfil` | presente | — | — | — |
| Dimensão e Perfil da Rede | Matrículas por porte (barra) | PG `/caracterizacao/perfil` | presente / a confirmar | — | Confirmar gráfico atual | — |
| Dimensão e Perfil da Rede | Escolas por zona (donut) | PG `/caracterizacao/perfil` | presente | — | — | — |
| Dimensão e Perfil da Rede | Escolas por DRE (barra/tabela) | PG `/caracterizacao/dre` | presente | — | — | Tabela já existe. |
| Organização da Oferta e Funcionamento | Etapas ofertadas (barra) | PG `/caracterizacao/perfil` | presente / a confirmar | Confirmar campo de etapas no payload analítico | — | Etapas vêm de campo JSON array. |
| Organização da Oferta e Funcionamento | Modalidades ofertadas (barra) | PG `/caracterizacao/perfil` | presente / a confirmar | Idem | — | — |
| Organização da Oferta e Funcionamento | Distribuição por turnos (donut/barra) | PG `/caracterizacao/perfil` | presente / a confirmar | Confirmar mapeamento turnos | — | — |
| Organização da Oferta e Funcionamento | Média de turnos por porte (tabela) | PG | planejado | View/endpoint a criar/expor | Componente a criar | Item de backlog. |
| Infraestrutura Educacional | Presença de ambientes (barra %) | PG `vw_censo_ambientes` | **entregue (CAR-INFRA-01)** | `/caracterizacao/infraestrutura-educacional` | Bloco em `AbaCaracterizacao.tsx` | Aba Infraestrutura tem versão detalhada. |
| Infraestrutura Educacional | Cobertura de ambientes essenciais (KPI %) | PG `vw_censo_ambientes` | **entregue 1ª versão (CAR-INFRA-01)** | `/caracterizacao/infraestrutura-educacional` (lista oficial inicial) | KPIs + donut de faixas + modal informativo | Lista oficial inicial definida; refino futuro com produto. |
| Infraestrutura Educacional | Média de ambientes essenciais por porte (tabela) | PG | **entregue 1ª versão (CAR-INFRA-01)** | `/caracterizacao/infraestrutura-educacional` | Barra por porte | Usa `porte_escola_nome`/`porte_escola_cod`. |

### 5.2 Pessoal e Gestão Escolar

Blocos oficiais:
- **Estrutura de Gestão Escolar**
- **Coordenação Pedagógica**
- **Quadro de Pessoal**

Endpoints: `/v1/admin/analytics/pessoal-gestao/{estrutura,coordenacao,quadro-pessoal}` (views `0003_*`, `0004_*`, `0005_*`).

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Estrutura de Gestão Escolar | Composição da gestão escolar (% direção, vice-pedagógico, vice-administrativo, secretário, coord. pedagógico) | PG `/pessoal-gestao/estrutura` | presente | — | — | — |
| Estrutura de Gestão Escolar | Total de coordenadores pedagógicos (KPI) | PG `/pessoal-gestao/estrutura` | presente | — | — | — |
| Estrutura de Gestão Escolar | Escolas que declaram possuir funções/cargos de gestão (barra %) | PG `/pessoal-gestao/estrutura` | presente | — | — | Sobrepõe com "composição"; consolidar narrativa. |
| Coordenação Pedagógica | Coordenação por área (matemática, linguagem, humanas, natureza) — barra % | PG `/pessoal-gestao/coordenacao` | presente | — | — | View `0004_*`. |
| Coordenação Pedagógica | Cobertura média de coordenação (KPI) | PG `/pessoal-gestao/coordenacao` | presente | Confirmar definição (% médio de áreas cobertas por escola) | — | — |
| Coordenação Pedagógica | Áreas de coordenação declaradas (lista/tabela) | PG `/pessoal-gestao/coordenacao` | presente parcial | — | Confirmar render | — |
| Quadro de Pessoal | Professores efetivos (KPI total) | PG `/pessoal-gestao/quadro-pessoal` | presente | — | — | — |
| Quadro de Pessoal | Professores temporários (KPI total) | PG `/pessoal-gestao/quadro-pessoal` | presente | — | — | — |
| Quadro de Pessoal | Servidores administrativos (KPI total) | PG `/pessoal-gestao/quadro-pessoal` | presente | — | — | — |
| Quadro de Pessoal | Professores readaptados (KPI total) | PG `/pessoal-gestao/quadro-pessoal` | presente / a confirmar | Confirmar payload | — | — |
| Quadro de Pessoal | Efetivos x temporários (donut) | PG `/pessoal-gestao/quadro-pessoal` | presente | — | — | — |
| Quadro de Pessoal | Ranking por DRE (barra top-10) | PG `/pessoal-gestao/quadro-pessoal` | presente | — | — | Top 10 DREs por total de professores. |

### 5.3 Tecnologia e Equipamentos

Blocos oficiais (3):
- **Infraestrutura Digital**
- **Parque Tecnológico**
- **Uso Pedagógico**

Endpoints: `/v1/admin/analytics/tecnologia/{infraestrutura,uso-pedagogico}` (view `0006_*`).

> **Equivalência com o painel original (Data Studio/Looker Studio).** O painel original organizava o tema em dois blocos visuais — "Infraestrutura Digital e Capacidade Instalada" e "Uso Pedagógico e Adequação Tecnológica". A aplicação desdobrou o primeiro em dois blocos e manteve o segundo:
>
> - Data Studio: **Infraestrutura Digital e Capacidade Instalada** → Aplicação: **Infraestrutura Digital** + **Parque Tecnológico**.
> - Data Studio: **Uso Pedagógico e Adequação Tecnológica** → Aplicação: **Uso Pedagógico**.
>
> Os três blocos atuais da aplicação ficam **mantidos**. A matriz mínima abaixo preserva os gráficos que existiam no painel original, distribuídos pelos três blocos. Itens que hoje existem apenas como KPI percentual, mas que no Data Studio eram exibidos como distribuição, ficam classificados como **parcial** (e não "presente"), porque a referência mínima exige a distribuição.

A antiga seção "Infraestrutura Digital e Capacidade Instalada" do Data Studio foi desdobrada em "Infraestrutura Digital" e "Parque Tecnológico" na aplicação. A seção "Uso Pedagógico e Adequação Tecnológica" corresponde ao bloco "Uso Pedagógico".

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Infraestrutura Digital | Disponibilidade de internet — distribuição Sim/Não | PG `/tecnologia/infraestrutura` (`percentual_internet`, `escolas_com_internet`) | parcial | Endpoint só entrega KPI % e contagem; não há distribuição Sim/Não | Donut/barra Sim/Não a criar | Data Studio mostrava distribuição Sim/Não; hoje só KPI "Escolas com Internet" no resumo executivo. |
| Infraestrutura Digital | Provedor de internet | PG `/tecnologia/infraestrutura` (`por_provedor`) | presente | — | — | Donut renderizado. |
| Infraestrutura Digital | Qualidade da internet | PG `/tecnologia/infraestrutura` (`por_qualidade`) | presente | Confirmar normalização das opções | — | Donut renderizado. |
| Parque Tecnológico | Quantidade mediana de equipamentos por escola | PG | planejado | View/endpoint não calculam mediana (hoje só `SUM` por tipo) | Componente a criar | Data Studio exibia mediana por escola por tipo (chromebook, desktop alunos, desktop adm, notebook). Lacuna backend + frontend. |
| Parque Tecnológico | Distribuição do parque tecnológico (%) | PG `/tecnologia/infraestrutura` (totais por tipo) | planejado | Percentuais por tipo não calculados (só totais absolutos) | Gráfico de participação % a criar | Pode ser derivado dos totais já entregues; lacuna frontend (e backend se o % for calculado no servidor). |
| Parque Tecnológico | Totais por tipo de equipamento | PG `/tecnologia/infraestrutura` (`total_desktops_adm`, `total_desktops_alunos`, `total_notebooks`, `total_chromebooks`) | presente | — | — | KPIs renderizados (desktops adm/alunos, notebooks, chromebooks). |
| Parque Tecnológico | Computadores inoperantes (nº de escolas; % a confirmar) | PG `/tecnologia/infraestrutura` (`escolas_com_computadores_inoperantes`) | presente parcial | Número absoluto de escolas presente; percentual depende de denominador oficial (produto) | KPI % a criar se aprovado | Hoje só nº de escolas que declararam. Percentual = decisão de produto (denominador). |
| Uso Pedagógico | Equipamentos atendem à demanda — distribuição Sim/Parcialmente/Não | PG `/tecnologia/infraestrutura` (`percentual_computadores_atendem`) | parcial | Endpoint só entrega % de "Sim"; não há distribuição Sim/Parcialmente/Não | Donut/barra de distribuição a criar | Data Studio mostrava as três categorias. |
| Uso Pedagógico | Projetor multimídia — distribuição Sim/Não | PG `/tecnologia/uso-pedagogico` (`percentual_com_projetor`) | parcial | Endpoint só entrega KPI %; não há distribuição Sim/Não | Donut Sim/Não a criar | Data Studio mostrava distribuição Sim/Não. |
| Uso Pedagógico | Lousa digital — distribuição Sim/Não | PG `/tecnologia/uso-pedagogico` (`percentual_com_lousa_digital`) | parcial | Endpoint só entrega KPI %; não há distribuição Sim/Não | Donut Sim/Não a criar | Data Studio mostrava distribuição Sim/Não. |
| Uso Pedagógico | Quantidade média de projetores por escola | PG `/tecnologia/uso-pedagogico` (`total_projetores` + total de escolas) | planejado | Endpoint só entrega total de projetores e % com projetor; média por escola não exposta | KPI média a criar | Denominador (total de escolas do recorte) já disponível no backend; média pode ser calculada no servidor. |

### 5.4 Infraestrutura e Segurança

Blocos oficiais:
- **Condições Estruturais e Ambientes**
- **Energia, Climatização e Capacidade Elétrica**
- **Segurança Física e Patrimonial**

Endpoints atuais: `/v1/admin/analytics/infraestrutura/{condicoes,seguranca}` (views `0007_vw_censo_ambientes`, `0008_vw_censo_infraestrutura_seguranca`).

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Condições Estruturais e Ambientes | Tipo de prédio (donut) | PG `/infraestrutura/condicoes` | presente | — | — | — |
| Condições Estruturais e Ambientes | Situação estrutural (donut) | PG `/infraestrutura/condicoes` | presente | — | — | — |
| Condições Estruturais e Ambientes | Muro ou cerca (KPI %) | PG `/infraestrutura/condicoes` | presente | — | — | — |
| Condições Estruturais e Ambientes | Perímetro fechado (KPI %) | PG `/infraestrutura/condicoes` | presente / a confirmar | Confirmar campo | Confirmar render | — |
| Condições Estruturais e Ambientes | Ambientes mais presentes (barra %) | PG `/infraestrutura/condicoes` ou `vw_censo_ambientes` | presente | — | — | — |
| Condições Estruturais e Ambientes | Cobertura de ambientes essenciais (KPI %) | PG | planejado | Endpoint expondo % médio de essenciais por escola; definir "essenciais" | Componente a criar | Decisão de produto pendente: critério oficial de "essenciais". |
| Energia, Climatização e Capacidade Elétrica | Rede elétrica atende demanda (KPI %) | PG `/infraestrutura/condicoes` | presente / a confirmar | Confirmar campo no payload | Confirmar render | Possível lacuna se campo não foi exposto no endpoint. |
| Energia, Climatização e Capacidade Elétrica | Estrutura permite climatização (KPI %) | PG `/infraestrutura/condicoes` | presente / a confirmar | Confirmar campo | Confirmar render | — |
| Energia, Climatização e Capacidade Elétrica | Climatização das salas (KPI %) | PG `/infraestrutura/condicoes` | presente / a confirmar | Confirmar campo | Confirmar render | — |
| Segurança Física e Patrimonial | Guarita (KPI %) | PG `/infraestrutura/seguranca` | presente | — | — | — |
| Segurança Física e Patrimonial | Controle de portão (KPI %) | PG `/infraestrutura/seguranca` | presente | — | — | — |
| Segurança Física e Patrimonial | Iluminação externa (KPI %) | PG `/infraestrutura/seguranca` | presente | — | — | — |
| Segurança Física e Patrimonial | Botão de pânico (KPI %) | PG `/infraestrutura/seguranca` | presente | — | — | — |
| Segurança Física e Patrimonial | Câmeras (KPI %) | PG `/infraestrutura/seguranca` | presente | — | — | — |
| Segurança Física e Patrimonial | Plano de evacuação (KPI %) | PG `/infraestrutura/seguranca` | presente / a confirmar | Confirmar campo | Confirmar render | — |
| Segurança Física e Patrimonial | Política contra bullying (KPI %) | PG `/infraestrutura/seguranca` | presente / a confirmar | Confirmar campo | Confirmar render | — |

### 5.5 Merenda Escolar

Blocos oficiais:
- **Oferta e Adequação da Merenda**
- **Estrutura Física**
- **Equipamentos da Merenda**
- **Recursos Humanos**

Endpoints atuais: `/v1/admin/analytics/merenda/{oferta,equipamentos,recursos-humanos}` (views `0009_*`, `0010_*`).

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Oferta e Adequação da Merenda | Oferta regular da merenda (KPI %) | PG `/merenda/oferta` | presente | — | — | — |
| Oferta e Adequação da Merenda | Qualidade da merenda (donut) | PG `/merenda/oferta` | presente | — | — | — |
| Oferta e Adequação da Merenda | Merenda atende necessidades (KPI %) | PG `/merenda/oferta` | presente / a confirmar | Confirmar campo | Confirmar render | — |
| Estrutura Física | Condições da cozinha (donut) | PG `/merenda/oferta` ou novo endpoint | presente / a confirmar | Possível lacuna — confirmar se está em `/merenda/oferta` ou requer expansão | Confirmar render | Bloco "Estrutura Física" pode estar parcialmente coberto. |
| Estrutura Física | Possui refeitório (KPI %) | PG | presente / a confirmar | Confirmar campo | Confirmar render | — |
| Estrutura Física | Tamanho da cozinha (donut) | PG | planejado | Confirmar/expor campo | Componente a criar se faltar | — |
| Equipamentos da Merenda | Freezers (KPI total + média) | PG `/merenda/equipamentos` | presente | — | — | — |
| Equipamentos da Merenda | Geladeiras (KPI total + média) | PG `/merenda/equipamentos` | presente | — | — | — |
| Equipamentos da Merenda | Fogões (KPI total + média) | PG `/merenda/equipamentos` | presente | — | — | — |
| Equipamentos da Merenda | Fornos (KPI total + média) | PG `/merenda/equipamentos` | presente | — | — | — |
| Equipamentos da Merenda | Bebedouros (KPI total + média) | PG `/merenda/equipamentos` | presente | — | — | — |
| Equipamentos da Merenda | Estado de conservação (donut) | PG `/merenda/equipamentos` | presente / a confirmar | Confirmar campo | Confirmar render | Pode estar agregado por equipamento. |
| Recursos Humanos | Merendeiras estatutárias (KPI total) | PG `/merenda/recursos-humanos` | presente | — | — | — |
| Recursos Humanos | Merendeiras terceirizadas (KPI total) | PG `/merenda/recursos-humanos` | presente | — | — | — |
| Recursos Humanos | Merendeiras temporárias (KPI total) | PG `/merenda/recursos-humanos` | presente | — | — | — |
| Recursos Humanos | Supervisor de merenda (KPI %) | PG `/merenda/recursos-humanos` | presente | — | — | — |
| Recursos Humanos | Empresas terceirizadas da merenda (lista/tabela) | PG `/merenda/recursos-humanos` | presente / a confirmar | Confirmar agregação | Confirmar render | — |

### 5.6 Serviços Terceirizados

Blocos oficiais:
- **Visão Geral dos Serviços Terceirizados**
- **Serviços Gerais**
- **Portaria**
- **Governança / Supervisão**

Endpoints atuais: `/v1/admin/analytics/servicos-terceirizados/{visao-geral,servicos-gerais,portaria}` (views `0011_*`, `0012_*`).

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Visão Geral | Cobertura por área terceirizada (barra %) | PG `/servicos-terceirizados/visao-geral` | presente | — | — | — |
| Visão Geral | Quantidade de áreas terceirizadas por escola (histograma/donut) | PG `/servicos-terceirizados/visao-geral` | presente | — | — | — |
| Serviços Gerais | Efetivos (KPI total) | PG `/servicos-terceirizados/servicos-gerais` | presente | — | — | — |
| Serviços Gerais | Temporários (KPI total) | PG `/servicos-terceirizados/servicos-gerais` | presente | — | — | — |
| Serviços Gerais | Terceirizados (KPI total) | PG `/servicos-terceirizados/servicos-gerais` | presente | — | — | — |
| Serviços Gerais | Média total por escola (KPI) | PG `/servicos-terceirizados/servicos-gerais` | presente | — | — | — |
| Serviços Gerais | Distribuição por vínculo (donut) | PG `/servicos-terceirizados/servicos-gerais` | presente | — | — | — |
| Portaria | Escolas com agentes de portaria (KPI %) | PG `/servicos-terceirizados/portaria` | presente | — | — | — |
| Portaria | Média de agentes por escola (KPI) | PG `/servicos-terceirizados/portaria` | presente | — | — | — |
| Portaria | Top empresas de portaria (barra/tabela) | PG `/servicos-terceirizados/portaria` | presente | — | — | — |
| Governança / Supervisão | Supervisor por serviço (barra %) | PG | planejado | Endpoint dedicado (ex. `/servicos-terceirizados/governanca`) ou expansão do `visao-geral` | Componente a criar | Bloco ainda não tem endpoint próprio. |
| Governança / Supervisão | Avaliação da supervisão (donut) | PG | planejado | Confirmar campos no JSONB; expor endpoint | Componente a criar | Decisão de produto pendente: escala oficial de avaliação. |
| Governança / Supervisão | Avaliação dos serviços (donut) | PG | planejado | Idem | Componente a criar | Idem. |

### 5.7 Perfil dos Alunos e Resultados

**Status:** implementação atual/legada mantida — consome `/v1/admin/indicadores-metrics` (Google Sheets). Remodelagem futura, provavelmente sobre **outra planilha** (não o banco do censo). **Fora desta rodada.**

Blocos futuros sugeridos (referência, não compromisso):
- Perfil Socioeducacional e Permanência
- Resultados e Desempenho

| Bloco (futuro) | Gráficos sugeridos | Fonte futura provável | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Perfil Socioeducacional e Permanência | Perfil socioeconômico, risco de fluxo, abandono por faixa, top DREs em abandono | Planilha externa a definir | futuro | Definir fonte e endpoint dedicados | Remodelar `AbaPerfilAlunos.tsx` | A definição da fonte é decisão de produto pendente. |
| Resultados e Desempenho | Aprovação, reprovação, IDEB, resultados externos | Planilha externa a definir | futuro | Idem | Idem | Idem. |

Hoje, a aba renderiza:
- KPI "Escolas com Risco de Fluxo";
- gráfico "por faixa de beneficiários";
- gráfico "por faixa de abandono";
- gráfico "top DREs em abandono".

A renderização atual permanece inalterada — qualquer mudança vem em **rodada futura**.

### 5.8 Gestão Financeira e Governança

**Status:** placeholder institucional. **Sem fetch, sem endpoint, sem view SQL, sem dado fake.** Renderiza apenas `EmptyStatePlaceholder` com seções nomeadas.

Blocos futuros sugeridos (referência, não compromisso):
- Governança Institucional e Regularização
- Execução Financeira e Prestação de Contas
- Participação Comunitária e Risco de Governança

| Bloco (futuro) | Gráficos sugeridos | Fonte futura provável | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Governança Institucional e Regularização | CNPJ válido, estatuto atualizado, conselhos ativos | Base externa das coordenações | futuro | Definir fonte (não é o banco do censo) | Remodelar `AbaGestaoFinanceiraGovernanca.tsx` | Decisão de produto pendente: qual base e quem é o "dono". |
| Execução Financeira e Prestação de Contas | Recursos recebidos, executados, % prestado de contas, prazos | Base externa | futuro | Idem | Idem | Idem. |
| Participação Comunitária e Risco de Governança | Frequência de reuniões, % escolas com conselho ativo, indicador composto de risco | Base externa | futuro | Idem | Idem | Idem. |

A aba **não deve consumir o banco PostgreSQL do censo** nesta rodada. Qualquer tentativa de "preencher" essa aba com dados do censo conflita com decisão de produto.

---

## 6. Abas operacionais

As abas a seguir são intencionalmente **fora da matriz analítica** — servem operação/gestão, não caracterização da rede:

| Aba | Conteúdo | Fonte | Componente React |
|---|---|---|---|
| Operacional | KPIs de progresso do censo (preenchimento, taxa de conclusão, andamento por DRE) | PG `/v1/admin/dashboard` | `AbaOperacional.tsx` |
| Todos os Censos | Listagem paginada de censos com filtro/busca, modal "ver JSON" | PG `/v1/admin/census` | `AbaTodosCensos.tsx` |
| Por DRE | Visão tabular por DRE (totais e progresso) | PG `/v1/admin/dashboard.by_dre` | `AbaPorDre.tsx` |

Estas abas **não recebem alteração nesta rodada**. Aparecem aqui para que a leitura do `/admin` seja completa.

---

## 7. Lacunas consolidadas

### 7.1 Lacunas de backend

Itens identificados na matriz como `planejado` ou `presente / a confirmar`. Não são compromisso imediato de PR — entram em backlog para a próxima rodada de validação com as áreas finalísticas.

- **Caracterização — Infraestrutura Educacional:** **entregue (CAR-INFRA-01)** — endpoint `/caracterizacao/infraestrutura-educacional` em produção com lista oficial inicial de ambientes essenciais. Resta apenas refino futuro da lista com produto (não bloqueante).
- **Caracterização — Organização da Oferta:** confirmar exposição de etapas, modalidades, turnos no payload analítico atual ou criar recorte específico para a aba Caracterização.
- **Infraestrutura — Energia/Climatização:** confirmar se `0008_vw_censo_infraestrutura_seguranca` expõe os campos `rede_eletrica_atende_demanda`, `estrutura_permite_climatizacao`, `climatizacao_salas` — caso contrário, expandir view/endpoint.
- **Merenda — Estrutura Física:** confirmar se `condicoes_cozinha`, `possui_refeitorio`, `tamanho_cozinha` estão no payload atual ou requerem extensão.
- **Serviços Terceirizados — Governança/Supervisão:** sem endpoint dedicado hoje. Avaliar criação de `/v1/admin/analytics/servicos-terceirizados/governanca` cobrindo presença de supervisor por serviço, avaliação da supervisão e avaliação dos serviços.
- **Tecnologia — Parque Tecnológico:** gráficos mínimos do Data Studio ainda não totalmente refletidos — falta **mediana de equipamentos por escola** (hoje só `SUM` por tipo) e **distribuição do parque tecnológico (%)** por tipo. Prioridade média/alta.
- **Tecnologia — Uso Pedagógico:** indicadores existem como KPIs, mas faltam as **distribuições Sim/Não** (projetor, lousa) e **Sim/Parcialmente/Não** (equipamentos atendem à demanda), além da **média de projetores por escola**. Prioridade média/alta.
- **Tecnologia — Infraestrutura Digital:** "Disponibilidade de internet" hoje só como KPI %; o Data Studio exibia distribuição Sim/Não — backend não entrega a distribuição.
- **Total de alunos com decimais (legado):** documentado em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) §8; correção retroativa fora desta rodada.

### 7.2 Lacunas de frontend

- **Tecnologia e Equipamentos:** renderizar as distribuições/medianas mínimas do Data Studio (donuts Sim/Não de internet, projetor e lousa; Sim/Parcialmente/Não de "atendem à demanda"; distribuição (%) do parque; mediana e média de projetores) assim que o backend expuser o payload — ver §5.3.
- **Confirmações pontuais ("presente / a confirmar"):** auditar visualmente cada Aba\*.tsx para confirmar render dos campos sinalizados na §5.
- **Subabas como navegação interna:** não implementar nesta rodada. Hoje os blocos são seções verticais — manter assim até a matriz mínima ser validada.
- **Sem gráficos inéditos** (fora do escopo do painel original) nas 5 abas temáticas integradas antes da validação com as áreas finalísticas. Gráficos mínimos do Data Studio ainda não refletidos (caso de Tecnologia) são exceção e podem ser implementados após diagnóstico técnico.

> Caracterização — Infraestrutura Educacional **não consta mais** como lacuna de frontend: o bloco sintético de presença de ambientes, os KPIs de cobertura de essenciais e a média por porte já foram entregues em CAR-INFRA-01.

### 7.3 Lacunas de decisão de produto

- **Lista de "ambientes essenciais":** a lista oficial **inicial** já foi definida e entregue em CAR-INFRA-01 (Caracterização). Não é mais decisão bloqueante; resta apenas **refino futuro** com produto, que também alimentaria o indicador correlato na aba Infraestrutura e Segurança (§5.4, ainda `planejado`).
- **Denominador oficial do percentual de computadores inoperantes** (Tecnologia — Parque Tecnológico).
- **Escala oficial de avaliação** para Governança/Supervisão de Serviços Terceirizados.
- **Fonte de dados futura para Perfil dos Alunos e Resultados** (planilha própria a indicar).
- **Fonte de dados futura para Gestão Financeira e Governança** (base externa das coordenações responsáveis).
- **Critério oficial de "porte"** já consta em `vw_censo_enriquecida`, mas deve ser revalidado quando a matriz for revisada com SEDUC.

---

## 8. Próximas frentes recomendadas

Encadeamento sugerido (sem antecipar PR antes da validação com áreas finalísticas):

1. **Validar a matriz mínima** desta rodada com as áreas finalísticas da SEDUC (Caracterização, Pessoal, Tecnologia, Infraestrutura, Merenda, Serviços). Resultado esperado: confirmar / cortar / adicionar gráficos.
2. **Auditoria visual** de cada Aba\*.tsx contra a §5 para fechar os itens "presente / a confirmar" — preencher status real e abrir issues para lacunas confirmadas.
3. **Expansão backend pontual** para os itens marcados `planejado` em §7.1, **um endpoint por PR**, com validação numérica documentada.
4. **Reorganização interna do frontend em blocos oficiais** — agrupamento visual (subheaders + dividers) por bloco dentro de cada aba, sem introduzir navegação por subabas. PR de UI apenas.
5. **Planejar separadamente** as remodelagens futuras de "Perfil dos Alunos" e "Gestão Financeira e Governança" com bases externas validadas pelas coordenações — fora do banco do censo.
6. **Revisar `guia_views_analiticas_baseado_repositorio_censo.md`** marcando seções que conflitam com esta matriz como histórico/preliminar. Em caso de conflito, esta matriz prevalece.
