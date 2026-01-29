package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"censo-api/internal/models"
	"censo-api/internal/services"
)

// NOTA: HealthCheck movido para healthcheck.go

func (app *application) GetSchools(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")

	if idStr != "" {
		id, err := strconv.Atoi(idStr)
		if err != nil {
			app.errorJSON(w, err)
			return
		}

		school, err := app.models.Schools.Get(id)
		if err != nil {
			app.errorJSON(w, err)
			return
		}

		payload := jsonResponse{
			Error: false,
			Data:  school,
		}
		app.writeJSON(w, http.StatusOK, payload)
		return
	}

	schools, err := app.models.Schools.GetAll()
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	payload := jsonResponse{
		Error: false,
		Data:  schools,
	}
	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) CreateSchool(w http.ResponseWriter, r *http.Request) {
	var req models.School
	
	err := app.readJSON(w, r, &req)
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	id, err := app.models.Schools.Insert(req)
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	req.ID = id
	payload := jsonResponse{
		Error:   false,
		Message: "Escola criada com sucesso",
		Data:    req,
	}

	app.writeJSON(w, http.StatusCreated, payload)
}

func (app *application) GetCenso(w http.ResponseWriter, r *http.Request) {
	schoolIDStr := r.URL.Query().Get("school_id")
	if schoolIDStr == "" {
		app.errorJSON(w, nil, http.StatusBadRequest)
		return
	}

	schoolID, _ := strconv.Atoi(schoolIDStr)
	censo, err := app.models.Census.GetBySchoolID(schoolID, 2026)
	if err != nil {
		payload := jsonResponse{Error: false, Data: nil}
		app.writeJSON(w, http.StatusOK, payload)
		return
	}
	if censo == nil {
		payload := jsonResponse{Error: false, Data: nil}
		app.writeJSON(w, http.StatusOK, payload)
		return
	}

	payload := jsonResponse{
		Error: false,
		Data:  censo.Data,
	}
	app.writeJSON(w, http.StatusOK, payload)
}

func (app *application) CreateOrUpdateCenso(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SchoolID int             `json:"school_id"`
		Year     int             `json:"year"`
		Status   string          `json:"status"`
		Data     json.RawMessage `json:"data"`
	}

	err := app.readJSON(w, r, &req)
	if err != nil {
		app.errorJSON(w, err)
		return
	}

	existingCenso, err := app.models.Census.GetBySchoolID(req.SchoolID, 2026)
	var finalData []byte

	if err == nil && existingCenso != nil {
		var oldMap map[string]interface{}
		var newMap map[string]interface{}
		_ = json.Unmarshal(existingCenso.Data, &oldMap)
		_ = json.Unmarshal(req.Data, &newMap)

		if oldMap == nil { oldMap = make(map[string]interface{}) }
		for k, v := range newMap {
			oldMap[k] = v
		}
		finalData, _ = json.Marshal(oldMap)
	} else {
		finalData = req.Data
	}

	censo := models.CensusResponse{
		SchoolID:  req.SchoolID,
		Year:      req.Year,
		Status:    req.Status,
		Data:      finalData,
		UpdatedAt: time.Now(),
	}

	err = app.models.Census.Upsert(censo)
	if err != nil {
		app.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	if req.Status == "completed" {
		go func(c models.CensusResponse) {
			// 1. Busca os dados da Escola no banco para ter Nome, INEP, etc.
			school, err := app.models.Schools.Get(c.SchoolID)
			if err != nil {
				app.logger.Println("Erro ao buscar escola para planilha:", err)
				return
			}

			// 2. Inicializa o serviço
			sheetsService, err := services.NewSheetsService()
			if err != nil {
				app.logger.Println("Erro ao inicializar Sheets:", err)
				return
			}
			
			// 3. Envia AMBOS (Censo + Dados da Escola) para a planilha
			err = sheetsService.AppendCenso(c, *school)
			if err != nil {
				app.logger.Println("Erro ao salvar na planilha:", err)
			} else {
				app.logger.Println("Sucesso: Dados enviados para a planilha para a escola ID", c.SchoolID)
			}
		}(censo)
	}

	payload := jsonResponse{
		Error:   false,
		Message: "Censo salvo com sucesso",
		Data:    censo,
	}

	app.writeJSON(w, http.StatusOK, payload)
}