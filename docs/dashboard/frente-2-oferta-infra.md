# Frente 2 — Backend Oferta e Infraestrutura Educacional (Fase 4)

**Branch:** `feat/analytics-oferta-infra` (parte de `develop`).
**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md) — seção "Fase 4"
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md) — seção "Fase 4"
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) — **leitura obrigatória**
- [jsonb-field-inventory.md](jsonb-field-inventory.md) — fonte dos nomes de campos JSONB
- [guia_views_analiticas_baseado_repositorio_censo.md](../guia_views_analiticas_baseado_repositorio_censo.md) — seções sobre turnos/etapas/modalidades/ambientes

## 1. Objetivo

Entregar **views normalizadas** (uma linha por escola × item) para os campos multivalorados que hoje vivem como array serializado em `schools` ou como lista no JSONB, e expor 2 endpoints analíticos consumindo essas views. **Sem migrar a UI.** Migração visual fica para a Fase 4-UI, em PR separado, sobre os componentes da Frente 3.

## 2. Escopo

### Pode alterar

- `infra/migrations/0004_vw_censo_turnos.sql`
- `infra/migrations/0005_vw_censo_etapas.sql`
- `infra/migrations/0006_vw_censo_modalidades.sql`
- `infra/migrations/0007_vw_censo_ambientes.sql`
- Espelhos em `api/cmd/api/migrations/0004_*.sql` … `0007_*.sql` (para `go:embed`).
- `api/cmd/api/analytics_oferta.go` *(novo arquivo)*.
- `api/cmd/api/main.go` — apenas registrar 2 rotas no grupo `protected`.
- Eventualmente uma função utilitária SQL `parse_lista_serializada(text) RETURNS text[]` em migration própria, se a Fase 0 indicar necessidade — documentar no PR.
- `docs/dashboard/validacao-fase-4.md` *(novo)*.
- `infra/init.sql` — replicar `CREATE OR REPLACE VIEW` das 4 views.

### Não pode alterar

- `web/` (qualquer arquivo).
- `infra/migrations/0001_*`, `0002_*`, `0003_*` (`0003_` é da Frente 1).
- `api/cmd/api/analytics.go` (Fases 1 e 2A — mantido).
- `api/cmd/api/analytics_alunos.go` (Frente 1).
- `api/cmd/api/admin.go`, `handlers.go`, `services/sheets.go`, `services/drive.go`.
- `POST /v1/census`, fluxo do formulário.
- `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`, `POST /v1/admin/sync-sheets`.
- `vw_censo_base` e `vw_censo_enriquecida` (já em produção).

## 3. Tarefas

### 3.1 Saneamento das listas em `schools`

`schools.turnos`, `schools.etapas_ofertadas`, `schools.modalidades_ofertadas` são `TEXT` com array serializado em JSON. Antes de codar as views:

```sql
SELECT DISTINCT turnos FROM schools LIMIT 20;
SELECT DISTINCT etapas_ofertadas FROM schools LIMIT 20;
SELECT DISTINCT modalidades_ofertadas FROM schools LIMIT 20;
```

Decidir e documentar no header da view:
- Se for **JSON válido**: usar `jsonb_array_elements_text(turnos::jsonb)`.
- Se for **CSV**: usar `regexp_split_to_table(turnos, ',\s*')`.
- Se for **misto**: criar função `parse_lista_serializada(text) RETURNS text[]` em migration própria (sugestão `0004_fn_parse_lista_serializada.sql`, renumerando as demais).

Já há precedente para o tratamento via `NULLIF + cast seguro` na Fase 1.

### 3.2 Views

Granularidade: **uma linha por `(school_id, year, item)`**. Todas derivam de `vw_censo_base` + `schools`. Cabeçalho SQL deve documentar: finalidade, fonte, granularidade, tratamento de NULLs.

#### `vw_censo_turnos` (`0004_*`)

Fonte preferencial: `schools.turnos` (canônico das matrículas declaradas). Cruzar com `turmas_manha`/`turmas_tarde`/`turmas_noite`/`turmas_integral` de `vw_censo_base` se a UI precisar de quantitativos por turno.

#### `vw_censo_etapas` (`0005_*`)

Fonte: `schools.etapas_ofertadas`. Uma linha por `(school_id, year, etapa)`.

#### `vw_censo_modalidades` (`0006_*`)

Fonte: `schools.modalidades_ofertadas`. Uma linha por `(school_id, year, modalidade)`.

#### `vw_censo_ambientes` (`0007_*`)

Fonte: `census_responses.data->'ambientes'` (array no JSONB). Uma linha por `(school_id, year, ambiente)`. Confirmar o nome exato da chave em [jsonb-field-inventory.md](jsonb-field-inventory.md).

Idempotência: `CREATE OR REPLACE VIEW`. O loader em `applyMigrations` aplica em ordem alfabética.

### 3.3 Endpoints

Em `api/cmd/api/analytics_oferta.go`:

```go
// GET /v1/admin/analytics/caracterizacao/oferta-funcionamento
type OfertaFuncionamento struct {
    PorTurno      []ItemCount `json:"por_turno"`
    PorEtapa      []ItemCount `json:"por_etapa"`
    PorModalidade []ItemCount `json:"por_modalidade"`
}

// GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional
type InfraEducacional struct {
    PorAmbiente   []ItemCount `json:"por_ambiente"`
    TopAmbientes  []ItemCount `json:"top_ambientes"`   // top 10 por contagem de escolas
}
```

Recortes herdados das Fases 1, 1B e 2A:
- `status = 'completed'`;
- `year = EXTRACT(YEAR FROM CURRENT_DATE)::int`;
- `COUNT(DISTINCT school_id)` por item;
- sem deduplicação automática.

Filtros via query string: `?year=&dre=&municipio=&zona=&porte_escola=`. SQL **parametrizado** (`$1`, `$2`, ...).

Em `api/cmd/api/main.go`, dentro do grupo `protected`:
```go
protected.Get("/admin/analytics/caracterizacao/oferta-funcionamento", app.AdminAnalyticsOfertaFuncionamento)
protected.Get("/admin/analytics/caracterizacao/infraestrutura-educacional", app.AdminAnalyticsInfraEducacional)
```

Posicionar **logo abaixo** das rotas existentes `/admin/analytics/caracterizacao/{perfil,dre}` para manter coesão e reduzir conflito de rebase com a Frente 1.

### 3.4 Validação

Criar `docs/dashboard/validacao-fase-4.md` com:

- payload de cada endpoint;
- top 5 turnos / etapas / modalidades / ambientes;
- **inspeção manual em 3 escolas amostradas** — para cada escola, confirmar que os itens listados na view batem com `schools.turnos / etapas_ofertadas / modalidades_ofertadas` e com `data->'ambientes'`;
- SQL de sanity-check (cardinalidade total de cada view, total de escolas distintas, total de linhas);
- preservação confirmada de Sheets + endpoints retirados de escopo.

### 3.5 Sanity local

```bash
cd api
go build ./cmd/api/...
go run ./cmd/api/main.go    # observar applyMigrations encontrando 0004..0007

curl -H "Authorization: Bearer <token>" \
     http://localhost:8000/v1/admin/analytics/caracterizacao/oferta-funcionamento

curl -H "Authorization: Bearer <token>" \
     http://localhost:8000/v1/admin/analytics/caracterizacao/infraestrutura-educacional
```

## 4. Critérios de aceite

- [ ] Migrations `0004_`, `0005_`, `0006_`, `0007_` criadas, idempotentes, espelhadas em `api/cmd/api/migrations/` e replicadas em `infra/init.sql`.
- [ ] Endpoints `/v1/admin/analytics/caracterizacao/oferta-funcionamento` e `.../infraestrutura-educacional` respondem 200 sob `requireAdminAuth`. Sem token → 401.
- [ ] SQL parametrizado.
- [ ] Critérios de contagem do documento de critérios aplicados.
- [ ] Cabeçalho de cada view documenta finalidade, fonte, granularidade e tratamento de NULL/listas.
- [ ] `docs/dashboard/validacao-fase-4.md` com top 5 + inspeção manual em 3 escolas.
- [ ] `go build ./cmd/api/...` OK.
- [ ] **UI inalterada.** Não tocar `web/`.
- [ ] **Sheets inalterado.**

## 5. PRs sugeridos

1. **PR 1** — saneamento (eventual `parse_lista_serializada`) + `0004_vw_censo_turnos.sql`.
2. **PR 2** — `0005_vw_censo_etapas.sql` + `0006_vw_censo_modalidades.sql`.
3. **PR 3** — `0007_vw_censo_ambientes.sql`.
4. **PR 4** — handlers Go + registro de rotas.
5. **PR 5** — `validacao-fase-4.md`.

Cada PR ≤ 400 linhas líquidas, reversível.

## 6. Riscos conhecidos

- Inconsistência no formato das colunas `TEXT` em `schools` (JSON vs CSV vs misto). Mitigação: amostragem antes de coding (3.1) + função utilitária se necessário.
- `data->'ambientes'` pode ser array de strings simples ou array de objetos (`[{nome: ...}]`). Confirmar no inventário antes de codar `0007_`.
- Volume: cada view multiplica linhas (uma escola × N turnos). Em 800 escolas, é tranquilo, mas considerar índice se a Fase 6 começar a fazer cruzamento pesado.
- Frente 2 e Frente 1 colidem **apenas** em `api/cmd/api/main.go` (registro de rotas) — resolver com rebase simples; blocos separados no diff.

## 7. Fora de escopo

- Migração visual (nova seção "Oferta e Funcionamento" + "Infra Educacional" em `/admin`) — Fase 4-UI, em cima dos componentes da Frente 3.
- Endpoints de pessoal, merenda, tecnologia, serviços terceirizados — Fase 6.
- Aposentadoria de `sheet-metrics` — Fase 7.
