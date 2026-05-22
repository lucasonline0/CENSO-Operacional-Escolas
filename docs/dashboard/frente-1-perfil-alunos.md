# Frente 1 — Backend Perfil dos Alunos (Fase 3)

**Branch:** `feat/analytics-perfil-alunos` (parte de `develop`).
**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md) — seção "Fase 3"
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md) — seção "Fase 3"
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) — **leitura obrigatória** antes de escrever SQL
- [jsonb-field-inventory.md](jsonb-field-inventory.md) — fonte dos nomes de campos JSONB

## 1. Objetivo

Entregar a camada PostgreSQL que substituirá `/v1/admin/indicadores-metrics` na aba "Perfil dos Alunos e Resultados" do `/admin`. **Sem migrar a UI.** A migração visual é uma fase posterior (Fase 3-UI) e será feita em PR separado, em cima dos componentes que a Frente 3 vai entregar.

## 2. Escopo

### Pode alterar

- `infra/migrations/0003_vw_censo_indicadores_escola.sql` — versão mínima.
- `api/cmd/api/migrations/0003_vw_censo_indicadores_escola.sql` — espelho para `go:embed`.
- `api/cmd/api/analytics_alunos.go` *(novo arquivo)*.
- `api/cmd/api/main.go` — apenas adicionar uma linha no grupo `protected` para registrar a rota.
- `docs/dashboard/validacao-fase-3.md` *(novo)*.

### Não pode alterar

- `web/` (qualquer arquivo).
- `infra/migrations/0001_*` ou `0002_*` (são fundação das Fases 1 e 2A já em produção).
- `api/cmd/api/analytics.go` (handlers da Fase 1 e 2A — mantidos como estão).
- `api/cmd/api/analytics_oferta.go` (escopo da Frente 2).
- `api/cmd/api/admin.go`, `handlers.go`, `services/sheets.go`, `services/drive.go`.
- `POST /v1/census`, fluxo do formulário, schemas Zod do submit.
- `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`, `POST /v1/admin/sync-sheets`.

## 3. Tarefas

### 3.1 Migration `0003_vw_censo_indicadores_escola.sql`

View **mínima** (versão Fase 3). A versão completa fica para a Fase 5.

Campos derivados desta versão:
- `faixa_beneficiarios` — categorização de `total_beneficiarios` (faixas a definir; sugestão inicial: `0`, `1–50`, `51–150`, `151–300`, `300+`).
- `faixa_abandono` — categorização de `taxa_abandono` (sugestão: `0%`, `0,1–2%`, `2,1–5%`, `5,1–10%`, `>10%`).
- `flag_risco_fluxo` — booleano calculado em SQL. Regra inicial sugerida: `taxa_abandono > 5%` OR `taxa_reprovacao_fund1 > 15%` OR `taxa_reprovacao_fund2 > 15%` OR `taxa_reprovacao_medio > 15%`. **Documentar a regra exata no header da view** (comentário SQL `-- flag_risco_fluxo: ...`).

Granularidade: uma linha por `(school_id, year)`. Deriva de `vw_censo_base` (não tocar a view base).

Casts seguros — padrão da Fase 1:
```sql
CASE WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$'
     THEN (data->>'campo')::numeric END AS campo
```

Idempotência: `CREATE OR REPLACE VIEW`.

Replicar o `CREATE OR REPLACE VIEW` no final de `infra/init.sql` para ambientes novos. O loader em `applyMigrations` (em `api/cmd/api/main.go`) aplica `infra/migrations/*.sql` no startup, em ordem alfabética — `0003_` rodará depois de `0002_`.

### 3.2 Endpoint `GET /v1/admin/analytics/alunos/permanencia`

Em `api/cmd/api/analytics_alunos.go`:

```go
type AlunosPermanencia struct {
    EscolasPorFaixaBeneficiarios []FaixaCount `json:"escolas_por_faixa_beneficiarios"`
    EscolasPorFaixaAbandono      []FaixaCount `json:"escolas_por_faixa_abandono"`
    TopDresAbandono              []DreAbandono `json:"top_dres_abandono"`
    EscolasRiscoFluxo            int           `json:"escolas_risco_fluxo"`
}
```

Handler `AdminAnalyticsAlunosPermanencia(w, r)` consulta `vw_censo_indicadores_escola` com:
- `WHERE status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int`
- `COUNT(DISTINCT school_id)` (mesmo critério da Fase 1 e 2A — ver Fase 1B).
- SQL parametrizado para qualquer filtro `?year=&dre=&zona=&porte_escola=`.

Em `api/cmd/api/main.go`, dentro do grupo `protected`:
```go
protected.Get("/admin/analytics/alunos/permanencia", app.AdminAnalyticsAlunosPermanencia)
```

Posicionar o registro **abaixo** das rotas `/admin/analytics/caracterizacao/*` para manter o diff coeso e reduzir conflito com a Frente 2.

### 3.3 Validação

Criar `docs/dashboard/validacao-fase-3.md` com:

- payload de exemplo de cada endpoint;
- tabela de paridade contra `/v1/admin/indicadores-metrics` (margem aceita ≤ 2% — `Indicadores_Flags` usa arredondamentos próprios);
- SQL de sanity-check (escolas por faixa, total de escolas em risco, top DRE por abandono médio);
- preservação confirmada de `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`.

### 3.4 Sanity local

```bash
# Backend
cd api
go build ./cmd/api/...
go run ./cmd/api/main.go   # observar logs do applyMigrations

# Smoke test
curl -H "Authorization: Bearer <token>" \
     http://localhost:8000/v1/admin/analytics/alunos/permanencia
# → 200, payload com 4 chaves
```

## 4. Critérios de aceite

- [ ] Migration `0003_vw_censo_indicadores_escola.sql` criada e idempotente.
- [ ] Espelho em `api/cmd/api/migrations/0003_vw_censo_indicadores_escola.sql` para `go:embed`.
- [ ] Replicação em `infra/init.sql`.
- [ ] Endpoint `/v1/admin/analytics/alunos/permanencia` responde 200 sob `requireAdminAuth`. Sem token → 401.
- [ ] SQL parametrizado em todos os pontos. Sem interpolação de string.
- [ ] Critérios de contagem do documento de critérios (status=completed + ano corrente + COUNT DISTINCT) aplicados.
- [ ] `flag_risco_fluxo` com regra documentada no comentário do SQL.
- [ ] `docs/dashboard/validacao-fase-3.md` com payload + tabela de paridade.
- [ ] `go build ./cmd/api/...` OK.
- [ ] **UI inalterada.** Não tocar `web/`.
- [ ] **Sheets inalterado.** `sheet-metrics`, `indicadores-metrics`, `/v1/locations` continuam respondendo.

## 5. PRs sugeridos

1. **PR 1** — migration + view + smoke test SQL (sem endpoint).
2. **PR 2** — handler Go + registro de rota + validação inicial.
3. **PR 3** — `validacao-fase-3.md` preenchido com paridade contra `indicadores-metrics`.

Cada PR ≤ 400 linhas líquidas, reversível.

## 6. Riscos conhecidos

- `taxa_abandono` e `taxa_reprovacao_*` podem chegar como string com vírgula (`"3,5"`) — o cast regex `^-?[0-9]+(\.[0-9]+)?$` **rejeita** vírgula. Decidir: (a) tolerar `NULL` para valores com vírgula, (b) tratar com `REPLACE(... , ',', '.')` no cast. **Documentar a decisão no header da view.**
- `total_beneficiarios` pode estar em chave diferente do esperado — confirmar contra [jsonb-field-inventory.md](jsonb-field-inventory.md) antes de codar o cast.
- `indicadores-metrics` aplica arredondamento próprio (Sheets). Esperar margem ≤ 2% e documentar onde a divergência aparece.

## 7. Fora de escopo (entregar como pendência, não fazer aqui)

- Migração visual da aba "Perfil dos Alunos" (Fase 3-UI). Depende da Frente 3 entregar os componentes.
- Indicadores derivados completos (faixa de matrícula, todas as flags da seção 22 do guia) — Fase 5.
- Aposentadoria do `indicadores-metrics` — Fase 7.
