package main

import (
	"encoding/json"
	"net/http"
	"api/internal/models" 
)

func (app *application) createSchoolHandler(w http.ResponseWriter, r *http.Request) {
	// estrutura temporária para receber o JSON
	var input struct {
		Nome      string `json:"nome_escola"`
		INEP      string `json:"codigo_inep"`
		Municipio string `json:"municipio"`
		Dre       string `json:"dre"`
		Zona      string `json:"zona"`
		Endereco  string `json:"endereco"`
	}
	// decodifica o JSON recebido
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Erro ao ler JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// ppassa os dados para o modelo do banco
	school := models.School{
		Nome:      input.Nome,
		INEP:      input.INEP,
		Municipio: input.Municipio,
		Dre:       input.Dre,
		Zona:      input.Zona,
		Endereco:  input.Endereco,
	}

	// salva no banco
	id, err := app.models.Schools.Insert(school)
	if err != nil {
		app.logger.Println("Erro ao inserir no banco:", err)
		http.Error(w, "Erro ao salvar dados. Verifique o terminal do servidor.", http.StatusInternalServerError)
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