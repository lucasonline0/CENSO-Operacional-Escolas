package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestSaudeOperacionalCategoricalMappings(t *testing.T) {
	tests := []struct {
		name   string
		scores map[string]float64
		input  string
		want   float64
	}{
		{"estrutura sem reforma", situacaoEstruturaScores, "Não necessita de reforma.", 100},
		{"estrutura reformada", situacaoEstruturaScores, "Foi reformada recentemente", 90},
		{"estrutura reforma andamento", situacaoEstruturaScores, "Reforma em andamento", 62},
		{"estrutura reforma parcial", situacaoEstruturaScores, "Necessita de reforma parcial (melhoria pontual)", 45},
		{"estrutura obra parada", situacaoEstruturaScores, "Está em reforma, porém a obra está parada", 30},
		{"estrutura reforma geral", situacaoEstruturaScores, "Necessita de reforma geral", 12},
		{"banheiros todos", banheirosFuncionaisScores, "Todos", 100},
		{"banheiros alguns", banheirosFuncionaisScores, "Alguns", 50},
		{"banheiros nenhum", banheirosFuncionaisScores, "Nenhum", 0},
		{"muro", muroCercaScores, "Sim, muro", 100},
		{"cerca", muroCercaScores, "Sim, cerca", 80},
		{"sem muro", muroCercaScores, "Não possui", 0},
		{"climatizacao sim", estruturaClimatizacaoScores, "Sim", 100},
		{"climatizacao completa", estruturaClimatizacaoScores, "Não, todas as salas são climatizadas", 100},
		{"climatizacao adequacoes", estruturaClimatizacaoScores, "Não, somente com adequações", 45},
		{"climatizacao legado nao", estruturaClimatizacaoScores, "Não", 0},
		{"predio proprio", tipoPredioScores, "Próprio", 100},
		{"predio cedido", tipoPredioScores, "Cedido", 75},
		{"predio alugado", tipoPredioScores, "Alugado", 60},
		{"predio compartilhado", tipoPredioScores, "Compartilhado", 45},
		{"sim", simParcialNaoScores, "Sim", 100},
		{"parcialmente", simParcialNaoScores, "Parcialmente", 50},
		{"nao", simParcialNaoScores, "Não", 0},
		{"energia concessionaria", energiaFornecimentoScores, "Concessionária de energia - Equatorial", 100},
		{"energia geracao propria", energiaFornecimentoScores, "Geração própria", 60},
		{"oferta regular", ofertaRegularScores, "Sim", 100},
		{"oferta com falhas", ofertaRegularScores, "Sim, com falhas", 60},
		{"oferta ausente", ofertaRegularScores, "Não", 0},
		{"merenda boa", qualidadeMerendaScores, "Boa", 100},
		{"merenda regular", qualidadeMerendaScores, "Regular", 50},
		{"merenda ruim", qualidadeMerendaScores, "Ruim", 20},
		{"cozinha boa", condicoesCozinhaScores, "Boa", 100},
		{"cozinha regular", condicoesCozinhaScores, "Regular", 50},
		{"cozinha precaria", condicoesCozinhaScores, "Precária", 20},
		{"cameras plenas", camerasFuncionamentoScores, "Sim, funcionando plenamente", 100},
		{"cameras parciais", camerasFuncionamentoScores, "Sim, parcialmente", 50},
		{"sem cameras", camerasFuncionamentoScores, "Não possui", 0},
		{"portao eletronico", controlePortaoScores, "Eletrônica", 100},
		{"portao fechadura", controlePortaoScores, "Fechadura", 70},
		{"portao manual", controlePortaoScores, "Manual", 45},
		{"iluminacao adequada", iluminacaoExternaScores, "Adequada", 100},
		{"iluminacao regular", iluminacaoExternaScores, "Regular", 50},
		{"iluminacao insuficiente", iluminacaoExternaScores, "Insuficiente", 20},
		{"internet indisponivel", qualidadeInternetScores, "A internet não funciona ou está indisponível com frequência", 0},
		{"internet lenta", qualidadeInternetScores, "A internet apresenta lentidão frequente e compromete as atividades", 28},
		{"internet oscilante", qualidadeInternetScores, "A internet possui velocidade aceitável, com eventuais oscilações", 62},
		{"internet estavel", qualidadeInternetScores, "A internet é estável e atende plenamente às necessidades da escola", 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := scoreCategorical(tt.input, tt.scores)
			assertOptionalFloat(t, got, &tt.want)
		})
	}
}

func TestSaudeOperacionalCategoricalNullRules(t *testing.T) {
	tests := []struct {
		name  string
		value any
	}{
		{"unknown", "Valor legado desconhecido"},
		{"blank", "   "},
		{"missing", nil},
		{"non string", 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := scoreCategorical(tt.value, simNaoScores); got != nil {
				t.Fatalf("scoreCategorical(%v) = %v; want nil", tt.value, *got)
			}
		})
	}

	want := 100.0
	assertOptionalFloat(t, scoreCategorical("  Sim  ", simNaoScores), &want)
	if got := calculateInfrastructure(map[string]any{}); got != nil {
		t.Fatalf("calculateInfrastructure(empty) = %v; want nil", *got)
	}
	if got := scoreCategorical("Outro", energiaFornecimentoScores); got != nil {
		t.Fatalf("energia Outro = %v; want nil", *got)
	}
	if got := scoreCategorical("Não sei avaliar", qualidadeInternetScores); got != nil {
		t.Fatalf("internet Não sei avaliar = %v; want nil", *got)
	}
}

func TestSaudeOperacionalMeanValid(t *testing.T) {
	zero := 0.0
	fifty := 50.0
	hundred := 100.0

	tests := []struct {
		name   string
		values []*float64
		want   *float64
	}{
		{"valid and nil", []*float64{&zero, nil, &fifty, &hundred}, floatPointerForTest(50)},
		{"legitimate zero", []*float64{&zero}, floatPointerForTest(0)},
		{"no valid values", []*float64{nil, nil}, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertOptionalFloat(t, meanValid(tt.values...), tt.want)
		})
	}
}

func TestSaudeOperacionalWeightedMeanValid(t *testing.T) {
	v80 := 80.0
	v70 := 70.0
	v60 := 60.0
	v50 := 50.0
	v40 := 40.0
	v30 := 30.0

	tests := []struct {
		name   string
		values []weightedHealthValue
		want   *float64
	}{
		{
			name: "all enabled dimensions",
			values: []weightedHealthValue{
				{Value: &v80, Weight: 0.20},
				{Value: &v70, Weight: 0.10},
				{Value: &v60, Weight: 0.15},
				{Value: &v50, Weight: 0.15},
				{Value: &v40, Weight: 0.12},
				{Value: &v30, Weight: 0.12},
			},
			want: floatPointerForTest((80*0.20 + 70*0.10 + 60*0.15 + 50*0.15 + 40*0.12 + 30*0.12) / 0.84),
		},
		{
			name: "null dimensions leave denominator",
			values: []weightedHealthValue{
				{Value: &v80, Weight: 0.20},
				{Value: nil, Weight: 0.10},
				{Value: &v40, Weight: 0.12},
			},
			want: floatPointerForTest((80*0.20 + 40*0.12) / 0.32),
		},
		{
			name: "no valid dimension",
			values: []weightedHealthValue{
				{Value: nil, Weight: 0.20},
				{Value: nil, Weight: 0.15},
			},
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertOptionalFloat(t, weightedMeanValid(tt.values...), tt.want)
		})
	}
}

func TestSaudeOperacionalWeights(t *testing.T) {
	pesos := saudeOperacionalPesosMetodologia()
	sum := pesos.Infraestrutura + pesos.Energia + pesos.Merenda + pesos.Seguranca +
		pesos.Pessoal + pesos.Tecnologia + pesos.Pedagogico + pesos.Governanca
	if math.Abs(sum-1) > 1e-12 {
		t.Fatalf("sum weights = %v; want 1", sum)
	}

	enabled := pesos.Infraestrutura + pesos.Energia + pesos.Merenda +
		pesos.Seguranca + pesos.Pessoal + pesos.Tecnologia
	if math.Abs(enabled-0.84) > 1e-12 {
		t.Fatalf("enabled weights = %v; want 0.84", enabled)
	}
}

func TestSaudeOperacionalMethodologyMetadata(t *testing.T) {
	got := saudeOperacionalMetodologiaPayload()
	if got.Nome != "Índice de Saúde Operacional por escola" {
		t.Fatalf("nome = %q", got.Nome)
	}
	if got.Versao != "1.0.0" {
		t.Fatalf("versao = %q; want 1.0.0", got.Versao)
	}

	want := []string{
		"infraestrutura",
		"energia",
		"merenda",
		"seguranca",
		"pessoal",
		"tecnologia",
	}
	if len(got.DimensoesHabilitadas) != len(want) {
		t.Fatalf("dimensoes_habilitadas = %v; want %v", got.DimensoesHabilitadas, want)
	}
	for i := range want {
		if got.DimensoesHabilitadas[i] != want[i] {
			t.Fatalf("dimensoes_habilitadas = %v; want %v", got.DimensoesHabilitadas, want)
		}
	}
}

func TestSaudeOperacionalClassifyHealth(t *testing.T) {
	tests := []struct {
		name  string
		value *float64
		want  string
	}{
		{"49.9", floatPointerForTest(49.9), "critica"},
		{"50.0", floatPointerForTest(50), "atencao"},
		{"69.9", floatPointerForTest(69.9), "atencao"},
		{"70.0", floatPointerForTest(70), "saudavel"},
		{"null", nil, "sem_dados"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := classifyHealth(tt.value); got != tt.want {
				t.Fatalf("classifyHealth(%v) = %q; want %q", tt.value, got, tt.want)
			}
		})
	}
}

func TestSaudeOperacionalConnectivity(t *testing.T) {
	zero := 0.0
	assertOptionalFloat(t, calculateConnectivity(map[string]any{
		"internet_disponivel": "Não",
	}), &zero)

	want := 62.0
	assertOptionalFloat(t, calculateConnectivity(map[string]any{
		"internet_disponivel": "Sim",
		"qualidade_internet":  "A internet possui velocidade aceitável, com eventuais oscilações",
	}), &want)

	if got := calculateConnectivity(map[string]any{}); got != nil {
		t.Fatalf("missing internet_disponivel = %v; want nil", *got)
	}
	if got := calculateConnectivity(map[string]any{
		"internet_disponivel": "Sim",
		"qualidade_internet":  "Não se aplica",
	}); got != nil {
		t.Fatalf("neutral internet quality = %v; want nil", *got)
	}
}

func TestSaudeOperacionalCalculateSchoolHealth(t *testing.T) {
	data := map[string]any{
		"situacao_estrutura":              "Não necessita de reforma.",
		"banheiros_vasos_funcionais":      "Todos",
		"muro_cerca":                      "Sim, muro",
		"estrutura_climatizacao":          "Não, todas as salas são climatizadas",
		"tipo_predio":                     "Próprio",
		"rede_eletrica_atende":            "Sim",
		"suporta_novos_equipamentos":      "Sim",
		"energia":                         "Concessionária de energia - Equatorial",
		"oferta_regular":                  "Sim",
		"qualidade_merenda":               "Boa",
		"atende_necessidades":             "Sim",
		"condicoes_cozinha":               "Boa",
		"qtd_atende_necessidade_merenda":  "Sim",
		"cameras_funcionamento":           "Sim, funcionando plenamente",
		"possui_guarita":                  "Sim",
		"possui_botao_panico":             "Sim",
		"controle_portao":                 "Eletrônica",
		"iluminacao_externa":              "Adequada",
		"qtd_atende_necessidade_portaria": "Sim",
		"qtd_atende_necessidade_sg":       "Sim",
		"possui_direcao":                  "Sim",
		"possui_coord_pedagogico":         "Sim",
		"internet_disponivel":             "Sim",
		"qualidade_internet":              "A internet é estável e atende plenamente às necessidades da escola",
		"computadores_atendem":            "Sim",
		"possui_projetor":                 "Sim",
		"total_alunos":                    json.Number("300"),
		"qtd_salas_aula":                  json.Number("12"),
	}

	got := calculateSchoolHealth(data)
	assertOptionalFloat(t, got.Saude, floatPointerForTest(100))
	assertOptionalFloat(t, got.Criticidade, floatPointerForTest(0))
	assertOptionalFloat(t, got.AlunosPorSala, floatPointerForTest(25))
	if got.Status != "saudavel" {
		t.Fatalf("status = %q; want saudavel", got.Status)
	}
	if got.TotalAlunos == nil || *got.TotalAlunos != 300 {
		t.Fatalf("total_alunos = %v; want 300", got.TotalAlunos)
	}
	if got.SalasAula == nil || *got.SalasAula != 12 {
		t.Fatalf("salas_aula = %v; want 12", got.SalasAula)
	}
	if got.Dimensoes.Pedagogico != nil {
		t.Fatalf("pedagogico = %v; want nil", *got.Dimensoes.Pedagogico)
	}
	if got.Dimensoes.Governanca != nil {
		t.Fatalf("governanca = %v; want nil", *got.Dimensoes.Governanca)
	}
}

func TestSaudeOperacionalZeroAndCriticality(t *testing.T) {
	got := calculateSchoolHealth(map[string]any{
		"rede_eletrica_atende": "Não",
	})

	assertOptionalFloat(t, got.Dimensoes.Energia, floatPointerForTest(0))
	assertOptionalFloat(t, got.Saude, floatPointerForTest(0))
	assertOptionalFloat(t, got.Criticidade, floatPointerForTest(100))
	if got.Status != "critica" {
		t.Fatalf("status = %q; want critica", got.Status)
	}
	if *got.Saude+*got.Criticidade != 100 {
		t.Fatalf("saude + criticidade = %v; want 100", *got.Saude+*got.Criticidade)
	}
}

func TestSaudeOperacionalMetricParsing(t *testing.T) {
	tests := []struct {
		name  string
		value any
		want  *int
	}{
		{"integer number", json.Number("123"), intPointerForTest(123)},
		{"integer decimal representation", "123.0", intPointerForTest(123)},
		{"zero", 0.0, intPointerForTest(0)},
		{"fraction rejected", json.Number("12.5"), nil},
		{"negative rejected", -1, nil},
		{"invalid rejected", "doze", nil},
		{"blank rejected", " ", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseOptionalInt(tt.value)
			if tt.want == nil {
				if got != nil {
					t.Fatalf("parseOptionalInt(%v) = %d; want nil", tt.value, *got)
				}
				return
			}
			if got == nil || *got != *tt.want {
				t.Fatalf("parseOptionalInt(%v) = %v; want %d", tt.value, got, *tt.want)
			}
		})
	}

	got := calculateSchoolHealth(map[string]any{
		"total_alunos":   10,
		"qtd_salas_aula": 0,
	})
	if got.AlunosPorSala != nil {
		t.Fatalf("alunos_por_sala with zero rooms = %v; want nil", *got.AlunosPorSala)
	}

	got = calculateSchoolHealth(map[string]any{
		"total_alunos":   10.5,
		"qtd_salas_aula": 2,
	})
	if got.TotalAlunos != nil || got.AlunosPorSala != nil {
		t.Fatalf("fractional student count should remain invalid: total=%v ratio=%v", got.TotalAlunos, got.AlunosPorSala)
	}
}

func TestSaudeOperacionalSchoolWithoutCensus(t *testing.T) {
	escola, err := buildSaudeOperacionalEscola(saudeOperacionalDBRow{
		SchoolID:   10,
		CodigoINEP: sql.NullString{String: "12345678", Valid: true},
		Escola:     "Escola Sem Censo",
		Municipio:  "Belém",
		DRE:        "DRE 1",
		Zona:       sql.NullString{},
		CensusID:   sql.NullInt64{},
	})
	if err != nil {
		t.Fatal(err)
	}

	if escola.Status != "sem_dados" {
		t.Fatalf("status = %q; want sem_dados", escola.Status)
	}
	if escola.CensusID != nil || escola.Saude != nil || escola.Criticidade != nil {
		t.Fatalf("school without census has non-null result: %+v", escola)
	}
	if escola.Dimensoes.Infraestrutura != nil ||
		escola.Dimensoes.Energia != nil ||
		escola.Dimensoes.Merenda != nil ||
		escola.Dimensoes.Seguranca != nil ||
		escola.Dimensoes.Pessoal != nil ||
		escola.Dimensoes.Tecnologia != nil ||
		escola.Dimensoes.Pedagogico != nil ||
		escola.Dimensoes.Governanca != nil {
		t.Fatalf("school without census has non-null dimensions: %+v", escola.Dimensoes)
	}
}

func TestSaudeOperacionalPayloadSerializesNull(t *testing.T) {
	escola, err := buildSaudeOperacionalEscola(saudeOperacionalDBRow{
		SchoolID: 1,
		Escola:   "Escola",
		CensusID: sql.NullInt64{},
	})
	if err != nil {
		t.Fatal(err)
	}

	raw, err := json.Marshal(escola)
	if err != nil {
		t.Fatal(err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{
		"census_id",
		"codigo_inep",
		"zona",
		"total_alunos",
		"salas_aula",
		"alunos_por_sala",
		"saude",
		"criticidade",
	} {
		value, ok := decoded[key]
		if !ok {
			t.Fatalf("missing JSON key %q in %s", key, raw)
		}
		if value != nil {
			t.Fatalf("JSON key %q = %v; want null", key, value)
		}
	}

	dimensoes, ok := decoded["dimensoes"].(map[string]any)
	if !ok {
		t.Fatalf("dimensoes missing or invalid in %s", raw)
	}
	for _, key := range []string{
		"infraestrutura",
		"energia",
		"merenda",
		"seguranca",
		"pessoal",
		"tecnologia",
		"pedagogico",
		"governanca",
	} {
		value, ok := dimensoes[key]
		if !ok || value != nil {
			t.Fatalf("dimensoes.%s = %v, present=%v; want explicit null", key, value, ok)
		}
	}
}

func TestSaudeOperacionalInvalidYearHandler(t *testing.T) {
	app := &application{}
	request := httptest.NewRequest(http.MethodGet, "/v1/admin/analytics/escolas/saude-operacional?year=invalid", nil)
	recorder := httptest.NewRecorder()

	app.AdminAnalyticsSaudeOperacionalEscolas(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d; want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}

	var response jsonResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.Error {
		t.Fatalf("error = false; want true; body=%s", recorder.Body.String())
	}
}

func TestSaudeOperacionalYearParsing(t *testing.T) {
	now := time.Date(2026, time.June, 8, 0, 0, 0, 0, time.UTC)

	year, err := parseSaudeOperacionalYear("", now)
	if err != nil || year != 2026 {
		t.Fatalf("default year = %d, err=%v; want 2026", year, err)
	}
	year, err = parseSaudeOperacionalYear("2025", now)
	if err != nil || year != 2025 {
		t.Fatalf("explicit year = %d, err=%v; want 2025", year, err)
	}

	for _, invalid := range []string{"0", "26", "abcd", "1899", "20260"} {
		if _, err := parseSaudeOperacionalYear(invalid, now); err == nil {
			t.Fatalf("parseSaudeOperacionalYear(%q) succeeded; want error", invalid)
		}
	}
}

func TestSaudeOperacionalPageSizeParsing(t *testing.T) {
	pageSize, err := parseSaudeOperacionalPageSize("")
	if err != nil || pageSize != 10 {
		t.Fatalf("default page_size = %d, err=%v; want 10", pageSize, err)
	}

	for _, valid := range []int{10, 50, 100, 1000} {
		t.Run(fmt.Sprintf("valid_%d", valid), func(t *testing.T) {
			got, err := parseSaudeOperacionalPageSize(strconv.Itoa(valid))
			if err != nil || got != valid {
				t.Fatalf("page_size = %d, err=%v; want %d", got, err, valid)
			}
		})
	}

	for _, invalid := range []string{"0", "1", "25", "999", "1001", "invalid"} {
		t.Run("invalid_"+invalid, func(t *testing.T) {
			if _, err := parseSaudeOperacionalPageSize(invalid); err == nil {
				t.Fatalf("parseSaudeOperacionalPageSize(%q) succeeded; want error", invalid)
			}
		})
	}
}

func TestSaudeOperacionalDirectionParsing(t *testing.T) {
	direction, err := parseSaudeOperacionalDirection("")
	if err != nil || direction != "desc" {
		t.Fatalf("default direction = %q, err=%v; want desc", direction, err)
	}

	for _, valid := range []string{"asc", "desc"} {
		got, err := parseSaudeOperacionalDirection(valid)
		if err != nil || got != valid {
			t.Fatalf("direction = %q, err=%v; want %q", got, err, valid)
		}
	}

	for _, invalid := range []string{"ASC", "descending", "invalid"} {
		if _, err := parseSaudeOperacionalDirection(invalid); err == nil {
			t.Fatalf("parseSaudeOperacionalDirection(%q) succeeded; want error", invalid)
		}
	}
}

func TestSaudeOperacionalInvalidPaginationHandler(t *testing.T) {
	tests := []string{
		"/v1/admin/analytics/escolas/saude-operacional?page_size=25",
		"/v1/admin/analytics/escolas/saude-operacional?direction=sideways",
	}

	for _, target := range tests {
		t.Run(target, func(t *testing.T) {
			app := &application{}
			request := httptest.NewRequest(http.MethodGet, target, nil)
			recorder := httptest.NewRecorder()

			app.AdminAnalyticsSaudeOperacionalEscolas(recorder, request)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d; want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
			var response jsonResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if !response.Error {
				t.Fatalf("error = false; want true; body=%s", recorder.Body.String())
			}
		})
	}
}

func TestSaudeOperacionalFilteredSummaryAndPagination(t *testing.T) {
	allEscolas := make([]SaudeOperacionalEscola, 0, 13)
	for i := 1; i <= 11; i++ {
		criticidade := float64(i)
		saude := 100 - criticidade
		status := "saudavel"
		if i > 5 && i <= 8 {
			status = "atencao"
		} else if i > 8 {
			status = "critica"
		}
		allEscolas = append(allEscolas, SaudeOperacionalEscola{
			SchoolID:    i,
			Escola:      fmt.Sprintf("Escola %02d", i),
			Municipio:   "Castanhal",
			Saude:       &saude,
			Criticidade: &criticidade,
			Status:      status,
		})
	}
	allEscolas = append(allEscolas,
		SaudeOperacionalEscola{
			SchoolID:  12,
			Escola:    "Escola sem dados",
			Municipio: "Castanhal",
			Status:    "sem_dados",
		},
		SaudeOperacionalEscola{
			SchoolID:    13,
			Escola:      "Escola fora da busca",
			Municipio:   "Belém",
			Saude:       floatPointerForTest(0),
			Criticidade: floatPointerForTest(100),
			Status:      "critica",
		},
	)

	pageItems, resumo, totalFiltrado, totalPages, currentPage := buildSaudeOperacionalPage(
		allEscolas,
		"CASTANHAL",
		"criticidade",
		"desc",
		2,
		10,
	)

	if totalFiltrado != 12 {
		t.Fatalf("total_filtrado = %d; want 12", totalFiltrado)
	}
	if totalPages != 2 || currentPage != 2 {
		t.Fatalf("pagination = page %d of %d; want page 2 of 2", currentPage, totalPages)
	}
	if len(pageItems) != 2 {
		t.Fatalf("page items = %d; want 2", len(pageItems))
	}
	if pageItems[0].SchoolID != 1 || pageItems[1].Status != "sem_dados" {
		t.Fatalf("page order = %+v; want lowest criticidade followed by sem_dados", pageItems)
	}
	if resumo.Saudaveis != 5 || resumo.Atencao != 3 || resumo.Criticas != 3 || resumo.SemDados != 1 {
		t.Fatalf("filtered resumo = %+v; want 5/3/3/1", resumo)
	}
	if resumo.SaudeMedia == nil || *resumo.SaudeMedia != 94 {
		t.Fatalf("filtered saude_media = %v; want 94", resumo.SaudeMedia)
	}
}

func TestSaudeOperacionalZeroIsNotNullAndSemDadosSortsLast(t *testing.T) {
	escolas := []SaudeOperacionalEscola{
		{
			SchoolID:    1,
			Escola:      "Zero válido",
			Saude:       floatPointerForTest(0),
			Criticidade: floatPointerForTest(100),
			Status:      "critica",
		},
		{
			SchoolID: 2,
			Escola:   "Sem dados",
			Status:   "sem_dados",
		},
	}

	pageItems, resumo, totalFiltrado, _, _ := buildSaudeOperacionalPage(
		escolas,
		"",
		"saude",
		"asc",
		1,
		10,
	)

	if totalFiltrado != 2 || len(pageItems) != 2 {
		t.Fatalf("items = %d, total = %d; want 2", len(pageItems), totalFiltrado)
	}
	if pageItems[0].SchoolID != 1 || pageItems[1].Status != "sem_dados" {
		t.Fatalf("order = %+v; want zero before sem_dados", pageItems)
	}
	if resumo.SaudeMedia == nil || *resumo.SaudeMedia != 0 {
		t.Fatalf("saude_media = %v; want legitimate zero", resumo.SaudeMedia)
	}
}

// --- Filtros globais (dre, municipio, zona, regiao_integracao) ---

// TestSaudeOperacionalParseFilters cobre a leitura dos filtros globais da query
// string: valores são lidos, espaços removidos e ausência vira string vazia.
func TestSaudeOperacionalParseFilters(t *testing.T) {
	t.Run("todos preenchidos", func(t *testing.T) {
		q := url.Values{
			"dre":               {"CASTANHAL"},
			"municipio":         {"BELEM"},
			"zona":              {"Urbana"},
			"regiao_integracao": {"GUAJARA"},
		}
		got := parseSaudeOperacionalFilters(q)
		want := saudeOperacionalFilters{
			DRE:              "CASTANHAL",
			Municipio:        "BELEM",
			Zona:             "Urbana",
			RegiaoIntegracao: "GUAJARA",
		}
		if got != want {
			t.Fatalf("parseSaudeOperacionalFilters = %+v; want %+v", got, want)
		}
	})

	t.Run("ausentes viram vazio", func(t *testing.T) {
		got := parseSaudeOperacionalFilters(url.Values{})
		if got != (saudeOperacionalFilters{}) {
			t.Fatalf("parseSaudeOperacionalFilters(empty) = %+v; want zero value", got)
		}
	})

	t.Run("espacos sao removidos (filtro desativado)", func(t *testing.T) {
		q := url.Values{
			"dre":               {"  "},
			"municipio":         {"  Castanhal  "},
			"zona":              {""},
			"regiao_integracao": {"\t"},
		}
		got := parseSaudeOperacionalFilters(q)
		want := saudeOperacionalFilters{Municipio: "Castanhal"}
		if got != want {
			t.Fatalf("parseSaudeOperacionalFilters(spaces) = %+v; want %+v", got, want)
		}
	})
}

// TestSaudeOperacionalBuildQueryArgs garante que cada filtro global é
// posicionado no argumento correto ($1=year, $2=dre, $3=municipio, $4=zona,
// $5=regiao_integracao). Como a filtragem ocorre em SQL sobre schools s, a
// presença do valor no argumento correto comprova que o filtro reduz o
// universo carregado (que alimenta total_escolas, resumo e paginação).
func TestSaudeOperacionalBuildQueryArgs(t *testing.T) {
	tests := []struct {
		name    string
		year    int
		filters saudeOperacionalFilters
		want    []any
	}{
		{
			name: "sem filtros",
			year: 2026,
			want: []any{2026, "", "", "", ""},
		},
		{
			name:    "dre filtra o universo",
			year:    2026,
			filters: saudeOperacionalFilters{DRE: "CASTANHAL"},
			want:    []any{2026, "CASTANHAL", "", "", ""},
		},
		{
			name:    "municipio filtra o universo",
			year:    2026,
			filters: saudeOperacionalFilters{Municipio: "BELEM"},
			want:    []any{2026, "", "BELEM", "", ""},
		},
		{
			name:    "zona filtra o universo",
			year:    2026,
			filters: saudeOperacionalFilters{Zona: "Urbana"},
			want:    []any{2026, "", "", "Urbana", ""},
		},
		{
			name:    "regiao_integracao filtra o universo",
			year:    2026,
			filters: saudeOperacionalFilters{RegiaoIntegracao: "GUAJARA"},
			want:    []any{2026, "", "", "", "GUAJARA"},
		},
		{
			name: "multiplos filtros combinados por AND",
			year: 2025,
			filters: saudeOperacionalFilters{
				DRE:              "BELEM",
				Municipio:        "BELEM",
				Zona:             "Urbana",
				RegiaoIntegracao: "GUAJARA",
			},
			want: []any{2025, "BELEM", "BELEM", "Urbana", "GUAJARA"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query, args := buildSaudeOperacionalQuery(tt.year, tt.filters)
			if len(args) != len(tt.want) {
				t.Fatalf("args = %v; want %v", args, tt.want)
			}
			for i := range tt.want {
				if args[i] != tt.want[i] {
					t.Fatalf("args[%d] = %v; want %v (args=%v)", i, args[i], tt.want[i], args)
				}
			}
			if query != saudeOperacionalSelectSQL {
				t.Fatalf("query difere de saudeOperacionalSelectSQL")
			}
		})
	}
}

// TestSaudeOperacionalQueryShape valida que a query preserva o LEFT JOIN
// (escolas sem censo continuam no resultado), aplica os filtros sobre schools s
// e combina-os por AND. A Região de Integração usa subconsulta em reg_integracao.
func TestSaudeOperacionalQueryShape(t *testing.T) {
	query := saudeOperacionalSelectSQL

	mustContain := []string{
		"FROM schools s",
		"LEFT JOIN census_responses cr",
		"AND cr.year = $1",
		"AND cr.status = 'completed'",
		"($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))",
		"($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))",
		"($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))",
		"FROM reg_integracao",
		"UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))",
	}
	for _, fragment := range mustContain {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query não contém %q", fragment)
		}
	}

	// LEFT JOIN não pode ter virado INNER JOIN nem ganhado filtro de census_id.
	if strings.Contains(query, "INNER JOIN") {
		t.Fatalf("query usa INNER JOIN; o LEFT JOIN deve ser preservado")
	}
	if strings.Contains(query, "census_id IS NOT NULL") {
		t.Fatalf("query exige census_id IS NOT NULL; escolas sem censo seriam excluídas")
	}

	// Os quatro filtros globais devem estar todos sob a mesma cláusula WHERE,
	// portanto combinados por AND.
	if strings.Count(query, " AND ($") < 3 {
		t.Fatalf("filtros globais não parecem combinados por AND: %s", query)
	}
}

// TestSaudeOperacionalEmptyRecorte cobre o recorte global que não retorna
// nenhuma escola: o payload deve ser válido (sem erro 500), com totais zerados,
// resumo zerado, saude_media nula e lista vazia.
func TestSaudeOperacionalEmptyRecorte(t *testing.T) {
	pageItems, resumo, totalFiltrado, totalPages, currentPage := buildSaudeOperacionalPage(
		[]SaudeOperacionalEscola{},
		"",
		"criticidade",
		"desc",
		1,
		10,
	)

	if len(pageItems) != 0 {
		t.Fatalf("page items = %d; want 0", len(pageItems))
	}
	if totalFiltrado != 0 || totalPages != 0 {
		t.Fatalf("total_filtrado = %d, total_pages = %d; want 0/0", totalFiltrado, totalPages)
	}
	if currentPage != 1 {
		t.Fatalf("current_page = %d; want 1", currentPage)
	}
	if resumo.Saudaveis != 0 || resumo.Atencao != 0 || resumo.Criticas != 0 || resumo.SemDados != 0 {
		t.Fatalf("resumo = %+v; want todos zero", resumo)
	}
	if resumo.SaudeMedia != nil {
		t.Fatalf("saude_media = %v; want nil", *resumo.SaudeMedia)
	}
}

// TestSaudeOperacionalRecorteResumoEPaginacao demonstra que, dado um universo já
// recortado pelos filtros globais (entrada de buildSaudeOperacionalPage), o
// resumo é calculado sobre recorte + busca e antes da paginação, e que escolas
// sem censo concluído permanecem como sem_dados dentro do recorte.
func TestSaudeOperacionalRecorteResumoEPaginacao(t *testing.T) {
	// Universo já filtrado por dre=CASTANHAL: 1 saudável, 1 atenção, 1 crítica
	// e 1 pendente de censo (sem_dados). Paginamos em páginas de 2.
	universo := []SaudeOperacionalEscola{
		{SchoolID: 1, Escola: "Escola Alfa", DRE: "CASTANHAL", Saude: floatPointerForTest(80), Criticidade: floatPointerForTest(20), Status: "saudavel"},
		{SchoolID: 2, Escola: "Escola Beta", DRE: "CASTANHAL", Saude: floatPointerForTest(60), Criticidade: floatPointerForTest(40), Status: "atencao"},
		{SchoolID: 3, Escola: "Escola Gama", DRE: "CASTANHAL", Saude: floatPointerForTest(40), Criticidade: floatPointerForTest(60), Status: "critica"},
		{SchoolID: 4, Escola: "Escola Delta", DRE: "CASTANHAL", Status: "sem_dados"},
	}

	pageItems, resumo, totalFiltrado, totalPages, currentPage := buildSaudeOperacionalPage(
		universo,
		"",
		"criticidade",
		"desc",
		1,
		2,
	)

	if totalFiltrado != 4 {
		t.Fatalf("total_filtrado = %d; want 4 (todo o recorte)", totalFiltrado)
	}
	if resumo.Saudaveis != 1 || resumo.Atencao != 1 || resumo.Criticas != 1 || resumo.SemDados != 1 {
		t.Fatalf("resumo = %+v; want 1/1/1/1 calculado sobre o recorte inteiro", resumo)
	}
	if resumo.SaudeMedia == nil || *resumo.SaudeMedia != 60 {
		t.Fatalf("saude_media = %v; want 60 (média de 80/60/40)", resumo.SaudeMedia)
	}
	if totalPages != 2 || currentPage != 1 {
		t.Fatalf("paginação = page %d de %d; want page 1 de 2 (resumo antes de paginar)", currentPage, totalPages)
	}
	if len(pageItems) != 2 {
		t.Fatalf("page items = %d; want 2", len(pageItems))
	}
	// A escola sem_dados permanece no recorte e é empurrada para o fim.
	if pageItems[len(pageItems)-1].Status == "sem_dados" {
		t.Fatalf("sem_dados não deveria aparecer na primeira página de 2 itens com 3 escolas avaliadas")
	}

	// Busca textual refina dentro do recorte global.
	_, resumoBusca, totalBusca, _, _ := buildSaudeOperacionalPage(universo, "Alfa", "criticidade", "desc", 1, 10)
	if totalBusca != 1 || resumoBusca.Saudaveis != 1 {
		t.Fatalf("busca dentro do recorte: total=%d resumo=%+v; want 1 escola saudável", totalBusca, resumoBusca)
	}
}

func assertOptionalFloat(t *testing.T, got, want *float64) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Fatalf("got %v; want nil", *got)
		}
		return
	}
	if got == nil {
		t.Fatalf("got nil; want %v", *want)
	}
	if math.Abs(*got-*want) > 1e-9 {
		t.Fatalf("got %v; want %v", *got, *want)
	}
}

func floatPointerForTest(value float64) *float64 {
	return &value
}

func intPointerForTest(value int) *int {
	return &value
}
