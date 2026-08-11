# Task — Lucas — Escopo DRE no analytics + filtros Escola/INEP

**Branch sugerida:** `feat/admin-dre-scope-filtros`  
**Dependência lógica:** contrato `AdminAccessScope` da task do Ed  
**Pode iniciar em paralelo:** implementação dos filtros e inventário dos handlers; rebase obrigatório antes do aceite.

## 1. Objetivo

Garantir que toda a camada analítica e de relatórios respeite o perfil DRE no backend e transformar **Nome da Escola** e **Código INEP** em filtros globais reais.

Esta task é a principal barreira contra vazamento transversal entre DREs.

## 2. Princípio central

Nunca calcular o indicador da rede inteira para depois esconder linhas no frontend.

Para `role=dre`, a DRE autorizada precisa entrar na query/recorte **antes de COUNT, SUM, AVG, ranking, paginação, percentual ou geração XLSX**.

## 3. Entregáveis

### LUCAS-01 — estender `AnalyticsFilters`

Adicionar suporte a:

```go
SchoolID   int
CodigoINEP string
```

Query params:

```text
school_id
codigo_inep
```

Manter os atuais:

```text
year
regiao_integracao
dre
municipio
zona
```

### LUCAS-02 — aplicar escopo DRE no parser compartilhado

`parseAnalyticsFilters(r)` deve consultar o `AdminAccessScope` criado pelo Ed.

Regra:

```text
admin → DRE da query continua opcional
DRE user → f.DRE = scope.DRE independentemente do ?dre= enviado
```

O núcleo puro usado pelos testes pode continuar parseando apenas `url.Values`; a aplicação do scope pode ocorrer na função que recebe `*http.Request`.

### LUCAS-03 — `WhereSQL` e args

Evoluir o filtro compartilhado para aplicar Escola/INEP de forma parametrizada.

Conceitualmente:

```sql
AND ($school_id = 0 OR school_id = $school_id)
AND ($codigo_inep = '' OR codigo_inep = $codigo_inep)
```

Adaptar aliases/colunas quando a fonte específica exigir.

Não interpolar valores diretamente no SQL.

### LUCAS-04 — endpoint de opções dos filtros

Atualizar `AdminAnalyticsFiltrosOpcoes`.

Problemas a resolver:

- hoje `escolas[]` é retornado globalmente, sem cascata completa;
- perfil DRE não pode enumerar escolas ou INEPs externos;
- os dois novos selects precisam de opções consistentes.

Comportamento esperado para DRE user:

- `dres` contém somente sua DRE;
- `municipios` somente os possíveis dentro da sua DRE + demais filtros ativos;
- `zonas` idem;
- `escolas` somente escolas permitidas;
- INEP é derivado somente dos itens permitidos;
- passar `?dre=outra-dre` não amplia a lista.

Aplicar cascata também em `escolas`, considerando quando possível:

- DRE efetiva;
- Região de Integração;
- Município;
- Zona.

### LUCAS-05 — Caracterização

Auditar e adaptar todos os endpoints:

```text
/admin/analytics/overview
/admin/analytics/caracterizacao/perfil
/admin/analytics/caracterizacao/dre
/admin/analytics/caracterizacao/oferta-funcionamento
/admin/analytics/caracterizacao/infraestrutura-educacional
/admin/analytics/caracterizacao/escolas
```

Todos devem respeitar:

- DRE do scope;
- `school_id`;
- `codigo_inep`.

### LUCAS-06 — Pessoal e Tecnologia

Cobrir:

```text
/admin/analytics/pessoal-gestao/estrutura
/admin/analytics/pessoal-gestao/coordenacao
/admin/analytics/pessoal-gestao/quadro-pessoal
/admin/analytics/pessoal-gestao/escolas
/admin/analytics/tecnologia/infraestrutura
/admin/analytics/tecnologia/uso-pedagogico
/admin/analytics/tecnologia/escolas
```

### LUCAS-07 — Infraestrutura, Merenda e Serviços

Cobrir:

```text
/admin/analytics/infraestrutura/condicoes
/admin/analytics/infraestrutura/seguranca
/admin/analytics/infraestrutura/energia
/admin/analytics/infraestrutura/escolas
/admin/analytics/merenda/oferta
/admin/analytics/merenda/equipamentos
/admin/analytics/merenda/recursos-humanos
/admin/analytics/merenda/condicoes-sanitarias
/admin/analytics/merenda/escolas
/admin/analytics/servicos-terceirizados/visao-geral
/admin/analytics/servicos-terceirizados/servicos-gerais
/admin/analytics/servicos-terceirizados/portaria
/admin/analytics/servicos-terceirizados/manipuladores-alimentos
/admin/analytics/servicos-terceirizados/escolas
```

### LUCAS-08 — Saúde Operacional

Adaptar:

```text
/admin/analytics/escolas/saude-operacional
```

Garantir que:

- `total_escolas` e `total_filtrado` não vazem total global para DRE user;
- cards de resumo sejam calculados no recorte autorizado;
- paginação aconteça depois do scope;
- busca/ordenação não permitam atravessar a DRE;
- `school_id` e `codigo_inep` funcionem junto com os filtros locais da própria aba.

### LUCAS-09 — Perfil dos Alunos / IDEB

Adaptar:

```text
/admin/analytics/perfil-alunos-resultados/ideb
```

A implementação atual possui parser/semântica própria (`ano`, etapa e vínculo IDEB).

Regras:

- DRE user só recebe resultados da própria DRE;
- filtro `codigo_inep` pode ser aplicado diretamente quando compatível;
- filtro `school_id` deve usar o vínculo existente com `schools` e não inventar match nominal;
- registros IDEB sem vínculo com `schools` não podem vazar para perfil DRE quando não for possível provar que pertencem ao escopo;
- admin mantém visão ampla e indicadores de qualidade atuais.

### LUCAS-10 — Financeiro/Governança

Cobrir:

```text
/admin/analytics/financeiro-governanca/prodep
/admin/analytics/financeiro-governanca/institucional
/admin/analytics/financeiro-governanca/indice-escolas
```

Atenção especial:

- PRODEP possui semântica própria de INEP e vínculos;
- registros sem `school_id` só podem aparecer para DRE user se a própria fonte/vínculo administrativo trouxer DRE confiável compatível;
- em dúvida de vínculo territorial, preferir **não retornar** o registro ao perfil DRE;
- `codigo_inep` deve respeitar a chave adequada da fonte;
- `school_id` deve usar vínculo cadastral confirmado.

### LUCAS-11 — preenchimento por DRE

Cobrir:

```text
/admin/analytics/preenchimento/dre
```

Para perfil DRE:

- payload deve conter somente uma DRE, a autorizada;
- totais devem nascer do próprio recorte;
- `?dre=` externo não muda o escopo.

### LUCAS-12 — relatórios XLSX

Auditar todos os report builders atuais:

```text
censo-preenchimento-escolas
saude-operacional-escolas
infraestrutura-seguranca-escolas
merenda-escolar-condicoes
financeiro-governanca-escolas
```

Regra absoluta:

> token de uma DRE nunca pode gerar XLSX com linha de outra DRE.

Aplicar também `school_id`/`codigo_inep` quando o relatório estiver associado a uma aba que suporta o recorte.

## 4. Arquivos principais de Lucas

```text
api/cmd/api/analytics_filtros.go
api/cmd/api/analytics.go
api/cmd/api/analytics_pessoal_tecnologia.go
api/cmd/api/analytics_infra_merenda_servicos.go
api/cmd/api/analytics_saude_operacional.go
api/cmd/api/analytics_perfil_alunos_ideb.go
api/cmd/api/analytics_financeiro_governanca.go
api/cmd/api/analytics_governanca_institucional.go
api/cmd/api/analytics_indice_governanca.go
api/cmd/api/analytics_preenchimento.go
api/cmd/api/reports*.go
api/cmd/api/*_test.go relacionados
```

## 5. Arquivos que Lucas não deve alterar

Evitar conflito com Ed/Pedro:

```text
api/cmd/api/admin.go
api/cmd/api/main.go
api/cmd/api/migrations/0018_*.sql
api/cmd/admin-user/*
web/src/**
```

Se for necessário tocar `main.go`, alinhar antes: nesta rodada os endpoints já existem e o objetivo é evitar essa colisão.

## 6. Estratégia de testes

Criar fixtures com pelo menos:

```text
DRE_A
  Escola A1
  Escola A2

DRE_B
  Escola B1
  Escola B2
```

Cobrir:

1. admin sem filtro recebe A+B;
2. admin com `dre=DRE_A` recebe A;
3. token DRE_A sem query recebe A;
4. token DRE_A com `dre=DRE_B` continua recebendo somente A;
5. token DRE_A com `school_id=B1` não recebe B1;
6. token DRE_A com `codigo_inep=B1` não recebe B1;
7. `filtros/opcoes` de A não enumera B;
8. agregados/percentuais de A são calculados somente com A;
9. relatórios de A não contêm B;
10. admin continua com comportamento anterior.

Adicionar testes específicos onde já existem suites fortes, especialmente Saúde, IDEB, Governança, Financeiro, Preenchimento e Reports.

## 7. Critérios de aceite

- todos os endpoints analíticos atuais foram auditados;
- nenhum endpoint depende apenas do filtro enviado pelo browser para restringir DRE;
- `school_id` + `codigo_inep` funcionam como filtros globais reais;
- `filtros/opcoes` não enumera outra DRE;
- paginação e agregações são feitas depois da aplicação do scope;
- relatórios respeitam scope;
- queries continuam parametrizadas;
- `go test ./...` passa;
- documentar no PR qualquer endpoint em que Escola/INEP não se aplique e a justificativa semântica.
