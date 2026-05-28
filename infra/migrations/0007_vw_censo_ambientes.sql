-- 0007 vw_censo_ambientes
-- Long form: 1 linha por (school_id, year, ambiente).
-- ambientes é array de strings no JSONB — escolas sem a chave não aparecem.

CREATE OR REPLACE VIEW vw_censo_ambientes AS
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
    amb.value AS ambiente
FROM vw_censo_base b
INNER JOIN census_responses cr
        ON cr.id = b.census_id
       AND cr.data ? 'ambientes'
       AND jsonb_typeof(cr.data->'ambientes') = 'array'
CROSS JOIN LATERAL jsonb_array_elements_text(cr.data->'ambientes') AS amb(value)
WHERE amb.value IS NOT NULL
  AND amb.value <> '';
