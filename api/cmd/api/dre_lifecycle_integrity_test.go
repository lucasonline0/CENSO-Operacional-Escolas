package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"censo-api/internal/models"
)

func setupDRELifecycleTestDB(t *testing.T, applyCanonicalMigration bool) (*sql.DB, models.Models) {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not configured")
	}

	base := openDREIntegrationDB(t)
	schema := fmt.Sprintf("dre205_%d", time.Now().UnixNano())
	if _, err := base.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatalf("create lifecycle schema: %v", err)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open lifecycle db: %v", err)
	}
	// Keep search_path tied to one physical connection for the whole isolated test.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		t.Fatalf("ping lifecycle db: %v", err)
	}
	if _, err := db.Exec(`SET search_path TO ` + schema + `, public`); err != nil {
		_ = db.Close()
		t.Fatalf("set lifecycle search_path: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
		_, _ = base.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`)
	})

	if _, err := db.Exec(`
		CREATE TABLE dres (
			id SERIAL PRIMARY KEY,
			nome VARCHAR(255) UNIQUE NOT NULL,
			sigla VARCHAR(32),
			municipio_sede VARCHAR(255),
			polo VARCHAR(255),
			gestor_nome VARCHAR(255),
			email VARCHAR(255),
			telefone VARCHAR(64),
			ativa BOOLEAN NOT NULL DEFAULT true,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
			active BOOLEAN NOT NULL DEFAULT true,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`); err != nil {
		t.Fatalf("create lifecycle tables: %v", err)
	}

	if applyCanonicalMigration {
		if _, err := db.Exec(canonicalMigrationSQL(t)); err != nil {
			t.Fatalf("apply canonical migration for lifecycle test: %v", err)
		}
		if _, err := db.Exec(authVersionMigrationSQL(t)); err != nil {
			t.Fatalf("apply auth_version migration for lifecycle test: %v", err)
		}
	}

	return db, models.NewModels(db)
}

func TestDRELifecycleCreateStatusAndCanonicalUser(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	inactive, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE INATIVA", Ativa: false})
	if err != nil {
		t.Fatalf("create inactive DRE: %v", err)
	}
	if inactive.Ativa {
		t.Fatalf("DRE created with ativa=false was persisted active")
	}
	if _, err := m.AdminUsers.Create(ctx, "inactive.user", "password123", "dre", inactive.Nome); !errors.Is(err, models.ErrDREInactive) {
		t.Fatalf("inactive DRE accepted new user: %v", err)
	}

	active, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ATIVA", Ativa: true})
	if err != nil {
		t.Fatalf("create active DRE: %v", err)
	}
	user, err := m.AdminUsers.Create(ctx, "active.user", "password123", "dre", "  dre ativa  ")
	if err != nil {
		t.Fatalf("create canonical DRE user: %v", err)
	}
	if user.DREID != active.ID || user.DRE != active.Nome {
		t.Fatalf("canonical user relation mismatch: dre_id=%d dre=%q want id=%d name=%q", user.DREID, user.DRE, active.ID, active.Nome)
	}

	var storedID int
	var storedName string
	if err := db.QueryRow(`SELECT dre_id, dre FROM admin_users WHERE id = $1`, user.ID).Scan(&storedID, &storedName); err != nil {
		t.Fatalf("read stored canonical user relation: %v", err)
	}
	if storedID != active.ID || storedName != active.Nome {
		t.Fatalf("stored relation is not canonical: dre_id=%d dre=%q", storedID, storedName)
	}

	if err := m.DREs.SetActive(ctx, active.ID, false); err != nil {
		t.Fatalf("deactivate DRE: %v", err)
	}
	if _, err := m.AdminUsers.CreateForDREID(ctx, "blocked.by.id", "password123", "dre", active.ID); !errors.Is(err, models.ErrDREInactive) {
		t.Fatalf("inactive DRE accepted user by dre_id: %v", err)
	}
	if err := m.DREs.SetActive(ctx, active.ID, true); err != nil {
		t.Fatalf("reactivate DRE: %v", err)
	}
	if _, err := m.AdminUsers.CreateForDREID(ctx, "reactivated.user", "password123", "dre", active.ID); err != nil {
		t.Fatalf("reactivated DRE did not accept user: %v", err)
	}
}

func TestDRELifecycleNeverFallsBackToSchools(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, false)

	if _, err := db.Exec(`INSERT INTO schools (dre) VALUES ('DRE FANTASMA')`); err != nil {
		t.Fatalf("seed legacy school text: %v", err)
	}
	valid, err := m.AdminUsers.ValidateDRE(ctx, "DRE FANTASMA")
	if err != nil {
		t.Fatalf("ValidateDRE returned infrastructure error: %v", err)
	}
	if valid {
		t.Fatalf("schools text incorrectly validated a DRE absent from master table")
	}
	if _, err := m.AdminUsers.Create(ctx, "ghost.user", "password123", "dre", "DRE FANTASMA"); !errors.Is(err, models.ErrInvalidDRE) {
		t.Fatalf("master-absent DRE did not return ErrInvalidDRE: %v", err)
	}
}

func TestDRELifecycleRenamePreservesCanonicalRelationsAndRemap(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	dreA, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ALPHA", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE A: %v", err)
	}
	dreB, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE BETA", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE B: %v", err)
	}

	var schoolID int
	if err := db.QueryRow(`INSERT INTO schools DEFAULT VALUES RETURNING id`).Scan(&schoolID); err != nil {
		t.Fatalf("create school: %v", err)
	}
	if _, _, err := m.Schools.AssignToDRE(ctx, dreA.ID, []int{schoolID}); err != nil {
		t.Fatalf("assign school to DRE A: %v", err)
	}
	user, err := m.AdminUsers.CreateForDREID(ctx, "alpha.user", "password123", "dre", dreA.ID)
	if err != nil {
		t.Fatalf("create DRE A user: %v", err)
	}

	dreA.Nome = "DRE ALPHA RENOMEADA"
	updated, err := m.DREs.Update(ctx, *dreA)
	if err != nil {
		t.Fatalf("rename DRE: %v", err)
	}
	if updated.ID != dreA.ID || updated.Nome != "DRE ALPHA RENOMEADA" {
		t.Fatalf("unexpected renamed DRE: %#v", updated)
	}

	var schoolDREID, userDREID int
	var schoolDRE, userDRE string
	if err := db.QueryRow(`SELECT dre_id, dre FROM schools WHERE id = $1`, schoolID).Scan(&schoolDREID, &schoolDRE); err != nil {
		t.Fatalf("read school after rename: %v", err)
	}
	if err := db.QueryRow(`SELECT dre_id, dre FROM admin_users WHERE id = $1`, user.ID).Scan(&userDREID, &userDRE); err != nil {
		t.Fatalf("read user after rename: %v", err)
	}
	if schoolDREID != dreA.ID || userDREID != dreA.ID || schoolDRE != updated.Nome || userDRE != updated.Nome {
		t.Fatalf("rename broke canonical links: school=(%d,%q) user=(%d,%q)", schoolDREID, schoolDRE, userDREID, userDRE)
	}

	if _, _, err := m.Schools.AssignToDRE(ctx, dreB.ID, []int{schoolID}); err != nil {
		t.Fatalf("remap school to DRE B: %v", err)
	}
	if err := db.QueryRow(`SELECT dre_id, dre FROM schools WHERE id = $1`, schoolID).Scan(&schoolDREID, &schoolDRE); err != nil {
		t.Fatalf("read remapped school: %v", err)
	}
	if schoolDREID != dreB.ID || schoolDRE != dreB.Nome {
		t.Fatalf("school remap did not change canonical id: got (%d,%q), want (%d,%q)", schoolDREID, schoolDRE, dreB.ID, dreB.Nome)
	}
}

func TestDRELifecycleRenameRollsBackEveryRelatedWrite(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ORIGINAL", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}
	var schoolID int
	if err := db.QueryRow(`INSERT INTO schools DEFAULT VALUES RETURNING id`).Scan(&schoolID); err != nil {
		t.Fatalf("create school: %v", err)
	}
	if _, _, err := m.Schools.AssignToDRE(ctx, dre.ID, []int{schoolID}); err != nil {
		t.Fatalf("assign school: %v", err)
	}
	user, err := m.AdminUsers.CreateForDREID(ctx, "rollback.user", "password123", "dre", dre.ID)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	if _, err := db.Exec(`ALTER TABLE schools ADD CONSTRAINT reject_breaking_rename CHECK (dre <> 'DRE QUEBRA')`); err != nil {
		t.Fatalf("install rollback fault constraint: %v", err)
	}

	dre.Nome = "DRE QUEBRA"
	if _, err := m.DREs.Update(ctx, *dre); err == nil {
		t.Fatalf("expected rename to fail on child constraint")
	}

	var masterName, schoolName, userName string
	if err := db.QueryRow(`SELECT nome FROM dres WHERE id = $1`, dre.ID).Scan(&masterName); err != nil {
		t.Fatalf("read master after rollback: %v", err)
	}
	if err := db.QueryRow(`SELECT dre FROM schools WHERE id = $1`, schoolID).Scan(&schoolName); err != nil {
		t.Fatalf("read school after rollback: %v", err)
	}
	if err := db.QueryRow(`SELECT dre FROM admin_users WHERE id = $1`, user.ID).Scan(&userName); err != nil {
		t.Fatalf("read user after rollback: %v", err)
	}
	if masterName != "DRE ORIGINAL" || schoolName != "DRE ORIGINAL" || userName != "DRE ORIGINAL" {
		t.Fatalf("partial rename escaped rollback: master=%q school=%q user=%q", masterName, schoolName, userName)
	}
}

func TestDRELifecycleStress12000CanonicalRelations(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE STRESS", Ativa: true})
	if err != nil {
		t.Fatalf("create stress DRE: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO schools (dre_id)
		SELECT $1 FROM generate_series(1, 6000)
	`, dre.ID); err != nil {
		t.Fatalf("seed 6000 canonical school relations: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO admin_users (username, password_hash, role, dre_id)
		SELECT 'dre205.stress.' || g, 'hash', 'dre', $1
		FROM generate_series(1, 6000) AS g
	`, dre.ID); err != nil {
		t.Fatalf("seed 6000 canonical user relations: %v", err)
	}

	dre.Nome = "DRE STRESS RENOMEADA"
	if _, err := m.DREs.Update(ctx, *dre); err != nil {
		t.Fatalf("rename DRE across 12000 relations: %v", err)
	}

	var broken int
	if err := db.QueryRow(`
		SELECT
			(SELECT COUNT(*) FROM schools WHERE dre_id <> $1 OR dre IS DISTINCT FROM $2) +
			(SELECT COUNT(*) FROM admin_users WHERE role = 'dre' AND (dre_id <> $1 OR dre IS DISTINCT FROM $2))
	`, dre.ID, dre.Nome).Scan(&broken); err != nil {
		t.Fatalf("count broken stress relations: %v", err)
	}
	if broken != 0 {
		t.Fatalf("found %d broken relations after stress rename", broken)
	}
}

func TestDRELifecycleStress2000ExplicitCreateFlags(t *testing.T) {
	ctx := context.Background()
	_, m := setupDRELifecycleTestDB(t, true)

	for i := 0; i < 2000; i++ {
		wantActive := i%2 == 0
		dre, err := m.DREs.Create(ctx, models.DRE{
			Nome:  fmt.Sprintf("DRE FLAG %04d", i),
			Ativa: wantActive,
		})
		if err != nil {
			t.Fatalf("iteration %d create DRE: %v", i, err)
		}
		if dre.Ativa != wantActive {
			t.Fatalf("iteration %d status mismatch: got %v want %v", i, dre.Ativa, wantActive)
		}
	}
}
