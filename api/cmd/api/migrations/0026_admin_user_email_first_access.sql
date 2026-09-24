-- 0026_admin_user_email_first_access.sql
-- Adiciona identidade por e-mail e estado persistente de primeiro acesso.
--
-- Compatibilidade:
--   * contas existentes permanecem com email NULL;
--   * contas existentes nao sao obrigadas a trocar a senha retroativamente;
--   * novos provisionamentos pela aplicacao gravam email normalizado e
--     must_change_password = TRUE.

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS email VARCHAR(254),
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE admin_users
SET email = LOWER(BTRIM(email))
WHERE email IS NOT NULL
  AND email <> LOWER(BTRIM(email));

UPDATE admin_users
SET email = NULL
WHERE email IS NOT NULL
  AND BTRIM(email) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_admin_users_email_normalized'
          AND conrelid = 'admin_users'::regclass
    ) THEN
        ALTER TABLE admin_users
            ADD CONSTRAINT chk_admin_users_email_normalized
            CHECK (
                email IS NULL OR (
                    email = LOWER(BTRIM(email))
                    AND char_length(email) BETWEEN 3 AND 254
                    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
                )
            );
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_email_normalized
    ON admin_users (LOWER(BTRIM(email)))
    WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_first_access_pending
    ON admin_users (id)
    WHERE must_change_password = TRUE;

COMMENT ON COLUMN admin_users.email IS
    'Identidade de login por e-mail normalizado; NULL preserva contas legadas por username.';
COMMENT ON COLUMN admin_users.must_change_password IS
    'TRUE para credencial temporaria; impede sessao normal ate a definicao atomica da senha definitiva.';
