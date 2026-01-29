package main

import "net/http"

func (app *application) HealthCheck(w http.ResponseWriter, r *http.Request) {
	payload := jsonResponse{
		Error:   false,
		Message: "system operational",
	}

	app.writeJSON(w, http.StatusOK, payload)
}