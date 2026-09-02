# Perfil dos Alunos e Resultados — IDEB 2025

**Status:** documentação técnica da implementação IDEB 2025.

**Referência anterior:** [`perfil-alunos-resultados-ideb-2023.md`](perfil-alunos-resultados-ideb-2023.md)

## 1. Diretriz

O IDEB 2025 é uma nova dimensão temporal da mesma série armazenada em
`ideb_resultados`. O grão continua sendo `INEP × etapa × ano`; não existe tabela
ou endpoint paralelo para 2025.

## 2. Fonte e diferenças de estrutura

Arquivo analisado: `ideb_2023_2025_iniciais_finais_medio.xlsx`.

Aba utilizada: `IDEB 2025`.

A fonte 2025 distingue dois conceitos que não podem ser tratados como
sinônimos:

- `QT. DE ALUNOS MATRICULADOS CENSO`: quantidade de matrículas usada como
  denominador da taxa de participação;
- `PRESENTES`: quantidade de alunos presentes na aplicação, isto é, o campo que
  corresponde semanticamente à quantidade efetivamente avaliada;
- `TAXA DE PARTICIPACAO`: percentual de participação informado pela fonte.

Por isso, **matriculados no Censo não deve alimentar `total_avaliado`**. Fazer
isso distorceria métricas ponderadas do dashboard.

## 3. Mapeamento canônico

| Campo canônico | IDEB 2023 | IDEB 2025 |
|---|---|---|
| `ano` | `ANO` | `ANO` |
| `etapa` | `Ensino` | `Ensino` |
| `codigo_inep` | `INEP` | `INEP` |
| `nome_escola_origem` | `NOME DA ESCOLA` | `NOME DA ESCOLA` |
| `total_avaliado` | `Total avaliado` | `PRESENTES` |
| `percentual_avaliado` | `Percentual avaliado` | `TAXA DE PARTICIPACAO` |
| `proficiencia_portugues` | `Proficiência Português` | `Proficiencia Portugues` |
| `proficiencia_matematica` | `Proficiência Matemática` | `Proficiencia Matematica` |
| `fluxo_indicador_rendimento` | `Fluxo - Indicador de rendimento` | `Fluxo - Indicador de rendimento` |
| `ideb` | `IDEB 2023` | `IDEB 2025` |
| `presentes` | — | `PRESENTES` |

`QT. DE ALUNOS MATRICULADOS CENSO` continua sendo validado pelo importador como
insumo da fonte (`matriculados_censo`), mas o modelo atual não o persiste em uma
coluna própria. A taxa oficial fornecida pela planilha é preservada em
`percentual_avaliado`.

## 4. Normalização de etapas

| Valor da fonte 2025 | Chave canônica |
|---|---|
| `5º ano do Ensino Fundamental` | `anos_iniciais` |
| `9º ano de Ensino Fundamental` | `anos_finais` |
| `3ª/4ª série do Ensino Médio` | `ensino_medio` |

## 5. Persistência e migrations

A migration `0022_add_ideb_presentes_column.sql` adiciona `presentes` como
nullable, preservando compatibilidade com 2023.

A migration `0023_fix_ideb_2025_total_avaliado_semantics.sql` corrige de forma
idempotente eventuais linhas de 2025 carregadas antes da correção do importador:
`total_avaliado` passa a receber `presentes`.

A carga continua idempotente por:

```sql
ON CONFLICT (ano, codigo_inep, etapa) DO UPDATE
```

Não há `TRUNCATE` ou `DELETE` da série histórica.

## 6. Regras metodológicas preservadas

- IDEB ausente permanece `NULL`, nunca `0`;
- `-`, vazio e `ND` não viram zero;
- 2023 e 2025 permanecem isolados pelo campo `ano`;
- rankings continuam particionados por etapa;
- agregações por DRE/município são cálculos do dashboard, não IDEB oficial
  agregado do INEP;
- a média ponderada usa `total_avaliado`, que em 2025 corresponde a `PRESENTES`.

## 7. Frontend e metadata

O frontend usa `resumo.ano_referencia` para títulos e descrições. Nenhum texto
visual da aba deve ficar preso a `IDEB 2023` ao consultar 2025.

Arquivo de origem, nota metodológica e lote de importação também são exibidos de
forma dinâmica.

## 8. Testes de regressão

A suíte cobre, entre outros pontos:

- configuração 2023 e 2025;
- `total_avaliado -> PRESENTES` em 2025;
- preservação do mapeamento original de 2023;
- ausência/`ND` -> `NULL`;
- INEP como texto;
- chave `(ano, codigo_inep, etapa)`;
- UPSERT idempotente;
- metadata multi-ano sem referência visual fixa a 2023.
