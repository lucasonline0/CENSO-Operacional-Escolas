package main

import (
	"database/sql"
	"fmt"
	"io/fs"
	"strings"
	"testing"
	"time"
)

func canonicalMigrationSQL(t *testing.T) string {
	t.Helper()
	content, err := fs.ReadFile(migrationsFS, "migrations/0020_dre_canonical_relations.sql")
	if err != nil {
		t.Fatalf("read canonical DRE migration: %v", err)
	}
	return string(content)
}

func setupDRECanonicalSchema(t *testing.T) *sql.Tx {
	t.Helper()
	db := openDREIntegrationDB(t)
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin canonical migration transaction: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })

	schema := fmt.Sprintf("dre204_%d", time.Now().UnixNano())
	if _, err := tx.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatalf("create isolated schema: %v", err)
	}
	if _, err := tx.Exec(`SET LOCAL search_path TO ` + schema + `, public`); err != nil {
		t.Fatalf("set isolated search_path: %v", err)
	}
	if _, err := tx.Exec(`
		CREATE TABLE dres (
			id SERIAL PRIMARY KEY,
			nome VARCHAR(255) UNIQUE NOT NULL,
			ativa BOOLEAN NOT NULL DEFAULT true
		);
		CREATE TABLE schools (
			id SERIAL PRIMARY KEY,
			dre VARCHAR(100)
		);
		CREATE TABLE admin_users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(64) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role VARCHAR(32) NOT NULL,
			dre VARCHAR(128),
			active BOOLEAN NOT NULL DEFAULT true
		);
	`); err != nil {
		t.Fatalf("create isolated legacy schema: %v", err)
	}
	return tx
}

func TestDRECanonicalRelationsMigrationBackfillAndCompatibilityBridge(t *testing.T) {
	tx := setupDRECanonicalSchema(t)
	if _, err := tx.Exec(`
		INSERT INTO dres (id, nome) VALUES
			(10, 'DRE ALPHA'),
			(20, 'DRE BETA');
		INSERT INTO schools (dre) VALUES
			('  dre alpha  '),
			(NULL);
		INSERT INTO admin_users (username, password_hash, role, dre) VALUES
			('alpha.user', 'hash', 'dre', 'Dre Alpha');
	`); err != nil {
		t.Fatalf("seed legacy rows: %v", err)
	}

	migration := canonicalMigrationSQL(t)
	if _, err := tx.Exec(migration); err != nil {
		t.Fatalf("apply canonical migration: %v", err)
	}

	var schoolDREID int
	var schoolDRE string
	if err := tx.QueryRow(`SELECT dre_id, dre FROM schools WHERE dre_id = 10 LIMIT 1`).Scan(&schoolDREID, &schoolDRE); err != nil {
		t.Fatalf("read backfilled school: %v", err)
	}
	if schoolDREID != 10 || schoolDRE != "DRE ALPHA" {
		t.Fatalf("school backfill mismatch: dre_id=%d dre=%q", schoolDREID, schoolDRE)
	}

	var userDREID int
	var userDRE string
	if err := tx.QueryRow(`SELECT dre_id, dre FROM admin_users WHERE username = 'alpha.user'`).Scan(&userDREID, &userDRE); err != nil {
		t.Fatalf("read backfilled user: %v", err)
	}
	if userDREID != 10 || userDRE != "DRE ALPHA" {
		t.Fatalf("user backfill mismatch: dre_id=%d dre=%q", userDREID, userDRE)
	}

	var insertedID int
	var insertedName string
	if err := tx.QueryRow(`INSERT INTO schools (dre) VALUES ('  dre beta ') RETURNING dre_id, dre`).Scan(&insertedID, &insertedName); err != nil {
		t.Fatalf("legacy school write should resolve canonical DRE: %v", err)
	}
	if insertedID != 20 || insertedName != "DRE BETA" {
		t.Fatalf("legacy school bridge mismatch: id=%d name=%q", insertedID, insertedName)
	}

	if err := tx.QueryRow(`INSERT INTO admin_users (username, password_hash, role, dre) VALUES ('beta.user', 'hash', 'dre', 'DRE BETA') RETURNING dre_id, dre`).Scan(&insertedID, &insertedName); err != nil {
		t.Fatalf("legacy admin-user write should resolve canonical DRE: %v", err)
	}
	if insertedID != 20 || insertedName != "DRE BETA" {
		t.Fatalf("legacy user bridge mismatch: id=%d name=%q", insertedID, insertedName)
	}

	if err := tx.QueryRow(`INSERT INTO schools (dre_id) VALUES (10) RETURNING dre_id, dre`).Scan(&insertedID, &insertedName); err != nil {
		t.Fatalf("canonical school write should hydrate legacy name: %v", err)
	}
	if insertedID != 10 || insertedName != "DRE ALPHA" {
		t.Fatalf("canonical school bridge mismatch: id=%d name=%q", insertedID, insertedName)
	}
}

func TestDRECanonicalRelationsMigrationIdempotentAndIDWinsAfterRename(t *testing.T) {
	tx := setupDRECanonicalSchema(t)
	if _, err := tx.Exec(`
		INSERT INTO dres (id, nome) VALUES (10, 'DRE ALPHA');
		INSERT INTO schools (dre) VALUES ('DRE ALPHA');
		INSERT INTO admin_users (username, password_hash, role, dre)
		VALUES ('alpha.user', 'hash', 'dre', 'DRE ALPHA');
	`); err != nil {
		t.Fatalf("seed rows: %v", err)
	}
	migration := canonicalMigrationSQL(t)
	if _, err := tx.Exec(migration); err != nil {
		t.Fatalf("first migration: %v", err)
	}
	if _, err := tx.Exec(`UPDATE dres SET nome = 'DRE ALPHA RENAMED' WHERE id = 10`); err != nil {
		t.Fatalf("rename master DRE: %v", err)
	}
	if _, err := tx.Exec(migration); err != nil {
		t.Fatalf("reapply canonical migration: %v", err)
	}

	var schoolDREID int
	var schoolDRE string
	if err := tx.QueryRow(`SELECT dre_id, dre FROM schools WHERE dre_id = 10 LIMIT 1`).Scan(&schoolDREID, &schoolDRE); err != nil {
		t.Fatalf("read school after migration reexecution: %v", err)
	}
	if schoolDREID != 10 || schoolDRE != "DRE ALPHA RENAMED" {
		t.Fatalf("reexecution did not honor canonical ID: id=%d name=%q", schoolDREID, schoolDRE)
	}

	var userDREID int
	var userDRE string
	if err := tx.QueryRow(`SELECT dre_id, dre FROM admin_users WHERE username = 'alpha.user'`).Scan(&userDREID, &userDRE); err != nil {
		t.Fatalf("read user after migration reexecution: %v", err)
	}
	if userDREID != 10 || userDRE != "DRE ALPHA RENAMED" {
		t.Fatalf("user reexecution did not honor canonical ID: id=%d name=%q", userDREID, userDRE)
	}
}

func TestDRECanonicalRelationsMigrationRejectsInvalidWrites(t *testing.T) {
	tx := setupDRECanonicalSchema(t)
	if _, err := tx.Exec(`INSERT INTO dres (id, nome) VALUES (10, 'DRE ALPHA')`); err != nil {
		t.Fatalf("seed DRE: %v", err)
	}
	if _, err := tx.Exec(canonicalMigrationSQL(t)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}

	cases := []struct {
		name string
		sql  string
	}{
		{name: "invalid school dre_id", sql: `INSERT INTO schools (dre_id) VALUES (999999)`},
		{name: "unmapped textual school DRE", sql: `INSERT INTO schools (dre) VALUES ('DRE FANTASMA')`},
		{name: "DRE user without relation", sql: `INSERT INTO admin_users (username, password_hash, role) VALUES ('missing.dre', 'hash', 'dre')`},
		{name: "DRE user with invalid dre_id", sql: `INSERT INTO admin_users (username, password_hash, role, dre_id) VALUES ('invalid.id', 'hash', 'dre', 999999)`},
	}
	for i, tc := range cases {
		sp := fmt.Sprintf("case_%d", i)
		if _, err := tx.Exec(`SAVEPOINT ` + sp); err != nil {
			t.Fatalf("%s: create savepoint: %v", tc.name, err)
		}
		if _, err := tx.Exec(tc.sql); err == nil {
			t.Fatalf("%s: invalid write was accepted", tc.name)
		}
		if _, err := tx.Exec(`ROLLBACK TO SAVEPOINT ` + sp); err != nil {
			t.Fatalf("%s: rollback savepoint: %v", tc.name, err)
		}
		if _, err := tx.Exec(`RELEASE SAVEPOINT ` + sp); err != nil {
			t.Fatalf("%s: release savepoint: %v", tc.name, err)
		}
	}
}

func TestDRECanonicalRelationsMigrationRejectsAmbiguousLegacyNames(t *testing.T) {
	tx := setupDRECanonicalSchema(t)
	if _, err := tx.Exec(`
		INSERT INTO dres (nome) VALUES ('DRE BELEM'), ('  dre belem  ');
		INSERT INTO schools (dre) VALUES ('DRE BELEM');
	`); err != nil {
		t.Fatalf("seed ambiguous DREs: %v", err)
	}
	if _, err := tx.Exec(canonicalMigrationSQL(t)); err == nil || !strings.Contains(err.Error(), "ambiguous normalized DRE names") {
		t.Fatalf("expected explicit ambiguity failure, got %v", err)
	}
}

func TestDRECanonicalRelationsMigrationRejectsUnmappedLegacyData(t *testing.T) {
	tx := setupDRECanonicalSchema(t)
	if _, err := tx.Exec(`
		INSERT INTO dres (nome) VALUES ('DRE EXISTENTE');
		INSERT INTO schools (dre) VALUES ('DRE FANTASMA');
	`); err != nil {
		t.Fatalf("seed unmapped school: %v", err)
	}
	if _, err := tx.Exec(canonicalMigrationSQL(t)); err == nil || !strings.Contains(err.Error(), "unmapped school DRE") {
		t.Fatalf("expected explicit unmapped-data failure, got %v", err)
	}
}

func TestDRECanonicalRelationsMigrationStress30000Relations(t *testing.T) {
	tx := setupDRECanonicalSchema(t)
	if _, err := tx.Exec(`
		INSERT INTO dres (id, nome)
		SELECT g, 'DRE ' || LPAD(g::text, 3, '0')
		FROM generate_series(1, 64) AS g;

		INSERT INTO schools (dre)
		SELECT CASE
			WHEN g % 2 = 0 THEN LOWER('DRE ' || LPAD(((g % 64) + 1)::text, 3, '0'))
			ELSE '  ' || ('DRE ' || LPAD(((g % 64) + 1)::text, 3, '0')) || '  '
		END
		FROM generate_series(1, 12000) AS g;

		INSERT INTO admin_users (username, password_hash, role, dre)
		SELECT 'legacy.user.' || g, 'hash', 'dre',
			CASE
				WHEN g % 2 = 0 THEN LOWER('DRE ' || LPAD(((g % 64) + 1)::text, 3, '0'))
				ELSE ' ' || ('DRE ' || LPAD(((g % 64) + 1)::text, 3, '0')) || ' '
			END
		FROM generate_series(1, 8000) AS g;
	`); err != nil {
		t.Fatalf("seed stress legacy relations: %v", err)
	}

	migration := canonicalMigrationSQL(t)
	if _, err := tx.Exec(migration); err != nil {
		t.Fatalf("apply migration over 20000 legacy relations: %v", err)
	}

	// Mais 10 mil writes depois da migration exercitam os triggers de compatibilidade.
	if _, err := tx.Exec(`
		INSERT INTO schools (dre)
		SELECT LOWER('DRE ' || LPAD(((g % 64) + 1)::text, 3, '0'))
		FROM generate_series(1, 5000) AS g;

		INSERT INTO admin_users (username, password_hash, role, dre)
		SELECT 'bridge.user.' || g, 'hash', 'dre', 'DRE ' || LPAD(((g % 64) + 1)::text, 3, '0')
		FROM generate_series(1, 5000) AS g;
	`); err != nil {
		t.Fatalf("exercise compatibility bridge: %v", err)
	}

	var broken int
	if err := tx.QueryRow(`
		SELECT COUNT(*)
		FROM schools s
		LEFT JOIN dres d ON d.id = s.dre_id
		WHERE s.dre_id IS NULL OR d.id IS NULL OR s.dre IS DISTINCT FROM d.nome
	`).Scan(&broken); err != nil {
		t.Fatalf("count broken school relations: %v", err)
	}
	if broken != 0 {
		t.Fatalf("found %d broken school canonical relations", broken)
	}

	if err := tx.QueryRow(`
		SELECT COUNT(*)
		FROM admin_users u
		LEFT JOIN dres d ON d.id = u.dre_id
		WHERE u.role = 'dre' AND (u.dre_id IS NULL OR d.id IS NULL OR u.dre IS DISTINCT FROM d.nome)
	`).Scan(&broken); err != nil {
		t.Fatalf("count broken user relations: %v", err)
	}
	if broken != 0 {
		t.Fatalf("found %d broken user canonical relations", broken)
	}

	if _, err := tx.Exec(migration); err != nil {
		t.Fatalf("stress migration must remain idempotent: %v", err)
	}
}
