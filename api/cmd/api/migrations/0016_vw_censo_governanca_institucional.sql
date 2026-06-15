-- =====================================================================
-- Migration 0016 — vw_censo_governanca_institucional
-- =====================================================================
-- Governança Institucional (aba "Gestão Financeira e Governança", PR 1).
-- Fonte: census_responses.data (JSONB) + schools, somente respostas
-- concluídas (status = 'completed').
--
-- Campos do Censo (etapa "Gestão, Participação e Política"):
--   regularizada_cee  → 'Sim' / 'Não'
--   conselho_escolar  → 'Sim' / 'Não'
--   conselho_ativo    → 'Sim' / 'Parcialmente' / 'Não'  (condicional:
--                       só preenchido quando conselho_escolar = 'Sim')
--
-- Regra metodológica (docs/dashboard/governanca-institucional-financeira.md):
--   "Não informado"/vazio NUNCA vira "Não" — permanece NULL. Por isso os
--   campos textuais usam NULLIF(...,'') e os booleanos comparam contra 'Sim'
--   / 'Não' / 'Parcialmente'; quando o valor é NULL, o booleano resultante é
--   NULL (ausência de informação), nunca FALSE.
--
-- Aplicação idempotente: CREATE OR REPLACE VIEW. Replicada em
-- infra/init.sql e na cópia api/cmd/api/migrations/0016_*.sql (idênticas).
-- =====================================================================

CREATE OR REPLACE VIEW vw_censo_governanca_institucional AS
WITH base AS (
    SELECT
        cr.id                                       AS census_id,
        s.id                                        AS school_id,
        s.codigo_inep,
        s.nome_escola                               AS escola,
        s.dre,
        s.municipio,
        s.zona,
        NULLIF(cr.data->>'regularizada_cee', '')    AS regularizada_cee,
        NULLIF(cr.data->>'conselho_escolar', '')    AS conselho_escolar,
        NULLIF(cr.data->>'conselho_ativo', '')      AS conselho_ativo
    FROM census_responses cr
    JOIN schools s ON s.id = cr.school_id
    WHERE cr.status = 'completed'
)
SELECT
    census_id,
    school_id,
    codigo_inep,
    escola,
    dre,
    municipio,
    zona,
    regularizada_cee,
    conselho_escolar,
    conselho_ativo,
    -- Booleanos: NULL quando o campo é "Não informado" (não vira FALSE).
    (regularizada_cee = 'Sim')        AS is_regularizada_cee,
    (conselho_escolar = 'Sim')        AS has_conselho_escolar,
    (conselho_ativo = 'Sim')          AS is_conselho_ativo,
    (conselho_ativo = 'Parcialmente') AS is_conselho_parcialmente_ativo,
    -- Governança completa: os três quesitos = 'Sim'. NULL em qualquer campo
    -- propaga NULL (não conta como completa nem como crítica).
    (regularizada_cee = 'Sim'
     AND conselho_escolar = 'Sim'
     AND conselho_ativo = 'Sim')      AS is_governanca_completa,
    -- Governança crítica: pelo menos um quesito = 'Não'. Como o OR com TRUE
    -- curto-circuita, basta um 'Não' para resultar TRUE; valores NULL não
    -- forçam crítica (Não informado não vira Não).
    (regularizada_cee = 'Não'
     OR conselho_escolar = 'Não'
     OR conselho_ativo = 'Não')       AS is_governanca_critica
FROM base;
