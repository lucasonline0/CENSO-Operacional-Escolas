package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// ─── Rate Limiter ────────────────────────────────────────────────────────────

type rateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

var loginRL = &rateLimiter{attempts: make(map[string][]time.Time)}

// Limitadores para os endpoints públicos de escrita. Os limites são
// propositalmente generosos para não atrapalhar o preenchimento legítimo
// do formulário (multi-step + autosave, possivelmente várias escolas atrás
// do mesmo IP/NAT de uma DRE), mas cortam abuso/enumeração em massa.
var (
	censusWriteRL = &rateLimiter{attempts: make(map[string][]time.Time)}
	uploadRL      = &rateLimiter{attempts: make(map[string][]time.Time)}
)

const (
	maxLoginAttempts = 5
	rlWindow         = 15 * time.Minute
	jwtExpiry        = 2 * time.Hour

	// Escrita de censo/escola: alto o suficiente para o formulário completo
	// (11 passos + salvamentos automáticos) repetido por várias escolas.
	maxCensusWrites = 300
	censusWindow    = 10 * time.Minute

	// Upload de foto: uma por escola na prática; margem para reenvios.
	maxUploads   = 40
	uploadWindow = 10 * time.Minute
)

// allow implementa um rate limit de janela deslizante para o IP informado,
// com limite e janela parametrizáveis.
func (rl *rateLimiter) allow(ip string, max int, window time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := time.Now().Add(-window)
	var recent []time.Time
	for _, t := range rl.attempts[ip] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	rl.attempts[ip] = recent

	if len(recent) >= max {
		return false
	}
	rl.attempts[ip] = append(rl.attempts[ip], time.Now())
	return true
}

func (rl *rateLimiter) check(ip string) bool {
	return rl.allow(ip, maxLoginAttempts, rlWindow)
}

// trustedProxyCount é o número de proxies reversos confiáveis à frente da
// aplicação. Plataformas como Railway colocam 1 proxy. Default 1.
func trustedProxyCount() int {
	if v := os.Getenv("TRUSTED_PROXY_COUNT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return 1
}

// clientIP resolve o IP real do cliente de forma resistente a spoofing.
//
// O header X-Forwarded-For é totalmente controlável pelo cliente; confiar na
// entrada mais à ESQUERDA (como antes) permitia burlar o rate limit injetando
// IPs falsos. A entrada confiável é a adicionada pelo proxy reverso mais
// próximo — a n-ésima a partir da DIREITA, onde n = nº de proxies confiáveis.
// Sem proxy confiável (TRUSTED_PROXY_COUNT=0) ou sem XFF, usa RemoteAddr, que
// não é spoofável.
func clientIP(r *http.Request) string {
	stripPort := func(addr string) string {
		if i := strings.LastIndex(addr, ":"); i != -1 {
			// Evita cortar IPv6 sem porta (ex.: "::1")
			if strings.Count(addr, ":") == 1 || strings.Contains(addr, "]") {
				return strings.Trim(addr[:i], "[]")
			}
		}
		return strings.Trim(addr, "[]")
	}

	if n := trustedProxyCount(); n > 0 {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			for i := range parts {
				parts[i] = strings.TrimSpace(parts[i])
			}
			idx := len(parts) - n
			if idx < 0 {
				idx = 0
			}
			if parts[idx] != "" {
				return parts[idx]
			}
		}
	}
	return stripPort(r.RemoteAddr)
}

// requirePublicAPIKey é um gate OPCIONAL para os endpoints públicos. Só passa a
// exigir o header X-API-Key quando PUBLIC_API_KEY está definido no servidor —
// se a env estiver vazia, mantém o comportamento atual (não exige nada), o que
// preserva a compatibilidade do formulário já em produção. O frontend já envia
// NEXT_PUBLIC_API_KEY em X-API-Key; basta os dois valores baterem.
func (app *application) requirePublicAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := os.Getenv("PUBLIC_API_KEY")
		if key != "" && r.Method != http.MethodOptions {
			provided := r.Header.Get("X-API-Key")
			if subtle.ConstantTimeCompare([]byte(provided), []byte(key)) != 1 {
				app.errorJSON(w, fmt.Errorf("não autorizado"), http.StatusUnauthorized)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

type adminClaims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// minJWTSecretLen é o tamanho mínimo aceitável para o segredo de assinatura.
const minJWTSecretLen = 32

func jwtSecret() []byte {
	// A validação real acontece no startup (validateSecurityConfig), que aborta
	// o processo caso o segredo esteja ausente ou curto demais. Aqui apenas
	// devolvemos o valor do ambiente — nunca um default embutido no código,
	// que permitiria forjar tokens de admin.
	return []byte(os.Getenv("ADMIN_JWT_SECRET"))
}

// validateSecurityConfig é chamada no boot para garantir que o segredo JWT
// está configurado de forma segura. Falha cedo e de forma explícita em vez de
// silenciosamente cair num default inseguro.
func validateSecurityConfig() error {
	s := os.Getenv("ADMIN_JWT_SECRET")
	if len(s) < minJWTSecretLen {
		return fmt.Errorf("ADMIN_JWT_SECRET ausente ou curto demais (mínimo %d caracteres; gere com: openssl rand -hex 32)", minJWTSecretLen)
	}
	return nil
}

// ─── Handlers ────────────────────────────────────────────────────────────────

func (app *application) AdminLogin(w http.ResponseWriter, r *http.Request) {
	// Limit body to 1KB to prevent DoS
	r.Body = http.MaxBytesReader(w, r.Body, 1024)

	ip := clientIP(r)
	if !loginRL.check(ip) {
		w.Header().Set("Retry-After", "900")
		app.errorJSON(w, fmt.Errorf("muitas tentativas. Aguarde 15 minutos"), http.StatusTooManyRequests)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos"), http.StatusBadRequest)
		return
	}

	// Sanitize: reject inputs with control chars or excessive length
	if len(req.Username) > 64 || len(req.Password) > 128 {
		app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
		return
	}

	adminUser := os.Getenv("ADMIN_USERNAME")
	adminHash := os.Getenv("ADMIN_PASSWORD_HASH") // bcrypt hash

	if adminUser == "" || adminHash == "" {
		app.logger.Println("AVISO SEGURANÇA: ADMIN_USERNAME ou ADMIN_PASSWORD_HASH não definidos")
		app.errorJSON(w, fmt.Errorf("autenticação não configurada no servidor"), http.StatusInternalServerError)
		return
	}

	// Always run bcrypt (even on wrong username) to prevent timing attacks
	hashToCheck := adminHash
	usernameOK := req.Username == adminUser
	pwErr := bcrypt.CompareHashAndPassword([]byte(hashToCheck), []byte(req.Password))

	if !usernameOK || pwErr != nil {
		// Artificial delay discourages automated brute force
		time.Sleep(600 * time.Millisecond)
		app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
		return
	}

	claims := adminClaims{
		Username: req.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "censo-admin",
			Subject:   "admin",
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro interno ao gerar token"), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "Login realizado com sucesso",
		Data: map[string]interface{}{
			"token":      tok,
			"expires_in": int(jwtExpiry.Seconds()),
		},
	})
}

// requireAdminAuth is a chi middleware that validates the Bearer JWT token.
func (app *application) requireAdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			app.errorJSON(w, fmt.Errorf("token de autenticação necessário"), http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &adminClaims{}

		tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("algoritmo de assinatura inválido")
			}
			return jwtSecret(), nil
		}, jwt.WithIssuer("censo-admin"), jwt.WithExpirationRequired())

		if err != nil || !tok.Valid {
			app.errorJSON(w, fmt.Errorf("token inválido ou expirado"), http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), contextKeyAdminUser, claims.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type contextKey string

const contextKeyAdminUser contextKey = "admin_username"

// ─── Dashboard data types ─────────────────────────────────────────────────────

type DashboardStats struct {
	TotalSchools      int              `json:"total_schools"`
	CompletedCensuses int              `json:"completed_censuses"`
	DraftCensuses     int              `json:"draft_censuses"`
	PendingSync       int              `json:"pending_sync"`
	ByDre             []DreStats       `json:"by_dre"`
	Recent            []CensusRow      `json:"recent"`
}

type DreStats struct {
	Dre       string `json:"dre"`
	Total     int    `json:"total"`
	Completed int    `json:"completed"`
	Draft     int    `json:"draft"`
}

type CensusRow struct {
	CensusID   int       `json:"census_id"`
	SchoolID   int       `json:"school_id"`
	Nome       string    `json:"nome_escola"`
	INEP       string    `json:"codigo_inep"`
	Municipio  string    `json:"municipio"`
	Dre        string    `json:"dre"`
	Year       int       `json:"year"`
	Status     string    `json:"status"`
	UpdatedAt  time.Time `json:"updated_at"`
	Synced     bool      `json:"synced"`
}

// ─── AdminDashboard ───────────────────────────────────────────────────────────

func (app *application) AdminDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB // same *sql.DB for both models

	s := DashboardStats{
		ByDre:  []DreStats{},
		Recent: []CensusRow{},
	}

	// Counts — single query avoids multiple round-trips
	err := db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM schools),
			COUNT(*) FILTER (WHERE cr.status = 'completed'),
			COUNT(*) FILTER (WHERE cr.status = 'draft'),
			COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL)
		FROM census_responses cr`).Scan(
		&s.TotalSchools, &s.CompletedCensuses, &s.DraftCensuses, &s.PendingSync)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao buscar totais"), http.StatusInternalServerError)
		return
	}

	// By DRE — parameterized, no interpolation
	rows, err := db.QueryContext(ctx, `
		SELECT
			s.dre,
			COUNT(DISTINCT s.id)                                              AS total,
			COUNT(DISTINCT s.id) FILTER (WHERE cr.status = 'completed')      AS completed,
			COUNT(DISTINCT s.id) FILTER (WHERE cr.status = 'draft')          AS draft
		FROM schools s
		LEFT JOIN census_responses cr ON cr.school_id = s.id
		GROUP BY s.dre
		ORDER BY s.dre`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao buscar por DRE"), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d DreStats
		if err := rows.Scan(&d.Dre, &d.Total, &d.Completed, &d.Draft); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
		s.ByDre = append(s.ByDre, d)
	}

	// Recent 50 census submissions
	rows2, err := db.QueryContext(ctx, `
		SELECT
			cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio, s.dre,
			cr.year, cr.status, cr.updated_at,
			(cr.sheet_synced_at IS NOT NULL)
		FROM census_responses cr
		JOIN schools s ON s.id = cr.school_id
		ORDER BY cr.updated_at DESC
		LIMIT 50`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao buscar censos recentes"), http.StatusInternalServerError)
		return
	}
	defer rows2.Close()
	for rows2.Next() {
		var c CensusRow
		if err := rows2.Scan(&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio,
			&c.Dre, &c.Year, &c.Status, &c.UpdatedAt, &c.Synced); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
		s.Recent = append(s.Recent, c)
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: s})
}

// AdminGetCensus returns all census entries with optional status/DRE filters.
// All filtering is done via parameterized queries — no string interpolation.
func (app *application) AdminGetCensus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	statusFilter := r.URL.Query().Get("status") // "completed" | "draft" | ""
	dreFilter := r.URL.Query().Get("dre")        // DRE name or ""

	// $1 and $2 are safe parameterized filters; empty string matches all via OR trick
	rows, err := db.QueryContext(ctx, `
		SELECT
			cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio, s.dre,
			cr.year, cr.status, cr.updated_at,
			(cr.sheet_synced_at IS NOT NULL)
		FROM census_responses cr
		JOIN schools s ON s.id = cr.school_id
		WHERE ($1 = '' OR cr.status = $1)
		  AND ($2 = '' OR s.dre = $2)
		ORDER BY cr.updated_at DESC`,
		statusFilter, dreFilter)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao listar censos"), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var results []CensusRow
	for rows.Next() {
		var c CensusRow
		if err := rows.Scan(&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio,
			&c.Dre, &c.Year, &c.Status, &c.UpdatedAt, &c.Synced); err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
		results = append(results, c)
	}
	if results == nil {
		results = []CensusRow{}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: results})
}

// CensusFullRecord representa a resposta completa de um censo, incluindo o JSON bruto.
type CensusFullRecord struct {
	CensusID  int             `json:"census_id"`
	SchoolID  int             `json:"school_id"`
	Nome      string          `json:"nome_escola"`
	INEP      string          `json:"codigo_inep"`
	Municipio string          `json:"municipio"`
	Dre       string          `json:"dre"`
	Year      int             `json:"year"`
	Status    string          `json:"status"`
	Data      json.RawMessage `json:"data"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
	Synced    bool            `json:"synced"`
}

// AdminSheetMetrics retorna os indicadores calculados a partir da planilha Base_dados.
func (app *application) AdminSheetMetrics(w http.ResponseWriter, r *http.Request) {
	if app.sheets == nil {
		app.errorJSON(w, fmt.Errorf("serviço de planilhas não configurado"), http.StatusServiceUnavailable)
		return
	}
	metrics, err := app.sheets.GetSheetMetrics()
	if err != nil {
		app.logger.Printf("AdminSheetMetrics: %v", err)
		app.errorJSON(w, fmt.Errorf("erro ao ler planilha"), http.StatusInternalServerError)
		return
	}
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: metrics})
}

// AdminIndicadoresMetrics retorna métricas de perfil dos alunos da aba Indicadores_Flags.
func (app *application) AdminIndicadoresMetrics(w http.ResponseWriter, r *http.Request) {
	if app.sheets == nil {
		app.errorJSON(w, fmt.Errorf("serviço de planilhas não configurado"), http.StatusServiceUnavailable)
		return
	}
	metrics, err := app.sheets.GetIndicadoresMetrics()
	if err != nil {
		app.logger.Printf("AdminIndicadoresMetrics: %v", err)
		app.errorJSON(w, fmt.Errorf("erro ao ler Indicadores_Flags"), http.StatusInternalServerError)
		return
	}
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: metrics})
}

// AdminGetCensusByID retorna o JSON completo de uma resposta de censo específica.
// Usado pelo botão "Ver JSON" no painel admin.
func (app *application) AdminGetCensusByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		app.errorJSON(w, fmt.Errorf("id inválido"), http.StatusBadRequest)
		return
	}

	var c CensusFullRecord
	var rawData []byte

	err = app.models.Schools.DB.QueryRowContext(r.Context(), `
		SELECT cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio, s.dre,
		       cr.year, cr.status, cr.data, cr.created_at, cr.updated_at,
		       (cr.sheet_synced_at IS NOT NULL)
		FROM census_responses cr
		JOIN schools s ON s.id = cr.school_id
		WHERE cr.id = $1`, id).Scan(
		&c.CensusID, &c.SchoolID, &c.Nome, &c.INEP, &c.Municipio, &c.Dre,
		&c.Year, &c.Status, &rawData, &c.CreatedAt, &c.UpdatedAt, &c.Synced,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("censo não encontrado"), http.StatusNotFound)
		return
	}

	c.Data = json.RawMessage(rawData)
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: c})
}
