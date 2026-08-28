-- 0021_dre_normalized_uniqueness.sql
-- Endurece a identidade administrativa para que consultas case-insensitive e
-- constraints usem a mesma regra: LOWER(BTRIM(valor)).
-- A migration falha antes de modificar dados se houver colisões legadas.

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM admin_users
        WHERE BTRIM(username) = ''
    ) THEN
        RAISE EXCEPTION 'admin_users normalized username migration aborted: blank usernames exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM admin_users
        GROUP BY LOWER(BTRIM(username))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'admin_users normalized username migration aborted: normalized username collisions exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM dres
        WHERE BTRIM(nome) = ''
    ) THEN
        RAISE EXCEPTION 'dres normalized name migration aborted: blank DRE names exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM dres
        GROUP BY LOWER(BTRIM(nome))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'dres normalized name migration aborted: normalized DRE name collisions exist';
    END IF;
END
$$;

UPDATE admin_users
SET username = BTRIM(username),
    updated_at = NOW()
WHERE username IS DISTINCT FROM BTRIM(username);

UPDATE dres
SET nome = BTRIM(nome),
    updated_at = NOW()
WHERE nome IS DISTINCT FROM BTRIM(nome);

UPDATE schools s
SET dre = LEFT(d.nome, 100)
FROM dres d
WHERE s.dre_id = d.id
  AND s.dre IS DISTINCT FROM LEFT(d.nome, 100);

UPDATE admin_users u
SET dre = LEFT(d.nome, 128),
    updated_at = NOW()
FROM dres d
WHERE u.dre_id = d.id
  AND u.dre IS DISTINCT FROM LEFT(d.nome, 128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_username_normalized
    ON admin_users (LOWER(BTRIM(username)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_dres_nome_normalized
    ON dres (LOWER(BTRIM(nome)));

COMMIT;
