# Auditoria de Lacunas Backend/Frontend por Bloco — Dashboard Admin

## 1. Objetivo

Comparar a matriz oficial de abas, blocos e gráficos do `/admin` com o estado real do código, endpoints e views SQL, identificando lacunas por bloco e recomendando a próxima frente responsável.

Esta auditoria é documental. Não implementa frontend, backend, endpoints, migrations ou componentes React.

## Relação com a especificação técnica por gráfico

Este documento identifica e prioriza as lacunas por aba/bloco. Para orientar a implementação, foi criado o documento complementar:

`docs/dashboard/especificacao-entrega-dados-por-grafico.md`

Nele, cada gráfico pendente ou parcial é detalhado em termos de origem do dado, tratamento necessário, view SQL, endpoint, payload esperado, frontend e dependências de produto.

## 2. Fontes analisadas

Fontes normativas e históricas:

- `docs/dashboard/matriz-abas-e-graficos.md`
- `docs/dashboard/plano-trabalho-paralelo.md`
- `docs/dashboard/frente-1-pessoal-tecnologia.md`
- `docs/dashboard/frente-2-infra-merenda-servicos.md`
- `docs/dashboard/frente-3-frontend-qualidade.md`
- `docs/guia_views_analiticas_baseado_repositorio_censo.md`

Frontend:

- `web/src/app/admin/page.tsx`
- `web/src/components/admin/AbaCaracterizacao.tsx`
- `web/src/components/admin/AbaPessoalGestao.tsx`
- `web/src/components/admin/AbaTecnologia.tsx`
- `web/src/components/admin/AbaInfraestruturaSeguranca.tsx`
- `web/src/components/admin/AbaMerenda.tsx`
- `web/src/components/admin/AbaServicosTerceirizados.tsx`
- `web/src/components/admin/AbaPerfilAlunos.tsx`
- `web/src/components/admin/AbaGestaoFinanceiraGovernanca.tsx`
- `web/src/components/admin/shared/types.ts`

Backend e banco:

- `api/cmd/api/main.go`
- `api/cmd/api/analytics.go`
- `api/cmd/api/analytics_pessoal_tecnologia.go`
- `api/cmd/api/analytics_infra_merenda_servicos.go`
- `infra/migrations/0001_vw_censo_base.sql` a `infra/migrations/0013_performance_indexes.sql`

Observação metodológica: a auditoria foi feita por leitura estática do código e das migrations. Não houve execução dos endpoints contra banco local/homologação nesta rodada.

## 3. Resumo executivo

| Prioridade | Aba | Bloco | Lacuna principal | Tipo | Próxima ação |
|---|---|---|---|---|---|
| Alta | Caracterização da Rede | Organização da Oferta e Funcionamento | Menu/anchor existem, mas o bloco está vazio e `/caracterizacao/perfil` não entrega etapas, modalidades ou turnos. | Backend + Frontend | Criar recorte analítico recomendado `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento` e renderizar o bloco. |
| ~~Alta~~ Entregue (1ª versão) | Caracterização da Rede | Infraestrutura Educacional | Endpoint `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional` entregue, consumindo `vw_censo_ambientes` + `vw_censo_enriquecida`. Lista oficial inicial de essenciais definida (CAR-INFRA-01). Bloco renderizado em `AbaCaracterizacao.tsx`. | — | Entregue. Refino futuro: revisar lista de essenciais com a área de produto. |
| Alta | Infraestrutura e Segurança | Energia, Climatização e Capacidade Elétrica | Bloco existe como empty state; campos existem em views, mas não são expostos nos endpoints nem renderizados. | Backend + Frontend | Expandir endpoint ou criar endpoint dedicado e substituir empty state por KPIs/gráficos. |
| Alta | Serviços Terceirizados | Governança / Supervisão | Bloco existe como empty state; views já têm campos de supervisor/avaliação, mas não há endpoint nem frontend. | Backend + Frontend | Criar `GET /v1/admin/analytics/servicos-terceirizados/governanca` após validar escala de avaliação. |
| ~~Média/Alta~~ ✅ MER-01C | Merenda Escolar | Condições Sanitárias e Segurança | `dist_despensa_exclusiva`, `dist_deposito_conserva`, `presenca_itens_basicos` (despensa exclusiva, sistema de exaustão, bancadas de inox), `dist_estoque_epi_extintor` e `dist_manutencao_extintores` expostos em `/merenda/condicoes-sanitarias` (view `vw_censo_equipamentos_merenda`) e renderizados em `sec-merenda-sanitarias`. | Entregue | — |
| ~~Média/Alta~~ ✅ MER-01B | Merenda Escolar | Equipamentos da Merenda | `presenca_por_tipo`, `faixas_qtd_tipos` (1+/2+/3+ tipos), `estado_consolidado` (Bom/Regular/Ruim-Inoperante), `media_por_tipo` e `criticidade_por_equipamento` expostos em `/merenda/equipamentos` e renderizados; cards e tabela detalhada mantidos. | Entregue | — |
| ~~Média~~ ✅ MER-01A | Merenda Escolar | Estrutura Física | `dist_tamanho_cozinha`, `dist_refeitorio_adequado` e `dist_possui_refeitorio` expostos em `/merenda/oferta` e renderizados; KPI `pct_possui_refeitorio` mantido. | Entregue | — |
| ~~Média~~ ✅ MER-01A | Merenda Escolar | Oferta e Adequação da Merenda | `dist_atende_necessidades` (Sim/Parcialmente/Não) exposto e renderizado como donut; KPI `pct_atende_necessidades` mantido. | Entregue | — |
| Migração | Merenda Escolar | Recursos Humanos | Bloco RH de merendeiras deixa de ser finalístico de Merenda; migra conceitualmente para Serviços Terceirizados (Manipuladores de Alimentos / Merendeiras). | Produto / reorganização | Planejar em rodada própria de Serviços Terceirizados; manter `/merenda/recursos-humanos` ativo até lá. |
| Média | Caracterização da Rede | Dimensão e Perfil da Rede | Conteúdo principal existe, mas a tabela Detalhamento por DRE aparece depois dos anchors vazios de Oferta/Infra, não dentro do bloco correto. | Frontend | Reorganizar a posição/ancoragem da tabela sem mudar backend. |
| Média | Pessoal e Gestão Escolar | Coordenação Pedagógica | Gráfico e KPI existem; a lista/tabela de áreas declaradas não existe separadamente. | Frontend | Decidir se o gráfico atual substitui a lista; se não, adicionar tabela simples. |
| Produto | Tecnologia e Equipamentos | Parque Tecnológico | Gráficos mínimos do Data Studio entregues em `feat/tecnologia-graficos-minimos-datastudio` (média por tipo, distribuição do parque %, total absoluto de inoperantes, distribuições Sim/Não e Sim/Parcialmente/Não, média de projetores). Resta apenas o **percentual** de computadores inoperantes, dependente de denominador oficial. | Produto | Definir denominador do percentual de inoperantes; depois renderizar o KPI. |
| Média/Alta | Tecnologia e Equipamentos | Uso Pedagógico | Indicadores existem como KPIs, mas faltam distribuições Sim/Não (projetor, lousa) ou Sim/Parcialmente/Não (atendem à demanda) e média de projetores por escola. | Backend + Frontend | Expor distribuições e média de projetores; renderizar donuts/KPI. |
| Baixa | Perfil dos Alunos e Resultados | Aba futura/externa | Implementação atual/legada por Google Sheets mantida. | Histórico/legado | Não incluir na rodada PostgreSQL do formulário. |
| Baixa | Gestão Financeira e Governança | Aba futura/externa | Placeholder institucional sem fetch, endpoint ou view. | Fonte externa | Aguardar fonte validada pelas coordenações responsáveis. |

## 4. Convenções de classificação

Tipos:

- Sem lacuna: item existe no menu/anchor, frontend, backend/payload e view/campo.
- Frontend: dados já existem ou não exigem backend novo, mas a UI precisa reorganizar/renderizar.
- Backend: view/campo ou endpoint/payload ausente, sem mudança relevante de UI além do consumo.
- Backend + Frontend: exige exposição de dados e renderização.
- Produto: depende de decisão de escopo, semântica, lista oficial, fonte ou escala.
- Fonte externa: depende de base fora do PostgreSQL do formulário do censo.
- Histórico/legado: implementação mantida por decisão de produto, sem migração nesta rodada.

Status:

- Completo: cobre a matriz mínima no estado atual.
- Parcial: existe parte relevante, mas há lacuna de organização, payload ou gráfico.
- Vazio: anchor/bloco existe sem conteúdo analítico.
- Planejado: previsto pela matriz, sem implementação nesta rodada.
- Fora de escopo: não pertence à rodada analítica PostgreSQL do formulário.

## 5. B1 — Caracterização da Rede

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Dimensão e Perfil da Rede | Total de escolas | Menu e `sec-perfil-dimensao` OK | KPI renderizado | `/caracterizacao/perfil` entrega `kpis.total_escolas` | `vw_censo_enriquecida.school_id` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Total de alunos | Menu e anchor OK | KPI renderizado com arredondamento de apresentação | `/caracterizacao/perfil` entrega `kpis.total_alunos` | `vw_censo_enriquecida.total_alunos` | Sem lacuna | Manter observação sobre decimais legados | Documentação |
| Dimensão e Perfil da Rede | Média de alunos por escola | Menu e anchor OK | KPI renderizado | `/caracterizacao/perfil` entrega `kpis.media_alunos_por_escola` | `vw_censo_enriquecida.total_alunos` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Alunos PcD | Menu e anchor OK | KPI renderizado | `/caracterizacao/perfil` entrega `kpis.alunos_pcd` | `vw_censo_enriquecida.alunos_pcd` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Escolas por porte | Menu e anchor OK | Donut renderizado | `/caracterizacao/perfil` entrega `por_porte` | `vw_censo_enriquecida.porte_escola_nome` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Matrículas por porte | Menu e anchor OK | Barra renderizada | `/caracterizacao/perfil` entrega `matriculas_por_porte` | `vw_censo_enriquecida.total_alunos`, `porte_escola_nome` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Escolas por zona | Menu e anchor OK | Donut renderizado | `/caracterizacao/perfil` entrega `por_zona` | `vw_censo_enriquecida.zona` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Escolas por DRE | Menu e anchor OK | Barra Top 15 renderizada | `/caracterizacao/dre` entrega `top_dres` | `vw_censo_enriquecida.dre` | Sem lacuna | Manter | — |
| Dimensão e Perfil da Rede | Detalhamento por DRE | Menu e anchor principal OK | Tabela existe, mas aparece depois dos anchors vazios de Oferta/Infra | `/caracterizacao/dre` entrega `detalhamento` | `vw_censo_enriquecida.dre`, `total_alunos`, `qtd_salas_aula` | Frontend | Mover/ancorar a tabela no bloco Dimensão e Perfil da Rede | Frontend |
| Organização da Oferta e Funcionamento | Etapas ofertadas | Menu e `sec-perfil-oferta` OK | Anchor vazio | `/caracterizacao/perfil` não entrega | `schools.etapas_ofertadas` existe; não há view normalizada | Backend + Frontend | Criar view/parse seguro e endpoint `caracterizacao/oferta-funcionamento`; renderizar barra | Backend |
| Organização da Oferta e Funcionamento | Modalidades ofertadas | Menu e anchor OK | Anchor vazio | `/caracterizacao/perfil` não entrega | `schools.modalidades_ofertadas` existe; não há view normalizada | Backend + Frontend | Mesmo endpoint de oferta/funcionamento | Backend |
| Organização da Oferta e Funcionamento | Distribuição por turnos | Menu e anchor OK | Anchor vazio | `/caracterizacao/perfil` não entrega | `schools.turnos`; `vw_censo_enriquecida.qtd_turmas_total` não substitui distribuição por turno | Backend + Frontend | Normalizar turnos ou agregar do campo institucional; renderizar donut/barra | Backend |
| Organização da Oferta e Funcionamento | Média de turnos por porte | Menu e anchor OK | Anchor vazio | Não há payload | Não há `qtd_turnos` por escola/porte; apenas turmas por turno no JSONB | Backend + Frontend | Definir cálculo oficial e expor no endpoint de oferta/funcionamento | Backend |
| Infraestrutura Educacional | Presença de ambientes | Menu e `sec-perfil-infra` OK | **Entregue**: ranking renderizado | `/caracterizacao/infraestrutura-educacional` entrega `ambientes` | `vw_censo_ambientes.ambiente` | Sem lacuna | Entregue (CAR-INFRA-01) | — |
| Infraestrutura Educacional | Cobertura de ambientes essenciais | Menu e anchor OK | **Entregue com lista oficial inicial**: KPIs + donut de faixas | `/caracterizacao/infraestrutura-educacional` entrega `cobertura_essenciais` | `vw_censo_ambientes` + lista oficial (CTE) | Sem lacuna | Entregue (CAR-INFRA-01). Refino: revisar lista de essenciais | Produto (refino) |
| Infraestrutura Educacional | Média de ambientes essenciais por porte | Menu e anchor OK | **Entregue com lista oficial inicial**: barra por porte | `/caracterizacao/infraestrutura-educacional` entrega `media_essenciais_por_porte` | `vw_censo_ambientes` + `vw_censo_enriquecida.porte_escola_*` | Sem lacuna | Entregue (CAR-INFRA-01) | — |

Diagnóstico B1:

- Dimensão e Perfil está funcional em dados, mas precisa de reorganização frontend para a tabela Detalhamento por DRE ficar semanticamente dentro do bloco correto.
- Organização da Oferta e Funcionamento ainda não existe como conteúdo. O endpoint atual `/v1/admin/analytics/caracterizacao/perfil` não entrega etapas, modalidades nem turnos.
- Infraestrutura Educacional foi entregue em 1ª versão (CAR-INFRA-01): endpoint `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional` reaproveita `vw_censo_ambientes` + `vw_censo_enriquecida` e entrega presença de ambientes, cobertura de essenciais e média por porte. A lista oficial inicial de ambientes essenciais foi definida (Biblioteca, Laboratório de Ciências, Laboratório de Informática, Quadra Esportiva, Refeitório, Cozinha, Sala dos Professores, SAEE); refino futuro pode revisar a lista com a área de produto.

Endpoints recomendados para próxima rodada:

- `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento` (recomendado)
- `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional` — **já entregue (CAR-INFRA-01)**, listado aqui apenas para referência.

## 6. B2 — Abas temáticas integradas

### 6.1 Pessoal e Gestão Escolar

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Estrutura de Gestão Escolar | Composição da gestão escolar | Menu e `sec-pessoal-estrutura` OK | Barra renderizada | `/pessoal-gestao/estrutura` entrega `composicao_gestao` | `vw_censo_direcao_escolar.cargo`, `possui` | Sem lacuna | Manter | — |
| Estrutura de Gestão Escolar | Total de coordenadores pedagógicos | Menu e anchor OK | KPI no resumo executivo | `/pessoal-gestao/estrutura` entrega `total_coordenadores_pedagogicos` | JSONB `qtd_coord_pedagogico` via endpoint | Sem lacuna | Manter | — |
| Estrutura de Gestão Escolar | Escolas com funções/cargos de gestão | Menu e anchor OK | Coberto pela barra de composição | `/pessoal-gestao/estrutura` entrega percentuais por cargo | `vw_censo_direcao_escolar` | Sem lacuna | Manter, evitando gráfico duplicado | — |
| Coordenação Pedagógica | Coordenação por área | Menu e `sec-pessoal-coordenacao` OK | Barra renderizada | `/pessoal-gestao/coordenacao` entrega `por_area` | `vw_censo_coordenacao_area.area`, `possui` | Sem lacuna | Manter | — |
| Coordenação Pedagógica | Cobertura média de coordenação | Menu e anchor OK | KPI renderizado | `/pessoal-gestao/coordenacao` entrega `cobertura_media` | `vw_censo_coordenacao_area` agregado por escola | Sem lacuna | Manter | — |
| Coordenação Pedagógica | Áreas de coordenação declaradas | Menu e anchor OK | Não há lista/tabela separada; a informação está no gráfico | `/pessoal-gestao/coordenacao` suporta | `vw_censo_coordenacao_area` | Frontend | Validar se o gráfico basta; se não, adicionar tabela compacta | Frontend |
| Quadro de Pessoal | Professores efetivos | Menu e `sec-pessoal-quadro` OK | KPI renderizado | `/pessoal-gestao/quadro-pessoal` entrega `total_professores_efetivos` | `vw_censo_quadro_pessoal.qtd_professores_efetivos` | Sem lacuna | Manter | — |
| Quadro de Pessoal | Professores temporários | Menu e anchor OK | KPI renderizado | `/pessoal-gestao/quadro-pessoal` entrega `total_professores_temporarios` | `vw_censo_quadro_pessoal.qtd_professores_temporarios` | Sem lacuna | Manter | — |
| Quadro de Pessoal | Servidores administrativos | Menu e anchor OK | KPI renderizado | `/pessoal-gestao/quadro-pessoal` entrega `total_servidores_administrativos` | `vw_censo_quadro_pessoal.qtd_servidores_administrativos` | Sem lacuna | Manter | — |
| Quadro de Pessoal | Professores readaptados | Menu e anchor OK | KPI renderizado | `/pessoal-gestao/quadro-pessoal` entrega `total_professores_readaptados` | `vw_censo_quadro_pessoal.qtd_professor_readaptado` | Sem lacuna | Manter | — |
| Quadro de Pessoal | Efetivos x temporários | Menu e anchor OK | Donut renderizado | `/pessoal-gestao/quadro-pessoal` suporta | `vw_censo_quadro_pessoal` | Sem lacuna | Manter | — |
| Quadro de Pessoal | Ranking por DRE | Menu e anchor OK | Barra Top 10 e tabela renderizadas | `/pessoal-gestao/quadro-pessoal` entrega `por_dre` | `vw_censo_quadro_pessoal.dre` | Sem lacuna | Manter | — |

### 6.2 Tecnologia e Equipamentos

> **Referência mínima do Data Studio.** O painel original organizava o tema em "Infraestrutura Digital e Capacidade Instalada" e "Uso Pedagógico e Adequação Tecnológica". A aplicação desdobrou o primeiro em **Infraestrutura Digital** + **Parque Tecnológico** e manteve **Uso Pedagógico**. A auditoria abaixo foi revista para preservar os gráficos mínimos do painel original: indicadores que hoje existem apenas como KPI percentual, mas que no Data Studio eram distribuições, ficam classificados como **Parcial** (não "Sem lacuna"). Ver detalhamento técnico em `docs/dashboard/especificacao-entrega-dados-por-grafico.md` §6.5.

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Infraestrutura Digital | Disponibilidade de internet — distribuição Sim/Não | Menu e `sec-tecnologia-digital` OK | Donut Sim/Não renderizado | `/tecnologia/infraestrutura` entrega `disponibilidade_internet` | `vw_censo_equipamentos_tecnologia.internet_disponivel` | **Entregue** | Manter ("Não" inclui não informado) | — |
| Infraestrutura Digital | Provedor de internet | Menu e anchor OK | Donut renderizado | `/tecnologia/infraestrutura` entrega `por_provedor` | `vw_censo_equipamentos_tecnologia.provedor_internet` | Sem lacuna | Manter | — |
| Infraestrutura Digital | Qualidade da internet | Menu e anchor OK | Donut renderizado | `/tecnologia/infraestrutura` entrega `por_qualidade` | `vw_censo_equipamentos_tecnologia.qualidade_internet` | Sem lacuna | Manter; confirmar normalização das opções | — |
| Parque Tecnológico | Quantidade média de equipamentos por escola | Menu e `sec-tecnologia-parque` OK | Barra horizontal renderizada | `/tecnologia/infraestrutura` entrega `media_equipamentos_por_escola` (`AVG(COALESCE(campo,0))`) | `vw_censo_equipamentos_tecnologia.qtd_chromebooks`, `qtd_desktop_alunos`, `qtd_desktop_adm`, `qtd_notebooks` | **Entregue** | Manter (média = total ÷ nº de escolas; substituiu a mediana, que ficava 0 em equipamentos concentrados) | — |
| Parque Tecnológico | Distribuição do parque tecnológico (%) | Menu e anchor OK | Donut renderizado | Participação % calculada no frontend a partir dos totais por tipo | totais de desktops adm/alunos, notebooks, chromebooks | **Entregue** | Manter | — |
| Parque Tecnológico | Totais por tipo de equipamento | Menu e anchor OK | KPIs renderizados | `/tecnologia/infraestrutura` entrega `total_desktops_adm`, `total_desktops_alunos`, `total_notebooks`, `total_chromebooks` | `qtd_desktop_adm`, `qtd_desktop_alunos`, `qtd_notebooks`, `qtd_chromebooks` | Sem lacuna | Manter | — |
| Parque Tecnológico | Computadores inoperantes — número absoluto e total | Menu e anchor OK | Nº de escolas + total absoluto renderizados | `/tecnologia/infraestrutura` entrega `escolas_com_computadores_inoperantes` e `total_computadores_inoperantes` (SUM) | `qtd_computadores_inoperantes` | **Entregue** | Manter | — |
| Parque Tecnológico | Computadores inoperantes — percentual | Menu e anchor OK | Não renderizado | Percentual oficial não exposto | `qtd_computadores_inoperantes` + denominador | Pendente — Produto | Definir denominador do percentual; depois renderizar KPI percentual ou expor no payload | Produto/Dados |
| Uso Pedagógico | Equipamentos atendem à demanda — distribuição Sim/Parcialmente/Não | Menu e `sec-tecnologia-pedagogico` OK | Donut de distribuição renderizado | `/tecnologia/uso-pedagogico` entrega `computadores_atendem_demanda` | `vw_censo_equipamentos_tecnologia.computadores_atendem` | **Entregue** | Manter (inclui "Não informado") | — |
| Uso Pedagógico | Projetor multimídia — distribuição Sim/Não | Menu e anchor OK | Donut Sim/Não renderizado | `/tecnologia/uso-pedagogico` entrega `possui_projetor_dist` | `vw_censo_equipamentos_tecnologia.possui_projetor` | **Entregue** | Manter | — |
| Uso Pedagógico | Lousa digital — distribuição Sim/Não | Menu e anchor OK | Donut Sim/Não renderizado | `/tecnologia/uso-pedagogico` entrega `possui_lousa_digital_dist` | `vw_censo_equipamentos_tecnologia.possui_lousa_digital` | **Entregue** | Manter | — |
| Uso Pedagógico | Quantidade média de projetores por escola | Menu e anchor OK | KPI renderizado | `/tecnologia/uso-pedagogico` entrega `media_projetores_por_escola` (`AVG(COALESCE(qtd_projetores,0))`) | `vw_censo_equipamentos_tecnologia.qtd_projetores` | **Entregue** | Manter | — |

### 6.3 Infraestrutura e Segurança

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Condições Estruturais e Ambientes | Tipo de prédio | Menu e `sec-infra-condicoes` OK | Donut renderizado | `/infraestrutura/condicoes` entrega `por_tipo_predio` | `vw_censo_infraestrutura_seguranca.tipo_predio` | Sem lacuna | Manter | — |
| Condições Estruturais e Ambientes | Situação estrutural | Menu e anchor OK | Donut renderizado | `/infraestrutura/condicoes` entrega `por_situacao_estrutura` | `vw_censo_infraestrutura_seguranca.situacao_estrutura` | Sem lacuna | Manter | — |
| Condições Estruturais e Ambientes | Muro ou cerca | Menu e anchor OK | KPI no resumo executivo | `/infraestrutura/condicoes` entrega `pct_com_muro_ou_cerca` | `vw_censo_infraestrutura_seguranca.muro_cerca` | Sem lacuna | Manter ou reposicionar no bloco | Frontend |
| Condições Estruturais e Ambientes | Perímetro fechado | Menu e anchor OK | KPI no resumo executivo | `/infraestrutura/condicoes` entrega `pct_perimetro_fechado` | `vw_censo_infraestrutura_seguranca.perimetro_fechado` | Sem lacuna | Manter ou reposicionar no bloco | Frontend |
| Condições Estruturais e Ambientes | Ambientes mais presentes | Menu e anchor OK | Barra renderizada | `/infraestrutura/condicoes` entrega `top_ambientes` | `vw_censo_ambientes.ambiente` | Sem lacuna | Manter | — |
| Condições Estruturais e Ambientes | Cobertura de ambientes essenciais | Menu e anchor OK | Não renderizado | Não há payload | `vw_censo_ambientes` existe, mas sem essencialidade | Produto | Definir lista oficial de essenciais e só então expor indicador | Produto/Dados |
| Energia, Climatização e Capacidade Elétrica | Rede elétrica atende demanda | Menu e `sec-infra-energia` OK | Empty state | `/infraestrutura/condicoes` não expõe | `vw_censo_infraestrutura_seguranca.rede_eletrica_atende` | Backend + Frontend | Expor no endpoint de energia/condições e renderizar KPI | Backend |
| Energia, Climatização e Capacidade Elétrica | Estrutura permite climatização | Menu e anchor OK | Empty state | Não expõe | `vw_censo_infraestrutura_seguranca.estrutura_climatizacao` | Backend + Frontend | Expor no endpoint de energia/condições e renderizar KPI | Backend |
| Energia, Climatização e Capacidade Elétrica | Climatização das salas | Menu e anchor OK | Empty state | Não expõe | `vw_censo_enriquecida.situacao_climatizacao_salas`, `salas_climatizadas` | Backend + Frontend | Agregar por situação e renderizar donut/KPI | Backend |
| Segurança Física e Patrimonial | Guarita | Menu e `sec-infra-seguranca` OK | KPI renderizado | `/infraestrutura/seguranca` entrega `pct_possui_guarita` | `vw_censo_infraestrutura_seguranca.possui_guarita` | Sem lacuna | Manter | — |
| Segurança Física e Patrimonial | Controle de portão | Menu e anchor OK | KPI no resumo executivo | `/infraestrutura/seguranca` entrega `pct_controle_portao` | `vw_censo_infraestrutura_seguranca.controle_portao` | Sem lacuna | Manter ou reposicionar no bloco | Frontend |
| Segurança Física e Patrimonial | Iluminação externa | Menu e anchor OK | KPI renderizado | `/infraestrutura/seguranca` entrega `pct_iluminacao_externa` | `vw_censo_infraestrutura_seguranca.iluminacao_externa` | Sem lacuna | Manter | — |
| Segurança Física e Patrimonial | Botão de pânico | Menu e anchor OK | KPI renderizado | `/infraestrutura/seguranca` entrega `pct_possui_botao_panico` | `vw_censo_infraestrutura_seguranca.possui_botao_panico` | Sem lacuna | Manter | — |
| Segurança Física e Patrimonial | Câmeras | Menu e anchor OK | KPI e donut renderizados | `/infraestrutura/seguranca` entrega `pct_cameras_funcionais` e `dist_cameras` | `vw_censo_infraestrutura_seguranca.cameras_funcionamento` | Sem lacuna | Manter | — |
| Segurança Física e Patrimonial | Plano de evacuação | Menu e anchor OK | KPI renderizado | `/infraestrutura/seguranca` entrega `pct_plano_evacuacao` | `vw_censo_infraestrutura_seguranca.plano_evacuacao` | Sem lacuna | Manter | — |
| Segurança Física e Patrimonial | Política contra bullying | Menu e anchor OK | KPI renderizado | `/infraestrutura/seguranca` entrega `pct_politica_bullying` | `vw_censo_infraestrutura_seguranca.politica_bullying` | Sem lacuna | Manter | — |

### 6.4 Merenda Escolar

Blocos oficiais realinhados aos gráficos mínimos do Data Studio (ver `matriz-abas-e-graficos.md` §5.5): **Oferta e Adequação da Merenda · Estrutura Física · Equipamentos da Merenda · Condições Sanitárias e Segurança**. O antigo bloco **Recursos Humanos** deixa de ser finalístico de Merenda e **migra conceitualmente para Serviços Terceirizados** ("Manipuladores de Alimentos / Merendeiras") — ver nota ao fim desta seção.

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Oferta e Adequação da Merenda | Oferta regular da merenda | Menu e `sec-merenda-oferta` OK | Donut renderizado | `/merenda/oferta` entrega `dist_oferta_regular` | `vw_censo_rh_merendeiras.oferta_regular` | Sem lacuna | Manter | — |
| Oferta e Adequação da Merenda | Qualidade da merenda | Menu e anchor OK | Barra renderizada | `/merenda/oferta` entrega `dist_qualidade` | `vw_censo_rh_merendeiras.qualidade_merenda` | Sem lacuna | Manter | — |
| Oferta e Adequação da Merenda | Merenda atende necessidades — distribuição Sim/Parcialmente/Não | Menu e anchor OK | Donut renderizado + KPI % mantido | `/merenda/oferta` entrega `dist_atende_necessidades` + `pct_atende_necessidades` | `vw_censo_rh_merendeiras.atende_necessidades` | Sem lacuna (MER-01A) | Manter | — |
| Estrutura Física | Condições da cozinha | Menu e `sec-merenda-estrutura` OK | Barra renderizada | `/merenda/oferta` entrega `dist_condicoes_cozinha` | `vw_censo_equipamentos_merenda.condicoes_cozinha` | Sem lacuna | Manter | — |
| Estrutura Física | Possui refeitório — distribuição Sim/Não | Menu e anchor OK | Donut renderizado + KPI % mantido | `/merenda/oferta` entrega `dist_possui_refeitorio` + `pct_possui_refeitorio` | `vw_censo_equipamentos_merenda.possui_refeitorio` | Sem lacuna (MER-01A) | Manter | — |
| Estrutura Física | Tamanho da cozinha | Menu e anchor OK | HBar renderizada | `/merenda/oferta` entrega `dist_tamanho_cozinha` | `vw_censo_equipamentos_merenda.tamanho_cozinha` | Sem lacuna (MER-01A) | Manter | — |
| Estrutura Física | Refeitório atende adequadamente | Menu e anchor OK | HBar renderizada | `/merenda/oferta` entrega `dist_refeitorio_adequado` | `vw_censo_equipamentos_merenda.refeitorio_adequado` | Sem lacuna (MER-01A) | Manter | — |
| Equipamentos da Merenda | Totais por equipamento (freezers/geladeiras/fogões/fornos/bebedouros) | Menu e `sec-merenda-equipamentos` OK | 5 KPIs total renderizados | `/merenda/equipamentos` entrega `freezers`/`geladeiras`/`fogoes`/`fornos`/`bebedouros` | `qtd_freezers`, `qtd_geladeiras`, `qtd_fogoes`, `qtd_fornos`, `qtd_bebedouros` | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Média por equipamento por escola | Menu e anchor OK | Exibida em cada `EquipCard` | `/merenda/equipamentos` entrega `media_por_escola` por tipo | `qtd_*` por escola | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Presença de equipamentos por tipo (% de escolas) | Menu e anchor OK | HBar renderizada | `/merenda/equipamentos` entrega `presenca_por_tipo` (`COUNT FILTER qtd_* > 0`) | `qtd_*` por tipo | Sem lacuna (MER-01B) | Manter (critério "possui = qtd > 0") | — |
| Equipamentos da Merenda | Escolas com 1, 2 ou 3+ tipos | Menu e anchor OK | HBar renderizada | `/merenda/equipamentos` entrega `faixas_qtd_tipos` (faixas cumulativas 1+/2+/3+) | `qtd_*` por tipo | Sem lacuna (MER-01B) | Manter (interpretação A: nº de tipos) | — |
| Equipamentos da Merenda | Estado de conservação consolidado | Menu e anchor OK | Tabela consolidada (Bom/Regular/Ruim-Inoperante) + tabela detalhada | `/merenda/equipamentos` entrega `estado_consolidado` (+ `dist_estados` mantida) | `estado_freezers`, `estado_geladeiras`, `estado_fogoes`, `estado_fornos`, `estado_bebedouros` | Sem lacuna (MER-01B) | Manter | — |
| Equipamentos da Merenda | Criticidade por equipamento | Menu e anchor OK | HBar renderizada | `/merenda/equipamentos` entrega `criticidade_por_equipamento` (% ruim/inoperante) | `estado_*` por tipo | Sem lacuna (MER-01B) | Manter (denominador = escolas com estado informado) | — |
| Condições Sanitárias e Segurança | Despensa exclusiva para gêneros alimentícios | Menu e `sec-merenda-sanitarias` OK | Donut renderizado | `/merenda/condicoes-sanitarias` entrega `dist_despensa_exclusiva` | `vw_censo_equipamentos_merenda.despensa_exclusiva` | Sem lacuna (MER-01C) | Manter | — |
| Condições Sanitárias e Segurança | Depósito conserva adequadamente os alimentos | Menu e anchor OK | Donut renderizado | `/merenda/condicoes-sanitarias` entrega `dist_deposito_conserva` | `vw_censo_equipamentos_merenda.deposito_conserva` | Sem lacuna (MER-01C) | Manter | — |
| Condições Sanitárias e Segurança | Presença de itens básicos (despensa exclusiva, exaustão, bancadas inox) | Menu e anchor OK | HBar renderizada | `/merenda/condicoes-sanitarias` entrega `presenca_itens_basicos` (denominador = escolas concluídas no recorte) | `despensa_exclusiva`, `sistema_exaustao`, `bancadas_inox` | Sem lacuna (MER-01C) | Manter | — |
| Condições Sanitárias e Segurança | Estoque de EPIs e extintor de incêndio | Menu e anchor OK | HBar renderizada | `/merenda/condicoes-sanitarias` entrega `dist_estoque_epi_extintor` | `estoque_epi_extintor` | Sem lacuna (MER-01C) | Manter | — |
| Condições Sanitárias e Segurança | Recarga/manutenção dos extintores | Menu e anchor OK | HBar renderizada | `/merenda/condicoes-sanitarias` entrega `dist_manutencao_extintores` | `manutencao_extintores` | Sem lacuna (MER-01C) | Manter | — |

Nota — **Recursos Humanos / merendeiras (fora da matriz finalística de Merenda).** O bloco RH hoje renderizado em `AbaMerenda.tsx` (anchor `sec-merenda-rh`) — merendeiras estatutárias/terceirizadas/temporárias, supervisor de merenda, empresas terceirizadas e distribuição por vínculo — **deixa de ser bloco finalístico da aba Merenda** e **migra conceitualmente para o menu Serviços Terceirizados**, como bloco **"Manipuladores de Alimentos / Merendeiras"**, ao lado de Serviços Gerais e Portaria. A fonte (`vw_censo_rh_merendeiras`, consumida por `/merenda/recursos-humanos`) **permanece ativa** — esta rodada é só documental, não remove código. A reorganização efetiva será planejada em rodada própria de Serviços Terceirizados.

Diagnóstico B2 — Merenda (atualizado): os quatro blocos finalísticos da matriz mínima do Data Studio estão **entregues** — **Oferta e Adequação** e **Estrutura Física** (MER-01A), **Equipamentos da Merenda** (MER-01B) e **Condições Sanitárias e Segurança** (MER-01C, via `/merenda/condicoes-sanitarias` sobre `vw_censo_equipamentos_merenda`). A única pendência remanescente é **não finalística**: a migração do bloco RH/Merendeiras (hoje em `sec-merenda-rh`, fonte `vw_censo_rh_merendeiras`) para o menu Serviços Terceirizados ("Manipuladores de Alimentos / Merendeiras"), a ser planejada em rodada própria — sem remoção de código nesta rodada.

### 6.5 Serviços Terceirizados

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Visão Geral | Cobertura por área terceirizada | Menu e `sec-servicos-visao` OK | Barra renderizada | `/servicos-terceirizados/visao-geral` entrega `por_area` | `vw_censo_servicos_terceirizados.empresa_terceirizada_*` | Sem lacuna | Manter | — |
| Visão Geral | Quantidade de áreas terceirizadas por escola | Menu e anchor OK | Donut renderizado | `/servicos-terceirizados/visao-geral` entrega `por_quantidade_areas` | `vw_censo_servicos_terceirizados` | Sem lacuna | Manter | — |
| Serviços Gerais | Efetivos | Menu e `sec-servicos-gerais` OK | KPI renderizado | `/servicos-terceirizados/servicos-gerais` entrega `total_efetivo` | `vw_censo_rh_servicos_gerais.qtd_servicos_gerais_efetivo` | Sem lacuna | Manter | — |
| Serviços Gerais | Temporários | Menu e anchor OK | KPI renderizado | `/servicos-terceirizados/servicos-gerais` entrega `total_temporario` | `qtd_servicos_gerais_temporario` | Sem lacuna | Manter | — |
| Serviços Gerais | Terceirizados | Menu e anchor OK | KPI renderizado | `/servicos-terceirizados/servicos-gerais` entrega `total_terceirizado` | `qtd_servicos_gerais_terceirizado` | Sem lacuna | Manter | — |
| Serviços Gerais | Média total por escola | Menu e anchor OK | KPI renderizado | `/servicos-terceirizados/servicos-gerais` entrega `media_total_por_escola` | `vw_censo_rh_servicos_gerais` | Sem lacuna | Manter | — |
| Serviços Gerais | Distribuição por vínculo | Menu e anchor OK | Donut renderizado | `/servicos-terceirizados/servicos-gerais` suporta | `vw_censo_rh_servicos_gerais` | Sem lacuna | Manter | — |
| Portaria | Escolas com agentes de portaria | Menu e `sec-servicos-portaria` OK | KPI renderizado | `/servicos-terceirizados/portaria` entrega `pct_com_agentes` | `vw_censo_servicos_terceirizados.qtd_agentes_portaria` | Sem lacuna | Manter | — |
| Portaria | Média de agentes por escola | Menu e anchor OK | KPI renderizado | `/servicos-terceirizados/portaria` entrega `media_agentes_por_escola` | `qtd_agentes_portaria` | Sem lacuna | Manter | — |
| Portaria | Top empresas de portaria | Menu e anchor OK | Barra renderizada | `/servicos-terceirizados/portaria` entrega `top_empresas` | `empresa_terceirizada_portaria` | Sem lacuna | Manter | — |
| Governança / Supervisão | Supervisor por serviço | Menu e `sec-servicos-governanca` OK | Empty state | Não há endpoint/payload | `possui_supervisor_merenda`, `possui_supervisor_sg`, `possui_supervisor_portaria` existem em views | Backend + Frontend | Criar endpoint de governança e renderizar barra por serviço | Backend |
| Governança / Supervisão | Avaliação da supervisão | Menu e anchor OK | Empty state | Não há endpoint/payload | `vw_censo_servicos_terceirizados.avaliacao_supervisao` | Produto | Confirmar escala oficial e expor distribuição | Produto/Dados |
| Governança / Supervisão | Avaliação dos serviços | Menu e anchor OK | Empty state | Não há endpoint/payload | `avaliacao_merendeiras`, `avaliacao_portaria`, `avaliacao_limpeza`, `avaliacao_comunicacao` | Produto | Confirmar escala/semântica e expor distribuições | Produto/Dados |

Observação transversal da B2: os endpoints de Pessoal/Tecnologia aceitam filtros por query string (`year`, `dre`, `municipio`, `zona`, `porte_escola`). Os endpoints de Infraestrutura/Merenda/Serviços usam ano corrente e filtros fixos no código. Se filtros globais por aba forem prioridade, há uma lacuna adicional de padronização backend, mas ela não bloqueia a matriz mínima atual.

## 7. B3 — Abas futuras/externas

### 7.1 Perfil dos Alunos e Resultados

Status: Histórico/legado.

A aba mantém a implementação atual via `GET /v1/admin/indicadores-metrics`, alimentada por Google Sheets. O componente `AbaPerfilAlunos.tsx` renderiza:

- Escolas com Risco de Fluxo;
- distribuição por faixa de beneficiários;
- distribuição da taxa de abandono;
- Top 10 DREs com maior taxa média de abandono.

Confirmações:

- Não há consumo dos endpoints PostgreSQL do formulário para esta aba.
- Não deve entrar na rodada de backend PostgreSQL do formulário.
- A remodelagem depende de decisão de produto e de fonte externa/planilha própria.

### 7.2 Gestão Financeira e Governança

Status: Fonte externa / Planejado.

A aba `AbaGestaoFinanceiraGovernanca.tsx` é placeholder institucional com `EmptyStatePlaceholder`. Não faz fetch, não possui endpoint, não possui view SQL e não usa dado fake.

Blocos futuros exibidos no placeholder:

- Governança Institucional e Regularização;
- Execução Financeira e Prestação de Contas;
- Participação Comunitária e Risco de Governança.

Confirmações:

- A aba permanece fora da rodada PostgreSQL do formulário.
- A fonte futura deve vir de bases próprias validadas pelas coordenações responsáveis.
- Nenhuma migration, endpoint ou integração de dados deve ser criada sem decisão explícita de produto.

## 8. Backlog recomendado

As tasks de implementação devem ser abertas a partir de `docs/dashboard/especificacao-entrega-dados-por-grafico.md`, que detalha cada gráfico pendente ou parcial em termos de origem, tratamento, endpoint, payload, frontend, dependências e próxima ação.

### 8.1 Backend

- Criar `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`, com etapas, modalidades, distribuição por turnos e média de turnos por porte.
- **Entregue** (`feat/tecnologia-graficos-minimos-datastudio`) — expandidos `/tecnologia/infraestrutura` e `/tecnologia/uso-pedagogico` com os gráficos mínimos do Data Studio (§6.2 e especificação §6.5): distribuição Sim/Não de internet, distribuição Sim/Parcialmente/Não de "atendem à demanda", distribuições Sim/Não de projetor e lousa, média por tipo de equipamento, distribuição (%) do parque e média de projetores por escola. Resta apenas o percentual de computadores inoperantes (produto).
- Expor energia/climatização/capacidade elétrica na aba Infraestrutura, preferencialmente em endpoint dedicado ou expansão controlada de `/infraestrutura/condicoes`.
- **Entregue (MER-01A)** — Merenda Estrutura Física: `/merenda/oferta` expõe `dist_tamanho_cozinha`, `dist_refeitorio_adequado` e `dist_possui_refeitorio` (campos de `vw_censo_equipamentos_merenda`), renderizados em `sec-merenda-estrutura`; KPI `pct_possui_refeitorio` mantido.
- **Entregue (MER-01A)** — Merenda Oferta: `/merenda/oferta` expõe `dist_atende_necessidades` (Sim/Parcialmente/Não, de `vw_censo_rh_merendeiras`), renderizado como donut; KPI `pct_atende_necessidades` mantido.
- Expor, na Merenda — Equipamentos, a presença por tipo (% de escolas com `qtd_* > 0`), distribuição por faixa de quantidade e visão consolidada/criticidade de estado de conservação (após validar faixas e definição de criticidade com produto).
- **Entregue (MER-01C)** — bloco **Merenda — Condições Sanitárias e Segurança**: endpoint dedicado `GET /v1/admin/analytics/merenda/condicoes-sanitarias` expõe `dist_despensa_exclusiva`, `dist_deposito_conserva`, `presenca_itens_basicos` (despensa exclusiva, sistema de exaustão, bancadas de inox), `dist_estoque_epi_extintor` e `dist_manutencao_extintores`, todos sobre `vw_censo_equipamentos_merenda`; renderizado em `sec-merenda-sanitarias`. Distribuições categóricas usam denominador = escolas com valor informado; `presenca_itens_basicos` usa denominador = total de escolas concluídas no recorte.
- Criar `GET /v1/admin/analytics/servicos-terceirizados/governanca`, cobrindo supervisor por serviço e avaliações.
- Avaliar padronização de filtros (`year`, `dre`, `municipio`, `zona`, `porte_escola`) nos endpoints de Infraestrutura, Merenda e Serviços.

> Caracterização / Infraestrutura Educacional (`/caracterizacao/infraestrutura-educacional`) já foi entregue em CAR-INFRA-01, com a lista oficial inicial de ambientes essenciais. Não consta mais como backlog de backend; resta apenas refino futuro da lista com produto.

### 8.2 Frontend

- Reorganizar a tabela Detalhamento por DRE dentro do bloco Dimensão e Perfil da Rede.
- Renderizar conteúdo real no anchor vazio de Caracterização `sec-perfil-oferta` (o anchor `sec-perfil-infra` já foi entregue em CAR-INFRA-01).
- **Entregue** — renderizadas as distribuições/médias de Tecnologia (donuts Sim/Não, distribuição do parque, média de equipamentos por escola e média de projetores).
- Substituir empty state de Infraestrutura/Energia por KPIs/gráficos quando o backend expuser payload.
- **Entregue (MER-01A/B/C)** — renderizadas, em Merenda, as distribuições de Oferta/Estrutura, a presença/quantidade/estado consolidado de equipamentos e o bloco Condições Sanitárias e Segurança (`sec-merenda-sanitarias`).
- Planejar, em rodada própria de Serviços Terceirizados, o bloco "Manipuladores de Alimentos / Merendeiras" recebendo os indicadores hoje em `sec-merenda-rh`.
- Substituir empty state de Serviços/Governança quando houver endpoint.
- Decidir se a área de coordenação em Pessoal precisa de tabela complementar ou se o gráfico atual é suficiente.

### 8.3 Produto/Dados externos

- Definir denominador oficial do percentual de computadores inoperantes.
- Definir escala oficial de avaliação de supervisão/serviços terceirizados.
- Refino futuro (não bloqueante): revisar a lista oficial inicial de ambientes essenciais já entregue em CAR-INFRA-01.
- Definir fonte futura de Perfil dos Alunos e Resultados.
- Definir fonte futura de Gestão Financeira e Governança.

### 8.4 Documentação

- Atualizar a matriz oficial após validação das lacunas confirmadas.
- Registrar decisões de produto antes de qualquer PR de implementação.
- Manter o guia histórico como referência secundária, sempre subordinado à matriz oficial.

## 9. Divisão sugerida de tarefas entre equipe

| Frente | Responsável sugerido | Escopo | Arquivos prováveis | Dependências |
|---|---|---|---|---|
| Backend Caracterização Oferta | Backend | Endpoint de oferta/funcionamento; parsing/normalização de etapas, modalidades e turnos | `api/cmd/api/analytics.go`, possíveis migrations novas, espelhos em `api/cmd/api/migrations/` | Definir cálculo de média de turnos por porte |
| ~~Backend Caracterização Infra~~ **Entregue (CAR-INFRA-01)** | Backend + Produto | Endpoint de infraestrutura educacional baseado em ambientes — entregue, com lista oficial inicial de essenciais | `api/cmd/api/analytics.go` | Refino futuro da lista com produto (não bloqueante) |
| ~~Backend Tecnologia (Data Studio)~~ **Entregue** | Backend | Distribuições Sim/Não e Sim/Parcialmente/Não, média por tipo, distribuição (%) do parque, média de projetores | `api/cmd/api/analytics_pessoal_tecnologia.go` | Denominador do percentual de computadores inoperantes (produto) |
| Frontend Caracterização | Frontend | Reorganizar Detalhamento por DRE e renderizar o bloco Oferta quando houver payload (Infra já entregue) | `web/src/components/admin/AbaCaracterizacao.tsx` | Endpoint de oferta/funcionamento |
| ~~Frontend Tecnologia (Data Studio)~~ **Entregue** | Frontend | Renderizar donuts/distribuições/médias de Tecnologia | `web/src/components/admin/AbaTecnologia.tsx` | Payload expandido de Tecnologia |
| Backend Infra Energia | Backend | Expor rede elétrica, estrutura de climatização e climatização das salas | `api/cmd/api/analytics_infra_merenda_servicos.go`, possivelmente migrations/views | Confirmar semântica dos campos elétricos |
| Frontend Infra Energia | Frontend | Substituir empty state por KPIs/gráficos | `web/src/components/admin/AbaInfraestruturaSeguranca.tsx` | Payload de energia/climatização |
| Backend Merenda Estrutura | Backend | Expor distribuição de tamanho da cozinha | `api/cmd/api/analytics_infra_merenda_servicos.go` | Campo já existe em `vw_censo_equipamentos_merenda` |
| Frontend Merenda Estrutura | Frontend | Renderizar tamanho da cozinha | `web/src/components/admin/AbaMerenda.tsx` | Payload atualizado |
| Backend Serviços Governança | Backend + Produto | Endpoint de supervisão/governança dos terceirizados | `api/cmd/api/analytics_infra_merenda_servicos.go` | Escala oficial de avaliação |
| Frontend Serviços Governança | Frontend | Substituir empty state por barra/donuts/tabela | `web/src/components/admin/AbaServicosTerceirizados.tsx` | Endpoint de governança |
| Produto/Dados externos | Produto | Perfil dos Alunos e Gestão Financeira/Governança | Fora do banco do censo nesta rodada | Fontes externas validadas |

## 10. Próxima ordem recomendada

1. Validar com produto o denominador de computadores inoperantes (Tecnologia) e a escala de avaliação de serviços. (A lista de ambientes essenciais já foi definida e entregue em CAR-INFRA-01; resta apenas refino opcional.)
2. Fazer PR backend pequeno para `caracterizacao/oferta-funcionamento`.
3. Fazer PR frontend para preencher o bloco Organização da Oferta e reposicionar Detalhamento por DRE.
4. ~~Fazer PR backend/frontend de Tecnologia conforme Data Studio~~ **Entregue** (distribuições, média de equipamentos por escola, distribuição do parque, média de projetores).
5. Fazer PR backend pequeno para Energia/Climatização em Infraestrutura.
6. Fazer PR frontend para substituir o empty state de Energia.
7. ~~Fazer PR backend/frontend para `tamanho_cozinha` em Merenda~~ **Entregue (MER-01A)** — Oferta e Estrutura Física completas (`dist_atende_necessidades`, `dist_possui_refeitorio`, `dist_tamanho_cozinha`, `dist_refeitorio_adequado`).
8. Fazer PR backend/frontend para Governança/Supervisão de Serviços Terceirizados após decisão da escala.
9. Manter Perfil dos Alunos e Gestão Financeira/Governança fora da rodada PostgreSQL até definição de fonte externa.
