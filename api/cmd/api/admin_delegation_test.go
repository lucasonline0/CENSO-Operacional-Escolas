package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"censo-api/internal/models"
)

func TestDelegationNeverExpandsCapabilitiesOrScope(t *testing.T) {
	perms := permissionsMap([]string{PermissionUsersCreate, PermissionCensusRead})
	actor := AdminAccessScope{Role: "custom", DataScope: "selected", permissions: &perms, dreIDs: newDREIDs([]int{3})}
	if !canDelegate(actor, []string{PermissionCensusRead}, "selected", []int{3}) {
		t.Fatal("expected subset grant to be allowed")
	}
	if canDelegate(actor, []string{PermissionUsersManage}, "selected", []int{3}) {
		t.Fatal("escalated permission allowed")
	}
	if canDelegate(actor, []string{PermissionCensusRead}, "all", nil) {
		t.Fatal("global scope escalation allowed")
	}
	if canDelegate(actor, []string{PermissionCensusRead}, "selected", []int{7}) {
		t.Fatal("foreign DRE escalation allowed")
	}
	if canDelegate(actor, []string{"unknown.permission"}, "selected", []int{3}) {
		t.Fatal("unknown permission allowed")
	}
}


func TestDelegatedAdministrationNeverTargetsMorePrivilegedAccount(t *testing.T) {
	actorPerms := permissionsMap([]string{PermissionUsersManage, PermissionUsersResetPassword, PermissionCensusRead})
	actor := AdminAccessScope{
		Username: "delegate",
		Role: "custom",
		DataScope: "selected",
		permissions: &actorPerms,
		dreIDs: newDREIDs([]int{3, 4}),
	}

	allowed := &models.RuntimeAdminAccess{
		Username: "child",
		Role: "custom",
		DataScope: "selected",
		Permissions: []string{PermissionCensusRead},
		DREIDs: []int{3},
	}
	if !canAdministerTarget(actor, allowed) {
		t.Fatal("expected subordinate target to be manageable")
	}

	for name, target := range map[string]*models.RuntimeAdminAccess{
		"self": {
			Username: "delegate", Role: "custom", DataScope: "selected",
			Permissions: []string{PermissionCensusRead}, DREIDs: []int{3},
		},
		"higher permission": {
			Username: "manager", Role: "custom", DataScope: "selected",
			Permissions: []string{PermissionUsersCreate}, DREIDs: []int{3},
		},
		"foreign DRE": {
			Username: "foreign", Role: "custom", DataScope: "selected",
			Permissions: []string{PermissionCensusRead}, DREIDs: []int{7},
		},
		"global scope": {
			Username: "global", Role: "custom", DataScope: "all",
			Permissions: []string{PermissionCensusRead},
		},
		"admin": {
			Username: "admin", Role: RoleAdmin, DataScope: "all",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if canAdministerTarget(actor, target) {
				t.Fatal("privileged target was incorrectly manageable")
			}
		})
	}

	adminPerms := allPermissions()
	admin := AdminAccessScope{Username: "root", Role: RoleAdmin, DataScope: "all", permissions: &adminPerms}
	if !canAdministerTarget(admin, &models.RuntimeAdminAccess{Username: "global", Role: "custom", DataScope: "all"}) {
		t.Fatal("environment admin should be able to manage database accounts")
	}
}


func TestSchoolManagementRoutesUseSchoolsCapability(t *testing.T) {
	for _, tc := range []struct {
		method string
		path   string
	}{
		{method: http.MethodPost, path: "/v1/admin/dres/7/schools"},
		{method: http.MethodPatch, path: "/v1/admin/schools/11/dre"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		if got := permissionForRequest(req); got != PermissionSchoolsManageDRE {
			t.Fatalf("%s %s capability=%q want=%q", tc.method, tc.path, got, PermissionSchoolsManageDRE)
		}
	}
}


func TestProvisionCustomRejectsCrossIdentityCollisions(t *testing.T) {
	_, _, m := setupRuntimeAuthTest(t)
	ctx := context.Background()
	dre, err := m.DREs.Create(ctx, models.DRE{Nome: "DRE IDENTITY COLLISION", Ativa: true})
	if err != nil {
		t.Fatalf("create DRE: %v", err)
	}
	_, err = m.AdminUsers.ProvisionForDREID(
		ctx,
		"regional.identity",
		"regional.identity@example.test",
		"Temporary!Password123",
		RoleDRE,
		dre.ID,
	)
	if err != nil {
		t.Fatalf("seed regional account: %v", err)
	}

	_, err = m.AdminUsers.ProvisionCustom(
		ctx,
		"regional.identity@example.test",
		"custom.one@example.test",
		"Temporary!Password123",
		[]string{PermissionCensusRead},
		"all",
		nil,
	)
	if !errors.Is(err, models.ErrIdentityCollision) {
		t.Fatalf("username matching existing email error=%v want ErrIdentityCollision", err)
	}

	_, err = m.AdminUsers.ProvisionCustom(
		ctx,
		"custom.two",
		"regional.identity",
		"Temporary!Password123",
		[]string{PermissionCensusRead},
		"all",
		nil,
	)
	if !errors.Is(err, models.ErrIdentityCollision) {
		t.Fatalf("email matching existing username error=%v want ErrIdentityCollision", err)
	}
}
