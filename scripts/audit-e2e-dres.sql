-- Read-only production audit. Run before cleanup-e2e-dres.sql.
WITH suspects AS (
  SELECT d.* FROM dres d
  WHERE d.nome ILIKE 'DRE-E2E-%' OR UPPER(BTRIM(COALESCE(d.sigla, ''))) = 'E2E'
)
SELECT d.id, d.nome, d.sigla, d.created_at, d.ativa,
  (SELECT count(*) FROM schools s WHERE s.dre_id=d.id) AS escolas,
  (SELECT count(*) FROM admin_users u WHERE u.dre_id=d.id) AS admin_users,
  (SELECT count(*) FROM admin_user_dres ud WHERE ud.dre_id=d.id) AS admin_user_dres,
  (SELECT count(*) FROM census_responses c JOIN schools s ON s.id=c.school_id WHERE s.dre_id=d.id) AS census_vinculados
FROM suspects d ORDER BY d.created_at, d.id;
