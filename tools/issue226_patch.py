from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    (ROOT / path).write_text(text)


def rep(path, old, new, expected=1):
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new))


def rep_re(path, pattern, repl, expected=1, flags=0):
    text = read(path)
    new, count = re.subn(pattern, repl, text, flags=flags)
    if count != expected:
        raise SystemExit(f"{path}: regex expected {expected}, found {count}: {pattern[:100]!r}")
    write(path, new)


# -----------------------------------------------------------------------------
# Shared analytics contract: DREID is authorization-only and becomes $8.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_filtros.go"
rep(p,
    'drePredicate := analyticsDREPredicate("school_id", "dre", "$2")',
    'drePredicate := analyticsDREScopedFilterPredicate("school_id", "dre", "$8", "$2")')
rep(p,
    '      AND ($2 = \'\' OR ` + drePredicate + `)\n',
    '      AND ` + drePredicate + `\n')
rep(p,
    'return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP}',
    'return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP, f.DREID}')
rep(p,
    '// $6=school_id and $7=codigo_inep. Empty strings and school_id zero disable\n',
    '// $6=school_id, $7=codigo_inep and $8=dre_id do escopo autenticado. Empty strings and school_id zero disable\n')

# -----------------------------------------------------------------------------
# Core analytics: overview, caracterização and offer/functionality queries.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics.go"
# Overview scoped schools uses f.Args(), now including $8.
rep(p,
    "\t\t\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
    "\t\t\tWHERE `+schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\")+`",
    expected=1)
# Por zona uses bespoke args (DRE is $1, DREID appended as $7).
rep(p,
    "\t\tWHERE ($1 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($1)))",
    "\t\tWHERE `+schoolDREScopedFilterPredicate(\"s\", \"$7\", \"$1\")+`",
    expected=1)
rep(p,
    "\t`, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP)",
    "\t`, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP, f.DREID)",
    expected=1)
# Shared view CTE, direct ambiente view and offer/functionality school queries.
rep(p, "const coberturaEssenciaisCTEParam = `", "var coberturaEssenciaisCTEParam = `")
rep(p,
    "      AND ($2 = '' OR e.dre = $2)",
    "      AND ` + analyticsDREScopedFilterPredicate(\"e.school_id\", \"e.dre\", \"$8\", \"$2\") + `")
rep(p,
    "\t\t  AND ($2 = '' OR a.dre = $2)",
    "\t\t  AND `+analyticsDREScopedFilterPredicate(\"a.school_id\", \"a.dre\", \"$8\", \"$2\")+`",
    expected=1)
rep(p,
    "\t\t\t  AND ($2 = '' OR s.dre = $2)",
    "\t\t\t  AND `+schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\")+`",
    expected=4)
# Caracterização school list: canonical display/filter/order.
rep(p, "const caracterizacaoEscolasSelectSQL = `", "var caracterizacaoEscolasSelectSQL = `")
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')              AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + `                                      AS dre,",
    expected=1)
rep(p,
    "\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
    "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\") + `",
    expected=1)
rep(p,
    "\tORDER BY UPPER(TRIM(s.dre)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep",
    "\tORDER BY UPPER(TRIM(` + schoolDRENameExpr(\"s\") + `)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep",
    expected=1)
rep(p,
    "\t\tf.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP)",
    "\t\tf.Args()...)",
    expected=1)

# -----------------------------------------------------------------------------
# Merenda / serviços school-by-school tables.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_infra_merenda_servicos.go"
for name in ("merendaEscolasSelectSQL", "servicosEscolasSelectSQL"):
    rep(p, f"const {name} = `", f"var {name} = `")
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')              AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + `                                      AS dre,",
    expected=1)
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')                   AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + `                                           AS dre,",
    expected=1)
rep(p,
    "\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
    "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\") + `",
    expected=2)
rep(p,
    "\tORDER BY UPPER(TRIM(s.dre)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep",
    "\tORDER BY UPPER(TRIM(` + schoolDRENameExpr(\"s\") + `)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep",
    expected=2)
# Both direct-list callers use the standard 7 filters; f.Args adds DREID.
rep(p,
    "\t\tf.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP)",
    "\t\tf.Args()...)",
    expected=2)

# -----------------------------------------------------------------------------
# Índice de Governança direct schools query.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_indice_governanca.go"
rep(p, "const indiceGovernancaSelectSQL = `", "var indiceGovernancaSelectSQL = `")
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + ` AS dre,")
rep(p,
    "\tWHERE ($1 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($1)))",
    "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$7\", \"$1\") + `")
rep(p,
    "\t\tfilters.DRE, filters.Municipio, filters.Zona, filters.RegiaoIntegracao, filters.SchoolID, filters.CodigoINEP,",
    "\t\tfilters.DRE, filters.Municipio, filters.Zona, filters.RegiaoIntegracao, filters.SchoolID, filters.CodigoINEP, filters.DREID,",
    expected=1)

# -----------------------------------------------------------------------------
# Governança institucional view: resolve school_id canonically.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_governanca_institucional.go"
rep(p, "const governancaInstitucionalWhereSQL = `", "var governancaInstitucionalWhereSQL = `")
rep(p,
    "\tWHERE ($1 = '' OR UPPER(TRIM(dre)) = UPPER(TRIM($1)))",
    "\tWHERE ($1 = '' OR ` + analyticsDREPredicate(\"school_id\", \"dre\", \"$1\") + `)",
    expected=1)
rep(p, "const governancaInstitucionalScopedWhereSQL = `", "var governancaInstitucionalScopedWhereSQL = `")
rep(p,
    "\tWHERE ($1 = '' OR UPPER(TRIM(dre)) = UPPER(TRIM($1)))",
    "\tWHERE ` + analyticsDREScopedFilterPredicate(\"school_id\", \"dre\", \"$7\", \"$1\") + `",
    expected=1)
rep(p,
    "\t\tshared.CodigoINEP,\n\t}",
    "\t\tshared.CodigoINEP,\n\t\tshared.DREID,\n\t}",
    expected=1)

# -----------------------------------------------------------------------------
# Saúde Operacional: global dataset is scoped at schools before pagination.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_saude_operacional.go"
rep(p,
    "type saudeOperacionalFilters struct {\n\tDRE              string",
    "type saudeOperacionalFilters struct {\n\tDREID            int\n\tDRE              string")
rep(p,
    "\treturn saudeOperacionalFilters{\n\t\tDRE:              shared.DRE,",
    "\treturn saudeOperacionalFilters{\n\t\tDREID:            shared.DREID,\n\t\tDRE:              shared.DRE,")
rep(p, "const saudeOperacionalSelectSQL = `", "var saudeOperacionalSelectSQL = `")
rep(p,
    "\t\tCOALESCE(s.dre, ''),",
    "\t\t` + schoolDRENameExpr(\"s\") + `,")
rep(p,
    "\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
    "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\") + `")
rep(p,
    "\t\tf.CodigoINEP,\n\t}",
    "\t\tf.CodigoINEP,\n\t\tf.DREID,\n\t}",
    expected=1)

# -----------------------------------------------------------------------------
# IDEB: DRE role must require school_id + canonical dre_id, not textual s.dre.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_perfil_alunos_ideb.go"
rep(p,
    "\tRequireLinkedSchool bool\n}",
    "\tRequireLinkedSchool bool\n\tDREID               int\n}")
rep(p,
    "\t\tf.RequireLinkedSchool, // $13\n\t}",
    "\t\tf.RequireLinkedSchool, // $13\n\t\tf.DREID,               // $14\n\t}")
rep(p,
    "\tf.CodigoINEP = shared.CodigoINEP\n",
    "\tf.CodigoINEP = shared.CodigoINEP\n\tf.DREID = shared.DREID\n",
    expected=1)
rep(p, "const idebFromWhere = `", "var idebFromWhere = `")
rep(p,
    "\t  AND ($3 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($3)))",
    "\t  AND ` + schoolDREScopedFilterPredicate(\"s\", \"$14\", \"$3\") + `")
rep(p,
    "\t\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,",
    "\t\t\t` + schoolDRENameExpr(\"s\") + ` AS dre,")
rep(p,
    "\t\t\t\ts.dre AS dre, s.municipio AS municipio,",
    "\t\t\t\t` + schoolDRENameExpr(\"s\") + ` AS dre, s.municipio AS municipio,")

# -----------------------------------------------------------------------------
# PRODEP: for a DRE profile canonical linked school wins over imported DRE text.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_financeiro_governanca.go"
rep(p,
    "\tRequireLinkedDRE      bool\n}",
    "\tRequireLinkedDRE      bool\n\tDREID                 int\n}")
rep(p,
    "\t\tf.CodigoINEP,\n\t}",
    "\t\tf.CodigoINEP,\n\t\tf.DREID,\n\t}",
    expected=1)
rep(p,
    "\t  AND ($3 = '' OR ` + sqlNormalizeProdep(\"COALESCE(dre_prodep, '')\", \"DRE\") + ` = ` + sqlNormalizeProdep(\"$3::text\", \"DRE\") + `)",
    "\t  AND ($8 = true OR $3 = '' OR ` + sqlNormalizeProdep(\"COALESCE(dre_prodep, '')\", \"DRE\") + ` = ` + sqlNormalizeProdep(\"$3::text\", \"DRE\") + `)")
rep(p,
    "\t  AND ($8 = false OR ($3 <> '' AND EXISTS (\n\t        SELECT 1\n\t        FROM schools scope_s\n\t        WHERE (scope_s.id = prodep_repasses.school_id OR scope_s.id = prodep_repasses.school_id_sede)\n\t          AND UPPER(TRIM(scope_s.dre)) = UPPER(TRIM($3))\n\t      )))",
    "\t  AND ($8 = false OR ($11 > 0 AND EXISTS (\n\t        SELECT 1\n\t        FROM schools scope_s\n\t        WHERE (scope_s.id = prodep_repasses.school_id OR scope_s.id = prodep_repasses.school_id_sede)\n\t          AND ` + schoolDREAuthorizationPredicate(\"scope_s\", \"$11\", \"$3\") + `\n\t      )))")
# apply scope function: copy DREID next to RequireLinkedDRE.
rep(p,
    "\t\tf.RequireLinkedDRE = true\n",
    "\t\tf.RequireLinkedDRE = true\n\t\tf.DREID = shared.DREID\n",
    expected=1)

# -----------------------------------------------------------------------------
# Pessoal / Tecnologia views and direct school tables.
# -----------------------------------------------------------------------------
p = "api/cmd/api/analytics_pessoal_tecnologia.go"
# Every handler has a shared filter block ending in CodigoINEP. Add one scopeArgs
# local and use it for the repeated queries in that handler.
marker = "\tcodigoINEP := sharedFilters.CodigoINEP\n"
text = read(p)
count = text.count(marker)
if count != 5:
    raise SystemExit(f"{p}: expected 5 shared filter markers, found {count}")
text = text.replace(marker, marker + "\tscopeArgs := []any{year, dre, municipio, zona, porte, regiaoIntegracao, schoolID, codigoINEP, sharedFilters.DREID}\n")
write(p, text)
# Convert local const SQLs to variables so they can call helper builders.
text = read(p)
text = text.replace("\tconst baseQuery = `", "\tbaseQuery := `")
text = text.replace("\tconst baseWhere = `", "\tbaseWhere := `")
write(p, text)
# View filters: all standard handlers use $9 for DREID.
rep(p,
    "\t\t  AND ($2 = '' OR v.dre = $2)",
    "\t\t  AND `+analyticsDREScopedFilterPredicate(\"v.school_id\", \"v.dre\", \"$9\", \"$2\")+`",
    expected=5)
rep(p,
    "\t\t  AND ($2 = '' OR b.dre = $2)",
    "\t\t  AND `+analyticsDREScopedFilterPredicate(\"b.school_id\", \"b.dre\", \"$9\", \"$2\")+`",
    expected=1)
# Replace repeated positional lists with scopeArgs.
text = read(p)
pat = "year, dre, municipio, zona, porte, regiaoIntegracao, schoolID, codigoINEP"
occ = text.count(pat)
if occ < 10:
    raise SystemExit(f"{p}: too few positional arg lists before patch: {occ}")
text = text.replace(pat, "scopeArgs...")
write(p, text)
# The replacement above also touched scopeArgs declarations; repair them.
rep(p,
    "scopeArgs := []any{scopeArgs..., sharedFilters.DREID}",
    "scopeArgs := []any{year, dre, municipio, zona, porte, regiaoIntegracao, schoolID, codigoINEP, sharedFilters.DREID}",
    expected=5)
# Quadro aggregation returns/group by canonical master name.
rep(p,
    "\t\t\tv.dre,\n\t\t\tCOUNT(DISTINCT v.school_id)::bigint,",
    "\t\t\t`+analyticsDRENameExpr(\"v.school_id\", \"v.dre\")+` AS dre,\n\t\t\tCOUNT(DISTINCT v.school_id)::bigint,",
    expected=1)
rep(p,
    "\t\tGROUP BY v.dre\n",
    "\t\tGROUP BY `+analyticsDRENameExpr(\"v.school_id\", \"v.dre\")+`\n",
    expected=1)
# Direct tables.
for name in ("pessoalEscolasSelectSQL", "tecnologiaEscolasSelectSQL"):
    rep(p, f"const {name} = `", f"var {name} = `")
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')                   AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + `                                           AS dre,",
    expected=1)
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')              AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + `                                      AS dre,",
    expected=1)
rep(p,
    "\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
    "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\") + `",
    expected=2)
rep(p,
    "\tORDER BY UPPER(TRIM(s.dre)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep",
    "\tORDER BY UPPER(TRIM(` + schoolDRENameExpr(\"s\") + `)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep",
    expected=2)
rep(p,
    "\t\tf.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP)",
    "\t\tf.Args()...)",
    expected=2)

# -----------------------------------------------------------------------------
# Reports: authenticated DREID must reach every XLSX builder.
# -----------------------------------------------------------------------------
p = "api/cmd/api/reports.go"
rep(p,
    "type reportFilters struct {\n\tYear             int // 0 = todos os anos",
    "type reportFilters struct {\n\tYear             int // 0 = todos os anos\n\tDREID            int")
rep(p,
    "return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP}",
    "return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP, f.DREID}")
rep(p,
    "\tf.DRE = shared.DRE\n",
    "\tf.DRE = shared.DRE\n\tf.DREID = shared.DREID\n",
    expected=1)
rep(p, "const censoPreenchimentoSelectSQL = `", "var censoPreenchimentoSelectSQL = `")
rep(p,
    "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,",
    "\t\t` + schoolDRENameExpr(\"s\") + ` AS dre,")
rep(p,
    "\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
    "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\") + `")
rep(p,
    "\t\tUPPER(TRIM(s.dre)),",
    "\t\tUPPER(TRIM(` + schoolDRENameExpr(\"s\") + `)),",
    expected=1)

for p, sqlname in [
    ("api/cmd/api/reports_infraestrutura.go", "infraestruturaSelectSQL"),
    ("api/cmd/api/reports_merenda.go", "merendaSelectSQL"),
    ("api/cmd/api/reports_financeiro_governanca.go", "financeiroGovernancaSelectSQL"),
]:
    rep(p, f"const {sqlname} = `", f"var {sqlname} = `")
    rep(p,
        "\t\tCOALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,",
        "\t\t` + schoolDRENameExpr(\"s\") + ` AS dre,")
    rep(p,
        "\tWHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
        "\tWHERE ` + schoolDREScopedFilterPredicate(\"s\", \"$8\", \"$2\") + `")
    rep(p,
        "\t\tUPPER(TRIM(s.dre)),",
        "\t\tUPPER(TRIM(` + schoolDRENameExpr(\"s\") + `)),",
        expected=1)

# Saúde XLSX delegates to the shared dataset: propagate auth-only DREID.
p = "api/cmd/api/reports_saude_operacional.go"
rep(p,
    "\tsoFilters := saudeOperacionalFilters{\n\t\tDRE:              f.DRE,",
    "\tsoFilters := saudeOperacionalFilters{\n\t\tDREID:            f.DREID,\n\t\tDRE:              f.DRE,")

# -----------------------------------------------------------------------------
# Regression tests for the P0 trust boundary and long names.
# -----------------------------------------------------------------------------
test_path = ROOT / "api/cmd/api/dre_scope_all_endpoints_test.go"
test_path.write_text(r'''package main

import (
    "strings"
    "testing"
)

func TestDRECanonicalScopedPredicateIgnoresForgedLegacyTextAndLongName(t *testing.T) {
    tx := setupDRE207Schema(t)

    longName := "DRE " + strings.Repeat("REGIONAL-CANONICA-", 8)
    if len(longName) <= 100 {
        t.Fatalf("fixture precisa exceder 100 caracteres: %d", len(longName))
    }

    var targetID, otherID int
    if err := tx.QueryRow(`INSERT INTO dres (nome, ativa) VALUES ($1, true) RETURNING id`, longName).Scan(&targetID); err != nil {
        t.Fatalf("seed long DRE: %v", err)
    }
    if err := tx.QueryRow(`INSERT INTO dres (nome, ativa) VALUES ('DRE OUTRA', true) RETURNING id`).Scan(&otherID); err != nil {
        t.Fatalf("seed other DRE: %v", err)
    }

    var targetSchool, otherSchool int
    if err := tx.QueryRow(`INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id) VALUES ('Longa', '22600001', 'BELEM', 'Urbana', $1) RETURNING id`, targetID).Scan(&targetSchool); err != nil {
        t.Fatalf("seed target school: %v", err)
    }
    if err := tx.QueryRow(`INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id) VALUES ('Outra', '22600002', 'BELEM', 'Urbana', $1) RETURNING id`, otherID).Scan(&otherSchool); err != nil {
        t.Fatalf("seed other school: %v", err)
    }

    if _, err := tx.Exec(`ALTER TABLE schools DISABLE TRIGGER USER`); err != nil {
        t.Fatalf("disable compatibility trigger: %v", err)
    }
    // Corrupt both legacy texts in opposite directions. Authorization must still
    // follow dre_id: this also models the >100-char truncation problem.
    if _, err := tx.Exec(`UPDATE schools SET dre = CASE WHEN id=$1 THEN 'TEXTO TRUNCADO/STALE' WHEN id=$2 THEN LEFT($3, 100) ELSE dre END`, targetSchool, otherSchool, longName); err != nil {
        t.Fatalf("corrupt legacy text: %v", err)
    }

    predicate := schoolDREScopedFilterPredicate("s", "$1", "$2")
    var count int
    if err := tx.QueryRow(`SELECT COUNT(*) FROM schools s WHERE `+predicate, targetID, "NOME COMPLETAMENTE STALE").Scan(&count); err != nil {
        t.Fatalf("canonical school predicate: %v", err)
    }
    if count != 1 {
        t.Fatalf("canonical scope count=%d; want 1", count)
    }

    var shown string
    if err := tx.QueryRow(`SELECT `+schoolDRENameExpr("s")+` FROM schools s WHERE id=$1`, targetSchool).Scan(&shown); err != nil {
        t.Fatalf("canonical display: %v", err)
    }
    if shown != longName {
        t.Fatalf("display name came from legacy text: got %q want %q", shown, longName)
    }

    // Simulate a view that exposes school_id + stale dre. DREID must still be
    // sufficient to identify exactly one row; the text is deliberately wrong.
    analyticsPredicate := analyticsDREScopedFilterPredicate("school_id", "dre", "$1", "$2")
    viewQuery := `SELECT COUNT(*) FROM (SELECT id AS school_id, dre FROM schools) v WHERE ` + analyticsPredicate
    if err := tx.QueryRow(viewQuery, targetID, "STALE VIEW NAME").Scan(&count); err != nil {
        t.Fatalf("canonical analytics predicate: %v", err)
    }
    if count != 1 {
        t.Fatalf("canonical analytics scope count=%d; want 1", count)
    }
}

func TestIssue226ActiveSQLCarriesDREID(t *testing.T) {
    checks := map[string]string{
        "shared analytics": AnalyticsFilters{Year: 2026, DREID: 9, DRE: "STALE"}.WhereSQL(),
        "merenda escolas": merendaEscolasSelectSQL,
        "servicos escolas": servicosEscolasSelectSQL,
        "caracterizacao escolas": caracterizacaoEscolasSelectSQL,
        "pessoal escolas": pessoalEscolasSelectSQL,
        "tecnologia escolas": tecnologiaEscolasSelectSQL,
        "indice governanca": indiceGovernancaSelectSQL,
        "governanca institucional": governancaInstitucionalScopedWhereSQL,
        "saude operacional": saudeOperacionalSelectSQL,
        "ideb": idebFromWhere,
        "prodep": prodepWhereSQL,
        "relatorio preenchimento": censoPreenchimentoSelectSQL,
        "relatorio infraestrutura": infraestruturaSelectSQL,
        "relatorio merenda": merendaSelectSQL,
        "relatorio financeiro": financeiroGovernancaSelectSQL,
    }
    for name, sqlText := range checks {
        t.Run(name, func(t *testing.T) {
            if !strings.Contains(sqlText, "dre_id") {
                t.Fatalf("SQL ativo não contém caminho canônico dre_id")
            }
        })
    }
}
''')

print("issue #226 patch applied")
