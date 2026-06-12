-- 0015_prodep_repasses
-- Estrutura de banco para os repasses financeiros do PRODEP (Programa Dinheiro
-- Direto na Escola estadual). Fonte: frente de saneamento PRODEP/base_dige,
-- artefato final _local/prodep_base_dige_final/prodep_long_final.csv (não versionado).
--
-- Regra metodológica:
--   * codigo_inep_prodep é a CHAVE de identidade financeira e NUNCA é
--     substituído pelo INEP da sede (caso anexo).
--   * schools é o cadastro operacional da aplicação e NÃO é alterada por esta
--     carga; school_id/school_id_sede apenas referenciam schools(id) quando
--     o vínculo já foi resolvido na etapa de saneamento.
--   * base_dige e prodep_only_validado entram no financeiro, mas não vinculam
--     automaticamente uma escola operacional (school_id pode ser NULL).
--
-- Migration idempotente: pode ser reaplicada a cada startup (CREATE ... IF NOT
-- EXISTS, blocos DO/EXCEPTION para constraints). Espelhada em
-- infra/migrations/0015_prodep_repasses.sql e infra/init.sql.

-- ---------------------------------------------------------------------------
-- Lotes de importação (auditoria/rastreabilidade da carga)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Repasses PRODEP (1 linha por codigo_inep_prodep + ano + categoria)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Constraints (idempotentes via DO/EXCEPTION duplicate_object)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_ano          ON prodep_repasses (ano);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_dre          ON prodep_repasses (dre_prodep);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_municipio    ON prodep_repasses (municipio_resolvido);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_school_id    ON prodep_repasses (school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_match_status ON prodep_repasses (match_status);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_inep         ON prodep_repasses (codigo_inep_prodep);
CREATE INDEX IF NOT EXISTS idx_prodep_repasses_batch        ON prodep_repasses (import_batch_id);
