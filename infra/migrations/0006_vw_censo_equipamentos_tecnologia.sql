-- 0006_vw_censo_equipamentos_tecnologia.sql
-- Finalidade: Consolidar indicadores de conectividade e parque tecnológico das escolas.
-- Fonte: vw_censo_base e census_responses.data (JSONB)
-- Granularidade: Uma linha por escola/ano (school_id + year).
-- Tratamento de NULL:
--   Booleanos (internet_disponivel, possui_projetor, possui_lousa_digital):
--     TRUE quando lower(valor) IN ('sim','true','t','1'), FALSE caso contrário.
--   Numéricos: CASE seguro → NULL se não-numérico (não força 0, para distinguir "não informado" de zero).
--   Categóricos (provedor, qualidade, computadores_atendem): NULLIF('','') → NULL se vazio.

CREATE OR REPLACE VIEW vw_censo_equipamentos_tecnologia AS
SELECT
    b.school_id,
    b.codigo_inep,
    b.nome_escola,
    b.dre,
    b.municipio,
    b.zona,
    b.year,
    b.status,
    b.census_id,

    -- Conectividade
    lower(cr.data->>'internet_disponivel') IN ('sim', 'true', 't', '1')
        AS internet_disponivel,
    NULLIF(cr.data->>'provedor_internet', '')
        AS provedor_internet,
    NULLIF(cr.data->>'qualidade_internet', '')
        AS qualidade_internet,

    -- Parque de computadores
    CASE WHEN cr.data->>'qtd_desktop_adm' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_desktop_adm')::numeric END AS qtd_desktop_adm,
    CASE WHEN cr.data->>'qtd_desktop_alunos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_desktop_alunos')::numeric END AS qtd_desktop_alunos,
    CASE WHEN cr.data->>'qtd_notebooks' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_notebooks')::numeric END AS qtd_notebooks,
    CASE WHEN cr.data->>'qtd_chromebooks' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_chromebooks')::numeric END AS qtd_chromebooks,
    CASE WHEN cr.data->>'qtd_computadores_inoperantes' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_computadores_inoperantes')::numeric END AS qtd_computadores_inoperantes,
    NULLIF(cr.data->>'computadores_atendem', '')
        AS computadores_atendem,

    -- Recursos pedagógicos
    lower(cr.data->>'possui_projetor') IN ('sim', 'true', 't', '1')
        AS possui_projetor,
    CASE WHEN cr.data->>'qtd_projetores' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_projetores')::numeric END AS qtd_projetores,
    lower(cr.data->>'possui_lousa_digital') IN ('sim', 'true', 't', '1')
        AS possui_lousa_digital

FROM vw_censo_base b
JOIN census_responses cr ON cr.id = b.census_id;
