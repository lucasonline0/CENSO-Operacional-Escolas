package main

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"testing"
	"time"
)

func newMigrationTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL não configurada")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	schema := fmt.Sprintf("dre_migration_%d", time.Now().UnixNano())
	if _, err := db.Exec("CREATE SCHEMA " + schema); err != nil {
		db.Close()
		t.Fatalf("create schema: %v", err)
	}
	if _, err := db.Exec("SET search_path TO " + schema); err != nil {
		db.Close()
		t.Fatalf("set search_path: %v", err)
	}

	t.Cleanup(func() {
		_, _ = db.Exec("SET search_path TO public")
		_, _ = db.Exec("DROP SCHEMA IF EXISTS " + schema + " CASCADE")
		_ = db.Close()
	})
	return db
}

func execEmbeddedMigration(t *testing.T, db *sql.DB, name string) {
	t.Helper()
	content, err := migrationsFS.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	if _, err := db.Exec(string(content)); err != nil {
		t.Fatalf("exec %s: %v", name, err)
	}
}

func seedSchoolsWithDependentView(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`
		CREATE TABLE schools (
			id SERIAL PRIMARY KEY,
			dre VARCHAR(100)
		);
		CREATE VIEW vw_test_school_dre AS SELECT id, dre FROM schools;
	`)
	if err != nil {
		t.Fatalf("seed schools/view: %v", err)
	}
}

func TestCriticalAdministrativeMigrationsCleanAndIdempotent(t *testing.T) {
	db := newMigrationTestDB(t)
	seedSchoolsWithDependentView(t, db)
	logger := log.New(io.Discard, "", 0)

	if err := applyMigrations(db, logger); err != nil {
		t.Fatalf("first applyMigrations: %v", err)
	}
	if err := applyMigrations(db, logger); err != nil {
		t.Fatalf("second applyMigrations must be idempotent: %v", err)
	}

	if _, err := db.Exec(`INSERT INTO dres (nome) VALUES ('DRE BELEM')`); err != nil {
		t.Fatalf("insert first DRE: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO dres (nome) VALUES ('  dre belem  ')`); err == nil {
		t.Fatal("expected normalized DRE unique index to reject case/space equivalent name")
	}

	if _, err := db.Exec(`
		INSERT INTO admin_users (username, password_hash, role, active)
		VALUES ('RegionalUser', 'hash', 'admin', true)`); err != nil {
		t.Fatalf("insert first username: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO admin_users (username, password_hash, role, active)
		VALUES ('  regionaluser  ', 'hash', 'admin', true)`); err == nil {
		t.Fatal("expected normalized username unique index to reject case/space equivalent username")
	}
}

func TestCriticalMigrationFailsClosedOnLegacyUsernameCollision(t *testing.T) {
	db := newMigrationTestDB(t)
	seedSchoolsWithDependentView(t, db)

	execEmbeddedMigration(t, db, "0018_create_admin_users.sql")
	execEmbeddedMigration(t, db, "0019_create_dres_master.sql")
	execEmbeddedMigration(t, db, "0020_dre_canonical_relations.sql")

	_, err := db.Exec(`
		INSERT INTO admin_users (username, password_hash, role, active)
		VALUES
			('LegacyUser', 'hash', 'admin', true),
			('  legacyuser  ', 'hash', 'admin', true)`)
	if err != nil {
		t.Fatalf("seed legacy username collision: %v", err)
	}

	err = applyMigrations(db, log.New(io.Discard, "", 0))
	if err == nil {
		t.Fatal("expected critical migration failure for normalized username collision")
	}
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "0021_dre_normalized_uniqueness.sql") || !strings.Contains(msg, "username") {
		t.Fatalf("expected actionable 0021 username error, got: %v", err)
	}
}

func TestCriticalMigrationFailsClosedOnAmbiguousDRENames(t *testing.T) {
	db := newMigrationTestDB(t)
	seedSchoolsWithDependentView(t, db)

	execEmbeddedMigration(t, db, "0018_create_admin_users.sql")
	execEmbeddedMigration(t, db, "0019_create_dres_master.sql")

	_, err := db.Exec(`INSERT INTO dres (nome) VALUES ('DRE MARAJO'), ('  dre marajo  ')`)
	if err != nil {
		t.Fatalf("seed ambiguous DRE names: %v", err)
	}

	err = applyMigrations(db, log.New(io.Discard, "", 0))
	if err == nil {
		t.Fatal("expected critical migration failure for ambiguous DRE names")
	}
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "0020_dre_canonical_relations.sql") || !strings.Contains(msg, "ambiguous") {
		t.Fatalf("expected actionable 0020 ambiguity error, got: %v", err)
	}
}
