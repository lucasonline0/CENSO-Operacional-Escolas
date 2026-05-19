# Documento-base para Desenvolvimento do Dashboard Próprio do Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA

## 1. Finalidade do documento

Este documento serve como base inicial para planejar a reconstrução do dashboard do **Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA** em uma plataforma própria, hospedada na Vercel, deixando de depender do Google DataStudio/Looker Studio e dos tratamentos intermediários feitos em Google Sheets.

A proposta não é substituir o formulário já funcional, mas evoluir o projeto para uma aplicação gerencial completa, com:

- coleta dos dados por formulário próprio;
- persistência em banco de dados;
- tratamento, normalização e cálculo de indicadores diretamente no backend/banco;
- visualização em dashboard próprio;
- integração futura com outras fontes institucionais da SEDUC/PA e dados oficiais do INEP;
- melhor controle sobre filtros, layout, indicadores, permissões, exportações e evolução metodológica.

## 2. Contexto institucional do projeto

O projeto está inserido no contexto FADEP/SEDUC e tem como finalidade coletar, organizar e disponibilizar informações operacionais, estruturais, administrativas, financeiras, tecnológicas, pedagógicas e de governança das unidades escolares da rede estadual.

O censo já foi aplicado em rede, com mais de 800 escolas respondentes em momento posterior do projeto, e o painel atual em Looker Studio já está funcional.

A nova etapa consiste em evoluir a solução para um dashboard próprio, com maior autonomia técnica e metodológica.

## 3. Estado atual da solução

Atualmente, o projeto possui quatro componentes principais:

1. **Formulário próprio hospedado na Vercel**
   - Aplicação web em Next.js.
   - Formulário dividido em etapas.
   - Uso de React Hook Form e Zod para validações.
   - Persistência parcial/local de rascunho no navegador.
   - Comunicação com API externa via `NEXT_PUBLIC_API_URL`.

2. **Banco de dados hospedado na Railway**
   - Utilizado como repositório das respostas do formulário.
   - O frontend atual consulta e salva dados por endpoints como `/v1/schools`, `/v1/census`, `/v1/locations` e `/v1/upload`.

3. **Google Sheets como camada de tratamento**
   - Planilhas servem para tratamento, criação de flags, faixas, índices e abas auxiliares.
   - Essa camada atualmente prepara os dados para o Looker Studio.

4. **Dashboard no Google DataStudio/Looker Studio**
   - Usado como painel gerencial atual.
   - Possui páginas temáticas com KPIs, gráficos, filtros e tabelas.
   - Está funcional, mas possui limitações de layout, customização, modelagem, performance, versionamento e evolução de lógica.

## 4. Diagnóstico técnico preliminar do repositório

O repositório `lucasonline0/CENSO-Operacional-Escolas` contém, no estado observado, principalmente a aplicação web do formulário.

### 4.1 Stack identificada no frontend

A aplicação frontend está no diretório `web` e utiliza:

- Next.js 16;
- React 19;
- TypeScript;
- Tailwind CSS;
- React Hook Form;
- Zod;
- Radix UI;
- Lucide React;
- jsPDF para geração de comprovante PDF;
- componentes próprios de UI.

### 4.2 Estrutura funcional atual do formulário

A página principal do formulário centraliza o fluxo multi-etapas e renderiza os componentes correspondentes conforme o passo atual.

As etapas atualmente configuradas são:

1. Identificação
2. Dados Gerais e Infraestrutura
3. Merenda Escolar
4. Serviços Gerais
5. Portaria
6. Equipamentos e Tecnologia
7. Servidores
8. Perfil dos Alunos
9. Gestão e Política
10. Avaliação e Notas
11. Observações Finais

### 4.3 Persistência e integração atual

O formulário utiliza uma lógica de persistência híbrida:

- busca dados salvos no servidor;
- salva rascunho local no `localStorage` por escola e etapa;
- mescla valores padrão, dados do servidor e rascunho local;
- envia os dados para a API conforme a etapa.

A identificação da escola é salva em `/v1/schools`; as demais seções do censo são gravadas em `/v1/census`, normalmente com `school_id`, `year`, `status` e objeto `data`.

### 4.4 Funcionalidades já existentes que devem ser preservadas

- Formulário multi-etapas.
- Seleção encadeada de DRE, município e escola.
- Validação dos campos obrigatórios.
- Rascunho local por etapa.
- Recuperação de dados já salvos.
- Upload de fotos na seção de infraestrutura.
- Geração de comprovante PDF após finalização.
- Layout institucional com referência ao Governo do Estado/SEDUC.

## 5. Limitações do modelo atual com Google Sheets e Looker Studio

A arquitetura atual foi adequada para validação rápida e construção inicial do painel, mas tende a gerar limitações em uma fase de uso gerencial contínuo.

### 5.1 Limitações técnicas

- Dependência de Google Sheets como camada intermediária.
- Lógica de indicadores dispersa em fórmulas de planilha.
- Dificuldade de versionar e auditar mudanças metodológicas.
- Risco de inconsistência entre banco, planilha e dashboard.
- Maior dificuldade para testes automatizados.
- Limitações de performance com aumento de volume de dados.
- Baixo controle sobre cache, segurança, permissões e exportações.

### 5.2 Limitações de visualização

- Baixa flexibilidade para layouts institucionais próprios.
- Dificuldade de criar páginas muito específicas, como ficha detalhada da escola.
- Limitações para componentes interativos customizados.
- Menor controle sobre experiência do usuário por perfil.
- Dificuldade para construir fluxos analíticos orientados à decisão.

### 5.3 Limitações metodológicas

- Fórmulas e regras de cálculo ficam menos rastreáveis.
- Alterações em flags e faixas podem não ficar documentadas no código.
- Dificuldade de criar histórico de versões dos indicadores.
- Dificuldade de integrar fontes adicionais, como bases da SEDUC/PA e INEP, de forma robusta.

## 6. Objetivo da nova plataforma de dashboard

Desenvolver uma aplicação própria de dashboard gerencial para o Censo Operacional e Estrutural, conectada diretamente ao banco de dados, com tratamento e cálculo de indicadores realizados por backend, views SQL, serviços de domínio ou camada analítica própria.

A nova plataforma deve permitir:

- leitura direta dos dados persistidos no banco;
- consolidação de dados declarados pelas escolas;
- integração futura com bases institucionais da SEDUC/PA;
- integração futura com resultados oficiais do INEP;
- filtros dinâmicos por DRE, município, escola, zona, porte, etapa, modalidade e outros recortes;
- páginas temáticas semelhantes às já planejadas no Looker Studio;
- indicadores reproduzíveis, auditáveis e versionáveis;
- exportação de dados, imagens ou relatórios;
- ficha técnica individual por escola;
- alertas e priorização gerencial.

## 7. Arquitetura-alvo proposta

A arquitetura-alvo recomendada é:

**Formulário Next.js → API/Backend → Banco Railway/PostgreSQL → Views/Serviços de Indicadores → Dashboard Próprio Next.js → Decisão Gerencial**

### 7.1 Componentes principais

#### 7.1.1 Aplicação web

Pode seguir duas alternativas:

**Alternativa A — Aplicação única**

- Manter o formulário e criar área `/dashboard` no mesmo projeto Next.js.
- Vantagens: reaproveitamento de UI, deploy único, menor complexidade inicial.
- Desvantagens: mistura de aplicação pública de coleta com área gerencial, exigindo boa separação de rotas e permissões.

**Alternativa B — Aplicação separada para dashboard**

- Criar novo app Next.js específico para o dashboard.
- Formulário permanece como aplicação própria.
- Vantagens: separação clara entre coleta e gestão, melhor organização, possibilidade de permissões e layouts distintos.
- Desvantagens: exige coordenação entre dois deploys e eventual pacote compartilhado de tipos/contratos.

**Recomendação inicial:** Alternativa B, caso o painel seja institucional e possua perfis de acesso distintos. Alternativa A é aceitável para MVP se o objetivo for acelerar.

#### 7.1.2 Banco de dados

O banco deve deixar de ser apenas repositório de respostas e passar a sustentar a camada analítica.

Recomenda-se:

- preservar tabelas transacionais atuais;
- criar views analíticas;
- criar views normalizadas para campos multivalorados;
- criar tabela ou view de indicadores por escola;
- criar tabela ou view de indicadores agregados por DRE/município;
- evitar que o dashboard consuma diretamente JSON bruto sem camada de interpretação.

#### 7.1.3 Camada de indicadores

A lógica atualmente presente nas planilhas deve migrar para uma das seguintes formas:

1. **Views SQL**
   - Boa para flags, faixas, agregações e normalizações simples.
   - Facilita consumo direto pelo dashboard.

2. **Serviços no backend**
   - Boa para regras mais complexas, parametrização e versionamento.
   - Permite testes automatizados em TypeScript ou outra linguagem adotada.

3. **Modelo híbrido**
   - Views SQL para normalização e agregações básicas.
   - Serviços de backend para indicadores compostos, regras evolutivas e permissões.

**Recomendação:** modelo híbrido.

## 8. Modelo de dados analítico recomendado

A arquitetura atual parece armazenar grande parte das respostas do censo em objeto `data` associado à escola. Para o dashboard próprio, isso pode funcionar inicialmente, mas será necessário criar uma camada analítica mais estruturada.

### 8.1 Entidades transacionais mínimas

- `schools`
  - id
  - codigo_inep
  - nome_escola
  - dre
  - municipio
  - zona
  - cnpj
  - endereco
  - dados do diretor
  - turnos

- `census`
  - id
  - school_id
  - year
  - status
  - data
  - created_at
  - updated_at

- `uploads`
  - id
  - school_id
  - tipo
  - url/path
  - created_at

### 8.2 Views ou tabelas analíticas recomendadas

#### `vw_escolas_base`

Uma linha por escola, consolidando identificação e dados básicos.

Campos sugeridos:

- school_id
- codigo_inep
- nome_escola
- dre
- municipio
- zona
- total_alunos
- porte_escola
- turnos
- etapas_ofertadas
- modalidades_ofertadas

#### `vw_indicadores_escola`

Uma linha por escola, com flags, faixas e indicadores calculados.

Campos sugeridos:

- school_id
- ano
- qtde_alunos
- porte_escola
- qtde_amb_essenciais
- faixa_amb_essenciais
- flag_infra_critica
- flag_risco_fluxo
- flag_risco_ideb
- flag_pendencia_financeira
- faixa_dependencia_temporarios
- indicadores de merenda
- indicadores de tecnologia
- indicadores de segurança
- indicadores de governança

#### `vw_ambientes_escola`

Normaliza ambientes em linhas.

Campos:

- school_id
- dre
- municipio
- zona
- ambiente
- possui

#### `vw_equipamentos_tecnologia`

Normaliza equipamentos de tecnologia.

Campos:

- school_id
- dre
- municipio
- zona
- tipo_equipamento
- quantidade

#### `vw_equipamentos_merenda`

Normaliza equipamentos da merenda.

Campos:

- school_id
- dre
- municipio
- zona
- tipo_equipamento
- quantidade
- estado ou disponibilidade, se houver

#### `vw_quadro_pessoal`

Normaliza quantitativos de pessoal.

Campos:

- school_id
- dre
- municipio
- zona
- tipo_pessoal
- quantidade

#### `vw_direcao_escolar`

Normaliza cargos de gestão.

Campos:

- school_id
- dre
- municipio
- zona
- cargo
- possui
- ordem

#### `vw_servicos_terceirizados`

Normaliza serviços gerais e portaria.

Campos:

- school_id
- dre
- municipio
- zona
- servico
- atende_necessidade
- terceirizado
- ha_supervisor

#### `vw_reprovacao_etapa`

Normaliza reprovação por etapa.

Campos:

- school_id
- dre
- municipio
- zona
- etapa
- taxa_reprovacao
- faixa_reprovacao

#### `vw_ideb_etapa`

Normaliza IDEB por etapa.

Campos:

- school_id
- dre
- municipio
- zona
- etapa
- ideb
- faixa_ideb

## 9. Páginas previstas para o dashboard próprio

A nova aplicação deve preservar a lógica temática já definida no painel atual, mas com liberdade para aprimorar experiência, filtros, detalhamento e navegação.

### 9.1 Página inicial / Visão Geral Executiva

Objetivo: apresentar uma síntese gerencial da rede.

Componentes sugeridos:

- Total de escolas respondentes.
- Total de alunos informados.
- Percentual de cobertura do censo, se houver base oficial de escolas esperadas.
- Número de DREs representadas.
- Distribuição por zona.
- Distribuição por porte.
- Mapa ou ranking por DRE/município.
- Cards de alertas críticos.

### 9.2 Caracterização da Rede

Blocos:

1. Dimensão e Perfil da Rede.
2. Organização da Oferta e Funcionamento.
3. Infraestrutura Educacional/Ambientes.
4. Estatística Descritiva.

Gráficos previstos:

- Total de escolas.
- Total de alunos.
- Média de alunos por escola.
- Distribuição de escolas por zona.
- Distribuição por porte.
- Matrículas por porte.
- Média de matrículas por porte.
- Etapas ofertadas.
- Modalidades ofertadas.
- Turnos de funcionamento.
- Média de turnos por porte.
- Presença de ambientes.

### 9.3 Infraestrutura e Segurança

Blocos:

1. Condições Estruturais e Ambientes.
2. Energia, Climatização e Capacidade Elétrica.
3. Segurança Física e Patrimonial.

Gráficos previstos:

- Situação estrutural das escolas.
- Escolas por faixa de cobertura de ambientes essenciais.
- Quantidade média de ambientes essenciais.
- Salas climatizadas versus total de salas.
- Rede elétrica atende à demanda atual.
- Rede elétrica suporta novos equipamentos.
- Presença de muro/cerca.
- Perímetro fechado.
- Controle de portão.
- Iluminação externa.
- Câmeras em funcionamento.

### 9.4 Merenda Escolar

Blocos:

1. Oferta, qualidade e atendimento da merenda.
2. Estrutura da cozinha/refeitório.
3. Equipamentos da merenda.
4. Armazenamento e segurança alimentar.
5. Recursos humanos da merenda.
6. Terceirização e governança.
7. Avaliação do serviço de merenda.

Gráficos previstos:

- Escolas que ofertam merenda.
- Frequência/regularidade da oferta.
- Avaliação da qualidade da merenda.
- Presença de cozinha/refeitório.
- Equipamentos disponíveis.
- Condições de armazenamento.
- Quantitativo e vínculo de merendeiras.
- Avaliação das merendeiras.

### 9.5 Serviços Terceirizados

Blocos:

1. Visão geral dos serviços terceirizados.
2. Serviços gerais.
3. Portaria.
4. Governança/síntese.

Gráficos previstos:

- Escolas com serviços gerais terceirizados.
- Escolas com portaria terceirizada.
- Serviços que atendem à necessidade.
- Presença de supervisor.
- Quantitativo de pessoal por vínculo.
- Avaliação da limpeza.
- Avaliação da portaria.
- Comunicação com empresa.
- Supervisão do serviço.

### 9.6 Tecnologia e Equipamentos

Blocos:

1. Infraestrutura Digital e Capacidade Instalada.
2. Uso Pedagógico e Adequação Tecnológica.

Gráficos previstos:

- Escolas com internet disponível.
- Provedor de internet.
- Qualidade/velocidade da internet.
- Quantidade de desktops administrativos.
- Quantidade de desktops para alunos.
- Notebooks.
- Chromebooks.
- Computadores atendem à demanda.
- Computadores inoperantes.
- Projetores multimídia.
- Lousa digital.

### 9.7 Pessoal e Gestão Escolar

Blocos:

1. Estrutura de gestão escolar.
2. Coordenação pedagógica e liderança acadêmica.
3. Quadro de pessoal e situações funcionais.

Gráficos previstos:

- Presença de direção escolar.
- Presença de vice-diretor pedagógico.
- Presença de vice-diretor administrativo.
- Presença de secretário escolar.
- Equipe de gestão completa/incompleta.
- Escolas com coordenador pedagógico.
- Faixas de quantitativo de coordenadores.
- Média de coordenadores por porte.
- Presença de coordenação por área.
- Composição do quadro de pessoal.
- Dependência de professores temporários.

### 9.8 Perfil dos Alunos e Resultados

Blocos:

1. Perfil socioeducacional e permanência.
2. Resultados e desempenho.

Gráficos previstos:

- Percentual de beneficiários de programas sociais.
- Faixa de beneficiários.
- Taxa de abandono/desistência.
- Ranking de DREs por taxa de abandono.
- Taxa de reprovação por etapa.
- IDEB médio por etapa.
- Distribuição por faixa de IDEB.
- Ranking de DREs por IDEB.
- IDEB médio por porte.
- Escolas com IDEB baixo.

### 9.9 Gestão Financeira e Governança

Blocos:

1. Governança institucional e regularização.
2. Execução financeira e prestação de contas.
3. Participação comunitária e risco de governança.

Gráficos previstos:

- Escola regularizada junto ao CEE/PA.
- Conselho Escolar constituído.
- Conselho Escolar ativo.
- Recebimento de PRODEP.
- Execução do PRODEP.
- Pendências na prestação de contas do PRODEP.
- Recebimento de recursos federais.
- Execução de recursos federais.
- Pendências na prestação de contas de recursos federais.
- Grêmio estudantil.
- Reuniões com comunidade escolar.
- Plano de evacuação e emergência.
- Política contra bullying/violência.

### 9.10 Alertas e Escolas Críticas

Objetivo: consolidar situações prioritárias para tomada de decisão.

Componentes sugeridos:

- Escolas com infraestrutura crítica.
- Escolas com baixa cobertura de ambientes essenciais.
- Escolas com problemas de energia.
- Escolas com pendência financeira.
- Escolas com risco de fluxo escolar.
- Escolas com IDEB baixo.
- Escolas com alta dependência de temporários.
- Filtros por DRE, município, zona e porte.
- Tabela priorizada com score de criticidade.

### 9.11 Detalhe da Escola / Ficha Técnica

Objetivo: apresentar uma visão completa de uma escola específica.

Componentes sugeridos:

- Dados de identificação.
- Localização e DRE.
- Porte.
- Turnos, etapas e modalidades.
- Infraestrutura.
- Segurança.
- Merenda.
- Serviços terceirizados.
- Tecnologia.
- Pessoal.
- Perfil dos alunos.
- Resultados.
- Governança.
- Observações e demandas urgentes.
- Fotos anexadas, quando disponíveis.
- Exportação em PDF.

## 10. Filtros globais recomendados

A aplicação deve possuir filtros globais aplicáveis às páginas do dashboard.

Filtros essenciais:

- Ano do censo.
- DRE.
- Município.
- Escola.
- Zona.
- Porte da escola.
- Etapas ofertadas.
- Modalidades ofertadas.
- Situação de preenchimento.

Filtros avançados:

- Infraestrutura crítica.
- Pendência financeira.
- Risco de abandono.
- IDEB baixo.
- Dependência de temporários.
- Baixa cobertura de ambientes essenciais.

## 11. Regras de tratamento que devem migrar das planilhas para o sistema

A lógica atualmente feita em planilhas deve ser identificada, documentada e migrada progressivamente.

### 11.1 Tratamentos prioritários

- Porte da escola.
- Quantidade de alunos.
- Faixas de porte.
- Quantidade de ambientes essenciais.
- Faixa de ambientes essenciais.
- Flags de infraestrutura crítica.
- Flags de risco de fluxo.
- Flags de risco IDEB.
- Dependência de temporários.
- Pendência financeira.
- Normalização de ambientes.
- Normalização de equipamentos de tecnologia.
- Normalização de equipamentos de merenda.
- Normalização de quadro de pessoal.
- Normalização de direção escolar.
- Normalização de serviços terceirizados.
- Normalização de reprovação por etapa.
- Normalização de IDEB por etapa.

### 11.2 Forma recomendada de implementação

Cada indicador deve possuir:

- nome técnico;
- nome de exibição;
- descrição gerencial;
- campos de origem;
- fórmula/regra;
- tipo: flag, índice, faixa, métrica ou dimensão;
- página onde será usado;
- status: planejado, implementado, validado, revisado;
- observações metodológicas.

## 12. Stack recomendada para o dashboard próprio

### 12.1 Frontend

- Next.js.
- TypeScript.
- Tailwind CSS.
- Componentes baseados em shadcn/ui ou Radix UI.
- Recharts, Nivo, Tremor, ECharts ou outra biblioteca de gráficos.
- TanStack Table para tabelas analíticas.
- React Query/TanStack Query para cache de dados.
- Zod para validação de contratos.

### 12.2 Backend/API

Duas opções principais:

**Opção A — API Routes/Route Handlers no próprio Next.js**

- Boa para MVP.
- Menor complexidade.
- Integração direta com Vercel.

**Opção B — Backend separado**

- Node/NestJS, Fastify, Express ou outro backend.
- Melhor para regras robustas, autenticação institucional e integrações.
- Pode permanecer na Railway ou ser separado por serviço.

**Recomendação inicial:** usar Route Handlers do Next.js para o MVP do dashboard, desde que a API existente seja simples e o volume seja administrável. Migrar para backend separado se houver necessidade de autenticação complexa, filas, importações, jobs ou integrações institucionais recorrentes.

### 12.3 Banco de dados

- PostgreSQL na Railway.
- Views SQL para camada analítica.
- Migrações versionadas.
- Índices para filtros por DRE, município, escola, zona, ano e codigo_inep.

### 12.4 Autenticação e autorização

O dashboard próprio deve prever autenticação, ainda que o MVP comece com proteção simples.

Perfis sugeridos:

- Administrador geral.
- Gestão central SEDUC/FADEP.
- DRE.
- Consulta institucional.

Regras futuras:

- Perfil central visualiza toda a rede.
- Perfil DRE visualiza apenas escolas da sua regional.
- Perfil escola visualiza apenas sua ficha, caso seja previsto acesso escolar.

## 13. APIs necessárias para o dashboard

Endpoints sugeridos:

### 13.1 Consulta geral

`GET /api/dashboard/overview`

Retorna:

- total de escolas;
- total de alunos;
- total de DREs;
- distribuição por zona;
- distribuição por porte;
- principais alertas.

### 13.2 Filtros

`GET /api/dashboard/filters`

Retorna:

- lista de DREs;
- municípios por DRE;
- escolas por município;
- zonas;
- portes;
- etapas;
- modalidades.

### 13.3 Páginas temáticas

- `GET /api/dashboard/caracterizacao`
- `GET /api/dashboard/infraestrutura`
- `GET /api/dashboard/merenda`
- `GET /api/dashboard/servicos-terceirizados`
- `GET /api/dashboard/tecnologia`
- `GET /api/dashboard/pessoal-gestao`
- `GET /api/dashboard/alunos-resultados`
- `GET /api/dashboard/financeiro-governanca`
- `GET /api/dashboard/alertas`

Cada endpoint deve aceitar query params de filtros globais.

### 13.4 Ficha da escola

`GET /api/dashboard/escolas/:id`

Retorna a ficha consolidada da escola.

### 13.5 Exportações

- `GET /api/dashboard/export/csv`
- `GET /api/dashboard/export/pdf`

## 14. Estratégia de migração das planilhas para o banco

A migração deve ser feita em etapas, para reduzir risco e permitir validação.

### Etapa 1 — Inventário

- Listar todas as abas atuais do Google Sheets.
- Listar colunas criadas em `Indicadores_Flags`.
- Listar abas auxiliares existentes.
- Listar fórmulas críticas.
- Mapear quais gráficos do Looker usam quais campos.

### Etapa 2 — Catálogo de indicadores

- Criar documento ou arquivo `docs/indicadores-censo.md`.
- Definir nome, descrição, fórmula e origem de cada indicador.
- Separar indicadores validados de indicadores experimentais.

### Etapa 3 — Views analíticas iniciais

Criar views equivalentes às abas mais importantes:

- `Indicadores_Flags` → `vw_indicadores_escola`.
- `Equipamentos_Tecnologia` → `vw_equipamentos_tecnologia`.
- `Resumo_Servicos_Terceirizados` → `vw_servicos_terceirizados`.
- `Quadro_Pessoal_Aux` → `vw_quadro_pessoal`.
- `Direcao_Escolar_Aux` → `vw_direcao_escolar`.
- `Reprovacao_Etapa_Aux` → `vw_reprovacao_etapa`.

### Etapa 4 — Dashboard MVP

Implementar primeiro:

1. Página Visão Geral.
2. Página Caracterização da Rede.
3. Página Infraestrutura e Segurança.
4. Página Detalhe da Escola.

### Etapa 5 — Páginas restantes

Implementar progressivamente:

- Merenda Escolar.
- Serviços Terceirizados.
- Tecnologia e Equipamentos.
- Pessoal e Gestão.
- Perfil dos Alunos e Resultados.
- Gestão Financeira e Governança.
- Alertas e Escolas Críticas.

### Etapa 6 — Integrações externas

Incorporar bases adicionais:

- cadastro oficial de escolas da SEDUC;
- dados administrativos internos;
- dados oficiais do INEP;
- IDEB e demais resultados educacionais;
- outras bases estratégicas definidas pela gestão.

## 15. Roadmap técnico sugerido

### Fase 0 — Varredura e documentação

Objetivo: consolidar entendimento do estado atual.

Entregas:

- Documento de arquitetura atual.
- Inventário das telas do formulário.
- Inventário das páginas do dashboard Looker.
- Catálogo inicial de indicadores.
- Mapa das planilhas e fórmulas.

### Fase 1 — Fundação do dashboard próprio

Objetivo: criar base técnica da nova aplicação.

Entregas:

- Nova aplicação Next.js ou nova área `/dashboard`.
- Layout institucional.
- Sistema de filtros globais.
- Conexão segura com banco/API.
- Componentes de KPI, gráfico, tabela e cards de alerta.

### Fase 2 — Camada analítica no banco

Objetivo: substituir dependência das planilhas.

Entregas:

- Views SQL iniciais.
- Normalização dos campos multivalorados.
- Indicadores por escola.
- Agregações por DRE, município e zona.

### Fase 3 — MVP gerencial

Objetivo: disponibilizar primeiras páginas úteis para gestão.

Entregas:

- Visão Geral.
- Caracterização da Rede.
- Infraestrutura e Segurança.
- Ficha da Escola.

### Fase 4 — Expansão temática

Objetivo: cobrir todas as dimensões do censo.

Entregas:

- Merenda Escolar.
- Serviços Terceirizados.
- Tecnologia.
- Pessoal e Gestão.
- Perfil dos Alunos e Resultados.
- Gestão Financeira e Governança.

### Fase 5 — Alertas, priorização e integração institucional

Objetivo: transformar o painel em instrumento estratégico de decisão.

Entregas:

- Página de alertas.
- Score de criticidade.
- Exportações.
- Integração com bases SEDUC.
- Integração com INEP.
- Perfis de acesso.

## 16. Decisões arquiteturais recomendadas

### 16.1 Não tratar dados no frontend

O frontend deve consumir dados já tratados pela API ou por views SQL.

Evitar:

- cálculos complexos em componentes React;
- regras de negócio espalhadas nos gráficos;
- duplicação de fórmulas no frontend.

### 16.2 Cada gráfico deve ter contrato próprio

Cada componente de gráfico deve receber dados em formato simples.

Exemplo:

```ts
type ChartDatum = {
  label: string;
  value: number;
  percentage?: number;
};
```

### 16.3 Separar dado declarado de indicador calculado

O sistema deve diferenciar:

- resposta declarada pela escola;
- dado validado por fonte institucional;
- indicador derivado;
- alerta gerencial.

### 16.4 Permitir evolução metodológica

Os indicadores devem ser versionáveis, pois a metodologia poderá mudar.

Exemplo:

- `flag_infra_critica_v1`;
- `score_criticidade_v1`;
- `faixa_amb_essenciais_v1`.

### 16.5 Manter trilha documental

Toda regra de indicador deve estar documentada em `/docs`.

Sugestão:

- `docs/dashboard/arquitetura-dashboard.md`
- `docs/dashboard/catalogo-indicadores.md`
- `docs/dashboard/modelagem-analitica.md`
- `docs/dashboard/roadmap-dashboard-proprio.md`

## 17. Estrutura sugerida de pastas

Caso o dashboard seja criado dentro do app `web`:

```txt
web/
  src/
    app/
      page.tsx
      dashboard/
        layout.tsx
        page.tsx
        caracterizacao/
          page.tsx
        infraestrutura/
          page.tsx
        merenda/
          page.tsx
        servicos-terceirizados/
          page.tsx
        tecnologia/
          page.tsx
        pessoal-gestao/
          page.tsx
        alunos-resultados/
          page.tsx
        financeiro-governanca/
          page.tsx
        alertas/
          page.tsx
        escolas/[id]/
          page.tsx
      api/
        dashboard/
          overview/route.ts
          filters/route.ts
          caracterizacao/route.ts
          infraestrutura/route.ts
          escolas/[id]/route.ts
    components/
      dashboard/
        kpi-card.tsx
        chart-card.tsx
        filter-bar.tsx
        alert-card.tsx
        data-table.tsx
        page-header.tsx
    lib/
      db.ts
      dashboard/
        queries.ts
        indicators.ts
        formatters.ts
    types/
      dashboard.ts
```

Caso seja criada uma aplicação separada:

```txt
dashboard/
  src/
    app/
    components/
    lib/
    types/
  docs/
```

## 18. Bibliotecas de gráficos candidatas

### Recharts

Vantagens:

- simples;
- boa integração com React;
- adequada para MVP;
- curva de aprendizado baixa.

Limitações:

- mapas e visualizações muito customizadas podem exigir complementos.

### Apache ECharts

Vantagens:

- muito poderoso;
- excelente para dashboards avançados;
- bom para interatividade, mapas, séries grandes e gráficos complexos.

Limitações:

- configuração mais extensa.

### Nivo

Vantagens:

- visual moderno;
- muitos tipos de gráficos.

Limitações:

- pode ser mais pesado.

**Recomendação inicial:** Recharts para MVP, com possibilidade de ECharts para mapas e visualizações avançadas.

## 19. Requisitos não funcionais

### 19.1 Performance

- Cache por página e filtros.
- Índices no banco.
- Paginação em tabelas grandes.
- Evitar trazer todo o dataset para o frontend.
- Agregações feitas no banco.

### 19.2 Segurança

- Autenticação para acesso ao dashboard.
- Proteção de variáveis de ambiente.
- API key nunca exposta indevidamente no frontend quando houver dados sensíveis.
- Separação entre formulário público e painel gerencial.
- Permissões por perfil.

### 19.3 Auditabilidade

- Versionamento dos indicadores.
- Documentação das regras.
- Registro de data da última atualização.
- Identificação da fonte de cada indicador.

### 19.4 Manutenibilidade

- Componentes reutilizáveis.
- Contratos tipados.
- Serviços de consulta centralizados.
- Documentação atualizada.
- Testes para indicadores críticos.

## 20. Principais riscos

### 20.1 Risco de divergência entre planilha e banco

Mitigação:

- congelar uma versão de referência das fórmulas atuais;
- comparar resultados da view SQL com os resultados da planilha;
- validar por amostragem de escolas.

### 20.2 Risco de excesso de escopo no primeiro ciclo

Mitigação:

- iniciar com MVP enxuto;
- implementar poucas páginas com alta utilidade gerencial;
- adiar integrações externas para fase posterior.

### 20.3 Risco de indicadores prematuros

Mitigação:

- separar dados declarados de indicadores calculados;
- documentar indicadores experimentais;
- validar metodologia com gestão antes de consolidar scores.

### 20.4 Risco de performance

Mitigação:

- usar views materializadas se necessário;
- criar índices;
- cachear respostas agregadas;
- evitar consultas JSON sem otimização.

## 21. Primeiras tarefas recomendadas

1. Criar pasta de documentação do dashboard próprio.
2. Inventariar o banco atual na Railway.
3. Exportar ou documentar o esquema atual das tabelas.
4. Mapear todos os campos do objeto `data` do censo.
5. Listar todas as fórmulas das planilhas atuais.
6. Criar catálogo de indicadores.
7. Definir se o dashboard ficará no mesmo app ou em app separado.
8. Criar protótipo da página Visão Geral.
9. Criar primeira view `vw_escolas_base`.
10. Criar primeira view `vw_indicadores_escola`.
11. Implementar filtros globais.
12. Reproduzir a página Caracterização da Rede.
13. Reproduzir a página Infraestrutura e Segurança.
14. Criar Ficha Técnica da Escola.

## 22. Prompt recomendado para Codex ou agente de implementação

```txt
Estamos evoluindo o projeto CENSO-Operacional-Escolas para incluir um dashboard próprio, substituindo gradualmente o Google DataStudio/Looker Studio e removendo a dependência das planilhas Google como camada de tratamento.

Repositório: lucasonline0/CENSO-Operacional-Escolas
Branch: main

Antes de implementar, realize uma varredura completa no repositório para entender:
- estrutura atual do app Next.js em web/;
- fluxo do formulário multi-etapas;
- chamadas para a API externa via NEXT_PUBLIC_API_URL;
- endpoints usados atualmente: /v1/schools, /v1/census, /v1/locations, /v1/upload;
- schemas Zod e tipos existentes;
- componentes reutilizáveis de UI;
- geração de comprovante PDF;
- persistência local por etapa;
- dependências atuais no package.json.

Depois, proponha um plano técnico para criar o dashboard próprio, preferencialmente preservando o formulário atual e adicionando uma nova área /dashboard ou, se tecnicamente mais adequado, sugerindo um app separado.

A proposta deve contemplar:
- arquitetura do dashboard;
- organização de rotas e componentes;
- camada de consultas ao banco/API;
- views SQL ou serviços para substituir as fórmulas hoje feitas em Google Sheets;
- páginas do dashboard: Visão Geral, Caracterização da Rede, Infraestrutura e Segurança, Merenda, Serviços Terceirizados, Tecnologia, Pessoal e Gestão, Perfil dos Alunos e Resultados, Gestão Financeira e Governança, Alertas e Ficha Técnica da Escola;
- filtros globais;
- estratégia de migração dos indicadores;
- riscos técnicos;
- primeiro incremento implementável sem quebrar o formulário existente.

Não implemente ainda. Primeiro entregue diagnóstico, arquitetura proposta e plano incremental.
```

## 23. Conclusão

A migração do dashboard para uma plataforma própria é uma evolução natural do projeto. O formulário atual já oferece uma base importante de coleta e persistência dos dados. O próximo passo é transformar a camada analítica, hoje dependente de Google Sheets e Looker Studio, em uma solução versionada, auditável e integrada ao banco de dados.

A recomendação é avançar em ciclos:

1. documentar o estado atual;
2. mapear indicadores;
3. criar views analíticas;
4. implementar dashboard MVP;
5. validar com os dados atuais;
6. expandir páginas;
7. integrar fontes SEDUC/INEP;
8. consolidar perfis de acesso e alertas gerenciais.

O objetivo final é que o painel deixe de ser apenas uma visualização de respostas do formulário e passe a ser uma plataforma institucional de inteligência gerencial da rede estadual.

