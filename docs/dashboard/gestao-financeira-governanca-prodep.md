# Gestão Financeira e Governança — Planejamento PRODEP

**Status:** documento de planejamento técnico/produto. **Nada implementado.** Esta frente é exclusivamente documental — não cria migration, tabela, script de importação, endpoint, payload, frontend, nem carrega dados.

**Branch de origem:** `docs/gestao-financeira-governanca-prodep` a partir de `develop`.

**Documento companheiro / fonte oficial da matriz:** [matriz-abas-e-graficos.md](matriz-abas-e-graficos.md) §5.8. Em caso de conflito sobre o estado das abas, a matriz prevalece; este documento detalha o planejamento específico da aba Gestão Financeira e Governança.

> **Histórico.** A aba Gestão Financeira e Governança nasceu como **placeholder institucional** (sem fetch, sem endpoint, sem view, sem dado fake) e **continua assim na UI**. Este documento não muda esse estado de implementação — ele apenas registra a passagem de "placeholder conceitual" para **planejamento ativo**, agora ancorado numa fonte administrativa externa concreta (PRODEP) somada aos dados declaratórios do censo.

---

## 1. Objetivo

A aba **Gestão Financeira e Governança** passará a consolidar, para a rede estadual, quatro dimensões hoje dispersas:

1. **Recursos** repassados às escolas (volume recebido por ano e por modalidade);
2. **Execução** desses recursos e o quanto ficou **reprogramado** (não executado no exercício);
3. **Prestação de contas** — incluindo o status administrativo de quem **não prestou contas**;
4. **Governança institucional** das escolas — regularização, conselhos, grêmio, participação comunitária e instrumentos de segurança/convivência.

A novidade desta frente é incorporar uma **fonte administrativa externa** ao censo: a planilha consolidada de recursos do **PRODEP**. Ela traz o lado *administrativo/financeiro* (valores efetivamente repassados e status de prestação de contas), que o formulário do censo só captura de forma **declaratória** (o diretor declara se recebeu, estima valor, informa se há pendência). Combinar as duas fontes permite, além de descrever cada lado, **cruzá-las para detectar divergências** (Bloco D).

Esta aba **não** entra no Índice de Saúde Operacional por escola e **não** altera o formulário do censo.

---

## 2. Fontes de dados previstas

A aba combinará **três fontes**, integradas pela chave `INEP` / `codigo_inep`.

### 2.1 Fonte administrativa externa — PRODEP

Planilha `CONSOLIDADO - PRODEP.xlsx`, aba `CONSOLIDADO`, com **uma linha por escola** e `INEP` como chave.

Campos principais (colunas da planilha):

- `INEP` — chave de integração;
- `ESCOLA` — nome da escola (na planilha);
- `DRE` — Diretoria Regional de Ensino (origem);
- `RI` — Regional Integrada / agrupamento (origem);
- `MUNICIPIO` — município (origem; contém `#N/A` em parte dos registros);
- `PRODEP 2023/2024/2025 Geral` — valor recebido, modalidade Geral, por ano;
- `Reprogramado PRODEP 2023/2024/2025 Geral` — valor reprogramado, modalidade Geral, por ano;
- `PRODEP 2023/2024/2025 Alimentação` — valor recebido, modalidade Alimentação, por ano;
- `Reprogramado PRODEP 2023/2024/2025 Alimentação` — valor reprogramado, modalidade Alimentação, por ano.

> **Atenção à modelagem.** As colunas de **reprogramado** podem conter o texto `NÃO PRESTOU CONTAS` no lugar de um número. Portanto esses campos **não são numéricos puros** — carregam um **status textual** que deve ser preservado, não descartado nem convertido silenciosamente para `0`/`NULL`. Ver §4.

As quatro categorias de recurso por ano são:

```txt
PRODEP Geral
Reprogramado PRODEP Geral
PRODEP Alimentação
Reprogramado PRODEP Alimentação
```

### 2.2 Fonte declaratória — formulário do censo

Campos já existentes na seção **Gestão, Participação e Política** do censo (`web/src/schemas/steps/gestao.ts`, armazenados em `census_responses.data` JSONB). Servem aos blocos de governança e aos cruzamentos de divergência (Bloco D):

| Campo (JSONB) | Tipo / domínio | Uso planejado |
|---|---|---|
| `regularizada_cee` | Sim / Não | Governança — regularização junto ao CEE |
| `conselho_escolar` | Sim / Não | Governança — conselho constituído |
| `conselho_ativo` | Sim / Parcialmente / Não | Governança — conselho ativo |
| `recursos_prodep` | Sim / Não / Não sabe informar | Cruzamento com PRODEP (declarou receber?) |
| `valor_prodep` | número (opcional) | Cruzamento de valor declarado × administrativo |
| `execucao_prodep` | Sim, totalmente / Parcialmente / Não executados | Execução declarada |
| `pendencias_prodep` | Não / Sim, em regularização / Sim, pendente/atrasada | Cruzamento com status de prestação de contas |
| `recursos_federais` | Sim / Não | Contexto financeiro complementar |
| `valor_federais` | número (opcional) | Contexto financeiro complementar |
| `execucao_federais` | Sim, totalmente / Parcialmente / Não executados | Contexto financeiro complementar |
| `pendencias_federais` | Não / Sim, em regularização / Sim, pendente/atrasada | Contexto financeiro complementar |
| `gremio_estudantil` | Sim / Não | Participação |
| `reunioes_comunidade` | Não ocorrem / Eventuais / Regulares / Frequentes | Participação comunitária |
| `plano_evacuacao` | Sim / Não | Governança / segurança institucional |
| `politica_bullying` | Sim, formalizada e aplicada / Parcialmente / Não possui | Governança / convivência |

> Os domínios acima são os enums reais validados pelo Zod (`gestaoSchema`). Qualquer leitura desses campos no JSONB deve usar os padrões seguros documentados em `CLAUDE.md` (`NULLIF(data->>'campo','')` para categóricos; cast numérico defensivo para `valor_prodep`/`valor_federais`).

### 2.3 Fonte cadastral — `schools`

Tabela `schools` (`infra/init.sql`), usada para integração territorial e resolução de município. Colunas relevantes:

- `id` (PK; é o `school_id` referenciado em `census_responses`);
- `codigo_inep` (VARCHAR, `UNIQUE`) — chave de integração com o PRODEP;
- `nome_escola`;
- `dre`;
- `municipio`;
- `zona`.

> Observação: na tabela `schools` o identificador interno é a coluna `id`; o nome `school_id` aparece como chave estrangeira em `census_responses`. Na modelagem da tabela PRODEP (§4) usamos `school_id` para o vínculo resolvido contra `schools.id`.

---

## 3. Diagnóstico inicial da planilha PRODEP

Registro do que se sabe hoje sobre `CONSOLIDADO - PRODEP.xlsx` (aba `CONSOLIDADO`):

- **~841 linhas/escolas**, uma linha por escola;
- **`INEP` é a chave principal** de integração;
- **ausência de duplicidade de `INEP`** — *a confirmar* formalmente no relatório de qualidade da carga (§7, passo 4);
- **17 registros com `MUNICIPIO = #N/A`** — precisam de saneamento (§5);
- **presença de `NÃO PRESTOU CONTAS`** em colunas de reprogramado — status textual a preservar (§4);
- **necessidade de preservar o status textual** em vez de coagir para número.

> Estes números (841 linhas, 17 `#N/A`) são o diagnóstico inicial informado e devem ser **reconfirmados** pelo relatório de qualidade quando a carga real for executada. Nenhuma decisão de modelagem deve assumir que esses contadores estão fechados.

---

## 4. Decisão de modelagem

**Decisão:** os dados do PRODEP vão para uma **tabela própria no PostgreSQL**, separada do JSONB do censo. Eles são dados administrativos externos, com ciclo de atualização e origem distintos do formulário — não cabem como mais um campo declaratório.

Princípios:

- **Criar a estrutura da tabela via migration estrutural** (futuramente) — `CREATE TABLE IF NOT EXISTS`, idempotente, alinhada ao loader `applyMigrations` descrito em `CLAUDE.md`.
- **Não embutir os dados da planilha na migration.** Migration cria estrutura; **dados entram por carga separada**.
- **Carga via script/processo controlado**, com tratamento, validação e relatório de qualidade (§7).
- **Preferir formato longo** (uma linha por escola × ano × categoria), em vez de dezenas de colunas `prodep_2023_geral`, `reprogramado_2024_alimentacao` etc. O formato longo facilita filtros por ano/categoria, agregações e a evolução para novos anos sem alterar o schema.
- **Preservar status textual.** O valor reprogramado e o status de prestação de contas são campos **distintos**: quando a célula traz `NÃO PRESTOU CONTAS`, `valor_reprogramado` fica `NULL` e `status_prestacao_contas` registra o texto. Nunca tratar `NÃO PRESTOU CONTAS` como `0`.

### Exemplo conceitual de tabela analítica

```txt
prodep_school_resources
```

Tabela em **formato longo**. Campos conceituais (nomes finais a confirmar na migration estrutural):

| Campo | Natureza | Observação |
|---|---|---|
| `id` | PK | identidade da linha |
| `codigo_inep` | chave externa (texto) | chave da planilha; integra com `schools.codigo_inep` |
| `school_id` | FK → `schools.id` | preenchido quando o `INEP` casa; pode ser `NULL` se não resolvido |
| `ano` | inteiro | 2023 / 2024 / 2025 |
| `categoria` | texto/enum | `geral` ou `alimentacao` |
| `valor_recebido` | numérico (NULL-able) | valor PRODEP recebido na categoria/ano |
| `valor_reprogramado` | numérico (NULL-able) | `NULL` quando a célula é status textual |
| `status_prestacao_contas` | texto/enum | ex.: `nao_prestou_contas`, `ok`, `nao_informado` — preserva `NÃO PRESTOU CONTAS` |
| `dre_origem` | texto | DRE como veio da planilha |
| `ri_origem` | texto | RI como veio da planilha |
| `municipio_origem` | texto | município **como veio** da planilha (pode ser `#N/A`) |
| `municipio_resolvido` | texto (NULL-able) | preenchido só quando há segurança (§5) |
| `fonte_municipio` | enum | `planilha` / `schools` / `manual` / `nao_resolvido` (§5) |
| `fonte_arquivo` | texto | nome/identificador do arquivo da carga (auditoria) |
| `data_carga` | timestamp | momento da carga |
| `created_at` | timestamp | padrão |
| `updated_at` | timestamp | padrão |

> O formato longo implica, para uma escola, até **6 linhas** (3 anos × 2 categorias). Os campos territoriais (`dre_origem`, `ri_origem`, `municipio_*`) repetem-se entre as linhas da mesma escola; isso é aceitável e simplifica a carga. Uma alternativa (tabela cabeçalho por escola + tabela de valores) pode ser avaliada na fase de migration, mas **não é decisão desta documentação**.

---

## 5. Estratégia de saneamento de municípios

O município (`MUNICIPIO`) vem sujo na planilha (17 registros `#N/A`). A resolução deve ser **em camadas**, sempre preservando a origem e nunca inventando dado:

1. **Resolver automaticamente por `INEP`** usando `schools.codigo_inep` → `schools.municipio`. É a via preferencial: o cadastro `schools` é a fonte canônica de território.
2. **Se não houver match** por INEP, usar **base/correção manual validada** (lista revisada por humano), não inferência automática.
3. **Preservar sempre `municipio_origem`** (inclusive `#N/A`), para auditoria e rastreabilidade.
4. **Preencher `municipio_resolvido` apenas quando houver segurança** — sem chute. Na dúvida, deixar `NULL`.
5. **Registrar a procedência em `fonte_municipio`:**
   - `planilha` — município veio íntegro da própria planilha;
   - `schools` — resolvido por match de INEP no cadastro;
   - `manual` — resolvido por correção humana validada;
   - `nao_resolvido` — permanece pendente.
6. **Não inferir município apenas por DRE ou RI** — DRE/RI agrupam vários municípios; isso geraria atribuição incorreta.
7. **Pendências de município são qualidade de dado, não bloqueio de carga.** Um registro `#N/A` ainda não resolvido entra na base com `fonte_municipio = nao_resolvido` e é reportado no relatório de qualidade — não impede o restante da carga.

---

## 6. Indicadores planejados da aba

Organização em quatro blocos. **Nenhum implementado** — referência de produto para as fases seguintes.

### Bloco A — Visão Geral Financeira do PRODEP

Fonte: tabela PRODEP.

- Total recebido no ano (KPI, por ano selecionado);
- Total reprogramado (KPI);
- Percentual reprogramado (reprogramado ÷ recebido);
- Escolas contempladas (com recebimento > 0);
- Escolas com prestação pendente (`status_prestacao_contas = nao_prestou_contas`);
- Distribuição Geral × Alimentação (donut/barra).

### Bloco B — Execução e Prestação de Contas

Fonte: tabela PRODEP.

- Escolas com reprogramado > 50% (KPI/lista);
- Escolas com reprogramado > 75% (KPI/lista);
- Escolas com `NÃO PRESTOU CONTAS` (KPI/lista);
- Ranking de escolas por valor reprogramado;
- Ranking de DREs por percentual reprogramado;
- Tabela escola a escola (recebido, reprogramado, % reprogramado, status).

> Os limiares 50% / 75% são **propostas** e dependem de validação de produto (§7, e §7.3 da matriz).

### Bloco C — Governança Institucional e Participação

Fonte: formulário do censo (declaratório).

- Regularização junto ao CEE (`regularizada_cee`);
- Conselho Escolar constituído (`conselho_escolar`);
- Conselho ativo (`conselho_ativo`);
- Grêmio estudantil (`gremio_estudantil`);
- Frequência de reuniões com a comunidade (`reunioes_comunidade`);
- Plano de evacuação (`plano_evacuacao`);
- Política contra bullying/violência (`politica_bullying`).

### Bloco D — Alertas e Divergências

Cruzamento entre a planilha PRODEP (administrativo) e o formulário do censo (declaratório):

- escola **declarou não receber** PRODEP (`recursos_prodep = Não`), **mas consta valor administrativo** na planilha;
- escola **declarou receber** PRODEP, **mas não consta valor administrativo**;
- **divergência relevante** entre valor declarado (`valor_prodep`) e valor administrativo;
- escola **declarou ausência de pendência** (`pendencias_prodep = Não`), **mas o status administrativo indica `NÃO PRESTOU CONTAS`**;
- escola com **alto reprogramado** e **conselho inativo ou inexistente** (`conselho_ativo` ≠ Sim).

> Os Blocos C e D dependem de o censo do ano de referência estar concluído para a escola; o cruzamento só é confiável quando há ambos os lados. Escolas sem censo elegível devem aparecer como "sem dado declaratório", não como divergência.

---

## 7. Fluxo futuro de implementação

Sequência recomendada (cada passo é uma frente/PR próprio; **nada além do passo 1 está em escopo agora**):

1. **Documentação desta frente** ← *este PR*.
2. **Tratamento da planilha** (parsing, normalização de colunas, separação valor × status textual).
3. **Resolução dos municípios `#N/A`** (estratégia em camadas, §5).
4. **Relatório de qualidade da carga** (confirmar 841 linhas, unicidade de INEP, contagem de `#N/A` e de `NÃO PRESTOU CONTAS`, taxa de match com `schools`).
5. **Migration estrutural** (`infra/migrations/NNNN_*` + replicar em `infra/init.sql`), sem dados.
6. **Script de importação** (carga controlada, idempotente, registrando `fonte_arquivo`/`data_carga`).
7. **Endpoint backend** sob `/v1/admin/analytics/gestao-financeira/*`, JWT-protegido, queries parametrizadas.
8. **Payload da aba** (contrato de dados consumido pelo frontend).
9. **Wireframe/gráficos** (validação visual dos blocos A–D com as áreas finalísticas).
10. **Frontend** (remodelar `AbaGestaoFinanceiraGovernanca.tsx`, substituindo o placeholder).
11. **Testes e auditoria** (paridade numérica planilha × banco × tela; trilha de auditoria da carga).

---

## 8. Fora de escopo desta documentação

Este PR é **exclusivamente documental**. Ele **não** implementa nem altera:

- migration;
- tabela (`prodep_school_resources` ou qualquer outra);
- script de importação;
- endpoint;
- payload;
- frontend (`AbaGestaoFinanceiraGovernanca.tsx` permanece placeholder);
- carga de dados / ingestão da planilha;
- alteração no formulário do censo;
- alteração no Índice de Saúde Operacional por escola;
- código em `web/`, `api/` ou `infra/`.

---

## 9. Pontos que exigem validação humana antes da implementação

Antes de avançar do passo 1 para os seguintes (§7), o time/produto precisa decidir:

1. **Status de prestação de contas** — domínio canônico de `status_prestacao_contas` (quais valores além de `nao_prestou_contas`, `ok`, `nao_informado`) e como mapear cada texto encontrado na planilha.
2. **Limiares de risco** — confirmar 50% / 75% de reprogramado como faixas oficiais (ou outras).
3. **"Divergência relevante" de valor** (Bloco D) — definir o critério numérico (tolerância absoluta/percentual) entre `valor_prodep` declarado e valor administrativo.
4. **Base manual de municípios** — quem valida e mantém a correção dos 17 (ou mais) `#N/A` não resolvidos por INEP.
5. **Anos de referência** — confirmar que 2023–2025 é o recorte e como a aba lidará com a chegada de novos anos.
6. **Modalidade Alimentação × Merenda** — alinhar se "PRODEP Alimentação" deve dialogar com a aba Merenda Escolar ou permanecer restrito a esta aba.
7. **Dono da fonte PRODEP** — coordenação responsável pela atualização periódica da planilha e pela governança da carga.
