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

## Validação online — Fase 2A

> Registro da validação técnica feita em **produção (Railway)** após o deploy da migration `0002_vw_censo_enriquecida.sql` e dos dois novos endpoints. Esta seção fixa os números observados na janela de validação — não é a tabela de paridade contra Sheets (essa segue em "Métricas comparadas").

### Ambiente

- **Plataforma:** Railway.
- **Domínio público:** `https://censo-operacional-escolas-production.up.railway.app`.
- **Observação:** o domínio interno `*.railway.internal` **não resolve fora da rede interna do Railway**. Validações externas devem usar exclusivamente o domínio `production.up.railway.app`.

### Migrations

Logs de startup do binário Go no Railway:

```txt
applyMigrations: 2 migration(s) encontrada(s): [0001_vw_censo_base.sql 0002_vw_censo_enriquecida.sql]
applyMigrations: 0001_vw_censo_base.sql aplicada com sucesso
applyMigrations: 0002_vw_censo_enriquecida.sql aplicada com sucesso
```

Mensagens auxiliares observadas na mesma inicialização:

```txt
Banco conectado
SheetsService iniciado
DriveService iniciado
Servidor rodando na porta 8080
```

Conclusão: as duas migrations rodaram em ordem (0001 antes de 0002), de forma idempotente e sem erro. `SheetsService` segue ativo — Google Sheets, `sheet-metrics`, `indicadores-metrics` e `/v1/locations` preservados.

### Health check

`GET /v1/health`:

```json
{"error":false,"message":"system operational"}
```

`GET /`:

```txt
Censo API Online
```

### Endpoint `/v1/admin/analytics/overview`

Resposta capturada em produção (Fase 1, mantida intacta — referência cruzada com os KPIs da Fase 2A):

```json
{
  "error": false,
  "data": {
    "total_schools": 894,
    "total_censuses": 858,
    "completed": 818,
    "drafts": 40,
    "total_alunos": 413934.03,
    "alunos_pcd": 15337,
    "media_alunos_por_escola": 506.03182151589243,
    "por_zona": [
      { "zona": "Urbana", "total": 646 },
      { "zona": "Rural", "total": 234 },
      { "zona": "Ribeirinha", "total": 14 }
    ]
  }
}
```

Observação importante para casamento com a Fase 2A:

- `total_schools = 894` conta **todas** as escolas em `schools`, incluindo as que ainda não têm censo (LEFT JOIN em `vw_censo_base`).
- `completed = 818` é a contagem `COUNT(DISTINCT school_id) FILTER (status='completed')` — é esse número que vira `kpis.total_escolas` na Fase 2A.
- `por_zona` aqui agrega **todas** as escolas (não filtra por `completed`/ano), por isso os valores (646/234/14) são maiores que os de `caracterizacao/perfil.por_zona` (608/197/13), que respeita o recorte completed + ano corrente. Diferença esperada por construção, não é divergência.

### Endpoint `/v1/admin/analytics/caracterizacao/perfil`

Resposta capturada em produção:

```json
{
  "error": false,
  "data": {
    "kpis": {
      "total_escolas": 818,
      "total_alunos": 413934.03,
      "media_alunos_por_escola": 506.03182151589243,
      "alunos_pcd": 15337
    },
    "por_porte": [
      { "porte": "0-50", "escolas": 22, "percentual": 2.69 },
      { "porte": "50-150", "escolas": 74, "percentual": 9.05 },
      { "porte": "150-300", "escolas": 204, "percentual": 24.94 },
      { "porte": "300-500", "escolas": 174, "percentual": 21.27 },
      { "porte": "500-1000", "escolas": 260, "percentual": 31.78 },
      { "porte": "1000+", "escolas": 84, "percentual": 10.27 }
    ],
    "por_zona": [
      { "zona": "Urbana", "escolas": 608, "percentual": 74.33 },
      { "zona": "Rural", "escolas": 197, "percentual": 24.08 },
      { "zona": "Ribeirinha", "escolas": 13, "percentual": 1.59 }
    ],
    "matriculas_por_porte": [
      { "porte": "0-50", "total_alunos": 343.03 },
      { "porte": "50-150", "total_alunos": 7617 },
      { "porte": "150-300", "total_alunos": 45832 },
      { "porte": "300-500", "total_alunos": 67471 },
      { "porte": "500-1000", "total_alunos": 186622 },
      { "porte": "1000+", "total_alunos": 106049 }
    ]
  }
}
```

Validações automáticas feitas sobre o payload:

| Check | Resultado |
|---|---|
| `error == false` | OK |
| Soma de `por_porte[*].escolas` | 22 + 74 + 204 + 174 + 260 + 84 = **818** — bate com `kpis.total_escolas` |
| Soma de `por_porte[*].percentual` | 2.69 + 9.05 + 24.94 + 21.27 + 31.78 + 10.27 = **100.00%** |
| Soma de `por_zona[*].escolas` | 608 + 197 + 13 = **818** — bate com `kpis.total_escolas` |
| Soma de `por_zona[*].percentual` | 74.33 + 24.08 + 1.59 = **100.00%** |
| Soma de `matriculas_por_porte[*].total_alunos` | 343.03 + 7617 + 45832 + 67471 + 186622 + 106049 = **413.934,03** — bate com `kpis.total_alunos` |
| Nenhuma escola caiu em `porte = "Não informado"` no recorte completed | OK (faixa não aparece no array, conforme `GROUP BY`) |
| Nenhuma escola caiu em `zona = "Não informado"` no recorte completed | OK |

### Endpoint `/v1/admin/analytics/caracterizacao/dre`

Resultado validado em produção:

- `error == false`.
- Payload contém `top_dres` e `detalhamento`.
- `top_dres[*].escolas` e `detalhamento[*].escolas` são iguais elemento a elemento (construídos no mesmo loop em Go, mesmo `ORDER BY escolas DESC, dre`).
- Soma de `detalhamento[*].escolas` fecha em **818** — bate com `kpis.total_escolas` do `/caracterizacao/perfil` e com `completed` do `/overview`.
- Valores consistentes com o critério provisório (`status='completed'`, ano corrente, `COUNT(DISTINCT school_id)`, sem dedup por INEP).

Amostra do `detalhamento` (DREs com maior contagem):

| DRE        | Escolas | Total de alunos | Salas de aula |
|------------|--------:|----------------:|--------------:|
| CASTANHAL  | 48      | 25.488          | 470           |
| ABAETETUBA | 47      | 27.559          | 900           |
| SANTAREM   | 43      | 23.518          | 440           |
| CAPANEMA   | 35      | 18.801          | 1.530         |
| BRAGANCA   | 33      | 15.452          | 278           |

`top_dres` retorna **todas** as DREs ordenadas por `escolas DESC`, não um Top 10 — a limitação visual fica para a Fase 2B (slicing client-side).

### Teste de autenticação

Requisição sem header `Authorization`:

```http
GET /v1/admin/analytics/caracterizacao/perfil
```

Resposta:

```json
{"error":true,"message":"token de autenticação necessário"}
```

Endpoint corretamente protegido por `requireAdminAuth`. O mesmo comportamento se aplica ao `/caracterizacao/dre` (mesmo grupo Chi).

### Observações e pendências

1. **Valores decimais em `total_alunos`.** Foram observados decimais em campo que conceitualmente é inteiro:
   - total geral: `413934.03`;
   - porte `0-50`: `343.03`;
   - amostras por DRE:
     - BELEM 8: `9187.661`
     - BELEM 9: `9179.496`
     - BENEVIDES: `10109.726`
     - BREVES: `9823.147`

   A view trata `total_alunos` como `numeric` (cast seguro via regex em `vw_censo_base`) — qualquer valor numérico válido é aceito, inclusive decimais. A presença de fracionários sugere preenchimento atípico no formulário (possivelmente percentuais sendo digitados no campo errado, ou valores médios). **Não bloqueia a validação técnica da Fase 2A**; deve ser investigado pela Frente A (qualidade dos dados) e, se necessário, mitigado por validação no front ou na ingestão.

2. **Critério provisório aplicado.** Os endpoints da Fase 2A seguem o critério herdado da Fase 1:
   - `status = 'completed'`;
   - ano corrente (`EXTRACT(YEAR FROM CURRENT_DATE)::int`);
   - `COUNT(DISTINCT school_id)` para contagem de escolas;
   - **sem** deduplicação automática por INEP;
   - **sem** exclusão automática de registros.
   Divergências legítimas (escola/anexo com mesmo INEP, drafts não migrados, correções pós-sync na planilha) ficam para a Frente A documentar em `criterios-contagem-e-qualidade-dados.md`.

3. **Estado da UI.** A aba "Caracterização da Rede" **ainda não foi migrada**. Continua consumindo `/v1/admin/sheet-metrics`. A migração visual é a Fase 2B.

4. **`top_dres` sem limite.** Retorna todas as DREs ordenadas. A limitação a Top N (10/20) é decisão de apresentação e ficará na Fase 2B.

5. **Preservação confirmada em runtime.** Em produção continuam ativos e funcionais:
   - `SheetsService` (logs de startup);
   - `sheetSyncRetryJob` (job de 10 min);
   - `POST /v1/admin/sync-sheets`;
   - `GET /v1/locations`;
   - `GET /v1/admin/sheet-metrics`;
   - `GET /v1/admin/indicadores-metrics`;
   - `POST /v1/census`.

### Veredito

**Fase 2A validada tecnicamente em produção.**

Ressalvas:

- investigar valores decimais em `total_alunos` (responsabilidade da Frente A — qualidade dos dados);
- UI ainda não migrada — Fase 2B trata da substituição visual;
- deduplicação / INEP repetido será tratado pela Frente A;
- `top_dres` retorna todas as DREs e pode ser limitado visualmente na Fase 2B.

## Pendências

- [x] ~~Rodar `go build ./cmd/api/...` em ambiente com Go instalado e anexar saída.~~ — Implicitamente validado pelo deploy bem-sucedido no Railway (binário compilado, iniciado e respondendo).
- [x] ~~Aplicar as migrations 0001+0002 em homologação e validar que ambas são idempotentes (rerun deve ser no-op).~~ — Aplicadas com sucesso no startup do Railway (logs em "Validação online — Fase 2A › Migrations"). Idempotência garantida pelo `CREATE OR REPLACE VIEW`; rerun nas reinicializações do container confirma o comportamento.
- [ ] Coletar os números reais contra `sheet-metrics` e preencher a tabela "Métricas comparadas". (Os números do PostgreSQL já estão fixados em "Validação online".)
- [ ] Confirmar com a Frente A se os critérios de contagem usados aqui são os definitivos antes da Fase 2B.
- [ ] Se a Frente A introduzir um recorte distinto de "ano corrente" (por exemplo, ano mais recente com ao menos N respostas), realinhar `WHERE year = ...` nos handlers.
- [ ] Investigar com a Frente A a origem dos valores decimais em `total_alunos` (campo conceitualmente inteiro recebendo `xxxx.yyy`).
