-- =====================================================================
-- Migration 0001 — vw_censo_base
-- =====================================================================
-- Fase 1 do roadmap do dashboard analítico próprio.
-- Cria a primeira view fundacional, com 1 linha por (school_id, year)
-- ou por escola sem censo (LEFT JOIN), expondo as colunas tabulares de
-- "schools" + os campos básicos extraídos do JSONB em
-- "census_responses.data".
--
-- Casts numéricos são protegidos por regex para tolerar:
--   - chave ausente             (data ? 'campo' = false)
--   - valor null no JSON        (data->>'campo' IS NULL)
--   - string vazia              (data->>'campo' = '')
--   - valor não-numérico        (qualquer string que não case com regex)
--
-- Em todos esses casos o resultado é NULL — nunca quebra.
--
-- Aplicação idempotente:
--   - CREATE OR REPLACE VIEW garante reexecução segura.
--   - O loader em api/cmd/api/main.go aplica este arquivo no startup.
--   - Também é replicado em infra/init.sql para ambientes novos.
-- =====================================================================

CREATE OR REPLACE VIEW vw_censo_base AS
SELECT
    -- Identificação (schools) ------------------------------------------
    s.id                                                AS school_id,
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    s.zona,

    -- Operacional (census_responses) -----------------------------------
    cr.id                                               AS census_id,
    cr.year,
    cr.status,
    cr.created_at,
    cr.updated_at,
    cr.sheet_synced_at,

    -- Quantitativos numéricos extraídos com cast seguro ----------------
    CASE WHEN cr.data->>'total_alunos'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'total_alunos')::numeric       END AS total_alunos,
    CASE WHEN cr.data->>'alunos_pcd'         ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'alunos_pcd')::numeric         END AS alunos_pcd,
    CASE WHEN cr.data->>'alunos_rural'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'alunos_rural')::numeric       END AS alunos_rural,
    CASE WHEN cr.data->>'alunos_urbana'      ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'alunos_urbana')::numeric      END AS alunos_urbana,
    CASE WHEN cr.data->>'qtd_salas_aula'     ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_salas_aula')::numeric     END AS qtd_salas_aula,
    CASE WHEN cr.data->>'salas_climatizadas' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'salas_climatizadas')::numeric END AS salas_climatizadas,
    CASE WHEN cr.data->>'turmas_manha'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_manha')::numeric       END AS turmas_manha,
    CASE WHEN cr.data->>'turmas_tarde'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_tarde')::numeric       END AS turmas_tarde,
    CASE WHEN cr.data->>'turmas_noite'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_noite')::numeric       END AS turmas_noite,
    CASE WHEN cr.data->>'turmas_integral'    ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_integral')::numeric    END AS turmas_integral,

    -- Categóricos básicos (string vazia ⇒ NULL) ------------------------
    NULLIF(cr.data->>'tipo_predio',           '')       AS tipo_predio,
    NULLIF(cr.data->>'possui_anexos',         '')       AS possui_anexos,
    NULLIF(cr.data->>'situacao_estrutura',    '')       AS situacao_estrutura,
    NULLIF(cr.data->>'muro_cerca',            '')       AS muro_cerca,
    NULLIF(cr.data->>'perimetro_fechado',     '')       AS perimetro_fechado,
    NULLIF(cr.data->>'rede_eletrica_atende',  '')       AS rede_eletrica_atende,
    NULLIF(cr.data->>'cameras_funcionamento', '')       AS cameras_funcionamento
FROM schools s
LEFT JOIN census_responses cr ON cr.school_id = s.id;
