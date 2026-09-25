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

type bootstrapQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func bootstrapPreview(ctx context.Context, q bootstrapQueryer) (DREBootstrapPreview, error) {
	out := DREBootstrapPreview{Items: []DREBootstrapItem{}}
	rows, err := q.QueryContext(ctx, `SELECT d.id,d.nome,COALESCE(d.sigla,''),COALESCE(d.email,''),EXISTS(SELECT 1 FROM admin_users u WHERE u.dre_id=d.id AND u.role='dre') FROM dres d WHERE d.ativa ORDER BY d.nome`)
	if err != nil {
		return out, err
	}
	type candidate struct {
		id                 int
		name, sigla, email string
		existing           bool
	}
	candidates := []candidate{}
	for rows.Next() {
		var c candidate
		if err = rows.Scan(&c.id, &c.name, &c.sigla, &c.email, &c.existing); err != nil {
			rows.Close()
			return out, err
		}
		candidates = append(candidates, c)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return out, err
	}
	if err = rows.Close(); err != nil {
		return out, err
	}
	for _, c := range candidates {
		out.Active++
		item := DREBootstrapItem{DREID: c.id, DRE: c.name, Email: c.email, Username: "dre." + bootstrapSlug(c.name)}
		switch {
		case isE2EDRE(c.name, c.sigla):
			item.Status = "ignored_e2e"
			item.Message = "Ignorada — fixture E2E"
			out.IgnoredE2E++
		case c.existing:
			item.Status = "provisioned"
			item.Message = "Já provisionada"
			out.Provisioned++
		default:
			email := strings.TrimSpace(c.email)
			if email != "" {
				if _, e := NormalizeAdminEmail(email); e != nil {
					item.Status = "invalid_email"
					item.Message = "E-mail inválido"
					out.Errors++
				} else if conflict, queryErr := adminIdentityConflict(ctx, q, item.Username, email); queryErr != nil {
					return out, queryErr
				} else if conflict != nil {
					item.Status = "error"
					switch conflict {
					case ErrUsernameExists:
						item.Message = "Username em conflito"
					case ErrEmailExists:
						item.Message = "E-mail em conflito"
					default:
						item.Message = "Identidade em conflito"
					}
					out.Errors++
				} else {
					item.Status = "pending"
					item.Message = "Pronta"
					out.Pending++
				}
			} else if conflict, queryErr := adminIdentityConflict(ctx, q, item.Username, ""); queryErr != nil {
				return out, queryErr
			} else if conflict != nil {
				item.Status = "error"
				switch conflict {
				case ErrUsernameExists:
					item.Message = "Username em conflito"
				case ErrEmailExists:
					item.Message = "E-mail em conflito"
				default:
					item.Message = "Identidade em conflito"
				}
				out.Errors++
			} else {
				item.Status = "pending"
				item.Message = "Pronta"
				out.Pending++
			}
		}
		out.Items = append(out.Items, item)
	}
	emailCounts, usernameCounts := map[string]int{}, map[string]int{}
	for _, item := range out.Items {
		if item.Status == "pending" {
			emailCounts[strings.ToLower(strings.TrimSpace(item.Email))]++
			usernameCounts[strings.ToLower(item.Username)]++
		}
	}
	for i := range out.Items {
		item := &out.Items[i]
		if item.Status != "pending" {
			continue
		}
		if usernameCounts[strings.ToLower(item.Username)] > 1 {
			item.Status = "error"
			item.Message = "Username em conflito"
			out.Pending--
			out.Errors++
		} else if strings.TrimSpace(item.Email) != "" && emailCounts[strings.ToLower(strings.TrimSpace(item.Email))] > 1 {
			item.Status = "error"
			item.Message = "E-mail em conflito"
			out.Pending--
			out.Errors++
		}
	}
	return out, nil
}

func (m *AdminUserModel) PreviewDREBootstrap(ctx context.Context) (DREBootstrapPreview, error) {
	return bootstrapPreview(ctx, m.DB)
}

func (m *AdminUserModel) BootstrapDREAccounts(ctx context.Context, emailOverrides map[int]string) (DREBootstrapPreview, []DREBootstrapCredential, error) {
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return DREBootstrapPreview{}, nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('bulk_dre_bootstrap'))`); err != nil {
		return DREBootstrapPreview{}, nil, err
	}
	for dreID, rawEmail := range emailOverrides {
		email := strings.TrimSpace(rawEmail)
		if email != "" {
			var normalizeErr error
			email, normalizeErr = NormalizeAdminEmail(email)
			if normalizeErr != nil {
				return DREBootstrapPreview{}, nil, normalizeErr
			}
		}
		var name, sigla string
		var active, provisioned bool
		if err = tx.QueryRowContext(ctx, `SELECT d.nome,COALESCE(d.sigla,''),d.ativa,EXISTS(SELECT 1 FROM admin_users u WHERE u.dre_id=d.id AND u.role='dre') FROM dres d WHERE d.id=$1 FOR UPDATE`, dreID).Scan(&name, &sigla, &active, &provisioned); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return DREBootstrapPreview{}, nil, ErrInvalidDRE
			}
			return DREBootstrapPreview{}, nil, err
		}
		if !active || provisioned || isE2EDRE(name, sigla) {
			return DREBootstrapPreview{}, nil, ErrInvalidDRE
		}
		if _, err = tx.ExecContext(ctx, `UPDATE dres SET email=NULLIF($2,''),updated_at=NOW() WHERE id=$1`, dreID, email); err != nil {
			return DREBootstrapPreview{}, nil, err
		}
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
		e = tx.QueryRowContext(ctx, `INSERT INTO admin_users(username,email,password_hash,role,dre_id,active,auth_version,must_change_password,data_scope,created_at,updated_at) VALUES($1,NULLIF($2,''),$3,'dre',$4,true,1,true,'selected',NOW(),NOW()) RETURNING id`, item.Username, strings.ToLower(strings.TrimSpace(item.Email)), string(hash), item.DREID).Scan(&uid)
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
