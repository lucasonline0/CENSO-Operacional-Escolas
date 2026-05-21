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
| 3. Casos legítimos de INEP repetido | 1B.2 | ✅ Completa |
| 4. Semântica por indicador | 1B.4 | ✅ Completa |
| 5. Decisão sobre deduplicação | 1B.5 | ✅ Completa |
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

> ✅ **Task 1B.1 — concluída**

### 2.1 Os quatro identificadores

#### `school_id`

| Atributo | Detalhe |
|---|---|
| Tipo | `SERIAL PRIMARY KEY` em `schools` |
| Gerado por | Backend (auto-increment do PostgreSQL) |
| Exposição | **Interno** — nunca exibido ao diretor. Armazenado no `localStorage` do front após cadastro da escola (Step 1) para vincular os passos seguintes do formulário. |
| Unicidade | Absoluta — uma linha em `schools` por `school_id`. |

`school_id` é o **elo relacional** do sistema: `census_responses.school_id` aponta para ele via FK
com `ON DELETE CASCADE`. Toda análise SQL que une escolas e censos passa por esse vínculo.

---

#### `codigo_inep`

| Atributo | Detalhe |
|---|---|
| Tipo | `VARCHAR(20) UNIQUE` em `schools` |
| Origem | INEP (Instituto Nacional de Estudos e Pesquisas Educacionais) — 8 dígitos |
| Exposição | **Público** — o diretor informa o código INEP no Step 1 para localizar sua escola. |
| Unicidade | Garantida por constraint no banco (`UNIQUE`). |

`codigo_inep` é o **identificador institucional**: é o código que o SEDUC, INEP e demais órgãos
usam para referenciar a escola externamente. No formulário, ele serve de chave de busca na Step 1.

> **Relação com `school_id`:** cada `codigo_inep` mapeia para exatamente um `school_id`. Como a
> constraint é `UNIQUE`, a query `SELECT id FROM schools WHERE codigo_inep = $1` retorna no máximo
> uma linha — e esse `id` é o `school_id` usado em todo o restante do sistema.

---

#### `census_id`

| Atributo | Detalhe |
|---|---|
| Tipo | `SERIAL PRIMARY KEY` em `census_responses` (`cr.id`) |
| Gerado por | Backend (auto-increment do PostgreSQL) |
| Unicidade por | Par `(school_id, year)` — constraint `UNIQUE (school_id, year)` impede dois registros para a mesma escola no mesmo ciclo anual. |

`census_id` identifica **uma resposta de censo específica**: a combinação escola × ano. Uma mesma
escola gera um `census_id` por ciclo anual.

> **Importante:** o merge no handler `CreateOrUpdateCenso` (`handlers.go:142–157`) **atualiza** o
> registro existente quando `(school_id, year)` já existe — não cria uma nova linha. Portanto,
> `census_id` não muda durante o preenchimento incremental do formulário.

---

#### `status`

| Valor | Significado |
|---|---|
| `'draft'` | Preenchimento em andamento. O censo ainda não foi submetido. Não sincroniza para o Google Sheets. |
| `'completed'` | Censo finalizado e submetido. Dispara o job de sync para o Sheets (`sheet_synced_at IS NULL → pendente`). |

`status` é o **filtro analítico primário**: praticamente todos os KPIs do dashboard usam
`WHERE status = 'completed'` para excluir rascunhos inacabados.

---

### 2.2 Identificador canônico por recorte analítico

| Recorte | Identificador canônico | SQL canônico | Justificativa |
|---|---|---|---|
| **Total de escolas cadastradas** | `school_id` | `COUNT(*) FROM schools` | Conta todas as escolas, com ou sem censo. Fonte: tabela `schools`. |
| **Escolas com censo concluído** | `school_id` | `COUNT(DISTINCT school_id) FILTER (WHERE status = 'completed')` via `vw_censo_base` | `DISTINCT` evita inflação quando uma escola tem censos `completed` em múltiplos anos. |
| **Escolas com censo em andamento** | `school_id` | `COUNT(DISTINCT school_id) FILTER (WHERE status = 'draft')` via `vw_censo_base` | Idem — conta escolas, não registros. |
| **Escolas sem nenhum censo** | `school_id` | `LEFT JOIN census_responses … WHERE cr.id IS NULL` | Usa `school_id` para o `LEFT JOIN`. |
| **Total de registros de censo** | `census_id` | `COUNT(*) FILTER (WHERE census_id IS NOT NULL)` via `vw_censo_base` | Conta linhas de censo (escola × ano). Inclui `draft` e `completed`. |
| **Total de alunos** | `census_id` + filtro `status`/`year` | `SUM(total_alunos) FILTER (WHERE status = 'completed' AND year = ano_corrente)` | Restringe ao ciclo atual para evitar inflação acumulada entre anos. Ver seção 4. |
| **Alunos PcD** | idem | `SUM(alunos_pcd) FILTER (WHERE status = 'completed' AND year = ano_corrente)` | Idem. |
| **Média de alunos por escola** | idem | `AVG(total_alunos) FILTER (WHERE status = 'completed' AND total_alunos IS NOT NULL AND year = ano_corrente)` | `IS NOT NULL` exclui escolas sem dado preenchido da média. |
| **Distribuição por zona** | `school_id` | `COUNT(DISTINCT school_id) GROUP BY zona` via `vw_censo_base` | Agrupa escolas (não censos). Uma escola com dois anos conta uma vez por zona. |
| **Lookup externo / comunicação institucional** | `codigo_inep` | `WHERE codigo_inep = $1` | Único identificador reconhecido externamente por INEP/SEDUC. |

---

### 2.3 Resumo do fluxo de identificadores no formulário

```
Diretor informa codigo_inep (Step 1)
  → GET /v1/schools?inep=<codigo>
  → Retorna { id: <school_id>, ... }
  → Front armazena school_id no localStorage

Diretor preenche Steps 2–11
  → POST /v1/census { school_id, year, status: 'draft', data: {...} }
  → Backend faz merge JSONB se (school_id, year) já existe
  → census_id permanece o mesmo durante todo o preenchimento

Diretor finaliza (Step 11 — declaração)
  → POST /v1/census { school_id, year, status: 'completed', data: {...} }
  → sheet_synced_at = NULL (pendente de sync)
  → Job de 10 min sincroniza para Google Sheets
```

A rastreabilidade completa de uma resposta é: `codigo_inep → school_id → census_id (school_id, year)`.

---

### 2.4 O que cada identificador **não** representa

- `school_id` **não** é o código INEP — não deve ser exposto em relatórios externos.
- `codigo_inep` **não** deve ser usado como FK no banco (é `VARCHAR`, não `INT`, e pode conter
  variações de formatação). O vínculo relacional usa sempre `school_id`.
- `census_id` **não** identifica uma "submissão" — ele é estável durante todo o ciclo (vide merge).
  Para rastrear a última atualização, usar `census_responses.updated_at`.
- `status = 'completed'` **não** significa que o censo foi sincronizado para o Sheets —
  isso é indicado por `sheet_synced_at IS NOT NULL`.

---

## 3. Casos legítimos de INEP repetido

> ✅ **Task 1B.2 — concluída**

### 3.1 Realidade do SEDUC-PA: anexos e unidades vinculadas

No contexto educacional do Pará, é comum que uma escola possua **unidades físicas secundárias
(anexos)** que operam administrativamente sob o mesmo INEP da unidade-sede. O INEP não emite
códigos separados para cada prédio — o código identifica a **entidade jurídico-administrativa**,
não o imóvel.

Exemplos de situações legítimas:

| Situação | Descrição |
|---|---|
| Escola com anexo rural | Sede urbana + sala multisseriada em comunidade ribeirinha, mesmo INEP |
| Escola com extensão em outro bairro | Unidade pedagógica vinculada sem CNPJ próprio |
| Escola indígena com posto avançado | Aldeia-sede + posto em aldeia vizinha, mesmo gestor e INEP |

---

### 3.2 Como o sistema trata isso hoje

A constraint `UNIQUE (codigo_inep)` em `schools` **impede a criação de duas linhas com o mesmo
INEP**. Internamente, o método `SchoolModel.Insert` (`api/internal/models/models.go:64–93`)
implementa um **upsert por INEP**:

```go
// models.go:66–93 (resumido)
queryCheck := `SELECT id FROM schools WHERE codigo_inep = $1`
err := m.DB.QueryRowContext(..., queryCheck, school.INEP).Scan(&existingID)

if err == nil {
    // INEP já existe → atualiza a linha existente, retorna o mesmo school_id
    UPDATE schools SET nome_escola = $1, ... WHERE id = $16
    return existingID, nil
}
// INEP não existe → insere nova linha
INSERT INTO schools (...) VALUES (...) RETURNING id
```

**Consequência prática:** independentemente de quantas unidades físicas compartilham um INEP,
existe **uma única linha em `schools`** com um único `school_id`. Todas as submissões de censo
para aquele INEP apontam para o mesmo `school_id`.

O campo `possui_anexos` (e `qtd_anexos`, `tipo_predio_anexo`) no JSONB de `census_responses`
é a única forma de registrar a existência de unidades físicas secundárias dentro do formulário
atual — eles não geram linhas separadas no banco.

---

### 3.3 Implicação analítica

**Para contagem de escolas:** `COUNT(DISTINCT school_id)` e `COUNT(*) FROM schools` contam a
**entidade administrativa**, não o número de prédios. Uma escola com 3 anexos aparece como 1.

**Para métricas de alunos:** `total_alunos` preenchido no formulário deve refletir o total
consolidado da entidade (sede + anexos). A instrução não é explícita no formulário — isso é
um risco de qualidade de dados (ver seção 3.4).

**Para a camada analítica futura:** se for necessário contar prédios físicos, a fonte é
`SUM(qtd_anexos) + COUNT(school_id)` — mas somente para censos `completed` com `possui_anexos
= 'Sim'` e `qtd_anexos` preenchido.

---

### 3.4 Risco: "last write wins" em caso de múltiplos preenchedores

Se dois preenchedores distintos (diretor da sede e diretor do anexo) acessam o formulário com
o mesmo INEP **no mesmo ciclo anual**, ambos submetem para o mesmo `(school_id, year)`. O
handler faz merge de JSONB (`handlers.go:154–156`), mas para chaves presentes em ambas as
submissões **o valor mais recente sobrescreve o anterior** (`ON CONFLICT … DO UPDATE`).

Isso não é uma duplicidade de registro — é uma sobreposição de dados. O banco fica consistente
(uma linha por escola × ano), mas os dados podem refletir apenas a última submissão recebida.

**Decisão desta fase:** registrar como risco conhecido. Não há deduplicação automática nem
controle de múltiplos preenchedores no escopo atual. Qualquer mitigação (ex.: bloquear o
formulário após `completed`) está fora do escopo da Frente A.

---

### 3.5 Verificação no banco

Para confirmar o comportamento descrito (resultado esperado: zero linhas, pois a constraint
e o upsert impedem duplicidade de INEP):

```sql
-- Confirma: não existe INEP com mais de uma linha em schools
SELECT codigo_inep, COUNT(*) AS qtd
FROM schools
WHERE codigo_inep IS NOT NULL AND codigo_inep <> ''
GROUP BY codigo_inep
HAVING COUNT(*) > 1;
-- Resultado esperado: zero linhas
```

```sql
-- Escolas que declararam possuir anexos (fonte: census_responses.data)
SELECT
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    cr.year,
    cr.data->>'possui_anexos'                   AS possui_anexos,
    cr.data->>'qtd_anexos'                      AS qtd_anexos,
    cr.data->>'tipo_predio_anexo'               AS tipo_predio_anexo
FROM schools s
JOIN census_responses cr ON cr.school_id = s.id
WHERE cr.status = 'completed'
  AND cr.data->>'possui_anexos' = 'Sim'
ORDER BY s.dre, s.nome_escola;
```

---

## 4. Semântica por indicador

> ✅ **Task 1B.4 — concluída**

Esta seção documenta a fórmula SQL exata e a justificativa de cada KPI retornado por
`GET /v1/admin/analytics/overview` (handler `AdminAnalyticsOverview`,
`api/cmd/api/analytics.go`). **Os endpoints da Fase 2A devem reusar exatamente estes
recortes** para garantir consistência numérica entre abas do dashboard.

---

### 4.1 `total_schools` — total de escolas cadastradas

```sql
(SELECT COUNT(*) FROM schools) AS total_schools
```

**Fonte:** tabela `schools` diretamente (subconsulta independente da `vw_censo_base`).  
**Recorte:** todas as escolas, independentemente de terem ou não um censo.  
**Justificativa:** representa o universo operacional completo — quantas escolas o SEDUC-PA
tem cadastradas no sistema, com ou sem participação no censo. É o denominador natural para
cálculos de adesão.

> **Não confundir com `completed`:** `total_schools` inclui escolas sem nenhum censo; `completed`
> conta apenas as que concluíram o formulário. A diferença entre os dois revela o nível de
> adesão ao censo.

---

### 4.2 `total_censuses` — total de registros de censo

```sql
COUNT(*) FILTER (WHERE census_id IS NOT NULL) AS total_censuses
```

**Fonte:** `vw_censo_base` (que faz `LEFT JOIN schools ← census_responses`).  
**Recorte:** linhas da view onde `census_id IS NOT NULL`, ou seja, escolas que possuem ao menos
um registro em `census_responses` (qualquer `status`, qualquer `year`).  
**Justificativa:** conta pares `(school_id × year)` efetivamente registrados — inclui `draft` e
`completed`, e acumula entre ciclos anuais. Útil para entender o volume operacional total do
sistema, não a qualidade dos dados.

---

### 4.3 `completed` — escolas com censo concluído

```sql
COUNT(DISTINCT school_id) FILTER (WHERE status = 'completed') AS completed
```

**Fonte:** `vw_censo_base`.  
**Recorte:** escolas **distintas** com ao menos um registro `completed` (qualquer ano).  
**Justificativa do `DISTINCT`:** sem ele, uma escola que concluiu o censo em 2024 e novamente
em 2025 seria contada duas vezes. `DISTINCT school_id` garante que a contagem representa
**"quantas escolas únicas já concluíram o censo"**, independentemente do número de ciclos.

> **Semântica do card no dashboard:** "Total de Escolas (Censos concluídos)". Responde à pergunta
> "quantas escolas distintas enviaram o censo com status final?".

---

### 4.4 `drafts` — escolas com censo em rascunho

```sql
COUNT(DISTINCT school_id) FILTER (WHERE status = 'draft') AS drafts
```

**Fonte:** `vw_censo_base`.  
**Recorte:** escolas **distintas** com ao menos um registro `draft` (qualquer ano).  
**Justificativa:** mesma lógica do `completed` — `DISTINCT` evita inflação por multi-ano.

> **Atenção de interpretação:** uma escola pode ter um censo `completed` de 2024 e um `draft` de
> 2025. Ela aparece **simultaneamente** em `completed` e em `drafts`. As duas contagens não são
> mutuamente exclusivas — não somam para `total_schools`.

---

### 4.5 `total_alunos` — total de alunos matriculados

```sql
COALESCE(
    SUM(total_alunos) FILTER (
        WHERE status = 'completed'
          AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
    ), 0
)::float8 AS total_alunos
```

**Fonte:** campo `total_alunos` de `vw_censo_base` (cast numérico com proteção de regex
aplicado na view sobre `census_responses.data->>'total_alunos'`).  
**Recorte duplo:**
1. `status = 'completed'` — exclui rascunhos inacabados, cujos dados são incompletos ou
   provisórios.
2. `year = ano corrente` — evita inflação acumulada entre ciclos anuais. Sem este filtro,
   uma escola que completou o censo em 2024 e 2025 somaria seus alunos duas vezes.

**`COALESCE(..., 0)`:** retorna 0 em vez de `NULL` quando não há nenhum censo `completed` no
ano corrente (ex.: início de ciclo).

> **Filtro de ano fixo:** hoje o endpoint não aceita `?year=` via querystring — o ano corrente é
> calculado em tempo de execução (`EXTRACT(YEAR FROM CURRENT_DATE)`). Filtros por ano serão
> tratados em fase futura (ver roadmap).

---

### 4.6 `alunos_pcd` — alunos com deficiência

```sql
COALESCE(
    SUM(alunos_pcd) FILTER (
        WHERE status = 'completed'
          AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
    ), 0
)::float8 AS alunos_pcd
```

**Fonte:** campo `alunos_pcd` de `vw_censo_base`.  
**Recorte:** idêntico ao de `total_alunos` — `completed` + ano corrente.  
**Justificativa:** mesmos motivos: excluir rascunhos e evitar inflação multi-anual.

---

### 4.7 `media_alunos_por_escola` — média de alunos por escola

```sql
COALESCE(
    AVG(total_alunos) FILTER (
        WHERE status = 'completed'
          AND total_alunos IS NOT NULL
          AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
    ), 0
)::float8 AS media_alunos
```

**Fonte:** campo `total_alunos` de `vw_censo_base`.  
**Recorte triplo:**
1. `status = 'completed'` — mesmo critério dos KPIs anteriores.
2. `year = ano corrente` — mesmo critério.
3. `total_alunos IS NOT NULL` — **exclusão explícita de escolas sem o campo preenchido**. Sem
   este filtro, escolas que enviaram o censo mas não preencheram `total_alunos` entrariam no
   denominador do `AVG` com valor `NULL`, que o PostgreSQL descarta automaticamente — mas a
   presença explícita do filtro documenta a intenção e evita confusão futura.

**Denominador efetivo:** número de escolas `completed` no ano corrente **com `total_alunos`
preenchido** — não o total de escolas cadastradas.

---

### 4.8 `por_zona` — distribuição de escolas por zona

```sql
SELECT
    COALESCE(NULLIF(zona, ''), 'Não informado') AS zona,
    COUNT(DISTINCT school_id)                   AS total
FROM vw_censo_base
GROUP BY 1
ORDER BY total DESC, zona
```

**Fonte:** coluna `schools.zona` exposta em `vw_censo_base`.  
**Recorte:** **sem filtro de `status` ou `year`** — conta escolas distintas cadastradas por zona,
independentemente de terem censo. Isso é intencional: zona é uma propriedade da escola, não do
censo.  
**`COALESCE(NULLIF(zona, ''), 'Não informado')`:** normaliza `NULL` e string vazia para o rótulo
`'Não informado'`, evitando que escolas sem zona informada desapareçam dos resultados.  
**`COUNT(DISTINCT school_id)`:** uma escola com censos em múltiplos anos é contada uma única
vez por zona.

---

### 4.9 Tabela-resumo dos recortes

| KPI | Tabela-fonte | Filtro `status` | Filtro `year` | Agregação | `DISTINCT`? |
|---|---|---|---|---|---|
| `total_schools` | `schools` | — | — | `COUNT(*)` | — |
| `total_censuses` | `vw_censo_base` | `IS NOT NULL` (census_id) | — | `COUNT(*)` | Não |
| `completed` | `vw_censo_base` | `= 'completed'` | — | `COUNT` | **Sim** |
| `drafts` | `vw_censo_base` | `= 'draft'` | — | `COUNT` | **Sim** |
| `total_alunos` | `vw_censo_base` | `= 'completed'` | **= ano corrente** | `SUM` | — |
| `alunos_pcd` | `vw_censo_base` | `= 'completed'` | **= ano corrente** | `SUM` | — |
| `media_alunos` | `vw_censo_base` | `= 'completed'` + `IS NOT NULL` | **= ano corrente** | `AVG` | — |
| `por_zona` | `vw_censo_base` | — | — | `COUNT` | **Sim** |

---

### 4.10 Contrato para endpoints da Fase 2A

Os endpoints `GET /v1/admin/analytics/caracterizacao/perfil` e `.../dre` (Fase 2A, Frente B)
**devem replicar exatamente os recortes acima** para qualquer métrica que também apareça no
`overview`. Desvios precisam ser justificados explicitamente em
`docs/dashboard/validacao-fase-2.md`.

Regras derivadas deste contrato:

1. Métricas de **contagem de escolas** usam sempre `COUNT(DISTINCT school_id)`.
2. Métricas de **volume de alunos** usam sempre `status = 'completed' AND year = ano_corrente`.
3. Métricas de **distribuição geográfica** (zona, DRE, município) não filtram por `status` nem
   `year` — contam o cadastro.
4. Novos filtros opcionais (`?year=`, `?dre=`, `?zona=`) são **adicionais** aos recortes base —
   nunca os substituem sem documentação explícita.

---

## 5. Decisão sobre deduplicação

> ✅ **Task 1B.5 — concluída**

### 5.1 Decisão desta fase

**Nesta fase (Fase 1B / Frente A), não haverá deduplicação automática de nenhum tipo.**

Divergências entre PostgreSQL e Google Sheets, ou inconsistências internas nos dados, serão
**documentadas**, não corrigidas silenciosamente. Qualquer correção de dados exige aprovação
explícita do produto/operação e está fora do escopo desta frente.

Esta decisão é intencional e alinhada com a regra do `plano-trabalho-paralelo.md`:

> *"Divergências devem ser registradas, não corrigidas automaticamente."*

---

### 5.2 Por que não deduplicar agora

| Razão | Detalhe |
|---|---|
| **Não há duplicatas reais de escola** | A constraint `UNIQUE (codigo_inep)` + o upsert em `SchoolModel.Insert` garantem uma única linha por INEP em `schools`. Não existe cenário de deduplicação necessária nessa dimensão (ver seção 3). |
| **Não há duplicatas de censo** | A constraint `UNIQUE (school_id, year)` + o `ON CONFLICT DO UPDATE` em `CensusModel.Upsert` garantem no máximo uma linha por `(escola × ano)`. |
| **Sobreposição de dados ≠ duplicata** | O risco "last write wins" (seção 3.4) é uma questão de qualidade de dado dentro de um único registro, não uma duplicata de linha. A mitigação correta é de processo (quem preenche o formulário), não de deduplicação SQL. |
| **Impacto desconhecido** | Sem os resultados reais das queries de diagnóstico (seção 1) preenchidos na tabela de paridade (seção 1.5), não é possível avaliar se alguma divergência justificaria uma correção. |
| **Risco de perda de dados** | Qualquer lógica de merge automático entre censos poderia sobrescrever respostas legítimas de diretores, sem rastreabilidade. |

---

### 5.3 Critérios que disparariam uma proposta futura de deduplicação

Uma proposta formal de deduplicação só deve ser aberta se **todos** os critérios abaixo forem
atendidos:

1. **Volume confirmado:** as queries de diagnóstico (seção 1) foram executadas em homologação e
   a tabela de paridade (seção 1.5) está preenchida com valores reais.

2. **Impacto em KPI ≥ 1%:** a divergência identificada afeta ao menos um KPI do
   `analytics/overview` em magnitude superior a 1% (limiar de aceite definido em
   `validacao-fase-1.md`).

3. **Hipótese de causa documentada:** existe uma hipótese clara e rastreável para a origem da
   divergência (ex.: escola cadastrada duas vezes com INEPs distintos por erro operacional,
   censo submetido em ano errado, etc.).

4. **Aprovação explícita do produto/operação:** a decisão de corrigir os dados foi validada por
   um responsável do SEDUC-PA ou da equipe de produto — não pode ser decisão unilateral técnica.

5. **Estratégia de correção reversível:** a correção proposta é executada via script auditável
   (não direto no banco em produção), com backup previamente realizado e possibilidade de rollback.

---

### 5.4 O que esta fase entrega em vez de deduplicação

Em vez de corrigir, a Frente A entrega:

- **Visibilidade:** queries reproduzíveis (seção 1) para que qualquer pessoa possa rodar o
  diagnóstico a qualquer momento.
- **Rastreabilidade:** tabela de paridade PG × Sheets (seção 1.5) com hipótese de causa por
  divergência.
- **Contrato:** semântica fixada por indicador (seção 4) para que divergências futuras sejam
  detectáveis por comparação contra este documento.
- **Critérios claros** (seção 5.3) para que a equipe saiba exatamente quando e como abrir uma
  proposta de correção no futuro.

---

## Referências

- [`infra/init.sql`](../../infra/init.sql) — definição das tabelas `schools` e `census_responses`
- [`infra/migrations/0001_vw_censo_base.sql`](../../infra/migrations/0001_vw_censo_base.sql) — view base
- [`api/cmd/api/analytics.go`](../../api/cmd/api/analytics.go) — handler `AdminAnalyticsOverview`
- [`docs/dashboard/jsonb-field-inventory.md`](jsonb-field-inventory.md) — inventário de campos JSONB
- [`docs/dashboard/validacao-fase-1.md`](validacao-fase-1.md) — tabela de paridade Fase 1
