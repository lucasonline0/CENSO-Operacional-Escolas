package main

import (
	"net/http"
)

func (app *application) healthcheckHandler(w http.ResponseWriter, _ *http.Request) {
	data := map[string]string{
		"status":      "available",
		"environment": "development",
		"version":     "1.0.0",
	}

	app.writeJSON(w, http.StatusOK, envelope{"healthcheck": data}, nil)
}