# Plano de Trabalho Paralelo — Dashboard Admin

**Documentos companheiros:**
- [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md)
- [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md)
- [validacao-fase-1.md](validacao-fase-1.md)
- [jsonb-field-inventory.md](jsonb-field-inventory.md)

## 1. Objetivo

Permitir que duas frentes avancem em paralelo sem conflito de escopo.

## 2. Estado atual

- Fase 1 validada online.
- `vw_censo_base` criada.
- `/v1/admin/analytics/overview` ativo.
- Cards principais consumindo PostgreSQL.
- Demais gráficos ainda dependem da planilha.
- Google Sheets permanece ativo.

## 3. Frente A — Critérios de contagem e qualidade dos dados

### Objetivo

Documentar critérios de contagem, duplicidade, INEP repetido e consistência dos indicadores.

### Pode alterar

- `docs/dashboard/criterios-contagem-e-qualidade-dados.md`
- `docs/dashboard/validacao-fase-1.md`
- eventualmente `docs/checklist-dashboard-proprio.md`

### Não pode alterar

- `api/`
- `web/`
- `infra/migrations/`
- endpoints existentes
- fluxo do formulário

### Entregável

`docs/dashboard/criterios-contagem-e-qualidade-dados.md`

## 4. Frente B — Backend analítico da Fase 2A

### Objetivo

Preparar a camada backend para a aba Caracterização da Rede consumir PostgreSQL.

### Pode alterar

- `infra/migrations/0002_vw_censo_enriquecida.sql`
- `api/cmd/api/migrations/0002_vw_censo_enriquecida.sql`
- `api/cmd/api/analytics.go`
- `api/cmd/api/main.go`
- `docs/dashboard/validacao-fase-2.md`

### Não pode alterar

- `POST /v1/census`
- fluxo do formulário
- `sheet-metrics`
- `indicadores-metrics`
- `/v1/locations`
- UI completa da aba Caracterização da Rede, salvo autorização posterior

### Entregável

Endpoints backend da Fase 2A e documento de validação.

## 5. Regras de integração

- Cada frente deve trabalhar em branch separada.
- Commits devem ser pequenos.
- Frente A não bloqueia a criação da view da Frente B.
- Frente B não deve implementar deduplicação automática.
- Divergências devem ser registradas, não corrigidas automaticamente.
- Antes de migrar a UI inteira, validar endpoints da Fase 2A.

## 6. Ordem recomendada de branches

- `docs/criterios-contagem-dashboard`
- `feat/dashboard-caracterizacao-backend`

## 7. Critérios de aceite

- Frente A entrega `docs/dashboard/criterios-contagem-e-qualidade-dados.md` com:
  - distinção `school_id` × `codigo_inep` × `census_id` × `status`;
  - queries de diagnóstico reproduzíveis;
  - semântica por indicador alinhada ao `analytics/overview`;
  - decisão explícita de não deduplicar automaticamente nesta fase;
  - lista de divergências PostgreSQL × Sheets com hipótese de causa.
- Frente B entrega:
  - migration `0002_vw_censo_enriquecida.sql` aplicada de forma idempotente;
  - endpoints `/v1/admin/analytics/caracterizacao/perfil` e `.../dre` respondendo 200 sob `requireAdminAuth`;
  - SQL parametrizado e respeitando os recortes documentados pela Frente A;
  - `docs/dashboard/validacao-fase-2.md` preenchido com tabela de paridade vs. `sheet-metrics`;
  - UI da aba "Caracterização da Rede" **intocada** (migração visual é Fase 2B).
- Nenhuma das frentes:
  - remove ou desabilita `sheet-metrics`, `indicadores-metrics`, `/v1/locations`, `sheetSyncRetryJob` ou `POST /v1/admin/sync-sheets`;
  - altera `POST /v1/census` ou o fluxo do formulário;
  - introduz ORM;
  - aplica deduplicação automática no banco.
