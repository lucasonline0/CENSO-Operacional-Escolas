package main

import "strings"

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
