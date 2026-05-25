-- 0010 vw_censo_rh_merendeiras
-- 1 linha por (school_id, year). RH de merendeiras + oferta de merenda do Step 5.

CREATE OR REPLACE VIEW vw_censo_rh_merendeiras AS
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

    NULLIF(cr.data->>'oferta_regular',      '')  AS oferta_regular,
    NULLIF(cr.data->>'qualidade_merenda',   '')  AS qualidade_merenda,
    NULLIF(cr.data->>'atende_necessidades', '')  AS atende_necessidades,

    CASE WHEN cr.data->>'qtd_merendeiras_estatutaria' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_merendeiras_estatutaria')::numeric END  AS qtd_merendeiras_estatutaria,
    CASE WHEN cr.data->>'qtd_merendeiras_terceirizada' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_merendeiras_terceirizada')::numeric END AS qtd_merendeiras_terceirizada,
    CASE WHEN cr.data->>'qtd_merendeiras_temporaria' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_merendeiras_temporaria')::numeric END   AS qtd_merendeiras_temporaria,

    NULLIF(cr.data->>'qtd_atende_necessidade_merenda',  '')  AS qtd_atende_necessidade_merenda,
    CASE WHEN cr.data->>'quantitativo_necessario_merenda' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'quantitativo_necessario_merenda')::numeric END AS quantitativo_necessario_merenda,

    NULLIF(cr.data->>'empresa_terceirizada_merenda', '')  AS empresa_terceirizada_merenda,
    NULLIF(cr.data->>'possui_supervisor_merenda',    '')  AS possui_supervisor_merenda

FROM vw_censo_base b
LEFT JOIN census_responses cr ON cr.id = b.census_id;
