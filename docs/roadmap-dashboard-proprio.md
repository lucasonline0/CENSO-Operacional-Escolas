# Roadmap — Dashboard administrativo próprio (PostgreSQL como fonte oficial)

**Projeto:** Censo Operacional e Estrutural das Escolas — SEDUC/PA
**Repositório:** `lucasonline0/CENSO-Operacional-Escolas`
**Branch base:** `main`
**Documento companheiro:** [docs/checklist-dashboard-proprio.md](checklist-dashboard-proprio.md)
**Referência metodológica:** [docs/guia_views_analiticas_baseado_repositorio_censo.md](guia_views_analiticas_baseado_repositorio_censo.md)

---

## 1. Diagnóstico do estado atual

### 1.1 Visão geral da arquitetura

O sistema é um monorepo composto por três módulos:

```txt
api/      Backend Go (chi + database/sql + pgx/v5, sem ORM)
web/      Frontend Next.js (App Router, Tailwind, Radix/shadcn)
infra/    docker-compose + init.sql (PostgreSQL 5432, Adminer 8080)
```

O fluxo operacional atual é:

```txt
Formulário (web)
  → POST /v1/census  (api)
  → census_responses (PostgreSQL, JSONB)
  → job de retry a cada 10 min
  → Google Sheets (Base_dados / Indicadores_Flags)
  ← Painel /admin lê de duas fontes:
       a) PostgreSQL (operacional)
       b) Google Sheets (analítico)
```

### 1.2 Banco PostgreSQL (estado real)

Definido em [infra/init.sql](../infra/init.sql):

- **`schools`** — uma linha por escola; campos fixos (INEP, DRE, município, zona, contato, diretor) e três colunas `TEXT` (`turnos`, `etapas_ofertadas`, `modalidades_ofertadas`) que armazenam arrays serializados em JSON.
- **`census_responses`** — uma linha por `(school_id, year)` (`UNIQUE`); colunas operacionais (`status`, `created_at`, `updated_at`, `sheet_synced_at`) e um `data JSONB` que carrega praticamente toda a resposta do formulário.
- Migration automática em [api/cmd/api/main.go:91](../api/cmd/api/main.go) garante a coluna `sheet_synced_at`.
- **Não existem views, índices analíticos, schemas auxiliares nem tabelas derivadas.**

### 1.3 Endpoints admin atuais

Registrados em [api/cmd/api/main.go:215](../api/cmd/api/main.go) e implementados em [api/cmd/api/admin.go](../api/cmd/api/admin.go):

| Endpoint | Fonte de dados | Status |
|---|---|---|
| `POST /v1/admin/login` | env (`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`) + bcrypt + JWT | OK |
| `GET  /v1/admin/dashboard` | **PostgreSQL** (`schools` + `census_responses`) | OK — operacional |
| `GET  /v1/admin/sheet-metrics` | **Google Sheets** (`Base_dados`) | **Depende da planilha** |
| `GET  /v1/admin/indicadores-metrics` | **Google Sheets** (`Indicadores_Flags`) | **Depende da planilha** |
| `GET  /v1/admin/census` | PostgreSQL (listagem com filtros `status`/`dre`) | OK |
| `GET  /v1/admin/census/{id}` | PostgreSQL (JSON completo do censo) | OK |
| `POST /v1/admin/sync-sheets` | PostgreSQL → Sheets (force resync) | OK |

Endpoints públicos relevantes (não são alvo desta refatoração):
- `GET /v1/locations` consome Google Sheets via `SheetsService.GetLocations` — usado pelo formulário, **deve continuar funcionando**.

### 1.4 Página `/admin` — visualizações existentes

Implementada em [web/src/app/admin/page.tsx](../web/src/app/admin/page.tsx) (~994 linhas). Possui cinco abas:

| Aba | Fonte | O que mostra |
|---|---|---|
| **Caracterização da Rede** (`perfil`) | `/v1/admin/sheet-metrics` (Sheets) | KPIs (total escolas/alunos, média, PcD), donut por porte, donut por zona, barras matrículas por porte, barras escolas por DRE, tabela detalhada por DRE |
| **Perfil dos Alunos e Resultados** (`alunos`) | `/v1/admin/indicadores-metrics` (Sheets) | KPI escolas risco fluxo, barras faixa de beneficiários, barras taxa de abandono, top 10 DREs por abandono |
| **Operacional** | `/v1/admin/dashboard` (PostgreSQL) | KPIs (escolas, completados, drafts, pendentes sync), tabela de censos recentes |
| **Todos os Censos** | `/v1/admin/census` (PostgreSQL) | Listagem com busca + filtros (status, DRE), modal "ver JSON" via `/admin/census/{id}` |
| **Por DRE** | `/v1/admin/dashboard.by_dre` (PostgreSQL) | Tabela agregada por DRE |

### 1.5 Onde estão os dados analíticos hoje

Quase todos os indicadores quantitativos do formulário (alunos, salas, ambientes, equipamentos, RH, IDEB, abandono, governança, infraestrutura, tecnologia, serviços terceirizados) vivem **dentro de `census_responses.data` como JSONB**. A planilha guarda essas mesmas informações já aplainadas/derivadas — por isso o admin ainda recorre a ela para os cards de caracterização e perfil.

Os schemas Zod em [web/src/schemas/steps/](../web/src/schemas/steps/) são o contrato canônico dos campos JSONB. As chaves principais já visíveis incluem (lista parcial, a confirmar via inventário real):

- **General data** (`general-data.ts`): `tipo_predio`, `possui_anexos`, `etapas_ofertadas`, `modalidades_ofertadas`, `qtd_salas_aula`, `turmas_manha/tarde/noite/integral`, `total_alunos`, `alunos_pcd`, `alunos_rural`, `alunos_urbana`, `muro_cerca`, `perimetro_fechado`, `situacao_estrutura`, `ambientes` (array), `banheiros_*`, `salas_climatizadas`, `energia`, `rede_eletrica_atende`, `problemas_eletricos`, `estrutura_climatizacao`, `suporta_novos_equipamentos`, `cameras_funcionamento`, `cameras_cobrem`.
- **Servidores**: `possui_direcao`, `possui_vice_pedagogico`, `possui_vice_administrativo`, `possui_secretario`, `possui_coord_pedagogico`, `qtd_coord_pedagogico`, `possui_coord_area_{matematica,linguagem,humanas,natureza}`, `qtd_professores_efetivos`, `qtd_professores_temporarios`, `qtd_servidores_administrativos`, `qtd_professor_readaptado`.
- **Merenda**: `condicoes_cozinha`, `tamanho_cozinha`, `oferta_regular`, `qualidade_merenda`, `atende_necessidades`, `possui_refeitorio`, `qtd_freezers/geladeiras/fogoes/fornos/bebedouros` (+ `estado_*`), `qtd_merendeiras_estatutaria/terceirizada/temporaria`, `empresa_terceirizada_merenda`, `possui_supervisor_merenda`.
- **Alunos**: `total_beneficiarios`, `taxa_abandono`, `taxa_reprovacao_fund1/fund2/medio`, `ideb_anos_iniciais/finais`, `ideb_ensino_medio`.
- **Tecnologia**: `internet_disponivel`, `provedor_internet`, `qualidade_internet`, `qtd_desktop_adm/alunos`, `qtd_notebooks`, `qtd_chromebooks`, `computadores_atendem`, `qtd_computadores_inoperantes`, `possui_projetor`, `qtd_projetores`, `possui_lousa_digital`.
- **Portaria / Serviços gerais**: `possui_guarita`, `controle_portao`, `iluminacao_externa`, `possui_botao_panico`, `qtd_agentes_portaria`, `empresa_terceirizada_portaria`, `qtd_servicos_gerais_{efetivo,temporario,terceirizado}`, `possui_supervisor_*`.
- **Gestão**: `regularizada_cee`, `conselho_escolar`, `conselho_ativo`, `recursos_prodep`, `valor_prodep`, `execucao_prodep`, `pendencias_prodep`, `recursos_federais`, `gremio_estudantil`, `reunioes_comunidade`, `plano_evacuacao`, `politica_bullying`.
- **Avaliação**: `avaliacao_merendeiras/portaria/limpeza/comunicacao/supervisao`.
- **Observações**: prioridades, demanda urgente, sugestões, dados do responsável.

---

## 2. Dependência atual da planilha

Hoje a planilha Google é simultaneamente:

1. **Fonte do formulário** — `GET /v1/locations` lê as listas oficiais de DRE/município. Esta dependência **não é alvo** desta refatoração.
2. **Sink operacional** — todo censo `completed` é replicado via `SheetsService.AppendCenso` + job de retry de 10 min. Continua sendo o canal oficial enquanto a camada analítica do PostgreSQL não estiver validada.
3. **Fonte analítica do `/admin`** — `sheet-metrics` e `indicadores-metrics` leem abas pré-calculadas (`Base_dados`, `Indicadores_Flags`) que reproduzem indicadores que o PostgreSQL pode reconstruir.

O risco da arquitetura atual é colocar o painel em dependência de uma planilha externa cuja consistência depende de um job assíncrono, sem versionamento e sem auditoria. A meta é eliminar a dependência analítica **sem** mexer no fluxo de gravação e sem desligar a planilha enquanto a paridade de números não for validada.

---

## 3. Arquitetura-alvo

```txt
Formulário Next.js
   → Go API
      → PostgreSQL
         → Views SQL (vw_censo_*)
         → Queries analíticas / Serviços de indicadores em Go
            → Endpoints /v1/admin/analytics/*
               → Dashboard Admin Next.js
```

Princípios:

- **Banco como fonte de verdade.** Toda métrica analítica nasce de `schools + census_responses`.
- **Views SQL como camada estável.** Os endpoints consultam views, não JSONB cru. Cada view tem propósito definido e nome `vw_censo_*`.
- **Endpoints analíticos novos, não substitutivos.** Os endpoints atuais (incluindo `sheet-metrics` e `indicadores-metrics`) permanecem ativos durante a transição.
- **Filtros parametrizados.** Nada de interpolação direta de SQL — usar `$1`/`$2` (padrão já adotado em `AdminGetCensus`).
- **Idempotência.** Migrations de views usam `CREATE OR REPLACE`; nada deve quebrar `init.sql`.
- **Planilha permanece como espelho.** O job de sync continua rodando; a planilha vira referência cruzada para validação, não dependência operacional do admin.

---

## 4. Proposta de refatoração incremental

A refatoração é feita por **fases independentes**. Cada fase é entregue como PR pequeno, com paridade de números validada contra a aba correspondente do admin antes da próxima fase começar.

```txt
Fase 0  — Inventário do JSONB                              (documentação)
Fase 1  — View base + endpoint overview                    (primeira entrega de código)
Fase 1B — Critérios de contagem e qualidade dos dados      (documentação)
Fase 2A — Backend analítico da Caracterização da Rede      (PostgreSQL → endpoints)
Fase 2B — Migração incremental da UI da Caracterização     (substitui sheet-metrics na UI)
Fase 3  — Perfil dos Alunos via PostgreSQL                 (substitui indicadores-metrics)
Fase 4  — Views normalizadas (turnos/etapas/...)
Fase 5  — Indicadores derivados + flags
Fase 6  — Demais painéis (gestão, merenda, tecnologia, serviços, infra)
Fase 7  — Aposentadoria controlada dos endpoints de planilha
```

O Fase 1 é o primeiro incremento prático recomendado: pequeno, seguro e sem risco para o fluxo de gravação.

---

## 5. Fases de desenvolvimento

### Fase 0 — Inventário do JSONB *(somente documentação)*

**Objetivo:** mapeamento real das chaves presentes em `census_responses.data`, comparado com os schemas Zod do frontend.

**Entregáveis:**
- `docs/dashboard/jsonb-field-inventory.md` listando todas as chaves vistas em produção, agrupadas pela etapa do formulário (general-data, servidores, merenda, ...).
- Marcar discrepâncias entre schema declarado e o que efetivamente é gravado.
- Queries de diagnóstico:
  ```sql
  SELECT DISTINCT jsonb_object_keys(data) AS key
  FROM census_responses
  WHERE data IS NOT NULL
  ORDER BY 1;

  SELECT data FROM census_responses
  WHERE status = 'completed'
  ORDER BY updated_at DESC
  LIMIT 5;
  ```

### Fase 1 — View base `vw_censo_base` + endpoint overview

**Objetivo:** primeira fundação SQL e primeiro endpoint analítico no PostgreSQL.

**Entregáveis:**
- Migration idempotente `infra/migrations/0001_vw_censo_base.sql` (`CREATE OR REPLACE VIEW`) e atualização de `infra/init.sql` para criar a view ao subir o ambiente.
- View `vw_censo_base` com uma linha por `(school_id, year)`, expondo as colunas de `schools` + colunas tipadas extraídas de `data` (`total_alunos`, `alunos_pcd`, `alunos_rural`, `alunos_urbana`, `qtd_salas_aula`, `salas_climatizadas`, `turmas_*`, e os campos categóricos básicos de caracterização).
- Endpoint protegido `GET /v1/admin/analytics/overview` retornando os KPIs principais: total de escolas, total de censos, completos, drafts, total de alunos, alunos PcD, média de alunos/escola, distribuição por zona.
- Página `/admin` consumindo `analytics/overview` **apenas** nos cards principais da aba `perfil` e/ou `operacional`; o restante continua na planilha.
- Validação numérica contra `sheet-metrics` documentada (planilha de comparação ou tabela no PR).

**Critérios de aceite Fase 1:** ver seção 9.

### Fase 1B — Critérios de contagem e qualidade dos dados *(somente documentação)*

**Objetivo:** formalizar a semântica de contagem que o PostgreSQL passou a usar como fonte oficial dos cards principais, antes de avançar para novos endpoints analíticos.

**Contexto:**
- A Fase 1 já validou que o PostgreSQL é a fonte oficial dos KPIs principais da aba "Caracterização da Rede". O número entregue pela view `vw_censo_base` + `analytics/overview` é tratado como **válido para esta fase**.
- Durante a validação foram observadas **diferenças entre PostgreSQL e Google Sheets**. Parte vem de preenchimentos repetidos pelo mesmo diretor, parte de correções feitas após sincronização, parte de **casos legítimos de escolas/anexos com o mesmo `codigo_inep`**.
- A **deduplicação automática não será aplicada** nesta fase. Não vamos "corrigir" silenciosamente o banco; vamos documentar a regra de contagem e como divergências legítimas se manifestam.
- Os próximos endpoints (Fase 2A em diante) **devem manter os mesmos critérios** de contagem documentados aqui, para evitar números inconsistentes entre cards/abas.

**Entregáveis:**
- Documento `docs/dashboard/criterios-contagem-e-qualidade-dados.md` com:
  - distinção entre `school_id`, `codigo_inep`, `census_id` e `status` — qual identificador é canônico para qual recorte;
  - registro de que existem casos legítimos de mesmo INEP para escola/anexo, e como são (ou não) diferenciados;
  - queries de diagnóstico para INEP repetido, possíveis respostas duplicadas, escolas sem censo, censos `draft` e censos `completed`;
  - semântica por indicador (ex.: `total_alunos` ↔ `SUM` somente em `completed` e filtrado por ano corrente);
  - decisão explícita de **não** aplicar deduplicação automática nesta fase;
  - lista de divergências conhecidas (PostgreSQL × Sheets) com hipótese de causa.
- Atualização de `docs/dashboard/validacao-fase-1.md` apontando para o novo documento como referência sobre divergências aceitas.

**Não-objetivos:**
- Não alterar `vw_censo_base`, endpoints ou UI.
- Não remover ou alterar registros do banco.
- Não mudar o critério de sincronização com Sheets.

### Fase 2A — Backend analítico da Caracterização da Rede

**Objetivo:** entregar a camada PostgreSQL que substituirá `sheet-metrics` na aba "Caracterização da Rede", **sem ainda migrar a UI inteira**.

**Entregáveis:**
- View `vw_censo_enriquecida` derivada de `vw_censo_base`, adicionando `porte_escola`, `porte_escola_cod`, `qtd_turmas_total`, `qtd_salas_nao_climatizadas`, `situacao_climatizacao_salas`.
- Endpoints `GET /v1/admin/analytics/caracterizacao/perfil` (KPIs + donuts) e `GET /v1/admin/analytics/caracterizacao/dre` (tabela detalhada).
- Os endpoints devem respeitar a semântica de contagem registrada em `docs/dashboard/criterios-contagem-e-qualidade-dados.md` (Fase 1B).
- Documento `docs/dashboard/validacao-fase-2.md` (paridade endpoint-a-endpoint contra `sheet-metrics`).
- `/v1/admin/sheet-metrics` permanece ativo e segue alimentando a UI nesta fase.

**Não-objetivos:**
- Não migrar a UI inteira da aba "Caracterização da Rede".
- Não tocar em `indicadores-metrics`, no formulário, no job de sync ou em `/v1/locations`.

### Fase 2B — Migração incremental da UI da Caracterização da Rede

**Objetivo:** trocar a aba "Caracterização da Rede" para os endpoints da Fase 2A, **uma seção por vez**.

**Entregáveis:**
- Migração incremental dos donuts, barras e tabela DRE em `web/src/app/admin/page.tsx` para `analytics/caracterizacao/*`.
- Cada PR substitui no máximo um bloco visual e mantém os demais consumindo `sheet-metrics` até o próximo PR.
- Ao final: aba `perfil` 100% migrada; `/v1/admin/sheet-metrics` permanece ativo, mas desconectado da UI; documentado como deprecated com data prevista de remoção.

### Fase 3 — Perfil dos Alunos (substitui `indicadores-metrics`)

**Objetivo:** reconstruir a aba `alunos`.

**Entregáveis:**
- Campos derivados (faixa de beneficiários, faixa de abandono, `flag_risco_fluxo`) calculados em SQL na view `vw_censo_enriquecida` ou em uma nova `vw_censo_indicadores_escola` (versão mínima).
- Endpoint `GET /v1/admin/analytics/alunos/permanencia`.
- Aba `alunos` migrada; `/v1/admin/indicadores-metrics` deprecated.

### Fase 4 — Views normalizadas

**Objetivo:** habilitar gráficos multivalorados.

**Entregáveis:**
- `vw_censo_turnos`, `vw_censo_etapas`, `vw_censo_modalidades`, `vw_censo_ambientes` (uma linha por `school_id + item`).
- Endpoints `GET /v1/admin/analytics/caracterizacao/oferta-funcionamento` e `.../infraestrutura-educacional`.
- Nova seção na UI ou enriquecimento da aba `perfil`.

### Fase 5 — Indicadores derivados, faixas e flags

**Objetivo:** consolidar `vw_censo_indicadores_escola` com flags de risco e faixas.

**Entregáveis:**
- View `vw_censo_indicadores_escola` completa (uma linha por escola/ano, contendo `porte_escola`, faixas, flags de criticidade conforme seção 22 do guia de referência).
- Endpoint `GET /v1/admin/analytics/alertas` para alimentar uma futura aba de alertas.

### Fase 6 — Demais painéis temáticos

**Objetivo:** cobrir gestão, merenda, tecnologia, serviços terceirizados, infraestrutura/segurança.

**Entregáveis:**
- Views `vw_censo_direcao_escolar`, `vw_censo_coordenacao_area`, `vw_censo_quadro_pessoal`, `vw_censo_equipamentos_merenda`, `vw_censo_rh_merendeiras`, `vw_censo_rh_servicos_gerais`, `vw_censo_servicos_terceirizados`, `vw_censo_equipamentos_tecnologia`.
- Endpoints `/v1/admin/analytics/pessoal-gestao/*`, `/merenda/*`, `/tecnologia/*`, `/servicos-terceirizados/*`, `/infraestrutura/*`.
- Novas abas na página `/admin` consumindo esses endpoints.

### Fase 7 — Aposentadoria controlada da planilha como fonte analítica

**Objetivo:** remover oficialmente a dependência da planilha do painel.

**Entregáveis:**
- Remoção dos endpoints `sheet-metrics` e `indicadores-metrics` (somente após paridade validada em produção e período de observação acordado).
- A planilha continua recebendo dados via job (canal de auditoria/backup).
- O endpoint `GET /v1/locations` **não é removido** — segue sendo a fonte do formulário.

---

## 6. Endpoints analíticos sugeridos

Todos protegidos por `requireAdminAuth` (JWT). Todos aceitam, quando aplicável, os filtros padronizados via query string: `year`, `dre`, `municipio`, `zona`, `school_id`, `codigo_inep`, `porte_escola`, `status`.

```txt
GET /v1/admin/analytics/overview                                  (Fase 1)

GET /v1/admin/analytics/caracterizacao/perfil                     (Fase 2A)
GET /v1/admin/analytics/caracterizacao/dre                        (Fase 2A)
GET /v1/admin/analytics/caracterizacao/oferta-funcionamento       (Fase 4)
GET /v1/admin/analytics/caracterizacao/infraestrutura-educacional (Fase 4)

GET /v1/admin/analytics/alunos/permanencia                        (Fase 3)
GET /v1/admin/analytics/alunos/ideb                               (Fase 5/6)

GET /v1/admin/analytics/pessoal-gestao/estrutura                  (Fase 6)
GET /v1/admin/analytics/pessoal-gestao/coordenacao                (Fase 6)
GET /v1/admin/analytics/pessoal-gestao/quadro-pessoal             (Fase 6)

GET /v1/admin/analytics/infraestrutura/condicoes                  (Fase 6)
GET /v1/admin/analytics/infraestrutura/seguranca                  (Fase 6)

GET /v1/admin/analytics/merenda/oferta                            (Fase 6)
GET /v1/admin/analytics/merenda/equipamentos                      (Fase 6)
GET /v1/admin/analytics/merenda/recursos-humanos                  (Fase 6)

GET /v1/admin/analytics/tecnologia/infraestrutura                 (Fase 6)
GET /v1/admin/analytics/tecnologia/uso-pedagogico                 (Fase 6)

GET /v1/admin/analytics/servicos-terceirizados/visao-geral        (Fase 6)
GET /v1/admin/analytics/servicos-terceirizados/servicos-gerais    (Fase 6)
GET /v1/admin/analytics/servicos-terceirizados/portaria           (Fase 6)

GET /v1/admin/analytics/alertas                                   (Fase 5)
GET /v1/admin/analytics/escolas/{id}                              (Fase 6)
```

Os contratos de resposta seguem os padrões já definidos na seção 24 do guia (`KPI`, `Distribuição categórica`, `Série por categoria`, `Barra empilhada 100%`).

---

## 7. Views SQL iniciais sugeridas

### 7.1 `vw_censo_base` (Fase 1 — primeira a implementar)

```sql
CREATE OR REPLACE VIEW vw_censo_base AS
SELECT
    s.id              AS school_id,
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    s.zona,
    s.endereco,
    s.turnos,
    s.etapas_ofertadas,
    s.modalidades_ofertadas,

    cr.id             AS census_id,
    cr.year,
    cr.status,
    cr.created_at,
    cr.updated_at,
    cr.sheet_synced_at,

    -- Caracterização básica
    NULLIF(cr.data->>'tipo_predio', '')          AS tipo_predio,
    NULLIF(cr.data->>'possui_anexos', '')        AS possui_anexos,
    NULLIF(cr.data->>'situacao_estrutura', '')   AS situacao_estrutura,
    NULLIF(cr.data->>'muro_cerca', '')           AS muro_cerca,
    NULLIF(cr.data->>'perimetro_fechado', '')    AS perimetro_fechado,
    NULLIF(cr.data->>'rede_eletrica_atende', '') AS rede_eletrica_atende,
    NULLIF(cr.data->>'cameras_funcionamento', '') AS cameras_funcionamento,

    -- Quantitativos numéricos (saneados com NULLIF + cast seguro)
    NULLIF(cr.data->>'total_alunos', '')::numeric    AS total_alunos,
    NULLIF(cr.data->>'alunos_pcd', '')::numeric      AS alunos_pcd,
    NULLIF(cr.data->>'alunos_rural', '')::numeric    AS alunos_rural,
    NULLIF(cr.data->>'alunos_urbana', '')::numeric   AS alunos_urbana,
    NULLIF(cr.data->>'qtd_salas_aula', '')::numeric  AS qtd_salas_aula,
    NULLIF(cr.data->>'salas_climatizadas', '')::numeric AS salas_climatizadas,
    NULLIF(cr.data->>'turmas_manha', '')::numeric    AS turmas_manha,
    NULLIF(cr.data->>'turmas_tarde', '')::numeric    AS turmas_tarde,
    NULLIF(cr.data->>'turmas_noite', '')::numeric    AS turmas_noite,
    NULLIF(cr.data->>'turmas_integral', '')::numeric AS turmas_integral
FROM schools s
LEFT JOIN census_responses cr ON cr.school_id = s.id;
```

> **Atenção ao cast.** Se algum registro tiver string não-numérica nesses campos, o `::numeric` falha. Antes da migration, validar via `WHERE data->>'campo' !~ '^[0-9]+(\.[0-9]+)?$'` e tratar com `regexp_replace` ou marcação `NULL` explícita. A regra exata será confirmada na Fase 0.

### 7.2 `vw_censo_enriquecida` (Fase 2A)

Adiciona campos derivados (`porte_escola`, `porte_escola_cod`, `qtd_turmas_total`, `qtd_salas_nao_climatizadas`, `situacao_climatizacao_salas`) — ver guia, seção 7.

### 7.3 Views normalizadas (Fases 4–6)

`vw_censo_turnos`, `vw_censo_etapas`, `vw_censo_modalidades`, `vw_censo_ambientes`, `vw_censo_equipamentos_*`, `vw_censo_rh_*`, `vw_censo_direcao_escolar`, `vw_censo_coordenacao_area`, `vw_censo_quadro_pessoal`, `vw_censo_servicos_terceirizados`, `vw_censo_reprovacao_etapa`, `vw_censo_ideb_etapa` — todas seguindo os contratos definidos no guia (seções 8–21).

### 7.4 `vw_censo_indicadores_escola` (Fases 3 e 5)

Concentra flags, faixas e indicadores por escola — pode começar mínima na Fase 3 (só com `faixa_beneficiarios`, `faixa_abandono`, `flag_risco_fluxo`) e crescer nas fases seguintes (ver guia, seção 22).

---

## 8. Riscos técnicos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Chaves do JSONB inconsistentes (`null`, string vazia, strings com vírgula decimal, valores fora do enum) | Alta | Fase 0 obrigatória; `NULLIF + ::numeric` com fallback; conversões em SQL ou em uma camada de "saneamento" antes do cast. |
| Campos `schools.turnos/etapas/modalidades` em formato inconsistente (`TEXT` com JSON ou CSV) | Alta | Inspecionar amostras antes de criar `vw_censo_turnos`; criar função `parse_lista_serializada(text)` se preciso, ou padronizar gravação em PR separado. |
| Divergência de números entre PostgreSQL e Sheets | Média | Cada fase só "promove" a UI após paridade documentada. Manter os dois endpoints em paralelo. |
| Performance: views com muitos `->>` + cast podem ficar lentas em volume grande | Baixa hoje (≤ 800 escolas), Média no médio prazo | Começar com views simples; introduzir índices em `(status, year)` e `GIN (data jsonb_path_ops)` se necessário; considerar `MATERIALIZED VIEW` se o painel ficar lento. |
| `init.sql` é aplicado apenas em ambientes novos | Alta | Espelhar todas as views em `infra/migrations/*.sql` versionadas e aplicar via job de startup do `main.go` (já há precedente com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). |
| Quebra do formulário pelo `/locations` ser retirado por engano | Baixa | Documentar explicitamente que **`/locations` não está em escopo** desta refatoração. |
| Tipagem rígida no Go forçando migrações pesadas | Média | Usar `json.RawMessage` / `map[string]any` apenas na borda do endpoint; o SQL devolve tipos prontos. |
| Mudanças no schema do formulário invalidando colunas da view | Média | Versionar as views; toda nova chave deve ser refletida em uma migration explícita com revisão. |
| JWT secret default inseguro caso `ADMIN_JWT_SECRET` falte | Já existente | Sem novo risco. Mantém como está; flag em revisão de segurança separada. |

---

## 9. Critérios de aceite por fase

### Fase 0 — Inventário
- [x] Documento `docs/dashboard/jsonb-field-inventory.md` publicado.
- [x] Cobertura: 100% das chaves vistas em registros `completed` listadas e cruzadas com schemas Zod.
- [x] Lista explícita de divergências entre schema declarado e o JSONB real.

### Fase 1 — `vw_censo_base` + overview
- [ ] Migration `0001_vw_censo_base.sql` aplicada em dev sem erro e versionada em `infra/migrations/`.
- [ ] `SELECT COUNT(*) FROM vw_censo_base` = `(SELECT COUNT(*) FROM schools) - schools_sem_censo + schools_com_censo` — explicitar a relação esperada.
- [ ] Endpoint `GET /v1/admin/analytics/overview` retorna 200 com payload contendo: `total_schools`, `total_censuses`, `completed`, `drafts`, `total_alunos`, `alunos_pcd`, `media_alunos_por_escola`, `por_zona[]`.
- [ ] Os cards principais da aba `perfil` (ou `operacional`) da página `/admin` consomem o novo endpoint.
- [ ] Os mesmos cards na planilha (`sheet-metrics`) ainda funcionam e batem com os novos números (margem ≤ 1% por arredondamento).
- [ ] PR pequeno (idealmente ≤ 400 linhas líquidas), reversível, sem mexer em `CreateOrUpdateCenso`, `SheetsService` nem no job de retry.

### Fase 1B — Critérios de contagem e qualidade dos dados
- [ ] Documento `docs/dashboard/criterios-contagem-e-qualidade-dados.md` publicado.
- [ ] Distinção `school_id` × `codigo_inep` × `census_id` × `status` documentada com exemplos.
- [ ] Queries de diagnóstico (INEP repetido, possíveis duplicidades, escolas sem censo, contagens por `status`) registradas e reproduzíveis.
- [ ] Decisão registrada de **não** aplicar deduplicação automática nesta fase.
- [ ] Lista de divergências conhecidas (PostgreSQL × Sheets) com hipótese de causa.
- [ ] `docs/dashboard/validacao-fase-1.md` aponta para o novo documento como referência sobre divergências aceitas.

### Fase 2A — Backend analítico da Caracterização da Rede
- [ ] Migration `0002_vw_censo_enriquecida.sql` aplicada (idempotente, espelhada em `infra/init.sql` quando aplicável).
- [ ] Endpoint `GET /v1/admin/analytics/caracterizacao/perfil` retorna 200 com KPIs + donuts + barras por porte.
- [ ] Endpoint `GET /v1/admin/analytics/caracterizacao/dre` retorna 200 com a tabela detalhada por DRE.
- [ ] Endpoints respeitam a semântica de contagem do documento de critérios (Fase 1B).
- [ ] Documento `docs/dashboard/validacao-fase-2.md` criado com tabela de paridade endpoint × `sheet-metrics`.
- [ ] UI da aba `perfil` **ainda não migrada** (isso é Fase 2B).
- [ ] `sheet-metrics`, `indicadores-metrics`, job de sync e `/v1/locations` intactos.

### Fase 2B — Migração incremental da UI da Caracterização da Rede
- [ ] Aba `perfil` 100% migrada para endpoints `analytics/caracterizacao/*`, em PRs incrementais (uma seção por vez).
- [ ] Tabela "Detalhamento por DRE" reproduz os mesmos totais que a versão atual (Sheets) escola a escola, conforme critérios da Fase 1B.
- [ ] `sheet-metrics` rotulado como deprecated em código (comentário) e em changelog interno.

### Fase 3 — Perfil dos Alunos
- [ ] Aba `alunos` 100% migrada.
- [ ] `flag_risco_fluxo` calculada no SQL com regra documentada no header da view.
- [ ] Paridade ≤ 2% contra `indicadores-metrics` (margem maior porque `Indicadores_Flags` usa arredondamentos próprios).

### Fase 4 — Views normalizadas
- [ ] Views `vw_censo_turnos`, `_etapas`, `_modalidades`, `_ambientes` criadas e documentadas (cabeçalho com finalidade, fontes, granularidade).
- [ ] Para cada view: total de linhas, total de escolas distintas e top 5 por valor batem com inspeção manual em 3 escolas aleatórias.

### Fase 5 — Indicadores derivados
- [ ] `vw_censo_indicadores_escola` cobre todos os campos da seção 22 do guia que dependem só do que já está no JSONB.
- [ ] Endpoint `/analytics/alertas` retorna lista de escolas em risco com pelo menos uma flag ativa.

### Fase 6 — Painéis temáticos
- [ ] Cada subgrupo de views temáticas entra junto com a aba/seção da UI que o consome.
- [ ] Documentação por view atualizada em `docs/dashboard/views.md` (a criar nesta fase).

### Fase 7 — Aposentadoria
- [ ] Nenhuma chamada ao endpoint de planilha no código da página `/admin`.
- [ ] `sheet-metrics` e `indicadores-metrics` removidos do roteamento.
- [ ] Job de sync segue ativo (planilha como espelho de auditoria).
- [ ] `/v1/locations` continua intacto.

---

## 10. Não-objetivos (esta refatoração não vai)

- Alterar o formulário Next.js.
- Mudar o schema de gravação de `census_responses.data` (não vamos quebrar payloads existentes).
- Remover a sincronização com Google Sheets.
- Refatorar a página `/admin` enquanto ainda não houver endpoint analítico próprio para a aba alvo.
- Reescrever os modelos Go ou trocar `database/sql` por ORM.
- Resolver questões de segurança não relacionadas (ex.: JWT secret default), que ficam em trilhas independentes.

---

## 11. Referências internas

- [api/cmd/api/main.go](../api/cmd/api/main.go) — wiring de rotas e job de retry.
- [api/cmd/api/admin.go](../api/cmd/api/admin.go) — endpoints admin e auth.
- [api/cmd/api/handlers.go](../api/cmd/api/handlers.go) — endpoints públicos e fluxo `POST /census`.
- [api/internal/models/models.go](../api/internal/models/models.go) — `School`, `CensusResponse`, `Upsert`, `GetPendingSheetSync`.
- [api/internal/services/sheets.go](../api/internal/services/sheets.go) — `GetSheetMetrics`, `GetIndicadoresMetrics`, `AppendCenso`.
- [infra/init.sql](../infra/init.sql) — schema atual.
- [web/src/app/admin/page.tsx](../web/src/app/admin/page.tsx) — UI do painel.
- [web/src/schemas/steps/](../web/src/schemas/steps/) — contratos Zod do formulário (fonte oficial dos nomes de campos JSONB).
- [docs/guia_views_analiticas_baseado_repositorio_censo.md](guia_views_analiticas_baseado_repositorio_censo.md) — referência metodológica detalhada.
