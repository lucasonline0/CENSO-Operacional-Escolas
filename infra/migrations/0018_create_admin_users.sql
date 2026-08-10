-- 0018_create_admin_users.sql
-- Tabela de usuários administrativos com suporte a escopo por DRE.

CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    dre VARCHAR(128),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_admin_users_role_dre CHECK (
        (role = 'dre' AND dre IS NOT NULL AND TRIM(dre) <> '') OR role <> 'dre'
    )
);

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
