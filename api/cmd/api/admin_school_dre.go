package main

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"censo-api/internal/models"

	"github.com/go-chi/chi/v5"
)

func (app *application) requireAdminDREManagement(w http.ResponseWriter, r *http.Request) bool {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return false
	}
	return true
}

func parsePositiveRouteID(r *http.Request, param, label string) (int, error) {
	raw := strings.TrimSpace(chi.URLParam(r, param))
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("%s inválido", label)
	}
	return id, nil
}

func schoolDREErrorStatus(err error) int {
	switch {
	case errors.Is(err, models.ErrDREInvalidID),
		errors.Is(err, models.ErrDRENameRequired),
		errors.Is(err, models.ErrSchoolIDsRequired),
		errors.Is(err, models.ErrSchoolInvalidID),
		errors.Is(err, models.ErrSchoolBatchTooLarge):
		return http.StatusBadRequest
	case errors.Is(err, models.ErrDRENotFound), errors.Is(err, models.ErrSchoolNotFound):
		return http.StatusNotFound
	case errors.Is(err, models.ErrDREInactive):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

// AdminAssignSchoolsToDRE associates one or more schools with a DRE.
// Both school_ids (batch) and school_id (single-item convenience) are accepted.
func (app *application) AdminAssignSchoolsToDRE(w http.ResponseWriter, r *http.Request) {
	if !app.requireAdminDREManagement(w, r) {
		return
	}

	dreID, err := parsePositiveRouteID(r, "id", "ID de DRE")
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	var req struct {
		SchoolIDs []int `json:"school_ids"`
		SchoolID  *int  `json:"school_id,omitempty"`
	}
	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}
	if req.SchoolID != nil {
		req.SchoolIDs = append(req.SchoolIDs, *req.SchoolID)
	}

	canonicalDRE, updated, err := app.models.Schools.AssignToDRE(r.Context(), dreID, req.SchoolIDs)
	if err != nil {
		status := schoolDREErrorStatus(err)
		if status == http.StatusInternalServerError {
			app.errorJSON(w, fmt.Errorf("erro ao associar escolas à DRE: %w", err), status)
			return
		}
		app.errorJSON(w, err, status)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "Escolas associadas à DRE com sucesso",
		Data: map[string]interface{}{
			"dre_id":          dreID,
			"dre":             canonicalDRE,
			"updated_schools": updated,
		},
	})
}

// AdminMoveSchoolToDRE remaps one school to another master DRE.
// Prefer dre_id. The dre name form is accepted for backwards-compatible clients
// and is always resolved back to the canonical master DRE before persistence.
func (app *application) AdminMoveSchoolToDRE(w http.ResponseWriter, r *http.Request) {
	if !app.requireAdminDREManagement(w, r) {
		return
	}

	schoolID, err := parsePositiveRouteID(r, "id", "ID de escola")
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	var req struct {
		DREID *int   `json:"dre_id,omitempty"`
		DRE   string `json:"dre,omitempty"`
	}
	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}

	dreName := strings.TrimSpace(req.DRE)
	if req.DREID != nil && dreName != "" {
		app.errorJSON(w, fmt.Errorf("informe apenas dre_id ou dre"), http.StatusBadRequest)
		return
	}
	if req.DREID == nil && dreName == "" {
		app.errorJSON(w, fmt.Errorf("dre_id ou dre é obrigatório"), http.StatusBadRequest)
		return
	}

	var dreID int
	if req.DREID != nil {
		dreID = *req.DREID
		if dreID <= 0 {
			app.errorJSON(w, models.ErrDREInvalidID, http.StatusBadRequest)
			return
		}
	} else {
		dre, err := app.models.DREs.GetByNome(r.Context(), dreName)
		if err != nil {
			status := schoolDREErrorStatus(err)
			if status == http.StatusInternalServerError {
				app.errorJSON(w, fmt.Errorf("erro ao resolver DRE de destino: %w", err), status)
				return
			}
			app.errorJSON(w, err, status)
			return
		}
		dreID = dre.ID
	}

	canonicalDRE, _, err := app.models.Schools.AssignToDRE(r.Context(), dreID, []int{schoolID})
	if err != nil {
		status := schoolDREErrorStatus(err)
		if status == http.StatusInternalServerError {
			app.errorJSON(w, fmt.Errorf("erro ao remanejar escola: %w", err), status)
			return
		}
		app.errorJSON(w, err, status)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "Escola remanejada com sucesso",
		Data: map[string]interface{}{
			"school_id": schoolID,
			"dre_id":    dreID,
			"dre":       canonicalDRE,
		},
	})
}
