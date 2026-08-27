package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"censo-api/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// runtimeAdminClaims mantém os campos legados consumidos pelo frontend, mas
// adiciona identidades estáveis. Para role=dre, UserID é a única identidade de
// usuário confiável em tokens novos; DRE/DREID são snapshots informativos e o
// escopo efetivo é sempre reconstruído do PostgreSQL a cada request.
type runtimeAdminClaims struct {
	UserID   int    `json:"user_id,omitempty"`
	DREID    int    `json:"dre_id,omitempty"`
	Username string `json:"username"`
	Role     string `json:"role"`
	DRE      string `json:"dre,omitempty"`
	jwt.RegisteredClaims
}

var runtimeDummyPasswordHash = func() []byte {
	hash, err := bcrypt.GenerateFromPassword([]byte("censo-runtime-auth-dummy-password"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return hash
}()

func rejectRuntimeLogin(app *application, w http.ResponseWriter, password string) {
	// Mantém custo bcrypt também quando o username não existe e preserva o
	// atraso já usado pelo login legado para reduzir enumeração por timing.
	_ = bcrypt.CompareHashAndPassword(runtimeDummyPasswordHash, []byte(password))
	time.Sleep(600 * time.Millisecond)
	app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
}

func signRuntimeAdminToken(claims runtimeAdminClaims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
}

// AdminLoginRuntime emite tokens com user_id/dre_id para DREs e bloqueia login
// quando o usuário ou a entidade mestre da DRE estiver inativa. O admin legado
// por ENV continua sem dependência do banco.
func (app *application) AdminLoginRuntime(w http.ResponseWriter, r *http.Request) {
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
	if len(req.Username) > 64 || len(req.Password) > 128 {
		app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
		return
	}

	adminUser := os.Getenv("ADMIN_USERNAME")
	adminHash := os.Getenv("ADMIN_PASSWORD_HASH")
	isEnvAdmin := adminUser != "" && adminHash != "" && req.Username == adminUser

	now := time.Now()
	registered := jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(now.Add(jwtExpiry)),
		IssuedAt:  jwt.NewNumericDate(now),
		Issuer:    "censo-admin",
	}

	var claims runtimeAdminClaims
	if isEnvAdmin {
		if err := bcrypt.CompareHashAndPassword([]byte(adminHash), []byte(req.Password)); err != nil {
			time.Sleep(600 * time.Millisecond)
			app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
			return
		}
		registered.Subject = "admin-env"
		claims = runtimeAdminClaims{
			Username:         adminUser,
			Role:             RoleAdmin,
			RegisteredClaims: registered,
		}
	} else {
		if app.models.AdminUsers.DB == nil {
			rejectRuntimeLogin(app, w, req.Password)
			return
		}

		access, err := app.models.AdminUsers.GetRuntimeAccessByUsername(r.Context(), req.Username)
		if err != nil || access == nil || !access.UserActive {
			rejectRuntimeLogin(app, w, req.Password)
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(access.PasswordHash), []byte(req.Password)); err != nil {
			time.Sleep(600 * time.Millisecond)
			app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
			return
		}
		if access.Role != RoleDRE || access.DREID <= 0 || !access.DREActive || strings.TrimSpace(access.DRE) == "" {
			rejectRuntimeLogin(app, w, req.Password)
			return
		}

		registered.Subject = "admin-user:" + strconv.Itoa(access.ID)
		claims = runtimeAdminClaims{
			UserID:           access.ID,
			DREID:            access.DREID,
			Username:         access.Username,
			Role:             RoleDRE,
			DRE:              access.DRE,
			RegisteredClaims: registered,
		}
	}

	tok, err := signRuntimeAdminToken(claims)
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

func parseRuntimeAdminToken(tokenStr string) (*runtimeAdminClaims, error) {
	claims := &runtimeAdminClaims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("algoritmo de assinatura inválido")
		}
		return jwtSecret(), nil
	}, jwt.WithIssuer("censo-admin"), jwt.WithExpirationRequired(), jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		if err == nil {
			err = fmt.Errorf("token inválido")
		}
		return nil, err
	}
	return claims, nil
}

func (app *application) resolveRuntimeDREScope(ctx context.Context, claims *runtimeAdminClaims) (AdminAccessScope, error) {
	// Alguns testes unitários históricos constroem application{} sem DB e
	// exercitam apenas autorização estática. Em produção o DB é obrigatório no
	// startup; este fallback nunca é usado no servidor real.
	if app.models.AdminUsers.DB == nil {
		if strings.TrimSpace(claims.Username) == "" || strings.TrimSpace(claims.DRE) == "" {
			return AdminAccessScope{}, fmt.Errorf("token DRE sem identidade válida")
		}
		return AdminAccessScope{Username: claims.Username, Role: RoleDRE, DRE: claims.DRE}, nil
	}

	var (
		access *models.RuntimeAdminAccess
		err    error
	)
	if claims.UserID > 0 {
		access, err = app.models.AdminUsers.GetRuntimeAccessByID(ctx, claims.UserID)
	} else {
		// Compatibilidade com tokens DRE emitidos antes da #206. O username só é
		// usado para localizar a conta; nome/escopo DRE do JWT é ignorado.
		access, err = app.models.AdminUsers.GetRuntimeAccessByUsername(ctx, claims.Username)
	}
	if err != nil || access == nil || !access.UserActive || access.Role != RoleDRE || access.DREID <= 0 || !access.DREActive || strings.TrimSpace(access.DRE) == "" {
		return AdminAccessScope{}, fmt.Errorf("sessão DRE revogada")
	}
	if claims.UserID > 0 && claims.Subject != "admin-user:"+strconv.Itoa(access.ID) {
		return AdminAccessScope{}, fmt.Errorf("subject incompatível com user_id")
	}

	return AdminAccessScope{
		Username: access.Username,
		Role:     RoleDRE,
		DRE:      access.DRE,
	}, nil
}

// requireRuntimeAdminAuth valida criptograficamente o token e, para role=dre,
// reconstrói o escopo a partir do estado atual do banco em TODA requisição.
// Isso faz status e rename produzirem efeito imediato sem blacklist de JWT.
func (app *application) requireRuntimeAdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			app.errorJSON(w, fmt.Errorf("token de autenticação necessário"), http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := parseRuntimeAdminToken(tokenStr)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("token inválido ou expirado"), http.StatusUnauthorized)
			return
		}

		var scope AdminAccessScope
		switch claims.Role {
		case RoleAdmin:
			scope = AdminAccessScope{Username: claims.Username, Role: RoleAdmin, DRE: ""}
		case RoleDRE:
			scope, err = app.resolveRuntimeDREScope(r.Context(), claims)
			if err != nil {
				app.errorJSON(w, fmt.Errorf("token inválido ou sessão revogada"), http.StatusUnauthorized)
				return
			}
		default:
			app.errorJSON(w, fmt.Errorf("role desconhecida ou inválida"), http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), contextKeyAdminScope, scope)
		ctx = context.WithValue(ctx, contextKeyAdminUser, scope.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// decodeRuntimeLoginToken é pequeno e propositalmente privado; além dos testes,
// facilita validação interna sem duplicar o shape do envelope JSON do login.
func decodeRuntimeLoginToken(body []byte) (string, error) {
	var envelope struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return "", err
	}
	if envelope.Data.Token == "" {
		return "", fmt.Errorf("token ausente")
	}
	return envelope.Data.Token, nil
}
