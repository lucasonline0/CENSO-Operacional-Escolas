package main

import (
	"context"
	"database/sql"
	"strings"
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
	if byID[missingID].Status != "missing_email" || !strings.Contains(byID[missingID].Message, "obrigatório") {
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
	// Remove intentional collisions so the valid batch can execute.
	if _, err = db.Exec(`DELETE FROM dres WHERE id IN ($1,$2,$3)`, emailConflictID, usernameConflictID, crossID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`DELETE FROM admin_users WHERE username IN ('dre.occupiedusername','cross@example.test')`); err != nil {
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

func TestBulkDREBootstrapWithoutEmailIsBlocked(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	var noEmailID int
	if err := db.QueryRow(`INSERT INTO dres(nome,sigla,email,ativa) VALUES('DRE SEM EMAIL','NME','',true) RETURNING id`).Scan(&noEmailID); err != nil {
		t.Fatal(err)
	}
	preview, err := m.AdminUsers.PreviewDREBootstrap(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, item := range preview.Items {
		if item.DREID == noEmailID {
			found = true
			if item.Status != "missing_email" {
				t.Fatalf("preview status=%q, want missing_email", item.Status)
			}
			if !strings.Contains(item.Message, "obrigatório") {
				t.Fatalf("preview message=%q, want required-email guidance", item.Message)
			}
		}
	}
	if !found {
		t.Fatal("DRE without email missing from preview")
	}
	if preview.Errors != 1 {
		t.Fatalf("preview errors=%d, want 1", preview.Errors)
	}
	if _, _, err = m.AdminUsers.BootstrapDREAccounts(ctx, nil); err == nil {
		t.Fatal("bulk bootstrap without email unexpectedly succeeded")
	}
}

func TestBulkDREBootstrapWithoutEmailUsernameExistsInDB(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	if _, err := db.Exec(`INSERT INTO admin_users(username,email,password_hash,role,active,auth_version,must_change_password,data_scope) VALUES('dre.sememail',NULL,'$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','custom',true,1,true,'all')`); err != nil {
		t.Fatal(err)
	}
	var noEmailID int
	if err := db.QueryRow(`INSERT INTO dres(nome,sigla,email,ativa) VALUES('DRE SEM EMAIL','NME','',true) RETURNING id`).Scan(&noEmailID); err != nil {
		t.Fatal(err)
	}
	preview, err := m.AdminUsers.PreviewDREBootstrap(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, item := range preview.Items {
		if item.DREID == noEmailID {
			found = true
			if item.Status != "error" || item.Message != "Username em conflito" {
				t.Fatalf("preview item=%+v, want error/Username em conflito", item)
			}
		}
	}
	if !found {
		t.Fatal("DRE without email missing from preview")
	}
	if preview.Errors == 0 || preview.Pending != 0 {
		t.Fatalf("errors=%d pending=%d, want errors>0 pending=0", preview.Errors, preview.Pending)
	}
	if _, _, err = m.AdminUsers.BootstrapDREAccounts(ctx, nil); err == nil {
		t.Fatal("bootstrap with username conflict must fail")
	}
}

func TestBulkDREBootstrapUsernameConflictWithoutEmail(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	if _, err := db.Exec(`INSERT INTO dres(nome,sigla,email,ativa) VALUES('DRE TESTE-A','CFA','',true),('DRE TESTE A','CFB','',true)`); err != nil {
		t.Fatal(err)
	}
	preview, err := m.AdminUsers.PreviewDREBootstrap(ctx)
	if err != nil {
		t.Fatal(err)
	}
	conflicts := 0
	for _, item := range preview.Items {
		if item.Status == "error" && item.Message == "Username em conflito" {
			conflicts++
		}
	}
	if conflicts != 2 {
		t.Fatalf("username conflicts=%d, want 2; items=%+v", conflicts, preview.Items)
	}
	if preview.Errors != 2 {
		t.Fatalf("preview errors=%d, want 2", preview.Errors)
	}
	if preview.Pending != 0 {
		t.Fatalf("preview pending=%d, want 0", preview.Pending)
	}
}

func TestBulkDREBootstrapArbitraryDomainOverride(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	var dreID int
	if err := db.QueryRow(`INSERT INTO dres(nome,sigla,email,ativa) VALUES('DRE OVERRIDE','OVR','',true) RETURNING id`).Scan(&dreID); err != nil {
		t.Fatal(err)
	}
	_, credentials, err := m.AdminUsers.BootstrapDREAccounts(ctx, map[int]string{dreID: "gestor@qualquer-dominio.org.br"})
	if err != nil {
		t.Fatal(err)
	}
	if len(credentials) != 1 {
		t.Fatalf("credentials=%d, want 1", len(credentials))
	}
	if credentials[0].Email != "gestor@qualquer-dominio.org.br" {
		t.Fatalf("credential email=%q", credentials[0].Email)
	}
	var dresEmail sql.NullString
	if err = db.QueryRow(`SELECT email FROM dres WHERE id=$1`, dreID).Scan(&dresEmail); err != nil {
		t.Fatal(err)
	}
	if !dresEmail.Valid || dresEmail.String != "gestor@qualquer-dominio.org.br" {
		t.Fatalf("dres.email=%v", dresEmail)
	}
}

func TestBulkDREBootstrapEmptyOverride(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	var dreID int
	if err := db.QueryRow(`INSERT INTO dres(nome,sigla,email,ativa) VALUES('DRE COM EMAIL','CEM','antigo@example.test',true) RETURNING id`).Scan(&dreID); err != nil {
		t.Fatal(err)
	}
	_, credentials, err := m.AdminUsers.BootstrapDREAccounts(ctx, map[int]string{dreID: ""})
	if err != nil {
		t.Fatal(err)
	}
	if len(credentials) != 1 {
		t.Fatalf("credentials=%d, want 1", len(credentials))
	}
	if credentials[0].Email != "antigo@example.test" {
		t.Fatalf("credential email=%q, want existing email", credentials[0].Email)
	}
	var dresEmail sql.NullString
	if err = db.QueryRow(`SELECT email FROM dres WHERE id=$1`, dreID).Scan(&dresEmail); err != nil {
		t.Fatal(err)
	}
	if !dresEmail.Valid || dresEmail.String != "antigo@example.test" {
		t.Fatalf("dres.email=%v, want existing email", dresEmail)
	}
	var userEmail sql.NullString
	if err = db.QueryRow(`SELECT email FROM admin_users WHERE dre_id=$1`, dreID).Scan(&userEmail); err != nil {
		t.Fatal(err)
	}
	if !userEmail.Valid || userEmail.String != "antigo@example.test" {
		t.Fatalf("admin_users.email=%v, want existing email", userEmail)
	}
}

func bootstrapWithoutOverride(ctx context.Context, m models.Models) ([]models.DREBootstrapCredential, error) {
	_, credentials, err := m.AdminUsers.BootstrapDREAccounts(ctx, nil)
	return credentials, err
}
