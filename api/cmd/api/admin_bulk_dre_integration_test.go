package main

import (
	"context"
	"sync"
	"testing"

	"censo-api/internal/models"
	"golang.org/x/crypto/bcrypt"
)

func TestBulkDREBootstrapPostgreSQLLifecycleAndIdempotency(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	insert := func(name, sigla, email string) int {
		var id int
		if err := db.QueryRow(`INSERT INTO dres(nome,sigla,email,ativa) VALUES($1,$2,$3,true) RETURNING id`, name, sigla, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	readyID := insert("DRE ALTAMIRA", "ALT", "altamira@example.test")
	missingID := insert("DRE MARABA", "MAR", "")
	ignoredID := insert("DRE-E2E-TEST", "E2E", "fixture@example.test")
	existingID := insert("DRE EXISTENTE", "EXI", "existing@example.test")
	existing, err := m.AdminUsers.ProvisionForDREID(ctx, "dre.existente", "existing@example.test", "TemporaryPassword-123", "dre", existingID)
	if err != nil {
		t.Fatal(err)
	}
	if existing.ID == 0 {
		t.Fatal("existing account missing")
	}
	// Explicit email and cross-namespace collisions are reported before execution.
	if _, err = db.Exec(`INSERT INTO admin_users(username,email,password_hash,role,active,auth_version,must_change_password,data_scope) VALUES('occupied.username','used@example.test','$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','custom',true,1,true,'all')`); err != nil {
		t.Fatal(err)
	}
	emailConflictID := insert("DRE EMAIL CONFLICT", "ECF", "used@example.test")
	usernameConflictID := insert("DRE OCCUPIED USERNAME", "OUC", "free@example.test")
	if _, err = db.Exec(`UPDATE admin_users SET username='dre.occupiedusername' WHERE username='occupied.username'`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO admin_users(username,email,password_hash,role,active,auth_version,must_change_password,data_scope) VALUES('cross@example.test','cross.owner@example.test','$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','custom',true,1,true,'all')`); err != nil {
		t.Fatal(err)
	}
	crossID := insert("DRE CROSS", "CRS", "cross@example.test")
	if _, err = db.Exec(`INSERT INTO admin_users(username,email,password_hash,role,active,auth_version,must_change_password,data_scope) VALUES('legacy.identity','dre.usernameasemail','$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','custom',true,1,true,'all')`); err != nil {
		t.Fatal(err)
	}
	usernameAsEmailID := insert("DRE USERNAME AS EMAIL", "UAE", "uae@example.test")

	preview, err := m.AdminUsers.PreviewDREBootstrap(ctx)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[int]models.DREBootstrapItem{}
	for _, item := range preview.Items {
		byID[item.DREID] = item
	}
	if byID[readyID].Status != "pending" {
		t.Fatalf("ready=%+v", byID[readyID])
	}
	if byID[missingID].Message != "E-mail obrigatório" {
		t.Fatalf("missing=%+v", byID[missingID])
	}
	if byID[ignoredID].Status != "ignored_e2e" {
		t.Fatalf("ignored=%+v", byID[ignoredID])
	}
	if byID[existingID].Status != "provisioned" {
		t.Fatalf("existing=%+v", byID[existingID])
	}
	if byID[emailConflictID].Message != "E-mail em conflito" {
		t.Fatalf("email conflict=%+v", byID[emailConflictID])
	}
	if byID[usernameConflictID].Message != "Username em conflito" {
		t.Fatalf("username conflict=%+v", byID[usernameConflictID])
	}
	if byID[crossID].Message != "Identidade em conflito" {
		t.Fatalf("cross=%+v", byID[crossID])
	}
	if byID[usernameAsEmailID].Message != "Identidade em conflito" {
		t.Fatalf("username-as-email=%+v", byID[usernameAsEmailID])
	}
	// Remove intentional collisions so the valid batch can execute.
	if _, err = db.Exec(`DELETE FROM dres WHERE id IN ($1,$2,$3,$4)`, emailConflictID, usernameConflictID, crossID, usernameAsEmailID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`DELETE FROM admin_users WHERE username IN ('dre.occupiedusername','cross@example.test','legacy.identity')`); err != nil {
		t.Fatal(err)
	}
	result, credentials, err := m.AdminUsers.BootstrapDREAccounts(ctx, map[int]string{missingID: "maraba@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	if len(credentials) != 2 || result.Pending != 0 {
		t.Fatalf("credentials=%d result=%+v", len(credentials), result)
	}
	var role, hash, scope, email string
	var must bool
	if err = db.QueryRow(`SELECT role,password_hash,must_change_password,data_scope,email FROM admin_users WHERE dre_id=$1`, readyID).Scan(&role, &hash, &must, &scope, &email); err != nil {
		t.Fatal(err)
	}
	if role != "dre" || !must || scope != "selected" {
		t.Fatalf("account role=%s must=%v scope=%s", role, must, scope)
	}
	var plain string
	for _, credential := range credentials {
		if credential.DRE == "DRE ALTAMIRA" {
			plain = credential.TemporaryPassword
		}
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) != nil {
		t.Fatal("password is not bcrypt hash of one-shot credential")
	}
	var dreLinks, permissions int
	if err = db.QueryRow(`SELECT (SELECT count(*) FROM admin_user_dres ud JOIN admin_users u ON u.id=ud.user_id WHERE u.dre_id=$1),(SELECT count(*) FROM admin_user_permissions p JOIN admin_users u ON u.id=p.user_id WHERE u.dre_id=$1)`, readyID).Scan(&dreLinks, &permissions); err != nil {
		t.Fatal(err)
	}
	if dreLinks != 1 || permissions != 3 {
		t.Fatalf("links=%d permissions=%d", dreLinks, permissions)
	}
	if err = db.QueryRow(`SELECT email FROM dres WHERE id=$1`, missingID).Scan(&email); err != nil || email != "maraba@example.test" {
		t.Fatalf("override email=%q err=%v", email, err)
	}
	_, second, err := m.AdminUsers.BootstrapDREAccounts(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 0 {
		t.Fatalf("second execution created %d", len(second))
	}
	// Concurrent repeats serialize on the advisory lock and remain idempotent.
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, got, e := m.AdminUsers.BootstrapDREAccounts(ctx, nil)
			if e == nil && len(got) != 0 {
				t.Errorf("concurrent execution created %d", len(got))
			}
			errs <- e
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	var ignoredUsers int
	if err = db.QueryRow(`SELECT count(*) FROM admin_users WHERE dre_id=$1`, ignoredID).Scan(&ignoredUsers); err != nil || ignoredUsers != 0 {
		t.Fatalf("E2E account count=%d err=%v", ignoredUsers, err)
	}
}
