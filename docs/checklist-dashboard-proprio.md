# Checklist incremental — Dashboard administrativo próprio

**Documento companheiro:** [docs/roadmap-dashboard-proprio.md](roadmap-dashboard-proprio.md)
**Objetivo:** transformar o roadmap em uma lista executável, fase a fase. Cada item é uma tarefa atômica, verificável e reversível.

> **Regras gerais do checklist**
> - Não tocar no fluxo de gravação (`POST /v1/census`) em nenhuma fase.
> - Não desligar a sincronização com Google Sheets até o final da Fase 7.
> - Não remover `GET /v1/locations`.
> - Todos os endpoints novos vivem sob `GET /v1/admin/analytics/*` e usam `requireAdminAuth`.
> - SQL sempre parametrizado (`$1`, `$2`, ...). Nunca interpolar strings.
> - Migrations vão em `infra/migrations/NNNN_descricao.sql` e devem ser idempotentes (`CREATE OR REPLACE VIEW`, `IF NOT EXISTS`).

---

## Fase 0 — Inventário do JSONB *(somente documentação)*

### 0.1 Coleta
- [ ] Conectar em uma cópia de produção (ou dump) do PostgreSQL.
- [ ] Rodar `SELECT DISTINCT jsonb_object_keys(data) FROM census_responses WHERE data IS NOT NULL ORDER BY 1` e salvar o resultado.
- [ ] Coletar 5 payloads anônimos de registros `completed` (`LIMIT 5`).
- [ ] Coletar 5 payloads anônimos de registros `draft` (para entender diferenças).

### 0.2 Mapeamento contra schemas Zod
- [ ] Para cada arquivo em `web/src/schemas/steps/*.ts`, listar todos os campos declarados.
- [ ] Cruzar com as chaves coletadas em 0.1 e classificar cada chave em:
  - presente no schema e no banco ✅
  - declarada no schema, ausente no banco ⚠️
  - presente no banco, ausente do schema ⚠️
  - tipo divergente (ex.: número gravado como string) ⚠️

### 0.3 Mapeamento dos campos `schools.turnos / etapas_ofertadas / modalidades_ofertadas`
- [ ] Coletar 20 valores reais dessas colunas (`SELECT DISTINCT turnos FROM schools LIMIT 20`).
- [ ] Decidir e registrar: JSON válido? CSV? Misto? Definir estratégia de parse para a futura `vw_censo_turnos`.

### 0.4 Entregável
- [ ] Criar `docs/dashboard/jsonb-field-inventory.md` com:
  - tabela `etapa → chave → tipo declarado → tipo observado → presente em N% dos registros`;
  - lista explícita das discrepâncias;
  - decisão sobre como `vw_censo_base` deve tratar cada cast (`NULLIF + ::numeric`, default 0, etc.);
  - exemplos anonimizados de payloads.

### 0.5 Aceite
- [ ] Documento revisado por pelo menos 1 outra pessoa.
- [ ] Lista de campos confirmados como obrigatórios para a Fase 1 fechada.

---

## Fase 1 — `vw_censo_base` + endpoint `GET /v1/admin/analytics/overview`

> **Foco do primeiro incremento.** Pequeno, seguro, sem mexer no fluxo de gravação nem na planilha.

### 1.1 Migration da view base
- [ ] Criar pasta `infra/migrations/` (se não existir).
- [ ] Criar `infra/migrations/0001_vw_censo_base.sql` com `CREATE OR REPLACE VIEW vw_censo_base` (ver SQL na seção 7.1 do roadmap).
- [ ] Replicar o `CREATE OR REPLACE VIEW` no final de `infra/init.sql` (para ambientes novos).
- [ ] Em `api/cmd/api/main.go`, adicionar — após a migração `sheet_synced_at` existente — a aplicação idempotente do conteúdo da migration 0001 no startup (ou criar um pequeno carregador de `infra/migrations/*.sql`).
- [ ] Validar localmente:
  - [ ] `SELECT COUNT(*) FROM schools;`
  - [ ] `SELECT COUNT(*) FROM census_responses;`
  - [ ] `SELECT COUNT(*) FROM vw_censo_base;` — confere a relação esperada.
  - [ ] `SELECT * FROM vw_censo_base ORDER BY updated_at DESC LIMIT 5;` — sem erros de cast.

### 1.2 Endpoint analítico
- [ ] Criar `api/cmd/api/analytics.go` (novo arquivo) com:
  - tipo `AnalyticsOverview` (campos: `TotalSchools`, `TotalCensuses`, `Completed`, `Drafts`, `TotalAlunos`, `AlunosPcd`, `MediaAlunosPorEscola`, `PorZona []ZonaCount`).
  - handler `AdminAnalyticsOverview(w, r)` consultando `vw_censo_base` com SQL parametrizado.
- [ ] Registrar a rota em `api/cmd/api/main.go` dentro do grupo `protected`:
  ```go
  protected.Get("/admin/analytics/overview", app.AdminAnalyticsOverview)
  ```
- [ ] Considerar (apenas para `completed`, espelhando o critério do dashboard atual): `WHERE status = 'completed'`.
- [ ] Testes manuais:
  - [ ] `curl -H "Authorization: Bearer <token>" http://localhost:8000/v1/admin/analytics/overview` retorna 200.
  - [ ] Sem token → 401.

### 1.3 Refatoração dos cards principais do admin
- [ ] Em `web/src/app/admin/page.tsx`, adicionar tipo `AnalyticsOverview` e função `loadOverview()` usando `apiFetch`.
- [ ] Substituir **apenas** os 4 `StatCard` superiores da aba `perfil` (ou da aba `operacional`, alinhar com stakeholder) para consumir `analytics/overview`.
- [ ] Manter o restante da aba inalterado (continua consumindo `sheet-metrics`).
- [ ] Adicionar fallback de erro/loader específico para o novo endpoint (não impactar a chamada da planilha).

### 1.4 Validação de paridade
- [ ] Criar `docs/dashboard/validacao-fase-1.md` com tabela: métrica × valor PostgreSQL × valor Sheets × delta.
- [ ] Para `total_alunos` e `alunos_pcd` o delta deve ser ≤ 1% (arredondamento aceitável).
- [ ] Para `total_schools` e contagens de status o delta deve ser 0 (banco é fonte canônica).
- [ ] Em caso de divergência, abrir issue interna antes de prosseguir.

### 1.5 Operação em paralelo
- [ ] `sheet-metrics` continua respondendo normalmente.
- [ ] `indicadores-metrics` continua respondendo normalmente.
- [ ] Job de sync continua rodando (não tocar em `sheetSyncRetryJob`).
- [ ] `/v1/locations` segue retornando do Sheets para o formulário.

### 1.6 PR e revisão
- [ ] PR descreve: o que mudou, o que NÃO mudou, como reverter.
- [ ] PR mantém ≤ 400 linhas líquidas se possível.
- [ ] Adicionado ao PR: print do antes/depois do card e tabela de paridade.

### 1.7 Aceite da Fase 1
- [ ] Build do backend OK (`go build ./cmd/api/...`).
- [ ] `npm run build` no `web/` OK.
- [ ] `npm run lint` no `web/` OK.
- [ ] View aplicada em ambiente de homologação.
- [ ] Cards principais consumindo o novo endpoint em produção.
- [ ] Planilha intacta e funcional.

---

## Fase 2 — Caracterização da Rede via PostgreSQL

### 2.1 View enriquecida
- [ ] Migration `0002_vw_censo_enriquecida.sql` com `porte_escola`, `porte_escola_cod`, `qtd_turmas_total`, `qtd_salas_nao_climatizadas`, `situacao_climatizacao_salas`.
- [ ] Validar contagens por `porte_escola` contra amostra manual.

### 2.2 Endpoints
- [ ] `GET /v1/admin/analytics/caracterizacao/perfil` — devolve KPIs + donut por porte + donut por zona + barras matrículas por porte.
- [ ] `GET /v1/admin/analytics/caracterizacao/dre` — devolve a tabela detalhada por DRE.
- [ ] Suporte a filtros `?year=&dre=&municipio=&zona=&porte_escola=`.

### 2.3 UI
- [ ] Migrar `PerfilDaRede` em `web/src/app/admin/page.tsx` para consumir os dois novos endpoints.
- [ ] Remover o `useEffect` que chama `sheet-metrics` da aba (sem ainda remover o endpoint no backend).

### 2.4 Aceite
- [ ] Paridade documentada em `docs/dashboard/validacao-fase-2.md`.
- [ ] `sheet-metrics` marcado como deprecated no comentário do handler.

---

## Fase 3 — Perfil dos Alunos via PostgreSQL

### 3.1 Indicadores derivados (versão mínima)
- [ ] Estender `vw_censo_enriquecida` ou criar `vw_censo_indicadores_escola` (versão mínima) com:
  - `faixa_beneficiarios` (categorização de `total_beneficiarios`);
  - `faixa_abandono` (categorização de `taxa_abandono`);
  - `flag_risco_fluxo` (regra documentada no header da view).

### 3.2 Endpoint
- [ ] `GET /v1/admin/analytics/alunos/permanencia` — escolas por faixa de beneficiários, escolas por faixa de abandono, top 10 DREs por abandono médio, escolas em risco de fluxo.

### 3.3 UI
- [ ] Migrar `PerfilAlunos` para o novo endpoint.

### 3.4 Aceite
- [ ] Paridade documentada (margem ≤ 2%).
- [ ] `indicadores-metrics` marcado como deprecated.

---

## Fase 4 — Views normalizadas (turnos / etapas / modalidades / ambientes)

### 4.1 Saneamento das listas em `schools`
- [ ] Decisão registrada na Fase 0 aplicada: criar função `parse_lista_serializada(text) RETURNS text[]` ou similar, se necessário.

### 4.2 Migrations
- [ ] `0003_vw_censo_turnos.sql`
- [ ] `0004_vw_censo_etapas.sql`
- [ ] `0005_vw_censo_modalidades.sql`
- [ ] `0006_vw_censo_ambientes.sql`

### 4.3 Endpoints
- [ ] `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento`
- [ ] `GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional`

### 4.4 UI
- [ ] Nova seção ou expansão da aba `perfil` consumindo os endpoints acima.

### 4.5 Aceite
- [ ] Top 5 ambientes / etapas / modalidades reproduzidos a partir do banco batem com inspeção manual de 3 escolas amostradas.

---

## Fase 5 — Indicadores derivados completos + alertas

### 5.1 View consolidada
- [ ] Migration `0007_vw_censo_indicadores_escola.sql` completa, conforme seção 22 do guia.

### 5.2 Endpoints
- [ ] `GET /v1/admin/analytics/alertas` — lista escolas com pelo menos uma flag crítica.

### 5.3 UI
- [ ] (Opcional nesta fase) nova aba "Alertas" no `/admin`.

### 5.4 Aceite
- [ ] Cada flag tem definição documentada (SQL, critério, exemplos).

---

## Fase 6 — Painéis temáticos (gestão, merenda, tecnologia, serviços, infra)

### 6.1 Views
- [ ] `vw_censo_direcao_escolar`
- [ ] `vw_censo_coordenacao_area`
- [ ] `vw_censo_quadro_pessoal`
- [ ] `vw_censo_equipamentos_merenda`
- [ ] `vw_censo_rh_merendeiras`
- [ ] `vw_censo_rh_servicos_gerais`
- [ ] `vw_censo_servicos_terceirizados`
- [ ] `vw_censo_equipamentos_tecnologia`
- [ ] `vw_censo_reprovacao_etapa`
- [ ] `vw_censo_ideb_etapa` (mesmo que IDEB ainda não esteja preenchido, deixar a view pronta)

### 6.2 Endpoints
- [ ] Endpoints `/analytics/pessoal-gestao/*`
- [ ] Endpoints `/analytics/merenda/*`
- [ ] Endpoints `/analytics/tecnologia/*`
- [ ] Endpoints `/analytics/servicos-terceirizados/*`
- [ ] Endpoints `/analytics/infraestrutura/*`
- [ ] `GET /v1/admin/analytics/escolas/{id}` — ficha individual

### 6.3 UI
- [ ] Novas abas/seções na página `/admin` consumindo cada grupo.

### 6.4 Documentação
- [ ] `docs/dashboard/views.md` lista todas as views com finalidade, fonte, granularidade, campos.

---

## Fase 7 — Aposentadoria controlada da planilha como fonte analítica

### 7.1 Pré-condição
- [ ] Fases 1–6 em produção, com período de observação acordado (mínimo 2 ciclos de sync ou 30 dias).
- [ ] Nenhum consumo de `sheet-metrics` / `indicadores-metrics` na UI.

### 7.2 Remoção
- [ ] Remover rotas `protected.Get("/admin/sheet-metrics", ...)` e `.../indicadores-metrics` de `api/cmd/api/main.go`.
- [ ] Remover handlers `AdminSheetMetrics` e `AdminIndicadoresMetrics` de `api/cmd/api/admin.go`.
- [ ] Manter `SheetsService.AppendCenso`, `MarkSheetSynced`, job `sheetSyncRetryJob`, `POST /admin/sync-sheets` e `GET /v1/locations` intactos.

### 7.3 Comunicação
- [ ] Changelog interno atualizado.
- [ ] Documentação `docs/dashboard/views.md` aponta o PostgreSQL como única fonte oficial do painel.

### 7.4 Aceite
- [ ] Painel `/admin` funciona sem chamar a planilha.
- [ ] Formulário público continua funcionando (testar `GET /v1/locations` em homologação).
- [ ] Planilha continua recebendo dados via job de sync.

---

## Operação contínua (após Fase 7)

- [ ] Para cada nova chave adicionada a `census_responses.data`, abrir migration para refletir na view correspondente.
- [ ] Revisar trimestralmente performance das views; converter em `MATERIALIZED VIEW` se necessário.
- [ ] Manter o documento `docs/dashboard/views.md` como fonte única da camada analítica.
