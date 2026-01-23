package main

import (
	"api/internal/models"
	"encoding/json"
	"net/http"
)

func (app *application) createSchoolHandler(w http.ResponseWriter, r *http.Request) {
	// Garante que só aceita POST (segurança extra)
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		return
	}

	var input models.School

	// Decodifica o JSON recebido
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		app.logger.Println("Erro ao decodificar JSON:", err)
		http.Error(w, "Erro ao processar dados enviados", http.StatusBadRequest)
		return
	}

	// CHAMA O BANCO DE DADOS
	err := app.models.Schools.Insert(&input)
	if err != nil {
		app.logger.Println("Erro ao inserir no banco:", err)
		// Em produção, não mostramos o erro exato para o usuário por segurança
		http.Error(w, "Erro interno ao salvar dados", http.StatusInternalServerError)
		return
	}

	// Responde com sucesso e devolve o ID criado
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"message": "Escola cadastrada com sucesso!",
		"data":    input,
	})
}