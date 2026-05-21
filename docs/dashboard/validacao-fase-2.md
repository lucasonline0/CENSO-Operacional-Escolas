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

## Fase 2B.1 — Migração da UI (apenas frontend)

> Esta seção registra a etapa visual da Caracterização da Rede. Backend, migrations e endpoints permanecem inalterados — apenas `web/src/app/admin/page.tsx` foi tocado.

### Escopo migrado

A aba "Caracterização da Rede" agora consome os endpoints da Fase 2A diretamente:

- KPIs (total de escolas, total de alunos, média por escola, alunos PcD), donut de porte, donut de zona e barras de matrículas por porte → `GET /v1/admin/analytics/caracterizacao/perfil`.
- Barras "Escolas Concluídas por DRE (Top 15)" e tabela "Detalhamento por DRE" → `GET /v1/admin/analytics/caracterizacao/dre`.

A aba "Perfil dos Alunos e Resultados" segue inalterada (lê `indicadores-metrics`). A aba "Operacional", "Todos os Censos" e "Por DRE" seguem inalteradas (lêem `/v1/admin/dashboard` e `/v1/admin/census`).

### Fallback

`GET /v1/admin/sheet-metrics` é carregado em paralelo aos endpoints PostgreSQL. Se `caracterizacao/perfil` falhar, KPIs/donuts/matrículas caem para `sheet-metrics`; se `caracterizacao/dre` falhar, barras e tabela DRE caem para `sheet-metrics`. As falhas são independentes — uma parte da aba pode estar em PG enquanto a outra está em fallback.

Indicador discreto no topo da aba mostra a fonte ativa:

- "Fonte: PostgreSQL · ano corrente · censos concluídos" (verde) quando ambos endpoints respondem.
- "Fonte: Google Sheets · fallback (parcial)" (âmbar) quando exatamente um endpoint PG falha.
- "Fonte: Google Sheets · fallback" (âmbar) quando ambos endpoints PG falham.

Se o PG responder mas a planilha falhar, a aba opera 100% via PostgreSQL e exibe apenas um aviso discreto sobre indisponibilidade do fallback.

### Tratamento de `total_alunos` fracionário

Conforme observado em "Validação online — Fase 2A › Observações", o PG pode devolver decimais em `total_alunos` (ex.: 413934.03). A UI arredonda para inteiro **somente na apresentação** (cards KPI, matrículas por porte, tabela DRE). O dado bruto não é corrigido no front, e o backend não foi tocado — o tratamento definitivo segue como pendência da Frente A.

### Preservações verificadas

- `GET /v1/admin/sheet-metrics`, `GET /v1/admin/indicadores-metrics`, `GET /v1/locations`, `POST /v1/admin/sync-sheets`, `POST /v1/census` e o job de sync continuam inalterados.
- Nenhuma alteração em backend, migrations, endpoints, regras de contagem ou no formulário público.
- Layout, cores e estrutura visual da aba mantidos — apenas a fonte dos dados mudou e foi adicionado o rótulo discreto de fonte.

### Validações executadas

- `npm run build` — sucesso (Next.js 16.1.4, Turbopack, TypeScript OK).
- `npm run lint` — sem novos erros introduzidos. Os 3 erros remanescentes (`offset += len` em `Donut`, `setToken` em `AdminPage`, `require()` em `tailwind.config.js`) e os 4 warnings são pré-existentes e fora do escopo desta task.
- `go build` não foi executado — backend não foi tocado.

## Validação online/local — Fase 2B.1

### Estado do commit

- Commit local da Fase 2B.1: `48887c2` — `feat(web): migrar caracterização da rede para analytics PostgreSQL`.
- Situação em relação ao `origin/main`: **sincronizado**. Após o commit local, o branch `main` foi mergeado com `origin/main` (que havia recebido `e8d11b5` — merge do PR #25 da Frente A, Task 1B.7). O merge resultante `31797b7` é o tip atual de `HEAD -> main`, `origin/main` e `origin/HEAD`. `git status` reporta "Your branch is up to date with 'origin/main'", working tree clean.
- Observações sobre rebase/push: não foi necessário `git pull --rebase` — a integração já está consolidada via merge commit. Nenhum conflito ocorreu. Não há ação pendente de push.

### Validação local

| Comando | Resultado | Observação |
|---|---|---|
| `npm run build` | ✅ sucesso | Next.js 16.1.4 (Turbopack); TypeScript OK; 5 páginas estáticas geradas (`/`, `/_not-found`, `/admin`). |
| `npm run lint` | ⚠️ 3 erros + 5 warnings | Todos pré-existentes. Nenhum erro novo introduzido pela Fase 2B.1. Erros restantes: `page.tsx:138` (`offset += len` em `Donut`, fora do escopo), `page.tsx:1147` (`setToken` síncrono em `AdminPage`, fora do escopo), `tailwind.config.js:76` (`require()` style, arquivo não tocado). |

### Validação da implementação

| Item | Status | Observação |
|---|---|---|
| KPIs usam PostgreSQL | ✅ | `perfilPg.kpis.total_escolas/total_alunos/media_alunos_por_escola/alunos_pcd` (page.tsx l. 497-513). |
| Distribuição por porte usa PostgreSQL | ✅ | `perfilPg.por_porte` (l. 515-521). |
| Distribuição por zona usa PostgreSQL | ✅ | `perfilPg.por_zona` (l. 523-529). |
| Matrículas por porte usam PostgreSQL | ✅ | `perfilPg.matriculas_por_porte` (l. 531-535); `Math.round` apenas na apresentação. |
| Gráfico por DRE usa PostgreSQL | ✅ | `drePg.top_dres.slice(0, 15)` (l. 541-543); slice é apenas visual. |
| Tabela por DRE usa PostgreSQL | ✅ | `drePg.detalhamento` completo (l. 546-553), sem slice. |
| `sheet-metrics` permanece como fallback | ✅ | Carregado em paralelo aos endpoints PG (l. 462-464). Endpoint backend intocado. |
| Fallback parcial preservado | ✅ | Variáveis `usePerfilPg` (l. 491) e `useDrePg` (l. 538) são independentes; falha em um não derruba o outro. Indicador de fonte tem 3 estados (PostgreSQL/parcial/fallback total, l. 565-569). |
| Demais integrações Sheets preservadas | ✅ | `GET /v1/admin/sheet-metrics`, `GET /v1/admin/indicadores-metrics`, `GET /v1/locations`, `POST /v1/admin/sync-sheets`, `POST /v1/census`, `sheetSyncRetryJob` não tocados. Confirmado por `git status` (apenas `web/src/app/admin/page.tsx` e este documento foram modificados). |

### Validação visual online

**Pendente de execução manual.** O ambiente atual não tem acesso a navegador para abrir `https://censo-operacional-escolas.vercel.app/admin` e realizar login autenticado. Sem credenciais — e por opção deliberada, **nenhuma credencial deve ser registrada neste documento ou em qualquer arquivo do repositório**.

Roteiro sugerido para execução manual pelo operador autorizado:

1. Abrir `https://censo-operacional-escolas.vercel.app/admin` no navegador.
2. Fazer login com credenciais administrativas (manualmente, sem registrar em chat ou arquivo).
3. Na aba "Caracterização da Rede", conferir:
   - indicador de fonte mostrando "PostgreSQL · ano corrente · censos concluídos" (chip verde no topo);
   - Total de Escolas ≈ 818;
   - Total de Alunos ≈ 413.934;
   - Média por Escola ≈ 506;
   - Alunos PcD ≈ 15.337;
   - donut "Distribuição de Escolas por Porte" carregando 6 faixas;
   - donut "Distribuição de Escolas por Zona" carregando Urbana/Rural/Ribeirinha;
   - barras "Distribuição de Matrículas por Porte" carregando;
   - barras "Escolas Concluídas por DRE (Top 15)" carregando;
   - tabela "Detalhamento por DRE" carregando todas as DREs (sem corte de 15).
4. Demais abas (`Perfil dos Alunos e Resultados`, `Operacional`, `Todos os Censos`, `Por DRE`) sem regressão visual.
5. DevTools › Network deve mostrar 3 requisições do tipo XHR/fetch ao montar a aba:
   - `/v1/admin/analytics/caracterizacao/perfil` → 200;
   - `/v1/admin/analytics/caracterizacao/dre` → 200;
   - `/v1/admin/sheet-metrics` → 200 (fallback carregado em paralelo, comportamento esperado).
6. Não devem aparecer banners âmbar de "indicadores via PostgreSQL parcialmente indisponíveis" se o PG estiver saudável.

Em caso de discrepância visual ou de qualquer endpoint PG retornar diferente de 200, registrar a evidência aqui (status code, payload reduzido, screenshot da aba) **sem incluir tokens/cookies/sessão**.

### Pendências

- [ ] Investigar valores decimais em `total_alunos` (responsabilidade Frente A — qualidade dos dados; ver "Validação online — Fase 2A › Observações").
- [ ] Resolver erros pré-existentes de lint em task separada (`Donut.offset += len`, `setToken` em `AdminPage`, `require()` em `tailwind.config.js`).
- [x] ~~Concluir integração com `origin/main` antes do push.~~ — Sincronizado em `31797b7`; sem ação pendente.
- [ ] Executar validação visual online assistida segundo o roteiro acima e anexar o resultado a este documento.

### Auditoria pós-validação visual — descoberta de deploy stale

Durante a validação visual em produção foi observado o seguinte padrão na aba "Caracterização da Rede":

- **KPIs corretos via PostgreSQL**: Total de Escolas 818, Total de Alunos ~413.934, Média 506, Alunos PcD 15.337.
- **Donuts/barras/tabela aparentemente em Sheets**: donut por porte e por zona com 1.030 escolas no centro; gráfico por DRE com CASTANHAL 74, SANTARÉM 69; tabela DRE com valores compatíveis com a planilha.

Suspeita inicial: a migração teria sido parcial — KPIs no PG, mas gráficos/tabela ainda em Sheets.

**Auditoria do código no commit `48887c2` (Fase 2B.1) descartou essa hipótese:**

- Em `web/src/app/admin/page.tsx` (linhas 491-560), as variáveis `usePerfilPg` (`perfilPg !== null`) e `useDrePg` (`drePg !== null`) controlam **todos** os blocos derivados do respectivo endpoint:
  - `usePerfilPg` ⇒ KPIs (`totalEscolas`, `totalAlunos`, `mediaAlunos`, `totalAlunosPcd`), `porteDonut`, `zonaDonut`, `matriculasBar`.
  - `useDrePg` ⇒ `dreBar`, `dreTable`.
- O label central dos donuts usa a variável resolvida `totalEscolas.toLocaleString("pt-BR")` (linhas 620 e 631), não `metrics.total_escolas` direto.
- A tabela DRE usa `dreTable` (que vem de `drePg.detalhamento` quando `useDrePg`), não `safePorDre` direto.

**Como o padrão observado é então possível?** Comparando com o código da Fase 1 (commit `25a43c4`), a sintoma bate exatamente:

- Fase 1 já tinha KPIs migrados (via `/analytics/overview`) com `totalEscolas` resolvido para PG.
- Fase 1 ainda usava `metrics.total_escolas` no label central dos donuts (linhas 513 e 524 daquele commit) — **valor da planilha** (1.030).
- Fase 1 ainda usava `safePorPorte`, `safePorZona` e `safePorDre` (todos `metrics.*`) nos segmentos do donut, no bar chart de matrículas, no bar de DRE e na tabela de detalhamento.

Ou seja: **a observação visual é 100% consistente com a versão Fase 1, não com a Fase 2B.1**. Conclusão: a versão deployada em produção (Vercel) no momento da validação visual é a **Fase 1** (`25a43c4` / `bfad540`), e o build da Fase 2B.1 (`48887c2`) ainda não foi servido na URL que o operador inspecionou.

### Causa raiz

Defasagem entre `origin/main` (que já contém `48887c2` desde o merge `31797b7`) e o build servido na Vercel — cache do navegador, CDN ou pipeline de deploy ainda em execução. **Não é bug de código**.

### Ações tomadas

- **Nenhuma alteração de código foi feita.** O código no `main` local e em `origin/main` está correto.
- Documentação atualizada com este diagnóstico para evitar nova confusão.

### Próximos passos recomendados ao operador

1. No navegador, executar hard reload em `https://censo-operacional-escolas.vercel.app/admin` (Ctrl+Shift+R / Cmd+Shift+R).
2. Confirmar no painel da Vercel que o último deploy corresponde ao commit `48887c2` (ou superior) e que seu status é `Ready`.
3. Reabrir a aba "Caracterização da Rede" e revalidar o roteiro da seção "Validação visual online".
4. Em DevTools › Network, confirmar que `/v1/admin/analytics/caracterizacao/perfil` e `/caracterizacao/dre` retornam 200 e que os payloads alimentam donuts/barras/tabela.
5. Se após o hard reload os números ainda divergirem, **abrir nova task** com:
   - print da aba após o reload;
   - status do deploy na Vercel;
   - payload bruto dos 3 endpoints capturado em DevTools.
6. Apenas então será justificado mexer em `web/src/app/admin/page.tsx` novamente.

### Validações executadas nesta auditoria

| Comando | Resultado |
|---|---|
| `git log --oneline web/src/app/admin/page.tsx` | confirma que o último commit no arquivo é `48887c2` (Fase 2B.1) |
| inspeção de `web/src/app/admin/page.tsx` (linhas 432-684) | `usePerfilPg`/`useDrePg` cobrem KPIs, donuts, barras e tabela DRE — sem uso direto de `metrics.*` nos blocos migrados |
| comparação com `git show 25a43c4:web/src/app/admin/page.tsx` | reproduz exatamente o padrão observado em produção (KPIs PG, donut/bar/tabela em Sheets) |
| `cd web && npm run build` | sucesso |
| `cd web && npm run lint` | 3 erros e 5 warnings — todos pré-existentes, nenhum em código tocado pela Fase 2B.1 |

### Revalidação visual após hard reload/cache refresh

Data: 21/05/2026
Ambiente: Vercel + Railway
Página: `/admin` → aba "Caracterização da Rede"
Status: **OK**

| Item | Resultado | Observação |
|---|---|---|
| Indicador de fonte | OK | "PostgreSQL · ano corrente · censos concluídos" (chip verde) |
| KPI — Total de Escolas | OK | 818 |
| KPI — Total de Alunos | OK | 413.934 |
| KPI — Média por Escola | OK | 506 |
| KPI — Alunos PcD | OK | 15.337 |
| Donut por porte | OK | Centro com 818 escolas; segmentos somam 818 |
| Donut por zona | OK | Centro com 818 escolas; segmentos somam 818 |
| Matrículas por porte | OK | Dados PostgreSQL carregados |
| Escolas por DRE (Top 15) | OK | Bar chart com dados PostgreSQL |
| Detalhamento por DRE | OK | Tabela completa com dados PostgreSQL |
| Fallback Sheets | Preservado | `sheet-metrics` segue mantido como fallback paralelo, sem retirar `indicadores-metrics`, `/v1/locations`, `POST /v1/admin/sync-sheets`, `POST /v1/census`, `sheetSyncRetryJob` |

Amostra de valores observados na tabela "Detalhamento por DRE" (Top 5):

| DRE        | Escolas | Total de Alunos | Salas |
|------------|--------:|----------------:|------:|
| CASTANHAL  |      48 |          25.488 |   470 |
| ABAETETUBA |      47 |          27.559 |   900 |
| SANTARÉM   |      43 |          23.518 |   440 |
| CAPANEMA   |      35 |          18.801 | 1.530 |
| BRAGANÇA   |      33 |          15.452 |   278 |

Esses números casam exatamente com a amostra do payload `/v1/admin/analytics/caracterizacao/dre` registrada em "Validação online — Fase 2A › Endpoint `/v1/admin/analytics/caracterizacao/dre`", confirmando que a UI agora consome o endpoint PostgreSQL.

### Veredito

**Fase 2B.1 validada visualmente em produção após hard reload/cache refresh.**

A observação visual anterior (donut com 1.030, CASTANHAL com 74) foi confirmada como artefato de cache/deploy stale — a Vercel ainda servia a build da Fase 1 (`25a43c4` / `bfad540`) no momento da primeira inspeção. Após o hard reload, o build da Fase 2B.1 (`48887c2`) passou a ser servido e a aba "Caracterização da Rede" exibiu corretamente os dados PostgreSQL em todos os blocos (KPIs, donuts, barras e tabela). `sheet-metrics` permanece como fallback ativo e nenhuma integração com Google Sheets foi removida.

Pendências mantidas (não bloqueiam o veredito):

- investigar valores decimais em `total_alunos` (responsabilidade Frente A — qualidade dos dados);
- resolver erros pré-existentes de lint em task própria (`Donut.offset += len`, `setToken` em `AdminPage`, `require()` em `tailwind.config.js`);
- manter Google Sheets ativo até a fase futura de aposentadoria controlada (Fase 7 do roadmap), após paridade numérica documentada e sign-off explícito.

## Pendências

- [x] ~~Rodar `go build ./cmd/api/...` em ambiente com Go instalado e anexar saída.~~ — Implicitamente validado pelo deploy bem-sucedido no Railway (binário compilado, iniciado e respondendo).
- [x] ~~Aplicar as migrations 0001+0002 em homologação e validar que ambas são idempotentes (rerun deve ser no-op).~~ — Aplicadas com sucesso no startup do Railway (logs em "Validação online — Fase 2A › Migrations"). Idempotência garantida pelo `CREATE OR REPLACE VIEW`; rerun nas reinicializações do container confirma o comportamento.
- [ ] Coletar os números reais contra `sheet-metrics` e preencher a tabela "Métricas comparadas". (Os números do PostgreSQL já estão fixados em "Validação online".)
- [ ] Confirmar com a Frente A se os critérios de contagem usados aqui são os definitivos antes da Fase 2B.
- [ ] Se a Frente A introduzir um recorte distinto de "ano corrente" (por exemplo, ano mais recente com ao menos N respostas), realinhar `WHERE year = ...` nos handlers.
- [ ] Investigar com a Frente A a origem dos valores decimais em `total_alunos` (campo conceitualmente inteiro recebendo `xxxx.yyy`).
