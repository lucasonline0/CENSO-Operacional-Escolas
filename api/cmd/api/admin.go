package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"censo-api/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

// ─── Rate Limiter ────────────────────────────────────────────────────────────

// rateLimiter implementa rate limit por IP com janela deslizante e limpeza
// periódica de chaves inativas para evitar crescimento indefinido de memória.
type rateLimiter struct {
	mu         sync.Mutex
	attempts   map[string][]time.Time
	window     time.Duration
	lastSweep  time.Time
}

const rlSweepInterval = 5 * time.Minute

var loginRL = &rateLimiter{
	attempts:  make(map[string][]time.Time),
	window:    15 * time.Minute,
	lastSweep: time.Now(),
}

// Limitadores para os endpoints públicos de escrita. Os limites são
// propositalmente generosos para não atrapalhar o preenchimento legítimo
// do formulário (multi-step + autosave, possivelmente várias escolas atrás
// do mesmo IP/NAT de uma DRE), mas cortam abuso/enumeração em massa.
var (
	censusWriteRL = &rateLimiter{
		attempts:  make(map[string][]time.Time),
		window:    10 * time.Minute,
		lastSweep: time.Now(),
	}
	uploadRL = &rateLimiter{
		attempts:  make(map[string][]time.Time),
		window:    10 * time.Minute,
		lastSweep: time.Now(),
	}
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

// sweep remove todas as chaves cujas timestamps são todas anteriores à janela.
// Deve ser chamado com rl.mu segurado.
func (rl *rateLimiter) sweep() {
	now := time.Now()
	if now.Sub(rl.lastSweep) < rlSweepInterval {
		return
	}
	rl.lastSweep = now
	cutoff := now.Add(-rl.window)
	for ip, timestamps := range rl.attempts {
		// Verifica se há pelo menos uma timestamp dentro da janela.
		active := false
		for _, t := range timestamps {
			if t.After(cutoff) {
				active = true
				break
			}
		}
		if !active {
			delete(rl.attempts, ip)
		}
	}
}

// allow implementa um rate limit de janela deslizante para o IP informado,
// com limite e janela parametrizáveis. Executa sweep periódico para limpar
// chaves inativas e evitar crescimento indefinido do map.
func (rl *rateLimiter) allow(ip string, max int, window time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.sweep()

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
	Role     string `json:"role"`
	DRE      string `json:"dre,omitempty"`
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

// AdminMe retorna os dados do perfil do usuário autenticado.
func (app *application) AdminMe(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok {
		app.errorJSON(w, fmt.Errorf("escopo de acesso não encontrado"), http.StatusUnauthorized)
		return
	}

	var drePtr *string
	if scope.Role == RoleDRE && scope.DRE != "" {
		dreVal := scope.DRE
		drePtr = &dreVal
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error: false,
		Data: map[string]interface{}{
			"username": scope.Username,
			"role":     scope.Role,
			"dre":      drePtr,
		},
	})
}

// ─── Dashboard data types ─────────────────────────────────────────────────────

type DashboardStats struct {
	TotalSchools      int         `json:"total_schools"`
	CompletedCensuses int         `json:"completed_censuses"`
	DraftCensuses     int         `json:"draft_censuses"`
	PendingSync       int         `json:"pending_sync"`
	ByDre             []DreStats  `json:"by_dre"`
	Recent            []CensusRow `json:"recent"`
}

type DreStats struct {
	Dre       string `json:"dre"`
	Total     int    `json:"total"`
	Completed int    `json:"completed"`
	Draft     int    `json:"draft"`
}

type CensusRow struct {
	CensusID  int       `json:"census_id"`
	SchoolID  int       `json:"school_id"`
	Nome      string    `json:"nome_escola"`
	INEP      string    `json:"codigo_inep"`
	Municipio string    `json:"municipio"`
	Dre       string    `json:"dre"`
	Year      int       `json:"year"`
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
	Synced    bool      `json:"synced"`
}

// ─── AdminDashboard ───────────────────────────────────────────────────────────

func (app *application) AdminDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB // same *sql.DB for both models
	scope, _ := GetAdminAccessScope(ctx)

	s := DashboardStats{
		ByDre:  []DreStats{},
		Recent: []CensusRow{},
	}

	if scope.Role == RoleDRE {
		dreFilter := strings.TrimSpace(scope.DRE)
		err := db.QueryRowContext(ctx, `
			SELECT
				(SELECT COUNT(*) FROM schools s WHERE UPPER(TRIM(s.dre)) = UPPER(TRIM($1))),
				COUNT(*) FILTER (WHERE cr.status = 'completed' AND UPPER(TRIM(s.dre)) = UPPER(TRIM($1))),
				COUNT(*) FILTER (WHERE cr.status = 'draft' AND UPPER(TRIM(s.dre)) = UPPER(TRIM($1))),
				COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL AND UPPER(TRIM(s.dre)) = UPPER(TRIM($1)))
			FROM census_responses cr
			JOIN schools s ON s.id = cr.school_id`, dreFilter).Scan(
			&s.TotalSchools, &s.CompletedCensuses, &s.DraftCensuses, &s.PendingSync)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao buscar totais"), http.StatusInternalServerError)
			return
		}

		rows, err := db.QueryContext(ctx, `
			SELECT
				s.dre,
				COUNT(DISTINCT s.id)                                              AS total,
				COUNT(DISTINCT s.id) FILTER (WHERE cr.status = 'completed')      AS completed,
				COUNT(DISTINCT s.id) FILTER (WHERE cr.status = 'draft')          AS draft
			FROM schools s
			LEFT JOIN census_responses cr ON cr.school_id = s.id
			WHERE UPPER(TRIM(s.dre)) = UPPER(TRIM($1))
			GROUP BY s.dre
			ORDER BY s.dre`, dreFilter)
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

		rows2, err := db.QueryContext(ctx, `
			SELECT
				cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio, s.dre,
				cr.year, cr.status, cr.updated_at,
				(cr.sheet_synced_at IS NOT NULL)
			FROM census_responses cr
			JOIN schools s ON s.id = cr.school_id
			WHERE UPPER(TRIM(s.dre)) = UPPER(TRIM($1))
			ORDER BY cr.updated_at DESC
			LIMIT 50`, dreFilter)
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
	} else {
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
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: s})
}

// CensusSummary resume o recorte global da tela "Registros do Censo". Os cards
// da aba usam estes números: respeitam os filtros globais (year, dre, municipio,
// zona, regiao_integracao) mas NÃO os filtros locais da listagem (status, search,
// page, limit) — status e busca refinam apenas a tabela.
type CensusSummary struct {
	TotalSchools      int `json:"total_schools"`
	CompletedCensuses int `json:"completed_censuses"`
	DraftCensuses     int `json:"draft_censuses"`
	PendingSync       int `json:"pending_sync"`
}

type CensusPageResponse struct {
	Rows    []CensusRow   `json:"rows"`
	Total   int           `json:"total"`
	Page    int           `json:"page"`
	Limit   int           `json:"limit"`
	Summary CensusSummary `json:"summary"`
}

// censusListAllowedLimits são os tamanhos de página aceitos por /v1/admin/census.
// Valores fora deste conjunto caem no default (10).
var censusListAllowedLimits = map[int]bool{10: true, 50: true, 100: true, 1000: true}

// censusListParams reúne os parâmetros de /v1/admin/census: filtros globais do
// dashboard (Year, DRE, Municipio, Zona, RegiaoIntegracao), filtros locais da
// aba (Status, Search) e paginação. String vazia e Year=0 significam "filtro
// desativado" — o endpoint nunca assume ano corrente como default, preservando
// o comportamento operacional anterior (sem filtro de ano = todos os anos).
type censusListParams struct {
	Status           string
	Year             int
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
	Search           string
	Limit            int
	Page             int
}

// parseCensusListParams lê a query string com defaults tolerantes: year ausente
// ou inválido não filtra, limit fora de {10, 50, 100, 1000} vira 10 e page
// ausente ou inválida vira 1. Espaços em branco equivalem a filtro desativado.
func parseCensusListParams(q url.Values) censusListParams {
	p := censusListParams{
		Status:           strings.TrimSpace(q.Get("status")),
		DRE:              strings.TrimSpace(q.Get("dre")),
		Municipio:        strings.TrimSpace(q.Get("municipio")),
		Zona:             strings.TrimSpace(q.Get("zona")),
		RegiaoIntegracao: strings.TrimSpace(q.Get("regiao_integracao")),
		Search:           strings.TrimSpace(q.Get("search")),
		Limit:            10,
		Page:             1,
	}
	if v, err := strconv.Atoi(strings.TrimSpace(q.Get("year"))); err == nil && v > 0 {
		p.Year = v
	}
	if v, err := strconv.Atoi(strings.TrimSpace(q.Get("limit"))); err == nil && censusListAllowedLimits[v] {
		p.Limit = v
	}
	if v, err := strconv.Atoi(strings.TrimSpace(q.Get("page"))); err == nil && v > 0 {
		p.Page = v
	}
	return p
}

// censusListWhereSQL é a cláusula de filtros compartilhada entre o COUNT(*) e a
// listagem de /v1/admin/census — uma única fonte evita divergência entre total
// paginado e linhas exibidas. Todos os filtros combinam por AND; UPPER(TRIM())
// tolera caixa e espaços, espelhando o padrão da Saúde Operacional. A Região de
// Integração casa schools.municipio contra reg_integracao (mesma ressalva de
// grafia documentada em saudeOperacionalSelectSQL). A busca textual ($7) roda
// no banco, sobre escola, INEP, município, DRE, status e ano.
// Argumentos: $1=status, $2=year, $3=dre, $4=municipio, $5=zona,
// $6=regiao_integracao, $7=search.
const censusListWhereSQL = `
	WHERE ($1 = '' OR cr.status = $1)
	  AND ($2 = 0 OR cr.year = $2)
	  AND ($3 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($5)))
	  AND ($6 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($6))
	      ))
	  AND ($7 = ''
	       OR s.nome_escola ILIKE '%' || $7 || '%'
	       OR s.codigo_inep ILIKE '%' || $7 || '%'
	       OR s.municipio ILIKE '%' || $7 || '%'
	       OR s.dre ILIKE '%' || $7 || '%'
	       OR cr.status ILIKE '%' || $7 || '%'
	       OR cr.year::text ILIKE '%' || $7 || '%')`

const censusListCountSQL = `
	SELECT COUNT(*)
	FROM census_responses cr
	JOIN schools s ON s.id = cr.school_id` + censusListWhereSQL

const censusListSelectSQL = `
	SELECT
		cr.id, cr.school_id, s.nome_escola, s.codigo_inep, s.municipio, s.dre,
		cr.year, cr.status, cr.updated_at,
		(cr.sheet_synced_at IS NOT NULL)
	FROM census_responses cr
	JOIN schools s ON s.id = cr.school_id` + censusListWhereSQL + `
	ORDER BY cr.updated_at DESC
	LIMIT $8 OFFSET $9`

// whereArgs devolve os argumentos posicionais de censusListWhereSQL na ordem
// $1=status, $2=year, $3=dre, $4=municipio, $5=zona, $6=regiao_integracao,
// $7=search.
func (p censusListParams) whereArgs() []any {
	return []any{p.Status, p.Year, p.DRE, p.Municipio, p.Zona, p.RegiaoIntegracao, p.Search}
}

// censusSummarySQL calcula o resumo dos cards da aba. Aplica somente os filtros
// globais ($1=year, $2=dre, $3=municipio, $4=zona, $5=regiao_integracao) —
// status e search ficam de fora de propósito (ver CensusSummary).
// total_schools conta escolas cadastradas no recorte (sem JOIN com censo e sem
// filtro de ano: o cadastro de escolas não é versionado por ano); os demais
// contadores contam respostas de censo dentro do recorte e do ano informado.
const censusSummarySQL = `
	SELECT
		(SELECT COUNT(*)
		 FROM schools s
		 WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
		   AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
		   AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
		   AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
		         SELECT UPPER(TRIM(municipio))
		         FROM reg_integracao
		         WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
		       ))),
		COUNT(*) FILTER (WHERE cr.status = 'completed'),
		COUNT(*) FILTER (WHERE cr.status = 'draft'),
		COUNT(*) FILTER (WHERE cr.status = 'completed' AND cr.sheet_synced_at IS NULL)
	FROM census_responses cr
	JOIN schools s ON s.id = cr.school_id
	WHERE ($1 = 0 OR cr.year = $1)
	  AND ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))`

// summaryArgs devolve os argumentos posicionais de censusSummarySQL na ordem
// $1=year, $2=dre, $3=municipio, $4=zona, $5=regiao_integracao.
func (p censusListParams) summaryArgs() []any {
	return []any{p.Year, p.DRE, p.Municipio, p.Zona, p.RegiaoIntegracao}
}

// AdminGetCensus returns paginated census entries for the "Registros do Censo"
// screen. Filtros globais do dashboard: year, dre, municipio, zona,
// regiao_integracao. Filtros locais: status, search. Paginação: limit
// (10/50/100/1000, default 10), page (default 1). O payload inclui um resumo
// (summary) que respeita apenas os filtros globais.
func (app *application) AdminGetCensus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB
	scope, _ := GetAdminAccessScope(ctx)

	p := parseCensusListParams(r.URL.Query())
	if scope.Role == RoleDRE {
		p.DRE = strings.TrimSpace(scope.DRE)
	}

	whereArgs := p.whereArgs()
	offset := (p.Page - 1) * p.Limit

	var total int
	if err := db.QueryRowContext(ctx, censusListCountSQL, whereArgs...).Scan(&total); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao contar censos"), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, censusListSelectSQL, append(whereArgs, p.Limit, offset)...)
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

	var summary CensusSummary
	if err := db.QueryRowContext(ctx, censusSummarySQL, p.summaryArgs()...).Scan(
		&summary.TotalSchools, &summary.CompletedCensuses,
		&summary.DraftCensuses, &summary.PendingSync); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao resumir censos"), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: CensusPageResponse{
		Rows: results, Total: total, Page: p.Page, Limit: p.Limit, Summary: summary,
	}})
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

// AdminSheetMetrics retorna os indicadores calculados a partir da planilha Base_dados (apenas admin).
func (app *application) AdminSheetMetrics(w http.ResponseWriter, r *http.Request) {
	scope, _ := GetAdminAccessScope(r.Context())
	if scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}
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

// AdminIndicadoresMetrics retorna métricas de perfil dos alunos da aba Indicadores_Flags (apenas admin).
func (app *application) AdminIndicadoresMetrics(w http.ResponseWriter, r *http.Request) {
	scope, _ := GetAdminAccessScope(r.Context())
	if scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}
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

// AdminGetCensusByID retorna o JSON completo de uma resposta de censo específica com verificação BOLA por DRE.
func (app *application) AdminGetCensusByID(w http.ResponseWriter, r *http.Request) {
	scope, _ := GetAdminAccessScope(r.Context())

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

	if !scope.IsAuthorizedForDRE(c.Dre) {
		app.errorJSON(w, fmt.Errorf("acesso não permitido para esta DRE"), http.StatusForbidden)
		return
	}

	c.Data = json.RawMessage(rawData)
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: c})
}

// ─── Gestão de DREs (role=admin) ─────────────────────────────────────────────

// AdminCreateDRE cria uma nova DRE no sistema (exclusivo para role=admin).
func (app *application) AdminCreateDRE(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	var req struct {
		Nome          string `json:"nome"`
		Sigla         string `json:"sigla"`
		MunicipioSede string `json:"municipio_sede"`
		Polo          string `json:"polo"`
		GestorNome    string `json:"gestor_nome"`
		Email         string `json:"email"`
		Telefone      string `json:"telefone"`
		Ativa         *bool  `json:"ativa"`
	}

	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Nome) == "" {
		app.errorJSON(w, fmt.Errorf("nome da DRE não pode ser vazio"), http.StatusBadRequest)
		return
	}

	ativa := true
	if req.Ativa != nil {
		ativa = *req.Ativa
	}

	dre := models.DRE{
		Nome:          req.Nome,
		Sigla:         req.Sigla,
		MunicipioSede: req.MunicipioSede,
		Polo:          req.Polo,
		GestorNome:    req.GestorNome,
		Email:         req.Email,
		Telefone:      req.Telefone,
		Ativa:         ativa,
	}

	created, err := app.models.DREs.Create(r.Context(), dre)
	if err != nil {
		if errors.Is(err, models.ErrDREExists) {
			app.errorJSON(w, err, http.StatusConflict)
			return
		}
		if errors.Is(err, models.ErrDRENameRequired) {
			app.errorJSON(w, err, http.StatusBadRequest)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao criar DRE: %w", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusCreated, jsonResponse{
		Error:   false,
		Message: "DRE criada com sucesso",
		Data:    created,
	})
}

// AdminListDREs lista todas as DREs cadastradas (exclusivo para role=admin).
func (app *application) AdminListDREs(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	dres, err := app.models.DREs.List(r.Context())
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao listar DREs: %w", err), http.StatusInternalServerError)
		return
	}
	if dres == nil {
		dres = []*models.DRE{}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error: false,
		Data:  dres,
	})
}

// AdminUpdateDRE atualiza os dados de uma DRE existente (exclusivo para role=admin).
func (app *application) AdminUpdateDRE(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		app.errorJSON(w, fmt.Errorf("ID de DRE inválido"), http.StatusBadRequest)
		return
	}

	existing, err := app.models.DREs.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, models.ErrDRENotFound) {
			app.errorJSON(w, fmt.Errorf("DRE não encontrada"), http.StatusNotFound)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao buscar DRE: %w", err), http.StatusInternalServerError)
		return
	}

	var req struct {
		Nome          string `json:"nome"`
		Sigla         string `json:"sigla"`
		MunicipioSede string `json:"municipio_sede"`
		Polo          string `json:"polo"`
		GestorNome    string `json:"gestor_nome"`
		Email         string `json:"email"`
		Telefone      string `json:"telefone"`
		Ativa         *bool  `json:"ativa"`
	}

	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Nome) == "" {
		app.errorJSON(w, fmt.Errorf("nome da DRE não pode ser vazio"), http.StatusBadRequest)
		return
	}

	ativa := existing.Ativa
	if req.Ativa != nil {
		ativa = *req.Ativa
	}

	dre := models.DRE{
		ID:            id,
		Nome:          req.Nome,
		Sigla:         req.Sigla,
		MunicipioSede: req.MunicipioSede,
		Polo:          req.Polo,
		GestorNome:    req.GestorNome,
		Email:         req.Email,
		Telefone:      req.Telefone,
		Ativa:         ativa,
	}

	updated, err := app.models.DREs.Update(r.Context(), dre)
	if err != nil {
		if errors.Is(err, models.ErrDRENotFound) {
			app.errorJSON(w, err, http.StatusNotFound)
			return
		}
		if errors.Is(err, models.ErrDREExists) {
			app.errorJSON(w, err, http.StatusConflict)
			return
		}
		if errors.Is(err, models.ErrDRENameRequired) || errors.Is(err, models.ErrDREInvalidID) {
			app.errorJSON(w, err, http.StatusBadRequest)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao atualizar DRE: %w", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "DRE atualizada com sucesso",
		Data:    updated,
	})
}

// ─── Gestão de Usuários Administrativos (role=admin) ─────────────────────────

// AdminCreateUser cria um novo usuário DRE com hash bcrypt e validação de DRE (exclusivo para role=admin).
func (app *application) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
		DRE      string `json:"dre"`
	}

	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Role) == "" {
		req.Role = RoleDRE
	}

	user, err := app.models.AdminUsers.Create(r.Context(), req.Username, req.Password, req.Role, req.DRE)
	if err != nil {
		if errors.Is(err, models.ErrUsernameExists) {
			app.errorJSON(w, err, http.StatusConflict)
			return
		}
		if errors.Is(err, models.ErrInvalidRole) ||
			errors.Is(err, models.ErrDRERequiredForDRE) ||
			errors.Is(err, models.ErrInvalidDRE) ||
			errors.Is(err, models.ErrDREInactive) ||
			strings.Contains(err.Error(), "não pode ser vazio") ||
			strings.Contains(err.Error(), "mínimo 12 caracteres") {
			app.errorJSON(w, err, http.StatusBadRequest)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao criar usuário: %w", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusCreated, jsonResponse{
		Error:   false,
		Message: "Usuário criado com sucesso",
		Data:    user,
	})
}

// AdminListUsers lista todos os usuários administrativos sem expor senhas (exclusivo para role=admin).
func (app *application) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	users, err := app.models.AdminUsers.List(r.Context())
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao listar usuários: %w", err), http.StatusInternalServerError)
		return
	}
	if users == nil {
		users = []*models.AdminUser{}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error: false,
		Data:  users,
	})
}

// AdminUpdateUserStatus ativa ou desativa um usuário pelo ID (exclusivo para role=admin).
func (app *application) AdminUpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		app.errorJSON(w, fmt.Errorf("ID de usuário inválido"), http.StatusBadRequest)
		return
	}

	var req struct {
		Active *bool   `json:"active"`
		Status *string `json:"status"`
	}

	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}

	var active bool
	if req.Active != nil {
		active = *req.Active
	} else if req.Status != nil {
		st := strings.ToLower(strings.TrimSpace(*req.Status))
		if st == "active" || st == "ativo" || st == "true" {
			active = true
		} else if st == "inactive" || st == "inativo" || st == "false" {
			active = false
		} else {
			app.errorJSON(w, fmt.Errorf("valor de status inválido. Use 'active' ou 'inactive'"), http.StatusBadRequest)
			return
		}
	} else {
		app.errorJSON(w, fmt.Errorf("campo 'active' ou 'status' é obrigatório"), http.StatusBadRequest)
		return
	}

	err = app.models.AdminUsers.SetActiveByID(r.Context(), id, active)
	if err != nil {
		if errors.Is(err, models.ErrUserNotFound) {
			app.errorJSON(w, fmt.Errorf("usuário não encontrado"), http.StatusNotFound)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao atualizar status do usuário: %w", err), http.StatusInternalServerError)
		return
	}

	user, err := app.models.AdminUsers.GetByID(r.Context(), id)
	if err == nil && user != nil {
		app.writeJSON(w, http.StatusOK, jsonResponse{
			Error:   false,
			Message: "Status do usuário atualizado com sucesso",
			Data:    user,
		})
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "Status do usuário atualizado com sucesso",
		Data:    map[string]interface{}{"id": id, "active": active},
	})
}

// AdminResetUserPassword redefine a senha de um usuário pelo ID (exclusivo para role=admin).
func (app *application) AdminResetUserPassword(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		app.errorJSON(w, fmt.Errorf("ID de usuário inválido"), http.StatusBadRequest)
		return
	}

	var req struct {
		Password    string `json:"password"`
		NewPassword string `json:"new_password"`
	}

	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos: %w", err), http.StatusBadRequest)
		return
	}

	newPassword := req.Password
	if newPassword == "" {
		newPassword = req.NewPassword
	}
	newPassword = strings.TrimSpace(newPassword)

	if len(newPassword) < 12 {
		app.errorJSON(w, fmt.Errorf("nova senha deve ter no mínimo 12 caracteres"), http.StatusBadRequest)
		return
	}

	err = app.models.AdminUsers.UpdatePasswordByID(r.Context(), id, newPassword)
	if err != nil {
		if errors.Is(err, models.ErrUserNotFound) {
			app.errorJSON(w, fmt.Errorf("usuário não encontrado"), http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "mínimo 12 caracteres") {
			app.errorJSON(w, err, http.StatusBadRequest)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao redefinir senha: %w", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "Senha redefinida com sucesso",
	})
}
