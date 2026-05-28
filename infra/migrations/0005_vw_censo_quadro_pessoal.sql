-- 0005_vw_censo_quadro_pessoal.sql
-- Finalidade: Normalizar quantitativos do quadro de pessoal docente e administrativo.
-- Fonte: vw_censo_base e census_responses.data (JSONB)
-- Granularidade: Uma linha por escola/ano (school_id + year).
-- Tratamento de NULL: Campos numéricos usam fallback para 0 se nulos ou não-numéricos.
-- Casting seguro: Segue padrão `CASE WHEN data->>'campo' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ::numeric ELSE 0 END`.

CREATE OR REPLACE VIEW vw_censo_quadro_pessoal AS
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
    CASE WHEN cr.data->>'qtd_professores_efetivos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_professores_efetivos')::numeric
         ELSE 0 END AS qtd_professores_efetivos,
    CASE WHEN cr.data->>'qtd_professores_temporarios' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_professores_temporarios')::numeric
         ELSE 0 END AS qtd_professores_temporarios,
    CASE WHEN cr.data->>'qtd_servidores_administrativos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_servidores_administrativos')::numeric
         ELSE 0 END AS qtd_servidores_administrativos,
    CASE WHEN cr.data->>'qtd_professor_readaptado' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_professor_readaptado')::numeric
         ELSE 0 END AS qtd_professor_readaptado,
    (CASE WHEN cr.data->>'qtd_professores_efetivos' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (cr.data->>'qtd_professores_efetivos')::numeric
           ELSE 0 END +
     CASE WHEN cr.data->>'qtd_professores_temporarios' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (cr.data->>'qtd_professores_temporarios')::numeric
           ELSE 0 END)::numeric AS total_professores
FROM vw_censo_base b
JOIN census_responses cr ON cr.id = b.census_id;