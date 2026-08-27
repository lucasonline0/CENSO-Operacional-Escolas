package main

import (
	"database/sql"
	"fmt"
	"math/rand"
	"testing"
	"time"
)

func setupDRE207Schema(t *testing.T) *sql.Tx {
	t.Helper()
	db := openDREIntegrationDB(t)
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin #207 transaction: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })

	schema := fmt.Sprintf("dre207_%d", time.Now().UnixNano())
	if _, err := tx.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatalf("create #207 schema: %v", err)
	}
	if _, err := tx.Exec(`SET LOCAL search_path TO ` + schema + `, public`); err != nil {
		t.Fatalf("set #207 search_path: %v", err)
	}
	if _, err := tx.Exec(`
		CREATE TABLE dres (
			id SERIAL PRIMARY KEY,
			nome VARCHAR(255) UNIQUE NOT NULL,
			ativa BOOLEAN NOT NULL DEFAULT true
		);
		CREATE TABLE schools (
			id SERIAL PRIMARY KEY,
			nome_escola VARCHAR(255) NOT NULL DEFAULT '',
			codigo_inep VARCHAR(32),
			municipio VARCHAR(128),
			dre VARCHAR(100),
			zona VARCHAR(64)
		);
		CREATE TABLE admin_users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(64) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role VARCHAR(32) NOT NULL,
			dre VARCHAR(128),
			active BOOLEAN NOT NULL DEFAULT true
		);
		CREATE TABLE census_responses (
			id SERIAL PRIMARY KEY,
			school_id INTEGER NOT NULL REFERENCES schools(id),
			year INTEGER NOT NULL,
			status VARCHAR(32) NOT NULL,
			data JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			sheet_synced_at TIMESTAMPTZ
		);
		CREATE TABLE reg_integracao (
			municipio VARCHAR(128) NOT NULL,
			regiao_de_integracao VARCHAR(128) NOT NULL
		);
	`); err != nil {
		t.Fatalf("create #207 base tables: %v", err)
	}
	if _, err := tx.Exec(canonicalMigrationSQL(t)); err != nil {
		t.Fatalf("apply migration 0020 in #207 schema: %v", err)
	}
	return tx
}

func seedDRE207Fixture(t *testing.T, tx *sql.Tx) (dreA, dreB, schoolA1, schoolA2, schoolB int) {
	t.Helper()
	if err := tx.QueryRow(`INSERT INTO dres (nome, ativa) VALUES ('DRE ALPHA', true) RETURNING id`).Scan(&dreA); err != nil {
		t.Fatalf("seed DRE A: %v", err)
	}
	if err := tx.QueryRow(`INSERT INTO dres (nome, ativa) VALUES ('DRE BETA', true) RETURNING id`).Scan(&dreB); err != nil {
		t.Fatalf("seed DRE B: %v", err)
	}
	insertSchool := func(name, inep string, dreID int) int {
		var id int
		if err := tx.QueryRow(`
			INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id)
			VALUES ($1, $2, 'BELEM', 'Urbana', $3)
			RETURNING id
		`, name, inep, dreID).Scan(&id); err != nil {
			t.Fatalf("seed school %s: %v", inep, err)
		}
		return id
	}
	schoolA1 = insertSchool("Alpha 1", "20700001", dreA)
	schoolA2 = insertSchool("Alpha 2", "20700002", dreA)
	schoolB = insertSchool("Beta 1", "20700003", dreB)

	if _, err := tx.Exec(`
		INSERT INTO census_responses (school_id, year, status, data) VALUES
			($1, 2026, 'completed', '{"total_alunos": 120}'::jsonb),
			($2, 2026, 'draft',     '{"total_alunos": 999}'::jsonb),
			($3, 2026, 'completed', '{"total_alunos": 80}'::jsonb)
	`, schoolA1, schoolA2, schoolB); err != nil {
		t.Fatalf("seed census #207: %v", err)
	}
	return
}

func corruptDRE207LegacyText(t *testing.T, tx *sql.Tx, dreA, dreB int) {
	t.Helper()
	// Simula dado textual stale/corrompido. A aplicação pós-0020 não pode usar
	// esse texto para decidir escopo. O trigger é desabilitado apenas dentro do
	// schema/transaction isolado do teste.
	if _, err := tx.Exec(`ALTER TABLE schools DISABLE TRIGGER USER`); err != nil {
		t.Fatalf("disable compatibility trigger: %v", err)
	}
	if _, err := tx.Exec(`
		UPDATE schools
		SET dre = CASE
			WHEN dre_id = $1 THEN 'DRE BETA'
			WHEN dre_id = $2 THEN 'DRE ALPHA'
			ELSE dre
		END
	`, dreA, dreB); err != nil {
		t.Fatalf("corrupt legacy text: %v", err)
	}
}

func countSchoolsByCanonicalName207(t *testing.T, tx *sql.Tx, name string) int {
	t.Helper()
	var count int
	query := `SELECT COUNT(*) FROM schools s WHERE ` + schoolDRENamePredicate("s", "$1")
	if err := tx.QueryRow(query, name).Scan(&count); err != nil {
		t.Fatalf("count canonical name %q: %v", name, err)
	}
	return count
}

func TestDREIDScopeCanonicalIgnoresStaleLegacyText(t *testing.T) {
	tx := setupDRE207Schema(t)
	dreA, dreB, schoolA1, _, _ := seedDRE207Fixture(t, tx)
	corruptDRE207LegacyText(t, tx, dreA, dreB)

	if got := countSchoolsByCanonicalName207(t, tx, "DRE ALPHA"); got != 2 {
		t.Fatalf("canonical ALPHA count=%d; want 2 despite stale text", got)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE BETA"); got != 1 {
		t.Fatalf("canonical BETA count=%d; want 1 despite stale text", got)
	}

	var displayed string
	if err := tx.QueryRow(`SELECT `+schoolDRENameExpr("s")+` FROM schools s WHERE s.id=$1`, schoolA1).Scan(&displayed); err != nil {
		t.Fatalf("canonical display name: %v", err)
	}
	if displayed != "DRE ALPHA" {
		t.Fatalf("displayed DRE=%q; want master name DRE ALPHA", displayed)
	}

	var scopedCount int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM schools s WHERE `+schoolDREAuthorizationPredicate("s", "$1", "$2"), dreA, "DRE BETA").Scan(&scopedCount); err != nil {
		t.Fatalf("canonical authorization predicate: %v", err)
	}
	if scopedCount != 2 {
		t.Fatalf("ID scope count=%d; want 2; stale/wrong name must be ignored", scopedCount)
	}

	// Rename só altera dres.nome. O vínculo, contagens e filtros devem sobreviver
	// mesmo com o texto legado deliberadamente errado.
	if _, err := tx.Exec(`UPDATE dres SET nome='DRE ALPHA RENAMED' WHERE id=$1`, dreA); err != nil {
		t.Fatalf("rename master DRE: %v", err)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE ALPHA"); got != 0 {
		t.Fatalf("old name still filters %d schools after rename", got)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE ALPHA RENAMED"); got != 2 {
		t.Fatalf("new name count=%d; want 2 after rename", got)
	}

	var summaryName string
	var total, completed int
	var totalStudents float64
	var summaryID int
	if err := tx.QueryRow(dreSummarySelectSQL, dreA, 2026).Scan(&summaryID, &summaryName, &total, &totalStudents, &completed); err != nil {
		t.Fatalf("canonical DRE summary: %v", err)
	}
	if summaryID != dreA || summaryName != "DRE ALPHA RENAMED" || total != 2 || completed != 1 || totalStudents != 120 {
		t.Fatalf("summary changed after rename: id=%d name=%q total=%d completed=%d students=%.0f", summaryID, summaryName, total, completed, totalStudents)
	}

	f := AnalyticsFilters{Year: 2026, DRE: "DRE ALPHA RENAMED"}
	viewQuery := `
		SELECT COUNT(*)
		FROM (
			SELECT cr.id AS census_id, cr.school_id, cr.status, cr.year,
			       s.dre, s.municipio, s.zona, COALESCE(s.codigo_inep, '') AS codigo_inep
			FROM census_responses cr
			JOIN schools s ON s.id=cr.school_id
		) analytics_view
		WHERE ` + f.WhereSQL()
	if err := tx.QueryRow(viewQuery, f.Args()...).Scan(&scopedCount); err != nil {
		t.Fatalf("shared analytics canonical filter: %v", err)
	}
	if scopedCount != 1 {
		t.Fatalf("completed analytics rows=%d; want 1 for renamed ALPHA", scopedCount)
	}

	// Simula claim/nome stale: DREID deve dominar no endpoint de preenchimento.
	pf := preenchimentoDreFilters{Year: 2026, DREID: dreA, DRE: "NOME STALE DO TOKEN"}
	rows, err := tx.Query(preenchimentoDreScopedSelectSQL,
		pf.Year, pf.DRE, pf.Municipio, pf.Zona, pf.RegiaoIntegracao, pf.SchoolID, pf.CodigoINEP, pf.DREID)
	if err != nil {
		t.Fatalf("preenchimento canonical by ID: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Fatalf("preenchimento did not return canonical DRE")
	}
	var rowName string
	var rowTotal, rowCompleted, rowDraft int
	if err := rows.Scan(&rowName, &rowTotal, &rowCompleted, &rowDraft); err != nil {
		t.Fatalf("scan preenchimento canonical: %v", err)
	}
	if rowName != "DRE ALPHA RENAMED" || rowTotal != 2 || rowCompleted != 1 || rowDraft != 1 {
		t.Fatalf("preenchimento mismatch: name=%q total=%d completed=%d draft=%d", rowName, rowTotal, rowCompleted, rowDraft)
	}
}

func TestDREIDScopeRemapChangesScopeByID(t *testing.T) {
	tx := setupDRE207Schema(t)
	dreA, dreB, schoolA1, _, _ := seedDRE207Fixture(t, tx)
	corruptDRE207LegacyText(t, tx, dreA, dreB)

	// Trigger segue desabilitado: o texto permanece propositalmente stale. Só o
	// ID muda, e isso deve ser suficiente para todos os filtros canônicos.
	if _, err := tx.Exec(`UPDATE schools SET dre_id=$1, dre='DRE ALPHA' WHERE id=$2`, dreB, schoolA1); err != nil {
		t.Fatalf("remap by dre_id: %v", err)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE ALPHA"); got != 1 {
		t.Fatalf("origin count after remap=%d; want 1", got)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE BETA"); got != 2 {
		t.Fatalf("destination count after remap=%d; want 2", got)
	}
	var targetID int
	if err := tx.QueryRow(`SELECT `+schoolDREIDExpr("s")+` FROM schools s WHERE id=$1`, schoolA1).Scan(&targetID); err != nil {
		t.Fatalf("read canonical remap ID: %v", err)
	}
	if targetID != dreB {
		t.Fatalf("remapped dre_id=%d; want %d", targetID, dreB)
	}
}

func TestDREIDScopePostgreSQLStress10000Relations(t *testing.T) {
	tx := setupDRE207Schema(t)
	var dreA, dreB int
	if err := tx.QueryRow(`INSERT INTO dres (nome) VALUES ('DRE STRESS A') RETURNING id`).Scan(&dreA); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(`INSERT INTO dres (nome) VALUES ('DRE STRESS B') RETURNING id`).Scan(&dreB); err != nil {
		t.Fatal(err)
	}

	if _, err := tx.Exec(`
		INSERT INTO schools (nome_escola, codigo_inep, municipio, zona, dre_id)
		SELECT
			'Stress ' || g,
			'207S' || LPAD(g::text, 6, '0'),
			'BELEM',
			'Urbana',
			CASE WHEN g <= 5000 THEN $1::integer ELSE $2::integer END
		FROM generate_series(1, 10000) g
	`, dreA, dreB); err != nil {
		t.Fatalf("seed 10k canonical schools: %v", err)
	}
	if _, err := tx.Exec(`ALTER TABLE schools DISABLE TRIGGER USER`); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(`
		UPDATE schools SET dre = CASE WHEN dre_id=$1 THEN 'DRE STRESS B' ELSE 'DRE STRESS A' END
	`, dreA); err != nil {
		t.Fatalf("invert 10k legacy names: %v", err)
	}

	if got := countSchoolsByCanonicalName207(t, tx, "DRE STRESS A"); got != 5000 {
		t.Fatalf("10k stress A=%d; want 5000", got)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE STRESS B"); got != 5000 {
		t.Fatalf("10k stress B=%d; want 5000", got)
	}
	if _, err := tx.Exec(`UPDATE dres SET nome='DRE STRESS A RENAMED' WHERE id=$1`, dreA); err != nil {
		t.Fatal(err)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE STRESS A RENAMED"); got != 5000 {
		t.Fatalf("10k stress renamed A=%d; want 5000", got)
	}
	if got := countSchoolsByCanonicalName207(t, tx, "DRE STRESS A"); got != 0 {
		t.Fatalf("10k stress old A name still matched %d rows", got)
	}
}

func TestDREIDAuthorizationProperties20000Scenarios(t *testing.T) {
	rng := rand.New(rand.NewSource(207))
	for i := 0; i < 20000; i++ {
		id := rng.Intn(5000) + 1
		other := rng.Intn(5000) + 1
		scope := AdminAccessScope{Role: RoleDRE, DREID: id, DRE: "texto deliberadamente irrelevante"}
		if !scope.IsAuthorizedForDREID(id) {
			t.Fatalf("scenario %d: same canonical ID denied: %d", i, id)
		}
		wantOther := other == id
		if got := scope.IsAuthorizedForDREID(other); got != wantOther {
			t.Fatalf("scenario %d: authorization(%d -> %d)=%v want %v", i, id, other, got, wantOther)
		}
		admin := AdminAccessScope{Role: RoleAdmin}
		if !admin.IsAuthorizedForDREID(other) {
			t.Fatalf("scenario %d: admin denied target %d", i, other)
		}
	}

	invalid := []int{-100, -1, 0}
	for _, id := range invalid {
		if (AdminAccessScope{Role: RoleDRE, DREID: id}).IsAuthorizedForDREID(1) {
			t.Fatalf("invalid scope DREID %d authorized", id)
		}
		if (AdminAccessScope{Role: RoleDRE, DREID: 1}).IsAuthorizedForDREID(id) {
			t.Fatalf("invalid target DREID %d authorized", id)
		}
	}
}
