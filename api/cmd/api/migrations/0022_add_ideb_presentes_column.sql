-- 0022_add_ideb_presentes_column
-- Adiciona coluna 'presentes' à tabela ideb_resultados para suportar
-- a base IDEB 2025, que traz o número de alunos presentes na avaliação.
--
-- Esta migration é idempotente (ADD COLUMN IF NOT EXISTS).
-- Não altera dados existentes; apenas adiciona a nova coluna.
--
-- Referência: scripts/ideb/import_ideb_resultados.py (mapeamento 2025)

-- ---------------------------------------------------------------------------
-- Adicionar coluna presentes (nova no IDEB 2025)
-- ---------------------------------------------------------------------------
ALTER TABLE ideb_resultados
    ADD COLUMN IF NOT EXISTS presentes INT NULL;

-- Validação: presentes não-negativo
DO $$ BEGIN
    ALTER TABLE ideb_resultados
        ADD CONSTRAINT ideb_resultados_presentes_chk
        CHECK (presentes IS NULL OR presentes >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
