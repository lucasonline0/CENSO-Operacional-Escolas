package main

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// =========================================================================
// Perfil dos Alunos e Resultados — IDEB 2023 (IDEB-04)
//
// Endpoint analítico que lê EXCLUSIVAMENTE a tabela ideb_resultados (carga
// IDEB-03B) e devolve agregações para o bloco "Resultados e Desempenho" da aba
// "Perfil dos Alunos e Resultados":
//   GET /v1/admin/analytics/perfil-alunos-resultados/ideb
//
// Caminho sob o prefixo /v1/admin/analytics/* (CLAUDE.md), protegido por JWT no
// grupo `protected` de main.go.
//
// Regras metodológicas (docs/dashboard/perfil-alunos-resultados-ideb-2023.md):
//   * IDEB ausente é NULL, NUNCA zero — ausência é cobertura/elegibilidade.
//   * `sem_ideb_divulgado` não é desempenho ruim.
//   * Não há ranking geral misturando etapas: todo ranking é particionado por
//     etapa (top-N por etapa) e respeita o filtro de etapa quando presente.
//   * Média simples: AVG(ideb) apenas com ideb IS NOT NULL.
//   * Média ponderada: SUM(ideb * total_avaliado) / SUM(total_avaliado), apenas
//     com ideb IS NOT NULL e total_avaliado > 0.
//   * Agregações por DRE/município são cálculo do dashboard, NÃO IDEB oficial
//     agregado do INEP.
//   * percentual_avaliado > 100 é preservado e exposto em `qualidade`.
//   * NÃO usa census_responses.data nem /v1/admin/indicadores-metrics.
//   * Filtros territoriais (dre/municipio/zona/regiao_integracao) só funcionam
//     via LEFT JOIN schools; quando aplicados, registros sem school_id ficam
//     naturalmente fora do recorte. Sem filtro territorial, sem_match_inep é
//     mantido.
// =========================================================================

const (
	idebFonteMetodologica   = "https://download.inep.gov.br/ideb/nota_informativa_ideb_2023.pdf"
	idebFonteArquivoPadrao  = "ideb_2023_iniciais_finais_medio.xlsx"
	idebGrao                = "INEP × etapa × ano"
	idebFaixaSemIdeb        = "Sem IDEB divulgado"
	idebRankingLimitDefault = 10
)

// Domínios válidos dos filtros enumerados (validação 400 em valor inválido).
var (
	idebEtapasValidas = map[string]bool{
		"anos_iniciais": true,
		"anos_finais":   true,
		"ensino_medio":  true,
	}
	idebStatusValidos = map[string]bool{
		"com_ideb":           true,
		"sem_ideb_divulgado": true,
	}
	idebDetalheValidos = map[string]bool{
		"sem_resultado":   true,
		"nd_proficiencia": true,
		"outro":           true,
	}
	idebVinculoValidos = map[string]bool{
		"match_inep":         true,
		"sem_match_inep":     true,
		"conflito_nome":      true,
		"pendente_validacao": true,
	}
)

// Ordem canônica usada na saída (etapas e faixas).
var (
	idebEtapasOrdem = []string{"anos_iniciais", "anos_finais", "ensino_medio"}
	idebFaixasOrdem = []string{
		"Abaixo de 3,0",
		"3,0 a 3,9",
		"4,0 a 4,9",
		"5,0 a 5,9",
		"6,0 a 6,9",
		"7,0+",
		idebFaixaSemIdeb,
	}
)

// idebFilters reúne os filtros opcionais do endpoint. Ano default = 2023; strings
// vazias significam "filtro desativado"; SomenteComIdeb=false significa "todos".
type idebFilters struct {
	Ano               int
	Etapa             string
	DRE               string
	Municipio         string
	Zona              string
	RegiaoIntegracao  string
	StatusIdeb        string
	DetalheStatusIdeb string
	StatusVinculo     string
	SomenteComIdeb    bool
}

// args devolve os argumentos posicionais na ordem esperada por idebFromWhere
// ($1..$10).
func (f idebFilters) args() []any {
	return []any{
		f.Ano,               // $1
		f.Etapa,             // $2
		f.DRE,               // $3
		f.Municipio,         // $4
		f.Zona,              // $5
		f.RegiaoIntegracao,  // $6
		f.StatusIdeb,        // $7
		f.DetalheStatusIdeb, // $8
		f.StatusVinculo,     // $9
		f.SomenteComIdeb,    // $10
	}
}

// parseIdebFilters lê e VALIDA os filtros da query string. Valores fora do
// domínio enumerado resultam em erro (HTTP 400). Ano default = 2023.
func parseIdebFilters(q url.Values) (idebFilters, error) {
	f := idebFilters{Ano: 2023}

	if s := strings.TrimSpace(q.Get("ano")); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n <= 0 {
			return f, fmt.Errorf("ano inválido: %q", s)
		}
		f.Ano = n
	}

	f.Etapa = strings.TrimSpace(q.Get("etapa"))
	if f.Etapa != "" && !idebEtapasValidas[f.Etapa] {
		return f, fmt.Errorf("etapa inválida: %q", f.Etapa)
	}

	f.DRE = strings.TrimSpace(q.Get("dre"))
	f.Municipio = strings.TrimSpace(q.Get("municipio"))
	f.Zona = strings.TrimSpace(q.Get("zona"))
	f.RegiaoIntegracao = strings.TrimSpace(q.Get("regiao_integracao"))

	f.StatusIdeb = strings.TrimSpace(q.Get("status_ideb"))
	if f.StatusIdeb != "" && !idebStatusValidos[f.StatusIdeb] {
		return f, fmt.Errorf("status_ideb inválido: %q", f.StatusIdeb)
	}

	f.DetalheStatusIdeb = strings.TrimSpace(q.Get("detalhe_status_ideb"))
	if f.DetalheStatusIdeb != "" && !idebDetalheValidos[f.DetalheStatusIdeb] {
		return f, fmt.Errorf("detalhe_status_ideb inválido: %q", f.DetalheStatusIdeb)
	}

	f.StatusVinculo = strings.TrimSpace(q.Get("status_vinculo"))
	if f.StatusVinculo != "" && !idebVinculoValidos[f.StatusVinculo] {
		return f, fmt.Errorf("status_vinculo inválido: %q", f.StatusVinculo)
	}

	if s := strings.TrimSpace(q.Get("somente_com_ideb")); s != "" {
		b, err := strconv.ParseBool(s)
		if err != nil {
			return f, fmt.Errorf("somente_com_ideb inválido: %q", s)
		}
		f.SomenteComIdeb = b
	}

	return f, nil
}

// idebFromWhere é o trecho FROM + LEFT JOIN + WHERE comum a todas as agregações.
// Os filtros territoriais (dre/municipio/zona/regiao_integracao) atuam sobre a
// tabela schools via LEFT JOIN: quando presentes, registros com school_id NULL
// (s.* NULL) caem fora do recorte naturalmente. Sem filtro territorial, esses
// registros são mantidos (o OR curto-circuita em $N = ”).
// $1=ano $2=etapa $3=dre $4=municipio $5=zona $6=regiao_integracao
// $7=status_ideb $8=detalhe_status_ideb $9=status_vinculo $10=somente_com_ideb.
const idebFromWhere = `
	FROM ideb_resultados ir
	LEFT JOIN schools s ON s.id = ir.school_id
	WHERE ir.ano = $1
	  AND ($2 = '' OR ir.etapa = $2)
	  AND ($3 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($5)))
	  AND ($6 = '' OR UPPER(TRIM(s.municipio)) IN (
	        SELECT UPPER(TRIM(municipio)) FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($6))))
	  AND ($7 = '' OR ir.status_ideb = $7)
	  AND ($8 = '' OR ir.detalhe_status_ideb = $8)
	  AND ($9 = '' OR ir.status_vinculo = $9)
	  AND ($10 = false OR ir.ideb IS NOT NULL)
`

// ---------------------------------------------------------------------------
// Tipos do payload
// ---------------------------------------------------------------------------

type IdebResumo struct {
	AnoReferencia                 int      `json:"ano_referencia"`
	TotalRegistros                int      `json:"total_registros"`
	TotalEscolasInep              int      `json:"total_escolas_inep"`
	RegistrosComIdeb              int      `json:"registros_com_ideb"`
	RegistrosSemIdeb              int      `json:"registros_sem_ideb"`
	EscolasComAlgumIdeb           int      `json:"escolas_com_algum_ideb"`
	EscolasSemIdebEmQualquerEtapa int      `json:"escolas_sem_ideb_em_qualquer_etapa"`
	CoberturaIdebPercentual       float64  `json:"cobertura_ideb_percentual"`
	RegistrosSemMatchSchools      int      `json:"registros_sem_match_schools"`
	IdebMedioSimples              *float64 `json:"ideb_medio_simples"`
	IdebMedioPonderado            *float64 `json:"ideb_medio_ponderado"`
}

type IdebPorEtapa struct {
	Etapa                       string   `json:"etapa"`
	Registros                   int      `json:"registros"`
	Escolas                     int      `json:"escolas"`
	RegistrosComIdeb            int      `json:"registros_com_ideb"`
	RegistrosSemIdeb            int      `json:"registros_sem_ideb"`
	CoberturaIdebPercentual     float64  `json:"cobertura_ideb_percentual"`
	IdebMedioSimples            *float64 `json:"ideb_medio_simples"`
	IdebMedioPonderado          *float64 `json:"ideb_medio_ponderado"`
	IdebMediana                 *float64 `json:"ideb_mediana"`
	IdebMin                     *float64 `json:"ideb_min"`
	IdebMax                     *float64 `json:"ideb_max"`
	TotalAvaliado               *float64 `json:"total_avaliado"`
	PercentualAvaliadoMedio     *float64 `json:"percentual_avaliado_medio"`
	ProficienciaPortuguesMedia  *float64 `json:"proficiencia_portugues_media"`
	ProficienciaMatematicaMedia *float64 `json:"proficiencia_matematica_media"`
	FluxoMedio                  *float64 `json:"fluxo_medio"`
}

type IdebFaixaItem struct {
	Etapa      string  `json:"etapa"`
	Faixa      string  `json:"faixa"`
	Registros  int     `json:"registros"`
	Percentual float64 `json:"percentual"`
}

type IdebPorDre struct {
	DRE                string   `json:"dre"`
	Etapa              string   `json:"etapa"`
	Registros          int      `json:"registros"`
	Escolas            int      `json:"escolas"`
	RegistrosComIdeb   int      `json:"registros_com_ideb"`
	RegistrosSemIdeb   int      `json:"registros_sem_ideb"`
	IdebMedioSimples   *float64 `json:"ideb_medio_simples"`
	IdebMedioPonderado *float64 `json:"ideb_medio_ponderado"`
}

type IdebRankingItem struct {
	CodigoInep         string   `json:"codigo_inep"`
	NomeEscolaOrigem   string   `json:"nome_escola_origem"`
	Etapa              string   `json:"etapa"`
	Ideb               *float64 `json:"ideb"`
	TotalAvaliado      *float64 `json:"total_avaliado"`
	PercentualAvaliado *float64 `json:"percentual_avaliado"`
	DRE                *string  `json:"dre"`
	Municipio          *string  `json:"municipio"`
	StatusIdeb         string   `json:"status_ideb"`
	StatusVinculo      string   `json:"status_vinculo"`
}

type IdebRankings struct {
	MaioresIdebs      []IdebRankingItem `json:"maioresIdebs"`
	MenoresIdebs      []IdebRankingItem `json:"menoresIdebs"`
	SemIdebDivulgado  []IdebRankingItem `json:"semIdebDivulgado"`
	BaixaParticipacao []IdebRankingItem `json:"baixaParticipacao"`
}

type IdebQualidade struct {
	DuplicidadesChave        int `json:"duplicidades_chave"`
	RegistrosNdProficiencia  int `json:"registros_nd_proficiencia"`
	PercentuaisAcima100      int `json:"percentuais_acima_100"`
	PercentuaisAbaixo80      int `json:"percentuais_abaixo_80"`
	RegistrosSemMatchSchools int `json:"registros_sem_match_schools"`
}

type IdebMetadados struct {
	FonteArquivo      string   `json:"fonte_arquivo"`
	FonteMetodologica string   `json:"fonte_metodologica"`
	Grao              string   `json:"grao"`
	ImportBatchID     *string  `json:"import_batch_id"`
	Observacoes       []string `json:"observacoes"`
}

type IdebAnalytics struct {
	Resumo             IdebResumo      `json:"resumo"`
	PorEtapa           []IdebPorEtapa  `json:"porEtapa"`
	DistribuicaoFaixas []IdebFaixaItem `json:"distribuicaoFaixas"`
	PorDre             []IdebPorDre    `json:"porDre"`
	RankingEscolas     IdebRankings    `json:"rankingEscolas"`
	Qualidade          IdebQualidade   `json:"qualidade"`
	Metadados          IdebMetadados   `json:"metadados"`
}

// ---------------------------------------------------------------------------
// Helpers puros (testáveis sem banco)
// ---------------------------------------------------------------------------

func idebRoundTo2(v float64) float64 {
	return math.Round(v*100) / 100
}

// idebCoberturaPercentual = 100 * com / total, arredondado a 2 casas. Total <= 0
// devolve 0 (sem divisão por zero).
func idebCoberturaPercentual(com, total int) float64 {
	if total <= 0 {
		return 0
	}
	return idebRoundTo2(100 * float64(com) / float64(total))
}

// idebMediaPonderada = somaProduto / somaPeso, arredondado a 2 casas. Peso <= 0
// devolve nil (sem registros elegíveis: ideb válido e total_avaliado > 0).
func idebMediaPonderada(somaProduto, somaPeso float64) *float64 {
	if somaPeso <= 0 {
		return nil
	}
	v := idebRoundTo2(somaProduto / somaPeso)
	return &v
}

// idebFaixa classifica um IDEB na faixa textual canônica. ideb == nil (ausente)
// é "Sem IDEB divulgado" — NUNCA tratado como zero.
func idebFaixa(ideb *float64) string {
	if ideb == nil {
		return idebFaixaSemIdeb
	}
	v := *ideb
	switch {
	case v < 3.0:
		return "Abaixo de 3,0"
	case v < 4.0:
		return "3,0 a 3,9"
	case v < 5.0:
		return "4,0 a 4,9"
	case v < 6.0:
		return "5,0 a 5,9"
	case v < 7.0:
		return "6,0 a 6,9"
	default:
		return "7,0+"
	}
}

func idebNullFloatPtr(n sql.NullFloat64) *float64 {
	if !n.Valid {
		return nil
	}
	v := n.Float64
	return &v
}

func idebNullStringPtr(n sql.NullString) *string {
	if !n.Valid || strings.TrimSpace(n.String) == "" {
		return nil
	}
	v := n.String
	return &v
}

func idebEtapaOrdemIdx(etapa string) int {
	for i, e := range idebEtapasOrdem {
		if e == etapa {
			return i
		}
	}
	return len(idebEtapasOrdem)
}

func idebFaixaOrdemIdx(faixa string) int {
	for i, f := range idebFaixasOrdem {
		if f == faixa {
			return i
		}
	}
	return len(idebFaixasOrdem)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// AdminAnalyticsPerfilAlunosResultadosIDEB responde GET
// /v1/admin/analytics/perfil-alunos-resultados/ideb. Lê exclusivamente
// ideb_resultados (LEFT JOIN schools para filtros territoriais).
func (app *application) AdminAnalyticsPerfilAlunosResultadosIDEB(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	f, err := parseIdebFilters(r.URL.Query())
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	out := IdebAnalytics{
		PorEtapa:           []IdebPorEtapa{},
		DistribuicaoFaixas: []IdebFaixaItem{},
		PorDre:             []IdebPorDre{},
		RankingEscolas: IdebRankings{
			MaioresIdebs:      []IdebRankingItem{},
			MenoresIdebs:      []IdebRankingItem{},
			SemIdebDivulgado:  []IdebRankingItem{},
			BaixaParticipacao: []IdebRankingItem{},
		},
	}
	out.Resumo.AnoReferencia = f.Ano

	if err := app.idebResumo(ctx, f, &out.Resumo); err != nil {
		app.errorJSON(w, fmt.Errorf("resumo: %w", err), http.StatusInternalServerError)
		return
	}
	if porEtapa, err := app.idebPorEtapa(ctx, f); err != nil {
		app.errorJSON(w, fmt.Errorf("por_etapa: %w", err), http.StatusInternalServerError)
		return
	} else {
		out.PorEtapa = porEtapa
	}
	if faixas, err := app.idebDistribuicaoFaixas(ctx, f); err != nil {
		app.errorJSON(w, fmt.Errorf("distribuicao_faixas: %w", err), http.StatusInternalServerError)
		return
	} else {
		out.DistribuicaoFaixas = faixas
	}
	if porDre, err := app.idebPorDre(ctx, f); err != nil {
		app.errorJSON(w, fmt.Errorf("por_dre: %w", err), http.StatusInternalServerError)
		return
	} else {
		out.PorDre = porDre
	}
	if rankings, err := app.idebRankings(ctx, f); err != nil {
		app.errorJSON(w, fmt.Errorf("ranking_escolas: %w", err), http.StatusInternalServerError)
		return
	} else {
		out.RankingEscolas = rankings
	}
	if err := app.idebQualidade(ctx, f, &out.Qualidade); err != nil {
		app.errorJSON(w, fmt.Errorf("qualidade: %w", err), http.StatusInternalServerError)
		return
	}
	if meta, err := app.idebMetadados(ctx, f); err != nil {
		app.errorJSON(w, fmt.Errorf("metadados: %w", err), http.StatusInternalServerError)
		return
	} else {
		out.Metadados = meta
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

func (app *application) idebResumo(ctx context.Context, f idebFilters, res *IdebResumo) error {
	db := app.models.Schools.DB
	var (
		mediaSimples sql.NullFloat64
		somaProduto  float64
		somaPeso     float64
	)
	err := db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COUNT(DISTINCT ir.codigo_inep),
			COUNT(*) FILTER (WHERE ir.ideb IS NOT NULL),
			COUNT(*) FILTER (WHERE ir.ideb IS NULL),
			COUNT(DISTINCT ir.codigo_inep) FILTER (WHERE ir.ideb IS NOT NULL),
			COUNT(*) FILTER (WHERE ir.school_id IS NULL),
			ROUND(AVG(ir.ideb) FILTER (WHERE ir.ideb IS NOT NULL)::numeric, 2),
			COALESCE(SUM(ir.ideb * ir.total_avaliado) FILTER (WHERE ir.ideb IS NOT NULL AND ir.total_avaliado > 0), 0),
			COALESCE(SUM(ir.total_avaliado) FILTER (WHERE ir.ideb IS NOT NULL AND ir.total_avaliado > 0), 0)
		`+idebFromWhere,
		f.args()...,
	).Scan(
		&res.TotalRegistros,
		&res.TotalEscolasInep,
		&res.RegistrosComIdeb,
		&res.RegistrosSemIdeb,
		&res.EscolasComAlgumIdeb,
		&res.RegistrosSemMatchSchools,
		&mediaSimples,
		&somaProduto,
		&somaPeso,
	)
	if err != nil {
		return err
	}
	res.EscolasSemIdebEmQualquerEtapa = res.TotalEscolasInep - res.EscolasComAlgumIdeb
	res.CoberturaIdebPercentual = idebCoberturaPercentual(res.RegistrosComIdeb, res.TotalRegistros)
	res.IdebMedioSimples = idebNullFloatPtr(mediaSimples)
	res.IdebMedioPonderado = idebMediaPonderada(somaProduto, somaPeso)
	return nil
}

func (app *application) idebPorEtapa(ctx context.Context, f idebFilters) ([]IdebPorEtapa, error) {
	db := app.models.Schools.DB
	rows, err := db.QueryContext(ctx, `
		SELECT
			ir.etapa,
			COUNT(*),
			COUNT(DISTINCT ir.codigo_inep),
			COUNT(*) FILTER (WHERE ir.ideb IS NOT NULL),
			COUNT(*) FILTER (WHERE ir.ideb IS NULL),
			ROUND(AVG(ir.ideb) FILTER (WHERE ir.ideb IS NOT NULL)::numeric, 2),
			COALESCE(SUM(ir.ideb * ir.total_avaliado) FILTER (WHERE ir.ideb IS NOT NULL AND ir.total_avaliado > 0), 0),
			COALESCE(SUM(ir.total_avaliado) FILTER (WHERE ir.ideb IS NOT NULL AND ir.total_avaliado > 0), 0),
			ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ir.ideb)::numeric, 2),
			ROUND(MIN(ir.ideb)::numeric, 2),
			ROUND(MAX(ir.ideb)::numeric, 2),
			ROUND(SUM(ir.total_avaliado)::numeric, 2),
			ROUND(AVG(ir.percentual_avaliado)::numeric, 2),
			ROUND(AVG(ir.proficiencia_portugues)::numeric, 2),
			ROUND(AVG(ir.proficiencia_matematica)::numeric, 2),
			ROUND(AVG(ir.fluxo_indicador_rendimento)::numeric, 4)
		`+idebFromWhere+`
		GROUP BY ir.etapa
		ORDER BY CASE ir.etapa
			WHEN 'anos_iniciais' THEN 1
			WHEN 'anos_finais' THEN 2
			WHEN 'ensino_medio' THEN 3
			ELSE 4 END
	`, f.args()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []IdebPorEtapa{}
	for rows.Next() {
		var (
			e           IdebPorEtapa
			mediaS      sql.NullFloat64
			somaProduto float64
			somaPeso    float64
			mediana     sql.NullFloat64
			minV        sql.NullFloat64
			maxV        sql.NullFloat64
			totalAval   sql.NullFloat64
			percAval    sql.NullFloat64
			profPt      sql.NullFloat64
			profMt      sql.NullFloat64
			fluxo       sql.NullFloat64
		)
		if err := rows.Scan(
			&e.Etapa, &e.Registros, &e.Escolas, &e.RegistrosComIdeb, &e.RegistrosSemIdeb,
			&mediaS, &somaProduto, &somaPeso, &mediana, &minV, &maxV,
			&totalAval, &percAval, &profPt, &profMt, &fluxo,
		); err != nil {
			return nil, err
		}
		e.CoberturaIdebPercentual = idebCoberturaPercentual(e.RegistrosComIdeb, e.Registros)
		e.IdebMedioSimples = idebNullFloatPtr(mediaS)
		e.IdebMedioPonderado = idebMediaPonderada(somaProduto, somaPeso)
		e.IdebMediana = idebNullFloatPtr(mediana)
		e.IdebMin = idebNullFloatPtr(minV)
		e.IdebMax = idebNullFloatPtr(maxV)
		e.TotalAvaliado = idebNullFloatPtr(totalAval)
		e.PercentualAvaliadoMedio = idebNullFloatPtr(percAval)
		e.ProficienciaPortuguesMedia = idebNullFloatPtr(profPt)
		e.ProficienciaMatematicaMedia = idebNullFloatPtr(profMt)
		e.FluxoMedio = idebNullFloatPtr(fluxo)
		out = append(out, e)
	}
	return out, rows.Err()
}

// idebDistribuicaoFaixas busca (etapa, ideb) e bucketiza em Go via idebFaixa,
// garantindo que a regra de faixas (incl. "Sem IDEB divulgado" para NULL) seja a
// mesma testada por unidade. O percentual é relativo ao total da etapa.
func (app *application) idebDistribuicaoFaixas(ctx context.Context, f idebFilters) ([]IdebFaixaItem, error) {
	db := app.models.Schools.DB
	rows, err := db.QueryContext(ctx, `SELECT ir.etapa, ir.ideb `+idebFromWhere, f.args()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// contagem[etapa][faixa] e total por etapa.
	contagem := map[string]map[string]int{}
	totalEtapa := map[string]int{}
	etapasVistas := []string{}
	for rows.Next() {
		var etapa string
		var ideb sql.NullFloat64
		if err := rows.Scan(&etapa, &ideb); err != nil {
			return nil, err
		}
		if _, ok := contagem[etapa]; !ok {
			contagem[etapa] = map[string]int{}
			etapasVistas = append(etapasVistas, etapa)
		}
		faixa := idebFaixa(idebNullFloatPtr(ideb))
		contagem[etapa][faixa]++
		totalEtapa[etapa]++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Ordena etapas pela ordem canônica (depois alfabética para desconhecidas).
	sortEtapas(etapasVistas)

	out := []IdebFaixaItem{}
	for _, etapa := range etapasVistas {
		for _, faixa := range idebFaixasOrdem {
			n := contagem[etapa][faixa]
			if n == 0 {
				continue
			}
			out = append(out, IdebFaixaItem{
				Etapa:      etapa,
				Faixa:      faixa,
				Registros:  n,
				Percentual: idebCoberturaPercentual(n, totalEtapa[etapa]),
			})
		}
	}
	return out, nil
}

func sortEtapas(etapas []string) {
	for i := 1; i < len(etapas); i++ {
		for j := i; j > 0; j-- {
			a, b := etapas[j-1], etapas[j]
			ia, ib := idebEtapaOrdemIdx(a), idebEtapaOrdemIdx(b)
			if ia > ib || (ia == ib && a > b) {
				etapas[j-1], etapas[j] = b, a
			} else {
				break
			}
		}
	}
}

// idebPorDre agrega por DRE × etapa, restrito a registros COM vínculo cadastral
// (school_id IS NOT NULL), pois recortes territoriais dependem de schools. São
// agregações calculadas pelo dashboard, não IDEB oficial agregado do INEP.
func (app *application) idebPorDre(ctx context.Context, f idebFilters) ([]IdebPorDre, error) {
	db := app.models.Schools.DB
	rows, err := db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(s.dre), ''), 'Não informado') AS dre,
			ir.etapa,
			COUNT(*),
			COUNT(DISTINCT ir.codigo_inep),
			COUNT(*) FILTER (WHERE ir.ideb IS NOT NULL),
			COUNT(*) FILTER (WHERE ir.ideb IS NULL),
			ROUND(AVG(ir.ideb) FILTER (WHERE ir.ideb IS NOT NULL)::numeric, 2),
			COALESCE(SUM(ir.ideb * ir.total_avaliado) FILTER (WHERE ir.ideb IS NOT NULL AND ir.total_avaliado > 0), 0),
			COALESCE(SUM(ir.total_avaliado) FILTER (WHERE ir.ideb IS NOT NULL AND ir.total_avaliado > 0), 0)
		`+idebFromWhere+`
		  AND ir.school_id IS NOT NULL
		GROUP BY 1, ir.etapa
		ORDER BY 1, CASE ir.etapa
			WHEN 'anos_iniciais' THEN 1
			WHEN 'anos_finais' THEN 2
			WHEN 'ensino_medio' THEN 3
			ELSE 4 END
	`, f.args()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []IdebPorDre{}
	for rows.Next() {
		var (
			d           IdebPorDre
			mediaS      sql.NullFloat64
			somaProduto float64
			somaPeso    float64
		)
		if err := rows.Scan(
			&d.DRE, &d.Etapa, &d.Registros, &d.Escolas,
			&d.RegistrosComIdeb, &d.RegistrosSemIdeb, &mediaS, &somaProduto, &somaPeso,
		); err != nil {
			return nil, err
		}
		d.IdebMedioSimples = idebNullFloatPtr(mediaS)
		d.IdebMedioPonderado = idebMediaPonderada(somaProduto, somaPeso)
		out = append(out, d)
	}
	return out, rows.Err()
}

func (app *application) idebRankings(ctx context.Context, f idebFilters) (IdebRankings, error) {
	out := IdebRankings{
		MaioresIdebs:      []IdebRankingItem{},
		MenoresIdebs:      []IdebRankingItem{},
		SemIdebDivulgado:  []IdebRankingItem{},
		BaixaParticipacao: []IdebRankingItem{},
	}
	limit := idebRankingLimitDefault

	var err error
	if out.MaioresIdebs, err = app.idebRankingQuery(ctx, f, "ir.ideb IS NOT NULL", "ir.ideb DESC, ir.nome_escola_origem ASC", limit); err != nil {
		return out, fmt.Errorf("maiores: %w", err)
	}
	if out.MenoresIdebs, err = app.idebRankingQuery(ctx, f, "ir.ideb IS NOT NULL", "ir.ideb ASC, ir.nome_escola_origem ASC", limit); err != nil {
		return out, fmt.Errorf("menores: %w", err)
	}
	if out.SemIdebDivulgado, err = app.idebRankingQuery(ctx, f, "ir.ideb IS NULL", "ir.nome_escola_origem ASC", limit); err != nil {
		return out, fmt.Errorf("sem_ideb: %w", err)
	}
	if out.BaixaParticipacao, err = app.idebRankingQuery(ctx, f, "ir.percentual_avaliado < 80", "ir.percentual_avaliado ASC, ir.nome_escola_origem ASC", limit); err != nil {
		return out, fmt.Errorf("baixa_participacao: %w", err)
	}
	return out, nil
}

// idebRankingQuery devolve um ranking top-N POR ETAPA (ROW_NUMBER particionado
// por etapa), nunca misturando etapas. orderBy e extraPredicate são expressões
// controladas pelo servidor (constantes), não entrada de usuário.
func (app *application) idebRankingQuery(ctx context.Context, f idebFilters, extraPredicate, orderBy string, limit int) ([]IdebRankingItem, error) {
	db := app.models.Schools.DB
	query := fmt.Sprintf(`
		SELECT codigo_inep, nome_escola_origem, etapa, ideb, total_avaliado,
		       percentual_avaliado, dre, municipio, status_ideb, status_vinculo
		FROM (
			SELECT
				ir.codigo_inep, ir.nome_escola_origem, ir.etapa, ir.ideb,
				ir.total_avaliado, ir.percentual_avaliado,
				s.dre AS dre, s.municipio AS municipio,
				ir.status_ideb, ir.status_vinculo,
				ROW_NUMBER() OVER (PARTITION BY ir.etapa ORDER BY %s) AS rn
			%s
			  AND %s
		) t
		WHERE rn <= $11
		ORDER BY CASE etapa
			WHEN 'anos_iniciais' THEN 1
			WHEN 'anos_finais' THEN 2
			WHEN 'ensino_medio' THEN 3
			ELSE 4 END, rn
	`, orderBy, idebFromWhere, extraPredicate)

	args := append(f.args(), limit)
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []IdebRankingItem{}
	for rows.Next() {
		var (
			it        IdebRankingItem
			ideb      sql.NullFloat64
			totalAval sql.NullFloat64
			percAval  sql.NullFloat64
			dre       sql.NullString
			municipio sql.NullString
		)
		if err := rows.Scan(
			&it.CodigoInep, &it.NomeEscolaOrigem, &it.Etapa, &ideb,
			&totalAval, &percAval, &dre, &municipio, &it.StatusIdeb, &it.StatusVinculo,
		); err != nil {
			return nil, err
		}
		it.Ideb = idebNullFloatPtr(ideb)
		it.TotalAvaliado = idebNullFloatPtr(totalAval)
		it.PercentualAvaliado = idebNullFloatPtr(percAval)
		it.DRE = idebNullStringPtr(dre)
		it.Municipio = idebNullStringPtr(municipio)
		out = append(out, it)
	}
	return out, rows.Err()
}

func (app *application) idebQualidade(ctx context.Context, f idebFilters, q *IdebQualidade) error {
	db := app.models.Schools.DB
	err := db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE ir.detalhe_status_ideb = 'nd_proficiencia'),
			COUNT(*) FILTER (WHERE ir.percentual_avaliado > 100),
			COUNT(*) FILTER (WHERE ir.percentual_avaliado < 80),
			COUNT(*) FILTER (WHERE ir.school_id IS NULL)
		`+idebFromWhere,
		f.args()...,
	).Scan(
		&q.RegistrosNdProficiencia,
		&q.PercentuaisAcima100,
		&q.PercentuaisAbaixo80,
		&q.RegistrosSemMatchSchools,
	)
	if err != nil {
		return err
	}

	// Duplicidades na chave de grão (ano, codigo_inep, etapa) dentro do recorte.
	err = db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM (
			SELECT 1
			`+idebFromWhere+`
			GROUP BY ir.ano, ir.codigo_inep, ir.etapa
			HAVING COUNT(*) > 1
		) d
	`, f.args()...).Scan(&q.DuplicidadesChave)
	return err
}

func (app *application) idebMetadados(ctx context.Context, f idebFilters) (IdebMetadados, error) {
	db := app.models.Schools.DB
	var fonteArquivo sql.NullString
	var batchID sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT MAX(ir.fonte_arquivo), MAX(ir.import_batch_id)
		`+idebFromWhere,
		f.args()...,
	).Scan(&fonteArquivo, &batchID)
	if err != nil {
		return IdebMetadados{}, err
	}
	fonte := idebFonteArquivoPadrao
	if fonteArquivo.Valid && strings.TrimSpace(fonteArquivo.String) != "" {
		fonte = fonteArquivo.String
	}
	return IdebMetadados{
		FonteArquivo:      fonte,
		FonteMetodologica: idebFonteMetodologica,
		Grao:              idebGrao,
		ImportBatchID:     idebNullStringPtr(batchID),
		Observacoes: []string{
			"Sem IDEB divulgado não equivale a nota zero; indica cobertura/elegibilidade.",
			"`-` e `ND` na origem viram NULL, nunca 0.",
			"Médias por DRE/município e demais recortes são cálculo do dashboard (média simples e ponderada das escolas vinculadas), não IDEB oficial agregado do INEP.",
			"Rankings são sempre por etapa; etapas não são misturadas em um ranking único.",
			"percentual_avaliado acima de 100 é preservado da origem e sinalizado em qualidade.",
			"A base não contém metas IDEB 2023; não há indicador de atingimento de meta.",
		},
	}, nil
}
