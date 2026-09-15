package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"censo-api/internal/models"

	"github.com/go-chi/chi/v5"
)

const maxManagedPasswordBody = 1 << 20

type passwordVaultResponseRecorder struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func newPasswordVaultResponseRecorder() *passwordVaultResponseRecorder {
	return &passwordVaultResponseRecorder{header: make(http.Header), status: http.StatusOK}
}

func (r *passwordVaultResponseRecorder) Header() http.Header { return r.header }

func (r *passwordVaultResponseRecorder) WriteHeader(status int) {
	if r.status != http.StatusOK || r.body.Len() > 0 {
		return
	}
	r.status = status
}

func (r *passwordVaultResponseRecorder) Write(p []byte) (int, error) {
	return r.body.Write(p)
}

func (r *passwordVaultResponseRecorder) flushTo(w http.ResponseWriter) {
	for key, values := range r.header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(r.status)
	_, _ = w.Write(r.body.Bytes())
}

// persistManagedPassword captura a senha enviada aos endpoints de criação/reset
// e, depois que a mutação principal termina com sucesso, grava uma segunda cópia
// cifrada pelo cofre. O bcrypt continua sendo a única fonte de autenticação.
//
// Em ambientes sem ADMIN_PASSWORD_VAULT_KEY o fluxo legado continua funcionando;
// o endpoint de revelação permanece indisponível. Em produção a variável é
// configurada como secret separado do banco.
func (app *application) persistManagedPassword(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !models.PasswordVaultConfigured() {
			next.ServeHTTP(w, r)
			return
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, maxManagedPasswordBody+1))
		if err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao ler credenciais"), http.StatusBadRequest)
			return
		}
		if len(body) > maxManagedPasswordBody {
			app.errorJSON(w, fmt.Errorf("payload de credenciais excede o limite permitido"), http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))

		var payload struct {
			Password    string `json:"password"`
			NewPassword string `json:"new_password"`
		}
		_ = json.Unmarshal(body, &payload)
		plaintext := payload.Password
		if plaintext == "" {
			plaintext = payload.NewPassword
		}
		// O reset já normaliza espaços antes de gerar o bcrypt; na criação a
		// senha é usada exatamente como enviada, então preservamos o mesmo valor.
		if chi.URLParam(r, "id") != "" {
			plaintext = strings.TrimSpace(plaintext)
		}

		recorder := newPasswordVaultResponseRecorder()
		next.ServeHTTP(recorder, r)
		if recorder.status < 200 || recorder.status >= 300 || plaintext == "" {
			recorder.flushTo(w)
			return
		}

		userID := 0
		if chi.URLParam(r, "id") != "" {
			userID, _ = strconv.Atoi(chi.URLParam(r, "id"))
		} else {
			var response struct {
				Data struct {
					ID int `json:"id"`
				} `json:"data"`
			}
			if err := json.Unmarshal(recorder.body.Bytes(), &response); err == nil {
				userID = response.Data.ID
			}
		}
		if userID <= 0 {
			app.logger.Printf("password-vault: mutação concluída, mas não foi possível resolver user id path=%s", r.URL.Path)
			app.errorJSON(w, fmt.Errorf("senha atualizada, mas o cofre não pôde registrar a credencial; redefina a senha novamente"), http.StatusInternalServerError)
			return
		}

		if err := app.models.AdminUsers.StorePasswordForReveal(r.Context(), userID, plaintext); err != nil {
			app.logger.Printf("password-vault: falha ao persistir cópia cifrada user_id=%d: %v", userID, err)
			app.errorJSON(w, fmt.Errorf("senha atualizada, mas o cofre não pôde registrar a credencial; redefina a senha novamente"), http.StatusInternalServerError)
			return
		}

		recorder.flushTo(w)
	})
}

type adminCredentialRevealResponse struct {
	ID        int    `json:"id"`
	Username  string `json:"username"`
	DRE       string `json:"dre"`
	Available bool   `json:"available"`
	Password  string `json:"password,omitempty"`
}

// AdminRevealUserCredentials descriptografa a senha somente sob demanda e
// exclusivamente para role=admin. A listagem normal de usuários nunca inclui
// password_ciphertext nem a senha em texto.
func (app *application) AdminRevealUserCredentials(w http.ResponseWriter, r *http.Request) {
	scope, ok := GetAdminAccessScope(r.Context())
	if !ok || scope.Role != RoleAdmin {
		app.errorJSON(w, fmt.Errorf("acesso restrito para administradores"), http.StatusForbidden)
		return
	}

	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	username := strings.TrimSpace(r.URL.Query().Get("username"))
	if username == "" {
		app.errorJSON(w, fmt.Errorf("username é obrigatório"), http.StatusBadRequest)
		return
	}
	if !models.PasswordVaultConfigured() {
		app.errorJSON(w, fmt.Errorf("cofre de senhas não configurado"), http.StatusServiceUnavailable)
		return
	}

	user, password, available, err := app.models.AdminUsers.RevealPasswordByUsername(r.Context(), username)
	if err != nil {
		if err == models.ErrUserNotFound {
			app.errorJSON(w, fmt.Errorf("usuário não encontrado"), http.StatusNotFound)
			return
		}
		app.logger.Printf("password-vault: erro ao consultar credencial username=%q: %v", username, err)
		app.errorJSON(w, fmt.Errorf("não foi possível consultar a credencial"), http.StatusInternalServerError)
		return
	}
	if !strings.EqualFold(strings.TrimSpace(user.Role), RoleDRE) {
		app.errorJSON(w, fmt.Errorf("credencial não pertence a um usuário DRE"), http.StatusBadRequest)
		return
	}

	response := adminCredentialRevealResponse{
		ID:        user.ID,
		Username:  user.Username,
		DRE:       user.DRE,
		Available: available,
	}
	if !available {
		app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: response})
		return
	}

	actorIP := clientIP(r)
	if err := app.models.AdminUsers.LogCredentialReveal(r.Context(), scope.Username, actorIP, user); err != nil {
		app.logger.Printf("password-vault: falha de auditoria actor=%q target_user_id=%d: %v", scope.Username, user.ID, err)
		app.errorJSON(w, fmt.Errorf("não foi possível registrar a auditoria da visualização"), http.StatusInternalServerError)
		return
	}
	app.logger.Printf("AUDIT credential_reveal actor=%q target_user_id=%d target_username=%q ip=%q", scope.Username, user.ID, user.Username, actorIP)

	response.Password = password
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: response})
}
