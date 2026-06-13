package main

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// =========================================================================
// Gestão Financeira e Governança — Governança Institucional (PR 1)
//
// Endpoint analítico que lê a view vw_censo_governanca_institucional
// (migration 0016) e devolve o resumo da dimensão Governança Institucional
// para a aba "Gestão Financeira e Governança":
//   GET /v1/admin/analytics/financeiro-governanca/institucional
//
// Fonte: respostas CONCLUÍDAS do Censo (a view já filtra status = 'completed').
// Por isso o filtro `ano` NÃO se aplica aqui — diferentemente do bloco PRODEP,
// que tem seus próprios filtros. Os filtros globais aplicáveis são: dre,
// municipio, zona. A nota/metadados deixa explícito que se trata do Censo atual.
//
// Regra metodológica (docs/dashboard/governanca-institucional-financeira.md):
//   * "Não informado"/vazio NUNCA vira "Não" — fica fora do numerador (a view
//     o mantém como NULL e o FILTER (WHERE bool) só conta TRUE).
//   * Denominador de "Conselho ativo" e "Conselho parcialmente ativo" é o total
//     de escolas com Conselho Escolar constituído (conselho_escolar = 'Sim'),
//     não o total de respostas concluídas.
// =========================================================================

// governancaInstitucionalFilters reúne os filtros globais aplicáveis. String
// vazia significa "filtro desativado".
type governancaInstitucionalFilters struct {
	DRE       string
	Municipio string
	Zona      string
}

// args devolve os argumentos posicionais na ordem esperada por
// governancaInstitucionalWhereSQL ($1=dre $2=municipio $3=zona).
func (f governancaInstitucionalFilters) args() []any {
	return []any{f.DRE, f.Municipio, f.Zona}
}

// parseGovernancaInstitucionalFilters lê os filtros opcionais da query string.
// Não há valores enumerados a validar (são textos livres comparados de forma
// case-insensitive no SQL), portanto nunca falha. `ano`, `ri` e demais filtros
// PRODEP são intencionalmente ignorados.
func parseGovernancaInstitucionalFilters(q url.Values) governancaInstitucionalFilters {
	get := func(key string) string { return strings.TrimSpace(q.Get(key)) }
	return governancaInstitucionalFilters{
		DRE:       get("dre"),
		Municipio: get("municipio"),
		Zona:      get("zona"),
	}
}

// governancaInstitucionalWhereSQL é a cláusula WHERE parametrizada aplicada
// sobre a view (que já restringe a status = 'completed'). Comparações
// case-insensitive com TRIM. $1=dre $2=municipio $3=zona.
const governancaInstitucionalWhereSQL = `
	WHERE ($1 = '' OR UPPER(TRIM(dre)) = UPPER(TRIM($1)))
	  AND ($2 = '' OR UPPER(TRIM(municipio)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(zona)) = UPPER(TRIM($3)))
`

// GovernancaIndicador é a tripla total/denominador/percentual de cada card.
type GovernancaIndicador struct {
	Total       int64   `json:"total"`
	Denominador int64   `json:"denominador"`
	Percentual  float64 `json:"percentual"`
}

// novoGovernancaIndicador monta o indicador já com o percentual calculado.
func novoGovernancaIndicador(total, denominador int64) GovernancaIndicador {
	return GovernancaIndicador{
		Total:       total,
		Denominador: denominador,
		Percentual:  pctGovernanca(total, denominador),
	}
}

// pctGovernanca = total / denominador * 100, arredondado a 2 casas. Devolve 0
// quando o denominador é zero (nunca erro/divisão por zero).
func pctGovernanca(total, denominador int64) float64 {
	if denominador == 0 {
		return 0
	}
	return round2(float64(total) / float64(denominador) * 100)
}

type GovernancaInstitucionalResumo struct {
	TotalEscolas              int64               `json:"totalEscolas"`
	RegularizadasCEE          GovernancaIndicador `json:"regularizadasCEE"`
	ConselhoConstituido       GovernancaIndicador `json:"conselhoConstituido"`
	ConselhoAtivo             GovernancaIndicador `json:"conselhoAtivo"`
	ConselhoParcialmenteAtivo GovernancaIndicador `json:"conselhoParcialmenteAtivo"`
	GovernancaCompleta        GovernancaIndicador `json:"governancaCompleta"`
	GovernancaCritica         GovernancaIndicador `json:"governancaCritica"`
}

type GovernancaInstitucionalMetadados struct {
	Fonte           string `json:"fonte"`
	StatusRespostas string `json:"statusRespostas"`
	Observacao      string `json:"observacao"`
}

type GovernancaInstitucionalPayload struct {
	Resumo    GovernancaInstitucionalResumo    `json:"resumo"`
	Metadados GovernancaInstitucionalMetadados `json:"metadados"`
}

const governancaInstitucionalObservacao = "Indicadores calculados a partir de respostas concluídas do Censo. " +
	"Não informado não é tratado como Não. O denominador de \"Conselho ativo\" e \"Conselho parcialmente ativo\" " +
	"é o total de escolas com Conselho Escolar constituído."

// AdminAnalyticsFinanceiroGovernancaInstitucional responde GET
// /v1/admin/analytics/financeiro-governanca/institucional.
//
// Filtros opcionais: dre, municipio, zona. Sem respostas no recorte devolve
// estrutura válida com zeros (percentuais = 0), nunca erro.
func (app *application) AdminAnalyticsFinanceiroGovernancaInstitucional(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	filters := parseGovernancaInstitucionalFilters(r.URL.Query())
	args := filters.args()

	var (
		totalEscolas        int64
		regularizadas       int64
		conselhoConstituido int64
		conselhoAtivo       int64
		conselhoParcial     int64
		governancaCompleta  int64
		governancaCritica   int64
	)

	if err := db.QueryRowContext(ctx, `
		SELECT
			COUNT(*)::bigint,
			COUNT(*) FILTER (WHERE is_regularizada_cee)::bigint,
			COUNT(*) FILTER (WHERE has_conselho_escolar)::bigint,
			COUNT(*) FILTER (WHERE is_conselho_ativo)::bigint,
			COUNT(*) FILTER (WHERE is_conselho_parcialmente_ativo)::bigint,
			COUNT(*) FILTER (WHERE is_governanca_completa)::bigint,
			COUNT(*) FILTER (WHERE is_governanca_critica)::bigint
		FROM vw_censo_governanca_institucional`+governancaInstitucionalWhereSQL,
		args...,
	).Scan(
		&totalEscolas,
		&regularizadas,
		&conselhoConstituido,
		&conselhoAtivo,
		&conselhoParcial,
		&governancaCompleta,
		&governancaCritica,
	); err != nil {
		app.errorJSON(w, fmt.Errorf("resumo governanca institucional: %v", err), http.StatusInternalServerError)
		return
	}

	out := GovernancaInstitucionalPayload{
		Resumo: GovernancaInstitucionalResumo{
			TotalEscolas:              totalEscolas,
			RegularizadasCEE:          novoGovernancaIndicador(regularizadas, totalEscolas),
			ConselhoConstituido:       novoGovernancaIndicador(conselhoConstituido, totalEscolas),
			ConselhoAtivo:             novoGovernancaIndicador(conselhoAtivo, conselhoConstituido),
			ConselhoParcialmenteAtivo: novoGovernancaIndicador(conselhoParcial, conselhoConstituido),
			GovernancaCompleta:        novoGovernancaIndicador(governancaCompleta, totalEscolas),
			GovernancaCritica:         novoGovernancaIndicador(governancaCritica, totalEscolas),
		},
		Metadados: GovernancaInstitucionalMetadados{
			Fonte:           "Censo Operacional",
			StatusRespostas: "completed",
			Observacao:      governancaInstitucionalObservacao,
		},
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
