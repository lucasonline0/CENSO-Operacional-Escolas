package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// PessoalEstrutura é o payload de GET /v1/admin/analytics/pessoal-gestao/estrutura.
type PessoalEstrutura struct {
	ComposicaoGestao          []CategoricStat `json:"composicao_gestao"`
	TotalCoordenadoresPedagog float64         `json:"total_coordenadores_pedagogicos"`
}

// PessoalCoordenacao é o payload de GET /v1/admin/analytics/pessoal-gestao/coordenacao.
type PessoalCoordenacao struct {
	PorArea       []CategoricStat `json:"por_area"`
	CoberturaMedia float64         `json:"cobertura_media"`
}

// =========================================================================
// Pessoal e Gestão Escolar
// =========================================================================

// AdminAnalyticsPessoalEstrutura retorna indicadores sobre a composição da gestão escolar.
// Baseado na view vw_censo_direcao_escolar (Migration 0003).
// Suporta filtros: ?year=&dre=&municipio=&zona=&porte_escola=
func (app *application) AdminAnalyticsPessoalEstrutura(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	// Captura de filtros da Query String
	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	// Ano corrente como fallback
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := PessoalEstrutura{
		ComposicaoGestao: []CategoricStat{},
	}

	// SQL base com filtros parametrizados
	// Nota: Unimos com vw_censo_enriquecida para suportar o filtro de porte_escola
	const baseQuery = `
		FROM vw_censo_direcao_escolar v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) Composição da Gestão (% de Sim por cargo)
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT v.school_id, v.cargo, v.possui, v.ordem
			%s
		),
		tot_escolas AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base
		)
		SELECT 
			cargo, 
			COUNT(DISTINCT school_id) FILTER (WHERE possui) AS escolas,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE possui) / NULLIF(tot_escolas.n, 0), 1), 0)::float8 AS percentual
		FROM base CROSS JOIN tot_escolas
		GROUP BY cargo, ordem, tot_escolas.n
		ORDER BY ordem
	`, baseQuery), year, dre, municipio, zona, porte)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("composicao_gestao: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var s CategoricStat
		if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan composicao_gestao: %v", err), http.StatusInternalServerError)
			return
		}
		out.ComposicaoGestao = append(out.ComposicaoGestao, s)
	}

	// 2) Total de Coordenadores Pedagógicos (Soma quantitativa)
	// Como a view 003 é format Long, buscamos o quantitativo diretamente no JSON via vw_censo_base
	err = db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(
				CASE WHEN cr.data->>'qtd_coord_pedagogico' ~ '^-?[0-9]+(\.[0-9]+)?$'
					 THEN (cr.data->>'qtd_coord_pedagogico')::numeric
					 ELSE 0
				END
			), 0)::float8
		FROM vw_censo_base b
		JOIN census_responses cr ON cr.id = b.census_id
		JOIN vw_censo_enriquecida e ON e.census_id = b.census_id
		WHERE b.status = 'completed'
		  AND b.year = $1
		  AND ($2 = '' OR b.dre = $2)
		  AND ($3 = '' OR b.municipio = $3)
		  AND ($4 = '' OR b.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`, year, dre, municipio, zona, porte).Scan(&out.TotalCoordenadoresPedagog)

	if err != nil {
		app.errorJSON(w, fmt.Errorf("total_coordenadores: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsPessoalCoordenacao retorna indicadores sobre coordenadores por área.
// Baseado na view vw_censo_coordenacao_area (Migration 0004).
func (app *application) AdminAnalyticsPessoalCoordenacao(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	// Captura de filtros da Query String
	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	// Ano corrente como fallback
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := PessoalCoordenacao{
		PorArea: []CategoricStat{},
	}

	// SQL base com filtros parametrizados
	const baseQuery = `
		FROM vw_censo_coordenacao_area v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) Distribuição por Área (% de Sim por área)
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT v.school_id, v.area, v.possui, v.ordem
			%s
		),
		tot_escolas AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base
		)
		SELECT 
			area, 
			COUNT(DISTINCT school_id) FILTER (WHERE possui) AS escolas,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE possui) / NULLIF(tot_escolas.n, 0), 1), 0)::float8 AS percentual
		FROM base CROSS JOIN tot_escolas
		GROUP BY area, ordem, tot_escolas.n
		ORDER BY ordem
	`, baseQuery), year, dre, municipio, zona, porte)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("por_area: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var s CategoricStat
		if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan por_area: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorArea = append(out.PorArea, s)
	}

	// 2) Cobertura Média (Média de áreas cobertas por escola)
	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT v.school_id, COUNT(*) FILTER (WHERE possui) AS qtd_areas
			%s
			GROUP BY v.school_id
		)
		SELECT COALESCE(ROUND(AVG(qtd_areas), 2), 0)::float8
		FROM base
	`, baseQuery), year, dre, municipio, zona, porte).Scan(&out.CoberturaMedia)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("cobertura_media: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// =========================================================================
// Pessoal — Quadro de Pessoal
// =========================================================================

type QuadroPessoalMedias struct {
	Efetivos        float64 `json:"efetivos"`
	Temporarios     float64 `json:"temporarios"`
	Administrativos float64 `json:"administrativos"`
	Readaptados     float64 `json:"readaptados"`
}

type QuadroPessoalDRE struct {
	DRE              string  `json:"dre"`
	TotalEfetivos    float64 `json:"total_efetivos"`
	TotalTemporarios float64 `json:"total_temporarios"`
	MediaProfessores float64 `json:"media_total_professores"`
}

type QuadroPessoal struct {
	TotalEfetivos        float64              `json:"total_professores_efetivos"`
	TotalTemporarios     float64              `json:"total_professores_temporarios"`
	TotalAdministrativos float64              `json:"total_servidores_administrativos"`
	TotalReadaptados     float64              `json:"total_professores_readaptados"`
	MediaPorEscola       QuadroPessoalMedias  `json:"media_por_escola"`
	PorDRE               []QuadroPessoalDRE   `json:"por_dre"`
}

// AdminAnalyticsPessoalQuadro retorna indicadores quantitativos do quadro de pessoal.
// Baseado na view vw_censo_quadro_pessoal (Migration 0005).
// Suporta filtros: ?year=&dre=&municipio=&zona=&porte_escola=
func (app *application) AdminAnalyticsPessoalQuadro(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := QuadroPessoal{PorDRE: []QuadroPessoalDRE{}}

	const baseWhere = `
		FROM vw_censo_quadro_pessoal v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) Totais e médias globais
	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_professores_efetivos), 0)::float8,
			COALESCE(SUM(qtd_professores_temporarios), 0)::float8,
			COALESCE(SUM(qtd_servidores_administrativos), 0)::float8,
			COALESCE(SUM(qtd_professor_readaptado), 0)::float8,
			COALESCE(ROUND(AVG(qtd_professores_efetivos), 2), 0)::float8,
			COALESCE(ROUND(AVG(qtd_professores_temporarios), 2), 0)::float8,
			COALESCE(ROUND(AVG(qtd_servidores_administrativos), 2), 0)::float8,
			COALESCE(ROUND(AVG(qtd_professor_readaptado), 2), 0)::float8
		%s
	`, baseWhere), year, dre, municipio, zona, porte).Scan(
		&out.TotalEfetivos,
		&out.TotalTemporarios,
		&out.TotalAdministrativos,
		&out.TotalReadaptados,
		&out.MediaPorEscola.Efetivos,
		&out.MediaPorEscola.Temporarios,
		&out.MediaPorEscola.Administrativos,
		&out.MediaPorEscola.Readaptados,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("quadro_pessoal totais: %v", err), http.StatusInternalServerError)
		return
	}

	// 2) Distribuição por DRE (top 20, ordem desc por total de professores)
	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			v.dre,
			COALESCE(SUM(qtd_professores_efetivos), 0)::float8,
			COALESCE(SUM(qtd_professores_temporarios), 0)::float8,
			COALESCE(ROUND(AVG(total_professores), 2), 0)::float8
		%s
		GROUP BY v.dre
		ORDER BY SUM(total_professores) DESC
		LIMIT 20
	`, baseWhere), year, dre, municipio, zona, porte)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("quadro_pessoal por_dre: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var d QuadroPessoalDRE
		if err := rows.Scan(&d.DRE, &d.TotalEfetivos, &d.TotalTemporarios, &d.MediaProfessores); err != nil {
			app.errorJSON(w, fmt.Errorf("scan por_dre: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorDRE = append(out.PorDRE, d)
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// =========================================================================
// Tecnologia e Equipamentos
// =========================================================================

// MediaEquipamentoStat representa a média de um tipo de equipamento por escola.
type MediaEquipamentoStat struct {
	Valor string  `json:"valor"`
	Media float64 `json:"media"`
}

type TecnologiaInfra struct {
	EscolasComInternet         int64                    `json:"escolas_com_internet"`
	PercentualInternet         float64                  `json:"percentual_internet"`
	DisponibilidadeInternet    []CategoricStat          `json:"disponibilidade_internet"`
	PorProvedor                []CategoricStat          `json:"por_provedor"`
	PorQualidade               []CategoricStat          `json:"por_qualidade"`
	TotalDesktopsAdm           float64                  `json:"total_desktops_adm"`
	TotalDesktopsAlunos        float64                  `json:"total_desktops_alunos"`
	TotalNotebooks             float64                  `json:"total_notebooks"`
	TotalChromebooks           float64                  `json:"total_chromebooks"`
	MediaEquipamentos          []MediaEquipamentoStat   `json:"media_equipamentos_por_escola"`
	EscolasComInoperantes      int64                    `json:"escolas_com_computadores_inoperantes"`
	TotalInoperantes           float64                  `json:"total_computadores_inoperantes"`
	PercentualAtendeDemanda    float64                  `json:"percentual_computadores_atendem"`
	ComputadoresAtendemDemanda []CategoricStat          `json:"computadores_atendem_demanda"`
}

type TecnologiaUso struct {
	EscolasComProjetor       int64           `json:"escolas_com_projetor"`
	PercentualComProjetor    float64         `json:"percentual_com_projetor"`
	PossuiProjetorDist       []CategoricStat `json:"possui_projetor_dist"`
	TotalProjetores          float64         `json:"total_projetores"`
	MediaProjetoresPorEscola float64         `json:"media_projetores_por_escola"`
	EscolasComLousa          int64           `json:"escolas_com_lousa_digital"`
	PercentualComLousa       float64         `json:"percentual_com_lousa_digital"`
	PossuiLousaDigitalDist   []CategoricStat `json:"possui_lousa_digital_dist"`
}

// AdminAnalyticsTecnologiaInfra retorna indicadores de conectividade e parque de computadores.
// Baseado na view vw_censo_equipamentos_tecnologia (Migration 0006).
// Suporta filtros: ?year=&dre=&municipio=&zona=&porte_escola=
func (app *application) AdminAnalyticsTecnologiaInfra(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := TecnologiaInfra{
		DisponibilidadeInternet:    []CategoricStat{},
		PorProvedor:                []CategoricStat{},
		PorQualidade:               []CategoricStat{},
		MediaEquipamentos:          []MediaEquipamentoStat{},
		ComputadoresAtendemDemanda: []CategoricStat{},
	}

	const baseWhere = `
		FROM vw_censo_equipamentos_tecnologia v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) Totais de internet e equipamentos (inclui total absoluto de inoperantes)
	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH base AS (SELECT v.* %s),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT
			COUNT(DISTINCT school_id) FILTER (WHERE internet_disponivel)::bigint,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE internet_disponivel) / NULLIF(MAX(tot.n), 0), 1), 0)::float8,
			COALESCE(SUM(qtd_desktop_adm), 0)::float8,
			COALESCE(SUM(qtd_desktop_alunos), 0)::float8,
			COALESCE(SUM(qtd_notebooks), 0)::float8,
			COALESCE(SUM(qtd_chromebooks), 0)::float8,
			COUNT(DISTINCT school_id) FILTER (WHERE qtd_computadores_inoperantes > 0)::bigint,
			COALESCE(SUM(qtd_computadores_inoperantes), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE computadores_atendem = 'Sim') / NULLIF(MAX(tot.n), 0), 1), 0)::float8
		FROM base CROSS JOIN tot
	`, baseWhere), year, dre, municipio, zona, porte).Scan(
		&out.EscolasComInternet,
		&out.PercentualInternet,
		&out.TotalDesktopsAdm,
		&out.TotalDesktopsAlunos,
		&out.TotalNotebooks,
		&out.TotalChromebooks,
		&out.EscolasComInoperantes,
		&out.TotalInoperantes,
		&out.PercentualAtendeDemanda,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("tecnologia_infra totais: %v", err), http.StatusInternalServerError)
		return
	}

	// 1b) Disponibilidade de internet — distribuição Sim/Não.
	// Derivada do booleano internet_disponivel da view (que colapsa vazio/null em FALSE).
	// Denominador: COUNT(DISTINCT school_id) no recorte.
	{
		var simEsc, naoEsc int
		var simPct, naoPct float64
		if e := db.QueryRowContext(ctx, fmt.Sprintf(`
			WITH base AS (SELECT v.* %s),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT
				COUNT(DISTINCT school_id) FILTER (WHERE internet_disponivel)::int,
				COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE internet_disponivel) / NULLIF(MAX(tot.n), 0), 1), 0)::float8,
				COUNT(DISTINCT school_id) FILTER (WHERE NOT internet_disponivel)::int,
				COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE NOT internet_disponivel) / NULLIF(MAX(tot.n), 0), 1), 0)::float8
			FROM base CROSS JOIN tot
		`, baseWhere), year, dre, municipio, zona, porte).Scan(&simEsc, &simPct, &naoEsc, &naoPct); e != nil {
			app.errorJSON(w, fmt.Errorf("disponibilidade_internet: %v", e), http.StatusInternalServerError)
			return
		}
		out.DisponibilidadeInternet = []CategoricStat{
			{Valor: "Sim", Escolas: simEsc, Percentual: simPct},
			{Valor: "Não", Escolas: naoEsc, Percentual: naoPct},
		}
	}

	// 1c) Média de equipamentos por escola no recorte.
	// media = total declarado / nº de escolas do recorte = AVG(COALESCE(campo, 0)),
	// coerente com os cards de total já exibidos (ex.: 4.381 desktops ÷ 822 escolas).
	// Optou-se por média (e não mediana): quando o equipamento está concentrado numa
	// minoria de escolas, a mediana fica 0 e subrepresenta o parque (ver diagnóstico
	// em docs/dashboard/diagnostico-tecnologia-equipamentos.md).
	{
		var medChromebooks, medDesktopAlunos, medDesktopAdm, medNotebooks float64
		if e := db.QueryRowContext(ctx, fmt.Sprintf(`
			WITH base AS (SELECT v.* %s)
			SELECT
				COALESCE(ROUND(AVG(COALESCE(qtd_chromebooks, 0)), 2), 0)::float8,
				COALESCE(ROUND(AVG(COALESCE(qtd_desktop_alunos, 0)), 2), 0)::float8,
				COALESCE(ROUND(AVG(COALESCE(qtd_desktop_adm, 0)), 2), 0)::float8,
				COALESCE(ROUND(AVG(COALESCE(qtd_notebooks, 0)), 2), 0)::float8
			FROM base
		`, baseWhere), year, dre, municipio, zona, porte).Scan(&medChromebooks, &medDesktopAlunos, &medDesktopAdm, &medNotebooks); e != nil {
			app.errorJSON(w, fmt.Errorf("media_equipamentos: %v", e), http.StatusInternalServerError)
			return
		}
		out.MediaEquipamentos = []MediaEquipamentoStat{
			{Valor: "Chromebooks", Media: medChromebooks},
			{Valor: "Desktops de alunos", Media: medDesktopAlunos},
			{Valor: "Desktops administrativos", Media: medDesktopAdm},
			{Valor: "Notebooks", Media: medNotebooks},
		}
	}

	// helper: distribuição categórica por campo
	distCateg := func(campo string) ([]CategoricStat, error) {
		rows, err := db.QueryContext(ctx, fmt.Sprintf(`
			WITH base AS (SELECT v.* %s),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT
				COALESCE(%s, 'Não informado') AS valor,
				COUNT(DISTINCT school_id)::int AS escolas,
				COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1), 0)::float8 AS percentual
			FROM base CROSS JOIN tot
			WHERE %s IS NOT NULL
			GROUP BY %s, tot.n
			ORDER BY escolas DESC
		`, baseWhere, campo, campo, campo), year, dre, municipio, zona, porte)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []CategoricStat
		for rows.Next() {
			var s CategoricStat
			if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
				return nil, err
			}
			out = append(out, s)
		}
		return out, nil
	}

	// 2) Distribuição por provedor
	if stats, err := distCateg("provedor_internet"); err != nil {
		app.errorJSON(w, fmt.Errorf("por_provedor: %v", err), http.StatusInternalServerError)
		return
	} else {
		out.PorProvedor = stats
	}

	// 3) Distribuição por qualidade
	if stats, err := distCateg("qualidade_internet"); err != nil {
		app.errorJSON(w, fmt.Errorf("por_qualidade: %v", err), http.StatusInternalServerError)
		return
	} else {
		out.PorQualidade = stats
	}

	// 4) Equipamentos atendem à demanda — distribuição completa por categoria.
	// Inclui o bucket "Não informado" para nulos/vazios (NULLIF na view); não inventa categorias.
	{
		rows, err := db.QueryContext(ctx, fmt.Sprintf(`
			WITH base AS (SELECT v.* %s),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT
				COALESCE(computadores_atendem, 'Não informado') AS valor,
				COUNT(DISTINCT school_id)::int AS escolas,
				COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1), 0)::float8 AS percentual
			FROM base CROSS JOIN tot
			GROUP BY COALESCE(computadores_atendem, 'Não informado'), tot.n
			ORDER BY escolas DESC
		`, baseWhere), year, dre, municipio, zona, porte)
		if err != nil {
			app.errorJSON(w, fmt.Errorf("computadores_atendem_demanda: %v", err), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var s CategoricStat
			if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
				app.errorJSON(w, fmt.Errorf("scan computadores_atendem_demanda: %v", err), http.StatusInternalServerError)
				return
			}
			out.ComputadoresAtendemDemanda = append(out.ComputadoresAtendemDemanda, s)
		}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsTecnologiaUso retorna indicadores de recursos pedagógicos tecnológicos.
// Baseado na view vw_censo_equipamentos_tecnologia (Migration 0006).
// Suporta filtros: ?year=&dre=&municipio=&zona=&porte_escola=
func (app *application) AdminAnalyticsTecnologiaUso(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	qs := r.URL.Query()
	yearStr := qs.Get("year")
	dre := qs.Get("dre")
	municipio := qs.Get("municipio")
	zona := qs.Get("zona")
	porte := qs.Get("porte_escola")

	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	out := TecnologiaUso{
		PossuiProjetorDist:     []CategoricStat{},
		PossuiLousaDigitalDist: []CategoricStat{},
	}

	const baseWhere = `
		FROM vw_censo_equipamentos_tecnologia v
		JOIN vw_censo_enriquecida e ON e.census_id = v.census_id
		WHERE v.status = 'completed'
		  AND v.year = $1
		  AND ($2 = '' OR v.dre = $2)
		  AND ($3 = '' OR v.municipio = $3)
		  AND ($4 = '' OR v.zona = $4)
		  AND ($5 = '' OR e.porte_escola_nome = $5)
	`

	// 1) KPIs de projetor/lousa e média de projetores por escola.
	// media_projetores_por_escola = AVG(COALESCE(qtd_projetores, 0)) — média sobre todas as
	// escolas do recorte, tratando "não informado" como zero (coerente com a divisão pelo total).
	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH base AS (SELECT v.* %s),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT
			COUNT(DISTINCT school_id) FILTER (WHERE possui_projetor)::bigint,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE possui_projetor) / NULLIF(MAX(tot.n), 0), 1), 0)::float8,
			COALESCE(SUM(qtd_projetores), 0)::float8,
			COALESCE(ROUND(AVG(COALESCE(qtd_projetores, 0)), 2), 0)::float8,
			COUNT(DISTINCT school_id) FILTER (WHERE possui_lousa_digital)::bigint,
			COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE possui_lousa_digital) / NULLIF(MAX(tot.n), 0), 1), 0)::float8
		FROM base CROSS JOIN tot
	`, baseWhere), year, dre, municipio, zona, porte).Scan(
		&out.EscolasComProjetor,
		&out.PercentualComProjetor,
		&out.TotalProjetores,
		&out.MediaProjetoresPorEscola,
		&out.EscolasComLousa,
		&out.PercentualComLousa,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("tecnologia_uso: %v", err), http.StatusInternalServerError)
		return
	}

	// helper: distribuição Sim/Não de um campo booleano da view.
	// A view colapsa vazio/null em FALSE, portanto "Não" inclui também os não declarados.
	distBool := func(campo string) ([]CategoricStat, error) {
		var simEsc, naoEsc int
		var simPct, naoPct float64
		if e := db.QueryRowContext(ctx, fmt.Sprintf(`
			WITH base AS (SELECT v.* %s),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT
				COUNT(DISTINCT school_id) FILTER (WHERE %s)::int,
				COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE %s) / NULLIF(MAX(tot.n), 0), 1), 0)::float8,
				COUNT(DISTINCT school_id) FILTER (WHERE NOT %s)::int,
				COALESCE(ROUND(100.0 * COUNT(DISTINCT school_id) FILTER (WHERE NOT %s) / NULLIF(MAX(tot.n), 0), 1), 0)::float8
			FROM base CROSS JOIN tot
		`, baseWhere, campo, campo, campo, campo), year, dre, municipio, zona, porte).Scan(&simEsc, &simPct, &naoEsc, &naoPct); e != nil {
			return nil, e
		}
		return []CategoricStat{
			{Valor: "Sim", Escolas: simEsc, Percentual: simPct},
			{Valor: "Não", Escolas: naoEsc, Percentual: naoPct},
		}, nil
	}

	// 2) Projetor multimídia — distribuição Sim/Não
	if stats, e := distBool("possui_projetor"); e != nil {
		app.errorJSON(w, fmt.Errorf("possui_projetor_dist: %v", e), http.StatusInternalServerError)
		return
	} else {
		out.PossuiProjetorDist = stats
	}

	// 3) Lousa digital — distribuição Sim/Não
	if stats, e := distBool("possui_lousa_digital"); e != nil {
		app.errorJSON(w, fmt.Errorf("possui_lousa_digital_dist: %v", e), http.StatusInternalServerError)
		return
	} else {
		out.PossuiLousaDigitalDist = stats
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
