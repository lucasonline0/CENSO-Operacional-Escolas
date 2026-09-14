package main

import (
	"fmt"
	"strings"
)

// canonicalSchoolDREColumnSQL is intentionally schema-compatible with the
// transitional CI database, which is still initialized only through migration
// 0019 while the canonical CI migration is being completed. Production
// databases that have migration 0020 take the canonical branch; the textual
// branch is reached only when dre_id does not exist at all.
const canonicalSchoolDREColumnSQL = `EXISTS (
	SELECT 1
	FROM pg_attribute
	WHERE attrelid = to_regclass('schools')
	  AND attname = 'dre_id'
	  AND NOT attisdropped
)`

// schoolCanonicalDREIDExpr reads dre_id without making PostgreSQL parse a
// reference to a column that may not exist in the pre-0020 transition schema.
// Once 0020 is present this expression is the canonical relationship source.
func schoolCanonicalDREIDExpr(alias string) string {
	alias = strings.TrimSpace(alias)
	return fmt.Sprintf(`NULLIF(to_jsonb(%s)->>'dre_id', '')::int`, alias)
}

// schoolDRENamePredicate resolves an ADMIN textual filter through the DRE master
// when the canonical column exists. schools.dre is accepted only on a schema
// that has not received 0020 yet.
func schoolDRENamePredicate(alias, nameParam string) string {
	alias = strings.TrimSpace(alias)
	nameParam = strings.TrimSpace(nameParam)
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN EXISTS (
			SELECT 1
			FROM dres dre_scope
			WHERE dre_scope.id = %s
			  AND UPPER(TRIM(dre_scope.nome)) = UPPER(TRIM(%s))
		)
		ELSE UPPER(TRIM(%s.dre)) = UPPER(TRIM(%s))
	END
)`, canonicalSchoolDREColumnSQL, schoolCanonicalDREIDExpr(alias), nameParam, alias, nameParam)
}

// schoolDREAuthorizationPredicate is stricter than an ordinary name filter:
// on a canonical schema a DRE user's scope is compared directly by dre_id. The
// name parameter exists only to preserve pre-0020 transition compatibility.
func schoolDREAuthorizationPredicate(alias, dreIDParam, dreNameParam string) string {
	alias = strings.TrimSpace(alias)
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN %s = %s
		ELSE UPPER(TRIM(%s.dre)) = UPPER(TRIM(%s))
	END
)`, canonicalSchoolDREColumnSQL, schoolCanonicalDREIDExpr(alias), dreIDParam, alias, dreNameParam)
}

// schoolDREScopedFilterPredicate selects the correct trust boundary for a
// request. dreID > 0 means the value came from the authenticated DRE runtime
// scope, so authorization is by ID. dreID == 0 is the admin path, where a
// textual query-string filter may optionally resolve through the master DRE.
func schoolDREScopedFilterPredicate(alias, dreIDParam, dreNameParam string) string {
	return fmt.Sprintf(`(
	(%s > 0 AND %s)
	OR
	(%s = 0 AND (%s = '' OR %s))
)`, dreIDParam,
		schoolDREAuthorizationPredicate(alias, dreIDParam, dreNameParam),
		dreIDParam, dreNameParam,
		schoolDRENamePredicate(alias, dreNameParam),
	)
}

// schoolDRENameExpr keeps the public API textual while deriving the name from
// the master DRE whenever the canonical relationship exists. On a canonical
// schema legacy schools.dre never wins over dre_id, even if forged/divergent.
func schoolDRENameExpr(alias string) string {
	alias = strings.TrimSpace(alias)
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN COALESCE(
			(SELECT TRIM(dre_name.nome) FROM dres dre_name WHERE dre_name.id = %s),
			'Não informado'
		)
		ELSE COALESCE(NULLIF(TRIM(%s.dre), ''), 'Não informado')
	END
)`, canonicalSchoolDREColumnSQL, schoolCanonicalDREIDExpr(alias), alias)
}

// schoolDREIDExpr exposes the canonical ID for authorization/BOLA checks while
// remaining executable against the temporary pre-0020 CI schema.
func schoolDREIDExpr(alias string) string {
	alias = strings.TrimSpace(alias)
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN COALESCE(%s, 0)
		ELSE 0
	END
)`, canonicalSchoolDREColumnSQL, schoolCanonicalDREIDExpr(alias))
}

// analyticsDREPredicate is the ADMIN-name equivalent for views that expose
// school_id plus a legacy textual dre projection. On canonical schemas the view
// text is ignored and the school is re-resolved through schools.dre_id -> dres.
func analyticsDREPredicate(schoolIDExpr, legacyDREExpr, nameParam string) string {
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN EXISTS (
			SELECT 1
			FROM schools dre_school
			JOIN dres dre_scope ON dre_scope.id = %s
			WHERE dre_school.id = %s
			  AND UPPER(TRIM(dre_scope.nome)) = UPPER(TRIM(%s))
		)
		ELSE UPPER(TRIM(%s)) = UPPER(TRIM(%s))
	END
)`, canonicalSchoolDREColumnSQL, schoolCanonicalDREIDExpr("dre_school"), schoolIDExpr, nameParam, legacyDREExpr, nameParam)
}

// analyticsDREAuthorizationPredicate authorizes a DRE profile through the
// stable school relationship even when the analytics view itself only exposes a
// textual DRE snapshot. The snapshot is used solely before migration 0020.
func analyticsDREAuthorizationPredicate(schoolIDExpr, legacyDREExpr, dreIDParam, dreNameParam string) string {
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN EXISTS (
			SELECT 1
			FROM schools dre_school
			WHERE dre_school.id = %s
			  AND %s = %s
		)
		ELSE UPPER(TRIM(%s)) = UPPER(TRIM(%s))
	END
)`, canonicalSchoolDREColumnSQL, schoolIDExpr,
		schoolCanonicalDREIDExpr("dre_school"), dreIDParam,
		legacyDREExpr, dreNameParam,
	)
}

// analyticsDREScopedFilterPredicate mirrors schoolDREScopedFilterPredicate for
// analytics views. A runtime DRE scope (dreID > 0) is always an ID comparison;
// an admin may still use the textual filter, resolved through the master table.
func analyticsDREScopedFilterPredicate(schoolIDExpr, legacyDREExpr, dreIDParam, dreNameParam string) string {
	return fmt.Sprintf(`(
	(%s > 0 AND %s)
	OR
	(%s = 0 AND (%s = '' OR %s))
)`, dreIDParam,
		analyticsDREAuthorizationPredicate(schoolIDExpr, legacyDREExpr, dreIDParam, dreNameParam),
		dreIDParam, dreNameParam,
		analyticsDREPredicate(schoolIDExpr, legacyDREExpr, dreNameParam),
	)
}

// analyticsDRENameExpr derives a presentation name for a view row from
// school_id -> schools.dre_id -> dres.nome on canonical schemas. It deliberately
// refuses to fall back to the view text when dre_id exists but is missing or
// inconsistent, preventing stale text from becoming authoritative again.
func analyticsDRENameExpr(schoolIDExpr, legacyDREExpr string) string {
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN COALESCE((
			SELECT TRIM(dre_name.nome)
			FROM schools dre_school
			JOIN dres dre_name ON dre_name.id = %s
			WHERE dre_school.id = %s
		), 'Não informado')
		ELSE COALESCE(NULLIF(TRIM(%s), ''), 'Não informado')
	END
)`, canonicalSchoolDREColumnSQL,
		schoolCanonicalDREIDExpr("dre_school"), schoolIDExpr, legacyDREExpr,
	)
}
