-- 0008 vw_censo_infraestrutura_seguranca
-- 1 linha por (school_id, year). Campos de prédio/segurança do Steps 2, 8 e 9.
-- Enums (Sim/Não) mantidos como text; normalização feita nos endpoints.

CREATE OR REPLACE VIEW vw_censo_infraestrutura_seguranca AS
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

    b.tipo_predio,
    b.situacao_estrutura,
    b.possui_anexos,
    CASE WHEN cr.data->>'qtd_anexos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_anexos')::numeric END              AS qtd_anexos,
    NULLIF(cr.data->>'tipo_predio_anexo',          '')           AS tipo_predio_anexo,

    b.muro_cerca,
    b.perimetro_fechado,

    NULLIF(cr.data->>'quadra_coberta',             '')           AS quadra_coberta,
    CASE WHEN cr.data->>'qtd_quadras' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_quadras')::numeric END             AS qtd_quadras,
    NULLIF(cr.data->>'banda_fanfarra',             '')           AS banda_fanfarra,

    CASE WHEN cr.data->>'banheiros_alunos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'banheiros_alunos')::numeric END        AS banheiros_alunos,
    CASE WHEN cr.data->>'banheiros_prof' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'banheiros_prof')::numeric END          AS banheiros_prof,
    CASE WHEN cr.data->>'banheiros_chuveiro' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'banheiros_chuveiro')::numeric END      AS banheiros_chuveiro,
    NULLIF(cr.data->>'banheiros_vasos_funcionais', '')           AS banheiros_vasos_funcionais,

    NULLIF(cr.data->>'energia',                    '')           AS energia,
    b.rede_eletrica_atende,
    NULLIF(cr.data->>'estrutura_climatizacao',     '')           AS estrutura_climatizacao,
    NULLIF(cr.data->>'suporta_novos_equipamentos', '')           AS suporta_novos_equipamentos,

    b.cameras_funcionamento,
    NULLIF(cr.data->>'cameras_cobrem',             '')           AS cameras_cobrem,

    NULLIF(cr.data->>'possui_guarita',             '')           AS possui_guarita,
    NULLIF(cr.data->>'controle_portao',            '')           AS controle_portao,
    NULLIF(cr.data->>'iluminacao_externa',         '')           AS iluminacao_externa,
    NULLIF(cr.data->>'possui_botao_panico',        '')           AS possui_botao_panico,

    NULLIF(cr.data->>'plano_evacuacao',            '')           AS plano_evacuacao,
    NULLIF(cr.data->>'politica_bullying',          '')           AS politica_bullying

FROM vw_censo_base b
LEFT JOIN census_responses cr ON cr.id = b.census_id;
