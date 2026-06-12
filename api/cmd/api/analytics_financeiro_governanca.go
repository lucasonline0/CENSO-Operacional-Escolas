package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// =========================================================================
// Gestão Financeira e Governança — PRODEP
//
// Endpoint analítico que lê a tabela prodep_repasses (PR técnico 1) e devolve
// agregações para a futura aba "Gestão Financeira e Governança":
//   GET /v1/admin/analytics/financeiro-governanca/prodep
//
// Caminho escolhido sob o prefixo /v1/admin/analytics/* para seguir o padrão de
// todos os demais endpoints analíticos do projeto (CLAUDE.md: "New analytical
// endpoints live under /v1/admin/analytics/*"), mantendo a proteção JWT do grupo
// protected em main.go.
//
// Regras metodológicas (ver docs/dashboard/importacao-prodep.md):
//   * Somente registros usar_na_carga = true entram na análise.
//   * codigo_inep_prodep é a chave de identidade financeira (nunca a sede).
//   * matched_by_base_dige e prodep_only_validado entram no financeiro, mas
//     podem ter school_id NULL (não entram no Índice de Saúde Operacional).
// =========================================================================

// Valores válidos dos filtros enumerados (validação 400 em valor inválido).
var (
	prodepAnosValidos = map[int]bool{
		2023: true,
		2024: true,
		2025: true,
	}
	prodepCategoriasValidas = map[string]bool{
		"geral":       true,
		"alimentacao": true,
	}
	prodepMatchStatusValidos = map[string]bool{
		"matched_by_inep_schools": true,
		"matched_by_base_dige":    true,
		"prodep_only_validado":    true,
		"anexo_vinculado_sede":    true,
	}
	prodepStatusPCValidos = map[string]bool{
		"ok":                 true,
		"sem_recurso":        true,
		"nao_prestou_contas": true,
	}
)

// prodepFilters reúne os filtros opcionais do endpoint. Ano = 0 e strings vazias
// significam "filtro desativado". Os valores enumerados já vêm validados.
type prodepFilters struct {
	Ano                   int    // 0 = todos
	Categoria             string // '' = todas
	DRE                   string // '' = todas (case-insensitive sobre dre_prodep)
	Municipio             string // '' = todos (case-insensitive sobre municipio_resolvido)
	RI                    string // '' = todas (case-insensitive sobre ri_prodep)
	MatchStatus           string // '' = todos
	StatusPrestacaoContas string // '' = todos
}

// args devolve os argumentos posicionais na ordem esperada por prodepWhereSQL.
func (f prodepFilters) args() []any {
	return []any{
		f.Ano,
		f.Categoria,
		f.DRE,
		f.Municipio,
		f.RI,
		f.MatchStatus,
		f.StatusPrestacaoContas,
	}
}

// prodepWhereSQL é a cláusula WHERE comum a todas as agregações. Sempre restringe
// a usar_na_carga = true e aplica os filtros opcionais de forma parametrizada.
// $1=ano $2=categoria $3=dre $4=municipio $5=ri $6=match_status $7=status_pc.
const prodepWhereSQL = `
	WHERE usar_na_carga = true
	  AND ($1 = 0  OR ano = $1)
	  AND ($2 = '' OR categoria = $2)
	  AND ($3 = '' OR UPPER(TRIM(dre_prodep)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(municipio_resolvido)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(ri_prodep)) = UPPER(TRIM($5)))
	  AND ($6 = '' OR match_status = $6)
	  AND ($7 = '' OR COALESCE(status_prestacao_contas, '') = $7)
`

type ProdepResumo struct {
	TotalRecebido           float64 `json:"totalRecebido"`
	TotalReprogramado       float64 `json:"totalReprogramado"`
	PercentualReprogramado  float64 `json:"percentualReprogramado"`
	TotalRegistros          int64   `json:"totalRegistros"`
	TotalEscolas            int64   `json:"totalEscolas"`
	TotalEscolasComSchoolID int64   `json:"totalEscolasComSchoolId"`
	TotalEscolasSemSchoolID int64   `json:"totalEscolasSemSchoolId"`
}

type ProdepPorAno struct {
	Ano                    int     `json:"ano"`
	TotalRecebido          float64 `json:"totalRecebido"`
	TotalReprogramado      float64 `json:"totalReprogramado"`
	PercentualReprogramado float64 `json:"percentualReprogramado"`
	TotalEscolas           int64   `json:"totalEscolas"`
}

type ProdepPorCategoria struct {
	Categoria              string  `json:"categoria"`
	TotalRecebido          float64 `json:"totalRecebido"`
	TotalReprogramado      float64 `json:"totalReprogramado"`
	PercentualReprogramado float64 `json:"percentualReprogramado"`
	TotalEscolas           int64   `json:"totalEscolas"`
}

type ProdepPorStatusPC struct {
	Status            string  `json:"status"`
	TotalRegistros    int64   `json:"totalRegistros"`
	TotalEscolas      int64   `json:"totalEscolas"`
	TotalRecebido     float64 `json:"totalRecebido"`
	TotalReprogramado float64 `json:"totalReprogramado"`
}

type ProdepPorVinculo struct {
	MatchStatus       string  `json:"matchStatus"`
	TotalEscolas      int64   `json:"totalEscolas"`
	TotalRegistros    int64   `json:"totalRegistros"`
	TotalRecebido     float64 `json:"totalRecebido"`
	TotalReprogramado float64 `json:"totalReprogramado"`
}

type ProdepEscolaRanking struct {
	CodigoInepProdep       string  `json:"codigoInepProdep"`
	Escola                 string  `json:"escola"`
	DRE                    *string `json:"dre"`
	Municipio              *string `json:"municipio"`
	MatchStatus            string  `json:"matchStatus"`
	SchoolID               *int64  `json:"schoolId"`
	CodigoInepSede         *string `json:"codigoInepSede"`
	SchoolIDSede           *int64  `json:"schoolIdSede"`
	TotalRecebido          float64 `json:"totalRecebido"`
	TotalReprogramado      float64 `json:"totalReprogramado"`
	PercentualReprogramado float64 `json:"percentualReprogramado"`
}

type ProdepFiltrosDisponiveis struct {
	Anos                  []int    `json:"anos"`
	Categorias            []string `json:"categorias"`
	DREs                  []string `json:"dres"`
	Municipios            []string `json:"municipios"`
	RIs                   []string `json:"ris"`
	MatchStatus           []string `json:"matchStatus"`
	StatusPrestacaoContas []string `json:"statusPrestacaoContas"`
}

type ProdepMetadados struct {
	Fonte       string `json:"fonte"`
	UsarNaCarga bool   `json:"usarNaCarga"`
	Observacao  string `json:"observacao"`
}

type ProdepFinanceiroPayload struct {
	Resumo                    ProdepResumo             `json:"resumo"`
	PorAno                    []ProdepPorAno           `json:"porAno"`
	PorCategoria              []ProdepPorCategoria     `json:"porCategoria"`
	PorStatusPrestacaoContas  []ProdepPorStatusPC      `json:"porStatusPrestacaoContas"`
	PorVinculoCadastral       []ProdepPorVinculo       `json:"porVinculoCadastral"`
	TopEscolasPorRecebido     []ProdepEscolaRanking    `json:"topEscolasPorRecebido"`
	TopEscolasPorReprogramado []ProdepEscolaRanking    `json:"topEscolasPorReprogramado"`
	FiltrosDisponiveis        ProdepFiltrosDisponiveis `json:"filtrosDisponiveis"`
	Metadados                 ProdepMetadados          `json:"metadados"`
}

const prodepRankingLimit = 20

// pctReprogramado calcula totalReprogramado / totalRecebido * 100, devolvendo 0
// quando o denominador é zero. Arredonda a 2 casas para evitar drift de float.
func pctReprogramado(reprogramado, recebido float64) float64 {
	if recebido == 0 {
		return 0
	}
	return round2(reprogramado / recebido * 100)
}

// parseProdepFilters lê e valida os filtros opcionais da query string. Qualquer
// valor enumerado inválido produz erro (tratado como 400 pelo handler).
func parseProdepFilters(q map[string][]string) (prodepFilters, error) {
	get := func(key string) string {
		if vals, ok := q[key]; ok && len(vals) > 0 {
			return strings.TrimSpace(vals[0])
		}
		return ""
	}

	f := prodepFilters{
		DRE:       get("dre"),
		Municipio: get("municipio"),
		RI:        get("ri"),
	}

	if raw := get("ano"); raw != "" {
		ano, err := strconv.Atoi(raw)
		if err != nil || !prodepAnosValidos[ano] {
			return prodepFilters{}, fmt.Errorf("ano inválido: use 2023, 2024 ou 2025")
		}
		f.Ano = ano
	}

	if raw := get("categoria"); raw != "" {
		if !prodepCategoriasValidas[raw] {
			return prodepFilters{}, fmt.Errorf("categoria inválida: use geral ou alimentacao")
		}
		f.Categoria = raw
	}

	if raw := get("match_status"); raw != "" {
		if !prodepMatchStatusValidos[raw] {
			return prodepFilters{}, fmt.Errorf("match_status inválido: use matched_by_inep_schools, matched_by_base_dige, prodep_only_validado ou anexo_vinculado_sede")
		}
		f.MatchStatus = raw
	}

	if raw := get("status_prestacao_contas"); raw != "" {
		if !prodepStatusPCValidos[raw] {
			return prodepFilters{}, fmt.Errorf("status_prestacao_contas inválido: use ok, sem_recurso ou nao_prestou_contas")
		}
		f.StatusPrestacaoContas = raw
	}

	return f, nil
}

// AdminAnalyticsFinanceiroGovernancaProdep responde GET
// /v1/admin/analytics/financeiro-governanca/prodep.
//
// Filtros opcionais: ano, categoria, dre, municipio, ri, match_status,
// status_prestacao_contas. Sem dados importados o endpoint devolve estrutura
// válida com zeros/listas vazias (não quebra).
func (app *application) AdminAnalyticsFinanceiroGovernancaProdep(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	filters, err := parseProdepFilters(r.URL.Query())
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}
	args := filters.args()

	out := ProdepFinanceiroPayload{
		PorAno:                    []ProdepPorAno{},
		PorCategoria:              []ProdepPorCategoria{},
		PorStatusPrestacaoContas:  []ProdepPorStatusPC{},
		PorVinculoCadastral:       []ProdepPorVinculo{},
		TopEscolasPorRecebido:     []ProdepEscolaRanking{},
		TopEscolasPorReprogramado: []ProdepEscolaRanking{},
		Metadados: ProdepMetadados{
			Fonte:       "PRODEP",
			UsarNaCarga: true,
			Observacao:  "Registros matched_by_base_dige e prodep_only_validado entram na análise financeira, mas não entram automaticamente no Índice de Saúde Operacional.",
		},
	}

	// 1) Resumo global
	if err := db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(valor_recebido), 0)::float8,
			COALESCE(SUM(valor_reprogramado), 0)::float8,
			COUNT(*)::bigint,
			COUNT(DISTINCT codigo_inep_prodep)::bigint,
			COUNT(DISTINCT codigo_inep_prodep) FILTER (WHERE school_id IS NOT NULL)::bigint,
			COUNT(DISTINCT codigo_inep_prodep) FILTER (WHERE school_id IS NULL)::bigint
		FROM prodep_repasses`+prodepWhereSQL,
		args...,
	).Scan(
		&out.Resumo.TotalRecebido,
		&out.Resumo.TotalReprogramado,
		&out.Resumo.TotalRegistros,
		&out.Resumo.TotalEscolas,
		&out.Resumo.TotalEscolasComSchoolID,
		&out.Resumo.TotalEscolasSemSchoolID,
	); err != nil {
		app.errorJSON(w, fmt.Errorf("resumo prodep: %v", err), http.StatusInternalServerError)
		return
	}
	out.Resumo.TotalRecebido = round2(out.Resumo.TotalRecebido)
	out.Resumo.TotalReprogramado = round2(out.Resumo.TotalReprogramado)
	out.Resumo.PercentualReprogramado = pctReprogramado(out.Resumo.TotalReprogramado, out.Resumo.TotalRecebido)

	// 2) Por ano
	if rows, err := db.QueryContext(ctx, `
		SELECT
			ano,
			COALESCE(SUM(valor_recebido), 0)::float8,
			COALESCE(SUM(valor_reprogramado), 0)::float8,
			COUNT(DISTINCT codigo_inep_prodep)::bigint
		FROM prodep_repasses`+prodepWhereSQL+`
		GROUP BY ano
		ORDER BY ano`,
		args...,
	); err != nil {
		app.errorJSON(w, fmt.Errorf("por_ano prodep: %v", err), http.StatusInternalServerError)
		return
	} else {
		defer rows.Close()
		for rows.Next() {
			var item ProdepPorAno
			if err := rows.Scan(&item.Ano, &item.TotalRecebido, &item.TotalReprogramado, &item.TotalEscolas); err != nil {
				app.errorJSON(w, fmt.Errorf("scan por_ano prodep: %v", err), http.StatusInternalServerError)
				return
			}
			item.TotalRecebido = round2(item.TotalRecebido)
			item.TotalReprogramado = round2(item.TotalReprogramado)
			item.PercentualReprogramado = pctReprogramado(item.TotalReprogramado, item.TotalRecebido)
			out.PorAno = append(out.PorAno, item)
		}
		if err := rows.Err(); err != nil {
			app.errorJSON(w, fmt.Errorf("iterar por_ano prodep: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// 3) Por categoria
	if rows, err := db.QueryContext(ctx, `
		SELECT
			categoria,
			COALESCE(SUM(valor_recebido), 0)::float8,
			COALESCE(SUM(valor_reprogramado), 0)::float8,
			COUNT(DISTINCT codigo_inep_prodep)::bigint
		FROM prodep_repasses`+prodepWhereSQL+`
		GROUP BY categoria
		ORDER BY categoria`,
		args...,
	); err != nil {
		app.errorJSON(w, fmt.Errorf("por_categoria prodep: %v", err), http.StatusInternalServerError)
		return
	} else {
		defer rows.Close()
		for rows.Next() {
			var item ProdepPorCategoria
			if err := rows.Scan(&item.Categoria, &item.TotalRecebido, &item.TotalReprogramado, &item.TotalEscolas); err != nil {
				app.errorJSON(w, fmt.Errorf("scan por_categoria prodep: %v", err), http.StatusInternalServerError)
				return
			}
			item.TotalRecebido = round2(item.TotalRecebido)
			item.TotalReprogramado = round2(item.TotalReprogramado)
			item.PercentualReprogramado = pctReprogramado(item.TotalReprogramado, item.TotalRecebido)
			out.PorCategoria = append(out.PorCategoria, item)
		}
		if err := rows.Err(); err != nil {
			app.errorJSON(w, fmt.Errorf("iterar por_categoria prodep: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// 4) Por status de prestação de contas (NULL agrupado como "nao_informado")
	if rows, err := db.QueryContext(ctx, `
		SELECT
			COALESCE(status_prestacao_contas, 'nao_informado'),
			COUNT(*)::bigint,
			COUNT(DISTINCT codigo_inep_prodep)::bigint,
			COALESCE(SUM(valor_recebido), 0)::float8,
			COALESCE(SUM(valor_reprogramado), 0)::float8
		FROM prodep_repasses`+prodepWhereSQL+`
		GROUP BY COALESCE(status_prestacao_contas, 'nao_informado')
		ORDER BY COUNT(*) DESC`,
		args...,
	); err != nil {
		app.errorJSON(w, fmt.Errorf("por_status_pc prodep: %v", err), http.StatusInternalServerError)
		return
	} else {
		defer rows.Close()
		for rows.Next() {
			var item ProdepPorStatusPC
			if err := rows.Scan(&item.Status, &item.TotalRegistros, &item.TotalEscolas, &item.TotalRecebido, &item.TotalReprogramado); err != nil {
				app.errorJSON(w, fmt.Errorf("scan por_status_pc prodep: %v", err), http.StatusInternalServerError)
				return
			}
			item.TotalRecebido = round2(item.TotalRecebido)
			item.TotalReprogramado = round2(item.TotalReprogramado)
			out.PorStatusPrestacaoContas = append(out.PorStatusPrestacaoContas, item)
		}
		if err := rows.Err(); err != nil {
			app.errorJSON(w, fmt.Errorf("iterar por_status_pc prodep: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// 5) Por vínculo cadastral (match_status)
	if rows, err := db.QueryContext(ctx, `
		SELECT
			match_status,
			COUNT(DISTINCT codigo_inep_prodep)::bigint,
			COUNT(*)::bigint,
			COALESCE(SUM(valor_recebido), 0)::float8,
			COALESCE(SUM(valor_reprogramado), 0)::float8
		FROM prodep_repasses`+prodepWhereSQL+`
		GROUP BY match_status
		ORDER BY COUNT(*) DESC`,
		args...,
	); err != nil {
		app.errorJSON(w, fmt.Errorf("por_vinculo prodep: %v", err), http.StatusInternalServerError)
		return
	} else {
		defer rows.Close()
		for rows.Next() {
			var item ProdepPorVinculo
			if err := rows.Scan(&item.MatchStatus, &item.TotalEscolas, &item.TotalRegistros, &item.TotalRecebido, &item.TotalReprogramado); err != nil {
				app.errorJSON(w, fmt.Errorf("scan por_vinculo prodep: %v", err), http.StatusInternalServerError)
				return
			}
			item.TotalRecebido = round2(item.TotalRecebido)
			item.TotalReprogramado = round2(item.TotalReprogramado)
			out.PorVinculoCadastral = append(out.PorVinculoCadastral, item)
		}
		if err := rows.Err(); err != nil {
			app.errorJSON(w, fmt.Errorf("iterar por_vinculo prodep: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// 6) Rankings escola-a-escola (agregados por codigo_inep_prodep)
	if out.TopEscolasPorRecebido, err = app.queryProdepRanking(ctx, db, "total_recebido", args); err != nil {
		app.errorJSON(w, fmt.Errorf("top_recebido prodep: %v", err), http.StatusInternalServerError)
		return
	}
	if out.TopEscolasPorReprogramado, err = app.queryProdepRanking(ctx, db, "total_reprogramado", args); err != nil {
		app.errorJSON(w, fmt.Errorf("top_reprogramado prodep: %v", err), http.StatusInternalServerError)
		return
	}

	// 7) Filtros disponíveis (enumerados fixos + distintos do cadastro PRODEP)
	out.FiltrosDisponiveis = ProdepFiltrosDisponiveis{
		Anos:                  []int{2023, 2024, 2025},
		Categorias:            []string{"geral", "alimentacao"},
		DREs:                  []string{},
		Municipios:            []string{},
		RIs:                   []string{},
		MatchStatus:           []string{"matched_by_inep_schools", "matched_by_base_dige", "prodep_only_validado", "anexo_vinculado_sede"},
		StatusPrestacaoContas: []string{"ok", "sem_recurso", "nao_prestou_contas"},
	}
	if out.FiltrosDisponiveis.DREs, err = app.queryProdepDistinct(ctx, db, "dre_prodep"); err != nil {
		app.errorJSON(w, fmt.Errorf("filtros dres prodep: %v", err), http.StatusInternalServerError)
		return
	}
	if out.FiltrosDisponiveis.Municipios, err = app.queryProdepDistinct(ctx, db, "municipio_resolvido"); err != nil {
		app.errorJSON(w, fmt.Errorf("filtros municipios prodep: %v", err), http.StatusInternalServerError)
		return
	}
	if out.FiltrosDisponiveis.RIs, err = app.queryProdepDistinct(ctx, db, "ri_prodep"); err != nil {
		app.errorJSON(w, fmt.Errorf("filtros ris prodep: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// queryProdepRanking agrega os repasses por codigo_inep_prodep e devolve os 20
// maiores pela coluna de ordenação (orderCol ∈ {total_recebido, total_reprogramado}).
// orderCol é validado contra um allowlist; nunca vem de entrada do usuário.
func (app *application) queryProdepRanking(
	ctx context.Context,
	db *sql.DB,
	orderCol string,
	args []any,
) ([]ProdepEscolaRanking, error) {
	if orderCol != "total_recebido" && orderCol != "total_reprogramado" {
		return nil, fmt.Errorf("coluna de ordenação inválida: %s", orderCol)
	}

	query := fmt.Sprintf(`
		SELECT
			codigo_inep_prodep,
			COALESCE(MAX(escola_nome_prodep), ''),
			NULLIF(TRIM(MAX(dre_prodep)), ''),
			NULLIF(TRIM(MAX(municipio_resolvido)), ''),
			MAX(match_status),
			MAX(school_id),
			NULLIF(TRIM(MAX(codigo_inep_sede)), ''),
			MAX(school_id_sede),
			COALESCE(SUM(valor_recebido), 0)::float8 AS total_recebido,
			COALESCE(SUM(valor_reprogramado), 0)::float8 AS total_reprogramado
		FROM prodep_repasses`+prodepWhereSQL+`
		GROUP BY codigo_inep_prodep
		ORDER BY %s DESC, codigo_inep_prodep
		LIMIT %d`, orderCol, prodepRankingLimit)

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProdepEscolaRanking{}
	for rows.Next() {
		var (
			item           ProdepEscolaRanking
			dre, municipio sql.NullString
			codigoSede     sql.NullString
			schoolID       sql.NullInt64
			schoolIDSede   sql.NullInt64
		)
		if err := rows.Scan(
			&item.CodigoInepProdep,
			&item.Escola,
			&dre,
			&municipio,
			&item.MatchStatus,
			&schoolID,
			&codigoSede,
			&schoolIDSede,
			&item.TotalRecebido,
			&item.TotalReprogramado,
		); err != nil {
			return nil, err
		}
		if dre.Valid {
			item.DRE = &dre.String
		}
		if municipio.Valid {
			item.Municipio = &municipio.String
		}
		if codigoSede.Valid {
			item.CodigoInepSede = &codigoSede.String
		}
		if schoolID.Valid {
			item.SchoolID = &schoolID.Int64
		}
		if schoolIDSede.Valid {
			item.SchoolIDSede = &schoolIDSede.Int64
		}
		item.TotalRecebido = round2(item.TotalRecebido)
		item.TotalReprogramado = round2(item.TotalReprogramado)
		item.PercentualReprogramado = pctReprogramado(item.TotalReprogramado, item.TotalRecebido)
		out = append(out, item)
	}
	return out, rows.Err()
}

// queryProdepDistinct devolve os valores distintos não-vazios de uma coluna
// textual do cadastro PRODEP (apenas usar_na_carga = true). col é validado
// contra um allowlist; nunca vem de entrada do usuário.
func (app *application) queryProdepDistinct(
	ctx context.Context,
	db *sql.DB,
	col string,
) ([]string, error) {
	switch col {
	case "dre_prodep", "municipio_resolvido", "ri_prodep":
	default:
		return nil, fmt.Errorf("coluna inválida para distinct: %s", col)
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT TRIM(%s)
		FROM prodep_repasses
		WHERE usar_na_carga = true
		  AND %s IS NOT NULL
		  AND TRIM(%s) <> ''
		ORDER BY 1`, col, col, col)

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
