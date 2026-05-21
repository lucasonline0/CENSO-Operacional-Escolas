# Validação — Fase 2A

**Documentos companheiros:**
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [validacao-fase-1.md](validacao-fase-1.md)
- [jsonb-field-inventory.md](jsonb-field-inventory.md)

## Objetivo

Validar os endpoints backend da Caracterização da Rede consumindo PostgreSQL (Fase 2A), antes da migração visual (Fase 2B).

A Fase 2A é **só backend**: a UI da aba "Caracterização da Rede" segue consumindo `/v1/admin/sheet-metrics`. Os endpoints abaixo apenas tornam disponível o caminho PostgreSQL para a próxima fase.

## Endpoints

- `GET /v1/admin/analytics/caracterizacao/perfil`
- `GET /v1/admin/analytics/caracterizacao/dre`

Ambos protegidos por `requireAdminAuth` (JWT). Consomem `vw_censo_enriquecida` (migration `0002_vw_censo_enriquecida.sql`), que deriva de `vw_censo_base` sem alterá-la.

## Critério provisório

Herdado da Fase 1 enquanto a Frente A não publicar o documento definitivo de critérios:

- `status = 'completed'`
- `year = EXTRACT(YEAR FROM CURRENT_DATE)::int` (ano corrente)
- sem deduplicação automática por INEP
- `COUNT(DISTINCT school_id)` para quantidade de escolas
- `SUM(total_alunos)`, `SUM(alunos_pcd)`, `SUM(qtd_salas_aula)` para totais
- `AVG(total_alunos) FILTER (WHERE total_alunos IS NOT NULL)` para média (evita média subestimada por escolas sem o campo preenchido)
- `dre` / `zona` vazios ou NULL caem em `'Não informado'`

Faixas de porte (`porte_escola_nome` / `porte_escola_cod`):

| Faixa     | Código |
|-----------|--------|
| Não informado | 0 |
| 0-50      | 1 |
| 50-150    | 2 |
| 150-300   | 3 |
| 300-500   | 4 |
| 500-1000  | 5 |
| 1000+     | 6 |

Labels usam hífen ASCII (`-`) — o guia metodológico usa en-dash, mas em payload JSON o hífen ASCII evita ambiguidades de encoding no front.

## Payloads de resposta

### `GET /v1/admin/analytics/caracterizacao/perfil`

```jsonc
{
  "error": false,
  "data": {
    "kpis": {
      "total_escolas": 0,
      "total_alunos": 0,
      "media_alunos_por_escola": 0,
      "alunos_pcd": 0
    },
    "por_porte": [
      { "porte": "500-1000", "escolas": 0, "percentual": 0 }
    ],
    "por_zona": [
      { "zona": "Urbana", "escolas": 0, "percentual": 0 }
    ],
    "matriculas_por_porte": [
      { "porte": "500-1000", "total_alunos": 0 }
    ]
  }
}
```

### `GET /v1/admin/analytics/caracterizacao/dre`

```jsonc
{
  "error": false,
  "data": {
    "top_dres": [
      { "dre": "CASTANHAL", "escolas": 0 }
    ],
    "detalhamento": [
      {
        "dre": "CASTANHAL",
        "escolas": 0,
        "total_alunos": 0,
        "media_alunos_por_escola": 0,
        "salas_aula": 0
      }
    ]
  }
}
```

`top_dres` é derivado do `detalhamento` em uma única query (já ordenada por `escolas DESC`) para garantir consistência entre os dois blocos — o consumidor pode usar `top_dres` para o gráfico de barras "Escolas por DRE" e `detalhamento` para a tabela.

## Métricas comparadas (a preencher em homologação)

> Preencher após executar os dois endpoints contra a base de homologação e a planilha em paralelo.

| Métrica | PostgreSQL | Sheets/admin atual | Delta | Observação |
|---|---:|---:|---:|---|
| Total de escolas (KPI) |  |  |  |  |
| Total de alunos (KPI) |  |  |  |  |
| Média de alunos/escola (KPI) |  |  |  |  |
| Alunos PcD (KPI) |  |  |  |  |
| Escolas por porte: 0-50 |  |  |  |  |
| Escolas por porte: 50-150 |  |  |  |  |
| Escolas por porte: 150-300 |  |  |  |  |
| Escolas por porte: 300-500 |  |  |  |  |
| Escolas por porte: 500-1000 |  |  |  |  |
| Escolas por porte: 1000+ |  |  |  |  |
| Escolas por porte: Não informado |  |  |  |  |
| Escolas por zona: Urbana |  |  |  |  |
| Escolas por zona: Rural |  |  |  |  |
| Escolas por zona: Ribeirinha |  |  |  |  |
| Escolas por zona: Não informado |  |  |  |  |
| Matrículas por porte: 0-50 |  |  |  |  |
| Matrículas por porte: 50-150 |  |  |  |  |
| Matrículas por porte: 150-300 |  |  |  |  |
| Matrículas por porte: 300-500 |  |  |  |  |
| Matrículas por porte: 500-1000 |  |  |  |  |
| Matrículas por porte: 1000+ |  |  |  |  |
| Escolas por DRE (top 5) |  |  |  |  |
| Total de alunos por DRE (top 5) |  |  |  |  |
| Média alunos/escola por DRE (top 5) |  |  |  |  |
| Salas de aula por DRE (top 5) |  |  |  |  |

> **Critério de aceite numérico (sugerido):** delta ≤ 1% em KPIs e categorias com volume ≥ 50 escolas; deltas maiores devem ser explicados pela Frente A em [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) (INEP repetido, drafts não migrados, anexos, etc.).

## SQL de sanity check

Executar contra a base de homologação. Todas as queries assumem `data` JSONB já saneado pela `vw_censo_base`.

### Contagem por porte

```sql
SELECT
  porte_escola_nome              AS porte,
  COUNT(DISTINCT school_id)      AS escolas,
  ROUND(100.0 * COUNT(DISTINCT school_id)
        / NULLIF(SUM(COUNT(DISTINCT school_id)) OVER (), 0), 2) AS pct
FROM vw_censo_enriquecida
WHERE status = 'completed'
  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY porte_escola_nome, porte_escola_cod
ORDER BY porte_escola_cod;
```

### Contagem por zona

```sql
SELECT
  COALESCE(NULLIF(zona, ''), 'Não informado') AS zona,
  COUNT(DISTINCT school_id)                   AS escolas
FROM vw_censo_enriquecida
WHERE status = 'completed'
  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY 1
ORDER BY escolas DESC, 1;
```

### Soma de alunos por porte

```sql
SELECT
  porte_escola_nome              AS porte,
  COALESCE(SUM(total_alunos), 0) AS total_alunos
FROM vw_censo_enriquecida
WHERE status = 'completed'
  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY porte_escola_nome, porte_escola_cod
ORDER BY porte_escola_cod;
```

### Resumo por DRE

```sql
SELECT
  COALESCE(NULLIF(dre, ''), 'Não informado')                                     AS dre,
  COUNT(DISTINCT school_id)                                                      AS escolas,
  COALESCE(SUM(total_alunos), 0)                                                 AS total_alunos,
  COALESCE(AVG(total_alunos) FILTER (WHERE total_alunos IS NOT NULL), 0)         AS media_alunos,
  COALESCE(SUM(qtd_salas_aula), 0)                                               AS salas_aula
FROM vw_censo_enriquecida
WHERE status = 'completed'
  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY 1
ORDER BY escolas DESC, dre;
```

### Sanidade da view (regressão Fase 1)

```sql
-- A view enriquecida deve ter exatamente a mesma cardinalidade da base.
SELECT
  (SELECT COUNT(*) FROM vw_censo_base)        AS base,
  (SELECT COUNT(*) FROM vw_censo_enriquecida) AS enriquecida,
  (SELECT COUNT(*) FROM vw_censo_enriquecida) -
  (SELECT COUNT(*) FROM vw_censo_base)        AS delta;
```

```sql
-- Climatização: as 4 categorias devem cobrir 100% das linhas.
SELECT situacao_climatizacao_salas, COUNT(*)
FROM vw_censo_enriquecida
WHERE status = 'completed'
  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY 1
ORDER BY 2 DESC;
```

## Observações

- A view `vw_censo_enriquecida` é apenas derivada: não inclui filtro por `status` ou `year`. Os filtros analíticos vivem nos endpoints, exatamente como na Fase 1. Isso preserva a possibilidade de outros endpoints/futuras fases consumirem a view com recortes diferentes (por exemplo, comparativo plurianual).
- Os endpoints da Fase 2A **não substituem** `/v1/admin/sheet-metrics`. A UI da aba "Caracterização da Rede" continua lendo da planilha. A substituição visual é a Fase 2B.
- O Google Sheets, o job de sync (`sheetSyncRetryJob`), `GET /v1/locations`, `POST /v1/admin/sync-sheets`, `/v1/admin/sheet-metrics` e `/v1/admin/indicadores-metrics` permanecem intactos.
- `vw_censo_base` não foi alterada nesta task.
- Faixas de porte usam hífen ASCII (`-`); o guia metodológico usa en-dash (`–`). Se a UI tiver textos legados baseados em en-dash, o mapeamento será feito na Fase 2B.

## Pendências

- [ ] Rodar `go build ./cmd/api/...` em ambiente com Go instalado e anexar saída.
- [ ] Aplicar as migrations 0001+0002 em homologação e validar que ambas são idempotentes (rerun deve ser no-op).
- [ ] Coletar os números reais e preencher a tabela "Métricas comparadas".
- [ ] Confirmar com a Frente A se os critérios de contagem usados aqui são os definitivos antes da Fase 2B.
- [ ] Se a Frente A introduzir um recorte distinto de "ano corrente" (por exemplo, ano mais recente com ao menos N respostas), realinhar `WHERE year = ...` nos handlers.
