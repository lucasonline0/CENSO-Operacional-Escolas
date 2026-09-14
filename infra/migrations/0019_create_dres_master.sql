-- 0019_create_dres_master.sql
-- Entidade mestre de DREs (Diretorias Regionais de Ensino)
-- e migração/população automática idempotente a partir da tabela schools.

CREATE TABLE IF NOT EXISTS dres (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL,
    sigla VARCHAR(50),
    municipio_sede VARCHAR(255),
    polo VARCHAR(255),
    gestor_nome VARCHAR(255),
    email VARCHAR(255),
    telefone VARCHAR(50),
    ativa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dres_nome ON dres(nome);
CREATE INDEX IF NOT EXISTS idx_dres_ativa ON dres(ativa);

-- População automática e idempotente das DREs existentes em schools
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = CURRENT_SCHEMA() AND table_name = 'schools'
    ) THEN
        EXECUTE '
            INSERT INTO dres (nome)
            SELECT DISTINCT TRIM(dre)
            FROM schools
            WHERE dre IS NOT NULL AND TRIM(dre) <> ''''
            ON CONFLICT (nome) DO NOTHING
        ';
    END IF;
END $$;
