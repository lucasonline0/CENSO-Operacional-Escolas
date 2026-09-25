-- Conservative cleanup: no CASCADE and no deletion when any known relation exists.
BEGIN;
CREATE TEMP TABLE e2e_dre_audit ON COMMIT DROP AS
SELECT d.id, d.nome,
  (SELECT count(*) FROM schools s WHERE s.dre_id=d.id) AS schools,
  (SELECT count(*) FROM admin_users u WHERE u.dre_id=d.id) AS admin_users,
  (SELECT count(*) FROM admin_user_dres ud WHERE ud.dre_id=d.id) AS admin_user_dres,
  (SELECT count(*) FROM census_responses c JOIN schools s ON s.id=c.school_id WHERE s.dre_id=d.id) AS census
FROM dres d WHERE d.nome ILIKE 'DRE-E2E-%' OR UPPER(BTRIM(COALESCE(d.sigla,'')))='E2E'
FOR UPDATE OF d;

DELETE FROM dres d USING e2e_dre_audit a
WHERE d.id=a.id AND a.schools=0 AND a.admin_users=0 AND a.admin_user_dres=0 AND a.census=0;

SELECT id, nome, CASE WHEN schools+admin_users+admin_user_dres+census=0
  THEN 'REMOVIDA — fixture E2E' ELSE 'IGNORADA — possui dependências' END AS resultado,
  schools, admin_users, admin_user_dres, census
FROM e2e_dre_audit ORDER BY id;
COMMIT;
