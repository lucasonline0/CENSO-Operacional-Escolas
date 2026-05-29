# Frente 2 — Backend Infraestrutura/Segurança + Merenda + Serviços Terceirizados

> **Status:** ✅ **Concluída e integrada à `develop`.**
>
> Entregas mergeadas:
> - Migrations `0007_vw_censo_ambientes.sql` a `0012_vw_censo_servicos_terceirizados.sql` (com espelhos em `api/cmd/api/migrations/` e replicação em `infra/init.sql`).
> - Handlers em `api/cmd/api/analytics_infra_merenda_servicos.go` (novo).
> - Registro de rotas em `api/cmd/api/main.go`.
> - Validação em [validacao-fase-infra-merenda-servicos.md](validacao-fase-infra-merenda-servicos.md).
>
> Endpoints ativos sob `requireAdminAuth`:
>
> ```
> GET /v1/admin/analytics/infraestrutura/condicoes
> GET /v1/admin/analytics/infraestrutura/seguranca
> GET /v1/admin/analytics/merenda/oferta
> GET /v1/admin/analytics/merenda/equipamentos
> GET /v1/admin/analytics/merenda/recursos-humanos
> GET /v1/admin/analytics/servicos-terceirizados/visao-geral
> GET /v1/admin/analytics/servicos-terceirizados/servicos-gerais
> GET /v1/admin/analytics/servicos-terceirizados/portaria
> ```
>
> **Integração visual de primeira versão também já concluída** — `AbaInfraestruturaSeguranca.tsx`, `AbaMerenda.tsx` e `AbaServicosTerceirizados.tsx` em `web/src/components/admin/` consomem os endpoints acima. Os antigos placeholders foram substituídos pelos componentes integrados (UI-FT2-01/02/03 não são mais ações pendentes).
>
> **Próximas ações estão na matriz oficial** — ver [matriz-abas-e-graficos.md](matriz-abas-e-graficos.md) §5.4, §5.5 e §5.6 para a lista de blocos, gráficos mínimos e lacunas (incl. bloco "Governança / Supervisão" em Serviços Terceirizados, ainda sem endpoint dedicado). Não introduzir gráficos novos antes da validação da matriz com as áreas finalísticas.
>
> Restrições permanentes para qualquer PR futuro sobre esta área:
> - Sem alterar backend, migrations ou endpoints já validados sem decisão de produto explícita.
> - Sem alterar "Caracterização da Rede", "Perfil dos Alunos" ou "Gestão Financeira e Governança".
> - Sem remover placeholders de outras abas.
> - Sem dado fake.
>
> O conteúdo abaixo permanece como **registro histórico** da frente concluída (escopo, decisões, riscos).

**Branch:** `feat/analytics-infra-merenda-servicos` (parte de `develop`).
**Documentos companheiros:**
- [plano-trabalho-paralelo.md](plano-trabalho-paralelo.md)
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md) — seção "Fase 6"
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
- [criterios-contagem-e-qualidade-dados.md](criterios-contagem-e-qualidade-dados.md) — **leitura obrigatória**
- [jsonb-field-inventory.md](jsonb-field-inventory.md) — fonte dos nomes de campos JSONB
- [guia_views_analiticas_baseado_repositorio_censo.md](../guia_views_analiticas_baseado_repositorio_censo.md) — seções 11 (ambientes), 16/17 (merenda), 18 (serviços), 21 (infraestrutura/segurança)

## 1. Objetivo

Entregar a camada PostgreSQL (views + endpoints) que alimentará três abas novas no `/admin`:

- **Infraestrutura e Segurança**
- **Merenda Escolar**
- **Serviços Terceirizados**

**Sem migrar a UI.** A migração visual (plugar nos placeholders criados pela Frente 3) é feita em PRs posteriores, fora desta rodada.

## 2. Escopo

### Pode alterar

- `infra/migrations/0007_vw_censo_ambientes.sql`
- `infra/migrations/0008_vw_censo_infraestrutura_seguranca.sql`
- `infra/migrations/0009_vw_censo_equipamentos_merenda.sql`
- `infra/migrations/0010_vw_censo_rh_merendeiras.sql`
- `infra/migrations/0011_vw_censo_rh_servicos_gerais.sql`
- `infra/migrations/0012_vw_censo_servicos_terceirizados.sql`
- Espelhos em `api/cmd/api/migrations/0007_*.sql` a `0012_*.sql` (para `go:embed`).
- `api/cmd/api/analytics_infra_merenda_servicos.go` *(novo arquivo)*.
- `api/cmd/api/main.go` — apenas adicionar linhas no grupo `protected` para registrar as rotas.
- `infra/init.sql` — replicar `CREATE OR REPLACE VIEW` das views.
- `docs/dashboard/validacao-fase-infra-merenda-servicos.md` *(novo)*.

### Não pode alterar

- `web/` (qualquer arquivo).
- `infra/migrations/0001_*` e `0002_*` (fundação das Fases 1 e 2A).
- `infra/migrations/0003_*` a `0006_*` (Frente 1).
- `api/cmd/api/analytics.go` (Fases 1 e 2A).
- `api/cmd/api/analytics_pessoal_tecnologia.go` (Frente 1).
- `api/cmd/api/admin.go`, `handlers.go`, `services/sheets.go`, `services/drive.go`.
- `POST /v1/census`, fluxo do formulário.
- `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob`, `POST /v1/admin/sync-sheets`.
- `vw_censo_base`, `vw_censo_enriquecida`.

## 3. Views

Todas idempotentes (`CREATE OR REPLACE VIEW`). Derivam de `vw_censo_base` (e `schools` quando necessário). Cabeçalho documenta finalidade, fonte, granularidade, tratamento de NULL.

Casts seguros — padrão da Fase 1:
```sql
CASE WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$'
     THEN (data->>'campo')::numeric END AS campo
```

### 3.1 `vw_censo_ambientes` (`0007_*`)

**Granularidade especial:** uma linha por `(school_id, year, ambiente)` — view normalizada (long form). Fonte: `data->'ambientes'` (array no JSONB).

Antes de codar, confirmar o formato real no inventário:
- Array de strings (`["sala_leitura", "biblioteca", ...]`) → `jsonb_array_elements_text(data->'ambientes')`.
- Array de objetos (`[{nome: "sala_leitura", estado: "bom"}, ...]`) → `jsonb_array_elements(data->'ambientes')` + `->>'nome'`.

Documentar a estratégia no header.

### 3.2 `vw_censo_infraestrutura_seguranca` (`0008_*`)

Granularidade: uma linha por `(school_id, year)`.

Campos sugeridos (confirmar contra inventário):
- Infraestrutura física: `tipo_predio`, `situacao_estrutura`, `muro_cerca`, `perimetro_fechado`.
- Elétrica/climatização (já em vw_censo_enriquecida — referenciar, não duplicar lógica): pode juntar via `LEFT JOIN vw_censo_enriquecida USING (school_id, year)` se desejar expor `salas_climatizadas`, `situacao_climatizacao_salas`.
- Segurança: `possui_guarita`, `controle_portao`, `iluminacao_externa`, `possui_botao_panico`, `cameras_funcionamento`, `cameras_cobrem`.
- Hidrosanitário: `banheiros_*` (confirmar chaves exatas).
- Risco/protocolos: `plano_evacuacao`, `politica_bullying`.

### 3.3 `vw_censo_equipamentos_merenda` (`0009_*`)

Granularidade: uma linha por escola/ano.

Campos sugeridos:
- `condicoes_cozinha`, `tamanho_cozinha`, `possui_refeitorio`
- `qtd_freezers`, `qtd_geladeiras`, `qtd_fogoes`, `qtd_fornos`, `qtd_bebedouros`
- `estado_freezers`, `estado_geladeiras`, `estado_fogoes`, `estado_fornos`, `estado_bebedouros`

### 3.4 `vw_censo_rh_merendeiras` (`0010_*`)

Granularidade: uma linha por escola/ano.

Campos sugeridos:
- `qtd_merendeiras_estatutaria`, `qtd_merendeiras_terceirizada`, `qtd_merendeiras_temporaria`
- `empresa_terceirizada_merenda`, `possui_supervisor_merenda`
- `oferta_regular`, `qualidade_merenda`, `atende_necessidades`

### 3.5 `vw_censo_rh_servicos_gerais` (`0011_*`)

Granularidade: uma linha por escola/ano.

Campos sugeridos:
- `qtd_servicos_gerais_efetivo`, `qtd_servicos_gerais_temporario`, `qtd_servicos_gerais_terceirizado`
- `possui_supervisor_servicos_gerais` (se existir — confirmar)

### 3.6 `vw_censo_servicos_terceirizados` (`0012_*`)

Granularidade: uma linha por escola/ano. Consolida portaria + visão geral de terceirização.

Campos sugeridos:
- Portaria: `qtd_agentes_portaria`, `empresa_terceirizada_portaria`, `possui_supervisor_portaria` (se existir).
- Visão geral: flags de "terceirizado" presentes em merenda, portaria, serviços gerais.

## 4. Endpoints

Em `api/cmd/api/analytics_infra_merenda_servicos.go`. Todos sob `requireAdminAuth`. SQL parametrizado. Critérios de contagem da Fase 1B.

Filtros por query string: `?year=&dre=&municipio=&zona=&porte_escola=`.

### 4.1 Infraestrutura e Segurança

```
GET /v1/admin/analytics/infraestrutura/condicoes
GET /v1/admin/analytics/infraestrutura/seguranca
```

Payloads sugeridos:
- `/condicoes` — distribuição por `tipo_predio`, `situacao_estrutura`; % com muro/cerca, % com perímetro fechado; top 10 ambientes mais comuns (via `vw_censo_ambientes`).
- `/seguranca` — % com guarita, controle de portão, iluminação externa, botão de pânico, câmeras funcionais; % com plano de evacuação e política antibullying.

### 4.2 Merenda Escolar

```
GET /v1/admin/analytics/merenda/oferta
GET /v1/admin/analytics/merenda/equipamentos
GET /v1/admin/analytics/merenda/recursos-humanos
```

Payloads sugeridos:
- `/oferta` — % com oferta regular, distribuição de `qualidade_merenda`, % atende necessidades; distribuição de `condicoes_cozinha`, % com refeitório.
- `/equipamentos` — totais e médias de freezers/geladeiras/fogões/fornos/bebedouros; % por estado (`bom/regular/ruim`).
- `/recursos-humanos` — totais por vínculo (estatutária/terceirizada/temporária); top empresas terceirizadas; % com supervisor.

### 4.3 Serviços Terceirizados

```
GET /v1/admin/analytics/servicos-terceirizados/visao-geral
GET /v1/admin/analytics/servicos-terceirizados/servicos-gerais
GET /v1/admin/analytics/servicos-terceirizados/portaria
```

Payloads sugeridos:
- `/visao-geral` — % com terceirização em merenda, portaria, serviços gerais; cruzamento (escolas com 1, 2, 3 áreas terceirizadas).
- `/servicos-gerais` — totais por vínculo (efetivo/temporário/terceirizado); média por escola.
- `/portaria` — % com agentes de portaria; top empresas terceirizadas; média de agentes por escola.

### 4.4 Registro de rotas

Em `api/cmd/api/main.go`, dentro do grupo `protected`, **abaixo** do bloco da Frente 1 (`/pessoal-gestao/*` + `/tecnologia/*`):

```go
protected.Get("/admin/analytics/infraestrutura/condicoes", app.AdminAnalyticsInfraCondicoes)
protected.Get("/admin/analytics/infraestrutura/seguranca", app.AdminAnalyticsInfraSeguranca)
protected.Get("/admin/analytics/merenda/oferta", app.AdminAnalyticsMerendaOferta)
protected.Get("/admin/analytics/merenda/equipamentos", app.AdminAnalyticsMerendaEquipamentos)
protected.Get("/admin/analytics/merenda/recursos-humanos", app.AdminAnalyticsMerendaRH)
protected.Get("/admin/analytics/servicos-terceirizados/visao-geral", app.AdminAnalyticsServicosVisaoGeral)
protected.Get("/admin/analytics/servicos-terceirizados/servicos-gerais", app.AdminAnalyticsServicosGerais)
protected.Get("/admin/analytics/servicos-terceirizados/portaria", app.AdminAnalyticsServicosPortaria)
```

## 5. Validação

Criar `docs/dashboard/validacao-fase-infra-merenda-servicos.md` com:

- payload de exemplo de cada endpoint;
- inspeção manual em 3 escolas amostradas (verificar que campos batem com `data` JSONB);
- top 5 ambientes mais comuns na rede (a partir de `vw_censo_ambientes`);
- SQL de sanity-check (cardinalidade das views, totais consistentes com `analytics/overview`);
- preservação confirmada de Sheets + endpoints intactos.

## 6. Sanity local

```bash
cd api
go build ./cmd/api/...
go run ./cmd/api/main.go     # observar applyMigrations 0007..0012

TOKEN="<jwt admin>"
for path in \
  "infraestrutura/condicoes" \
  "infraestrutura/seguranca" \
  "merenda/oferta" \
  "merenda/equipamentos" \
  "merenda/recursos-humanos" \
  "servicos-terceirizados/visao-geral" \
  "servicos-terceirizados/servicos-gerais" \
  "servicos-terceirizados/portaria"; do
  echo "=== $path ==="
  curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/v1/admin/analytics/$path"
done
```

## 7. Critérios de aceite

- [ ] 6 migrations (`0007_` a `0012_`) criadas, idempotentes, espelhadas em `api/cmd/api/migrations/` e replicadas em `infra/init.sql`.
- [ ] 8 endpoints respondem 200 sob `requireAdminAuth`. Sem token → 401.
- [ ] SQL parametrizado em todos os pontos.
- [ ] Critérios de contagem da Fase 1B aplicados.
- [ ] Cabeçalho de cada view documenta finalidade, fonte, granularidade, tratamento de NULL.
- [ ] `vw_censo_ambientes` (normalizada) tem `school_id × ambiente` checado em 3 escolas amostradas.
- [ ] `docs/dashboard/validacao-fase-infra-merenda-servicos.md` com payloads + inspeção manual.
- [ ] `go build ./cmd/api/...` OK.
- [ ] **UI inalterada.** Não tocar `web/`.
- [ ] **Sheets inalterado.**

## 8. PRs sugeridos

1. **PR 1** — `0007_vw_censo_ambientes.sql` (decisão sobre formato do array no header).
2. **PR 2** — `0008_vw_censo_infraestrutura_seguranca.sql` + handlers `/infraestrutura/*`.
3. **PR 3** — `0009_vw_censo_equipamentos_merenda.sql` + `0010_vw_censo_rh_merendeiras.sql`.
4. **PR 4** — handlers `/merenda/*`.
5. **PR 5** — `0011_vw_censo_rh_servicos_gerais.sql` + `0012_vw_censo_servicos_terceirizados.sql`.
6. **PR 6** — handlers `/servicos-terceirizados/*`.
7. **PR 7** — `validacao-fase-infra-merenda-servicos.md`.

Cada PR ≤ 400 linhas líquidas, reversível.

## 9. Riscos conhecidos

- `data->'ambientes'` pode estar gravado em formato inconsistente (array de strings vs array de objetos vs CSV). **Confirmar no inventário antes de codar `0007_`** e documentar no header da view.
- Estados de equipamentos (`estado_freezers`, etc.) podem chegar como string com acentos ou variações (`"Bom"`, `"BOM"`, `"bom"`). Normalizar via `lower(NULLIF(...))` ou `INITCAP(NULLIF(...))`.
- Campos booleanos com formatos variados (`sim/nao`, `true/false`, `1/0`). Padronizar via `CASE WHEN lower(...) IN ('sim','true','t','1') THEN TRUE ... END`.
- Conflito com Frente 1 só em `api/cmd/api/main.go`. Resolver com rebase simples — manter blocos contíguos por frente.

## 10. Fora de escopo

- Migração visual (plugar endpoints nos placeholders da Frente 3) — PR posterior, fora desta rodada.
- Aba "Perfil dos Alunos e Resultados" — fora de escopo total (será remodelada para outra planilha).
- Aba "Gestão Financeira e Governança" — fora de escopo total (idem).
- Aposentadoria de `sheet-metrics`/`indicadores-metrics` — Fase 7 do roadmap.
- Indicadores/flags consolidados — Fase 5 do roadmap.
