package main

import (
	"api/internal/models"
	"encoding/json"
	"fmt"
	"net/http"
)

func (app *application) createSchoolHandler(w http.ResponseWriter, r *http.Request) {
	// NOVA VALIDAÇÃO: Garante que só aceita POST
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		return
	}

	var input models.School

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		app.logger.Println("Erro ao decodificar JSON:", err)
		http.Error(w, "Erro ao processar dados enviados", http.StatusBadRequest)
		return
	}

	fmt.Println("------------------------------------------------")
	fmt.Println("📝 DADOS RECEBIDOS COM SUCESSO")
	fmt.Printf("Escola: %s\n", input.NomeEscola)
	fmt.Printf("INEP: %s\n", input.CodigoINEP)
	fmt.Printf("Município: %s\n", input.Municipio)
	fmt.Println("------------------------------------------------")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Dados recebidos"})
}