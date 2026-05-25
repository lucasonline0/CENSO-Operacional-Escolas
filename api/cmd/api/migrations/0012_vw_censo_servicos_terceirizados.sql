-- 0012 vw_censo_servicos_terceirizados
-- 1 linha por (school_id, year). Consolida portaria (Step 7), flags de
-- terceirização por área e avaliações dos serviços (Step 10).

CREATE OR REPLACE VIEW vw_censo_servicos_terceirizados AS
SELECT
    b.school_id,
    b.codigo_inep,
    b.nome_escola,
    b.dre,
    b.municipio,
    b.zona,
    b.census_id,
    b.year,
    b.status,

    -- Portaria
    CASE WHEN cr.data->>'qtd_agentes_portaria' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_agentes_portaria')::numeric END  AS qtd_agentes_portaria,
    NULLIF(cr.data->>'qtd_atende_necessidade_portaria', '')    AS qtd_atende_necessidade_portaria,
    CASE WHEN cr.data->>'quantitativo_necessario_portaria' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'quantitativo_necessario_portaria')::numeric END AS quantitativo_necessario_portaria,
    NULLIF(cr.data->>'empresa_terceirizada_portaria', '')      AS empresa_terceirizada_portaria,
    NULLIF(cr.data->>'possui_supervisor_portaria',    '')      AS possui_supervisor_portaria,

    -- Flags de terceirização por área (presença de empresa terceirizada)
    NULLIF(cr.data->>'empresa_terceirizada_merenda',  '')      AS empresa_terceirizada_merenda,
    NULLIF(cr.data->>'empresa_terceirizada_sg',       '')      AS empresa_terceirizada_sg,

    -- Avaliações dos serviços terceirizados
    NULLIF(cr.data->>'avaliacao_merendeiras',  '')  AS avaliacao_merendeiras,
    NULLIF(cr.data->>'avaliacao_portaria',     '')  AS avaliacao_portaria,
    NULLIF(cr.data->>'avaliacao_limpeza',      '')  AS avaliacao_limpeza,
    NULLIF(cr.data->>'avaliacao_comunicacao',  '')  AS avaliacao_comunicacao,
    NULLIF(cr.data->>'avaliacao_supervisao',   '')  AS avaliacao_supervisao

FROM vw_censo_base b
LEFT JOIN census_responses cr ON cr.id = b.census_id;
