# Frente 1 — Backend Pessoal/Gestão Escolar + Tecnologia

> **Status:** ⏳ **Pendente — próxima frente backend a executar.**
>
> As Frentes 2 (backend Infra/Merenda/Serviços) e 3 (frontend + qualidade) já foram mergeadas em `develop`. O microfix preventivo de `total_alunos` e o placeholder institucional de "Gestão Financeira e Governança" também já estão integrados. Esta frente continua sendo o próximo bloco de backend a entregar, e o documento abaixo permanece como o guia operacional vigente.
>
> Restrições atuais (continuam valendo):
> - **Não tocar `web/`** — os placeholders já existem; a integração visual desta frente é feita em PRs posteriores, fora desta rodada.
> - **Não tocar nas migrations `0007_*` a `0012_*`** (já integradas pela Frente 2) nem em `vw_censo_base`/`vw_censo_enriquecida`.
> - **Não tocar nos handlers da Frente 2** (`api/cmd/api/analytics_infra_merenda_servicos.go`) nem em `api/cmd/api/analytics.go`.
> - **Não alterar endpoints Sheets** (`sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`).
> - **Não alterar a aba "Caracterização da Rede"** nem placeholders já criados pela Frente 3.

**Branch:** `feat/analytics-pessoal-tecnologia` (parte de `develop`).
**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md) — seção "Fase 6"
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) — **leitura obrigatória** antes de escrever SQL
- [jsonb-field-inventory.md](jsonb-field-inventory.md) — fonte dos nomes de campos JSONB
- [guia_views_analiticas_baseado_repositorio_censo.md](../guia_views_analiticas_baseado_repositorio_censo.md) — seções 13, 14, 15 (pessoal/gestão) e 19 (tecnologia)

## 1. Objetivo

Entregar a camada PostgreSQL (views + endpoints) que alimentará duas abas novas no `/admin`:

- **Pessoal e Gestão Escolar**
- **Tecnologia e Equipamentos**

**Sem migrar a UI.** A migração visual (plugar nos placeholders criados pela Frente 3) é feita em PRs posteriores, fora desta rodada.

## 2. Escopo

### Pode alterar

- `infra/migrations/0003_vw_censo_direcao_escolar.sql`
- `infra/migrations/0004_vw_censo_coordenacao_area.sql`
- `infra/migrations/0005_vw_censo_quadro_pessoal.sql`
- `infra/migrations/0006_vw_censo_equipamentos_tecnologia.sql`
- Espelhos em `api/cmd/api/migrations/0003_*.sql` a `0006_*.sql` (para `go:embed`).
- `api/cmd/api/analytics_pessoal_tecnologia.go` *(novo arquivo)*.
- `api/cmd/api/main.go` — apenas adicionar linhas no grupo `protected` para registrar as rotas.
- `infra/init.sql` — replicar `CREATE OR REPLACE VIEW` das 4 views.
- `docs/dashboard/validacao-fase-pessoal-tecnologia.md` *(novo)*.

### Não pode alterar

- `web/` (qualquer arquivo).
- `infra/migrations/0001_*` e `0002_*` (fundação das Fases 1 e 2A em produção).
- `infra/migrations/0007_*` a `0012_*` (Frente 2).
- `api/cmd/api/analytics.go` (handlers da Fase 1 e 2A — mantidos).
- `api/cmd/api/analytics_infra_merenda_servicos.go` (Frente 2).
- `api/cmd/api/admin.go`, `handlers.go`, `services/sheets.go`, `services/drive.go`.
- `POST /v1/census`, fluxo do formulário, schemas Zod do submit.
- `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`, `POST /v1/admin/sync-sheets`.
- `vw_censo_base`, `vw_censo_enriquecida`.

## 3. Views

Todas idempotentes (`CREATE OR REPLACE VIEW`). Granularidade: uma linha por `(school_id, year)`, salvo quando explícito. Derivam de `vw_censo_base` (não tocar a base).

Casts seguros — padrão da Fase 1:
```sql
CASE WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$'
     THEN (data->>'campo')::numeric END AS campo
```

Para categóricos: `NULLIF(data->>'campo', '')`.

Cada view deve documentar no cabeçalho: finalidade, fonte, granularidade, tratamento de NULL.

### 3.1 `vw_censo_direcao_escolar` (`0003_*`)

Campos sugeridos (confirmar contra [jsonb-field-inventory.md](jsonb-field-inventory.md)):

- `possui_direcao`, `possui_vice_pedagogico`, `possui_vice_administrativo`, `possui_secretario`
- `possui_coord_pedagogico`, `qtd_coord_pedagogico`

Granularidade: uma linha por escola/ano.

### 3.2 `vw_censo_coordenacao_area` (`0004_*`)

Campos por área:
- `possui_coord_area_matematica`, `possui_coord_area_linguagem`, `possui_coord_area_humanas`, `possui_coord_area_natureza`

Sugestão de layout: pode ser wide (uma linha por escola com 4 colunas booleanas) OU long (uma linha por escola/área, com colunas `area` e `possui_coordenador`). Decidir e documentar no header — o layout long facilita o endpoint `por_area`.

### 3.3 `vw_censo_quadro_pessoal` (`0005_*`)

Campos numéricos sugeridos:
- `qtd_professores_efetivos`, `qtd_professores_temporarios`, `qtd_servidores_administrativos`, `qtd_professor_readaptado`

Granularidade: uma linha por escola/ano. Considerar coluna calculada `total_professores = efetivos + temporarios`.

### 3.4 `vw_censo_equipamentos_tecnologia` (`0006_*`)

Campos sugeridos:
- `internet_disponivel`, `provedor_internet`, `qualidade_internet`
- `qtd_desktop_adm`, `qtd_desktop_alunos`, `qtd_notebooks`, `qtd_chromebooks`
- `computadores_atendem`, `qtd_computadores_inoperantes`
- `possui_projetor`, `qtd_projetores`
- `possui_lousa_digital`

Granularidade: uma linha por escola/ano.

## 4. Endpoints

Em `api/cmd/api/analytics_pessoal_tecnologia.go`. Todos sob `requireAdminAuth`. SQL parametrizado. Critérios de contagem da Fase 1B (status='completed', ano corrente, `COUNT(DISTINCT school_id)`).

Filtros por query string: `?year=&dre=&municipio=&zona=&porte_escola=`.

### 4.1 Pessoal e Gestão Escolar

```
GET /v1/admin/analytics/pessoal-gestao/estrutura
GET /v1/admin/analytics/pessoal-gestao/coordenacao
GET /v1/admin/analytics/pessoal-gestao/quadro-pessoal
```

Payloads sugeridos:
- `/estrutura` — % de escolas com direção, vice-pedagógico, vice-administrativo, secretário, coordenador pedagógico; total de coord. pedagógicos somados.
- `/coordenacao` — % de escolas com coordenador por área (matemática, linguagem, humanas, natureza); cobertura média (escolas com 4 áreas / escolas com 0 áreas).
- `/quadro-pessoal` — total de professores efetivos, temporários, administrativos, readaptados; média por escola; distribuição por DRE (top 10).

### 4.2 Tecnologia e Equipamentos

```
GET /v1/admin/analytics/tecnologia/infraestrutura
GET /v1/admin/analytics/tecnologia/uso-pedagogico
```

Payloads sugeridos:
- `/infraestrutura` — % de escolas com internet, distribuição por provedor, % com qualidade `Boa/Regular/Ruim`, total de desktops/notebooks/chromebooks; % de computadores inoperantes.
- `/uso-pedagogico` — % com projetor, total de projetores, % com lousa digital.

### 4.3 Registro de rotas

Em `api/cmd/api/main.go`, dentro do grupo `protected`, **logo abaixo** das rotas existentes `/admin/analytics/caracterizacao/*` e **antes** do bloco da Frente 2 (que registrará `/infraestrutura/*`, `/merenda/*`, `/servicos-terceirizados/*`):

```go
protected.Get("/admin/analytics/pessoal-gestao/estrutura", app.AdminAnalyticsPessoalEstrutura)
protected.Get("/admin/analytics/pessoal-gestao/coordenacao", app.AdminAnalyticsPessoalCoordenacao)
protected.Get("/admin/analytics/pessoal-gestao/quadro-pessoal", app.AdminAnalyticsPessoalQuadro)
protected.Get("/admin/analytics/tecnologia/infraestrutura", app.AdminAnalyticsTecnologiaInfra)
protected.Get("/admin/analytics/tecnologia/uso-pedagogico", app.AdminAnalyticsTecnologiaUso)
```

Manter os blocos contíguos no diff facilita o rebase contra a Frente 2.

## 5. Validação

Criar `docs/dashboard/validacao-fase-pessoal-tecnologia.md` com:

- payload de exemplo de cada endpoint (capturado em homologação);
- inspeção manual em 3 escolas amostradas — confirmar que campos da view batem com o JSONB de `census_responses.data`;
- SQL de sanity-check (cardinalidade das views, contagem por DRE, totais consistentes com `/v1/admin/analytics/overview`);
- preservação confirmada de `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`.

## 6. Sanity local

```bash
cd api
go build ./cmd/api/...
go run ./cmd/api/main.go    # observar applyMigrations encontrando 0003..0006

# Smoke test
TOKEN="<jwt admin>"
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/v1/admin/analytics/pessoal-gestao/estrutura
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/v1/admin/analytics/pessoal-gestao/coordenacao
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/v1/admin/analytics/pessoal-gestao/quadro-pessoal
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/v1/admin/analytics/tecnologia/infraestrutura
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/v1/admin/analytics/tecnologia/uso-pedagogico

# Sem token deve retornar 401
curl http://localhost:8000/v1/admin/analytics/pessoal-gestao/estrutura
```

## 7. Critérios de aceite

- [ ] Migrations `0003_` a `0006_` criadas, idempotentes, espelhadas em `api/cmd/api/migrations/` e replicadas em `infra/init.sql`.
- [ ] 5 endpoints respondem 200 sob `requireAdminAuth`. Sem token → 401.
- [ ] SQL parametrizado em todos os pontos.
- [ ] Critérios de contagem da Fase 1B aplicados.
- [ ] Cabeçalho de cada view documenta finalidade, fonte, granularidade, tratamento de NULL.
- [ ] `docs/dashboard/validacao-fase-pessoal-tecnologia.md` com payloads + inspeção manual em 3 escolas.
- [ ] `go build ./cmd/api/...` OK.
- [ ] **UI inalterada.** Não tocar `web/`.
- [ ] **Sheets inalterado.**

## 8. PRs sugeridos

1. **PR 1** — `0003_vw_censo_direcao_escolar.sql` + `0004_vw_censo_coordenacao_area.sql`.
2. **PR 2** — `0005_vw_censo_quadro_pessoal.sql`.
3. **PR 3** — `0006_vw_censo_equipamentos_tecnologia.sql`.
4. **PR 4** — handlers Pessoal/Gestão + registro de rotas.
5. **PR 5** — handlers Tecnologia + registro de rotas.
6. **PR 6** — `validacao-fase-pessoal-tecnologia.md`.

Cada PR ≤ 400 linhas líquidas, reversível.

## 9. Riscos conhecidos

- Campos booleanos podem chegar como `"sim"/"nao"`, `"true"/"false"`, `true/false`, `null` ou string vazia. Padronizar via `CASE WHEN lower(data->>'campo') IN ('sim', 'true', 't', '1') THEN TRUE ... END AS campo`. Documentar no header da view.
- `qualidade_internet` provavelmente categórica (`"Boa"`, `"Regular"`, `"Ruim"`, `"Sem internet"`) — confirmar enum no inventário JSONB e usar `NULLIF + COALESCE`.
- Conflito com Frente 2 só em `api/cmd/api/main.go` (registro de rotas). Resolver com rebase simples.

## 10. Fora de escopo

- Migração visual (plugar endpoints nos placeholders da Frente 3) — PR posterior, fora desta rodada.
- Aba "Perfil dos Alunos e Resultados" — fora de escopo total nesta rodada (será remodelada para outra planilha).
- Aba "Gestão Financeira e Governança" — fora de escopo total nesta rodada (idem).
- Aposentadoria de `sheet-metrics`/`indicadores-metrics` — Fase 7 do roadmap, futura.
- Indicadores/flags derivados consolidados (`vw_censo_indicadores_escola`) — Fase 5 do roadmap, futura.
