package main

import (
	"strings"

	"censo-api/internal/models"
)

// canDelegate is the server-side anti-escalation rule for every provision
// request. Empty/unknown capabilities never become implicit grants.
func canDelegate(actor AdminAccessScope, permissions []string, dataScope string, dreIDs []int) bool {
	dataScope = strings.ToLower(strings.TrimSpace(dataScope))
	if dataScope != "all" && dataScope != "selected" {
		return false
	}
	if dataScope == "all" && actor.DataScope != "all" {
		return false
	}
	if dataScope == "selected" && len(dreIDs) == 0 {
		return false
	}
	for _, permission := range permissions {
		if !actor.HasPermission(permission) {
			return false
		}
	}
	if dataScope == "selected" && actor.DataScope != "all" {
		for _, id := range dreIDs {
			if !actor.IsAuthorizedForDREID(id) {
				return false
			}
		}
	}
	return true
}

func canAdministerTarget(actor AdminAccessScope, target *models.RuntimeAdminAccess) bool {
	if target == nil {
		return false
	}
	if actor.Role == RoleAdmin && actor.DataScope == "all" {
		return true
	}
	if actor.UserID > 0 && actor.UserID == target.ID || strings.EqualFold(strings.TrimSpace(actor.Username), strings.TrimSpace(target.Username)) {
		return false
	}
	if target.Role == RoleAdmin {
		return false
	}
	for _, permission := range target.Permissions {
		if !actor.HasPermission(permission) {
			return false
		}
	}
	switch target.DataScope {
	case "all":
		return actor.DataScope == "all"
	case "selected":
		ids := append([]int(nil), target.DREIDs...)
		if len(ids) == 0 && target.DREID > 0 {
			ids = []int{target.DREID}
		}
		if len(ids) == 0 {
			return false
		}
		for _, id := range ids {
			if !actor.IsAuthorizedForDREID(id) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func canDelegateRegionalAccount(actor AdminAccessScope, dreID int) bool {
	return canDelegate(
		actor,
		[]string{PermissionCensusRead, PermissionAnalyticsRead, PermissionReportsRead},
		"selected",
		[]int{dreID},
	)
}

func canViewAccountTarget(actor AdminAccessScope, target *models.AdminUser) bool {
	if target == nil {
		return false
	}
	if actor.Role == RoleAdmin && actor.DataScope == "all" {
		return true
	}
	if target.Role == RoleAdmin {
		return false
	}
	switch target.DataScope {
	case "all":
		return actor.DataScope == "all"
	case "selected":
		ids := append([]int(nil), target.DREIDs...)
		if len(ids) == 0 && target.DREID > 0 {
			ids = []int{target.DREID}
		}
		if len(ids) == 0 {
			return false
		}
		for _, id := range ids {
			if !actor.IsAuthorizedForDREID(id) {
				return false
			}
		}
		return true
	default:
		return false
	}
}
