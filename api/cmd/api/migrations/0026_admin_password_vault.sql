-- 0026_admin_password_vault.sql
-- Mantém bcrypt como fonte de autenticação e adiciona uma cópia reversível
-- criptografada (AES-256-GCM na aplicação) apenas para gestão administrativa.
-- A chave de criptografia NÃO fica no banco: ADMIN_PASSWORD_VAULT_KEY é um
-- secret separado do ambiente de execução.

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS password_ciphertext TEXT,
    ADD COLUMN IF NOT EXISTS password_ciphertext_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS admin_credential_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_username TEXT NOT NULL,
    actor_ip TEXT NOT NULL DEFAULT '',
    target_user_id INTEGER NOT NULL,
    target_username TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_credential_audit_target_created
    ON admin_credential_audit (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_credential_audit_actor_created
    ON admin_credential_audit (actor_username, created_at DESC);
