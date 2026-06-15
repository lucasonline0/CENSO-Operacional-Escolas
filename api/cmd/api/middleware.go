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
		w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")

		// Previne MIME sniffing e clickjacking.
		// X-XSS-Protection foi removido por estar obsoleto (pode introduzir
		// vulnerabilidades em navegadores legados); a proteção real vem do CSP.
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
		// HSTS: força HTTPS por 2 anos. Navegadores ignoram o header quando a
		// conexão é HTTP simples, então é seguro enviar sempre.
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
