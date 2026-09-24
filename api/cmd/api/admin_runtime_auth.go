package main

import (
	"context"
	"encoding/json"
	"errors"
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
	UserID      int    `json:"user_id,omitempty"`
	DREID       int    `json:"dre_id,omitempty"`
	Username    string `json:"username"`
	Role        string `json:"role"`
	DRE         string `json:"dre,omitempty"`
	AuthVersion int    `json:"auth_version,omitempty"`
	jwt.RegisteredClaims
}

const (
	passwordSetupIssuer   = "censo-password-setup"
	passwordSetupAudience = "censo-password-setup"
	passwordSetupPurpose  = "password_setup"
	passwordSetupExpiry   = 10 * time.Minute
)

type passwordSetupClaims struct {
	UserID      int    `json:"user_id"`
	AuthVersion int    `json:"auth_version"`
	Purpose     string `json:"purpose"`
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
	// Mantém o mesmo custo bcrypt também quando o username não existe, evitando
	// enumeração por timing sem adicionar um sleep artificial ao caminho de erro.
	_ = bcrypt.CompareHashAndPassword(runtimeDummyPasswordHash, []byte(password))
	app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
}

func signRuntimeAdminToken(claims runtimeAdminClaims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
}

func signPasswordSetupChallenge(access *models.RuntimeAdminAccess, now time.Time) (string, error) {
	claims := passwordSetupClaims{
		UserID:      access.ID,
		AuthVersion: access.AuthVersion,
		Purpose:     passwordSetupPurpose,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "password-setup:" + strconv.Itoa(access.ID),
			Issuer:    passwordSetupIssuer,
			Audience:  jwt.ClaimStrings{passwordSetupAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(passwordSetupExpiry)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
}

func parsePasswordSetupChallenge(tokenStr string) (*passwordSetupClaims, error) {
	claims := &passwordSetupClaims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("algoritmo de assinatura inválido")
		}
		return jwtSecret(), nil
	},
		jwt.WithIssuer(passwordSetupIssuer),
		jwt.WithAudience(passwordSetupAudience),
		jwt.WithExpirationRequired(),
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)
	if err != nil || !tok.Valid || claims.Purpose != passwordSetupPurpose || claims.UserID <= 0 || claims.AuthVersion <= 0 || claims.Subject != "password-setup:"+strconv.Itoa(claims.UserID) {
		if err == nil {
			err = fmt.Errorf("challenge inválido")
		}
		return nil, err
	}
	return claims, nil
}

func runtimeDREClaims(access *models.RuntimeAdminAccess, now time.Time) runtimeAdminClaims {
	authVer := access.AuthVersion
	if authVer <= 0 {
		authVer = 1
	}
	return runtimeAdminClaims{
		UserID:      access.ID,
		DREID:       access.DREID,
		Username:    access.Username,
		Role:        access.Role,
		DRE:         access.DRE,
		AuthVersion: authVer,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "admin-user:" + strconv.Itoa(access.ID),
			ExpiresAt: jwt.NewNumericDate(now.Add(jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "censo-admin",
		},
	}
}

// AdminLoginRuntime emite tokens com user_id/dre_id/auth_version para DREs e bloqueia login
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
		Username   string `json:"username"`
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos"), http.StatusBadRequest)
		return
	}
	identity := strings.TrimSpace(req.Identifier)
	if identity == "" {
		identity = strings.TrimSpace(req.Username)
	}
	if identity == "" || len(identity) > 254 || len(req.Password) > 128 {
		app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
		return
	}

	adminUser := os.Getenv("ADMIN_USERNAME")
	adminHash := os.Getenv("ADMIN_PASSWORD_HASH")
	isEnvAdmin := adminUser != "" && adminHash != "" && identity == adminUser

	now := time.Now()
	registered := jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(now.Add(jwtExpiry)),
		IssuedAt:  jwt.NewNumericDate(now),
		Issuer:    "censo-admin",
	}

	var claims runtimeAdminClaims
	if isEnvAdmin {
		if err := bcrypt.CompareHashAndPassword([]byte(adminHash), []byte(req.Password)); err != nil {
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

		access, err := app.models.AdminUsers.GetRuntimeAccessByIdentity(r.Context(), identity)
		if err != nil || access == nil || !access.UserActive {
			rejectRuntimeLogin(app, w, req.Password)
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(access.PasswordHash), []byte(req.Password)); err != nil {
			app.errorJSON(w, fmt.Errorf("credenciais inválidas"), http.StatusUnauthorized)
			return
		}
		if !validRuntimeAccess(access) {
			rejectRuntimeLogin(app, w, req.Password)
			return
		}
		if access.MustChangePassword {
			challenge, err := signPasswordSetupChallenge(access, now)
			if err != nil {
				app.errorJSON(w, fmt.Errorf("erro interno ao gerar desafio"), http.StatusInternalServerError)
				return
			}
			app.writeJSON(w, http.StatusForbidden, jsonResponse{
				Error:   true,
				Code:    "PASSWORD_SETUP_REQUIRED",
				Message: "Crie uma nova senha para concluir o primeiro acesso",
				Data: map[string]interface{}{
					"challenge_token": challenge,
					"expires_in":      int(passwordSetupExpiry.Seconds()),
				},
			})
			return
		}

		claims = runtimeDREClaims(access, now)
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

// AdminCompleteFirstAccess aceita exclusivamente o challenge de escopo restrito,
// nunca um JWT normal do painel. A resposta só contém uma sessão normal depois
// que o bcrypt, o flag e auth_version foram atualizados atomicamente.
func (app *application) AdminCompleteFirstAccess(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		app.errorJSON(w, fmt.Errorf("challenge de primeiro acesso necessário"), http.StatusUnauthorized)
		return
	}
	claims, err := parsePasswordSetupChallenge(strings.TrimPrefix(authHeader, "Bearer "))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("challenge inválido ou expirado"), http.StatusUnauthorized)
		return
	}

	var req struct {
		NewPassword     string `json:"new_password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos"), http.StatusBadRequest)
		return
	}
	if req.NewPassword != req.ConfirmPassword {
		app.writeJSON(w, http.StatusBadRequest, jsonResponse{Error: true, Code: "PASSWORD_CONFIRMATION_MISMATCH", Message: "A confirmação da senha não confere"})
		return
	}
	if len(req.NewPassword) < 12 {
		app.errorJSON(w, fmt.Errorf("nova senha deve ter no mínimo 12 caracteres"), http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) > 128 {
		app.errorJSON(w, fmt.Errorf("nova senha deve ter no máximo 128 caracteres"), http.StatusBadRequest)
		return
	}

	newAuthVersion, err := app.models.AdminUsers.CompleteFirstAccess(r.Context(), claims.UserID, claims.AuthVersion, req.NewPassword)
	if err != nil {
		if errors.Is(err, models.ErrPasswordSetupInvalid) {
			app.errorJSON(w, fmt.Errorf("challenge inválido, revogado ou já utilizado"), http.StatusUnauthorized)
			return
		}
		app.errorJSON(w, fmt.Errorf("erro ao concluir primeiro acesso"), http.StatusInternalServerError)
		return
	}
	access, err := app.models.AdminUsers.GetRuntimeAccessByID(r.Context(), claims.UserID)
	if err != nil || !validRuntimeAccess(access) || access.MustChangePassword || access.AuthVersion != newAuthVersion {
		app.errorJSON(w, fmt.Errorf("não foi possível emitir a sessão"), http.StatusUnauthorized)
		return
	}
	token, err := signRuntimeAdminToken(runtimeDREClaims(access, time.Now()))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro interno ao gerar token"), http.StatusInternalServerError)
		return
	}
	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error:   false,
		Message: "Senha criada com sucesso",
		Data: map[string]interface{}{
			"token":      token,
			"expires_in": int(jwtExpiry.Seconds()),
		},
	})
}

func (app *application) AdminChangeOwnPassword(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.UserID <= 0 || scope.Role == RoleAdmin {
		app.errorJSON(w, fmt.Errorf("troca de senha não disponível para esta conta"), http.StatusForbidden)
		return
	}
	if !loginRL.check("password-change:" + clientIP(r)) {
		w.Header().Set("Retry-After", "900")
		app.errorJSON(w, fmt.Errorf("muitas tentativas. Aguarde 15 minutos"), http.StatusTooManyRequests)
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		ConfirmPassword string `json:"confirm_password"`
	}
	if err := app.readJSON(w, r, &req); err != nil {
		app.errorJSON(w, fmt.Errorf("dados inválidos"), http.StatusBadRequest)
		return
	}
	if req.NewPassword != req.ConfirmPassword {
		app.writeJSON(w, http.StatusBadRequest, jsonResponse{Error: true, Code: "PASSWORD_CONFIRMATION_MISMATCH", Message: "A confirmação da senha não confere"})
		return
	}

	newVersion, err := app.models.AdminUsers.ChangeOwnPassword(r.Context(), scope.UserID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrCurrentPasswordInvalid):
			app.errorJSON(w, fmt.Errorf("senha atual inválida"), http.StatusBadRequest)
		case errors.Is(err, models.ErrUserInactive), errors.Is(err, models.ErrUserNotFound):
			app.errorJSON(w, fmt.Errorf("sessão revogada"), http.StatusUnauthorized)
		case strings.Contains(err.Error(), "mínimo 12 caracteres"), strings.Contains(err.Error(), "máximo 128 caracteres"):
			app.errorJSON(w, err, http.StatusBadRequest)
		default:
			app.errorJSON(w, fmt.Errorf("erro ao alterar senha"), http.StatusInternalServerError)
		}
		return
	}

	access, err := app.models.AdminUsers.GetRuntimeAccessByID(r.Context(), scope.UserID)
	if err != nil || !validRuntimeAccess(access) || access.AuthVersion != newVersion || access.MustChangePassword {
		app.errorJSON(w, fmt.Errorf("não foi possível renovar a sessão"), http.StatusUnauthorized)
		return
	}
	token, err := signRuntimeAdminToken(runtimeDREClaims(access, time.Now()))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro interno ao gerar token"), http.StatusInternalServerError)
		return
	}
	app.writeJSON(w, http.StatusOK, jsonResponse{
		Error: false,
		Message: "Senha alterada com sucesso",
		Data: map[string]interface{}{"token": token, "expires_in": int(jwtExpiry.Seconds())},
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
		return AdminAccessScope{Username: claims.Username, Role: RoleDRE, DREID: claims.DREID, DRE: claims.DRE, DataScope: "selected", dreIDs: newDREIDs([]int{claims.DREID}), permissions: newPermissionSet([]string{PermissionCensusRead, PermissionAnalyticsRead, PermissionReportsRead})}, nil
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
	if err != nil || !validRuntimeAccess(access) || access.MustChangePassword {
		return AdminAccessScope{}, fmt.Errorf("sessão DRE revogada")
	}
	if claims.UserID > 0 && claims.Subject != "admin-user:"+strconv.Itoa(access.ID) {
		return AdminAccessScope{}, fmt.Errorf("subject incompatível com user_id")
	}

	// Validação de auth_version (versão de credencial/sessão):
	// Para tokens com auth_version explícita (> 0), mismatch com o banco revoga a sessão imediatamente.
	// Para tokens legados sem auth_version (claims.AuthVersion == 0), se a conta no banco já
	// tiver auth_version > 1 (indicando que a senha foi alterada após a introdução da migration),
	// o token legado é revogado imediatamente; caso contrário (auth_version == 1), é tolerado
	// durante a janela de transição.
	currentAuthVer := access.AuthVersion
	if currentAuthVer <= 0 {
		currentAuthVer = 1
	}
	if claims.AuthVersion > 0 {
		if claims.AuthVersion != currentAuthVer {
			return AdminAccessScope{}, fmt.Errorf("sessão DRE revogada por alteração de credencial")
		}
	} else {
		if currentAuthVer > 1 {
			return AdminAccessScope{}, fmt.Errorf("sessão DRE revogada por alteração de credencial")
		}
	}

	primaryDREID := access.DREID
	if primaryDREID == 0 && len(access.DREIDs) > 0 {
		primaryDREID = access.DREIDs[0]
	}
	return AdminAccessScope{
		UserID:      access.ID,
		Username:    access.Username,
		Role:        access.Role,
		DREID:       primaryDREID,
		DRE:         access.DRE,
		permissions: newPermissionSet(access.Permissions), DataScope: access.DataScope, dreIDs: newDREIDs(access.DREIDs),
	}, nil
}

func permissionsMap(items []string) map[string]bool {
	result := make(map[string]bool, len(items))
	for _, item := range items {
		if IsKnownPermission(item) {
			result[item] = true
		}
	}
	return result
}
func validRuntimeAccess(access *models.RuntimeAdminAccess) bool {
	if access == nil || !access.UserActive || access.DataScope != "all" && access.DataScope != "selected" {
		return false
	}
	if access.DataScope == "all" {
		return true
	}
	if access.Role == RoleDRE {
		return access.DREID > 0 && access.DREActive
	}
	// Selected IDs are FK-backed. Their active status is rechecked by the data
	// queries' canonical authorization path; at least one association is
	// mandatory here so an empty selected scope cannot authenticate.
	return len(access.DREIDs) > 0
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
			all := allPermissions()
			scope = AdminAccessScope{Username: claims.Username, Role: RoleAdmin, DRE: "", DataScope: "all", permissions: &all}
		case RoleDRE, "custom":
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
