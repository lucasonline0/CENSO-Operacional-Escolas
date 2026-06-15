# Especificacao Tecnica - Relatorios Gerenciais por Aba

## 1. Objetivo

Este documento detalha a proposta tecnica para implementar a camada de relatorios gerenciais do Dashboard do Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA.

A especificacao parte da decisao funcional registrada em `docs/relatorios-gerenciais-por-aba.md`: os relatorios devem ser organizados por aba ou dimensao do dashboard, e nao como exportacoes isoladas de cada card.

O objetivo inicial e permitir que a gestao gere relatorios nominais em XLSX a partir dos dados ja consolidados no PostgreSQL e exibidos nas abas analiticas do painel administrativo.

## 2. Principios de implementacao

A implementacao deve seguir estes principios:

- preservar a arquitetura atual do dashboard;
- nao alterar a regra dos indicadores existentes;
- reaproveitar os filtros globais ja usados pelas abas analiticas;
- gerar arquivos no backend, nao no frontend;
- iniciar pelo formato XLSX;
- manter os endpoints protegidos por autenticacao administrativa;
- garantir que o relatorio respeite o mesmo recorte exibido no painel;
- criar uma camada extensivel para novos relatorios por aba.

## 3. Escopo da primeira fase

A primeira fase deve implementar cinco relatorios completos, um por dimensao prioritaria:

| Ordem | report_id | Relatorio | Aba |
|---:|---|---|---|
| 1 | `saude-operacional-escolas` | Relatorio de Indice de Saude Operacional por Escola | Saude Operacional |
| 2 | `infraestrutura-seguranca-escolas` | Relatorio de Infraestrutura, Energia e Seguranca Escolar | Infraestrutura |
| 3 | `merenda-escolar-condicoes` | Relatorio de Condicoes da Merenda Escolar | Merenda |
| 4 | `tecnologia-infraestrutura-escolar` | Relatorio de Infraestrutura Tecnologica Escolar | Tecnologia |
| 5 | `censo-preenchimento-escolas` | Relatorio de Acompanhamento do Preenchimento do Censo | Preenchimento |

Relatorios criticos especificos por aba poderao ser adicionados na segunda fase.

## 4. Rota backend proposta

Criar uma rota protegida por autenticacao administrativa:

```http
GET /v1/admin/reports/{report_id}
```

Parametros de query:

| Parametro | Tipo | Obrigatorio | Observacao |
|---|---|---:|---|
| `format` | string | Nao | Inicialmente aceitar `xlsx`. Default: `xlsx`. |
| `year` | int | Nao | Ano de referencia. Default: ano corrente ou padrao do dashboard. |
| `dre` | string | Nao | Filtro global por DRE. |
| `municipio` | string | Nao | Filtro global por municipio. |
| `zona` | string | Nao | Filtro global por zona. |
| `regiao_integracao` | string | Nao | Filtro global por regiao de integracao. |
| `scope` | string | Nao | Futuro: `completo` ou `critico`. Default: `completo`. |

Exemplo:

```http
GET /v1/admin/reports/merenda-escolar-condicoes?format=xlsx&year=2026&dre=DRE%20Belem
```

## 5. Autenticacao e autorizacao

A rota deve reutilizar o middleware administrativo existente, seguindo o mesmo padrao das rotas analiticas atuais:

```text
Authorization: Bearer <admin_token>
```

O endpoint deve retornar `401 Unauthorized` quando o token estiver ausente, invalido ou expirado.

## 6. Estrutura sugerida no backend

Criar arquivos dedicados no backend para evitar misturar a logica de relatorios com os handlers analiticos existentes.

Estrutura sugerida:

```text
api/cmd/api/reports.go
api/cmd/api/reports_catalog.go
api/cmd/api/reports_xlsx.go
```

Responsabilidades:

| Arquivo | Responsabilidade |
|---|---|
| `reports.go` | Handler HTTP, parse de parametros, roteamento por report_id. |
| `reports_catalog.go` | Catalogo de relatorios, metadados, colunas e consultas. |
| `reports_xlsx.go` | Geracao de arquivo XLSX, estilos basicos, nome da planilha e resposta binaria. |

Opcionalmente, se a implementacao crescer, os relatorios podem ser separados por dominio:

```text
api/cmd/api/reports_merenda.go
api/cmd/api/reports_infraestrutura.go
api/cmd/api/reports_tecnologia.go
api/cmd/api/reports_saude.go
api/cmd/api/reports_preenchimento.go
```

## 7. Catalogo de relatorios

Cada relatorio deve ser registrado em um catalogo interno.

Estrutura conceitual:

```go
type ReportDefinition struct {
    ID          string
    Title       string
    Description string
    SheetName   string
    Columns     []ReportColumn
    Query       func(filters AnalyticsFilters) (string, []any)
}

type ReportColumn struct {
    Key   string
    Label string
    Type  string
}
```

Campos minimos por relatorio:

| Campo | Descricao |
|---|---|
| `ID` | Identificador usado na rota. |
| `Title` | Titulo institucional do relatorio. |
| `Description` | Descricao curta para uso futuro no frontend. |
| `SheetName` | Nome da aba dentro do XLSX. |
| `Columns` | Colunas do arquivo. |
| `Query` | Consulta SQL ou funcao que retorna SQL + argumentos. |

## 8. Padrao de filtros

A camada de relatorios deve reaproveitar a logica de filtros globais ja usada nos endpoints analiticos.

Sempre que possivel, utilizar a mesma estrutura conceitual dos filtros analiticos:

```text
year
regiao_integracao
dre
municipio
zona
```

Regras:

- filtrar apenas censos concluidos quando o relatorio depender dos dados do censo;
- respeitar o ano selecionado;
- aplicar filtros territoriais antes da selecao nominal;
- quando o relatorio usar dados externos ao censo, documentar filtros nao aplicaveis;
- quando o campo regiao de integracao depender de tabela auxiliar, usar a mesma subconsulta/padrao ja adotado nos endpoints analiticos.

## 9. Padrao comum de colunas

Todos os relatorios nominais da primeira fase devem iniciar com as seguintes colunas:

| Ordem | Coluna |
|---:|---|
| 1 | Regiao de Integracao |
| 2 | DRE |
| 3 | Municipio |
| 4 | Zona |
| 5 | Codigo INEP |
| 6 | Escola |

Depois dessas colunas, cada relatorio adiciona os campos especificos da aba.

## 10. Relatorio 1 - Saude Operacional

### report_id

```text
saude-operacional-escolas
```

### Titulo

```text
Relatorio de Indice de Saude Operacional por Escola
```

### Fonte de dados sugerida

Reaproveitar a mesma base logica do endpoint:

```text
/v1/admin/analytics/escolas/saude-operacional
```

A implementacao deve evitar depender apenas da pagina atual. O relatorio deve exportar todos os registros do recorte filtrado.

### Colunas especificas

| Coluna |
|---|
| Total de alunos |
| Salas de aula |
| Alunos por sala |
| Indice de saude |
| Criticidade |
| Status operacional |
| Nota Infraestrutura |
| Nota Energia |
| Nota Merenda |
| Nota Seguranca |
| Nota Pessoal |
| Nota Tecnologia |
| Nota Pedagogico |
| Nota Governanca |

### Ordenacao padrao

```text
criticidade desc
```

### Criterio de aceite

- exporta todas as escolas do recorte;
- respeita filtros globais;
- ordena por maior criticidade;
- inclui escolas sem dados, quando fizerem parte do universo operacional;
- nao limita o resultado a pagina exibida no frontend.

## 11. Relatorio 2 - Infraestrutura, Energia e Seguranca

### report_id

```text
infraestrutura-seguranca-escolas
```

### Titulo

```text
Relatorio de Infraestrutura, Energia e Seguranca Escolar
```

### Fonte de dados sugerida

Usar views e/ou consultas associadas aos endpoints de infraestrutura:

```text
/v1/admin/analytics/infraestrutura/condicoes
/v1/admin/analytics/infraestrutura/seguranca
/v1/admin/analytics/infraestrutura/energia
```

### Colunas especificas

| Coluna |
|---|
| Tipo de predio |
| Situacao da estrutura |
| Necessidade de reforma |
| Obra parada |
| Reforma critica |
| Rede eletrica atende a demanda |
| Estrutura permite climatizacao |
| Total de salas |
| Salas climatizadas |
| Salas nao climatizadas |
| Possui guarita |
| Possui botao de panico |
| Possui plano de evacuacao |
| Status das cameras |
| Controle de portao |
| Iluminacao externa |
| Possui muro ou cerca |
| Perimetro fechado |

### Ordenacao padrao

Priorizar situacoes criticas:

```text
reforma_critica desc, obra_parada desc, dre asc, municipio asc, escola asc
```

### Criterio de aceite

- identifica nominalmente escolas com reforma critica;
- identifica escolas com limitacao de energia e climatizacao;
- identifica situacoes de seguranca fisica;
- respeita filtros globais;
- mantem campos booleanos/categoricos legiveis para usuario final.

## 12. Relatorio 3 - Merenda Escolar

### report_id

```text
merenda-escolar-condicoes
```

### Titulo

```text
Relatorio de Condicoes da Merenda Escolar
```

### Fonte de dados sugerida

Usar views e/ou consultas associadas aos endpoints de merenda:

```text
/v1/admin/analytics/merenda/oferta
/v1/admin/analytics/merenda/equipamentos
/v1/admin/analytics/merenda/condicoes-sanitarias
```

### Colunas especificas

| Coluna |
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
| Despensa exclusiva |
| Deposito de conserva adequado |
| EPI disponivel |
| Extintores disponiveis |
| Manutencao preventiva |

### Ordenacao padrao

```text
merenda_atende_necessidades asc, condicoes_cozinha asc, dre asc, municipio asc, escola asc
```

### Criterio de aceite

- permite identificar escolas em que a merenda nao atende as necessidades;
- permite identificar escolas com cozinha precaria ou refeitorio inadequado;
- permite identificar gargalos de equipamentos;
- respeita filtros globais;
- campos textuais devem ser normalizados para leitura gerencial, sem expor nomes tecnicos internos.

## 13. Relatorio 4 - Tecnologia e Equipamentos

### report_id

```text
tecnologia-infraestrutura-escolar
```

### Titulo

```text
Relatorio de Infraestrutura Tecnologica Escolar
```

### Fonte de dados sugerida

Usar views e/ou consultas associadas aos endpoints de tecnologia:

```text
/v1/admin/analytics/tecnologia/infraestrutura
/v1/admin/analytics/tecnologia/uso-pedagogico
```

### Colunas especificas

| Coluna |
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

### Ordenacao padrao

```text
possui_internet asc, computadores_inoperantes desc, dre asc, municipio asc, escola asc
```

### Criterio de aceite

- identifica escolas sem internet;
- identifica escolas com conexao ruim ou instavel;
- identifica computadores inoperantes;
- consolida parque tecnologico por escola;
- respeita filtros globais.

## 14. Relatorio 5 - Acompanhamento do Preenchimento do Censo

### report_id

```text
censo-preenchimento-escolas
```

### Titulo

```text
Relatorio de Acompanhamento do Preenchimento do Censo
```

### Fonte de dados sugerida

Usar `schools` com `census_responses`, garantindo que escolas sem resposta aparecam como pendentes.

Tambem pode reaproveitar a logica dos endpoints:

```text
/v1/admin/census
/v1/admin/analytics/preenchimento/dre
```

### Colunas especificas

| Coluna |
|---|
| Status do censo |
| Ano |
| Ultima atualizacao |
| Sincronizado com planilha |
| Data de sincronizacao |
| Situacao operacional |

### Status esperados

| Status tecnico | Rotulo gerencial |
|---|---|
| `completed` | Concluido |
| `draft` | Rascunho |
| sem resposta | Pendente |
| sync pendente | Pendente de sincronizacao |

### Ordenacao padrao

```text
status_prioridade asc, dre asc, municipio asc, escola asc
```

Prioridade sugerida:

1. pendente;
2. rascunho;
3. pendente de sincronizacao;
4. concluido.

### Criterio de aceite

- lista escolas pendentes de preenchimento;
- lista rascunhos;
- identifica pendencias de sincronizacao;
- respeita filtros globais;
- permite uso operacional pelas DREs.

## 15. Geracao XLSX

A primeira fase deve gerar somente XLSX.

Requisitos minimos do arquivo:

- uma planilha por relatorio;
- linha 1 com titulo do relatorio;
- linha 2 com filtros aplicados;
- linha 3 em branco;
- linha 4 com cabecalho das colunas;
- dados a partir da linha 5;
- cabecalho em negrito;
- congelar painel na linha de cabecalho, se a biblioteca permitir;
- largura basica das colunas ajustada;
- formatacao numerica para campos quantitativos;
- nome do arquivo amigavel.

Exemplo de nome de arquivo:

```text
relatorio_merenda_escolar_condicoes_2026.xlsx
```

Quando houver filtro territorial:

```text
relatorio_merenda_escolar_condicoes_2026_dre_belem.xlsx
```

## 16. Headers HTTP

A resposta deve usar headers adequados para download:

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="relatorio_merenda_escolar_condicoes_2026.xlsx"
```

Em caso de `report_id` inexistente:

```http
404 Not Found
```

Em caso de formato ainda nao suportado:

```http
400 Bad Request
```

## 17. Integracao frontend

Criar um componente reutilizavel para acionar relatorios.

Sugestao:

```text
web/src/components/admin/shared/ReportButton.tsx
```

Responsabilidades:

- receber lista de relatorios disponiveis para a aba;
- abrir modal simples de selecao;
- exibir filtros aplicados;
- chamar endpoint de download;
- tratar erro de autenticacao;
- exibir estado de carregamento.

Props conceituais:

```ts
type ReportOption = {
  id: string;
  title: string;
  description?: string;
  defaultFormat?: "xlsx";
};

type ReportButtonProps = {
  token: string;
  filters?: DashboardFilters;
  reports: ReportOption[];
  onUnauth: () => void;
};
```

## 18. Posicionamento na interface

Em cada aba, o botao deve aparecer preferencialmente no topo, proximo ao indicador de fonte dos dados.

Exemplo conceitual:

```text
Fonte: PostgreSQL - ano 2026 - censos concluidos            [Gerar relatorio]
```

Na primeira fase, cada aba prioritaria deve oferecer apenas um relatorio completo:

| Aba | report_id |
|---|---|
| Saude Operacional | `saude-operacional-escolas` |
| Infraestrutura | `infraestrutura-seguranca-escolas` |
| Merenda | `merenda-escolar-condicoes` |
| Tecnologia | `tecnologia-infraestrutura-escolar` |
| Preenchimento | `censo-preenchimento-escolas` |

## 19. Fatiamento recomendado em PRs

### PR 1 - Infraestrutura backend de relatorios

Escopo:

- criar rota `/v1/admin/reports/{report_id}`;
- criar catalogo basico de relatorios;
- criar gerador XLSX generico;
- implementar apenas `censo-preenchimento-escolas` ou `saude-operacional-escolas` como piloto;
- adicionar tratamento de erro.

Criterios de aceite:

- endpoint protegido por JWT admin;
- retorna XLSX valido;
- respeita filtros globais;
- nao altera endpoints analiticos existentes.

### PR 2 - Relatorio de Saude Operacional

Escopo:

- implementar `saude-operacional-escolas` completo;
- exportar todas as escolas do recorte;
- ordenar por criticidade;
- incluir notas por dimensao.

Criterios de aceite:

- arquivo contem todas as colunas previstas;
- nao depende da pagina atual da tabela;
- filtros batem com a tela.

### PR 3 - Relatorios de Infraestrutura e Merenda

Escopo:

- implementar `infraestrutura-seguranca-escolas`;
- implementar `merenda-escolar-condicoes`;
- validar colunas e ordenacao.

Criterios de aceite:

- identifica situacoes estruturais criticas;
- identifica problemas de merenda;
- respeita filtros globais.

### PR 4 - Relatorio de Tecnologia e Preenchimento

Escopo:

- implementar `tecnologia-infraestrutura-escolar`;
- implementar `censo-preenchimento-escolas`;
- garantir escolas sem resposta no relatorio de preenchimento.

Criterios de aceite:

- identifica escolas sem internet ou equipamentos insuficientes;
- lista pendentes e rascunhos;
- pode ser usado pelas DREs para acompanhamento.

### PR 5 - Frontend: botao de relatorios por aba

Escopo:

- criar componente `ReportButton`;
- integrar nas cinco abas priorizadas;
- abrir modal de selecao;
- baixar XLSX com filtros aplicados.

Criterios de aceite:

- botao aparece apenas nas abas com relatorio implementado;
- download funciona com token admin;
- filtros globais sao repassados corretamente;
- em erro de autenticacao, aciona fluxo de logout/onUnauth.

## 20. Segunda fase

A segunda fase podera incluir:

- relatorios criticos por aba;
- PDF institucional;
- relatorios de Pessoal e Gestao;
- relatorios de Servicos Terceirizados;
- relatorios de Perfil dos Alunos e Resultados;
- relatorios de Gestao Financeira e Governanca;
- tela/modal com historico de relatorios gerados, caso se opte por persistencia futura.

## 21. Fora de escopo da primeira fase

Nao fazem parte da primeira fase:

- persistir arquivos gerados em storage;
- agendar relatorios;
- enviar relatorios por e-mail;
- gerar PDF;
- criar permissao granular por perfil;
- criar relatorios customizados pelo usuario;
- exportar graficos como imagem.

## 22. Checklist de validacao

Antes de considerar a entrega concluida, validar:

- [ ] endpoint protegido por autenticacao admin;
- [ ] `report_id` invalido retorna 404;
- [ ] formato invalido retorna 400;
- [ ] XLSX abre corretamente no Excel/LibreOffice/Google Sheets;
- [ ] filtros globais sao respeitados;
- [ ] nomes de arquivo sao amigaveis;
- [ ] relatorios nao alteram consultas analiticas existentes;
- [ ] relatorio de preenchimento inclui escolas sem resposta;
- [ ] relatorio de saude operacional nao fica limitado a paginacao da tela;
- [ ] frontend trata erro de autenticacao;
- [ ] documentacao funcional e tecnica permanecem atualizadas.

## 23. Prompt sugerido para Codex

Use este documento em conjunto com `docs/relatorios-gerenciais-por-aba.md`.

Objetivo inicial: implementar a infraestrutura backend de relatorios gerenciais por aba, protegida por autenticacao admin, iniciando pelo formato XLSX e por um relatorio piloto.

Nao alterar as regras dos indicadores existentes. Reaproveitar filtros globais e manter compatibilidade com o dashboard atual. Fatiar a implementacao em PRs pequenos conforme a secao 19.
