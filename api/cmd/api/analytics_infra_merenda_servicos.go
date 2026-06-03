package main

import (
	"fmt"
	"net/http"
)

// ---- tipos compartilhados ------------------------------------------------

type CategoricStat struct {
	Valor      string  `json:"valor"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

type AmbienteStat struct {
	Ambiente string `json:"ambiente"`
	Escolas  int    `json:"escolas"`
}

type EmpresaStat struct {
	Empresa string `json:"empresa"`
	Escolas int    `json:"escolas"`
}

// ---- payloads Infraestrutura ---------------------------------------------

type InfraCondicoes struct {
	PorTipoPredio           []CategoricStat `json:"por_tipo_predio"`
	PorSituacaoEstrutura    []CategoricStat `json:"por_situacao_estrutura"`
	PctMuroCerca            float64         `json:"pct_com_muro_ou_cerca"`
	PctPerimetroFechado     float64         `json:"pct_perimetro_fechado"`
	TopAmbientes            []AmbienteStat  `json:"top_ambientes"`
	DistMuroCerca           []CategoricStat `json:"dist_muro_cerca"`
	DistPerimetroFechado    []CategoricStat `json:"dist_perimetro_fechado"`
	PctReformaCritica       float64         `json:"pct_reforma_critica"`
	PctReformaGeralApenas   float64         `json:"pct_reforma_geral"`
	PctObraParadaApenas     float64         `json:"pct_obra_parada"`
	PctCoberturaPlena       float64         `json:"pct_cobertura_plena"`
}

type InfraSeguranca struct {
	PctGuarita              float64         `json:"pct_possui_guarita"`
	PctControlePortao       float64         `json:"pct_controle_portao"`
	PctBotaoPanico          float64         `json:"pct_possui_botao_panico"`
	PctCamerasFuncionais    float64         `json:"pct_cameras_funcionais"`
	PctPlanoEvacuacao       float64         `json:"pct_plano_evacuacao"`
	PctPoliticaBullying     float64         `json:"pct_politica_bullying"`
	DistCameras             []CategoricStat `json:"dist_cameras"`
	DistIluminacaoExterna   []CategoricStat `json:"dist_iluminacao_externa"`
	DistControlePortao      []CategoricStat `json:"dist_controle_portao"`
}

type ClimatizacaoSalaRow struct {
	Faixa           string `json:"faixa"`
	TotalSalas      int    `json:"total_salas"`
	Climatizadas    int    `json:"climatizadas"`
	NaoClimatizadas int    `json:"nao_climatizadas"`
}

type InfraEnergia struct {
	DistRedeEletrica       []CategoricStat      `json:"dist_rede_eletrica_atende"`
	DistEstruturaClimatiz  []CategoricStat      `json:"dist_estrutura_climatizacao"`
	DistClimatizacaoSalas  []CategoricStat      `json:"dist_climatizacao_salas"`
	TabelaClimatizacao     []ClimatizacaoSalaRow `json:"tabela_climatizacao"`
}

// ---- payloads Merenda ----------------------------------------------------

type MerendaOferta struct {
	DistOfertaRegular     []CategoricStat `json:"dist_oferta_regular"`
	DistQualidade         []CategoricStat `json:"dist_qualidade"`
	PctAtendeNecessidades float64         `json:"pct_atende_necessidades"`
	DistCondicoesCozinha  []CategoricStat `json:"dist_condicoes_cozinha"`
	PctPossuiRefeitorio   float64         `json:"pct_possui_refeitorio"`
}

type EquipTotais struct {
	Total float64 `json:"total"`
	Media float64 `json:"media_por_escola"`
}

type EstadoEquipStat struct {
	Equipamento string `json:"equipamento"`
	Estado      string `json:"estado"`
	Escolas     int    `json:"escolas"`
}

type MerendaEquipamentos struct {
	Freezers    EquipTotais       `json:"freezers"`
	Geladeiras  EquipTotais       `json:"geladeiras"`
	Fogoes      EquipTotais       `json:"fogoes"`
	Fornos      EquipTotais       `json:"fornos"`
	Bebedouros  EquipTotais       `json:"bebedouros"`
	DistEstados []EstadoEquipStat `json:"dist_estados"`
}

type MerendaRH struct {
	TotalEstatutaria  float64       `json:"total_estatutaria"`
	TotalTerceirizada float64       `json:"total_terceirizada"`
	TotalTemporaria   float64       `json:"total_temporaria"`
	PctComSupervisor  float64       `json:"pct_com_supervisor"`
	TopEmpresas       []EmpresaStat `json:"top_empresas"`
}

// ---- payloads Serviços Terceirizados ------------------------------------

type TerceirizacaoArea struct {
	Area       string  `json:"area"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

type ServicosVisaoGeral struct {
	PorArea            []TerceirizacaoArea `json:"por_area"`
	PorQuantidadeAreas []CategoricStat     `json:"por_quantidade_areas"`
}

type ServicosGerais struct {
	TotalEfetivo        float64 `json:"total_efetivo"`
	TotalTemporario     float64 `json:"total_temporario"`
	TotalTerceirizado   float64 `json:"total_terceirizado"`
	MediaTotalPorEscola float64 `json:"media_total_por_escola"`
}

type ServicosPortaria struct {
	PctComAgentes         float64       `json:"pct_com_agentes"`
	MediaAgentesPorEscola float64       `json:"media_agentes_por_escola"`
	TopEmpresas           []EmpresaStat `json:"top_empresas"`
}

// ---- helpers internos ---------------------------------------------------

func (app *application) scanCategoricRows(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close() error
}) ([]CategoricStat, error) {
	defer rows.Close()
	var out []CategoricStat
	for rows.Next() {
		var s CategoricStat
		if err := rows.Scan(&s.Valor, &s.Escolas, &s.Percentual); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// =========================================================================
// Infraestrutura e Segurança
// =========================================================================

func (app *application) AdminAnalyticsInfraCondicoes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := InfraCondicoes{
		PorTipoPredio:        []CategoricStat{},
		PorSituacaoEstrutura: []CategoricStat{},
		TopAmbientes:         []AmbienteStat{},
		DistMuroCerca:        []CategoricStat{},
		DistPerimetroFechado: []CategoricStat{},
	}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	distQ := func(campo string) ([]CategoricStat, error) {
		rows, err := db.QueryContext(ctx, fmt.Sprintf(`
			WITH base AS (
				SELECT school_id, %s AS val
				FROM vw_censo_infraestrutura_seguranca
				WHERE %s AND %s IS NOT NULL
			),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT val,
				COUNT(DISTINCT school_id) AS escolas,
				ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
			FROM base CROSS JOIN tot
			GROUP BY val, tot.n
			ORDER BY escolas DESC
		`, campo, filtro, campo))
		if err != nil {
			return nil, err
		}
		return app.scanCategoricRows(rows)
	}

	var err error
	if out.PorTipoPredio, err = distQ("tipo_predio"); err != nil {
		app.errorJSON(w, fmt.Errorf("por_tipo_predio: %v", err), http.StatusInternalServerError)
		return
	}
	if out.PorSituacaoEstrutura, err = distQ("situacao_estrutura"); err != nil {
		app.errorJSON(w, fmt.Errorf("por_situacao_estrutura: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(muro_cerca) LIKE 'sim%%') / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE perimetro_fechado IS NOT NULL AND lower(perimetro_fechado) NOT IN ('não', 'nao', 'não possui')) / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_infraestrutura_seguranca
		WHERE %s
	`, filtro)).Scan(&out.PctMuroCerca, &out.PctPerimetroFechado)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_muro: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT ambiente, COUNT(DISTINCT school_id) AS escolas
		FROM vw_censo_ambientes
		WHERE %s
		GROUP BY ambiente
		ORDER BY escolas DESC
		LIMIT 10
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("top_ambientes: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var a AmbienteStat
		if err := rows.Scan(&a.Ambiente, &a.Escolas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan ambientes: %v", err), http.StatusInternalServerError)
			return
		}
		out.TopAmbientes = append(out.TopAmbientes, a)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter ambientes: %v", err), http.StatusInternalServerError)
		return
	}

	if out.DistMuroCerca, err = distQ("muro_cerca"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_muro_cerca: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistPerimetroFechado, err = distQ("perimetro_fechado"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_perimetro_fechado: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE situacao_estrutura IN ('Necessita de reforma geral', 'Está em reforma, porém a obra está parada')) / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE situacao_estrutura = 'Necessita de reforma geral') / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE situacao_estrutura = 'Está em reforma, porém a obra está parada') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_infraestrutura_seguranca
		WHERE %s
	`, filtro)).Scan(&out.PctReformaCritica, &out.PctReformaGeralApenas, &out.PctObraParadaApenas)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_reforma_critica: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, coberturaEssenciaisCTE+`
		SELECT
			CASE WHEN COUNT(*) > 0
				 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE qtd_essenciais = 8) / COUNT(*), 2)
				 ELSE 0
			END::float8
		FROM por_escola
	`).Scan(&out.PctCoberturaPlena)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_cobertura_plena: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsInfraSeguranca(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := InfraSeguranca{
		DistCameras:           []CategoricStat{},
		DistIluminacaoExterna: []CategoricStat{},
		DistControlePortao:    []CategoricStat{},
	}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_guarita)    = 'sim')                                          / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE controle_portao IS NOT NULL)                                               / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_botao_panico) = 'sim')                                        / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE cameras_funcionamento IS NOT NULL AND lower(cameras_funcionamento) NOT LIKE '%%não possui%%') / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(plano_evacuacao)   = 'sim')                                          / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE politica_bullying IS NOT NULL AND lower(politica_bullying) NOT LIKE 'não%%') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_infraestrutura_seguranca
		WHERE %s
	`, filtro)).Scan(
		&out.PctGuarita,
		&out.PctControlePortao,
		&out.PctBotaoPanico,
		&out.PctCamerasFuncionais,
		&out.PctPlanoEvacuacao,
		&out.PctPoliticaBullying,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("seguranca_pcts: %v", err), http.StatusInternalServerError)
		return
	}

	rowsIlum, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, iluminacao_externa AS val
			FROM vw_censo_infraestrutura_seguranca
			WHERE %s AND iluminacao_externa IS NOT NULL
		),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT val,
			COUNT(DISTINCT school_id) AS escolas,
			ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
		FROM base CROSS JOIN tot
		GROUP BY val, tot.n
		ORDER BY CASE val WHEN 'Adequada' THEN 1 WHEN 'Regular' THEN 2 ELSE 3 END
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dist_iluminacao: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistIluminacaoExterna, err = app.scanCategoricRows(rowsIlum); err != nil {
		app.errorJSON(w, fmt.Errorf("scan dist_iluminacao: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, cameras_funcionamento AS val
			FROM vw_censo_infraestrutura_seguranca
			WHERE %s AND cameras_funcionamento IS NOT NULL
		),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT val,
			COUNT(DISTINCT school_id) AS escolas,
			ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
		FROM base CROSS JOIN tot
		GROUP BY val, tot.n
		ORDER BY escolas DESC
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dist_cameras: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistCameras, err = app.scanCategoricRows(rows); err != nil {
		app.errorJSON(w, fmt.Errorf("scan dist_cameras: %v", err), http.StatusInternalServerError)
		return
	}

	rowsPortao, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, controle_portao AS val
			FROM vw_censo_infraestrutura_seguranca
			WHERE %s AND controle_portao IS NOT NULL
		),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT val,
			COUNT(DISTINCT school_id) AS escolas,
			ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
		FROM base CROSS JOIN tot
		GROUP BY val, tot.n
		ORDER BY escolas DESC
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dist_controle_portao: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistControlePortao, err = app.scanCategoricRows(rowsPortao); err != nil {
		app.errorJSON(w, fmt.Errorf("scan dist_controle_portao: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsInfraEnergia(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := InfraEnergia{
		DistRedeEletrica:      []CategoricStat{},
		DistEstruturaClimatiz: []CategoricStat{},
		DistClimatizacaoSalas: []CategoricStat{},
		TabelaClimatizacao:    []ClimatizacaoSalaRow{},
	}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	distInfra := func(campo string) ([]CategoricStat, error) {
		rows, err := db.QueryContext(ctx, fmt.Sprintf(`
			WITH base AS (
				SELECT school_id, %s AS val
				FROM vw_censo_infraestrutura_seguranca
				WHERE %s AND %s IS NOT NULL
			),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT val,
				COUNT(DISTINCT school_id) AS escolas,
				ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
			FROM base CROSS JOIN tot
			GROUP BY val, tot.n
			ORDER BY escolas DESC
		`, campo, filtro, campo))
		if err != nil {
			return nil, err
		}
		return app.scanCategoricRows(rows)
	}

	var err error
	if out.DistRedeEletrica, err = distInfra("rede_eletrica_atende"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_rede_eletrica: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistEstruturaClimatiz, err = distInfra("estrutura_climatizacao"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_estrutura_climatizacao: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, situacao_climatizacao_salas AS val
			FROM vw_censo_enriquecida
			WHERE %s AND situacao_climatizacao_salas IS NOT NULL AND situacao_climatizacao_salas <> 'Não informado'
		),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT val,
			COUNT(DISTINCT school_id) AS escolas,
			ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
		FROM base CROSS JOIN tot
		GROUP BY val, tot.n
		ORDER BY escolas DESC
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dist_climatizacao_salas: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistClimatizacaoSalas, err = app.scanCategoricRows(rows); err != nil {
		app.errorJSON(w, fmt.Errorf("scan dist_climatizacao_salas: %v", err), http.StatusInternalServerError)
		return
	}

	rowsTabela, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			situacao_climatizacao_salas AS faixa,
			COALESCE(SUM(qtd_salas_aula), 0)::int             AS total_salas,
			COALESCE(SUM(salas_climatizadas), 0)::int          AS climatizadas,
			COALESCE(SUM(qtd_salas_nao_climatizadas), 0)::int  AS nao_climatizadas
		FROM vw_censo_enriquecida
		WHERE %s
		  AND situacao_climatizacao_salas IS NOT NULL
		  AND situacao_climatizacao_salas <> 'Não informado'
		GROUP BY situacao_climatizacao_salas
		ORDER BY CASE situacao_climatizacao_salas
			WHEN 'Totalmente climatizadas'   THEN 1
			WHEN 'Parcialmente climatizadas' THEN 2
			WHEN 'Não climatizadas'          THEN 3
			ELSE 4
		END
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("tabela_climatizacao: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsTabela.Close()
	for rowsTabela.Next() {
		var r ClimatizacaoSalaRow
		if err := rowsTabela.Scan(&r.Faixa, &r.TotalSalas, &r.Climatizadas, &r.NaoClimatizadas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan tabela_climatizacao: %v", err), http.StatusInternalServerError)
			return
		}
		out.TabelaClimatizacao = append(out.TabelaClimatizacao, r)
	}
	if err := rowsTabela.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter tabela_climatizacao: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// =========================================================================
// Merenda Escolar
// =========================================================================

func (app *application) AdminAnalyticsMerendaOferta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := MerendaOferta{
		DistOfertaRegular:    []CategoricStat{},
		DistQualidade:        []CategoricStat{},
		DistCondicoesCozinha: []CategoricStat{},
	}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	distQ := func(view, campo string) ([]CategoricStat, error) {
		rows, err := db.QueryContext(ctx, fmt.Sprintf(`
			WITH base AS (
				SELECT school_id, %s AS val FROM %s WHERE %s AND %s IS NOT NULL
			),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT val,
				COUNT(DISTINCT school_id) AS escolas,
				ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
			FROM base CROSS JOIN tot
			GROUP BY val, tot.n ORDER BY 2 DESC
		`, campo, view, filtro, campo))
		if err != nil {
			return nil, err
		}
		return app.scanCategoricRows(rows)
	}

	var err error
	if out.DistOfertaRegular, err = distQ("vw_censo_rh_merendeiras", "oferta_regular"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_oferta_regular: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistQualidade, err = distQ("vw_censo_rh_merendeiras", "qualidade_merenda"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_qualidade: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistCondicoesCozinha, err = distQ("vw_censo_equipamentos_merenda", "condicoes_cozinha"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_condicoes_cozinha: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(atende_necessidades) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_rh_merendeiras WHERE %s
	`, filtro)).Scan(&out.PctAtendeNecessidades)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_atende_necessidades: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_refeitorio) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_equipamentos_merenda WHERE %s
	`, filtro)).Scan(&out.PctPossuiRefeitorio)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_merenda: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsMerendaEquipamentos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := MerendaEquipamentos{DistEstados: []EstadoEquipStat{}}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_freezers),   0)::float8, COALESCE(AVG(qtd_freezers)   FILTER (WHERE qtd_freezers   IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_geladeiras), 0)::float8, COALESCE(AVG(qtd_geladeiras) FILTER (WHERE qtd_geladeiras IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_fogoes),     0)::float8, COALESCE(AVG(qtd_fogoes)     FILTER (WHERE qtd_fogoes     IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_fornos),     0)::float8, COALESCE(AVG(qtd_fornos)     FILTER (WHERE qtd_fornos     IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_bebedouros), 0)::float8, COALESCE(AVG(qtd_bebedouros) FILTER (WHERE qtd_bebedouros IS NOT NULL), 0)::float8
		FROM vw_censo_equipamentos_merenda
		WHERE %s
	`, filtro)).Scan(
		&out.Freezers.Total, &out.Freezers.Media,
		&out.Geladeiras.Total, &out.Geladeiras.Media,
		&out.Fogoes.Total, &out.Fogoes.Media,
		&out.Fornos.Total, &out.Fornos.Media,
		&out.Bebedouros.Total, &out.Bebedouros.Media,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("equip_totais: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT equipamento, estado, COUNT(*) AS escolas FROM (
			SELECT 'freezers'   AS equipamento, estado_freezers   AS estado FROM vw_censo_equipamentos_merenda WHERE %s AND estado_freezers   IS NOT NULL
			UNION ALL
			SELECT 'geladeiras',                estado_geladeiras            FROM vw_censo_equipamentos_merenda WHERE %s AND estado_geladeiras IS NOT NULL
			UNION ALL
			SELECT 'fogoes',                    estado_fogoes                FROM vw_censo_equipamentos_merenda WHERE %s AND estado_fogoes     IS NOT NULL
			UNION ALL
			SELECT 'fornos',                    estado_fornos                FROM vw_censo_equipamentos_merenda WHERE %s AND estado_fornos     IS NOT NULL
			UNION ALL
			SELECT 'bebedouros',                estado_bebedouros            FROM vw_censo_equipamentos_merenda WHERE %s AND estado_bebedouros IS NOT NULL
		) t
		GROUP BY equipamento, estado
		ORDER BY equipamento, escolas DESC
	`, filtro, filtro, filtro, filtro, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dist_estados: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var s EstadoEquipStat
		if err := rows.Scan(&s.Equipamento, &s.Estado, &s.Escolas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan dist_estados: %v", err), http.StatusInternalServerError)
			return
		}
		out.DistEstados = append(out.DistEstados, s)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter dist_estados: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsMerendaRH(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := MerendaRH{TopEmpresas: []EmpresaStat{}}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_merendeiras_estatutaria),  0)::float8,
			COALESCE(SUM(qtd_merendeiras_terceirizada), 0)::float8,
			COALESCE(SUM(qtd_merendeiras_temporaria),   0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_supervisor_merenda) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_rh_merendeiras
		WHERE %s
	`, filtro)).Scan(
		&out.TotalEstatutaria,
		&out.TotalTerceirizada,
		&out.TotalTemporaria,
		&out.PctComSupervisor,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("rh_merenda_totais: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT empresa_terceirizada_merenda AS empresa, COUNT(DISTINCT school_id) AS escolas
		FROM vw_censo_rh_merendeiras
		WHERE %s AND empresa_terceirizada_merenda IS NOT NULL
		GROUP BY empresa
		ORDER BY escolas DESC
		LIMIT 10
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("top_empresas_merenda: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var e EmpresaStat
		if err := rows.Scan(&e.Empresa, &e.Escolas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan empresas: %v", err), http.StatusInternalServerError)
			return
		}
		out.TopEmpresas = append(out.TopEmpresas, e)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter empresas: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// =========================================================================
// Serviços Terceirizados
// =========================================================================

func (app *application) AdminAnalyticsServicosVisaoGeral(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := ServicosVisaoGeral{
		PorArea:            []TerceirizacaoArea{},
		PorQuantidadeAreas: []CategoricStat{},
	}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS total
			FROM vw_censo_servicos_terceirizados WHERE %s
		)
		SELECT area, escolas, ROUND(100.0 * escolas / NULLIF(base.total, 0), 1)::float8
		FROM (
			SELECT 'Merenda'          AS area, COUNT(DISTINCT school_id) AS escolas FROM vw_censo_servicos_terceirizados WHERE %s AND empresa_terceirizada_merenda  IS NOT NULL
			UNION ALL
			SELECT 'Portaria',                 COUNT(DISTINCT school_id)             FROM vw_censo_servicos_terceirizados WHERE %s AND empresa_terceirizada_portaria IS NOT NULL
			UNION ALL
			SELECT 'Serviços Gerais',          COUNT(DISTINCT school_id)             FROM vw_censo_servicos_terceirizados WHERE %s AND empresa_terceirizada_sg       IS NOT NULL
		) t CROSS JOIN base
		ORDER BY escolas DESC
	`, filtro, filtro, filtro, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("por_area: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var t TerceirizacaoArea
		if err := rows.Scan(&t.Area, &t.Escolas, &t.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan por_area: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorArea = append(out.PorArea, t)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter por_area: %v", err), http.StatusInternalServerError)
		return
	}

	rows2, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH areas AS (
			SELECT school_id,
				(empresa_terceirizada_merenda  IS NOT NULL)::int +
				(empresa_terceirizada_portaria IS NOT NULL)::int +
				(empresa_terceirizada_sg       IS NOT NULL)::int AS qtd
			FROM vw_censo_servicos_terceirizados WHERE %s
		),
		tot AS (SELECT COUNT(*)::numeric AS n FROM areas)
		SELECT qtd::text AS valor,
			COUNT(*) AS escolas,
			ROUND(100.0 * COUNT(*) / NULLIF(tot.n, 0), 1)::float8
		FROM areas CROSS JOIN tot
		GROUP BY qtd, tot.n
		ORDER BY qtd
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("por_qtd_areas: %v", err), http.StatusInternalServerError)
		return
	}
	if out.PorQuantidadeAreas, err = app.scanCategoricRows(rows2); err != nil {
		app.errorJSON(w, fmt.Errorf("scan por_qtd_areas: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsServicosGerais(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	var out ServicosGerais

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_servicos_gerais_efetivo),      0)::float8,
			COALESCE(SUM(qtd_servicos_gerais_temporario),   0)::float8,
			COALESCE(SUM(qtd_servicos_gerais_terceirizado), 0)::float8,
			COALESCE(AVG(
				COALESCE(qtd_servicos_gerais_efetivo,      0) +
				COALESCE(qtd_servicos_gerais_temporario,   0) +
				COALESCE(qtd_servicos_gerais_terceirizado, 0)
			), 0)::float8
		FROM vw_censo_rh_servicos_gerais
		WHERE %s
	`, filtro)).Scan(
		&out.TotalEfetivo,
		&out.TotalTemporario,
		&out.TotalTerceirizado,
		&out.MediaTotalPorEscola,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("servicos_gerais: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsServicosPortaria(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := ServicosPortaria{TopEmpresas: []EmpresaStat{}}

	const filtro = `status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND census_id IS NOT NULL`

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE qtd_agentes_portaria > 0) / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(AVG(qtd_agentes_portaria) FILTER (WHERE qtd_agentes_portaria IS NOT NULL), 0)::float8
		FROM vw_censo_servicos_terceirizados
		WHERE %s
	`, filtro)).Scan(&out.PctComAgentes, &out.MediaAgentesPorEscola)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("portaria_pcts: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT empresa_terceirizada_portaria AS empresa, COUNT(DISTINCT school_id) AS escolas
		FROM vw_censo_servicos_terceirizados
		WHERE %s AND empresa_terceirizada_portaria IS NOT NULL
		GROUP BY empresa
		ORDER BY escolas DESC
		LIMIT 10
	`, filtro))
	if err != nil {
		app.errorJSON(w, fmt.Errorf("top_empresas_portaria: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var e EmpresaStat
		if err := rows.Scan(&e.Empresa, &e.Escolas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan empresas_portaria: %v", err), http.StatusInternalServerError)
			return
		}
		out.TopEmpresas = append(out.TopEmpresas, e)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter empresas_portaria: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
