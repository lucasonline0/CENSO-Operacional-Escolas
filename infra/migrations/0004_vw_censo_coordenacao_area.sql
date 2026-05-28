-- 0004_vw_censo_coordenacao_area.sql
-- Finalidade: Normalizar a presença de coordenadores por área curricular.
-- Fonte: vw_censo_base e census_responses.data (JSONB)
-- Granularidade: Uma linha por escola/ano/área (formato Long para facilitar agregações).
-- Tratamento de NULL: Campos booleanos usam fallback para FALSE se nulos.
-- Tratamento booleano: Tolera 'sim', 'true', 't', '1' (case-insensitive).

CREATE OR REPLACE VIEW vw_censo_coordenacao_area AS
WITH censo_data AS (
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
        cr.data
    FROM vw_censo_base b
    JOIN census_responses cr ON cr.id = b.census_id
)
SELECT
    cd.school_id,
    cd.codigo_inep,
    cd.nome_escola,
    cd.dre,
    cd.municipio,
    cd.zona,
    cd.year,
    cd.status,
    cd.census_id,
    v.area,
    v.possui,
    v.ordem
FROM censo_data cd
CROSS JOIN LATERAL (
    VALUES
        ('Linguagens',         lower(cd.data->>'possui_coord_area_linguagem') IN ('sim', 'true', 't', '1'), 1),
        ('Matemática',         lower(cd.data->>'possui_coord_area_matematica') IN ('sim', 'true', 't', '1'), 2),
        ('Ciências Humanas',   lower(cd.data->>'possui_coord_area_humanas') IN ('sim', 'true', 't', '1'), 3),
        ('Ciências da Natureza', lower(cd.data->>'possui_coord_area_natureza') IN ('sim', 'true', 't', '1'), 4)
) AS v(area, possui, ordem);