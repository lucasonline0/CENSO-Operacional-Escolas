# Validação — Fase 1

> **Contexto:** Fase 1 do [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md).
> **Escopo:** primeira fundação analítica via PostgreSQL — view `vw_censo_base`, endpoint `GET /v1/admin/analytics/overview` e refatoração mínima dos 4 cards principais da aba "Caracterização da Rede" no `/admin`.
> **Status do documento:** modelo a ser preenchido manualmente após deploy em homologação. Os critérios de aceite estão na seção 9 do roadmap (Fase 1).

---

## Como gerar os valores

### PostgreSQL — endpoint `analytics/overview`

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "${API_URL:-http://localhost:8000}/v1/admin/analytics/overview" | jq
```

Resposta esperada (forma):

```json
{
  "total_schools": 0,
  "total_censuses": 0,
  "completed": 0,
  "drafts": 0,
  "total_alunos": 0,
  "alunos_pcd": 0,
  "media_alunos_por_escola": 0,
  "por_zona": [{ "zona": "Urbana", "total": 0 }]
}
```

### PostgreSQL — direto na view (sanity check)

```sql
-- Visão "completados" (espelha exatamente o critério do endpoint)
--   * completed / drafts: COUNT(DISTINCT school_id) para evitar inflação
--     quando houver censos de mais de um ano por escola.
--   * total_alunos / alunos_pcd / média: filtradas pelo ano corrente para
--     evitar inflação acumulada entre ciclos anuais. Filtros por ano via
--     querystring serão tratados em fase futura.
SELECT
  COUNT(DISTINCT school_id) FILTER (WHERE status = 'completed')             AS completed,
  COUNT(DISTINCT school_id) FILTER (WHERE status = 'draft')                 AS drafts,
  COALESCE(SUM(total_alunos) FILTER (
      WHERE status = 'completed'
        AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0)                AS total_alunos,
  COALESCE(SUM(alunos_pcd)   FILTER (
      WHERE status = 'completed'
        AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0)                AS alunos_pcd,
  COALESCE(AVG(total_alunos) FILTER (
      WHERE status = 'completed'
        AND total_alunos IS NOT NULL
        AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0)                AS media
FROM vw_censo_base;

-- Distribuição por zona (sem filtro de ano — escolas únicas)
SELECT COALESCE(NULLIF(zona, ''), 'Não informado') AS zona,
       COUNT(DISTINCT school_id) AS total
FROM vw_censo_base
GROUP BY 1
ORDER BY 2 DESC, 1;
```

### Google Sheets — endpoint atual (referência)

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "${API_URL:-http://localhost:8000}/v1/admin/sheet-metrics" | jq
```

---

## Métricas comparadas

| Métrica | PostgreSQL (`analytics/overview`) | Valor atual no admin (`sheet-metrics`) | Delta | Situação |
|---|---:|---:|---:|---|
| Total de escolas (completed) | | | | |
| Total de alunos | | | | |
| Alunos PcD | | | | |
| Média de alunos por escola | | | | |
| Escolas — Zona Urbana | | | | |
| Escolas — Zona Rural | | | | |
| Escolas — Zona Ribeirinha | | | | |
| Escolas — Zona "Não informado" | | | | |

> **Convenção de aceitação (ver seção 9 do roadmap):** delta ≤ 1% para `total_alunos` / `alunos_pcd` (arredondamento aceitável); delta = 0 para contagens de `total_schools` e `status`.

### Notas sobre o critério `completed` e ano corrente

- O **endpoint analítico** somou apenas censos com `status = 'completed'` para `total_alunos`, `alunos_pcd` e `media_alunos_por_escola`. Esse é o mesmo recorte usado pela aba `Base_dados` da planilha (que só recebe `completed` via job de sync).
- **Ano corrente** (`year = EXTRACT(YEAR FROM CURRENT_DATE)::int`) é aplicado às métricas quantitativas de alunos. Motivação: a constraint do banco é `UNIQUE(school_id, year)`, ou seja, uma escola acumula uma linha por ciclo anual. Sem o filtro, `SUM(total_alunos)` cresceria a cada ciclo concluído. Filtros por ano via querystring (`?year=`) serão tratados em fase futura.
- `completed` e `drafts` usam `COUNT(DISTINCT school_id)` — uma escola com censos em múltiplos anos é contada **uma vez**. Casa com a semântica do card "Total de Escolas (Censos concluídos)" no painel admin.
- O card "Total de Escolas" no admin Fase 1 mostra `completed` (não `COUNT(*) FROM schools`), preservando o significado original ("escolas que concluíram o censo"). Para o número absoluto de escolas cadastradas use a aba **Operacional** (card "Escolas Cadastradas", endpoint `/v1/admin/dashboard`).

---

## Observações

- [ ] A migration `infra/migrations/0001_vw_censo_base.sql` foi aplicada com sucesso pelo loader em `main.go`? (verificar log `applyMigrations: 0001_vw_censo_base.sql aplicada`)
- [ ] A view existe? `SELECT 1 FROM pg_views WHERE viewname = 'vw_censo_base';`
- [ ] O endpoint responde 200 com o payload esperado?
- [ ] Os 4 cards no `/admin` (aba Caracterização da Rede) mostram os números do PostgreSQL? Verificar pelo sub-rótulo "Censos concluídos · PostgreSQL" no card "Total de Escolas".
- [ ] Caso o endpoint falhe, a UI exibe banner amarelo "Indicadores principais via PostgreSQL indisponíveis (...)" e mantém os cards alimentados pela planilha (fallback gracioso).
- [ ] `sheet-metrics` continua respondendo (donuts, barras e tabela DRE seguem alimentados por ele).
- [ ] `indicadores-metrics` continua respondendo (aba "Perfil dos Alunos").
- [ ] `GET /v1/locations` continua respondendo (formulário público).

## Divergências aceitas

As divergências entre PostgreSQL e Sheets conhecidas e aceitas para esta fase estão documentadas
em **[criterios-contagem-e-qualidade-dados.md — seção 6](criterios-contagem-e-qualidade-dados.md#6-divergências-postgresql--sheets)**,
incluindo hipótese de causa para cada uma.

As hipóteses prováveis documentadas são:

| Cenário | Causa provável |
|---|---|
| `total_alunos` PG < Sheets | Escolas `completed` sem `total_alunos` preenchido (campo `NULL` na view) |
| `completed` PG ≠ Sheets | Sheets conta linhas da planilha (pode ter duplicatas de sync); PG usa `DISTINCT school_id` |
| `por_zona` PG ≠ Sheets | Sheets só recebe `completed`; PG conta todo o cadastro cadastrado |
| Qualquer KPI PG > Sheets | Censos `completed` ainda pendentes de sync (`sheet_synced_at IS NULL`) |

## Pendências

- [ ] Preencher a tabela "Métricas comparadas" acima com valores reais de homologação
      (espelhar também em [criterios-contagem-e-qualidade-dados.md — seção 6.2](criterios-contagem-e-qualidade-dados.md#62-tabela-de-divergências)).
- [ ] Anexar resultados das queries de saneamento da seção 8.4 do [jsonb-field-inventory.md](jsonb-field-inventory.md): verificar se há valores não-numéricos nos campos `total_alunos`, `alunos_pcd`, etc.
- [ ] Para qualquer divergência ≥ 1% encontrada, registrar hipótese de causa antes de avançar para a Fase 2A.
