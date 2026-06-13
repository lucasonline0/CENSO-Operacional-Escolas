# Perfil dos Alunos e Resultados — Planejamento IDEB 2023

**Status:** documento de planejamento técnico/produto. **Nada implementado.** Esta frente é exclusivamente documental nesta etapa — não cria migration, tabela, script de importação, endpoint, payload em produção, frontend, nem carrega dados.

**Branch/commit sugerido:** este documento pode ser commitado diretamente em `develop`, por ser uma alteração exclusivamente documental.

**Documento companheiro / fonte oficial da matriz:** [matriz-abas-e-graficos.md](matriz-abas-e-graficos.md). Em caso de conflito sobre o estado atual das abas, a matriz prevalece; este documento detalha o planejamento específico da frente IDEB 2023 dentro da aba **Perfil dos Alunos e Resultados**.

> **Histórico.** A aba **Perfil dos Alunos e Resultados** existe hoje como implementação legada, consumindo o endpoint `/v1/admin/indicadores-metrics` baseado em Google Sheets. A matriz do dashboard já indica que a remodelagem futura da aba deve separar os blocos **Perfil Socioeducacional e Permanência** e **Resultados e Desempenho**. Este documento planeja a entrada da base IDEB 2023 como fonte externa oficial para o bloco **Resultados e Desempenho**. A primeira versão desta frente **não deve misturar** a base oficial tratada com campos declaratórios do formulário do censo, para evitar ambiguidade metodológica e risco de comparação entre fontes de natureza diferente.

---

## 1. Objetivo

Planejar a incorporação da base **IDEB 2023** ao dashboard próprio do Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA, sem alterar código nesta etapa.

A frente tem quatro objetivos:

1. registrar o diagnóstico técnico da planilha `ideb_2023_iniciais_finais_medio.xlsx`;
2. definir a metodologia de leitura, tratamento e transparência dos registros com e sem IDEB divulgado;
3. propor modelagem futura em PostgreSQL e endpoint analítico;
4. organizar o fatiamento da implementação em PRs pequenos, auditáveis e reversíveis.

Esta frente **não substitui, não apaga e não descarta** os dados declaratórios já coletados pelo formulário do censo. Contudo, na primeira versão da remodelagem, esses campos **não serão usados** na aba para compor indicadores, cards, rankings ou cruzamentos.

A decisão metodológica para a primeira entrega é restringir a aba à base oficial tratada do IDEB 2023, com foco em:

- cobertura de divulgação do IDEB;
- resultados por etapa;
- proficiências;
- fluxo/indicador de rendimento;
- total e percentual avaliado;
- recortes territoriais apenas após vínculo seguro com `schools`.

Essa redução temporária de escopo é intencional: preserva a confiabilidade da leitura executiva e evita misturar fonte oficial com informação declaratória sujeita a erro humano, preenchimento impreciso ou diferença de referência temporal.

---

## 2. Fontes de dados previstas

### 2.1 Fonte externa oficial — IDEB 2023

Arquivo analisado:

```txt
ideb_2023_iniciais_finais_medio.xlsx
```

Aba analisada:

```txt
IDEB 2023
```

Fonte metodológica oficial do INEP:

```txt
https://download.inep.gov.br/ideb/nota_informativa_ideb_2023.pdf
```

Página institucional do IDEB:

```txt
https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb
```

### 2.2 Cadastro interno — `schools`

A planilha IDEB traz `INEP` e `NOME DA ESCOLA`, mas **não traz DRE, município, zona ou Região de Integração**.

Portanto, os recortes territoriais do dashboard devem ser resolvidos por vínculo com a tabela `schools`, preferencialmente por:

```txt
ideb_resultados.codigo_inep = schools.codigo_inep
```

A tabela `schools` deve continuar sendo a fonte interna para:

- `school_id`;
- `codigo_inep`;
- `nome_escola` cadastral;
- `municipio`;
- `dre`;
- `zona`.

### 2.3 Fonte declaratória — formulário do censo

Os campos declaratórios atuais de alunos/resultados continuam existindo no sistema e em `census_responses.data`, mas **ficam fora do escopo da primeira versão da frente IDEB**.

Campos como:

- `total_beneficiarios`;
- `taxa_abandono`;
- `taxa_reprovacao_fund1`;
- `taxa_reprovacao_fund2`;
- `taxa_reprovacao_medio`;
- `ideb_anos_iniciais`;
- `ideb_anos_finais`;
- `ideb_ensino_medio`.

não devem ser usados, neste momento, para compor a nova leitura da aba.

Decisão:

```txt
A primeira versão da aba remodelada deve usar apenas a base oficial IDEB 2023 tratada.
```

Justificativa:

- a base IDEB é uma fonte externa oficial;
- o formulário foi preenchido por diretores escolares e pode conter erro humano, imprecisão, arredondamento ou entendimento diferente do campo;
- misturar fontes oficiais e declaratórias na mesma visualização pode gerar interpretações equivocadas;
- indicadores ausentes na base IDEB não devem ser completados com dados declaratórios apenas para enriquecer a aba;
- o enriquecimento com novas bases deve ocorrer em frentes futuras, com documentação e regras próprias.

Esses dados declaratórios poderão ser revisitados futuramente para comparação, auditoria ou enriquecimento, mas somente depois de uma decisão metodológica explícita.


---

## 3. Diagnóstico da planilha IDEB 2023

### 3.1 Estrutura geral

| Item | Valor |
|---|---:|
| Abas | 1 |
| Aba útil | `IDEB 2023` |
| Registros úteis | 1.570 |
| Colunas | 10 |
| Ano de referência | 2023 |
| Escolas/INEPs únicos | 1.029 |
| Registros com IDEB válido | 1.115 |
| Registros sem IDEB divulgado | 455 |
| Escolas com pelo menos um IDEB válido | 841 |
| Escolas sem IDEB válido em qualquer etapa | 188 |

### 3.2 Colunas encontradas

| # | Coluna | Natureza | Observação |
|---:|---|---|---|
| 1 | `ANO` | temporal | Todos os registros são 2023 |
| 2 | `Ensino` | etapa | `anos iniciais`, `anos finais`, `ensino medio` |
| 3 | `INEP` | chave da escola | Deve ser preservado como texto no banco |
| 4 | `NOME DA ESCOLA` | identificação textual | Não deve ser usado como chave principal |
| 5 | `Total avaliado` | indicador numérico | Pode vir como `-` |
| 6 | `Percentual avaliado` | indicador numérico | Pode superar 100 na base de origem |
| 7 | `Proficiência Português` | indicador numérico | Pode vir como `-` ou `ND` |
| 8 | `Proficiência Matemática` | indicador numérico | Pode vir como `-` ou `ND` |
| 9 | `Fluxo - Indicador de rendimento` | indicador numérico | Pode vir como `-` |
| 10 | `IDEB 2023` | resultado educacional | Pode vir como `-` |

### 3.3 Grão da base

O grão da planilha é:

```txt
escola/INEP × etapa de ensino × ano
```

Chave candidata:

```txt
ANO + INEP + Ensino
```

Resultado da auditoria inicial:

```txt
Não foram encontradas duplicidades nessa chave candidata.
```

### 3.4 Distribuição por etapa

| Etapa | Registros | INEPs únicos | IDEB válido | Sem IDEB divulgado | Cobertura IDEB |
|---|---:|---:|---:|---:|---:|
| Anos iniciais | 427 | 427 | 179 | 248 | 41,9% |
| Anos finais | 451 | 451 | 346 | 105 | 76,7% |
| Ensino médio | 692 | 692 | 590 | 102 | 85,3% |
| **Total** | **1.570** | — | **1.115** | **455** | **71,0%** |

### 3.5 IDEB médio simples por etapa

> Média simples dos registros com IDEB válido. Não representa necessariamente o IDEB oficial agregado da rede, DRE ou município.

| Etapa | Média simples | Mediana | Mínimo | Máximo |
|---|---:|---:|---:|---:|
| Anos iniciais | 5,61 | 5,6 | 3,6 | 7,6 |
| Anos finais | 4,70 | 4,7 | 3,3 | 7,0 |
| Ensino médio | 4,11 | 4,2 | 2,4 | 5,6 |

### 3.6 Distribuição por faixas de IDEB

| Etapa | Faixa | Registros |
|---|---|---:|
| Anos iniciais | 3,0 a 3,9 | 3 |
| Anos iniciais | 4,0 a 4,9 | 29 |
| Anos iniciais | 5,0 a 5,9 | 94 |
| Anos iniciais | 6,0 a 6,9 | 47 |
| Anos iniciais | 7,0+ | 6 |
| Anos iniciais | Sem IDEB divulgado | 248 |
| Anos finais | 3,0 a 3,9 | 27 |
| Anos finais | 4,0 a 4,9 | 215 |
| Anos finais | 5,0 a 5,9 | 101 |
| Anos finais | 6,0 a 6,9 | 2 |
| Anos finais | 7,0+ | 1 |
| Anos finais | Sem IDEB divulgado | 105 |
| Ensino médio | Abaixo de 3,0 | 4 |
| Ensino médio | 3,0 a 3,9 | 184 |
| Ensino médio | 4,0 a 4,9 | 392 |
| Ensino médio | 5,0 a 5,9 | 10 |
| Ensino médio | Sem IDEB divulgado | 102 |

---

## 4. Decisões metodológicas

### 4.1 INEP é a chave; nome semelhante não é inconsistência

A auditoria encontrou nomes de escola semelhantes ou repetidos associados a INEPs diferentes. Isso **não deve ser tratado como erro**.

Decisão:

```txt
Nomes semelhantes ou iguais com INEPs diferentes são ocorrência esperada na rede escolar.
```

Justificativa de produto/dados:

- muitas escolas recebem nomes em homenagem a personalidades históricas, religiosas ou locais;
- nomes podem variar em grafia, acentuação, abreviação e prefixos administrativos;
- o `INEP` é o identificador adequado para integração cadastral;
- o nome da escola deve ser usado para exibição e conferência humana, não como chave de integração.

Portanto, a regra de qualidade é:

| Situação | Tratamento |
|---|---|
| Mesmo nome, INEP diferente | Aceitável; apenas informativo |
| Mesmo `ANO + INEP + Ensino` repetido | Potencial duplicidade real |
| INEP ausente | Erro crítico de carga |
| INEP existente na base IDEB, mas sem match em `schools` | `status_vinculo = sem_match_inep` |
| INEP com match em `schools`, mas nome divergente | Alerta de conferência, não bloqueio automático |

### 4.2 Ausência de IDEB não é nota zero

Registros sem IDEB divulgado devem ser tratados como **cobertura/elegibilidade**, não como desempenho ruim.

Decisão:

```txt
`-`, `ND` ou ausência de IDEB devem virar NULL no banco, nunca 0.
```

A interface deve comunicar:

- quantos registros têm IDEB divulgado;
- quantos registros estão sem IDEB divulgado;
- quantas escolas não possuem IDEB válido em nenhuma etapa;
- que a ausência pode decorrer de critérios oficiais de cálculo/divulgação.

Segundo a Nota Informativa do IDEB 2023 do INEP, escolas podem não ter IDEB calculado por critérios como:

- menos de 10 estudantes matriculados na etapa avaliada;
- ausência de informação de movimento/rendimento no Censo Escolar;
- menos de 10 estudantes presentes no Saeb;
- taxa de participação inferior a 80%;
- enquadramento em modalidades/condições excluídas da divulgação escolar.

Dessa forma, o painel deve usar linguagem como:

```txt
Sem IDEB divulgado
```

Evitar:

```txt
IDEB zerado
Escola com nota zero
Escola sem desempenho
```

### 4.3 Agregações: oficial, média simples, média ponderada e recortes internos

Na base atual, o campo `IDEB 2023` deve ser tratado como **IDEB oficial da escola naquela etapa**, pois já vem calculado e divulgado pelo INEP.

Portanto, é seguro afirmar:

```txt
IDEB oficial da escola/etapa — INEP
```

desde que o registro tenha valor válido.

Não é seguro chamar de **IDEB oficial agregado** os valores calculados pelo dashboard para:

- DRE;
- município, quando calculado apenas a partir das escolas da planilha;
- zona;
- Região de Integração;
- recortes filtrados no painel;
- rede estadual, se calculada como média das escolas da planilha.

O IDEB oficial agregado não é necessariamente a média dos IDEBs das escolas. O cálculo oficial de agregações envolve recomposição dos componentes de desempenho e rendimento na unidade agregada, com base nos insumos oficiais do INEP.

Decisão:

```txt
Agregações calculadas pelo dashboard não devem ser rotuladas como IDEB oficial agregado.
```

#### 4.3.1 Média simples

A média simples é útil para leitura inicial, mas deve ser rotulada com precisão.

Fórmula:

```txt
IDEB médio simples = soma dos IDEBs válidos das escolas / quantidade de escolas com IDEB válido
```

Rótulo recomendado:

```txt
IDEB médio simples das escolas com IDEB divulgado
```

Uso permitido:

- comparação inicial entre etapas;
- leitura por DRE;
- leitura por município;
- leitura por zona;
- cards de resumo.

Limitação:

```txt
Não representa necessariamente o IDEB oficial agregado do território ou recorte.
```

#### 4.3.2 Média ponderada pelo total avaliado

A média ponderada pelo total avaliado entrega uma leitura mais robusta do que a média simples, pois escolas com maior número de estudantes avaliados têm maior peso.

Fórmula:

```txt
IDEB médio ponderado = soma(IDEB da escola × total avaliado) / soma(total avaliado)
```

Usar apenas registros com:

- IDEB válido;
- `total_avaliado` numérico;
- `total_avaliado > 0`.

Rótulo recomendado:

```txt
IDEB médio ponderado pelo total avaliado — cálculo do dashboard
```

Uso permitido:

- comparação por etapa;
- leitura por DRE;
- leitura por município;
- leitura de rede dentro do dashboard;
- complemento à média simples.

Limitação:

```txt
Mesmo sendo mais informativa que a média simples, a média ponderada pelo total avaliado não deve ser chamada de IDEB oficial agregado.
```

#### 4.3.3 Distribuição por faixas

A distribuição por faixas deve ser tratada como leitura prioritária da aba, pois evita reduzir o desempenho da rede a um único número.

Faixas sugeridas:

```txt
Abaixo de 3,0
3,0 a 3,9
4,0 a 4,9
5,0 a 5,9
6,0 a 6,9
7,0+
Sem IDEB divulgado
```

Uso permitido:

- distribuição por etapa;
- distribuição por DRE;
- distribuição por município;
- análise de escolas críticas;
- análise de escolas com bons resultados;
- comunicação executiva.

#### 4.3.4 Agregados oficiais futuros

Caso o projeto queira exibir IDEB oficial de município, UF, região ou Brasil, a recomendação é incorporar bases oficiais agregadas do INEP, em vez de tentar reproduzir o cálculo apenas com a planilha escolar atual.

Possível evolução futura:

```txt
ideb_resultados_escolas
ideb_resultados_municipios
ideb_resultados_uf
ideb_resultados_brasil
```

ou uma tabela longa única com `tipo_agregacao`:

```txt
tipo_agregacao = escola | municipio | uf | regiao | brasil
```

Para DRE, como se trata de recorte administrativo interno da SEDUC, a leitura deverá continuar sendo identificada como cálculo do dashboard, salvo se houver metodologia institucional própria validada.

#### 4.3.5 Texto metodológico recomendado para a interface

```txt
Os resultados por escola correspondem ao IDEB divulgado pelo INEP. As agregações por DRE, município e demais recortes internos do painel são indicadores calculados pelo dashboard a partir das escolas vinculadas ao recorte, podendo ser exibidos como média simples, média ponderada pelo total avaliado e distribuição por faixas. Esses valores não substituem os agregados oficiais publicados pelo INEP.
```

### 4.4 Não misturar fonte oficial com fonte declaratória na primeira versão

A primeira versão da frente IDEB deve ser deliberadamente mais restrita. Mesmo que existam campos declaratórios semelhantes ou complementares no formulário do censo, eles não devem ser usados para preencher lacunas, comparar resultados ou gerar indicadores combinados nesta etapa.

Decisão:

```txt
O bloco Resultados e Desempenho será calculado exclusivamente a partir da base IDEB 2023 tratada.
```

Implicações:

- não calcular abandono, reprovação ou beneficiários a partir de `census_responses.data` nesta frente;
- não confrontar IDEB oficial com IDEB declarado pelo diretor neste primeiro momento;
- não preencher ausência de IDEB oficial com valor declarado;
- não usar campo declaratório para ampliar artificialmente o potencial analítico da aba;
- registrar, de forma transparente, quais indicadores ainda não serão exibidos por falta de fonte oficial tratada nesta etapa.

A consequência prática é uma aba inicialmente mais enxuta, porém metodologicamente mais segura.

---

## 5. Qualidade dos dados e regras de tratamento

| Situação | Quantidade observada | Regra proposta |
|---|---:|---|
| INEP ausente | 0 | Continuar como erro crítico se ocorrer em carga futura |
| Nome da escola ausente | 0 | Continuar como erro de qualidade se ocorrer em carga futura |
| Duplicidade em `ANO + INEP + Ensino` | 0 | Bloquear ou registrar como erro crítico |
| IDEB ausente (`-`) | 455 | Converter para `NULL`; status `sem_ideb_divulgado` |
| Todos os indicadores ausentes de `Total avaliado` a `IDEB` | 387 | Status `sem_resultado` ou subtipo de `sem_ideb_divulgado` |
| Proficiência `ND` | 68 | Converter número para `NULL`; preservar status `nd_proficiencia` |
| Percentual avaliado acima de 100 | 159 | Preservar valor de origem e gerar alerta de qualidade; não corrigir silenciosamente |
| Percentual avaliado abaixo de 80 | 68 | Preservar; pode ajudar a explicar não divulgação em parte dos casos |
| DRE/município/zona ausentes | Todos | Resolver via `schools` após match por INEP |
| Meta IDEB ausente | Todos | Não criar indicador de atingimento de meta nesta fase |
| Série histórica ausente | Todos | Não criar evolução temporal nesta fase |

---

## 6. Submenus e blocos da aba

A primeira versão remodelada da aba **Perfil dos Alunos e Resultados** deve conter submenus voltados ao IDEB 2023, sem ativar ainda o bloco de Perfil Socioeducacional e Permanência.

### 6.1 Submenus recomendados

| Submenu | Anchor sugerida | Finalidade |
|---|---|---|
| **Visão Geral IDEB 2023** | `sec-alunos-ideb-visao` | Cobertura geral da base, escolas com/sem IDEB e ano de referência |
| **Resultados por Etapa** | `sec-alunos-ideb-etapas` | IDEB médio simples e ponderado por anos iniciais, anos finais e ensino médio |
| **Proficiências e Fluxo** | `sec-alunos-ideb-proficiencias-fluxo` | Português, Matemática, fluxo/rendimento e total avaliado |
| **Distribuição por Faixa de IDEB** | `sec-alunos-ideb-faixas` | Quantidade de escolas em cada faixa de desempenho, por etapa |
| **Escolas e Recortes Territoriais** | `sec-alunos-ideb-escolas-territorios` | Tabela escola a escola, rankings por etapa, DRE/município após match |

### 6.2 Visão Geral IDEB 2023

Cards possíveis:

| Card | Valor possível agora |
|---|---:|
| Registros IDEB 2023 | 1.570 |
| Escolas/INEPs únicos | 1.029 |
| Registros com IDEB divulgado | 1.115 |
| Registros sem IDEB divulgado | 455 |
| Cobertura IDEB | 71,0% |
| Escolas sem IDEB em nenhuma etapa | 188 |

Gráficos possíveis:

- com IDEB × sem IDEB divulgado;
- cobertura IDEB por etapa;
- registros por etapa.

### 6.3 Resultados por Etapa

Cards principais:

| Card | Valor possível agora |
|---|---:|
| IDEB médio simples — Anos Iniciais | 5,61 |
| IDEB médio simples — Anos Finais | 4,70 |
| IDEB médio simples — Ensino Médio | 4,11 |

Cards adicionais recomendados:

- IDEB médio ponderado pelo total avaliado — por etapa;
- mediana IDEB por etapa;
- maior IDEB divulgado por etapa;
- menor IDEB divulgado por etapa;
- registros válidos por etapa.

### 6.4 Proficiências e Fluxo

Cards possíveis:

- proficiência média em Língua Portuguesa por etapa;
- proficiência média em Matemática por etapa;
- fluxo médio por etapa;
- total avaliado por etapa;
- registros com proficiência `ND`;
- registros com percentual avaliado abaixo de 80%;
- registros com percentual avaliado acima de 100.

### 6.5 Distribuição por Faixa de IDEB

Faixas sugeridas:

```txt
Abaixo de 3,0
3,0 a 3,9
4,0 a 4,9
5,0 a 5,9
6,0 a 6,9
7,0+
Sem IDEB divulgado
```

Gráficos possíveis:

- distribuição por faixa — Anos Iniciais;
- distribuição por faixa — Anos Finais;
- distribuição por faixa — Ensino Médio;
- distribuição comparada por etapa.

### 6.6 Escolas e Recortes Territoriais

Tabelas possíveis:

| Tabela | Colunas recomendadas |
|---|---|
| Escola a escola | INEP, escola, etapa, IDEB, total avaliado, percentual avaliado, LP, Matemática, fluxo, DRE, município |
| Maiores IDEBs por etapa | Separar por etapa |
| Menores IDEBs divulgados por etapa | Separar por etapa |
| Sem IDEB divulgado | Escola, etapa, total avaliado, percentual avaliado, status |
| Sem match com `schools` | INEP, nome origem, etapa, status vínculo |

Cards territoriais possíveis:

- escolas IDEB vinculadas ao cadastro;
- escolas sem match cadastral;
- DREs com registros IDEB;
- municípios com registros IDEB;
- DRE com maior cobertura IDEB;
- DRE com maior número de registros sem IDEB divulgado.

---

## 7. Indicadores permitidos nesta fase — apenas base IDEB 2023

### 6.1 Cobertura e elegibilidade

Indicadores recomendados:

- registros IDEB 2023 na base;
- escolas/INEPs únicos;
- registros com IDEB divulgado;
- registros sem IDEB divulgado;
- escolas com pelo menos um IDEB divulgado;
- escolas sem IDEB divulgado em qualquer etapa;
- cobertura IDEB por etapa;
- registros com `ND` em proficiência;
- registros com percentual avaliado abaixo de 80%;
- registros com percentual avaliado acima de 100 como alerta de qualidade.

### 6.2 Resultado por etapa

Indicadores possíveis:

- média simples de IDEB por etapa;
- média ponderada pelo total avaliado por etapa;
- mediana de IDEB por etapa;
- mínimo e máximo por etapa;
- distribuição por faixa de IDEB;
- proficiência média em Português por etapa;
- proficiência média em Matemática por etapa;
- fluxo médio por etapa;
- total avaliado por etapa.

Sempre calcular apenas com valores válidos e explicitar a base considerada.

### 6.3 Rankings escola a escola

Permitido, desde que:

- o ranking seja sempre filtrado por etapa;
- registros sem IDEB não entrem como zero;
- as etapas não sejam misturadas no mesmo ranking;
- o usuário consiga ver INEP, escola, etapa, IDEB, total avaliado e percentual avaliado.

Rankings sugeridos:

- maiores IDEBs por etapa;
- menores IDEBs por etapa;
- escolas sem IDEB divulgado por etapa;
- escolas com baixa participação por etapa.

### 6.4 Recortes territoriais

Disponíveis somente após vínculo com `schools`:

- média simples por DRE;
- média ponderada por DRE;
- média simples por município;
- média ponderada por município;
- cobertura IDEB por DRE;
- escolas sem IDEB divulgado por DRE;
- distribuição por faixa de IDEB por DRE.

Esses indicadores devem ser rotulados como agregações calculadas pelo dashboard, não como IDEB oficial territorial, salvo se a metodologia oficial for implementada futuramente.

---

## 8. Indicadores não permitidos nesta fase

| Indicador | Motivo |
|---|---|
| `Atingiu meta IDEB` | A base não traz meta e a Nota Informativa indica que 2023 não possui metas estipuladas no mesmo ciclo anterior |
| `Distância até a meta` | Meta ausente |
| Evolução histórica | A base possui apenas 2023 |
| Ranking geral misturando etapas | IDEB de etapas diferentes não deve ser comparado diretamente |
| IDEB ausente como zero | Metodologicamente incorreto |
| IDEB oficial por DRE/município calculado pelo dashboard | Exigiria metodologia oficial de agregação; médias simples/ponderadas do dashboard não substituem agregado oficial |
| Penalização automática no Índice de Saúde por ausência de IDEB | Ausência pode decorrer de elegibilidade/cobertura, não de desempenho |
| Cruzamento com abandono/reprovação declarados no formulário | Campos declaratórios ficam fora do escopo da primeira versão |
| Complementar lacunas do IDEB com dados informados por diretores | Mistura fonte oficial e fonte declaratória, podendo causar confusão |
| Comparar IDEB oficial com IDEB declarado pela escola | Auditoria possível no futuro, mas fora do escopo inicial |

---

## 9. Modelagem futura sugerida

Tabela proposta:

```txt
ideb_resultados
```

### 9.1 Grão

```txt
1 linha = escola/INEP × etapa × ano
```

### 9.2 Campos sugeridos

| Campo | Tipo conceitual | Observação |
|---|---|---|
| `id` | PK | Identificador interno |
| `ano` | int | 2023 nesta primeira carga |
| `codigo_inep` | text | Preservar como texto |
| `school_id` | int nullable | FK para `schools.id`, quando houver match seguro |
| `nome_escola_origem` | text | Nome como veio da planilha IDEB |
| `etapa` | text/enum | `anos_iniciais`, `anos_finais`, `ensino_medio` |
| `total_avaliado` | numeric nullable | `-` vira `NULL` |
| `percentual_avaliado` | numeric nullable | Preservar escala percentual da origem |
| `proficiencia_portugues` | numeric nullable | `-` e `ND` viram `NULL` numérico |
| `proficiencia_matematica` | numeric nullable | `-` e `ND` viram `NULL` numérico |
| `fluxo_indicador_rendimento` | numeric nullable | `-` vira `NULL` |
| `ideb` | numeric nullable | `-` vira `NULL`, nunca `0` |
| `status_ideb` | text | `com_ideb`, `sem_ideb_divulgado`, `nd_proficiencia`, `sem_resultado` |
| `status_vinculo` | text | `match_inep`, `sem_match_inep`, `conflito_nome`, `pendente_validacao` |
| `fonte_arquivo` | text | Nome do arquivo importado |
| `fonte_inep_url` | text | URL da fonte/metodologia INEP |
| `import_batch_id` | text/uuid | Auditoria de carga |
| `created_at` | timestamp | Controle |
| `updated_at` | timestamp | Controle |

### 9.3 Restrição de unicidade

```sql
UNIQUE (ano, codigo_inep, etapa)
```

### 9.4 Vínculo cadastral

Regras:

1. tentar match por `codigo_inep`;
2. se encontrar, preencher `school_id`;
3. se não encontrar, manter `school_id = NULL` e `status_vinculo = sem_match_inep`;
4. não criar escola automaticamente em `schools`;
5. não alterar `schools` por causa da planilha IDEB;
6. nomes divergentes geram alerta de qualidade, não bloqueio automático.

---

## 10. Endpoint futuro sugerido

Caminho proposto:

```txt
GET /v1/admin/analytics/perfil-alunos-resultados/ideb
```

### 10.1 Query params

```txt
ano=2023
etapa=anos_iniciais|anos_finais|ensino_medio
dre=
municipio=
regiao_integracao=
zona=
status_ideb=com_ideb|sem_ideb_divulgado|nd_proficiencia|sem_resultado
status_vinculo=match_inep|sem_match_inep|conflito_nome|pendente_validacao
somente_com_ideb=true|false
```

### 10.2 Payload conceitual

```ts
{
  resumo: {
    ano_referencia: 2023,
    total_registros: number,
    total_escolas_inep: number,
    registros_com_ideb: number,
    registros_sem_ideb: number,
    escolas_com_algum_ideb: number,
    escolas_sem_ideb_em_qualquer_etapa: number,
    cobertura_ideb_percentual: number,
    registros_sem_match_schools: number
  },
  porEtapa: [
    {
      etapa: "anos_iniciais" | "anos_finais" | "ensino_medio",
      registros: number,
      escolas: number,
      registros_com_ideb: number,
      registros_sem_ideb: number,
      cobertura_ideb_percentual: number,
      ideb_medio_simples: number | null,
      ideb_mediana: number | null,
      ideb_min: number | null,
      ideb_max: number | null,
      total_avaliado: number | null,
      percentual_avaliado_medio: number | null,
      proficiencia_portugues_media: number | null,
      proficiencia_matematica_media: number | null,
      fluxo_medio: number | null
    }
  ],
  distribuicaoFaixas: [
    {
      etapa: string,
      faixa: string,
      registros: number,
      percentual: number
    }
  ],
  porDre: [
    {
      dre: string,
      etapa: string,
      escolas: number,
      registros_com_ideb: number,
      registros_sem_ideb: number,
      ideb_medio_simples: number | null
    }
  ],
  porMunicipio: [
    {
      municipio: string,
      dre: string | null,
      etapa: string,
      escolas: number,
      registros_com_ideb: number,
      registros_sem_ideb: number,
      ideb_medio_simples: number | null
    }
  ],
  rankingEscolas: {
    maioresIdebs: [],
    menoresIdebs: [],
    semIdebDivulgado: [],
    baixaParticipacao: []
  },
  qualidade: {
    duplicidades_chave: number,
    registros_nd_proficiencia: number,
    percentuais_acima_100: number,
    percentuais_abaixo_80: number,
    nomes_repetidos_ineps_distintos: number,
    registros_sem_match_schools: number
  },
  metadados: {
    fonte_arquivo: "ideb_2023_iniciais_finais_medio.xlsx",
    fonte_metodologica: "https://download.inep.gov.br/ideb/nota_informativa_ideb_2023.pdf",
    grao: "INEP × etapa × ano",
    observacoes: [
      "Sem IDEB divulgado não equivale a nota zero.",
      "Médias territoriais do dashboard são médias simples das escolas com IDEB divulgado, não IDEB oficial recalculado pelo INEP.",
      "A base não contém metas IDEB 2023."
    ]
  }
}
```

---

## 12. Impacto no frontend

A aba atual `AbaPerfilAlunos.tsx` deve ser remodelada com cuidado para não misturar, na mesma leitura executiva, indicadores oficiais do IDEB 2023 com indicadores declaratórios do formulário.

### 12.1 Primeira versão — Resultados e Desempenho com base oficial

A primeira versão da frente deve priorizar apenas a base IDEB 2023 tratada:

- cobertura IDEB;
- registros com e sem IDEB divulgado;
- média simples por etapa;
- distribuição por faixa de IDEB;
- proficiências por etapa;
- fluxo/indicador de rendimento;
- total e percentual avaliado;
- rankings por etapa;
- recortes por DRE/município após vínculo com `schools`.

### 12.2 Perfil Socioeducacional e Permanência fica fora desta frente

O bloco **Perfil Socioeducacional e Permanência** deve permanecer fora do escopo da implementação IDEB inicial.

Campos como beneficiários, abandono, reprovação e demais informações prestadas pelos diretores podem voltar em uma frente futura, desde que:

- a fonte seja explicitada;
- a tela diferencie visualmente fonte oficial e fonte declaratória;
- a metodologia de cruzamento seja documentada;
- a gestão valide que a comparação entre fontes é desejável.

### 12.3 Convivência com implementação legada

Como a aba atual ainda consome `/v1/admin/indicadores-metrics`, há duas opções futuras de implementação:

1. substituir a aba por uma primeira versão enxuta baseada apenas no IDEB 2023; ou
2. manter temporariamente a visualização legada, mas criar separação visual clara para o bloco oficial do IDEB.

A recomendação metodológica é evitar uma tela que pareça consolidar tudo em uma única fonte quando, na prática, haveria mistura entre base oficial e preenchimento declaratório.

### 12.4 Ajuste necessário de filtros

A implementação futura deve receber e aplicar os filtros globais:

- ano;
- Região de Integração;
- DRE;
- município;
- zona;
- etapa.


---

## 11. Incrementos sequenciais recomendados

A implementação deve seguir incrementos lineares. Cada incremento deve gerar um PR próprio, pequeno e auditável.

### IDEB-00 — Documento metodológico

**Objetivo:** registrar decisões metodológicas antes de código.

Escopo:

- criar este documento;
- registrar diagnóstico da planilha;
- registrar decisão de não usar dados declaratórios na primeira versão;
- registrar regra de ausência de IDEB;
- registrar regra de agregações calculadas pelo dashboard;
- definir submenus, cards e payload conceitual.

Não faz:

- migration;
- importador;
- endpoint;
- frontend;
- carga de dados.

### IDEB-01 — Auditoria local da base e vínculo com `schools`

**Objetivo:** criar script/rotina de auditoria da planilha antes da carga oficial.

Escopo:

- ler `ideb_2023_iniciais_finais_medio.xlsx`;
- validar colunas esperadas;
- validar chave `ano + INEP + ensino`;
- contar registros com e sem IDEB;
- contar `ND`, `-`, percentuais acima de 100 e abaixo de 80;
- normalizar etapa;
- testar match com `schools.codigo_inep`;
- gerar relatório de qualidade.

Não faz:

- migration final;
- carga em produção;
- frontend.

### IDEB-02 — Migration da tabela `ideb_resultados`

**Objetivo:** criar estrutura persistente da fonte IDEB.

Escopo:

- criar tabela `ideb_resultados`;
- criar índices por `ano`, `codigo_inep`, `school_id`, `etapa`, `status_ideb`, `status_vinculo`;
- criar unicidade `ano + codigo_inep + etapa`;
- preparar FK nullable para `schools`.

Não faz:

- carga de dados;
- endpoint;
- frontend.

### IDEB-03 — Importador e carga controlada

**Objetivo:** carregar a base IDEB 2023 tratada no PostgreSQL.

Escopo:

- importar planilha;
- converter `-` e `ND` para `NULL`;
- preservar status textual;
- preservar INEP como texto;
- resolver `school_id` por `schools.codigo_inep`;
- registrar `status_ideb`;
- registrar `status_vinculo`;
- registrar `import_batch_id`;
- gerar sumário pós-carga.

Não faz:

- frontend;
- alteração visual na aba.

### IDEB-04 — Endpoint analítico

**Objetivo:** disponibilizar os dados agregados ao frontend.

Escopo:

- criar `/v1/admin/analytics/perfil-alunos-resultados/ideb`;
- aplicar filtros globais;
- retornar resumo, por etapa, faixas, rankings, qualidade e territórios;
- calcular média simples;
- calcular média ponderada pelo total avaliado;
- rotular observação metodológica no payload.

Não faz:

- UI final;
- alteração em `AbaPerfilAlunos.tsx`, exceto se necessário para teste técnico.

### IDEB-05 — Frontend da aba

**Objetivo:** remodelar `AbaPerfilAlunos.tsx` para exibir a primeira versão baseada no IDEB 2023.

Escopo:

- consumir novo endpoint;
- receber filtros globais;
- criar submenus/anchors;
- criar cards de visão geral;
- criar bloco por etapa;
- criar bloco de proficiências e fluxo;
- criar distribuição por faixa;
- criar tabela escola a escola/rankings;
- exibir textos metodológicos.

Não faz:

- uso de `census_responses.data`;
- comparação com dados declaratórios;
- índice de saúde operacional.

### IDEB-06 — Ajustes de UX, apresentação e documentação cruzada

**Objetivo:** lapidar a experiência e manter documentação alinhada.

Escopo:

- tooltips metodológicos;
- estados vazios;
- nota sobre agregações calculadas pelo dashboard;
- modo apresentação;
- anchors no menu lateral;
- atualização da matriz `matriz-abas-e-graficos.md`.

### IDEB-07 — Discussão futura: novas bases e enriquecimento

**Objetivo:** planejar expansão futura.

Possibilidades:

- bases oficiais agregadas do INEP;
- série histórica;
- metas, se houver fonte adequada;
- perfil socioeconômico;
- permanência e fluxo por fonte não declaratória;
- eventual comparação com dados declaratórios, se houver decisão metodológica.

---

## 13. Critérios de aceite da implementação futura

Antes de considerar a frente IDEB implementada, validar:

- [ ] carga preserva `INEP` como texto;
- [ ] `-` e `ND` não viram zero;
- [ ] registros sem IDEB são exibidos como `Sem IDEB divulgado`;
- [ ] não há ranking geral misturando etapas;
- [ ] médias territoriais são rotuladas como média simples ou média ponderada calculada pelo dashboard;
- [ ] ausência de meta impede cards de atingimento de meta;
- [ ] filtros globais funcionam no endpoint e no frontend;
- [ ] escolas sem match em `schools` aparecem em relatório de qualidade;
- [ ] nomes semelhantes com INEPs diferentes não são tratados como erro;
- [ ] documentação da metodologia aparece no tooltip ou texto de apoio do painel.
- [ ] nenhum card, gráfico ou ranking da primeira versão usa campos declaratórios de `census_responses.data`;
- [ ] nenhum valor calculado por DRE/município é chamado de IDEB oficial agregado sem fonte oficial agregada.

---

## 14. Decisões pendentes antes de codar

1. Definir se o arquivo `.xlsx` será versionado no repositório, armazenado fora do repo ou usado apenas como insumo local de importação.
2. Definir o vocabulário final de `status_ideb`.
3. Definir como exibir `Percentual avaliado > 100`: manter bruto com alerta ou criar campo derivado de qualidade.
4. Rodar auditoria de match contra `schools` antes da migration/importação.
5. Confirmar se os indicadores declaratórios atuais da aba permanecerão no mesmo componente ou se haverá divisão interna em componentes menores.

---

## 14. Conclusão metodológica

A frente está madura para avançar para documentação e, depois, implementação fatiada.

As duas principais decisões de governança de dados são:

```txt
INEP é a chave de integração; nome semelhante não é inconsistência.
```

```txt
Sem IDEB divulgado é condição metodológica/de cobertura; não é nota zero nem falha automática da escola.
```

Com essas decisões, a base IDEB 2023 pode entrar no dashboard como fonte externa oficial de **Resultados e Desempenho**, mantendo transparência sobre cobertura, elegibilidade e limitações metodológicas.

A primeira entrega deve assumir uma redução consciente de escopo: usar menos indicadores, mas com maior segurança metodológica, evitando a mistura entre dados oficiais e dados declaratórios até que novas bases oficiais ou tratadas sejam incorporadas.

---

## 15. Conclusão metodológica

A frente está madura para avançar para documentação e, depois, implementação fatiada.

As principais decisões de governança de dados são:

```txt
INEP é a chave de integração; nome semelhante não é inconsistência.
```

```txt
Sem IDEB divulgado é condição metodológica/de cobertura; não é nota zero nem falha automática da escola.
```

```txt
A primeira versão usará somente a base oficial IDEB 2023 tratada, sem misturar campos declaratórios do censo.
```

```txt
Agregações por DRE, município e filtros internos serão indicadores calculados pelo dashboard, não IDEB oficial agregado do INEP.
```

Com essas decisões, a base IDEB 2023 pode entrar no dashboard como fonte externa oficial de **Resultados e Desempenho**, mantendo transparência sobre cobertura, elegibilidade, agregações e limitações metodológicas.

A primeira entrega deve assumir uma redução consciente de escopo: usar menos indicadores, mas com maior segurança metodológica, evitando a mistura entre dados oficiais e dados declaratórios até que novas bases oficiais ou tratadas sejam incorporadas.
