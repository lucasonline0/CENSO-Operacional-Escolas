# Especificacao Funcional - Relatorios Gerenciais por Aba

## 1. Contexto

O Dashboard do Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA apresenta indicadores consolidados por diferentes dimensoes da realidade escolar, incluindo caracterizacao da rede, pessoal e gestao escolar, tecnologia, infraestrutura e seguranca, merenda escolar, servicos terceirizados, perfil dos alunos e resultados, gestao financeira, governanca, saude operacional e acompanhamento do preenchimento do censo.

Atualmente, os cards, graficos e tabelas oferecem uma visao agregada e analitica dos dados. Para apoiar a atuacao da gestao, e necessario permitir que determinados recortes sejam transformados em relatorios nominais, identificando escola a escola as situacoes que demandam acompanhamento, priorizacao ou acao administrativa.

Este documento registra a decisao funcional de organizar os relatorios por aba ou dimensao do dashboard, em vez de criar exportacoes fragmentadas para cada card individual.

## 2. Decisao funcional

A estrategia adotada sera implementar relatorios gerenciais por aba ou dimensao do dashboard.

Em vez de criar um botao de exportacao individual para cada card ou grafico, cada aba devera ter um ou mais relatorios caracteristicos, reunindo as informacoes mais relevantes daquela dimensao em uma estrutura unica, nominal e orientada a tomada de decisao.

Fluxo conceitual:

```text
Aba analitica -> Relatorio caracteristico da dimensao -> Exportacao XLSX/PDF -> Acao da gestao
```

Essa abordagem evita fragmentacao excessiva, reduz a poluicao visual da interface e gera relatorios mais completos e uteis para equipes tecnicas, DREs e gestao central.

## 3. Justificativa

A opcao por relatorios por aba apresenta as seguintes vantagens:

- organiza os relatorios por dimensao de gestao;
- evita excesso de botoes em cards e graficos;
- permite relatorios mais completos, com multiplos indicadores relacionados;
- facilita o uso institucional dos relatorios por equipes tecnicas, DREs e gestao central;
- simplifica a arquitetura tecnica, permitindo a criacao de endpoints de relatorio por dominio;
- mantem coerencia com os filtros globais ja existentes no dashboard;
- permite criar tanto relatorios completos quanto relatorios focados em situacoes criticas;
- aproxima o dashboard de um instrumento de diagnostico, priorizacao e encaminhamento de providencias.

## 4. Padrao geral dos relatorios

Todos os relatorios nominais devem respeitar os filtros globais aplicados no dashboard, incluindo, quando disponiveis:

- Ano;
- Regiao de Integracao;
- DRE;
- Municipio;
- Zona.

Os relatorios devem iniciar com um conjunto comum de colunas de identificacao da escola:

| Campo |
|---|
| Regiao de Integracao |
| DRE |
| Municipio |
| Zona |
| Codigo INEP |
| Escola |

Apos essas colunas, cada relatorio deve incluir os campos especificos da respectiva aba ou dimensao.

## 5. Tipos de relatorio por aba

Cada aba podera possuir dois tipos principais de relatorio.

### 5.1 Relatorio completo da aba

Relatorio com visao ampla da dimensao, contendo os principais campos utilizados nos cards, graficos e tabelas da aba.

Exemplo: Relatorio de Condicoes da Merenda Escolar, contendo oferta regular, qualidade da merenda, atendimento as necessidades, condicoes da cozinha, existencia de refeitorio, equipamentos e pendencias sanitarias.

### 5.2 Relatorio critico da aba

Relatorio focado apenas em situacoes que demandam providencia, acompanhamento ou priorizacao.

Exemplo: Relatorio de Escolas com Situacao Critica de Merenda, contendo escolas sem oferta regular, merenda que nao atende as necessidades, cozinha precaria, refeitorio inadequado ou equipamentos inoperantes.

## 6. Relatorios previstos por aba

### 6.1 Caracterizacao da Rede

Relatorio completo:

- Relatorio de Perfil da Rede Escolar.

Relatorios analiticos complementares:

- Escolas por porte;
- Escolas por zona;
- Escolas por etapa ofertada;
- Escolas por modalidade ofertada;
- Escolas com baixa cobertura de ambientes essenciais;
- Escolas sem cobertura plena de ambientes essenciais.

Campos principais:

| Campo |
|---|
| Porte da escola |
| Total de alunos |
| Salas de aula |
| Alunos por sala |
| Etapas ofertadas |
| Modalidades ofertadas |
| Turnos de funcionamento |
| Ambientes essenciais existentes |
| Cobertura de ambientes essenciais |

### 6.2 Pessoal e Gestao Escolar

Relatorio completo:

- Relatorio de Quadro de Pessoal e Gestao Escolar.

Relatorios criticos:

- Escolas sem coordenador pedagogico;
- Escolas com baixa cobertura de coordenacao;
- Escolas com alta dependencia de professores temporarios;
- Escolas com deficit de quadro administrativo.

Campos principais:

| Campo |
|---|
| Coordenadores pedagogicos |
| Cobertura de coordenacao |
| Coordenacao por area |
| Professores efetivos |
| Professores temporarios |
| Servidores administrativos |
| Professores readaptados |
| Media de efetivos por escola |
| Media de temporarios por escola |

### 6.3 Tecnologia e Equipamentos

Relatorio completo:

- Relatorio de Infraestrutura Tecnologica Escolar.

Relatorios criticos:

- Escolas sem internet;
- Escolas com internet precaria;
- Escolas cujos computadores nao atendem a demanda;
- Escolas com computadores inoperantes;
- Escolas com parque tecnologico insuficiente.

Campos principais:

| Campo |
|---|
| Possui internet |
| Qualidade da conexao |
| Provedor |
| Computadores atendem a demanda |
| Desktops administrativos |
| Desktops de alunos |
| Notebooks |
| Chromebooks |
| Computadores inoperantes |
| Projetores |
| Lousa digital |

### 6.4 Infraestrutura, Energia e Seguranca

Relatorio completo:

- Relatorio de Infraestrutura, Energia e Seguranca Escolar.

Relatorios criticos:

- Escolas em reforma critica;
- Escolas com obra parada;
- Escolas que necessitam reforma geral;
- Escolas cuja rede eletrica nao atende a demanda;
- Escolas sem estrutura para climatizacao;
- Escolas com salas nao climatizadas;
- Escolas sem cameras funcionais;
- Escolas sem muro/cerca ou perimetro fechado;
- Escolas com iluminacao externa insuficiente.

Campos principais:

| Campo |
|---|
| Tipo de predio |
| Situacao da estrutura |
| Necessidade de reforma |
| Obra parada |
| Rede eletrica atende a demanda |
| Estrutura permite climatizacao |
| Salas climatizadas |
| Salas nao climatizadas |
| Guarita |
| Botao de panico |
| Plano de evacuacao |
| Cameras |
| Controle de portao |
| Iluminacao externa |
| Muro/cerca |
| Perimetro fechado |

### 6.5 Merenda Escolar

Relatorio completo:

- Relatorio de Condicoes da Merenda Escolar.

Relatorios criticos:

- Escolas em que a merenda nao atende as necessidades;
- Escolas sem oferta regular de merenda;
- Escolas com cozinha precaria;
- Escolas sem refeitorio;
- Escolas com refeitorio inadequado;
- Escolas com equipamentos de merenda ruins ou inoperantes;
- Escolas com pendencias sanitarias e de seguranca da cozinha.

Campos principais:

| Campo |
|---|
| Oferta regular de merenda |
| Qualidade da merenda |
| Merenda atende as necessidades |
| Condicoes da cozinha |
| Tamanho da cozinha |
| Possui refeitorio |
| Refeitorio adequado |
| Freezers |
| Geladeiras |
| Fogoes |
| Bebedouros |
| Equipamentos criticos |
| Despensa |
| Deposito de conserva |
| EPI |
| Extintores |
| Manutencao preventiva |

### 6.6 Servicos Terceirizados

Relatorio completo:

- Relatorio de Servicos Terceirizados por Escola.

Relatorios criticos:

- Escolas sem agentes de portaria;
- Escolas com baixa quantidade de agentes de portaria;
- Escolas sem manipuladores suficientes;
- Escolas em que manipuladores de alimentos nao atendem a necessidade;
- Escolas sem supervisor;
- Escolas por empresa terceirizada.

Campos principais:

| Campo |
|---|
| Servicos gerais |
| Quantidade de trabalhadores de servicos gerais |
| Empresa de servicos gerais |
| Agentes de portaria |
| Empresa de portaria |
| Manipuladores de alimentos |
| Empresa de alimentacao |
| Supervisor |
| Atende a necessidade |
| Areas terceirizadas |

### 6.7 Perfil dos Alunos e Resultados

Relatorio completo:

- Relatorio de Resultados Educacionais por Escola.

Relatorios criticos:

- Escolas com menor IDEB por etapa;
- Escolas sem IDEB divulgado;
- Escolas com baixa participacao;
- Registros IDEB sem vinculo cadastral.

Campos principais:

| Campo |
|---|
| Etapa |
| IDEB |
| Proficiencia em Lingua Portuguesa |
| Proficiencia em Matematica |
| Fluxo |
| Participacao |
| Situacao IDEB |
| Vinculo cadastral |

### 6.8 Gestao Financeira e Governanca

Relatorios completos:

- Relatorio Financeiro PRODEP por Escola;
- Relatorio de Governanca Escolar.

Relatorios criticos:

- Escolas que nao prestaram contas;
- Escolas com maior percentual reprogramado;
- Escolas sem vinculo operacional;
- Escolas com governanca critica;
- Escolas sem conselho ativo;
- Escolas sem regularizacao CEE.

Campos principais do relatorio financeiro:

| Campo |
|---|
| Codigo INEP PRODEP |
| Total recebido |
| Total reprogramado |
| Percentual reprogramado |
| Status de prestacao de contas |
| Vinculo operacional |

Campos principais do relatorio de governanca:

| Campo |
|---|
| Conselho constituido |
| Conselho ativo |
| Regularizacao CEE |
| Governanca completa |
| Governanca critica |

### 6.9 Saude Operacional

Relatorio completo:

- Relatorio de Indice de Saude Operacional por Escola.

Relatorios criticos:

- Escolas criticas;
- Escolas em atencao;
- Escolas sem dados;
- Piores escolas por dimensao;
- Escolas com maior criticidade.

Campos principais:

| Campo |
|---|
| Alunos |
| Salas |
| Alunos por sala |
| Indice de Saude |
| Criticidade |
| Status |
| Infraestrutura |
| Energia |
| Merenda |
| Seguranca |
| Pessoal |
| Tecnologia |
| Pedagogico |
| Governanca |

### 6.10 Acompanhamento do Preenchimento do Censo

Relatorio completo:

- Relatorio de Acompanhamento do Preenchimento do Censo.

Relatorios criticos:

- Escolas pendentes de preenchimento;
- Escolas com rascunho;
- Escolas pendentes de sincronizacao;
- Relatorio de cobranca por DRE.

Campos principais:

| Campo |
|---|
| Status do censo |
| Ano |
| Ultima atualizacao |
| Sincronizado com planilha |
| Situacao operacional |
| DRE responsavel |
| Municipio |
| Escola |

## 7. Priorizacao da primeira versao

A primeira versao deve focar nos relatorios de maior impacto gerencial e maior aderencia operacional.

Relatorios recomendados para a primeira fase:

| Ordem | Relatorio | Aba |
|---:|---|---|
| 1 | Relatorio de Indice de Saude Operacional por Escola | Saude Operacional |
| 2 | Relatorio de Infraestrutura, Energia e Seguranca Escolar | Infraestrutura |
| 3 | Relatorio de Condicoes da Merenda Escolar | Merenda |
| 4 | Relatorio de Infraestrutura Tecnologica Escolar | Tecnologia |
| 5 | Relatorio de Acompanhamento do Preenchimento do Censo | Preenchimento |

Esses cinco relatorios cobrem necessidades imediatas da gestao: priorizacao de escolas criticas, infraestrutura, alimentacao escolar, conectividade/equipamentos e acompanhamento da coleta do censo.

## 8. Formatos de exportacao

A implementacao deve priorizar inicialmente o formato XLSX, por ser mais util para analise, filtro, compartilhamento entre equipes e encaminhamento para DREs.

O formato PDF podera ser incorporado em fase posterior, com layout institucional, cabecalho da SEDUC/PA, resumo dos filtros aplicados e tabela nominal.

## 9. Diretriz de interface

Cada aba devera possuir um botao de relatorio, preferencialmente no topo da aba ou proximo ao indicador de fonte dos dados.

Exemplo:

```text
Gerar relatorio
```

Ao clicar, o usuario podera escolher:

- relatorio completo da aba;
- relatorio critico da aba;
- formato de saida;
- confirmacao dos filtros aplicados.

## 10. Diretriz tecnica inicial

A implementacao deve criar uma camada propria de relatorios no backend, protegida por autenticacao administrativa, reutilizando os filtros globais ja existentes no dashboard.

A rota podera seguir o padrao:

```http
GET /v1/admin/reports/{report_id}?format=xlsx&year=2026&dre=...&municipio=...&zona=...&regiao_integracao=...
```

Cada relatorio devera possuir um identificador proprio, um titulo, uma descricao, um conjunto de colunas e uma consulta associada.

## 11. Encaminhamento

Apos validacao desta especificacao funcional, o proximo passo sera elaborar a especificacao tecnica para implementacao, contendo:

- catalogo inicial de `report_id`;
- payload esperado;
- rotas backend;
- comportamento do frontend;
- estrategia de geracao XLSX;
- fatiamento em PRs;
- criterios de aceite.
