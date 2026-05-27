-- 0003_vw_censo_direcao_escolar.sql
-- Finalidade: Normalizar a presença de cargos de gestão escolar (direção, vice, secretário, coordenação pedagógica).
-- Fonte: vw_censo_base e census_responses.data (JSONB)
-- Granularidade: Uma linha por escola/ano/cargo (school_id + year + cargo).
CREATE OR REPLACE VIEW vw_censo_direcao_escolar AS
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
    v.cargo,
    v.possui,
    v.ordem
FROM censo_data cd
CROSS JOIN LATERAL (
    VALUES
        ('Direção Escolar',             lower(cd.data->>'possui_direcao') IN ('sim', 'true', 't', '1'), 1),
        ('Vice-Diretor Pedagógico',     lower(cd.data->>'possui_vice_pedagogico') IN ('sim', 'true', 't', '1'), 2),
        ('Vice-Diretor Administrativo', lower(cd.data->>'possui_vice_administrativo') IN ('sim', 'true', 't', '1'), 3),
        ('Secretário Escolar',          lower(cd.data->>'possui_secretario') IN ('sim', 'true', 't', '1'), 4),
        ('Coordenação Pedagógica',      lower(cd.data->>'possui_coord_pedagogico') IN ('sim', 'true', 't', '1'), 5)
) AS v(cargo, possui, ordem);