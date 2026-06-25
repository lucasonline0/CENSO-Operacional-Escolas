package main

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
)

// round1 arredonda para 1 casa decimal (percentuais/médias calculados em Go).
func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

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
	PorTipoPredio         []CategoricStat `json:"por_tipo_predio"`
	PorSituacaoEstrutura  []CategoricStat `json:"por_situacao_estrutura"`
	PctMuroCerca          float64         `json:"pct_com_muro_ou_cerca"`
	PctPerimetroFechado   float64         `json:"pct_perimetro_fechado"`
	TopAmbientes          []AmbienteStat  `json:"top_ambientes"`
	DistMuroCerca         []CategoricStat `json:"dist_muro_cerca"`
	DistPerimetroFechado  []CategoricStat `json:"dist_perimetro_fechado"`
	PctReformaCritica     float64         `json:"pct_reforma_critica"`
	PctReformaGeralApenas float64         `json:"pct_reforma_geral"`
	PctObraParadaApenas   float64         `json:"pct_obra_parada"`
	PctCoberturaPlena     float64         `json:"pct_cobertura_plena"`
}

type InfraSeguranca struct {
	PctGuarita            float64         `json:"pct_possui_guarita"`
	PctControlePortao     float64         `json:"pct_controle_portao"`
	PctBotaoPanico        float64         `json:"pct_possui_botao_panico"`
	PctCamerasFuncionais  float64         `json:"pct_cameras_funcionais"`
	PctPlanoEvacuacao     float64         `json:"pct_plano_evacuacao"`
	PctPoliticaBullying   float64         `json:"pct_politica_bullying"`
	DistCameras           []CategoricStat `json:"dist_cameras"`
	DistIluminacaoExterna []CategoricStat `json:"dist_iluminacao_externa"`
	DistControlePortao    []CategoricStat `json:"dist_controle_portao"`
}

type ClimatizacaoSalaRow struct {
	Faixa           string `json:"faixa"`
	TotalSalas      int    `json:"total_salas"`
	Climatizadas    int    `json:"climatizadas"`
	NaoClimatizadas int    `json:"nao_climatizadas"`
}

type InfraEnergia struct {
	DistRedeEletrica      []CategoricStat       `json:"dist_rede_eletrica_atende"`
	DistEstruturaClimatiz []CategoricStat       `json:"dist_estrutura_climatizacao"`
	DistClimatizacaoSalas []CategoricStat       `json:"dist_climatizacao_salas"`
	TabelaClimatizacao    []ClimatizacaoSalaRow `json:"tabela_climatizacao"`
}

// ---- payloads Merenda ----------------------------------------------------

type MerendaOferta struct {
	DistOfertaRegular      []CategoricStat `json:"dist_oferta_regular"`
	DistQualidade          []CategoricStat `json:"dist_qualidade"`
	PctAtendeNecessidades  float64         `json:"pct_atende_necessidades"`
	DistAtendeNecessidades []CategoricStat `json:"dist_atende_necessidades"`
	DistCondicoesCozinha   []CategoricStat `json:"dist_condicoes_cozinha"`
	PctPossuiRefeitorio    float64         `json:"pct_possui_refeitorio"`
	DistPossuiRefeitorio   []CategoricStat `json:"dist_possui_refeitorio"`
	DistTamanhoCozinha     []CategoricStat `json:"dist_tamanho_cozinha"`
	DistRefeitorioAdequado []CategoricStat `json:"dist_refeitorio_adequado"`
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

// Presença de equipamentos por tipo (qtd > 0).
type PresencaEquipamentoStat struct {
	Equipamento string  `json:"equipamento"`
	Escolas     int     `json:"escolas"`
	Percentual  float64 `json:"percentual"`
}

// Faixa cumulativa de quantidade de tipos de equipamento presentes por escola.
type FaixaQtdTiposEquipamentosStat struct {
	Label      string  `json:"label"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

// Estado de conservação consolidado (Bom / Regular / Ruim-Inoperante) por equipamento.
type EstadoConsolidadoEquipamentoStat struct {
	Equipamento string  `json:"equipamento"`
	Estado      string  `json:"estado"`
	Escolas     int     `json:"escolas"`
	Percentual  float64 `json:"percentual"`
}

type MediaEquipamentoMerendaStat struct {
	Equipamento string  `json:"equipamento"`
	Media       float64 `json:"media"`
}

// Criticidade = % de escolas com estado ruim/inoperante por equipamento.
type CriticidadeEquipamentoStat struct {
	Equipamento     string  `json:"equipamento"`
	EscolasCriticas int     `json:"escolas_criticas"`
	Percentual      float64 `json:"percentual"`
}

type MerendaEquipamentos struct {
	Freezers    EquipTotais       `json:"freezers"`
	Geladeiras  EquipTotais       `json:"geladeiras"`
	Fogoes      EquipTotais       `json:"fogoes"`
	Fornos      EquipTotais       `json:"fornos"`
	Bebedouros  EquipTotais       `json:"bebedouros"`
	DistEstados []EstadoEquipStat `json:"dist_estados"`

	PresencaPorTipo           []PresencaEquipamentoStat          `json:"presenca_por_tipo"`
	FaixasQtdTipos            []FaixaQtdTiposEquipamentosStat    `json:"faixas_qtd_tipos"`
	EstadoConsolidado         []EstadoConsolidadoEquipamentoStat `json:"estado_consolidado"`
	MediaPorTipo              []MediaEquipamentoMerendaStat      `json:"media_por_tipo"`
	CriticidadePorEquipamento []CriticidadeEquipamentoStat       `json:"criticidade_por_equipamento"`
}

type MerendaRH struct {
	TotalEstatutaria  float64       `json:"total_estatutaria"`
	TotalTerceirizada float64       `json:"total_terceirizada"`
	TotalTemporaria   float64       `json:"total_temporaria"`
	PctComSupervisor  float64       `json:"pct_com_supervisor"`
	TopEmpresas       []EmpresaStat `json:"top_empresas"`
}

// Presença de um item básico de cozinha (denominador = escolas concluídas no recorte).
type MerendaItemBasicoStat struct {
	Item       string  `json:"item"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

type MerendaCondicoesSanitarias struct {
	DistDespensaExclusiva  []CategoricStat         `json:"dist_despensa_exclusiva"`
	DistDepositoConserva   []CategoricStat         `json:"dist_deposito_conserva"`
	PresencaItensBasicos   []MerendaItemBasicoStat `json:"presenca_itens_basicos"`
	DistEstoqueEpiExtintor []CategoricStat         `json:"dist_estoque_epi_extintor"`
	DistManutencaoExtintor []CategoricStat         `json:"dist_manutencao_extintores"`
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
	TotalEfetivo        float64       `json:"total_efetivo"`
	TotalTemporario     float64       `json:"total_temporario"`
	TotalTerceirizado   float64       `json:"total_terceirizado"`
	MediaTotalPorEscola float64       `json:"media_total_por_escola"`
	TopEmpresas         []EmpresaStat `json:"top_empresas"`
}

type ServicosPortaria struct {
	PctComAgentes         float64       `json:"pct_com_agentes"`
	MediaAgentesPorEscola float64       `json:"media_agentes_por_escola"`
	TopEmpresas           []EmpresaStat `json:"top_empresas"`
}

type ServicosManipuladoresAlimentos struct {
	TotalEstatutaria      float64         `json:"total_estatutaria"`
	TotalTerceirizada     float64         `json:"total_terceirizada"`
	TotalTemporaria       float64         `json:"total_temporaria"`
	TotalGeral            float64         `json:"total_geral"`
	MediaPorEscola        float64         `json:"media_por_escola"`
	PctComSupervisor      float64         `json:"pct_com_supervisor"`
	DistVinculo           []CategoricStat `json:"dist_vinculo"`
	DistAtendeNecessidade []CategoricStat `json:"dist_atende_necessidade"`
	TopEmpresas           []EmpresaStat   `json:"top_empresas"`
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

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

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
		`, campo, filtroSQL, campo), filtroArgs...)
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
	`, filtroSQL), filtroArgs...).Scan(&out.PctMuroCerca, &out.PctPerimetroFechado)
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
	`, filtroSQL), filtroArgs...)
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
	`, filtroSQL), filtroArgs...).Scan(&out.PctReformaCritica, &out.PctReformaGeralApenas, &out.PctObraParadaApenas)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_reforma_critica: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, coberturaEssenciaisCTEParam+`
		SELECT
			CASE WHEN COUNT(*) > 0
				 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE qtd_essenciais = 8) / COUNT(*), 2)
				 ELSE 0
			END::float8
		FROM por_escola
	`, f.Args()...).Scan(&out.PctCoberturaPlena)
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

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

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
	`, filtroSQL), filtroArgs...).Scan(
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
	`, filtroSQL), filtroArgs...)
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
	`, filtroSQL), filtroArgs...)
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
	`, filtroSQL), filtroArgs...)
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

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

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
		`, campo, filtroSQL, campo), filtroArgs...)
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
	`, filtroSQL), filtroArgs...)
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
	`, filtroSQL), filtroArgs...)
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
		DistOfertaRegular:      []CategoricStat{},
		DistQualidade:          []CategoricStat{},
		DistAtendeNecessidades: []CategoricStat{},
		DistCondicoesCozinha:   []CategoricStat{},
		DistPossuiRefeitorio:   []CategoricStat{},
		DistTamanhoCozinha:     []CategoricStat{},
		DistRefeitorioAdequado: []CategoricStat{},
	}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

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
		`, campo, view, filtroSQL, campo), filtroArgs...)
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
	if out.DistAtendeNecessidades, err = distQ("vw_censo_rh_merendeiras", "atende_necessidades"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_atende_necessidades: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistCondicoesCozinha, err = distQ("vw_censo_equipamentos_merenda", "condicoes_cozinha"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_condicoes_cozinha: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistPossuiRefeitorio, err = distQ("vw_censo_equipamentos_merenda", "possui_refeitorio"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_possui_refeitorio: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistTamanhoCozinha, err = distQ("vw_censo_equipamentos_merenda", "tamanho_cozinha"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_tamanho_cozinha: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistRefeitorioAdequado, err = distQ("vw_censo_equipamentos_merenda", "refeitorio_adequado"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_refeitorio_adequado: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(atende_necessidades) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_rh_merendeiras WHERE %s
	`, filtroSQL), filtroArgs...).Scan(&out.PctAtendeNecessidades)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_atende_necessidades: %v", err), http.StatusInternalServerError)
		return
	}

	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_refeitorio) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_equipamentos_merenda WHERE %s
	`, filtroSQL), filtroArgs...).Scan(&out.PctPossuiRefeitorio)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("pct_merenda: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsMerendaEquipamentos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := MerendaEquipamentos{
		DistEstados:               []EstadoEquipStat{},
		PresencaPorTipo:           []PresencaEquipamentoStat{},
		FaixasQtdTipos:            []FaixaQtdTiposEquipamentosStat{},
		EstadoConsolidado:         []EstadoConsolidadoEquipamentoStat{},
		MediaPorTipo:              []MediaEquipamentoMerendaStat{},
		CriticidadePorEquipamento: []CriticidadeEquipamentoStat{},
	}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_freezers),   0)::float8, COALESCE(AVG(qtd_freezers)   FILTER (WHERE qtd_freezers   IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_geladeiras), 0)::float8, COALESCE(AVG(qtd_geladeiras) FILTER (WHERE qtd_geladeiras IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_fogoes),     0)::float8, COALESCE(AVG(qtd_fogoes)     FILTER (WHERE qtd_fogoes     IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_fornos),     0)::float8, COALESCE(AVG(qtd_fornos)     FILTER (WHERE qtd_fornos     IS NOT NULL), 0)::float8,
			COALESCE(SUM(qtd_bebedouros), 0)::float8, COALESCE(AVG(qtd_bebedouros) FILTER (WHERE qtd_bebedouros IS NOT NULL), 0)::float8
		FROM vw_censo_equipamentos_merenda
		WHERE %s
	`, filtroSQL), filtroArgs...).Scan(
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
	`, filtroSQL, filtroSQL, filtroSQL, filtroSQL, filtroSQL), filtroArgs...)
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

	// Média por tipo — reusa as médias já calculadas (entre escolas declarantes).
	out.MediaPorTipo = []MediaEquipamentoMerendaStat{
		{Equipamento: "freezers", Media: round1(out.Freezers.Media)},
		{Equipamento: "geladeiras", Media: round1(out.Geladeiras.Media)},
		{Equipamento: "fogoes", Media: round1(out.Fogoes.Media)},
		{Equipamento: "fornos", Media: round1(out.Fornos.Media)},
		{Equipamento: "bebedouros", Media: round1(out.Bebedouros.Media)},
	}

	// Presença por tipo — % de escolas com qtd > 0 (denominador = escolas concluídas no recorte).
	presRows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, qtd_freezers, qtd_geladeiras, qtd_fogoes, qtd_fornos, qtd_bebedouros
			FROM vw_censo_equipamentos_merenda WHERE %s
		),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT t.equipamento, t.escolas,
			COALESCE(ROUND(100.0 * t.escolas / NULLIF(tot.n, 0), 1), 0)::float8
		FROM (
			SELECT 1 AS ord, 'freezers'   AS equipamento, COUNT(DISTINCT school_id) FILTER (WHERE qtd_freezers   > 0) AS escolas FROM base
			UNION ALL
			SELECT 2, 'geladeiras', COUNT(DISTINCT school_id) FILTER (WHERE qtd_geladeiras > 0) FROM base
			UNION ALL
			SELECT 3, 'fogoes',     COUNT(DISTINCT school_id) FILTER (WHERE qtd_fogoes     > 0) FROM base
			UNION ALL
			SELECT 4, 'fornos',     COUNT(DISTINCT school_id) FILTER (WHERE qtd_fornos     > 0) FROM base
			UNION ALL
			SELECT 5, 'bebedouros', COUNT(DISTINCT school_id) FILTER (WHERE qtd_bebedouros > 0) FROM base
		) t CROSS JOIN tot
		ORDER BY t.ord
	`, filtroSQL), filtroArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("presenca_por_tipo: %v", err), http.StatusInternalServerError)
		return
	}
	defer presRows.Close()
	for presRows.Next() {
		var p PresencaEquipamentoStat
		if err := presRows.Scan(&p.Equipamento, &p.Escolas, &p.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan presenca_por_tipo: %v", err), http.StatusInternalServerError)
			return
		}
		out.PresencaPorTipo = append(out.PresencaPorTipo, p)
	}
	if err := presRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter presenca_por_tipo: %v", err), http.StatusInternalServerError)
		return
	}

	// Faixas cumulativas de tipos presentes por escola (1+ / 2+ / 3+ tipos).
	var n1, n2, n3, totFaixas int
	err = db.QueryRowContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT
				(COALESCE(qtd_freezers,   0) > 0)::int +
				(COALESCE(qtd_geladeiras, 0) > 0)::int +
				(COALESCE(qtd_fogoes,     0) > 0)::int +
				(COALESCE(qtd_fornos,     0) > 0)::int +
				(COALESCE(qtd_bebedouros, 0) > 0)::int AS n_tipos
			FROM vw_censo_equipamentos_merenda WHERE %s
		)
		SELECT
			COUNT(*) FILTER (WHERE n_tipos >= 1),
			COUNT(*) FILTER (WHERE n_tipos >= 2),
			COUNT(*) FILTER (WHERE n_tipos >= 3),
			COUNT(*)
		FROM base
	`, filtroSQL), filtroArgs...).Scan(&n1, &n2, &n3, &totFaixas)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("faixas_qtd_tipos: %v", err), http.StatusInternalServerError)
		return
	}
	if totFaixas > 0 {
		pct := func(n int) float64 { return round1(100.0 * float64(n) / float64(totFaixas)) }
		out.FaixasQtdTipos = []FaixaQtdTiposEquipamentosStat{
			{Label: "1 ou mais tipos", Escolas: n1, Percentual: pct(n1)},
			{Label: "2 ou mais tipos", Escolas: n2, Percentual: pct(n2)},
			{Label: "3 ou mais tipos", Escolas: n3, Percentual: pct(n3)},
		}
	}

	// Estado consolidado (Bom / Regular / Ruim-Inoperante) + criticidade, por equipamento.
	// Denominador = escolas com estado informado para aquele equipamento.
	consRows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT equipamento,
			COUNT(*) FILTER (WHERE estado LIKE 'bom%%')                            AS bom,
			COUNT(*) FILTER (WHERE estado LIKE 'regular%%')                        AS regular,
			COUNT(*) FILTER (WHERE estado LIKE 'ruim%%' OR estado LIKE 'inoperante%%') AS ruim,
			COUNT(*)                                                              AS total
		FROM (
			SELECT 1 AS ord, 'freezers'   AS equipamento, lower(estado_freezers)   AS estado FROM vw_censo_equipamentos_merenda WHERE %s AND estado_freezers   IS NOT NULL
			UNION ALL
			SELECT 2, 'geladeiras', lower(estado_geladeiras) FROM vw_censo_equipamentos_merenda WHERE %s AND estado_geladeiras IS NOT NULL
			UNION ALL
			SELECT 3, 'fogoes',     lower(estado_fogoes)     FROM vw_censo_equipamentos_merenda WHERE %s AND estado_fogoes     IS NOT NULL
			UNION ALL
			SELECT 4, 'fornos',     lower(estado_fornos)     FROM vw_censo_equipamentos_merenda WHERE %s AND estado_fornos     IS NOT NULL
			UNION ALL
			SELECT 5, 'bebedouros', lower(estado_bebedouros) FROM vw_censo_equipamentos_merenda WHERE %s AND estado_bebedouros IS NOT NULL
		) t
		GROUP BY equipamento, ord
		ORDER BY ord
	`, filtroSQL, filtroSQL, filtroSQL, filtroSQL, filtroSQL), filtroArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("estado_consolidado: %v", err), http.StatusInternalServerError)
		return
	}
	defer consRows.Close()
	for consRows.Next() {
		var equip string
		var bom, regular, ruim, total int
		if err := consRows.Scan(&equip, &bom, &regular, &ruim, &total); err != nil {
			app.errorJSON(w, fmt.Errorf("scan estado_consolidado: %v", err), http.StatusInternalServerError)
			return
		}
		if total == 0 {
			continue
		}
		pct := func(n int) float64 { return round1(100.0 * float64(n) / float64(total)) }
		out.EstadoConsolidado = append(out.EstadoConsolidado,
			EstadoConsolidadoEquipamentoStat{Equipamento: equip, Estado: "Bom", Escolas: bom, Percentual: pct(bom)},
			EstadoConsolidadoEquipamentoStat{Equipamento: equip, Estado: "Regular", Escolas: regular, Percentual: pct(regular)},
			EstadoConsolidadoEquipamentoStat{Equipamento: equip, Estado: "Ruim/Inoperante", Escolas: ruim, Percentual: pct(ruim)},
		)
		out.CriticidadePorEquipamento = append(out.CriticidadePorEquipamento,
			CriticidadeEquipamentoStat{Equipamento: equip, EscolasCriticas: ruim, Percentual: pct(ruim)},
		)
	}
	if err := consRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter estado_consolidado: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsMerendaRH(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := MerendaRH{TopEmpresas: []EmpresaStat{}}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_merendeiras_estatutaria),  0)::float8,
			COALESCE(SUM(qtd_merendeiras_terceirizada), 0)::float8,
			COALESCE(SUM(qtd_merendeiras_temporaria),   0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_supervisor_merenda) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_rh_merendeiras
		WHERE %s
	`, filtroSQL), filtroArgs...).Scan(
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
	`, filtroSQL), filtroArgs...)
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

func (app *application) AdminAnalyticsMerendaCondicoesSanitarias(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := MerendaCondicoesSanitarias{
		DistDespensaExclusiva:  []CategoricStat{},
		DistDepositoConserva:   []CategoricStat{},
		PresencaItensBasicos:   []MerendaItemBasicoStat{},
		DistEstoqueEpiExtintor: []CategoricStat{},
		DistManutencaoExtintor: []CategoricStat{},
	}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

	// Distribuições categóricas — denominador = escolas com valor informado no campo.
	distQ := func(campo string) ([]CategoricStat, error) {
		rows, err := db.QueryContext(ctx, fmt.Sprintf(`
			WITH base AS (
				SELECT school_id, %s AS val
				FROM vw_censo_equipamentos_merenda
				WHERE %s AND %s IS NOT NULL
			),
			tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
			SELECT val,
				COUNT(DISTINCT school_id) AS escolas,
				ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
			FROM base CROSS JOIN tot
			GROUP BY val, tot.n
			ORDER BY escolas DESC
		`, campo, filtroSQL, campo), filtroArgs...)
		if err != nil {
			return nil, err
		}
		return app.scanCategoricRows(rows)
	}

	var err error
	if out.DistDespensaExclusiva, err = distQ("despensa_exclusiva"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_despensa_exclusiva: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistDepositoConserva, err = distQ("deposito_conserva"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_deposito_conserva: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistEstoqueEpiExtintor, err = distQ("estoque_epi_extintor"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_estoque_epi_extintor: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistManutencaoExtintor, err = distQ("manutencao_extintores"); err != nil {
		app.errorJSON(w, fmt.Errorf("dist_manutencao_extintores: %v", err), http.StatusInternalServerError)
		return
	}

	// Presença de itens básicos — % sobre total de escolas concluídas no recorte.
	// "positivo" cobre defensivamente os padrões textuais usados no banco
	// (sim / possui / verdadeiro / true), sem inventar dados.
	positivo := func(col string) string {
		return fmt.Sprintf("(lower(%[1]s) LIKE 'sim%%' OR lower(%[1]s) LIKE 'possui%%' OR lower(%[1]s) IN ('true', 'verdadeiro', 't', '1'))", col)
	}
	presRows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT despensa_exclusiva, sistema_exaustao, bancadas_inox
			FROM vw_censo_equipamentos_merenda
			WHERE %s
		),
		tot AS (SELECT COUNT(*)::numeric AS n FROM base)
		SELECT t.item, t.escolas,
			COALESCE(ROUND(100.0 * t.escolas / NULLIF(tot.n, 0), 1), 0)::float8
		FROM (
			SELECT 1 AS ord, 'Despensa exclusiva'   AS item, COUNT(*) FILTER (WHERE %s) AS escolas FROM base
			UNION ALL
			SELECT 2, 'Sistema de exaustão', COUNT(*) FILTER (WHERE %s) FROM base
			UNION ALL
			SELECT 3, 'Bancadas de inox',    COUNT(*) FILTER (WHERE %s) FROM base
		) t CROSS JOIN tot
		ORDER BY t.ord
	`, filtroSQL, positivo("despensa_exclusiva"), positivo("sistema_exaustao"), positivo("bancadas_inox")), filtroArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("presenca_itens_basicos: %v", err), http.StatusInternalServerError)
		return
	}
	defer presRows.Close()
	for presRows.Next() {
		var p MerendaItemBasicoStat
		if err := presRows.Scan(&p.Item, &p.Escolas, &p.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("scan presenca_itens_basicos: %v", err), http.StatusInternalServerError)
			return
		}
		out.PresencaItensBasicos = append(out.PresencaItensBasicos, p)
	}
	if err := presRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter presenca_itens_basicos: %v", err), http.StatusInternalServerError)
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

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

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
	`, filtroSQL, filtroSQL, filtroSQL, filtroSQL), filtroArgs...)
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
	`, filtroSQL), filtroArgs...)
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

	out := ServicosGerais{TopEmpresas: []EmpresaStat{}}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

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
	`, filtroSQL), filtroArgs...).Scan(
		&out.TotalEfetivo,
		&out.TotalTemporario,
		&out.TotalTerceirizado,
		&out.MediaTotalPorEscola,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("servicos_gerais: %v", err), http.StatusInternalServerError)
		return
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT empresa_terceirizada_sg AS empresa, COUNT(DISTINCT school_id) AS escolas
		FROM vw_censo_servicos_terceirizados
		WHERE %s
			AND empresa_terceirizada_sg IS NOT NULL
			AND TRIM(empresa_terceirizada_sg::text) <> ''
		GROUP BY empresa_terceirizada_sg
		ORDER BY escolas DESC
		LIMIT 10
	`, filtroSQL), filtroArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("top_empresas_servicos_gerais: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var e EmpresaStat
		if err := rows.Scan(&e.Empresa, &e.Escolas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan empresas_servicos_gerais: %v", err), http.StatusInternalServerError)
			return
		}
		out.TopEmpresas = append(out.TopEmpresas, e)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter empresas_servicos_gerais: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) AdminAnalyticsServicosPortaria(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := ServicosPortaria{TopEmpresas: []EmpresaStat{}}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE qtd_agentes_portaria > 0) / NULLIF(COUNT(*), 0), 1), 0)::float8,
			COALESCE(AVG(qtd_agentes_portaria) FILTER (WHERE qtd_agentes_portaria IS NOT NULL), 0)::float8
		FROM vw_censo_servicos_terceirizados
		WHERE %s
	`, filtroSQL), filtroArgs...).Scan(&out.PctComAgentes, &out.MediaAgentesPorEscola)
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
	`, filtroSQL), filtroArgs...)
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

func (app *application) AdminAnalyticsServicosManipuladoresAlimentos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := ServicosManipuladoresAlimentos{
		DistVinculo:           []CategoricStat{},
		DistAtendeNecessidade: []CategoricStat{},
		TopEmpresas:           []EmpresaStat{},
	}

	f := parseAnalyticsFilters(r)
	filtroSQL := f.WhereSQL()
	filtroArgs := f.Args()

	err := db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(qtd_merendeiras_estatutaria),  0)::float8,
			COALESCE(SUM(qtd_merendeiras_terceirizada), 0)::float8,
			COALESCE(SUM(qtd_merendeiras_temporaria),   0)::float8,
			COALESCE(SUM(
				COALESCE(qtd_merendeiras_estatutaria,  0) +
				COALESCE(qtd_merendeiras_terceirizada, 0) +
				COALESCE(qtd_merendeiras_temporaria,   0)
			), 0)::float8,
			COALESCE(AVG(
				COALESCE(qtd_merendeiras_estatutaria,  0) +
				COALESCE(qtd_merendeiras_terceirizada, 0) +
				COALESCE(qtd_merendeiras_temporaria,   0)
			), 0)::float8,
			COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE lower(possui_supervisor_merenda) = 'sim') / NULLIF(COUNT(*), 0), 1), 0)::float8
		FROM vw_censo_rh_merendeiras
		WHERE %s
	`, filtroSQL), filtroArgs...).Scan(
		&out.TotalEstatutaria,
		&out.TotalTerceirizada,
		&out.TotalTemporaria,
		&out.TotalGeral,
		&out.MediaPorEscola,
		&out.PctComSupervisor,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("manipuladores_alimentos_totais: %v", err), http.StatusInternalServerError)
		return
	}

	// dist_vinculo representa a composição percentual dos quantitativos somados
	// por vínculo, não uma contagem de escolas.
	if out.TotalGeral > 0 {
		out.DistVinculo = []CategoricStat{
			{
				Valor:      "Estatutária",
				Escolas:    int(math.Round(out.TotalEstatutaria)),
				Percentual: round1(100.0 * out.TotalEstatutaria / out.TotalGeral),
			},
			{
				Valor:      "Terceirizada",
				Escolas:    int(math.Round(out.TotalTerceirizada)),
				Percentual: round1(100.0 * out.TotalTerceirizada / out.TotalGeral),
			},
			{
				Valor:      "Temporária",
				Escolas:    int(math.Round(out.TotalTemporaria)),
				Percentual: round1(100.0 * out.TotalTemporaria / out.TotalGeral),
			},
		}
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`
		WITH base AS (
			SELECT school_id, atende_necessidades AS val
			FROM vw_censo_rh_merendeiras
			WHERE %s AND atende_necessidades IS NOT NULL
		),
		tot AS (SELECT COUNT(DISTINCT school_id)::numeric AS n FROM base)
		SELECT val,
			COUNT(DISTINCT school_id) AS escolas,
			ROUND(100.0 * COUNT(DISTINCT school_id) / NULLIF(tot.n, 0), 1)::float8
		FROM base CROSS JOIN tot
		GROUP BY val, tot.n
		ORDER BY escolas DESC
	`, filtroSQL), filtroArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("dist_atende_necessidade_manipuladores: %v", err), http.StatusInternalServerError)
		return
	}
	if out.DistAtendeNecessidade, err = app.scanCategoricRows(rows); err != nil {
		app.errorJSON(w, fmt.Errorf("scan dist_atende_necessidade_manipuladores: %v", err), http.StatusInternalServerError)
		return
	}

	rows2, err := db.QueryContext(ctx, fmt.Sprintf(`
		SELECT empresa_terceirizada_merenda AS empresa, COUNT(DISTINCT school_id) AS escolas
		FROM vw_censo_rh_merendeiras
		WHERE %s AND empresa_terceirizada_merenda IS NOT NULL
		GROUP BY empresa
		ORDER BY escolas DESC
		LIMIT 10
	`, filtroSQL), filtroArgs...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("top_empresas_manipuladores: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows2.Close()
	for rows2.Next() {
		var e EmpresaStat
		if err := rows2.Scan(&e.Empresa, &e.Escolas); err != nil {
			app.errorJSON(w, fmt.Errorf("scan empresas_manipuladores: %v", err), http.StatusInternalServerError)
			return
		}
		out.TopEmpresas = append(out.TopEmpresas, e)
	}
	if err := rows2.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iter empresas_manipuladores: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// =========================================================================
// Tabelas escola-a-escola — Infraestrutura, Merenda, Serviços Terceirizados
// =========================================================================

// InfraEscolaRow é uma linha da tabela escola-a-escola de Infraestrutura e Segurança.
type InfraEscolaRow struct {
	CodigoINEP           string `json:"codigo_inep"`
	NomeEscola           string `json:"nome_escola"`
	DRE                  string `json:"dre"`
	Municipio            string `json:"municipio"`
	Zona                 string `json:"zona"`
	RegiaoIntegracao     string `json:"regiao_integracao"`
	HasCenso             bool   `json:"has_censo"`
	TipoPredio           string `json:"tipo_predio"`
	SituacaoEstrutura    string `json:"situacao_estrutura"`
	Energia              string `json:"energia"`
	RedeEletricaAtende   string `json:"rede_eletrica_atende"`
	PossuiGuarita        string `json:"possui_guarita"`
	CamerasFuncionamento string `json:"cameras_funcionamento"`
	PossuiBotaoPanico    string `json:"possui_botao_panico"`
	MuroCerca            string `json:"muro_cerca"`
	PlanoEvacuacao       string `json:"plano_evacuacao"`
	StatusOperacional    string `json:"status_operacional"`
}

// InfraEscolasPayload é o envelope de resposta de GET /admin/analytics/infraestrutura/escolas.
type InfraEscolasPayload struct {
	TotalEscolas  int              `json:"total_escolas"`
	TotalFiltrado int              `json:"total_filtrado"`
	Page          int              `json:"page"`
	PageSize      int              `json:"page_size"`
	TotalPages    int              `json:"total_pages"`
	AnoReferencia int              `json:"ano_referencia"`
	Escolas       []InfraEscolaRow `json:"escolas"`
}

var infraEscolasValidSort = map[string]bool{
	"escola": true, "dre": true, "municipio": true, "zona": true,
	"tipo_predio": true, "situacao_estrutura": true, "energia": true, "status": true,
}

func infraEscolaSortVal(r InfraEscolaRow, key string) string {
	switch key {
	case "dre":
		return r.DRE
	case "municipio":
		return r.Municipio
	case "zona":
		return r.Zona
	case "tipo_predio":
		return r.TipoPredio
	case "situacao_estrutura":
		return r.SituacaoEstrutura
	case "energia":
		return r.Energia
	case "status":
		return r.StatusOperacional
	default:
		return r.NomeEscola
	}
}

// AdminAnalyticsInfraEscolas retorna a listagem escola-a-escola de infraestrutura e
// segurança com busca textual, ordenação e paginação server-side.
// Parâmetros: year, dre, municipio, zona, regiao_integracao, q, page, page_size, sort, direction.
func (app *application) AdminAnalyticsInfraEscolas(w http.ResponseWriter, r *http.Request) {
	f := parseAnalyticsFilters(r)
	q := r.URL.Query()
	search := strings.ToUpper(strings.TrimSpace(q.Get("q")))
	pageSize := parseEscolasPageSize(q.Get("page_size"))
	page := parseEscolasPage(q.Get("page"))
	sortKey := q.Get("sort")
	if !infraEscolasValidSort[sortKey] {
		sortKey = "escola"
	}
	direction := parseEscolasDirection(q.Get("direction"))

	ctx := r.Context()
	dbRows, err := app.models.Schools.DB.QueryContext(ctx, infraestruturaSelectSQL,
		f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("infra escolas: %w", err), http.StatusInternalServerError)
		return
	}
	defer dbRows.Close()

	all := make([]InfraEscolaRow, 0)
	for dbRows.Next() {
		var rr infraReportRow
		if err := dbRows.Scan(
			&rr.Regiao, &rr.DRE, &rr.Municipio, &rr.Zona, &rr.INEP, &rr.Escola,
			&rr.HasCensus,
			&rr.TipoPredio, &rr.SituacaoEstrutura, &rr.RedeEletricaAtende, &rr.SuportaNovosEquip,
			&rr.Energia, &rr.EstruturaClimatizacao, &rr.SalasClimatizadas, &rr.QtdSalasAula,
			&rr.PossuiGuarita, &rr.BotaoPanico, &rr.Cameras, &rr.ControlePortao,
			&rr.IluminacaoExterna, &rr.MuroCerca, &rr.PlanoEvacuacao, &rr.PoliticaBullying,
		); err != nil {
			app.errorJSON(w, fmt.Errorf("ler infra escola: %w", err), http.StatusInternalServerError)
			return
		}
		all = append(all, InfraEscolaRow{
			CodigoINEP:           rr.INEP,
			NomeEscola:           rr.Escola,
			DRE:                  rr.DRE,
			Municipio:            rr.Municipio,
			Zona:                 rr.Zona,
			RegiaoIntegracao:     rr.Regiao,
			HasCenso:             rr.HasCensus,
			TipoPredio:           rr.TipoPredio,
			SituacaoEstrutura:    rr.SituacaoEstrutura,
			Energia:              rr.Energia,
			RedeEletricaAtende:   rr.RedeEletricaAtende,
			PossuiGuarita:        rr.PossuiGuarita,
			CamerasFuncionamento: rr.Cameras,
			PossuiBotaoPanico:    rr.BotaoPanico,
			MuroCerca:            rr.MuroCerca,
			PlanoEvacuacao:       rr.PlanoEvacuacao,
			StatusOperacional:    classifyInfraStatus(rr),
		})
	}
	if err := dbRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar infra escolas: %w", err), http.StatusInternalServerError)
		return
	}

	totalEscolas := len(all)
	var filtered []InfraEscolaRow
	if search == "" {
		filtered = all
	} else {
		filtered = make([]InfraEscolaRow, 0, len(all))
		for _, e := range all {
			if strings.Contains(strings.ToUpper(e.NomeEscola), search) || strings.Contains(e.CodigoINEP, search) {
				filtered = append(filtered, e)
			}
		}
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		vi := strings.ToUpper(infraEscolaSortVal(filtered[i], sortKey))
		vj := strings.ToUpper(infraEscolaSortVal(filtered[j], sortKey))
		if direction == "desc" {
			return vi > vj
		}
		return vi < vj
	})

	totalFiltrado := len(filtered)
	totalPages := 1
	if totalFiltrado > 0 {
		totalPages = (totalFiltrado + pageSize - 1) / pageSize
	}
	if page > totalPages {
		page = totalPages
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * pageSize
	end := offset + pageSize
	if end > totalFiltrado {
		end = totalFiltrado
	}
	pageSlice := []InfraEscolaRow{}
	if totalFiltrado > 0 {
		pageSlice = filtered[offset:end]
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: InfraEscolasPayload{
		TotalEscolas:  totalEscolas,
		TotalFiltrado: totalFiltrado,
		Page:          page,
		PageSize:      pageSize,
		TotalPages:    totalPages,
		AnoReferencia: f.Year,
		Escolas:       pageSlice,
	}})
}

// ----- Merenda Escolar -------------------------------------------------------

// MerendaEscolaRow é uma linha da tabela escola-a-escola de Merenda Escolar.
type MerendaEscolaRow struct {
	CodigoINEP                 string `json:"codigo_inep"`
	NomeEscola                 string `json:"nome_escola"`
	DRE                        string `json:"dre"`
	Municipio                  string `json:"municipio"`
	Zona                       string `json:"zona"`
	RegiaoIntegracao           string `json:"regiao_integracao"`
	HasCenso                   bool   `json:"has_censo"`
	OfertaRegular              string `json:"oferta_regular"`
	QualidadeMerenda           string `json:"qualidade_merenda"`
	PossuiRefeitorio           string `json:"possui_refeitorio"`
	CondicoesCozinha           string `json:"condicoes_cozinha"`
	QtdFreezers                string `json:"qtd_freezers"`
	QtdGeladeiras              string `json:"qtd_geladeiras"`
	QtdFogoes                  string `json:"qtd_fogoes"`
	QtdFornos                  string `json:"qtd_fornos"`
	EmpresaTerceirizadaMerenda string `json:"empresa_terceirizada_merenda"`
}

// MerendaEscolasPayload é o envelope de resposta de GET /admin/analytics/merenda/escolas.
type MerendaEscolasPayload struct {
	TotalEscolas  int                `json:"total_escolas"`
	TotalFiltrado int                `json:"total_filtrado"`
	Page          int                `json:"page"`
	PageSize      int                `json:"page_size"`
	TotalPages    int                `json:"total_pages"`
	AnoReferencia int                `json:"ano_referencia"`
	Escolas       []MerendaEscolaRow `json:"escolas"`
}

const merendaEscolasSelectSQL = `
	SELECT
		COALESCE(ri.regiao_de_integracao, '')                            AS regiao_integracao,
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')              AS dre,
		COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado')        AS municipio,
		COALESCE(NULLIF(TRIM(s.zona), ''), '')                          AS zona,
		COALESCE(s.codigo_inep, '')                                     AS codigo_inep,
		COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome')           AS nome_escola,
		(cr.id IS NOT NULL)                                             AS has_censo,
		COALESCE(NULLIF(cr.data->>'oferta_regular', ''), '')            AS oferta_regular,
		COALESCE(NULLIF(cr.data->>'qualidade_merenda', ''), '')         AS qualidade_merenda,
		COALESCE(NULLIF(cr.data->>'possui_refeitorio', ''), '')         AS possui_refeitorio,
		COALESCE(NULLIF(cr.data->>'condicoes_cozinha', ''), '')         AS condicoes_cozinha,
		COALESCE(cr.data->>'qtd_freezers', '')                          AS qtd_freezers,
		COALESCE(cr.data->>'qtd_geladeiras', '')                        AS qtd_geladeiras,
		COALESCE(cr.data->>'qtd_fogoes', '')                            AS qtd_fogoes,
		COALESCE(cr.data->>'qtd_fornos', '')                            AS qtd_fornos,
		COALESCE(NULLIF(cr.data->>'empresa_terceirizada_merenda', ''), '') AS empresa_terceirizada_merenda
	FROM schools s
	LEFT JOIN census_responses cr
		ON cr.school_id = s.id AND cr.year = $1 AND cr.status = 'completed'
	LEFT JOIN reg_integracao ri ON UPPER(TRIM(ri.municipio)) = UPPER(TRIM(s.municipio))
	WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))
	ORDER BY UPPER(TRIM(s.dre)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep
`

var merendaEscolasValidSort = map[string]bool{
	"escola": true, "dre": true, "municipio": true, "zona": true,
	"oferta_regular": true, "qualidade_merenda": true, "possui_refeitorio": true,
}

func merendaEscolaSortVal(r MerendaEscolaRow, key string) string {
	switch key {
	case "dre":
		return r.DRE
	case "municipio":
		return r.Municipio
	case "zona":
		return r.Zona
	case "oferta_regular":
		return r.OfertaRegular
	case "qualidade_merenda":
		return r.QualidadeMerenda
	case "possui_refeitorio":
		return r.PossuiRefeitorio
	default:
		return r.NomeEscola
	}
}

// AdminAnalyticsMerendaEscolas retorna a listagem escola-a-escola de Merenda Escolar.
func (app *application) AdminAnalyticsMerendaEscolas(w http.ResponseWriter, r *http.Request) {
	f := parseAnalyticsFilters(r)
	q := r.URL.Query()
	search := strings.ToUpper(strings.TrimSpace(q.Get("q")))
	pageSize := parseEscolasPageSize(q.Get("page_size"))
	page := parseEscolasPage(q.Get("page"))
	sortKey := q.Get("sort")
	if !merendaEscolasValidSort[sortKey] {
		sortKey = "escola"
	}
	direction := parseEscolasDirection(q.Get("direction"))

	ctx := r.Context()
	dbRows, err := app.models.Schools.DB.QueryContext(ctx, merendaEscolasSelectSQL,
		f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("merenda escolas: %w", err), http.StatusInternalServerError)
		return
	}
	defer dbRows.Close()

	all := make([]MerendaEscolaRow, 0)
	for dbRows.Next() {
		var e MerendaEscolaRow
		if err := dbRows.Scan(
			&e.RegiaoIntegracao, &e.DRE, &e.Municipio, &e.Zona, &e.CodigoINEP, &e.NomeEscola,
			&e.HasCenso,
			&e.OfertaRegular, &e.QualidadeMerenda, &e.PossuiRefeitorio, &e.CondicoesCozinha,
			&e.QtdFreezers, &e.QtdGeladeiras, &e.QtdFogoes, &e.QtdFornos,
			&e.EmpresaTerceirizadaMerenda,
		); err != nil {
			app.errorJSON(w, fmt.Errorf("ler merenda escola: %w", err), http.StatusInternalServerError)
			return
		}
		all = append(all, e)
	}
	if err := dbRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar merenda escolas: %w", err), http.StatusInternalServerError)
		return
	}

	totalEscolas := len(all)
	var filtered []MerendaEscolaRow
	if search == "" {
		filtered = all
	} else {
		filtered = make([]MerendaEscolaRow, 0, len(all))
		for _, e := range all {
			if strings.Contains(strings.ToUpper(e.NomeEscola), search) || strings.Contains(e.CodigoINEP, search) {
				filtered = append(filtered, e)
			}
		}
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		vi := strings.ToUpper(merendaEscolaSortVal(filtered[i], sortKey))
		vj := strings.ToUpper(merendaEscolaSortVal(filtered[j], sortKey))
		if direction == "desc" {
			return vi > vj
		}
		return vi < vj
	})

	totalFiltrado := len(filtered)
	totalPages := 1
	if totalFiltrado > 0 {
		totalPages = (totalFiltrado + pageSize - 1) / pageSize
	}
	if page > totalPages {
		page = totalPages
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * pageSize
	end := offset + pageSize
	if end > totalFiltrado {
		end = totalFiltrado
	}
	pageSlice := []MerendaEscolaRow{}
	if totalFiltrado > 0 {
		pageSlice = filtered[offset:end]
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: MerendaEscolasPayload{
		TotalEscolas:  totalEscolas,
		TotalFiltrado: totalFiltrado,
		Page:          page,
		PageSize:      pageSize,
		TotalPages:    totalPages,
		AnoReferencia: f.Year,
		Escolas:       pageSlice,
	}})
}

// ----- Serviços Terceirizados ------------------------------------------------

// ServicosEscolaRow é uma linha da tabela escola-a-escola de Serviços Terceirizados.
type ServicosEscolaRow struct {
	CodigoINEP                  string `json:"codigo_inep"`
	NomeEscola                  string `json:"nome_escola"`
	DRE                         string `json:"dre"`
	Municipio                   string `json:"municipio"`
	Zona                        string `json:"zona"`
	RegiaoIntegracao            string `json:"regiao_integracao"`
	HasCenso                    bool   `json:"has_censo"`
	EmpresaTerceirizadaPortaria string `json:"empresa_terceirizada_portaria"`
	QtdAgentesPortaria          string `json:"qtd_agentes_portaria"`
	EmpresaTerceirizadaSG       string `json:"empresa_terceirizada_sg"`
	EmpresaTerceirizadaMerenda  string `json:"empresa_terceirizada_merenda"`
	AvaliacaoPortaria           string `json:"avaliacao_portaria"`
	AvaliacaoLimpeza            string `json:"avaliacao_limpeza"`
}

// ServicosEscolasPayload é o envelope de resposta de GET /admin/analytics/servicos-terceirizados/escolas.
type ServicosEscolasPayload struct {
	TotalEscolas  int                 `json:"total_escolas"`
	TotalFiltrado int                 `json:"total_filtrado"`
	Page          int                 `json:"page"`
	PageSize      int                 `json:"page_size"`
	TotalPages    int                 `json:"total_pages"`
	AnoReferencia int                 `json:"ano_referencia"`
	Escolas       []ServicosEscolaRow `json:"escolas"`
}

const servicosEscolasSelectSQL = `
	SELECT
		COALESCE(ri.regiao_de_integracao, '')                                 AS regiao_integracao,
		COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado')                   AS dre,
		COALESCE(NULLIF(TRIM(s.municipio), ''), 'Não informado')              AS municipio,
		COALESCE(NULLIF(TRIM(s.zona), ''), '')                                AS zona,
		COALESCE(s.codigo_inep, '')                                           AS codigo_inep,
		COALESCE(NULLIF(TRIM(s.nome_escola), ''), 'Sem nome')                 AS nome_escola,
		(cr.id IS NOT NULL)                                                   AS has_censo,
		COALESCE(NULLIF(cr.data->>'empresa_terceirizada_portaria', ''), '')   AS empresa_terceirizada_portaria,
		COALESCE(cr.data->>'qtd_agentes_portaria', '')                        AS qtd_agentes_portaria,
		COALESCE(NULLIF(cr.data->>'empresa_terceirizada_sg', ''), '')         AS empresa_terceirizada_sg,
		COALESCE(NULLIF(cr.data->>'empresa_terceirizada_merenda', ''), '')    AS empresa_terceirizada_merenda,
		COALESCE(NULLIF(cr.data->>'avaliacao_portaria', ''), '')              AS avaliacao_portaria,
		COALESCE(NULLIF(cr.data->>'avaliacao_limpeza', ''), '')               AS avaliacao_limpeza
	FROM schools s
	LEFT JOIN census_responses cr
		ON cr.school_id = s.id AND cr.year = $1 AND cr.status = 'completed'
	LEFT JOIN reg_integracao ri ON UPPER(TRIM(ri.municipio)) = UPPER(TRIM(s.municipio))
	WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio))
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))
	ORDER BY UPPER(TRIM(s.dre)), UPPER(TRIM(s.municipio)), UPPER(TRIM(s.nome_escola)), s.codigo_inep
`

var servicosEscolasValidSort = map[string]bool{
	"escola": true, "dre": true, "municipio": true, "zona": true,
	"empresa_portaria": true, "empresa_sg": true, "empresa_merenda": true,
}

func servicosEscolaSortVal(r ServicosEscolaRow, key string) string {
	switch key {
	case "dre":
		return r.DRE
	case "municipio":
		return r.Municipio
	case "zona":
		return r.Zona
	case "empresa_portaria":
		return r.EmpresaTerceirizadaPortaria
	case "empresa_sg":
		return r.EmpresaTerceirizadaSG
	case "empresa_merenda":
		return r.EmpresaTerceirizadaMerenda
	default:
		return r.NomeEscola
	}
}

// AdminAnalyticsServicosTerceirizadosEscolas retorna a listagem escola-a-escola
// de Serviços Terceirizados.
func (app *application) AdminAnalyticsServicosTerceirizadosEscolas(w http.ResponseWriter, r *http.Request) {
	f := parseAnalyticsFilters(r)
	q := r.URL.Query()
	search := strings.ToUpper(strings.TrimSpace(q.Get("q")))
	pageSize := parseEscolasPageSize(q.Get("page_size"))
	page := parseEscolasPage(q.Get("page"))
	sortKey := q.Get("sort")
	if !servicosEscolasValidSort[sortKey] {
		sortKey = "escola"
	}
	direction := parseEscolasDirection(q.Get("direction"))

	ctx := r.Context()
	dbRows, err := app.models.Schools.DB.QueryContext(ctx, servicosEscolasSelectSQL,
		f.Year, f.DRE, f.Municipio, f.Zona, f.RegiaoIntegracao)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("servicos escolas: %w", err), http.StatusInternalServerError)
		return
	}
	defer dbRows.Close()

	all := make([]ServicosEscolaRow, 0)
	for dbRows.Next() {
		var e ServicosEscolaRow
		if err := dbRows.Scan(
			&e.RegiaoIntegracao, &e.DRE, &e.Municipio, &e.Zona, &e.CodigoINEP, &e.NomeEscola,
			&e.HasCenso,
			&e.EmpresaTerceirizadaPortaria, &e.QtdAgentesPortaria,
			&e.EmpresaTerceirizadaSG, &e.EmpresaTerceirizadaMerenda,
			&e.AvaliacaoPortaria, &e.AvaliacaoLimpeza,
		); err != nil {
			app.errorJSON(w, fmt.Errorf("ler servicos escola: %w", err), http.StatusInternalServerError)
			return
		}
		all = append(all, e)
	}
	if err := dbRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar servicos escolas: %w", err), http.StatusInternalServerError)
		return
	}

	totalEscolas := len(all)
	var filtered []ServicosEscolaRow
	if search == "" {
		filtered = all
	} else {
		filtered = make([]ServicosEscolaRow, 0, len(all))
		for _, e := range all {
			if strings.Contains(strings.ToUpper(e.NomeEscola), search) || strings.Contains(e.CodigoINEP, search) {
				filtered = append(filtered, e)
			}
		}
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		vi := strings.ToUpper(servicosEscolaSortVal(filtered[i], sortKey))
		vj := strings.ToUpper(servicosEscolaSortVal(filtered[j], sortKey))
		if direction == "desc" {
			return vi > vj
		}
		return vi < vj
	})

	totalFiltrado := len(filtered)
	totalPages := 1
	if totalFiltrado > 0 {
		totalPages = (totalFiltrado + pageSize - 1) / pageSize
	}
	if page > totalPages {
		page = totalPages
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * pageSize
	end := offset + pageSize
	if end > totalFiltrado {
		end = totalFiltrado
	}
	pageSlice := []ServicosEscolaRow{}
	if totalFiltrado > 0 {
		pageSlice = filtered[offset:end]
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: ServicosEscolasPayload{
		TotalEscolas:  totalEscolas,
		TotalFiltrado: totalFiltrado,
		Page:          page,
		PageSize:      pageSize,
		TotalPages:    totalPages,
		AnoReferencia: f.Year,
		Escolas:       pageSlice,
	}})
}
