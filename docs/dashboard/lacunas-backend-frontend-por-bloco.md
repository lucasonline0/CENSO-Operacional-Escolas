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
| Média | Merenda Escolar | Estrutura Física | Condições da cozinha e refeitório existem; tamanho da cozinha está na view, mas não no payload/frontend. | Backend + Frontend | Expor `tamanho_cozinha` no endpoint de oferta/estrutura e renderizar distribuição. |
| Média | Caracterização da Rede | Dimensão e Perfil da Rede | Conteúdo principal existe, mas a tabela Detalhamento por DRE aparece depois dos anchors vazios de Oferta/Infra, não dentro do bloco correto. | Frontend | Reorganizar a posição/ancoragem da tabela sem mudar backend. |
| Média | Pessoal e Gestão Escolar | Coordenação Pedagógica | Gráfico e KPI existem; a lista/tabela de áreas declaradas não existe separadamente. | Frontend | Decidir se o gráfico atual substitui a lista; se não, adicionar tabela simples. |
| Média | Tecnologia e Equipamentos | Parque Tecnológico | Total de computadores inoperantes existe; percentual de inoperantes não é renderizado como KPI próprio. | Produto | Definir denominador oficial do percentual; depois ajustar frontend ou payload. |
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

- `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`
- `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`

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

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Infraestrutura Digital | Escolas com internet | Menu e `sec-tecnologia-digital` OK | KPI no resumo executivo | `/tecnologia/infraestrutura` entrega `percentual_internet` e `escolas_com_internet` | `vw_censo_equipamentos_tecnologia.internet_disponivel` | Sem lacuna | Manter | — |
| Infraestrutura Digital | Provedor de internet | Menu e anchor OK | Barra renderizada | `/tecnologia/infraestrutura` entrega `por_provedor` | `vw_censo_equipamentos_tecnologia.provedor_internet` | Sem lacuna | Manter | — |
| Infraestrutura Digital | Qualidade da internet | Menu e anchor OK | Donut renderizado | `/tecnologia/infraestrutura` entrega `por_qualidade` | `vw_censo_equipamentos_tecnologia.qualidade_internet` | Sem lacuna | Manter | — |
| Infraestrutura Digital | Computadores atendem à demanda | Menu e anchor OK | KPI no resumo executivo | `/tecnologia/infraestrutura` entrega `percentual_computadores_atendem` | `vw_censo_equipamentos_tecnologia.computadores_atendem` | Sem lacuna | Manter | — |
| Parque Tecnológico | Desktops administrativos | Menu e `sec-tecnologia-parque` OK | KPI renderizado | `/tecnologia/infraestrutura` entrega `total_desktops_adm` | `vw_censo_equipamentos_tecnologia.qtd_desktop_adm` | Sem lacuna | Manter | — |
| Parque Tecnológico | Desktops de alunos | Menu e anchor OK | KPI renderizado | `/tecnologia/infraestrutura` entrega `total_desktops_alunos` | `vw_censo_equipamentos_tecnologia.qtd_desktop_alunos` | Sem lacuna | Manter | — |
| Parque Tecnológico | Notebooks | Menu e anchor OK | KPI renderizado | `/tecnologia/infraestrutura` entrega `total_notebooks` | `vw_censo_equipamentos_tecnologia.qtd_notebooks` | Sem lacuna | Manter | — |
| Parque Tecnológico | Chromebooks | Menu e anchor OK | KPI renderizado | `/tecnologia/infraestrutura` entrega `total_chromebooks` | `vw_censo_equipamentos_tecnologia.qtd_chromebooks` | Sem lacuna | Manter | — |
| Parque Tecnológico | Computadores inoperantes | Menu e anchor OK | Total renderizado; percentual não renderizado | Payload traz total e totais do parque, mas não percentual oficial | `qtd_computadores_inoperantes` + equipamentos | Produto | Definir denominador do percentual; depois renderizar KPI percentual ou expor no payload | Produto/Dados |
| Uso Pedagógico | Escolas com projetor | Menu e `sec-tecnologia-pedagogico` OK | KPI renderizado | `/tecnologia/uso-pedagogico` entrega `percentual_com_projetor` | `vw_censo_equipamentos_tecnologia.possui_projetor` | Sem lacuna | Manter | — |
| Uso Pedagógico | Total de projetores | Menu e anchor OK | KPI renderizado | `/tecnologia/uso-pedagogico` entrega `total_projetores` | `vw_censo_equipamentos_tecnologia.qtd_projetores` | Sem lacuna | Manter | — |
| Uso Pedagógico | Escolas com lousa digital | Menu e anchor OK | KPI renderizado | `/tecnologia/uso-pedagogico` entrega `percentual_com_lousa_digital` | `vw_censo_equipamentos_tecnologia.possui_lousa_digital` | Sem lacuna | Manter | — |

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

| Bloco | Item mínimo | Menu/anchor | Frontend | Backend/payload | View/campo | Tipo de lacuna | Próxima ação | Frente sugerida |
|---|---|---|---|---|---|---|---|---|
| Oferta e Adequação da Merenda | Oferta regular da merenda | Menu e `sec-merenda-oferta` OK | Donut renderizado | `/merenda/oferta` entrega `dist_oferta_regular` | `vw_censo_rh_merendeiras.oferta_regular` | Sem lacuna | Manter | — |
| Oferta e Adequação da Merenda | Qualidade da merenda | Menu e anchor OK | Barra renderizada | `/merenda/oferta` entrega `dist_qualidade` | `vw_censo_rh_merendeiras.qualidade_merenda` | Sem lacuna | Manter | — |
| Oferta e Adequação da Merenda | Merenda atende necessidades | Menu e anchor OK | KPI no resumo executivo | `/merenda/oferta` entrega `pct_atende_necessidades` | `vw_censo_rh_merendeiras.atende_necessidades` | Sem lacuna | Manter ou reposicionar no bloco | Frontend |
| Estrutura Física | Condições da cozinha | Menu e `sec-merenda-estrutura` OK | Barra renderizada | `/merenda/oferta` entrega `dist_condicoes_cozinha` | `vw_censo_equipamentos_merenda.condicoes_cozinha` | Sem lacuna | Manter | — |
| Estrutura Física | Possui refeitório | Menu e anchor OK | KPI renderizado | `/merenda/oferta` entrega `pct_possui_refeitorio` | `vw_censo_equipamentos_merenda.possui_refeitorio` | Sem lacuna | Manter | — |
| Estrutura Física | Tamanho da cozinha | Menu e anchor OK | Não renderizado | `/merenda/oferta` não expõe | `vw_censo_equipamentos_merenda.tamanho_cozinha` | Backend + Frontend | Expor distribuição de `tamanho_cozinha` e renderizar no bloco | Backend |
| Equipamentos da Merenda | Freezers | Menu e `sec-merenda-equipamentos` OK | KPI total + média renderizado | `/merenda/equipamentos` entrega `freezers` | `vw_censo_equipamentos_merenda.qtd_freezers` | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Geladeiras | Menu e anchor OK | KPI total + média renderizado | `/merenda/equipamentos` entrega `geladeiras` | `qtd_geladeiras` | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Fogões | Menu e anchor OK | KPI total + média renderizado | `/merenda/equipamentos` entrega `fogoes` | `qtd_fogoes` | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Fornos | Menu e anchor OK | KPI total + média renderizado | `/merenda/equipamentos` entrega `fornos` | `qtd_fornos` | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Bebedouros | Menu e anchor OK | KPI total + média renderizado | `/merenda/equipamentos` entrega `bebedouros` | `qtd_bebedouros` | Sem lacuna | Manter | — |
| Equipamentos da Merenda | Estado de conservação | Menu e anchor OK | Tabela renderizada por equipamento/estado | `/merenda/equipamentos` entrega `dist_estados` | `estado_freezers`, `estado_geladeiras`, `estado_fogoes`, `estado_fornos`, `estado_bebedouros` | Sem lacuna | Manter | — |
| Recursos Humanos | Merendeiras estatutárias | Menu e `sec-merenda-rh` OK | KPI renderizado | `/merenda/recursos-humanos` entrega `total_estatutaria` | `vw_censo_rh_merendeiras.qtd_merendeiras_estatutaria` | Sem lacuna | Manter | — |
| Recursos Humanos | Merendeiras terceirizadas | Menu e anchor OK | KPI renderizado | `/merenda/recursos-humanos` entrega `total_terceirizada` | `qtd_merendeiras_terceirizada` | Sem lacuna | Manter | — |
| Recursos Humanos | Merendeiras temporárias | Menu e anchor OK | KPI renderizado | `/merenda/recursos-humanos` entrega `total_temporaria` | `qtd_merendeiras_temporaria` | Sem lacuna | Manter | — |
| Recursos Humanos | Supervisor de merenda | Menu e anchor OK | KPI renderizado | `/merenda/recursos-humanos` entrega `pct_com_supervisor` | `possui_supervisor_merenda` | Sem lacuna | Manter | — |
| Recursos Humanos | Empresas terceirizadas da merenda | Menu e anchor OK | Barra Top empresas renderizada | `/merenda/recursos-humanos` entrega `top_empresas` | `empresa_terceirizada_merenda` | Sem lacuna | Manter | — |

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
- Criar `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`, reaproveitando `vw_censo_ambientes` após definição de ambientes essenciais.
- Expor energia/climatização/capacidade elétrica na aba Infraestrutura, preferencialmente em endpoint dedicado ou expansão controlada de `/infraestrutura/condicoes`.
- Expor `tamanho_cozinha` na Merenda, idealmente em recorte de estrutura física.
- Criar `GET /v1/admin/analytics/servicos-terceirizados/governanca`, cobrindo supervisor por serviço e avaliações.
- Avaliar padronização de filtros (`year`, `dre`, `municipio`, `zona`, `porte_escola`) nos endpoints de Infraestrutura, Merenda e Serviços.

### 8.2 Frontend

- Reorganizar a tabela Detalhamento por DRE dentro do bloco Dimensão e Perfil da Rede.
- Renderizar conteúdo real nos anchors vazios de Caracterização: `sec-perfil-oferta` e `sec-perfil-infra`.
- Substituir empty state de Infraestrutura/Energia por KPIs/gráficos quando o backend expuser payload.
- Renderizar distribuição de tamanho da cozinha em Merenda.
- Substituir empty state de Serviços/Governança quando houver endpoint.
- Decidir se a área de coordenação em Pessoal precisa de tabela complementar ou se o gráfico atual é suficiente.

### 8.3 Produto/Dados externos

- Definir lista oficial de ambientes essenciais.
- Definir denominador oficial do percentual de computadores inoperantes.
- Definir escala oficial de avaliação de supervisão/serviços terceirizados.
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
| Backend Caracterização Infra | Backend + Produto | Endpoint de infraestrutura educacional baseado em ambientes | `api/cmd/api/analytics.go`, `infra/migrations/0007_*` ou migration nova | Lista oficial de ambientes essenciais |
| Frontend Caracterização | Frontend | Reorganizar Detalhamento por DRE e renderizar blocos Oferta/Infra quando houver payload | `web/src/components/admin/AbaCaracterizacao.tsx` | Endpoints de Caracterização |
| Backend Infra Energia | Backend | Expor rede elétrica, estrutura de climatização e climatização das salas | `api/cmd/api/analytics_infra_merenda_servicos.go`, possivelmente migrations/views | Confirmar semântica dos campos elétricos |
| Frontend Infra Energia | Frontend | Substituir empty state por KPIs/gráficos | `web/src/components/admin/AbaInfraestruturaSeguranca.tsx` | Payload de energia/climatização |
| Backend Merenda Estrutura | Backend | Expor distribuição de tamanho da cozinha | `api/cmd/api/analytics_infra_merenda_servicos.go` | Campo já existe em `vw_censo_equipamentos_merenda` |
| Frontend Merenda Estrutura | Frontend | Renderizar tamanho da cozinha | `web/src/components/admin/AbaMerenda.tsx` | Payload atualizado |
| Backend Serviços Governança | Backend + Produto | Endpoint de supervisão/governança dos terceirizados | `api/cmd/api/analytics_infra_merenda_servicos.go` | Escala oficial de avaliação |
| Frontend Serviços Governança | Frontend | Substituir empty state por barra/donuts/tabela | `web/src/components/admin/AbaServicosTerceirizados.tsx` | Endpoint de governança |
| Produto/Dados externos | Produto | Perfil dos Alunos e Gestão Financeira/Governança | Fora do banco do censo nesta rodada | Fontes externas validadas |

## 10. Próxima ordem recomendada

1. Validar com produto a lista de ambientes essenciais, o denominador de computadores inoperantes e a escala de avaliação de serviços.
2. Fazer PR backend pequeno para `caracterizacao/oferta-funcionamento`.
3. Fazer PR frontend para preencher o bloco Organização da Oferta e reposicionar Detalhamento por DRE.
4. Fazer PR backend pequeno para Energia/Climatização em Infraestrutura.
5. Fazer PR frontend para substituir o empty state de Energia.
6. Fazer PR backend/frontend para `tamanho_cozinha` em Merenda.
7. Fazer PR backend/frontend para Governança/Supervisão de Serviços Terceirizados após decisão da escala.
8. Manter Perfil dos Alunos e Gestão Financeira/Governança fora da rodada PostgreSQL até definição de fonte externa.
