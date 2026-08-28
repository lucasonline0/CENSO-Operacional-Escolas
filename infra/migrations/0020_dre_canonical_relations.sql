-- 0020_dre_canonical_relations.sql
-- Introduz relacoes canonicas por ID entre DREs, usuarios administrativos e escolas.
-- As colunas textuais `dre` permanecem temporariamente por compatibilidade, mas deixam
-- de ser a fonte de verdade. Triggers de compatibilidade mantem writes legados
-- sincronizados ate que os handlers sejam migrados integralmente para `dre_id`.
--
-- IMPORTANTE: não alteramos o tipo das colunas legadas aqui. `schools.dre` é usada por
-- views históricas e ALTER TYPE pode falhar em bancos já migrados. Como `dre_id` é a
-- fonte canônica, o texto legado é espelhado respeitando os limites atuais.

ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS dre_id INTEGER;

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS dre_id INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM dres
        GROUP BY UPPER(BTRIM(nome))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'dre canonical backfill aborted: ambiguous normalized DRE names exist';
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM schools s
        LEFT JOIN dres d ON d.id = s.dre_id
        WHERE s.dre_id IS NOT NULL AND d.id IS NULL
    ) THEN
        RAISE EXCEPTION 'dre canonical backfill aborted: schools contains invalid dre_id';
    END IF;
    IF EXISTS (
        SELECT 1 FROM admin_users u
        LEFT JOIN dres d ON d.id = u.dre_id
        WHERE u.dre_id IS NOT NULL AND d.id IS NULL
    ) THEN
        RAISE EXCEPTION 'dre canonical backfill aborted: admin_users contains invalid dre_id';
    END IF;
END
$$;

UPDATE schools s
SET dre = LEFT(d.nome, 100)
FROM dres d
WHERE s.dre_id = d.id
  AND s.dre IS DISTINCT FROM LEFT(d.nome, 100);

UPDATE admin_users u
SET dre = LEFT(d.nome, 128)
FROM dres d
WHERE u.dre_id = d.id
  AND u.dre IS DISTINCT FROM LEFT(d.nome, 128);

UPDATE schools s
SET dre_id = d.id,
    dre = LEFT(d.nome, 100)
FROM dres d
WHERE s.dre_id IS NULL
  AND BTRIM(COALESCE(s.dre, '')) <> ''
  AND UPPER(BTRIM(s.dre)) = UPPER(BTRIM(d.nome));

UPDATE admin_users u
SET dre_id = d.id,
    dre = LEFT(d.nome, 128)
FROM dres d
WHERE u.dre_id IS NULL
  AND BTRIM(COALESCE(u.dre, '')) <> ''
  AND UPPER(BTRIM(u.dre)) = UPPER(BTRIM(d.nome));

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM schools
        WHERE dre_id IS NULL AND BTRIM(COALESCE(dre, '')) <> ''
    ) THEN
        RAISE EXCEPTION 'dre canonical backfill aborted: unmapped school DRE values exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM admin_users
        WHERE role = 'dre' AND dre_id IS NULL
    ) THEN
        RAISE EXCEPTION 'dre canonical backfill aborted: unmapped DRE users exist';
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_schools_dre_id ON schools(dre_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_dre_id ON admin_users(dre_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_schools_dre_id' AND conrelid = 'schools'::regclass) THEN
        ALTER TABLE schools ADD CONSTRAINT fk_schools_dre_id FOREIGN KEY (dre_id) REFERENCES dres(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_admin_users_dre_id' AND conrelid = 'admin_users'::regclass) THEN
        ALTER TABLE admin_users ADD CONSTRAINT fk_admin_users_dre_id FOREIGN KEY (dre_id) REFERENCES dres(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_schools_dre_canonical' AND conrelid = 'schools'::regclass) THEN
        ALTER TABLE schools ADD CONSTRAINT chk_schools_dre_canonical CHECK (dre_id IS NOT NULL OR dre IS NULL OR BTRIM(dre) = '');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_admin_users_role_dre_id' AND conrelid = 'admin_users'::regclass) THEN
        ALTER TABLE admin_users ADD CONSTRAINT chk_admin_users_role_dre_id CHECK (role <> 'dre' OR dre_id IS NOT NULL);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION sync_school_dre_relation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE canonical_id INTEGER; canonical_name TEXT;
BEGIN
    IF NEW.dre_id IS NOT NULL THEN
        BEGIN
            SELECT id, nome INTO STRICT canonical_id, canonical_name FROM dres WHERE id = NEW.dre_id;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'invalid dre_id % for school', NEW.dre_id USING ERRCODE = '23503';
        END;
        NEW.dre_id := canonical_id; NEW.dre := LEFT(canonical_name, 100); RETURN NEW;
    END IF;
    IF BTRIM(COALESCE(NEW.dre, '')) = '' THEN NEW.dre_id := NULL; NEW.dre := NULL; RETURN NEW; END IF;
    BEGIN
        SELECT id, nome INTO STRICT canonical_id, canonical_name FROM dres WHERE UPPER(BTRIM(nome)) = UPPER(BTRIM(NEW.dre));
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RAISE EXCEPTION 'DRE not found for school: %', NEW.dre USING ERRCODE = '23503';
        WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'ambiguous DRE for school: %', NEW.dre USING ERRCODE = '23505';
    END;
    NEW.dre_id := canonical_id; NEW.dre := LEFT(canonical_name, 100); RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION sync_admin_user_dre_relation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE canonical_id INTEGER; canonical_name TEXT;
BEGIN
    IF NEW.role <> 'dre' AND NEW.dre_id IS NULL AND BTRIM(COALESCE(NEW.dre, '')) = '' THEN NEW.dre := NULL; RETURN NEW; END IF;
    IF NEW.dre_id IS NOT NULL THEN
        BEGIN
            SELECT id, nome INTO STRICT canonical_id, canonical_name FROM dres WHERE id = NEW.dre_id;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'invalid dre_id % for admin user', NEW.dre_id USING ERRCODE = '23503';
        END;
        NEW.dre_id := canonical_id; NEW.dre := LEFT(canonical_name, 128); RETURN NEW;
    END IF;
    IF BTRIM(COALESCE(NEW.dre, '')) = '' THEN
        IF NEW.role = 'dre' THEN RAISE EXCEPTION 'DRE user requires a canonical DRE' USING ERRCODE = '23514'; END IF;
        NEW.dre := NULL; RETURN NEW;
    END IF;
    BEGIN
        SELECT id, nome INTO STRICT canonical_id, canonical_name FROM dres WHERE UPPER(BTRIM(nome)) = UPPER(BTRIM(NEW.dre));
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RAISE EXCEPTION 'DRE not found for admin user: %', NEW.dre USING ERRCODE = '23503';
        WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'ambiguous DRE for admin user: %', NEW.dre USING ERRCODE = '23505';
    END;
    NEW.dre_id := canonical_id; NEW.dre := LEFT(canonical_name, 128); RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_schools_sync_dre_relation ON schools;
CREATE TRIGGER trg_schools_sync_dre_relation BEFORE INSERT OR UPDATE OF dre, dre_id ON schools FOR EACH ROW EXECUTE FUNCTION sync_school_dre_relation();

DROP TRIGGER IF EXISTS trg_admin_users_sync_dre_relation ON admin_users;
CREATE TRIGGER trg_admin_users_sync_dre_relation BEFORE INSERT OR UPDATE OF dre, dre_id, role ON admin_users FOR EACH ROW EXECUTE FUNCTION sync_admin_user_dre_relation();

COMMENT ON COLUMN schools.dre_id IS 'Referencia canonica para dres.id. schools.dre e compatibilidade temporaria.';
COMMENT ON COLUMN admin_users.dre_id IS 'Referencia canonica para dres.id. admin_users.dre e compatibilidade temporaria.';
