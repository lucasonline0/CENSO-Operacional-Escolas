-- 0017_create_ideb_resultados
-- Estrutura persistente para os resultados oficiais do IDEB 2023 por escola.
-- Fonte externa oficial: INEP — Nota Informativa IDEB 2023
--   https://download.inep.gov.br/ideb/nota_informativa_ideb_2023.pdf
-- Planilha de origem (insumo local, NÃO versionado):
--   ideb_2023_iniciais_finais_medio.xlsx (aba "IDEB 2023").
--
-- Esta migration cria APENAS a estrutura da tabela. Não carrega dados,
-- não cria endpoint, não cria view analítica e não usa campos declaratórios
-- do censo (census_responses.data). A carga ocorre em incremento posterior
-- (IDEB-03 — Importador/carga controlada).
--
-- Grão da tabela:
--   1 linha = escola/INEP × etapa de ensino × ano.
--
-- Regras metodológicas refletidas na modelagem:
--   * codigo_inep é a CHAVE de integração com schools; preservado como texto.
--   * school_id é nullable: a base IDEB é externa e pode haver INEP sem match
--     em schools. A correção/exclusão de uma escola no cadastro não deve apagar
--     o registro histórico da fonte IDEB (FK ON DELETE SET NULL).
--   * ideb ausente ("-") é NULL, NUNCA 0 — ausência é cobertura/elegibilidade,
--     não desempenho ruim.
--   * status_ideb é o status guarda-chuva executivo (com_ideb / sem_ideb_divulgado);
--     detalhe_status_ideb preserva a granularidade técnica (sem_resultado /
--     nd_proficiencia / outro).
--   * percentual_avaliado NÃO é limitado a <= 100: a auditoria local encontrou
--     159 registros acima de 100 na base de origem; o valor bruto é preservado e
--     tratado como alerta de qualidade, não corrigido silenciosamente.
--   * agregações por DRE/município são cálculo do dashboard, não IDEB oficial
--     agregado do INEP — fora do escopo desta migration estrutural.
--
-- Migration idempotente: pode ser reaplicada a cada startup (CREATE ... IF NOT
-- EXISTS, blocos DO/EXCEPTION para constraints). Espelhada em
-- infra/migrations/0017_create_ideb_resultados.sql.

-- ---------------------------------------------------------------------------
-- Tabela ideb_resultados (1 linha por ano × codigo_inep × etapa)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Constraints (idempotentes via DO/EXCEPTION duplicate_object)
-- ---------------------------------------------------------------------------

-- Unicidade do grão: ano × codigo_inep × etapa. Esta constraint cria o índice
-- único correspondente automaticamente; por isso NÃO criamos um índice único
-- redundante mais abaixo.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_ano_inep_etapa_uniq
        UNIQUE (ano, codigo_inep, etapa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK nullable para schools(id). ON DELETE SET NULL preserva o registro IDEB
-- mesmo que a escola seja removida/corrigida no cadastro operacional.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_school_id_fk
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- etapa: vocabulário fechado das etapas de ensino.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_etapa_chk
        CHECK (etapa IN ('anos_iniciais', 'anos_finais', 'ensino_medio'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- status_ideb: status guarda-chuva executivo.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_status_ideb_chk
        CHECK (status_ideb IN ('com_ideb', 'sem_ideb_divulgado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- detalhe_status_ideb: granularidade técnica do status, ou NULL.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_detalhe_status_chk
        CHECK (detalhe_status_ideb IS NULL
               OR detalhe_status_ideb IN ('sem_resultado', 'nd_proficiencia', 'outro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coerência entre status_ideb e detalhe_status_ideb:
--   * com_ideb           => detalhe_status_ideb deve ser NULL;
--   * sem_ideb_divulgado => detalhe pode ser sem_resultado | nd_proficiencia |
--                           outro | NULL.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_status_coerencia_chk
        CHECK (
            (status_ideb = 'com_ideb' AND detalhe_status_ideb IS NULL)
            OR status_ideb = 'sem_ideb_divulgado'
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- status_vinculo: situação do vínculo cadastral com schools.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_status_vinculo_chk
        CHECK (status_vinculo IN ('match_inep', 'sem_match_inep',
                                  'conflito_nome', 'pendente_validacao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ano: limite inferior conservador da série IDEB.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_ano_chk
        CHECK (ano >= 2005);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ideb: faixa válida 0..10; ausência é NULL, nunca 0.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_ideb_faixa_chk
        CHECK (ideb IS NULL OR (ideb >= 0 AND ideb <= 10));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- percentual_avaliado: somente não-negativo. NÃO limitar a <= 100 (valores
-- acima de 100 na origem são preservados como alerta de qualidade).
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_percentual_chk
        CHECK (percentual_avaliado IS NULL OR percentual_avaliado >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- total_avaliado: somente não-negativo.
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_total_avaliado_chk
        CHECK (total_avaliado IS NULL OR total_avaliado >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Índices para filtros e joins futuros.
-- Obs.: a unicidade (ano, codigo_inep, etapa) já cria seu próprio índice via
-- a constraint ideb_resultados_ano_inep_etapa_uniq; não há índice único extra.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ideb_resultados_ano
    ON ideb_resultados (ano);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_codigo_inep
    ON ideb_resultados (codigo_inep);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_school_id
    ON ideb_resultados (school_id);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_etapa
    ON ideb_resultados (etapa);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_status_ideb
    ON ideb_resultados (status_ideb);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_status_vinculo
    ON ideb_resultados (status_vinculo);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_ano_etapa
    ON ideb_resultados (ano, etapa);

CREATE INDEX IF NOT EXISTS idx_ideb_resultados_ano_etapa_status
    ON ideb_resultados (ano, etapa, status_ideb);
