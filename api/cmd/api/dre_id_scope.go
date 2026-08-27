package main

import (
	"fmt"
	"strings"
)

// canonicalSchoolDREColumnSQL is intentionally schema-compatible with the
// transitional CI database, which is still initialized only through migration
// 0019 while #210 is in progress. Production databases that have migration 0020
// take the canonical branch; the textual branch is reached only when dre_id does
// not exist at all.
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

// schoolDRENamePredicate returns a boolean SQL expression that resolves a DRE
// through dres.id when the canonical column exists. The schools.dre comparison
// is retained only as a temporary schema-compatibility branch for databases
// that have not received migration 0020 yet.
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

// schoolDREAuthorizationPredicate is stricter than the ordinary name filter:
// on a canonical schema a DRE user's scope is compared directly by dres.id.
// The name is accepted only for the pre-0020 transition schema.
func schoolDREAuthorizationPredicate(alias, dreIDParam, dreNameParam string) string {
	alias = strings.TrimSpace(alias)
	return fmt.Sprintf(`(
	CASE
		WHEN %s THEN %s = %s
		ELSE UPPER(TRIM(%s.dre)) = UPPER(TRIM(%s))
	END
)`, canonicalSchoolDREColumnSQL, schoolCanonicalDREIDExpr(alias), dreIDParam, alias, dreNameParam)
}

// schoolDRENameExpr keeps the public API contract textual while deriving that
// name from the master DRE whenever the canonical relationship exists.
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

// analyticsDREPredicate is used by the shared analytics view, where only
// school_id and the legacy textual dre projection are available. On canonical
// schemas it re-resolves the school through schools.dre_id -> dres.id; the view's
// textual dre field is ignored for filtering.
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
