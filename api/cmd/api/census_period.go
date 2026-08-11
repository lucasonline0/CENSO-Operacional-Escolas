package main

import (
	"errors"
	"net/http"
	"os"
	"strings"
)

const censusPeriodClosedCode = "census_period_closed"

var errCensusPeriodClosed = errors.New("O período de preenchimento do Censo Operacional foi encerrado.")

func censusSubmissionsEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("CENSUS_SUBMISSIONS_ENABLED")), "true")
}

func (app *application) requireCensusSubmissions(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if censusSubmissionsEnabled() {
			next.ServeHTTP(w, r)
			return
		}

		app.writeJSON(w, http.StatusForbidden, jsonResponse{
			Error:   true,
			Code:    censusPeriodClosedCode,
			Message: errCensusPeriodClosed.Error(),
		})
	})
}

func (app *application) CensusStatus(w http.ResponseWriter, r *http.Request) {
	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error: false,
		Data:  map[string]bool{"submissions_enabled": censusSubmissionsEnabled()},
	})
}
