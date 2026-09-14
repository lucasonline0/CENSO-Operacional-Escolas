package main

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
		"shared analytics":         AnalyticsFilters{Year: 2026, DREID: 9, DRE: "STALE"}.WhereSQL(),
		"merenda escolas":          merendaEscolasSelectSQL,
		"servicos escolas":         servicosEscolasSelectSQL,
		"caracterizacao escolas":   caracterizacaoEscolasSelectSQL,
		"pessoal escolas":          pessoalEscolasSelectSQL,
		"tecnologia escolas":       tecnologiaEscolasSelectSQL,
		"indice governanca":        indiceGovernancaSelectSQL,
		"governanca institucional": governancaInstitucionalScopedWhereSQL,
		"saude operacional":        saudeOperacionalSelectSQL,
		"ideb":                     idebFromWhere,
		"prodep":                   prodepWhereSQL,
		"relatorio preenchimento":  censoPreenchimentoSelectSQL,
		"relatorio infraestrutura": infraestruturaSelectSQL,
		"relatorio merenda":        merendaSelectSQL,
		"relatorio financeiro":     financeiroGovernancaSelectSQL,
	}
	for name, sqlText := range checks {
		t.Run(name, func(t *testing.T) {
			if !strings.Contains(sqlText, "dre_id") {
				t.Fatalf("SQL ativo não contém caminho canônico dre_id")
			}
		})
	}
}
