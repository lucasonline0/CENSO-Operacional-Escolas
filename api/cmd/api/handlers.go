package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"api/internal/models"
)

func (app *application) createSchoolHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}

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

// censusHandler gerencia tanto GET quanto POST para o censo
func (app *application) censusHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		app.getCensus(w, r)
	case http.MethodPost:
		app.upsertCensus(w, r)
	default:
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
	}
}

func (app *application) getCensus(w http.ResponseWriter, r *http.Request) {
	schoolIDStr := r.URL.Query().Get("school_id")
	if schoolIDStr == "" {
		http.Error(w, "school_id é obrigatório", http.StatusBadRequest)
		return
	}

	schoolID, err := strconv.Atoi(schoolIDStr)
	if err != nil {
		http.Error(w, "school_id inválido", http.StatusBadRequest)
		return
	}

	// por enquanto fixo em 2026, mas poderia vir da query string
	census, err := app.models.Census.GetBySchoolID(schoolID, 2026)
	if err != nil {
		app.logger.Println("erro ao buscar censo:", err)
		http.Error(w, "erro interno", http.StatusInternalServerError)
		return
	}

	if census == nil {
		// se não tiver nada salvo ainda, retorna um json vazio, não 404
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data": {}}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(census)
}

func (app *application) upsertCensus(w http.ResponseWriter, r *http.Request) {
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