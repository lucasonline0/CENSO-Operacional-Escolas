-- 0011 vw_censo_rh_servicos_gerais
-- 1 linha por (school_id, year). RH de serviços gerais do Step 6.

CREATE OR REPLACE VIEW vw_censo_rh_servicos_gerais AS
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

    CASE WHEN cr.data->>'qtd_servicos_gerais_efetivo' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_servicos_gerais_efetivo')::numeric END      AS qtd_servicos_gerais_efetivo,
    CASE WHEN cr.data->>'qtd_servicos_gerais_temporario' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_servicos_gerais_temporario')::numeric END   AS qtd_servicos_gerais_temporario,
    CASE WHEN cr.data->>'qtd_servicos_gerais_terceirizado' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_servicos_gerais_terceirizado')::numeric END AS qtd_servicos_gerais_terceirizado,

    NULLIF(cr.data->>'qtd_atende_necessidade_sg',  '')  AS qtd_atende_necessidade_sg,
    CASE WHEN cr.data->>'quantitativo_necessario_sg' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'quantitativo_necessario_sg')::numeric END AS quantitativo_necessario_sg,

    NULLIF(cr.data->>'empresa_terceirizada_sg', '')  AS empresa_terceirizada_sg,
    NULLIF(cr.data->>'possui_supervisor_sg',    '')  AS possui_supervisor_sg

FROM vw_censo_base b
LEFT JOIN census_responses cr ON cr.id = b.census_id;
