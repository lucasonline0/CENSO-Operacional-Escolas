-- 0024_admin_users_auth_version.sql
-- Adiciona a coluna auth_version em admin_users para suportar revogação imediata
-- de sessões JWT após reset de senha.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS com DEFAULT 1 NOT NULL.

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_admin_users_auth_version_positive'
          AND conrelid = 'admin_users'::regclass
    ) THEN
        ALTER TABLE admin_users
            ADD CONSTRAINT chk_admin_users_auth_version_positive
            CHECK (auth_version > 0);
    END IF;
END
$$;

UPDATE admin_users
SET auth_version = 1
WHERE auth_version IS NULL OR auth_version <= 0;
