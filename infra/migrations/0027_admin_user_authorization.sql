-- Autoriza contas administrativas por capacidades e escopo de dados.
-- Roles legadas são mantidas apenas para compatibilidade de apresentação; a
-- autorização é decidida pelas tabelas abaixo, sempre fail-closed.

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS data_scope VARCHAR(16) NOT NULL DEFAULT 'selected';

ALTER TABLE admin_users
    DROP CONSTRAINT IF EXISTS chk_admin_users_data_scope;
ALTER TABLE admin_users
    ADD CONSTRAINT chk_admin_users_data_scope CHECK (data_scope IN ('all', 'selected'));

CREATE TABLE IF NOT EXISTS admin_user_permissions (
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    permission VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, permission),
    CONSTRAINT chk_admin_user_permission_catalog CHECK (permission IN (
        'census.read', 'analytics.read', 'reports.read', 'users.read',
        'users.create', 'users.manage', 'users.reset_password', 'dres.manage',
        'schools.manage_dre', 'sync.execute'
    ))
);

CREATE TABLE IF NOT EXISTS admin_user_dres (
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    dre_id INTEGER NOT NULL REFERENCES dres(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, dre_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_permission
    ON admin_user_permissions (permission, user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_dres_dre
    ON admin_user_dres (dre_id, user_id);

-- Uma conta DRE existente equivale a acesso de leitura ao dashboard e à sua
-- única DRE canônica. Contas sem uma DRE canônica continuam fail-closed.
INSERT INTO admin_user_permissions (user_id, permission)
SELECT id, permission
FROM admin_users
CROSS JOIN (VALUES ('census.read'), ('analytics.read'), ('reports.read')) AS p(permission)
WHERE role = 'dre'
ON CONFLICT DO NOTHING;

INSERT INTO admin_user_dres (user_id, dre_id)
SELECT id, dre_id
FROM admin_users
WHERE role = 'dre' AND dre_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN admin_users.data_scope IS
    'all concede visibilidade global; selected exige vínculos em admin_user_dres.';
