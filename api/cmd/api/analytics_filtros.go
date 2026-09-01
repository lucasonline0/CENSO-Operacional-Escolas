package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// AnalyticsFilters holds the parsed query-string filters common to all
// analytical endpoints. Default year = current year; string filters default
// to "" (= no filter applied in WhereSQL). DREID is authorization-only and is
// populated from the runtime scope, never from an untrusted query string.
type AnalyticsFilters struct {
	Year             int
	DREID            int
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
	SchoolID         int
	CodigoINEP       string
}

func parseAnalyticsFilters(r *http.Request) AnalyticsFilters {
	f := parseAnalyticsFiltersFromValues(r.URL.Query(), time.Now())
	if scope, ok := GetAdminAccessScope(r.Context()); ok && scope.Role == RoleDRE {
		f.DREID = scope.DREID
		f.DRE = strings.TrimSpace(scope.DRE)
	}
	return f
}

// parseAnalyticsFiltersFromValues is the testable core of parseAnalyticsFilters.
// Textual filters are trimmed of surrounding whitespace; absent filters become
// "". Year falls back to now.Year() when missing, blank, non-numeric, zero or
// negative.
func parseAnalyticsFiltersFromValues(q url.Values, now time.Time) AnalyticsFilters {
	f := AnalyticsFilters{
		Year:             now.Year(),
		DRE:              strings.TrimSpace(q.Get("dre")),
		Municipio:        strings.TrimSpace(q.Get("municipio")),
		Zona:             strings.TrimSpace(q.Get("zona")),
		RegiaoIntegracao: strings.TrimSpace(q.Get("regiao_integracao")),
		CodigoINEP:       strings.TrimSpace(q.Get("codigo_inep")),
	}
	if y, err := strconv.Atoi(strings.TrimSpace(q.Get("year"))); err == nil && y > 0 {
		f.Year = y
	}
	if schoolID, err := strconv.Atoi(strings.TrimSpace(q.Get("school_id"))); err == nil && schoolID > 0 {
		f.SchoolID = schoolID
	}
	return f
}

// WhereSQL returns a parameterized WHERE fragment (no table alias prefix).
// $1=year, $2=dre, $3=municipio, $4=zona, $5=regiao_integracao,
// $6=school_id and $7=codigo_inep. Empty strings and school_id zero disable
// the corresponding optional filters.
//
// A view ainda expõe `dre` textual por compatibilidade, mas em bancos pós-0020
// o filtro DRE re-resolve school_id -> schools.dre_id -> dres.id/nome. Assim o
// texto projetado pela view deixa de determinar escopo ou agregações.
func (f AnalyticsFilters) WhereSQL() string {
	drePredicate := analyticsDREPredicate("school_id", "dre", "$2")
	return `status = 'completed'
      AND year = $1
      AND census_id IS NOT NULL
      AND ($2 = '' OR ` + drePredicate + `)
      AND ($3 = '' OR UPPER(TRIM(municipio)) = UPPER(TRIM($3)))
      AND ($4 = '' OR UPPER(TRIM(zona)) = UPPER(TRIM($4)))
      AND ($5 = '' OR UPPER(TRIM(municipio)) IN (
        SELECT UPPER(TRIM(municipio))
        FROM reg_integracao
        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
      ))
      AND ($6 = 0 OR school_id = $6)
      AND ($7 = '' OR UPPER(TRIM(codigo_inep)) = UPPER(TRIM($7)))`
}

// Args returns the positional arguments that match WhereSQL in order.
func (f AnalyticsFilters) Args() []any {
	return []any{f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao, f.SchoolID, f.CodigoINEP}
}

// LegacyArgs preserves the original five-argument contract for bespoke
// analytics queries that do not use WhereSQL. Those endpoints intentionally
// remain outside the shared filter infrastructure.
func (f AnalyticsFilters) LegacyArgs() []any {
	return f.Args()[:5]
}

func queryStringSlice(app *application, ctx context.Context, query string, args ...any) ([]string, error) {
	rows, err := app.models.Schools.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]string, 0)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

type FiltrosEscolaItem struct {
	SchoolID   int     `json:"school_id"`
	CodigoINEP *string `json:"codigo_inep"`
	NomeEscola string  `json:"nome_escola"`
	Municipio  string  `json:"municipio"`
	DRE        string  `json:"dre"`
	Zona       *string `json:"zona"`
}

type FiltrosOpcoes struct {
	Anos              []int               `json:"anos"`
	RegioesIntegracao []string            `json:"regioes_integracao"`
	DREs              []string            `json:"dres"`
	Municipios        []string            `json:"municipios"`
	Zonas             []string            `json:"zonas"`
	Escolas           []FiltrosEscolaItem `json:"escolas"`
	CodigosINEP       []string            `json:"codigos_inep"`
}

// filtrosOpcoesSchoolsWhere returns a parameterized predicate over schools.
// except excludes the option currently being populated from its own cascade.
func filtrosOpcoesSchoolsWhere(f AnalyticsFilters, alias, except string) (string, []any) {
	return filtrosOpcoesSchoolsWhereWithAuthorization(f, alias, except, "")
}

// filtrosOpcoesSchoolsWhereWithAuthorization applies the mandatory territorial
// scope independently from the select cascade. Em schema canônico a autorização
// usa diretamente dre_id; o nome só permanece como fallback pré-0020.
func filtrosOpcoesSchoolsWhereWithAuthorization(f AnalyticsFilters, alias, except, authorizedDRE string) (string, []any) {
	conditions := make([]string, 0, 7)
	args := make([]any, 0, 7)
	add := func(key, condition string, arg any) {
		if key == except {
			return
		}
		args = append(args, arg)
		conditions = append(conditions, fmt.Sprintf(condition, len(args), len(args)))
	}

	if authorizedDRE = strings.TrimSpace(authorizedDRE); authorizedDRE != "" {
		if f.DREID > 0 {
			args = append(args, f.DREID)
			idPos := len(args)
			args = append(args, authorizedDRE)
			namePos := len(args)
			conditions = append(conditions, schoolDREAuthorizationPredicate(alias, "$"+strconv.Itoa(idPos), "$"+strconv.Itoa(namePos)))
		} else {
			args = append(args, authorizedDRE)
			conditions = append(conditions, schoolDRENamePredicate(alias, "$"+strconv.Itoa(len(args))))
		}
	} else if except != "dre" {
		args = append(args, f.DRE)
		pos := "$" + strconv.Itoa(len(args))
		conditions = append(conditions, "("+pos+" = '' OR "+schoolDRENamePredicate(alias, pos)+")")
	}
	add("municipio", "($%d = '' OR UPPER(TRIM("+alias+".municipio)) = UPPER(TRIM($%d)))", f.Municipio)
	add("zona", "($%d = '' OR UPPER(TRIM("+alias+".zona)) = UPPER(TRIM($%d)))", f.Zona)
	add("regiao_integracao", "($%d = '' OR UPPER(TRIM("+alias+".municipio)) IN (SELECT UPPER(TRIM(municipio)) FROM reg_integracao WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($%d))))", f.RegiaoIntegracao)
	add("school_id", "($%d = 0 OR "+alias+".id = $%d)", f.SchoolID)
	add("codigo_inep", "($%d = '' OR UPPER(TRIM("+alias+".codigo_inep)) = UPPER(TRIM($%d)))", f.CodigoINEP)

	return strings.Join(conditions, "\n\t  AND "), args
}

// filtrosOpcoesDREsQuery returns the master-DRE query for filter options.
// The DRE option itself is excluded from its cascade, while the remaining
// school filters retain the current cascade behavior. Without those filters,
// no schools lookup is made so active DREs without schools remain visible.
func filtrosOpcoesDREsQuery(f AnalyticsFilters, authorizedDRE string) (string, []any) {
	query := `
		SELECT TRIM(d.nome)
		FROM dres d
		WHERE d.ativa = TRUE
		  AND NULLIF(TRIM(d.nome), '') IS NOT NULL
	`
	args := make([]any, 0, 7)
	if authorizedDRE = strings.TrimSpace(authorizedDRE); authorizedDRE != "" {
		if f.DREID > 0 {
			args = append(args, f.DREID)
			query += "\t  AND d.id = $" + strconv.Itoa(len(args)) + "\n"
		} else {
			args = append(args, authorizedDRE)
			query += "\t  AND UPPER(TRIM(d.nome)) = UPPER(TRIM($" + strconv.Itoa(len(args)) + "))\n"
		}
	}

	if f.Municipio != "" || f.Zona != "" || f.RegiaoIntegracao != "" || f.SchoolID != 0 || f.CodigoINEP != "" {
		schoolsWhere, schoolsArgs := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "dre", authorizedDRE)
		offset := len(args)
		args = append(args, schoolsArgs...)
		for i := len(schoolsArgs); i > 0; i-- {
			schoolsWhere = strings.ReplaceAll(schoolsWhere, "$"+strconv.Itoa(i), "$"+strconv.Itoa(offset+i))
		}
		query += `	  AND EXISTS (
			SELECT 1
			FROM schools s
			WHERE ` + schoolsWhere + `
			  AND ` + schoolDRENamePredicate("s", "d.nome") + `
		)
`
	}

	query += "\t\tORDER BY UPPER(TRIM(d.nome)), TRIM(d.nome)\n"
	return query, args
}

// AdminAnalyticsFiltrosOpcoes retorna as listas para popular os selects
// dos filtros globais do dashboard. Aceita os mesmos query params dos filtros
// analíticos e aplica cascata: cada lista é filtrada pelos demais filtros ativos.
func (app *application) AdminAnalyticsFiltrosOpcoes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	f := parseAnalyticsFilters(r)
	authorizedDRE := ""
	if scope, ok := GetAdminAccessScope(ctx); ok && scope.Role == RoleDRE {
		authorizedDRE = strings.TrimSpace(scope.DRE)
	}

	// Anos do seletor: censos concluídos UNIÃO anos presentes em
	// ideb_resultados (ex.: IDEB 2023 e IDEB 2025). A chave temporal do IDEB é
	// a mesma série ano × inep × etapa, portanto o ano do filtro global precisa
	// refletir os anos disponíveis na base IDEB também. O escopo DRE é aplicado
	// às duas fontes via schools (predicados reutilizam os mesmos $1/$2).
	anosQuery := `
		SELECT DISTINCT a.ano::text FROM (
			SELECT cr.year AS ano
			FROM census_responses cr
			JOIN schools s ON s.id = cr.school_id
			WHERE cr.status = 'completed'
	`
	var anosArgs []any
	if authorizedDRE != "" {
		if f.DREID > 0 {
			anosQuery += ` AND ` + schoolDREAuthorizationPredicate("s", "$1", "$2")
			anosArgs = append(anosArgs, f.DREID, authorizedDRE)
		} else {
			anosQuery += ` AND ` + schoolDRENamePredicate("s", "$1")
			anosArgs = append(anosArgs, authorizedDRE)
		}
	}
	anosQuery += `
			UNION ALL
			SELECT ir.ano AS ano
			FROM ideb_resultados ir
			JOIN schools s ON s.id = ir.school_id
	`
	if authorizedDRE != "" {
		if f.DREID > 0 {
			anosQuery += ` WHERE ` + schoolDREAuthorizationPredicate("s", "$1", "$2")
		} else {
			anosQuery += ` WHERE ` + schoolDRENamePredicate("s", "$1")
		}
	}
	anosQuery += `
		) a
		ORDER BY a.ano::text DESC
	`
	anos, err := queryStringSlice(app, ctx, anosQuery, anosArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("anos: %w", err), http.StatusInternalServerError)
		return
	}
	anosInt := make([]int, 0, len(anos))
	for _, a := range anos {
		var n int
		if _, err := fmt.Sscanf(a, "%d", &n); err == nil {
			anosInt = append(anosInt, n)
		}
	}

	// Regiões: filtradas por dre, municipio, zona (não pela própria regiao)
	regioesWhere, regioesArgs := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "regiao_integracao", authorizedDRE)
	regioes, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT r.regiao_de_integracao
		FROM reg_integracao r
		JOIN schools s ON UPPER(TRIM(s.municipio)) = UPPER(TRIM(r.municipio))
		WHERE `+regioesWhere+`
		ORDER BY 1
	`, regioesArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("regioes_integracao: %w", err), http.StatusInternalServerError)
		return
	}

	// DREs: derivadas da entidade mestre; escolas só participam da cascata pelos IDs.
	dresQuery, dresArgs := filtrosOpcoesDREsQuery(f, authorizedDRE)
	dres, err := queryStringSlice(app, ctx, dresQuery, dresArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dres: %w", err), http.StatusInternalServerError)
		return
	}

	// Municípios: filtrados por dre, zona, regiao (não pelo próprio municipio)
	municipiosWhere, municipiosArgs := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "municipio", authorizedDRE)
	municipios, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio
		FROM schools s
		WHERE `+municipiosWhere+`
		ORDER BY 1
	`, municipiosArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("municipios: %w", err), http.StatusInternalServerError)
		return
	}

	// Zonas: filtradas por dre, municipio, regiao (não pela própria zona)
	zonasWhere, zonasArgs := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "zona", authorizedDRE)
	zonas, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT s.zona
		FROM schools s
		WHERE s.zona IS NOT NULL AND TRIM(s.zona) <> ''
		  AND `+zonasWhere+`
		ORDER BY 1
	`, zonasArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("zonas: %w", err), http.StatusInternalServerError)
		return
	}

	escolasWhere, escolasArgs := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "school_id", authorizedDRE)
	dreNameExpr := schoolDRENameExpr("s")
	rows, err := app.models.Schools.DB.QueryContext(ctx, `
		SELECT DISTINCT
			s.id,
			s.codigo_inep,
			COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome') AS nome_escola,
			COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado') AS municipio,
			`+dreNameExpr+` AS dre,
			s.zona
		FROM schools s
		WHERE `+escolasWhere+`
		ORDER BY nome_escola
	`, escolasArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("escolas: %w", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	escolas := make([]FiltrosEscolaItem, 0)
	for rows.Next() {
		var item FiltrosEscolaItem
		var inep, zona *string
		if err := rows.Scan(&item.SchoolID, &inep, &item.NomeEscola, &item.Municipio, &item.DRE, &zona); err != nil {
			app.errorJSON(w, fmt.Errorf("ler escola: %w", err), http.StatusInternalServerError)
			return
		}
		if inep != nil && *inep != "" {
			item.CodigoINEP = inep
		}
		if zona != nil && *zona != "" {
			item.Zona = zona
		}
		escolas = append(escolas, item)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar escolas: %w", err), http.StatusInternalServerError)
		return
	}

	codigosWhere, codigosArgs := filtrosOpcoesSchoolsWhereWithAuthorization(f, "s", "codigo_inep", authorizedDRE)
	codigosINEP, err := queryStringSlice(app, ctx, `
		SELECT DISTINCT TRIM(s.codigo_inep)
		FROM schools s
		WHERE s.codigo_inep IS NOT NULL AND TRIM(s.codigo_inep) <> ''
		  AND `+codigosWhere+`
		ORDER BY 1
	`, codigosArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("codigos_inep: %w", err), http.StatusInternalServerError)
		return
	}

	out := FiltrosOpcoes{
		Anos:              anosInt,
		RegioesIntegracao: regioes,
		DREs:              dres,
		Municipios:        municipios,
		Zonas:             zonas,
		Escolas:           escolas,
		CodigosINEP:       codigosINEP,
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// parseEscolasPageSize valida o parâmetro page_size para endpoints /escolas.
// Valores permitidos: 10, 50, 100, 1000. Default: 10.
func parseEscolasPageSize(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || (n != 10 && n != 50 && n != 100 && n != 1000) {
		return 10
	}
	return n
}

// parseEscolasPage valida o parâmetro page (>=1). Default: 1.
func parseEscolasPage(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 1 {
		return 1
	}
	return n
}

// parseEscolasDirection valida o parâmetro direction para endpoints /escolas.
// Valores aceitos: "asc" e "desc". Default: "asc".
func parseEscolasDirection(raw string) string {
	if strings.TrimSpace(raw) == "desc" {
		return "desc"
	}
	return "asc"
}
