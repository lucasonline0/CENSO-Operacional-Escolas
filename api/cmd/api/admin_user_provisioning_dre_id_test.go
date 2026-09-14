package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"censo-api/internal/models"
)

type adminCreateUserResponse struct {
	Error   bool             `json:"error"`
	Message string           `json:"message"`
	Data    models.AdminUser `json:"data"`
}

func callAdminCreateUser(t *testing.T, app *application, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/users", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	scope := AdminAccessScope{Username: "admin.provisioning", Role: RoleAdmin}
	req = req.WithContext(context.WithValue(req.Context(), contextKeyAdminScope, scope))

	rr := httptest.NewRecorder()
	app.AdminCreateUser(rr, req)
	return rr
}

func decodeAdminCreateUserResponse(t *testing.T, rr *httptest.ResponseRecorder) adminCreateUserResponse {
	t.Helper()
	var resp adminCreateUserResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode create-user response: %v; body=%s", err, rr.Body.String())
	}
	return resp
}

func TestDRELifecycleCanonicalUserProvisioningByID(t *testing.T) {
	ctx := context.Background()
	db, m := setupDRELifecycleTestDB(t, true)
	app := &application{models: m}

	t.Run("dre_id only persists canonical relation", func(t *testing.T) {
		dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE PROVISION ID", Ativa: true})
		if err != nil {
			t.Fatalf("create DRE: %v", err)
		}

		body := fmt.Sprintf(`{"username":"provision.by.id","password":"password1234","role":"dre","dre_id":%d}`, dre.ID)
		rr := callAdminCreateUser(t, app, body)
		if rr.Code != http.StatusCreated {
			t.Fatalf("dre_id provisioning status=%d want=201 body=%s", rr.Code, rr.Body.String())
		}

		resp := decodeAdminCreateUserResponse(t, rr)
		if resp.Error {
			t.Fatalf("successful provisioning returned error response: %s", rr.Body.String())
		}
		if resp.Data.DREID != dre.ID || resp.Data.DRE != dre.Nome {
			t.Fatalf("response relation mismatch: dre_id=%d dre=%q want id=%d name=%q", resp.Data.DREID, resp.Data.DRE, dre.ID, dre.Nome)
		}

		var storedID int
		var storedName string
		if err := db.QueryRowContext(ctx, `SELECT dre_id, dre FROM admin_users WHERE username = $1`, "provision.by.id").Scan(&storedID, &storedName); err != nil {
			t.Fatalf("read persisted relation: %v", err)
		}
		if storedID != dre.ID || storedName != dre.Nome {
			t.Fatalf("stored relation mismatch: dre_id=%d dre=%q want id=%d name=%q", storedID, storedName, dre.ID, dre.Nome)
		}
	})

	t.Run("matching dre text is only a consistency assertion", func(t *testing.T) {
		dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ASSERT MATCH", Ativa: true})
		if err != nil {
			t.Fatalf("create DRE: %v", err)
		}
		body := fmt.Sprintf(`{"username":"provision.match","password":"password1234","role":"dre","dre_id":%d,"dre":"  dre assert match  "}`, dre.ID)
		rr := callAdminCreateUser(t, app, body)
		if rr.Code != http.StatusCreated {
			t.Fatalf("matching assertion status=%d want=201 body=%s", rr.Code, rr.Body.String())
		}
		resp := decodeAdminCreateUserResponse(t, rr)
		if resp.Data.DREID != dre.ID || resp.Data.DRE != dre.Nome {
			t.Fatalf("matching assertion changed canonical identity: %+v", resp.Data)
		}
	})

	t.Run("contradictory dre and dre_id is rejected without insert", func(t *testing.T) {
		dreA, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ASSERT A", Ativa: true})
		if err != nil {
			t.Fatalf("create DRE A: %v", err)
		}
		if _, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE ASSERT B", Ativa: true}); err != nil {
			t.Fatalf("create DRE B: %v", err)
		}
		body := fmt.Sprintf(`{"username":"provision.conflict","password":"password1234","role":"dre","dre_id":%d,"dre":"DRE ASSERT B"}`, dreA.ID)
		rr := callAdminCreateUser(t, app, body)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("contradictory payload status=%d want=400 body=%s", rr.Code, rr.Body.String())
		}
		if !strings.Contains(strings.ToLower(rr.Body.String()), "diferentes") {
			t.Fatalf("contradictory payload did not explain mismatch: %s", rr.Body.String())
		}
		var count int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM admin_users WHERE username = $1`, "provision.conflict").Scan(&count); err != nil {
			t.Fatalf("count rejected user: %v", err)
		}
		if count != 0 {
			t.Fatalf("contradictory payload persisted %d user(s)", count)
		}
	})

	t.Run("nonexistent dre_id is rejected", func(t *testing.T) {
		rr := callAdminCreateUser(t, app, `{"username":"provision.missing","password":"password1234","role":"dre","dre_id":99999999}`)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("nonexistent dre_id status=%d want=400 body=%s", rr.Code, rr.Body.String())
		}
	})

	t.Run("nonpositive dre_id is rejected", func(t *testing.T) {
		for _, id := range []int{0, -1} {
			username := fmt.Sprintf("provision.badid.%d", -id)
			body := fmt.Sprintf(`{"username":%q,"password":"password1234","role":"dre","dre_id":%d}`, username, id)
			rr := callAdminCreateUser(t, app, body)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("dre_id=%d status=%d want=400 body=%s", id, rr.Code, rr.Body.String())
			}
		}
	})

	t.Run("inactive dre_id is rejected", func(t *testing.T) {
		dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE PROVISION INACTIVE", Ativa: false})
		if err != nil {
			t.Fatalf("create inactive DRE: %v", err)
		}
		body := fmt.Sprintf(`{"username":"provision.inactive","password":"password1234","role":"dre","dre_id":%d}`, dre.ID)
		rr := callAdminCreateUser(t, app, body)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("inactive dre_id status=%d want=400 body=%s", rr.Code, rr.Body.String())
		}
	})

	t.Run("rename before submit preserves identity by id", func(t *testing.T) {
		dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE BEFORE RENAME", Ativa: true})
		if err != nil {
			t.Fatalf("create DRE: %v", err)
		}
		originalID := dre.ID
		dre.Nome = "DRE AFTER RENAME"
		updated, err := m.DREs.Update(ctx, *dre)
		if err != nil {
			t.Fatalf("rename DRE: %v", err)
		}

		body := fmt.Sprintf(`{"username":"provision.after.rename","password":"password1234","role":"dre","dre_id":%d}`, originalID)
		rr := callAdminCreateUser(t, app, body)
		if rr.Code != http.StatusCreated {
			t.Fatalf("post-rename provisioning status=%d want=201 body=%s", rr.Code, rr.Body.String())
		}
		resp := decodeAdminCreateUserResponse(t, rr)
		if resp.Data.DREID != originalID || resp.Data.DRE != updated.Nome {
			t.Fatalf("rename altered canonical binding: dre_id=%d dre=%q want id=%d name=%q", resp.Data.DREID, resp.Data.DRE, originalID, updated.Nome)
		}
	})

	t.Run("name longer than 100 characters does not affect provisioning", func(t *testing.T) {
		longName := "DRE " + strings.Repeat("N", 108)
		if len(longName) <= 100 {
			t.Fatal("test fixture must exceed 100 characters")
		}
		dre, err := m.DREs.Create(ctx, models.DRE{Nome: longName, Ativa: true})
		if err != nil {
			t.Fatalf("create long-name DRE: %v", err)
		}
		body := fmt.Sprintf(`{"username":"provision.long.name","password":"password1234","role":"dre","dre_id":%d}`, dre.ID)
		rr := callAdminCreateUser(t, app, body)
		if rr.Code != http.StatusCreated {
			t.Fatalf("long-name provisioning status=%d want=201 body=%s", rr.Code, rr.Body.String())
		}
		resp := decodeAdminCreateUserResponse(t, rr)
		if resp.Data.DREID != dre.ID || resp.Data.DRE != longName {
			t.Fatalf("long-name relation mismatch: dre_id=%d dre=%q", resp.Data.DREID, resp.Data.DRE)
		}
	})

	t.Run("legacy text-only payload remains compatible", func(t *testing.T) {
		dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE LEGACY COMPAT", Ativa: true})
		if err != nil {
			t.Fatalf("create DRE: %v", err)
		}
		rr := callAdminCreateUser(t, app, `{"username":"provision.legacy","password":"password1234","role":"dre","dre":"DRE LEGACY COMPAT"}`)
		if rr.Code != http.StatusCreated {
			t.Fatalf("legacy provisioning status=%d want=201 body=%s", rr.Code, rr.Body.String())
		}
		resp := decodeAdminCreateUserResponse(t, rr)
		if resp.Data.DREID != dre.ID || resp.Data.DRE != dre.Nome {
			t.Fatalf("legacy path did not resolve to canonical relation: %+v", resp.Data)
		}
	})
}

func TestDRELifecycleCanonicalUserProvisioningModel(t *testing.T) {
	ctx := context.Background()
	_, m := setupDRELifecycleTestDB(t, true)

	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE MODEL ID", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}

	user, err := m.AdminUsers.CreateForDREID(ctx, "model.by.id", "password1234", RoleDRE, dre.ID)
	if err != nil {
		t.Fatalf("CreateForDREID valid: %v", err)
	}
	if user.DREID != dre.ID || user.DRE != dre.Nome {
		t.Fatalf("model relation mismatch: %+v", user)
	}

	dre.Nome = "DRE MODEL RENAMED"
	updated, err := m.DREs.Update(ctx, *dre)
	if err != nil {
		t.Fatalf("rename DRE: %v", err)
	}
	postRename, err := m.AdminUsers.CreateForDREID(ctx, "model.after.rename", "password1234", RoleDRE, dre.ID)
	if err != nil {
		t.Fatalf("CreateForDREID after rename: %v", err)
	}
	if postRename.DREID != dre.ID || postRename.DRE != updated.Nome {
		t.Fatalf("model used stale name after rename: %+v", postRename)
	}

	if err := m.DREs.SetActive(ctx, dre.ID, false); err != nil {
		t.Fatalf("deactivate DRE: %v", err)
	}
	if _, err := m.AdminUsers.CreateForDREID(ctx, "model.inactive", "password1234", RoleDRE, dre.ID); !errors.Is(err, models.ErrDREInactive) {
		t.Fatalf("inactive DRE error=%v want ErrDREInactive", err)
	}
	if _, err := m.AdminUsers.CreateForDREID(ctx, "model.missing", "password1234", RoleDRE, 99999999); !errors.Is(err, models.ErrInvalidDRE) {
		t.Fatalf("missing DRE error=%v want ErrInvalidDRE", err)
	}
}