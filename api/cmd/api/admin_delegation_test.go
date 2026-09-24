package main

import "testing"

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
