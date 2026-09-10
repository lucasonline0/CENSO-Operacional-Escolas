-- 0025_dre_session_revocation.sql
-- Revoga definitivamente sessões JWT quando um usuário DRE ou a própria DRE
-- é desativada. A revogação é baseada em auth_version, portanto reativar a
-- conta/regional não ressuscita tokens emitidos antes da desativação.
--
-- A lógica fica no banco para cobrir todos os caminhos de escrita existentes
-- (AdminUserModel.SetActive*, DREModel.SetActive e DREModel.Update) dentro da
-- mesma transação que altera o status.

CREATE OR REPLACE FUNCTION revoke_admin_user_session_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.active IS TRUE AND NEW.active IS FALSE THEN
        NEW.auth_version := COALESCE(OLD.auth_version, 1) + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_users_revoke_session_on_deactivation ON admin_users;
CREATE TRIGGER trg_admin_users_revoke_session_on_deactivation
BEFORE UPDATE OF active ON admin_users
FOR EACH ROW
EXECUTE FUNCTION revoke_admin_user_session_on_deactivation();

CREATE OR REPLACE FUNCTION revoke_dre_sessions_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.ativa IS TRUE AND NEW.ativa IS FALSE THEN
        UPDATE admin_users
        SET auth_version = COALESCE(auth_version, 1) + 1,
            updated_at = NOW()
        WHERE dre_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dres_revoke_sessions_on_deactivation ON dres;
CREATE TRIGGER trg_dres_revoke_sessions_on_deactivation
AFTER UPDATE OF ativa ON dres
FOR EACH ROW
EXECUTE FUNCTION revoke_dre_sessions_on_deactivation();
