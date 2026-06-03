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
7. As **5 abas temáticas já integradas em primeira versão** (Pessoal e Gestão Escolar, Tecnologia e Equipamentos, Infraestrutura e Segurança, Merenda Escolar, Serviços Terceirizados) **não devem receber gráficos inéditos** (fora do escopo do painel original) antes desta matriz mínima ser validada com as áreas finalísticas da SEDUC. **Exceção:** gráficos mínimos que já existiam no painel original (Data Studio/Looker Studio) e ainda não estão refletidos na aplicação podem ser **documentados como lacunas** nesta matriz e **implementados após diagnóstico técnico**, mesmo antes da validação — eles não são novidade de escopo, e sim recuperação da referência mínima. O caso de Tecnologia e Equipamentos (ver §5.3) foi o primeiro a seguir esse caminho; **Merenda Escolar (ver §5.5) é o segundo**, alinhado neste PR documental.
8. **Recursos Humanos da Merenda (merendeiras/manipuladores de alimentos) sai da aba Merenda Escolar como bloco finalístico.** O Data Studio mantinha uma subaba "Recursos Humanos" dentro de Merenda; por decisão de produto, esses indicadores (total de merendeiras por vínculo, adequação do quantitativo, avaliação do serviço, média por escola, empresas e supervisão) passam a ser **enquadrados conceitualmente no menu "Serviços Terceirizados"**, em bloco próprio de **"Manipuladores de Alimentos / Merendeiras"**, junto de Serviços Gerais e Portaria. Esta rodada **apenas documenta** a decisão e a lacuna — **não remove código**. O bloco RH hoje renderizado em `AbaMerenda.tsx` permanece intacto até a rodada de remodelagem de Serviços Terceirizados.

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
| Merenda Escolar | Integrada (1ª versão) | PostgreSQL | Oferta e Adequação da Merenda · Estrutura Física · Equipamentos da Merenda · Condições Sanitárias e Segurança | Endpoints `/merenda/*`. Blocos oficiais realinhados aos gráficos mínimos do Data Studio (ver §5.5). Os quatro blocos finalísticos estão entregues (MER-01A/B/C); "Condições Sanitárias e Segurança" foi entregue em MER-01C via `/merenda/condicoes-sanitarias`. **Recursos Humanos / merendeiras migra conceitualmente para Serviços Terceirizados** (§2.8), não é mais bloco finalístico de Merenda. |
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
| Infraestrutura Digital | Disponibilidade de internet — distribuição Sim/Não | PG `/tecnologia/infraestrutura` (`disponibilidade_internet`) | **entregue** | — | — | Donut Sim/Não renderizado; "Não" inclui não informado (booleano da view). |
| Infraestrutura Digital | Provedor de internet | PG `/tecnologia/infraestrutura` (`por_provedor`) | presente | — | — | Donut renderizado. |
| Infraestrutura Digital | Qualidade da internet | PG `/tecnologia/infraestrutura` (`por_qualidade`) | presente | Confirmar normalização das opções | — | Donut renderizado. |
| Parque Tecnológico | Quantidade média de equipamentos por escola | PG `/tecnologia/infraestrutura` (`media_equipamentos_por_escola`) | **entregue** | — | — | `AVG(COALESCE(campo,0))` por tipo (total declarado ÷ nº de escolas). Substituiu a mediana, que ficava 0 para equipamentos concentrados numa minoria de escolas (ex.: Desktops de alunos). Barra horizontal renderizada. |
| Parque Tecnológico | Distribuição do parque tecnológico (%) | PG `/tecnologia/infraestrutura` (totais por tipo) | **entregue** | — | — | Participação % calculada no frontend a partir dos totais; donut renderizado. |
| Parque Tecnológico | Totais por tipo de equipamento | PG `/tecnologia/infraestrutura` (`total_desktops_adm`, `total_desktops_alunos`, `total_notebooks`, `total_chromebooks`) | presente | — | — | KPIs renderizados (desktops adm/alunos, notebooks, chromebooks). |
| Parque Tecnológico | Computadores inoperantes (nº de escolas e total absoluto) | PG `/tecnologia/infraestrutura` (`escolas_com_computadores_inoperantes`, `total_computadores_inoperantes`) | **entregue** | — | — | Nº de escolas + total absoluto (SUM) renderizados como KPI. |
| Parque Tecnológico | Computadores inoperantes (KPI %) | PG | pendente/produto | Percentual depende de denominador oficial (produto) | KPI % a criar após decisão | Decisão de produto pendente (denominador). |
| Uso Pedagógico | Equipamentos atendem à demanda — distribuição Sim/Parcialmente/Não | PG `/tecnologia/uso-pedagogico` (`computadores_atendem_demanda`) | **entregue** | — | — | Distribuição categórica (com "Não informado") renderizada como donut. |
| Uso Pedagógico | Projetor multimídia — distribuição Sim/Não | PG `/tecnologia/uso-pedagogico` (`possui_projetor_dist`) | **entregue** | — | — | Donut Sim/Não renderizado; "Não" inclui não informado. |
| Uso Pedagógico | Lousa digital — distribuição Sim/Não | PG `/tecnologia/uso-pedagogico` (`possui_lousa_digital_dist`) | **entregue** | — | — | Donut Sim/Não renderizado; "Não" inclui não informado. |
| Uso Pedagógico | Quantidade média de projetores por escola | PG `/tecnologia/uso-pedagogico` (`media_projetores_por_escola`) | **entregue** | — | — | `AVG(COALESCE(qtd_projetores,0))`; KPI renderizado. |

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

Blocos oficiais (4), realinhados aos gráficos mínimos do painel original do Data Studio/Looker Studio:
- **Oferta e Adequação da Merenda**
- **Estrutura Física**
- **Equipamentos da Merenda**
- **Condições Sanitárias e Segurança**

Endpoints atuais: `/v1/admin/analytics/merenda/{oferta,equipamentos,condicoes-sanitarias,recursos-humanos}` (views `0009_vw_censo_equipamentos_merenda`, `0010_vw_censo_rh_merendeiras`).

> **Nota sobre Recursos Humanos / merendeiras.** O painel original do Data Studio mantinha em Merenda uma subaba **"Recursos Humanos"** (total de merendeiras por vínculo, adequação do quantitativo, avaliação do serviço, média por escola, empresas e supervisão). Por decisão de produto (§2.8), esse bloco **deixa de ser bloco finalístico da aba Merenda** e **migra conceitualmente para o menu "Serviços Terceirizados"**, como bloco **"Manipuladores de Alimentos / Merendeiras"**, ao lado de Serviços Gerais e Portaria. Por isso ele **não aparece** na lista de blocos oficiais acima nem na matriz mínima abaixo. O endpoint `/v1/admin/analytics/merenda/recursos-humanos` e o bloco RH hoje renderizados em `AbaMerenda.tsx` **permanecem intactos** — esta rodada é só documental. A migração efetiva será planejada em rodada própria de Serviços Terceirizados.
>
> **Equivalência com o painel original (Data Studio).** O Data Studio organizava Merenda em: Oferta e Adequação · Estrutura Física · Equipamentos · Condições Sanitárias e Segurança · Recursos Humanos. A aplicação preserva os quatro primeiros como blocos finalísticos e reencaminha o quinto (RH) para Serviços Terceirizados. Indicadores que hoje existem só como KPI percentual, mas que no Data Studio eram exibidos como distribuição, ficam classificados como **parcial** (não "presente"), porque a referência mínima exige a distribuição.

| Bloco | Gráficos mínimos | Fonte atual | Status | Lacuna backend | Lacuna frontend | Observações |
|---|---|---|---|---|---|---|
| Oferta e Adequação da Merenda | Oferta regular da merenda | PG `/merenda/oferta` (`dist_oferta_regular`) | presente | — | — | Donut renderizado. |
| Oferta e Adequação da Merenda | Qualidade da merenda | PG `/merenda/oferta` (`dist_qualidade`) | presente | — | — | Barra renderizada. |
| Oferta e Adequação da Merenda | Merenda atende necessidades — distribuição Sim/Parcialmente/Não | PG `/merenda/oferta` (`dist_atende_necessidades`) | presente (MER-01A) | — | — | Donut renderizado; KPI `pct_atende_necessidades` mantido. Campo `atende_necessidades` em `vw_censo_rh_merendeiras`. |
| Estrutura Física | Condições da cozinha | PG `/merenda/oferta` (`dist_condicoes_cozinha`) | presente | — | — | Barra renderizada em `sec-merenda-estrutura`. |
| Estrutura Física | Possui refeitório — distribuição Sim/Não | PG `/merenda/oferta` (`dist_possui_refeitorio`) | presente (MER-01A) | — | — | Donut renderizado; KPI `pct_possui_refeitorio` mantido. Campo em `vw_censo_equipamentos_merenda`. |
| Estrutura Física | Tamanho da cozinha | PG `/merenda/oferta` (`dist_tamanho_cozinha`) | presente (MER-01A) | — | — | HBar renderizada. `vw_censo_equipamentos_merenda.tamanho_cozinha`. |
| Estrutura Física | Refeitório atende adequadamente | PG `/merenda/oferta` (`dist_refeitorio_adequado`) | presente (MER-01A) | — | — | HBar renderizada. `vw_censo_equipamentos_merenda.refeitorio_adequado`. |
| Equipamentos da Merenda | Totais por equipamento (freezers, geladeiras, fogões, fornos, bebedouros) | PG `/merenda/equipamentos` | presente | — | — | 5 KPIs (total) renderizados. |
| Equipamentos da Merenda | Média por equipamento por escola | PG `/merenda/equipamentos` (`media_por_escola`) | presente | — | — | Exibida em cada `EquipCard`. |
| Equipamentos da Merenda | Presença de equipamentos por tipo (% de escolas que possuem) | PG `/merenda/equipamentos` (`presenca_por_tipo`) | presente (MER-01B) | — | — | `COUNT(DISTINCT school_id) FILTER (qtd_* > 0)` por tipo; HBar renderizada (critério "possui = qtd > 0"). |
| Equipamentos da Merenda | Escolas com 1, 2 ou 3+ tipos (distribuição) | PG `/merenda/equipamentos` (`faixas_qtd_tipos`) | presente (MER-01B) | — | — | Faixas cumulativas por nº de **tipos** presentes (1+/2+/3+); HBar renderizada. Interpretação A (nº de tipos) definida em MER-01B. |
| Equipamentos da Merenda | Estado de conservação consolidado | PG `/merenda/equipamentos` (`estado_consolidado`) | presente (MER-01B) | — | — | Agrupado em Bom/Regular/Ruim-Inoperante por equipamento; tabela compacta renderizada acima da tabela detalhada (`dist_estados` mantida). |
| Equipamentos da Merenda | Criticidade por equipamento | PG `/merenda/equipamentos` (`criticidade_por_equipamento`) | presente (MER-01B) | — | — | % de escolas com estado ruim/inoperante por equipamento (denominador = escolas com estado informado); HBar com destaque renderizada. |
| Condições Sanitárias e Segurança | Despensa exclusiva para gêneros alimentícios | PG `/merenda/condicoes-sanitarias` (`dist_despensa_exclusiva`) | presente (MER-01C) | — | — | Donut renderizado em `sec-merenda-sanitarias`; campo `despensa_exclusiva` em `vw_censo_equipamentos_merenda`. |
| Condições Sanitárias e Segurança | Depósito conserva adequadamente os alimentos | PG `/merenda/condicoes-sanitarias` (`dist_deposito_conserva`) | presente (MER-01C) | — | — | Donut renderizado. `deposito_conserva`. |
| Condições Sanitárias e Segurança | Presença de itens básicos (despensa exclusiva, exaustão, bancadas inox) | PG `/merenda/condicoes-sanitarias` (`presenca_itens_basicos`) | presente (MER-01C) | — | — | HBar renderizada; denominador = escolas concluídas no recorte. `despensa_exclusiva`, `sistema_exaustao`, `bancadas_inox`. |
| Condições Sanitárias e Segurança | Estoque de EPIs e extintor de incêndio | PG `/merenda/condicoes-sanitarias` (`dist_estoque_epi_extintor`) | presente (MER-01C) | — | — | HBar renderizada. `estoque_epi_extintor`. |
| Condições Sanitárias e Segurança | Recarga/manutenção dos extintores | PG `/merenda/condicoes-sanitarias` (`dist_manutencao_extintores`) | presente (MER-01C) | — | — | HBar renderizada. `manutencao_extintores`. |

**Recursos Humanos (fora da matriz finalística da aba Merenda).** Os indicadores de RH/merendeiras — total de merendeiras estatutárias/terceirizadas/temporárias, adequação do quantitativo, avaliação do serviço, média por escola, empresas e supervisão — **não compõem mais a matriz mínima de Merenda Escolar**. Eles serão tratados em rodada própria no menu **Serviços Terceirizados**, como bloco **"Manipuladores de Alimentos / Merendeiras"** (§2.8 e §5.6). O endpoint `/merenda/recursos-humanos` e o bloco `sec-merenda-rh` permanecem ativos até essa migração — sem remoção nesta rodada.

### 5.6 Serviços Terceirizados

Blocos oficiais:
- **Visão Geral dos Serviços Terceirizados**
- **Serviços Gerais**
- **Portaria**
- **Governança / Supervisão**

Endpoints atuais: `/v1/admin/analytics/servicos-terceirizados/{visao-geral,servicos-gerais,portaria}` (views `0011_*`, `0012_*`).

> **Bloco futuro — Manipuladores de Alimentos / Merendeiras.** Por decisão de produto (§2.8), os indicadores de RH de merendeiras hoje na aba Merenda (vínculo, adequação do quantitativo, avaliação, média por escola, empresas, supervisão) serão **enquadrados aqui** em rodada própria, como bloco análogo a Serviços Gerais e Portaria. A fonte provável é `vw_censo_rh_merendeiras` (já existente, hoje consumida por `/merenda/recursos-humanos`). Esta rodada **não cria** o bloco — apenas registra a intenção e a origem dos dados.

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
- **Merenda — Estrutura Física:** ✅ **MER-01A entregue.** `/merenda/oferta` expõe `dist_possui_refeitorio`, `dist_tamanho_cozinha` e `dist_refeitorio_adequado` (além de `dist_condicoes_cozinha`). Distribuições renderizadas em `sec-merenda-estrutura`; KPI `pct_possui_refeitorio` mantido.
- **Merenda — Oferta atende necessidades:** ✅ **MER-01A entregue.** `/merenda/oferta` expõe `dist_atende_necessidades` (distribuição completa Sim/Parcialmente/Não, de `vw_censo_rh_merendeiras`); donut renderizado em `sec-merenda-oferta`; KPI `pct_atende_necessidades` mantido.
- **Merenda — Equipamentos:** ✅ **MER-01B entregue.** Além de totais e média por escola, `/merenda/equipamentos` passa a expor `presenca_por_tipo`, `faixas_qtd_tipos` (1+/2+/3+ tipos), `estado_consolidado` (Bom/Regular/Ruim-Inoperante), `media_por_tipo` e `criticidade_por_equipamento`; gráficos sintéticos renderizados em `sec-merenda-equipamentos` (HBars + tabela consolidada), preservando os 5 cards e a tabela detalhada.
- **Merenda — Condições Sanitárias e Segurança:** ✅ **MER-01C entregue.** Endpoint dedicado `/v1/admin/analytics/merenda/condicoes-sanitarias` (payload `MerendaCondicoesSanitarias`) expõe `dist_despensa_exclusiva`, `dist_deposito_conserva`, `presenca_itens_basicos` (despensa exclusiva, sistema de exaustão, bancadas de inox), `dist_estoque_epi_extintor` e `dist_manutencao_extintores`, sobre `vw_censo_equipamentos_merenda`; bloco renderizado em `sec-merenda-sanitarias`. Sem nova view/migration. Pendente apenas: migração de RH/Merendeiras.
- **Merenda — Recursos Humanos:** **migra conceitualmente para Serviços Terceirizados** (§2.8). Não é mais lacuna de Merenda; o endpoint `/merenda/recursos-humanos` permanece até a rodada de remodelagem de Serviços Terceirizados.
- **Serviços Terceirizados — Governança/Supervisão:** sem endpoint dedicado hoje. Avaliar criação de `/v1/admin/analytics/servicos-terceirizados/governanca` cobrindo presença de supervisor por serviço, avaliação da supervisão e avaliação dos serviços.
- **Tecnologia — Parque Tecnológico:** **entregue** — **média de equipamentos por escola** e **distribuição do parque tecnológico (%)** por tipo renderizadas; **total de computadores inoperantes** exposto. O **percentual de computadores inoperantes permanece pendente** por depender de denominador oficial (produto).
- **Tecnologia — Uso Pedagógico:** **entregue** — **distribuições Sim/Não** (projetor, lousa), **Sim/Parcialmente/Não** (equipamentos atendem à demanda) e **média de projetores por escola** (entregue).
- **Tecnologia — Infraestrutura Digital:** **entregue** — "Disponibilidade de internet" agora com **distribuição Sim/Não**, além do KPI %.
- **Total de alunos com decimais (legado):** documentado em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) §8; correção retroativa fora desta rodada.

### 7.2 Lacunas de frontend

- **Tecnologia e Equipamentos:** **entregue** — renderizadas as distribuições/médias mínimas do Data Studio (donuts Sim/Não de internet, projetor e lousa; Sim/Parcialmente/Não de "atendem à demanda"; distribuição (%) do parque; média de equipamentos por escola e média de projetores) — ver §5.3.
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
