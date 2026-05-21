# Critérios de Contagem e Qualidade dos Dados — Dashboard Admin

> **Frente A** do [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md).  
> **Pré-requisito:** Fase 1 validada em homologação.  
> **Escopo:** somente documentação. Nenhuma view, endpoint, migration ou alteração de código.  
> **Documentos companheiros:**
> - [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
> - [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
> - [validacao-fase-1.md](validacao-fase-1.md)
> - [jsonb-field-inventory.md](jsonb-field-inventory.md)

---

## Status de preenchimento

| Seção | Task (checklist) | Status |
|---|---|---|
| 1. Queries de diagnóstico | 1B.3 | ✅ Completa |
| 2. Distinção entre identificadores | 1B.1 | ⬜ A preencher |
| 3. Casos legítimos de INEP repetido | 1B.2 | ⬜ A preencher |
| 4. Semântica por indicador | 1B.4 | ⬜ A preencher |
| 5. Decisão sobre deduplicação | 1B.5 | ⬜ A preencher |
| 6. Divergências PostgreSQL × Sheets | subitem de 1B.3/1B.4 | ⬜ A preencher (após rodar as queries) |

---

## 1. Queries de diagnóstico

> **Tipo:** somente leitura. Rodar contra cópia em homologação ou dump anonimizado.  
> Salvar os resultados como anexos deste documento ao executar.  
> As queries são reproduzíveis — podem ser re-executadas em qualquer ciclo para detectar deriva.

### 1.1 INEPs repetidos em `schools`

Identifica `codigo_inep` que aparecem em mais de uma linha da tabela `schools`. O banco possui a
constraint `UNIQUE (codigo_inep)`, portanto o resultado esperado em ambiente saudável é **zero linhas**.
A query serve para confirmar que a constraint está ativa e não foi contornada por operações
diretas no banco (`INSERT` sem validação).

```sql
SELECT
    s.codigo_inep,
    COUNT(*)                                       AS qtd_registros,
    array_agg(s.id        ORDER BY s.id)           AS school_ids,
    array_agg(s.nome_escola ORDER BY s.id)         AS nomes,
    array_agg(s.dre       ORDER BY s.id)           AS dres,
    array_agg(s.municipio ORDER BY s.id)           AS municipios
FROM schools s
WHERE s.codigo_inep IS NOT NULL
  AND s.codigo_inep <> ''
GROUP BY s.codigo_inep
HAVING COUNT(*) > 1
ORDER BY qtd_registros DESC, s.codigo_inep;
```

**Resultado esperado:** zero linhas.  
**Se houver linhas:** registrar cada INEP duplicado com seus `school_ids`, e abrir investigação
antes de prosseguir para Fases 2A em diante, pois as contagens de `escola distinta` seriam
afetadas.

---

### 1.2 Respostas de censo por escola — múltiplos anos e concentração

A constraint `UNIQUE (school_id, year)` em `census_responses` impede duas linhas com o mesmo par
`(school_id, year)`. Ainda assim, uma mesma escola pode acumular linhas de anos distintos à
medida que os ciclos anuais progridem. Esta query mapeia essa concentração.

```sql
-- Escolas com registros de censo em mais de um ano
-- (comportamento esperado no ciclo anual; útil para entender o volume acumulado)
SELECT
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    COUNT(cr.id)                                 AS qtd_registros_censo,
    array_agg(cr.year   ORDER BY cr.year)        AS anos,
    array_agg(cr.status ORDER BY cr.year)        AS status_por_ano,
    MAX(cr.updated_at)                           AS ultima_atualizacao
FROM schools s
JOIN census_responses cr ON cr.school_id = s.id
GROUP BY s.id, s.codigo_inep, s.nome_escola, s.dre, s.municipio
HAVING COUNT(cr.id) > 1
ORDER BY qtd_registros_censo DESC, s.dre, s.nome_escola;
```

**Resultado esperado:** escolas que participaram de mais de um ciclo anual. A presença de `status
= 'completed'` em anos distintos para a mesma escola é **normal** e não é duplicidade.  
**Atenção:** os KPIs de alunos em `analytics/overview` filtram por `year = ano corrente` exatamente
para evitar inflação causada por esse acúmulo multi-anual.

Complementar: volume consolidado por estado de situação.

```sql
-- Resumo: quantas escolas têm 1, 2, 3... registros de censo
SELECT
    qtd_registros_censo,
    COUNT(*) AS qtd_escolas
FROM (
    SELECT school_id, COUNT(*) AS qtd_registros_censo
    FROM census_responses
    GROUP BY school_id
) sub
GROUP BY qtd_registros_censo
ORDER BY qtd_registros_censo;
```

---

### 1.3 Escolas sem nenhum censo

Escolas cadastradas em `schools` sem qualquer linha correspondente em `census_responses`. Essas
escolas aparecem em `total_schools` (contagem de `schools`) mas **não** em `completed` nem em
`drafts`.

```sql
SELECT
    s.id          AS school_id,
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    s.zona,
    s.created_at  AS data_cadastro
FROM schools s
LEFT JOIN census_responses cr ON cr.school_id = s.id
WHERE cr.id IS NULL
ORDER BY s.dre, s.municipio, s.nome_escola;
```

**Complementar — contagem por DRE:**

```sql
SELECT
    COALESCE(NULLIF(s.dre, ''), 'Não informado') AS dre,
    COUNT(*)                                      AS escolas_sem_censo
FROM schools s
LEFT JOIN census_responses cr ON cr.school_id = s.id
WHERE cr.id IS NULL
GROUP BY 1
ORDER BY escolas_sem_censo DESC, 1;
```

**Resultado esperado:** representa o percentual de escolas que ainda não iniciaram o formulário.
Esse número explica parte da diferença entre `total_schools` e `completed + drafts`.

---

### 1.4 Censos `draft` × `completed` por DRE

Panorama do estado de preenchimento das escolas por regional (DRE), incluindo escolas sem
nenhum registro.

```sql
SELECT
    COALESCE(NULLIF(s.dre, ''), 'Não informado')                          AS dre,
    COUNT(DISTINCT s.id)                                                   AS total_escolas_cadastradas,
    COUNT(DISTINCT cr.school_id) FILTER (WHERE cr.status = 'completed')   AS escolas_completed,
    COUNT(DISTINCT cr.school_id) FILTER (WHERE cr.status = 'draft')       AS escolas_draft,
    COUNT(DISTINCT s.id)
        - COUNT(DISTINCT cr.school_id)                                     AS escolas_sem_nenhum_censo,
    ROUND(
        100.0
        * COUNT(DISTINCT cr.school_id) FILTER (WHERE cr.status = 'completed')
        / NULLIF(COUNT(DISTINCT s.id), 0),
    1)                                                                     AS pct_adesao_completed
FROM schools s
LEFT JOIN census_responses cr ON cr.school_id = s.id
GROUP BY 1
ORDER BY total_escolas_cadastradas DESC, 1;
```

**Leitura das colunas:**

| Coluna | Descrição |
|---|---|
| `total_escolas_cadastradas` | Todas as escolas em `schools` para a DRE, com ou sem censo. |
| `escolas_completed` | Escolas com ao menos um censo `completed` (qualquer ano). Conta distinta — não infla por multi-ano. |
| `escolas_draft` | Escolas com ao menos um censo `draft` e nenhum `completed`. |
| `escolas_sem_nenhum_censo` | Escolas sem nenhuma linha em `census_responses`. |
| `pct_adesao_completed` | Percentual de adesão: `completed / total_cadastradas × 100`. |

> **Notar:** uma escola que tinha `completed` em 2024 e ainda está em `draft` em 2025 aparece em
> `escolas_completed` (porque `COUNT DISTINCT` encontra o censo `completed` do ano anterior).
> Para análise restrita ao ciclo corrente, adicionar `AND cr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int`.

---

### 1.5 Divergências PostgreSQL × Sheets — referência cruzada

Comparação entre os valores retornados pelo endpoint `/v1/admin/analytics/overview` (PostgreSQL)
e pelo endpoint `/v1/admin/sheet-metrics` (Google Sheets). Os resultados devem ser registrados
na tabela de paridade de [validacao-fase-1.md](validacao-fase-1.md).

#### Lado PostgreSQL (via SQL — idêntico ao que o handler `AdminAnalyticsOverview` calcula)

```sql
-- KPIs principais
SELECT
    (SELECT COUNT(*) FROM schools)                                               AS pg_total_schools,
    COUNT(DISTINCT school_id) FILTER (WHERE status = 'completed')               AS pg_completed,
    COUNT(DISTINCT school_id) FILTER (WHERE status = 'draft')                   AS pg_drafts,
    COALESCE(SUM(total_alunos) FILTER (
        WHERE status = 'completed'
          AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0)                  AS pg_total_alunos,
    COALESCE(SUM(alunos_pcd) FILTER (
        WHERE status = 'completed'
          AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0)                  AS pg_alunos_pcd,
    COALESCE(AVG(total_alunos) FILTER (
        WHERE status = 'completed'
          AND total_alunos IS NOT NULL
          AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0)                  AS pg_media_alunos
FROM vw_censo_base;
```

```sql
-- Distribuição por zona
SELECT
    COALESCE(NULLIF(zona, ''), 'Não informado') AS zona,
    COUNT(DISTINCT school_id)                   AS pg_total
FROM vw_censo_base
GROUP BY 1
ORDER BY pg_total DESC, 1;
```

#### Lado Google Sheets (via API)

```bash
# Obter token via POST /v1/admin/login primeiro
curl -s \
  -H "Authorization: Bearer <TOKEN>" \
  "${API_URL:-http://localhost:8000}/v1/admin/sheet-metrics" | jq
```

#### Tabela de paridade (preencher com resultados reais)

| Métrica | PostgreSQL | Sheets | Delta | Hipótese de causa |
|---|---:|---:|---:|---|
| Total de escolas (completed) | | | | |
| Total de alunos | | | | |
| Alunos PcD | | | | |
| Média de alunos por escola | | | | |
| Escolas — Zona Urbana | | | | |
| Escolas — Zona Rural | | | | |
| Escolas — Zona Ribeirinha | | | | |
| Escolas — Zona "Não informado" | | | | |

> Essa tabela espelha a de [validacao-fase-1.md](validacao-fase-1.md). Preencher os dois
> documentos ao mesmo tempo ao rodar os endpoints em homologação.

**Critério de aceite (ver checklist 1B.7):**
- Delta = 0 para `total_schools`, `completed`, `drafts`.
- Delta ≤ 1% para `total_alunos` e `alunos_pcd` (arredondamento aceitável).
- Qualquer delta superior exige hipótese de causa documentada antes de avançar para a Fase 2A.

---

## 2. Distinção entre identificadores e status

> ⬜ **A preencher — Task 1B.1**

Documentar a diferença semântica entre:
- `school_id` — PK em `schools`
- `codigo_inep` — código externo do INEP (8 dígitos), `UNIQUE` no banco
- `census_id` — PK em `census_responses`
- `status` — `'draft'` ou `'completed'`

E qual identificador é canônico para cada recorte analítico (contagem de escolas, contagem de
censos, soma de alunos).

---

## 3. Casos legítimos de INEP repetido

> ⬜ **A preencher — Task 1B.2**

Registrar se existem e como aparecem casos de escolas ou anexos com o mesmo `codigo_inep` no
contexto do SEDUC-PA, sem alterar o banco.

---

## 4. Semântica por indicador

> ⬜ **A preencher — Task 1B.4**

Para cada KPI retornado por `/v1/admin/analytics/overview`, registrar a fórmula SQL exata usada
pelo handler `AdminAnalyticsOverview` em `api/cmd/api/analytics.go`, a justificativa do recorte,
e a instrução de que os endpoints da Fase 2A devem replicar o mesmo critério.

---

## 5. Decisão sobre deduplicação

> ⬜ **A preencher — Task 1B.5**

Registrar explicitamente que **nesta fase não haverá deduplicação automática** e listar os
critérios que disparariam uma futura proposta.

---

## Referências

- [`infra/init.sql`](../../infra/init.sql) — definição das tabelas `schools` e `census_responses`
- [`infra/migrations/0001_vw_censo_base.sql`](../../infra/migrations/0001_vw_censo_base.sql) — view base
- [`api/cmd/api/analytics.go`](../../api/cmd/api/analytics.go) — handler `AdminAnalyticsOverview`
- [`docs/dashboard/jsonb-field-inventory.md`](jsonb-field-inventory.md) — inventário de campos JSONB
- [`docs/dashboard/validacao-fase-1.md`](validacao-fase-1.md) — tabela de paridade Fase 1
