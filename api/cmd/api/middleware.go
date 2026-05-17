package main

import (
	"net/http"
	"os"
	"strings"
)

func (app *application) enableCORS(next http.Handler) http.Handler {
	// Lê origens permitidas da env var ALLOWED_ORIGINS (separadas por vírgula).
	// Ex: "https://censo.seduc.pa.gov.br,https://censo-staging.vercel.app"
	// Se vazia, qualquer origem é aceita (sem credenciais).
	rawOrigins := os.Getenv("ALLOWED_ORIGINS")
	var allowedOrigins []string
	for _, o := range strings.Split(rawOrigins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			allowedOrigins = append(allowedOrigins, o)
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestOrigin := r.Header.Get("Origin")

		if len(allowedOrigins) > 0 {
			// Modo restrito: apenas origens na whitelist
			allowed := false
			for _, o := range allowedOrigins {
				if o == requestOrigin {
					allowed = true
					break
				}
			}
			// Vary: Origin obrigatório quando a resposta varia por origem,
			// evita que CDN/proxy cache a resposta de uma origem e sirva a outra
			w.Header().Set("Vary", "Origin")
			if allowed {
				w.Header().Set("Access-Control-Allow-Origin", requestOrigin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
		} else {
			// Modo público: aceita qualquer origem, sem credenciais
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-API-Key, Cache-Control, Pragma")

		// Previne MIME sniffing (browser interpretar JSON como script/HTML)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Previne clickjacking via <iframe>
		w.Header().Set("X-Frame-Options", "DENY")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}