-- Tabela de Escolas (Identificação e Dados Fixos)
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    nome_escola VARCHAR(255),
    codigo_inep VARCHAR(20) UNIQUE,
    municipio VARCHAR(100),
    dre VARCHAR(100),
    zona VARCHAR(50),
    endereco TEXT,
    
    -- Campos de Contato e Direção
    cnpj VARCHAR(30),
    telefone VARCHAR(50),
    email VARCHAR(150),
    cep VARCHAR(20),
    nome_diretor VARCHAR(150),
    matricula_diretor VARCHAR(50),
    contato_diretor VARCHAR(50),
    
    -- Campos JSON Armazenados como Texto (Arrays)
    turnos TEXT,
    etapas_ofertadas TEXT,
    modalidades_ofertadas TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Respostas do Censo (Dados Variáveis)
CREATE TABLE IF NOT EXISTS census_responses (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL,
    year INT NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    data JSONB, -- Onde ficam todas as respostas do formulário
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_school
      FOREIGN KEY(school_id) 
      REFERENCES schools(id)
      ON DELETE CASCADE,
      
    sheet_synced_at TIMESTAMP DEFAULT NULL,

    CONSTRAINT unique_school_year
      UNIQUE (school_id, year)
);

-- =====================================================================
-- Camada analítica — Fase 1 (espelho de infra/migrations/0001_vw_censo_base.sql)
-- =====================================================================
-- View base do dashboard analítico próprio. 1 linha por escola (LEFT JOIN
-- com census_responses). Casts numéricos protegidos por regex para
-- tolerar valores ausentes/vazios/não-numéricos em data JSONB.
-- Para detalhes, ver docs/roadmap-dashboard-proprio.md e
-- docs/dashboard/jsonb-field-inventory.md.
-- =====================================================================

CREATE OR REPLACE VIEW vw_censo_base AS
SELECT
    s.id                                                AS school_id,
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    s.zona,

    cr.id                                               AS census_id,
    cr.year,
    cr.status,
    cr.created_at,
    cr.updated_at,
    cr.sheet_synced_at,

    CASE WHEN cr.data->>'total_alunos'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'total_alunos')::numeric       END AS total_alunos,
    CASE WHEN cr.data->>'alunos_pcd'         ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'alunos_pcd')::numeric         END AS alunos_pcd,
    CASE WHEN cr.data->>'alunos_rural'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'alunos_rural')::numeric       END AS alunos_rural,
    CASE WHEN cr.data->>'alunos_urbana'      ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'alunos_urbana')::numeric      END AS alunos_urbana,
    CASE WHEN cr.data->>'qtd_salas_aula'     ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_salas_aula')::numeric     END AS qtd_salas_aula,
    CASE WHEN cr.data->>'salas_climatizadas' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'salas_climatizadas')::numeric END AS salas_climatizadas,
    CASE WHEN cr.data->>'turmas_manha'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_manha')::numeric       END AS turmas_manha,
    CASE WHEN cr.data->>'turmas_tarde'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_tarde')::numeric       END AS turmas_tarde,
    CASE WHEN cr.data->>'turmas_noite'       ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_noite')::numeric       END AS turmas_noite,
    CASE WHEN cr.data->>'turmas_integral'    ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'turmas_integral')::numeric    END AS turmas_integral,

    NULLIF(cr.data->>'tipo_predio',           '')       AS tipo_predio,
    NULLIF(cr.data->>'possui_anexos',         '')       AS possui_anexos,
    NULLIF(cr.data->>'situacao_estrutura',    '')       AS situacao_estrutura,
    NULLIF(cr.data->>'muro_cerca',            '')       AS muro_cerca,
    NULLIF(cr.data->>'perimetro_fechado',     '')       AS perimetro_fechado,
    NULLIF(cr.data->>'rede_eletrica_atende',  '')       AS rede_eletrica_atende,
    NULLIF(cr.data->>'cameras_funcionamento', '')       AS cameras_funcionamento
FROM schools s
LEFT JOIN census_responses cr ON cr.school_id = s.id;

-- Frente 2 / 0007 — espelho de infra/migrations/0007_vw_censo_ambientes.sql

CREATE OR REPLACE VIEW vw_censo_ambientes AS
SELECT
    b.school_id, b.codigo_inep, b.nome_escola, b.dre, b.municipio, b.zona,
    b.census_id, b.year, b.status,
    amb.value AS ambiente
FROM vw_censo_base b
INNER JOIN census_responses cr
        ON cr.id = b.census_id
       AND cr.data ? 'ambientes'
       AND jsonb_typeof(cr.data->'ambientes') = 'array'
CROSS JOIN LATERAL jsonb_array_elements_text(cr.data->'ambientes') AS amb(value)
WHERE amb.value IS NOT NULL AND amb.value <> '';

-- Frente 2 / 0008 — espelho de infra/migrations/0008_vw_censo_infraestrutura_seguranca.sql

CREATE OR REPLACE VIEW vw_censo_infraestrutura_seguranca AS
SELECT
    b.school_id, b.codigo_inep, b.nome_escola, b.dre, b.municipio, b.zona,
    b.census_id, b.year, b.status,
    b.tipo_predio, b.situacao_estrutura, b.possui_anexos,
    CASE WHEN cr.data->>'qtd_anexos' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_anexos')::numeric END              AS qtd_anexos,
    NULLIF(cr.data->>'tipo_predio_anexo',          '')           AS tipo_predio_anexo,
    b.muro_cerca, b.perimetro_fechado,
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

-- Frente 2 / 0009 — espelho de infra/migrations/0009_vw_censo_equipamentos_merenda.sql

CREATE OR REPLACE VIEW vw_censo_equipamentos_merenda AS
SELECT
    b.school_id, b.codigo_inep, b.nome_escola, b.dre, b.municipio, b.zona,
    b.census_id, b.year, b.status,
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
