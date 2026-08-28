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

-- Performance indexes (mirror of infra/migrations/0013_performance_indexes.sql)
CREATE INDEX IF NOT EXISTS idx_cr_status_year  ON census_responses(status, year);
CREATE INDEX IF NOT EXISTS idx_cr_school_id    ON census_responses(school_id);
CREATE INDEX IF NOT EXISTS idx_schools_dre     ON schools(dre);
CREATE INDEX IF NOT EXISTS idx_schools_municipio ON schools(municipio);
CREATE INDEX IF NOT EXISTS idx_cr_data_gin     ON census_responses USING GIN (data);

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

-- Frente 2 / 0010 — espelho de infra/migrations/0010_vw_censo_rh_merendeiras.sql

CREATE OR REPLACE VIEW vw_censo_rh_merendeiras AS
SELECT
    b.school_id, b.codigo_inep, b.nome_escola, b.dre, b.municipio, b.zona,
    b.census_id, b.year, b.status,
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

-- Frente 2 / 0011 — espelho de infra/migrations/0011_vw_censo_rh_servicos_gerais.sql

CREATE OR REPLACE VIEW vw_censo_rh_servicos_gerais AS
SELECT
    b.school_id, b.codigo_inep, b.nome_escola, b.dre, b.municipio, b.zona,
    b.census_id, b.year, b.status,
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

-- Frente 2 / 0012 — espelho de infra/migrations/0012_vw_censo_servicos_terceirizados.sql

CREATE OR REPLACE VIEW vw_censo_servicos_terceirizados AS
SELECT
    b.school_id, b.codigo_inep, b.nome_escola, b.dre, b.municipio, b.zona,
    b.census_id, b.year, b.status,
    CASE WHEN cr.data->>'qtd_agentes_portaria' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_agentes_portaria')::numeric END  AS qtd_agentes_portaria,
    NULLIF(cr.data->>'qtd_atende_necessidade_portaria', '')    AS qtd_atende_necessidade_portaria,
    CASE WHEN cr.data->>'quantitativo_necessario_portaria' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'quantitativo_necessario_portaria')::numeric END AS quantitativo_necessario_portaria,
    NULLIF(cr.data->>'empresa_terceirizada_portaria', '')      AS empresa_terceirizada_portaria,
    NULLIF(cr.data->>'possui_supervisor_portaria',    '')      AS possui_supervisor_portaria,
    NULLIF(cr.data->>'empresa_terceirizada_merenda',  '')      AS empresa_terceirizada_merenda,
    NULLIF(cr.data->>'empresa_terceirizada_sg',       '')      AS empresa_terceirizada_sg,
    NULLIF(cr.data->>'avaliacao_merendeiras',  '')  AS avaliacao_merendeiras,
    NULLIF(cr.data->>'avaliacao_portaria',     '')  AS avaliacao_portaria,
    NULLIF(cr.data->>'avaliacao_limpeza',      '')  AS avaliacao_limpeza,
    NULLIF(cr.data->>'avaliacao_comunicacao',  '')  AS avaliacao_comunicacao,
    NULLIF(cr.data->>'avaliacao_supervisao',   '')  AS avaliacao_supervisao
FROM vw_censo_base b
LEFT JOIN census_responses cr ON cr.id = b.census_id;
-- ==============================================================================
-- VIEWS DA FRENTE 1 - PESSOAL E GESTÃO ESCOLAR
-- ==============================================================================
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

-- 0006_vw_censo_equipamentos_tecnologia
-- Finalidade: Consolidar indicadores de conectividade e parque tecnológico das escolas.
-- Fonte: vw_censo_base e census_responses.data (JSONB)
-- Granularidade: Uma linha por escola/ano (school_id + year).
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
    lower(cr.data->>'internet_disponivel') IN ('sim', 'true', 't', '1')
        AS internet_disponivel,
    NULLIF(cr.data->>'provedor_internet', '')
        AS provedor_internet,
    NULLIF(cr.data->>'qualidade_internet', '')
        AS qualidade_internet,
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
    lower(cr.data->>'possui_projetor') IN ('sim', 'true', 't', '1')
        AS possui_projetor,
    CASE WHEN cr.data->>'qtd_projetores' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (cr.data->>'qtd_projetores')::numeric END AS qtd_projetores,
    lower(cr.data->>'possui_lousa_digital') IN ('sim', 'true', 't', '1')
        AS possui_lousa_digital
FROM vw_censo_base b
JOIN census_responses cr ON cr.id = b.census_id;

-- =====================================================================
-- PRODEP — repasses financeiros (espelho de
-- infra/migrations/0015_prodep_repasses.sql, sem dados)
-- =====================================================================
-- Estrutura para a carga financeira do PRODEP. codigo_inep_prodep é a chave
-- de identidade e nunca é substituído pelo INEP da sede (caso anexo). A tabela
-- schools NÃO é alterada por esta carga; school_id/school_id_sede apenas
-- referenciam schools(id) quando o vínculo foi resolvido no saneamento.
-- =====================================================================

CREATE TABLE IF NOT EXISTS prodep_import_batches (
    id                       BIGSERIAL PRIMARY KEY,
    source_file              TEXT,
    source_hash              TEXT,
    rows_imported            INTEGER,
    total_valor_recebido     NUMERIC(14,2),
    total_valor_reprogramado NUMERIC(14,2),
    created_at               TIMESTAMP NOT NULL DEFAULT now(),
    notes                    TEXT
);

CREATE TABLE IF NOT EXISTS prodep_repasses (
    id                       BIGSERIAL PRIMARY KEY,
    codigo_inep_prodep       TEXT NOT NULL,
    escola_nome_prodep       TEXT,
    dre_prodep               TEXT,
    ri_prodep                TEXT,
    municipio_prodep         TEXT,
    municipio_resolvido      TEXT,
    ano                      INTEGER NOT NULL,
    categoria                TEXT NOT NULL,
    valor_recebido           NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_reprogramado       NUMERIC(14,2) NOT NULL DEFAULT 0,
    status_prestacao_contas  TEXT,
    match_status             TEXT NOT NULL,
    usar_na_carga            BOOLEAN NOT NULL DEFAULT TRUE,
    school_id                INTEGER NULL,
    codigo_inep_sede         TEXT NULL,
    school_id_sede           INTEGER NULL,
    fonte_match              TEXT,
    observacao_match         TEXT,
    import_batch_id          BIGINT NULL,
    created_at               TIMESTAMP NOT NULL DEFAULT now(),
    updated_at               TIMESTAMP NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_inep_ano_cat_uniq
        UNIQUE (codigo_inep_prodep, ano, categoria);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_ano_chk
        CHECK (ano IN (2023, 2024, 2025));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_categoria_chk
        CHECK (categoria IN ('geral', 'alimentacao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_status_pc_chk
        CHECK (status_prestacao_contas IN ('ok', 'sem_recurso', 'nao_prestou_contas')
               OR status_prestacao_contas IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_match_status_chk
        CHECK (match_status IN ('matched_by_inep_schools', 'matched_by_base_dige',
                                'prodep_only_validado', 'anexo_vinculado_sede'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_school_id_fk
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_school_id_sede_fk
        FOREIGN KEY (school_id_sede) REFERENCES schools(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE prodep_repasses
        ADD CONSTRAINT prodep_repasses_import_batch_fk
        FOREIGN KEY (import_batch_id) REFERENCES prodep_import_batches(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_prodep_repasses_ano          ON prodep_repasses (ano);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_dre          ON prodep_repasses (dre_prodep);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_municipio    ON prodep_repasses (municipio_resolvido);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_school_id    ON prodep_repasses (school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_match_status ON prodep_repasses (match_status);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_inep         ON prodep_repasses (codigo_inep_prodep);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_batch        ON prodep_repasses (import_batch_id);

-- =====================================================================
-- vw_censo_governanca_institucional (espelho de
-- infra/migrations/0016_vw_censo_governanca_institucional.sql)
-- =====================================================================
-- Governança Institucional (aba "Gestão Financeira e Governança", PR 1).
-- Somente respostas concluídas. "Não informado"/vazio permanece NULL e
-- nunca é convertido em "Não".
-- =====================================================================

CREATE OR REPLACE VIEW vw_censo_governanca_institucional AS
WITH base AS (
    SELECT
        cr.id                                       AS census_id,
        s.id                                        AS school_id,
        s.codigo_inep,
        s.nome_escola                               AS escola,
        s.dre,
        s.municipio,
        s.zona,
        NULLIF(cr.data->>'regularizada_cee', '')    AS regularizada_cee,
        NULLIF(cr.data->>'conselho_escolar', '')    AS conselho_escolar,
        NULLIF(cr.data->>'conselho_ativo', '')      AS conselho_ativo
    FROM census_responses cr
    JOIN schools s ON s.id = cr.school_id
    WHERE cr.status = 'completed'
)
SELECT
    census_id,
    school_id,
    codigo_inep,
    escola,
    dre,
    municipio,
    zona,
    regularizada_cee,
    conselho_escolar,
    conselho_ativo,
    (regularizada_cee = 'Sim')        AS is_regularizada_cee,
    (conselho_escolar = 'Sim')        AS has_conselho_escolar,
    (conselho_ativo = 'Sim')          AS is_conselho_ativo,
    (conselho_ativo = 'Parcialmente') AS is_conselho_parcialmente_ativo,
    (regularizada_cee = 'Sim'
     AND conselho_escolar = 'Sim'
     AND conselho_ativo = 'Sim')      AS is_governanca_completa,
    (regularizada_cee = 'Não'
     OR conselho_escolar = 'Não'
     OR conselho_ativo = 'Não')       AS is_governanca_critica
FROM base;

-- =====================================================================
-- ideb_resultados — resultados oficiais do IDEB por escola (espelho de
-- infra/migrations/0017_create_ideb_resultados.sql, sem dados)
-- =====================================================================
-- Fonte externa oficial: INEP — Nota Informativa IDEB 2023. Grão da tabela:
-- 1 linha = ano × codigo_inep × etapa. codigo_inep é a chave de integração
-- com schools e é preservado como texto; school_id é nullable (INEP pode não
-- ter match em schools). ideb ausente ("-") é NULL, nunca 0 — ausência é
-- cobertura/elegibilidade, não desempenho ruim. status_ideb é o status
-- guarda-chuva executivo e detalhe_status_ideb preserva a granularidade
-- técnica. percentual_avaliado NÃO é limitado a <= 100 (valores acima de 100
-- na origem são preservados como alerta de qualidade). schools NÃO é alterada
-- por esta estrutura; agregações por DRE/município são cálculo do dashboard,
-- não IDEB oficial agregado.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ideb_resultados (
    id                          SERIAL PRIMARY KEY,
    ano                         INT NOT NULL,
    codigo_inep                 VARCHAR(20) NOT NULL,
    school_id                   INT NULL,
    nome_escola_origem          VARCHAR(255) NOT NULL,
    etapa                       VARCHAR(30) NOT NULL,
    total_avaliado              NUMERIC(12,2) NULL,
    percentual_avaliado         NUMERIC(8,2) NULL,
    proficiencia_portugues      NUMERIC(8,2) NULL,
    proficiencia_matematica     NUMERIC(8,2) NULL,
    fluxo_indicador_rendimento  NUMERIC(6,4) NULL,
    ideb                        NUMERIC(4,2) NULL,
    status_ideb                 VARCHAR(30) NOT NULL,
    detalhe_status_ideb         VARCHAR(30) NULL,
    status_vinculo              VARCHAR(30) NOT NULL DEFAULT 'pendente_validacao',
    fonte_arquivo               VARCHAR(255) NULL,
    fonte_inep_url              TEXT NULL,
    import_batch_id             VARCHAR(80) NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unicidade do grão (cria o índice único automaticamente; sem índice redundante).
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_ano_inep_etapa_uniq
        UNIQUE (ano, codigo_inep, etapa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK nullable; ON DELETE SET NULL preserva o registro IDEB histórico.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_school_id_fk
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_etapa_chk
        CHECK (etapa IN ('anos_iniciais', 'anos_finais', 'ensino_medio'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_status_ideb_chk
        CHECK (status_ideb IN ('com_ideb', 'sem_ideb_divulgado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_detalhe_status_chk
        CHECK (detalhe_status_ideb IS NULL
               OR detalhe_status_ideb IN ('sem_resultado', 'nd_proficiencia', 'outro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coerência: com_ideb => detalhe NULL; sem_ideb_divulgado => detalhe livre/NULL.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_status_coerencia_chk
        CHECK (
            (status_ideb = 'com_ideb' AND detalhe_status_ideb IS NULL)
            OR status_ideb = 'sem_ideb_divulgado'
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_status_vinculo_chk
        CHECK (status_vinculo IN ('match_inep', 'sem_match_inep',
                                  'conflito_nome', 'pendente_validacao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_ano_chk
        CHECK (ano >= 2005);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_ideb_faixa_chk
        CHECK (ideb IS NULL OR (ideb >= 0 AND ideb <= 10));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NÃO limitar percentual_avaliado a <= 100 (valores acima de 100 são alerta).
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_percentual_chk
        CHECK (percentual_avaliado IS NULL OR percentual_avaliado >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_total_avaliado_chk
        CHECK (total_avaliado IS NULL OR total_avaliado >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_ano              ON ideb_resultados (ano);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_codigo_inep      ON ideb_resultados (codigo_inep);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_school_id        ON ideb_resultados (school_id);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_etapa            ON ideb_resultados (etapa);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_status_ideb      ON ideb_resultados (status_ideb);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_status_vinculo   ON ideb_resultados (status_vinculo);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_ano_etapa        ON ideb_resultados (ano, etapa);
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_ano_etapa_status ON ideb_resultados (ano, etapa, status_ideb);
