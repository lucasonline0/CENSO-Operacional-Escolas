-- 0009 vw_censo_equipamentos_merenda
-- 1 linha por (school_id, year). Campos de cozinha e equipamentos do Step 5.
-- estados_* normalizados com lower() — valores chegam como "Bom"/"BOM"/"bom".

CREATE OR REPLACE VIEW vw_censo_equipamentos_merenda AS
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

    NULLIF(cr.data->>'condicoes_cozinha',   '')  AS condicoes_cozinha,
    NULLIF(cr.data->>'tamanho_cozinha',     '')  AS tamanho_cozinha,
    NULLIF(cr.data->>'possui_refeitorio',   '')  AS possui_refeitorio,
    NULLIF(cr.data->>'refeitorio_adequado', '')  AS refeitorio_adequado,
    NULLIF(cr.data->>'possui_balanca',      '')  AS possui_balanca,
    NULLIF(cr.data->>'bancadas_inox',       '')  AS bancadas_inox,
    NULLIF(cr.data->>'sistema_exaustao',    '')  AS sistema_exaustao,
    NULLIF(cr.data->>'despensa_exclusiva',  '')  AS despensa_exclusiva,
    NULLIF(cr.data->>'deposito_conserva',   '')  AS deposito_conserva,
    NULLIF(cr.data->>'estoque_epi_extintor','')  AS estoque_epi_extintor,
    NULLIF(cr.data->>'manutencao_extintores','') AS manutencao_extintores,

    CASE WHEN cr.data->>'qtd_freezers' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_freezers')::numeric END    AS qtd_freezers,
    lower(NULLIF(cr.data->>'estado_freezers',   ''))     AS estado_freezers,

    CASE WHEN cr.data->>'qtd_geladeiras' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_geladeiras')::numeric END  AS qtd_geladeiras,
    lower(NULLIF(cr.data->>'estado_geladeiras', ''))     AS estado_geladeiras,

    CASE WHEN cr.data->>'qtd_fogoes' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_fogoes')::numeric END      AS qtd_fogoes,
    lower(NULLIF(cr.data->>'estado_fogoes',     ''))     AS estado_fogoes,

    CASE WHEN cr.data->>'qtd_fornos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_fornos')::numeric END      AS qtd_fornos,
    lower(NULLIF(cr.data->>'estado_fornos',     ''))     AS estado_fornos,

    CASE WHEN cr.data->>'qtd_bebedouros' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_bebedouros')::numeric END  AS qtd_bebedouros,
    lower(NULLIF(cr.data->>'estado_bebedouros', ''))     AS estado_bebedouros

FROM vw_censo_base b
LEFT JOIN census_responses cr ON cr.id = b.census_id;
