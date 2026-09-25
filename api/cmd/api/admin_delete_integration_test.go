package main

import (
	"context"
	"errors"
	"testing"

	"censo-api/internal/models"
)

func TestDeleteUserRelationsAndEmptyDREGuardsPostgreSQL(t *testing.T) {
	db := openDREIntegrationDB(t)
	resetDREIntegrationData(t, db)
	m := models.NewModels(db)
	ctx := context.Background()
	var emptyID, busyID int
	if err := db.QueryRow(`INSERT INTO dres(nome,ativa) VALUES('DRE DELETE EMPTY',true) RETURNING id`).Scan(&emptyID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`INSERT INTO dres(nome,ativa) VALUES('DRE DELETE BUSY',true) RETURNING id`).Scan(&busyID); err != nil {
		t.Fatal(err)
	}
	user, err := m.AdminUsers.ProvisionCustom(ctx, "delete.target", "delete.target@example.test", "TemporaryPassword-123", []string{"census.read"}, "selected", []int{busyID})
	if err != nil {
		t.Fatal(err)
	}
	deps, err := m.DREs.DeleteEmpty(ctx, busyID)
	if !errors.Is(err, models.ErrDREHasDependencies) || deps.CustomProfiles != 1 {
		t.Fatalf("deps=%+v err=%v", deps, err)
	}
	if err = m.AdminUsers.DeleteByID(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	var grants, links int
	if err = db.QueryRow(`SELECT (SELECT count(*) FROM admin_user_permissions WHERE user_id=$1),(SELECT count(*) FROM admin_user_dres WHERE user_id=$1)`, user.ID).Scan(&grants, &links); err != nil {
		t.Fatal(err)
	}
	if grants != 0 || links != 0 {
		t.Fatalf("orphan grants=%d links=%d", grants, links)
	}
	if _, err = m.DREs.DeleteEmpty(ctx, busyID); err != nil {
		t.Fatal(err)
	}
	if _, err = m.DREs.DeleteEmpty(ctx, emptyID); err != nil {
		t.Fatal(err)
	}
	if _, err = m.DREs.GetByID(ctx, emptyID); !errors.Is(err, models.ErrDRENotFound) {
		t.Fatalf("empty DRE still exists: %v", err)
	}
}
