package main

import "net/http"

func (app *application) enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Permite que o Next.js (localhost:3000) converse com o Go
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		
		// Libera os métodos
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		
		// Libera os cabeçalhos essenciais (JSON e Auth)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Se o navegador fizer uma pergunta de segurança (OPTIONS), responde OK
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}