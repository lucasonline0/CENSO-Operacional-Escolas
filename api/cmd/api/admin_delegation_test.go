package main

import (
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
