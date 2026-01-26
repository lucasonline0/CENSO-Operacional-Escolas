package main

import (
	"encoding/json"
	"net/http"
	"api/internal/models"
)

func (app *application) createSchoolHandler(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Nome      string `json:"nome_escola"`
		INEP      string `json:"codigo_inep"`
		Municipio string `json:"municipio"`
		Dre       string `json:"dre"`
		Zona      string `json:"zona"`
		Endereco  string `json:"endereco"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "erro ao ler json: "+err.Error(), http.StatusBadRequest)
		return
	}

	school := models.School{
		Nome:      input.Nome,
		INEP:      input.INEP,
		Municipio: input.Municipio,
		Dre:       input.Dre,
		Zona:      input.Zona,
		Endereco:  input.Endereco,
	}

	id, err := app.models.Schools.Insert(school)
	if err != nil {
		app.logger.Println("erro ao inserir no banco:", err)
		http.Error(w, "erro ao salvar dados.", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status": "success",
		"data": map[string]int{
			"id": id,
		},
	})
}

func (app *application) upsertCensusHandler(w http.ResponseWriter, r *http.Request) {
	// estrutura pra receber o payload do censo
	var input struct {
		SchoolID int             `json:"school_id"`
		Year     int             `json:"year"`
		Status   string          `json:"status"`
		Data     json.RawMessage `json:"data"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "erro ao ler json: "+err.Error(), http.StatusBadRequest)
		return
	}

	// validação basica
	if input.SchoolID == 0 {
		http.Error(w, "school_id obrigatorio", http.StatusBadRequest)
		return
	}
	if input.Year == 0 {
		input.Year = 2026
	}

	response := models.CensusResponse{
		SchoolID: input.SchoolID,
		Year:     input.Year,
		Status:   input.Status,
		Data:     input.Data,
	}

	// salva ou atualiza
	err := app.models.Census.Upsert(response)
	if err != nil {
		app.logger.Println("erro ao salvar censo:", err)
		http.Error(w, "erro interno ao salvar", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "success", 
		"message": "dados salvos com sucesso",
	})
}