package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"censo-api/internal/models"
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

	// Lógica de Merge (Mesclar dados novos com antigos)
	if err == nil && existingCenso != nil {
		var oldMap map[string]interface{}
		var newMap map[string]interface{}
		_ = json.Unmarshal(existingCenso.Data, &oldMap)
		_ = json.Unmarshal(req.Data, &newMap)

		if oldMap == nil {
			oldMap = make(map[string]interface{})
		}
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

	// Se finalizado, envia para a Planilha
	if req.Status == "completed" {
		go func(c models.CensusResponse) {
			if app.sheets == nil {
				app.logger.Println("Erro: Serviço de Planilhas não inicializado.")
				return
			}

			// 1. Busca os dados da Escola
			school, err := app.models.Schools.Get(c.SchoolID)
			if err != nil {
				app.logger.Println("Erro ao buscar escola para planilha:", err)
				return
			}

			// 2. Envia para a planilha
			err = app.sheets.AppendCenso(c, *school)
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

// uploadPhoto recebe o arquivo e envia para o Google Drive
func (app *application) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	// Limite de 10MB
	r.ParseMultipartForm(10 << 20)

	file, handler, err := r.FormFile("photo")
	if err != nil {
		app.errorJSON(w, fmt.Errorf("arquivo inválido"), http.StatusBadRequest)
		return
	}
	defer file.Close()

	schoolIDStr := r.FormValue("school_id")
	if schoolIDStr == "" {
		app.errorJSON(w, fmt.Errorf("school_id obrigatório"), http.StatusBadRequest)
		return
	}

	var schoolID int
	fmt.Sscanf(schoolIDStr, "%d", &schoolID)

	school, err := app.models.Schools.Get(schoolID)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("escola não encontrada"), http.StatusNotFound)
		return
	}

	if app.drive == nil {
		app.errorJSON(w, fmt.Errorf("serviço de drive indisponível"), http.StatusInternalServerError)
		return
	}

	// Sanitizar nome da pasta: "NomeEscola - DRE - Diretor"
	sanitize := func(s string) string {
		return strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
				return r
			}
			return '-'
		}, s)
	}

	folderName := fmt.Sprintf("%s - %s - %s", sanitize(school.Nome), sanitize(school.Dre), sanitize(school.NomeDiretor))

	// Usa o serviço do Drive
	link, err := app.drive.UploadSchoolPhoto(folderName, handler.Filename, file)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro no upload para o drive: %v", err), http.StatusInternalServerError)
		return
	}

	payload := jsonResponse{
		Error:   false,
		Message: "Upload concluído",
		Data:    link,
	}
	app.writeJSON(w, http.StatusCreated, payload)
}