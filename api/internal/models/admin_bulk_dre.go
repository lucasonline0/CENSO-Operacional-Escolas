package models

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"golang.org/x/crypto/bcrypt"
	"strings"
	"unicode"
)

type DREBootstrapItem struct {
	DREID    int    `json:"dre_id"`
	DRE      string `json:"dre"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Status   string `json:"status"`
	Message  string `json:"message,omitempty"`
}
type DREBootstrapPreview struct {
	Active      int                `json:"active"`
	Provisioned int                `json:"provisioned"`
	Pending     int                `json:"pending"`
	IgnoredE2E  int                `json:"ignored_e2e"`
	Errors      int                `json:"errors"`
	Items       []DREBootstrapItem `json:"items"`
}
type DREBootstrapCredential struct {
	DRE               string `json:"dre"`
	Email             string `json:"email"`
	Username          string `json:"username"`
	TemporaryPassword string `json:"temporary_password"`
}

func bootstrapSlug(name string) string {
	replacer := strings.NewReplacer("á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a", "é", "e", "ê", "e", "í", "i", "ó", "o", "ô", "o", "õ", "o", "ö", "o", "ú", "u", "ü", "u", "ç", "c")
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.TrimLeft(strings.TrimPrefix(name, "dre"), " _-")
	name = replacer.Replace(name)
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}
func bootstrapPassword() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func isE2EDRE(name, sigla string) bool {
	return strings.HasPrefix(strings.ToUpper(strings.TrimSpace(name)), "DRE-E2E-") || strings.EqualFold(strings.TrimSpace(sigla), "E2E")
}

func bootstrapPreview(ctx context.Context, q interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}) (DREBootstrapPreview, error) {
	var out DREBootstrapPreview
	out.Items = []DREBootstrapItem{}
	rows, err := q.QueryContext(ctx, `SELECT d.id,d.nome,COALESCE(d.sigla,''),COALESCE(d.email,''),EXISTS(SELECT 1 FROM admin_users u WHERE u.dre_id=d.id AND u.role='dre'),EXISTS(SELECT 1 FROM admin_users u WHERE LOWER(BTRIM(u.username))=LOWER(BTRIM('dre.' || regexp_replace(translate(regexp_replace(lower(d.nome),'^dre[ _-]*','','i'),'áàâãäéêíóôõöúüç','aaaaaeeiooooouuc'),'[^a-z0-9]','','g')))) FROM dres d WHERE d.ativa ORDER BY d.nome`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		var name, sigla, email string
		var existing, collision bool
		if err = rows.Scan(&id, &name, &sigla, &email, &existing, &collision); err != nil {
			return out, err
		}
		out.Active++
		item := DREBootstrapItem{DREID: id, DRE: name, Email: email, Username: "dre." + bootstrapSlug(name)}
		switch {
		case isE2EDRE(name, sigla):
			item.Status = "ignored_e2e"
			item.Message = "Ignorada — fixture de teste"
			out.IgnoredE2E++
		case existing:
			item.Status = "provisioned"
			item.Message = "Já provisionada"
			out.Provisioned++
		case strings.TrimSpace(email) == "":
			item.Status = "error"
			item.Message = "E-mail obrigatório"
			out.Errors++
		case collision:
			item.Status = "error"
			item.Message = "Nome de usuário já existe"
			out.Errors++
		default:
			if _, e := NormalizeAdminEmail(email); e != nil {
				item.Status = "error"
				item.Message = "E-mail inválido"
				out.Errors++
			} else {
				item.Status = "pending"
				out.Pending++
			}
		}
		out.Items = append(out.Items, item)
	}
	return out, rows.Err()
}
func (m *AdminUserModel) PreviewDREBootstrap(ctx context.Context) (DREBootstrapPreview, error) {
	return bootstrapPreview(ctx, m.DB)
}

func (m *AdminUserModel) BootstrapDREAccounts(ctx context.Context) (DREBootstrapPreview, []DREBootstrapCredential, error) {
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return DREBootstrapPreview{}, nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('bulk_dre_bootstrap'))`); err != nil {
		return DREBootstrapPreview{}, nil, err
	}
	preview, err := bootstrapPreview(ctx, tx)
	if err != nil {
		return preview, nil, err
	}
	if preview.Errors > 0 {
		return preview, nil, errors.New("corrija os e-mails ou colisões antes de executar")
	}
	creds := []DREBootstrapCredential{}
	for _, item := range preview.Items {
		if item.Status != "pending" {
			continue
		}
		password, e := bootstrapPassword()
		if e != nil {
			return preview, nil, e
		}
		hash, e := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if e != nil {
			return preview, nil, e
		}
		var uid int
		e = tx.QueryRowContext(ctx, `INSERT INTO admin_users(username,email,password_hash,role,dre_id,active,auth_version,must_change_password,data_scope,created_at,updated_at) VALUES($1,$2,$3,'dre',$4,true,1,true,'selected',NOW(),NOW()) RETURNING id`, item.Username, strings.ToLower(strings.TrimSpace(item.Email)), string(hash), item.DREID).Scan(&uid)
		if e != nil {
			return preview, nil, fmt.Errorf("%s: %w", item.DRE, e)
		}
		for _, p := range []string{"census.read", "analytics.read", "reports.read"} {
			if _, e = tx.ExecContext(ctx, `INSERT INTO admin_user_permissions(user_id,permission) VALUES($1,$2)`, uid, p); e != nil {
				return preview, nil, e
			}
		}
		if _, e = tx.ExecContext(ctx, `INSERT INTO admin_user_dres(user_id,dre_id) VALUES($1,$2)`, uid, item.DREID); e != nil {
			return preview, nil, e
		}
		creds = append(creds, DREBootstrapCredential{DRE: item.DRE, Email: item.Email, Username: item.Username, TemporaryPassword: password})
	}
	if err = tx.Commit(); err != nil {
		return preview, nil, err
	}
	preview.Provisioned += len(creds)
	preview.Pending = 0
	return preview, creds, nil
}
