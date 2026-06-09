package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	saudeOperacionalNome   = "Índice de Saúde Operacional por escola"
	saudeOperacionalVersao = "1.0.0"
)

var saudeOperacionalDimensoesHabilitadas = []string{
	"infraestrutura",
	"energia",
	"merenda",
	"seguranca",
	"pessoal",
	"tecnologia",
}

type SaudeOperacionalPesos struct {
	Infraestrutura float64 `json:"infraestrutura"`
	Energia        float64 `json:"energia"`
	Merenda        float64 `json:"merenda"`
	Seguranca      float64 `json:"seguranca"`
	Pessoal        float64 `json:"pessoal"`
	Tecnologia     float64 `json:"tecnologia"`
	Pedagogico     float64 `json:"pedagogico"`
	Governanca     float64 `json:"governanca"`
}

type SaudeOperacionalMetodologia struct {
	Nome                 string                `json:"nome"`
	Versao               string                `json:"versao"`
	DimensoesHabilitadas []string              `json:"dimensoes_habilitadas"`
	Pesos                SaudeOperacionalPesos `json:"pesos"`
}

type SaudeOperacionalDimensoes struct {
	Infraestrutura *float64 `json:"infraestrutura"`
	Energia        *float64 `json:"energia"`
	Merenda        *float64 `json:"merenda"`
	Seguranca      *float64 `json:"seguranca"`
	Pessoal        *float64 `json:"pessoal"`
	Tecnologia     *float64 `json:"tecnologia"`
	Pedagogico     *float64 `json:"pedagogico"`
	Governanca     *float64 `json:"governanca"`
}

type SaudeOperacionalEscola struct {
	SchoolID      int                       `json:"school_id"`
	CensusID      *int                      `json:"census_id"`
	CodigoINEP    *string                   `json:"codigo_inep"`
	Escola        string                    `json:"escola"`
	Municipio     string                    `json:"municipio"`
	DRE           string                    `json:"dre"`
	Zona          *string                   `json:"zona"`
	TotalAlunos   *int                      `json:"total_alunos"`
	SalasAula     *int                      `json:"salas_aula"`
	AlunosPorSala *float64                  `json:"alunos_por_sala"`
	Saude         *float64                  `json:"saude"`
	Criticidade   *float64                  `json:"criticidade"`
	Status        string                    `json:"status"`
	Dimensoes     SaudeOperacionalDimensoes `json:"dimensoes"`
}

type SaudeOperacionalPayload struct {
	TotalEscolas  int                         `json:"total_escolas"`
	AnoReferencia int                         `json:"ano_referencia"`
	Metodologia   SaudeOperacionalMetodologia `json:"metodologia"`
	Escolas       []SaudeOperacionalEscola    `json:"escolas"`
}

type weightedHealthValue struct {
	Value  *float64
	Weight float64
}

type saudeOperacionalCalculation struct {
	TotalAlunos   *int
	SalasAula     *int
	AlunosPorSala *float64
	Saude         *float64
	Criticidade   *float64
	Status        string
	Dimensoes     SaudeOperacionalDimensoes
}

type saudeOperacionalDBRow struct {
	SchoolID   int
	CodigoINEP sql.NullString
	Escola     string
	Municipio  string
	DRE        string
	Zona       sql.NullString
	CensusID   sql.NullInt64
	Data       []byte
}

var (
	situacaoEstruturaScores = map[string]float64{
		"Não necessita de reforma.":                       100,
		"Foi reformada recentemente":                      90,
		"Reforma em andamento":                            62,
		"Necessita de reforma parcial (melhoria pontual)": 45,
		"Está em reforma, porém a obra está parada":       30,
		"Necessita de reforma geral":                      12,
	}
	// Respostas parciais de infraestrutura usam a faixa intermediária da metodologia v1.0.0.
	banheirosFuncionaisScores = map[string]float64{
		"Todos":  100,
		"Alguns": 50,
		"Nenhum": 0,
	}
	muroCercaScores = map[string]float64{
		"Sim, muro":  100,
		"Sim, cerca": 80,
		"Não possui": 0,
	}
	// O legado "Não" significa incapacidade de climatizar; salas já climatizadas permanecem situação ideal.
	estruturaClimatizacaoScores = map[string]float64{
		"Sim":                                  100,
		"Não, todas as salas são climatizadas": 100,
		"Não, somente com adequações":          45,
		"Não":                                  0,
	}
	// Tipo de prédio é graduado por autonomia e estabilidade de uso do imóvel.
	tipoPredioScores = map[string]float64{
		"Próprio":       100,
		"Cedido":        75,
		"Alugado":       60,
		"Compartilhado": 45,
	}
	simParcialNaoScores = map[string]float64{
		"Sim":          100,
		"Parcialmente": 50,
		"Não":          0,
	}
	simNaoScores = map[string]float64{
		"Sim": 100,
		"Não": 0,
	}
	energiaFornecimentoScores = map[string]float64{
		"Concessionária de energia - Equatorial": 100,
		// Geração própria recebe nota intermediária por não informar, sozinha, a confiabilidade do fornecimento.
		"Geração própria": 60,
	}
	ofertaRegularScores = map[string]float64{
		"Sim":             100,
		"Sim, com falhas": 60,
		"Não":             0,
	}
	// "Regular", "Ruim" e "Precária" seguem as faixas intermediária e crítica da metodologia.
	qualidadeMerendaScores = map[string]float64{
		"Boa":     100,
		"Regular": 50,
		"Ruim":    20,
	}
	condicoesCozinhaScores = map[string]float64{
		"Boa":      100,
		"Regular":  50,
		"Precária": 20,
	}
	camerasFuncionamentoScores = map[string]float64{
		"Sim, funcionando plenamente": 100,
		"Sim, parcialmente":           50,
		"Não possui":                  0,
	}
	controlePortaoScores = map[string]float64{
		// A escala diferencia automação, barreira física dedicada e operação somente manual.
		"Eletrônica": 100,
		"Fechadura":  70,
		"Manual":     45,
	}
	// Iluminação insuficiente é crítica, mas não equivale à ausência total do item.
	iluminacaoExternaScores = map[string]float64{
		"Adequada":     100,
		"Regular":      50,
		"Insuficiente": 20,
	}
	qualidadeInternetScores = map[string]float64{
		"A internet não funciona ou está indisponível com frequência":        0,
		"A internet apresenta lentidão frequente e compromete as atividades": 28,
		"A internet possui velocidade aceitável, com eventuais oscilações":   62,
		"A internet é estável e atende plenamente às necessidades da escola": 100,
	}
)

func saudeOperacionalPesosMetodologia() SaudeOperacionalPesos {
	return SaudeOperacionalPesos{
		Infraestrutura: 0.20,
		Energia:        0.10,
		Merenda:        0.15,
		Seguranca:      0.15,
		Pessoal:        0.12,
		Tecnologia:     0.12,
		Pedagogico:     0.08,
		Governanca:     0.08,
	}
}

func saudeOperacionalMetodologiaPayload() SaudeOperacionalMetodologia {
	return SaudeOperacionalMetodologia{
		Nome:                 saudeOperacionalNome,
		Versao:               saudeOperacionalVersao,
		DimensoesHabilitadas: append([]string(nil), saudeOperacionalDimensoesHabilitadas...),
		Pesos:                saudeOperacionalPesosMetodologia(),
	}
}

func ptrFloat(value float64) *float64 {
	return &value
}

func ptrInt(value int) *int {
	return &value
}

func ptrString(value string) *string {
	return &value
}

func roundOptional1(value *float64) *float64 {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
		return nil
	}
	return ptrFloat(round1(*value))
}

func scoreCategorical(value any, scores map[string]float64) *float64 {
	text, ok := value.(string)
	if !ok {
		return nil
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	score, ok := scores[text]
	if !ok {
		return nil
	}
	return ptrFloat(score)
}

func meanValid(values ...*float64) *float64 {
	var sum float64
	var count int
	for _, value := range values {
		if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
			continue
		}
		sum += *value
		count++
	}
	if count == 0 {
		return nil
	}
	return ptrFloat(sum / float64(count))
}

func weightedMeanValid(values ...weightedHealthValue) *float64 {
	var weightedSum float64
	var weightSum float64
	for _, item := range values {
		if item.Value == nil || item.Weight <= 0 ||
			math.IsNaN(*item.Value) || math.IsInf(*item.Value, 0) ||
			math.IsNaN(item.Weight) || math.IsInf(item.Weight, 0) {
			continue
		}
		weightedSum += *item.Value * item.Weight
		weightSum += item.Weight
	}
	if weightSum == 0 {
		return nil
	}
	return ptrFloat(weightedSum / weightSum)
}

func classifyHealth(saude *float64) string {
	if saude == nil || math.IsNaN(*saude) || math.IsInf(*saude, 0) {
		return "sem_dados"
	}
	if *saude >= 70 {
		return "saudavel"
	}
	if *saude >= 50 {
		return "atencao"
	}
	return "critica"
}

func parseOptionalFloat(value any) *float64 {
	var parsed float64
	var err error

	switch typed := value.(type) {
	case json.Number:
		parsed, err = typed.Float64()
	case string:
		text := strings.TrimSpace(typed)
		if text == "" {
			return nil
		}
		parsed, err = strconv.ParseFloat(text, 64)
	case float64:
		parsed = typed
	case float32:
		parsed = float64(typed)
	case int:
		parsed = float64(typed)
	case int8:
		parsed = float64(typed)
	case int16:
		parsed = float64(typed)
	case int32:
		parsed = float64(typed)
	case int64:
		parsed = float64(typed)
	case uint:
		parsed = float64(typed)
	case uint8:
		parsed = float64(typed)
	case uint16:
		parsed = float64(typed)
	case uint32:
		parsed = float64(typed)
	case uint64:
		parsed = float64(typed)
	default:
		return nil
	}

	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return nil
	}
	return ptrFloat(parsed)
}

func parseOptionalInt(value any) *int {
	parsed := parseOptionalFloat(value)
	if parsed == nil || *parsed < 0 || math.Trunc(*parsed) != *parsed {
		return nil
	}
	if *parsed > float64(^uint(0)>>1) {
		return nil
	}
	return ptrInt(int(*parsed))
}

func calculateInfrastructure(data map[string]any) *float64 {
	return meanValid(
		scoreCategorical(data["situacao_estrutura"], situacaoEstruturaScores),
		scoreCategorical(data["banheiros_vasos_funcionais"], banheirosFuncionaisScores),
		scoreCategorical(data["muro_cerca"], muroCercaScores),
		scoreCategorical(data["estrutura_climatizacao"], estruturaClimatizacaoScores),
		scoreCategorical(data["tipo_predio"], tipoPredioScores),
	)
}

func calculateEnergy(data map[string]any) *float64 {
	return meanValid(
		scoreCategorical(data["rede_eletrica_atende"], simParcialNaoScores),
		scoreCategorical(data["suporta_novos_equipamentos"], simParcialNaoScores),
		scoreCategorical(data["energia"], energiaFornecimentoScores),
	)
}

func calculateMerenda(data map[string]any) *float64 {
	return meanValid(
		scoreCategorical(data["oferta_regular"], ofertaRegularScores),
		scoreCategorical(data["qualidade_merenda"], qualidadeMerendaScores),
		scoreCategorical(data["atende_necessidades"], simParcialNaoScores),
		scoreCategorical(data["condicoes_cozinha"], condicoesCozinhaScores),
		scoreCategorical(data["qtd_atende_necessidade_merenda"], simNaoScores),
	)
}

func calculateSecurity(data map[string]any) *float64 {
	return meanValid(
		scoreCategorical(data["cameras_funcionamento"], camerasFuncionamentoScores),
		scoreCategorical(data["possui_guarita"], simNaoScores),
		scoreCategorical(data["possui_botao_panico"], simNaoScores),
		scoreCategorical(data["controle_portao"], controlePortaoScores),
		scoreCategorical(data["iluminacao_externa"], iluminacaoExternaScores),
		scoreCategorical(data["qtd_atende_necessidade_portaria"], simNaoScores),
	)
}

func calculatePeople(data map[string]any) *float64 {
	return meanValid(
		scoreCategorical(data["qtd_atende_necessidade_merenda"], simNaoScores),
		scoreCategorical(data["qtd_atende_necessidade_sg"], simNaoScores),
		scoreCategorical(data["qtd_atende_necessidade_portaria"], simNaoScores),
		scoreCategorical(data["possui_direcao"], simNaoScores),
		scoreCategorical(data["possui_coord_pedagogico"], simNaoScores),
	)
}

func calculateConnectivity(data map[string]any) *float64 {
	disponivel, ok := data["internet_disponivel"].(string)
	if !ok {
		return nil
	}
	switch strings.TrimSpace(disponivel) {
	case "Não":
		return ptrFloat(0)
	case "Sim":
		return scoreCategorical(data["qualidade_internet"], qualidadeInternetScores)
	default:
		return nil
	}
}

func calculateTechnology(data map[string]any) *float64 {
	return meanValid(
		calculateConnectivity(data),
		scoreCategorical(data["computadores_atendem"], simParcialNaoScores),
		scoreCategorical(data["possui_projetor"], simNaoScores),
	)
}

func calculateSchoolHealth(data map[string]any) saudeOperacionalCalculation {
	pesos := saudeOperacionalPesosMetodologia()
	infraestrutura := calculateInfrastructure(data)
	energia := calculateEnergy(data)
	merenda := calculateMerenda(data)
	seguranca := calculateSecurity(data)
	pessoal := calculatePeople(data)
	tecnologia := calculateTechnology(data)

	saudeRaw := weightedMeanValid(
		weightedHealthValue{Value: infraestrutura, Weight: pesos.Infraestrutura},
		weightedHealthValue{Value: energia, Weight: pesos.Energia},
		weightedHealthValue{Value: merenda, Weight: pesos.Merenda},
		weightedHealthValue{Value: seguranca, Weight: pesos.Seguranca},
		weightedHealthValue{Value: pessoal, Weight: pesos.Pessoal},
		weightedHealthValue{Value: tecnologia, Weight: pesos.Tecnologia},
	)
	saude := roundOptional1(saudeRaw)

	var criticidade *float64
	if saude != nil {
		criticidade = ptrFloat(round1(100 - *saude))
	}

	totalAlunos := parseOptionalInt(data["total_alunos"])
	salasAula := parseOptionalInt(data["qtd_salas_aula"])
	var alunosPorSala *float64
	if totalAlunos != nil && salasAula != nil && *salasAula > 0 {
		alunosPorSala = ptrFloat(round1(float64(*totalAlunos) / float64(*salasAula)))
	}

	return saudeOperacionalCalculation{
		TotalAlunos:   totalAlunos,
		SalasAula:     salasAula,
		AlunosPorSala: alunosPorSala,
		Saude:         saude,
		Criticidade:   criticidade,
		Status:        classifyHealth(saude),
		Dimensoes: SaudeOperacionalDimensoes{
			Infraestrutura: roundOptional1(infraestrutura),
			Energia:        roundOptional1(energia),
			Merenda:        roundOptional1(merenda),
			Seguranca:      roundOptional1(seguranca),
			Pessoal:        roundOptional1(pessoal),
			Tecnologia:     roundOptional1(tecnologia),
			Pedagogico:     nil,
			Governanca:     nil,
		},
	}
}

func decodeSaudeOperacionalData(raw []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()

	var data map[string]any
	if err := decoder.Decode(&data); err != nil {
		return nil, err
	}
	if data == nil {
		data = map[string]any{}
	}
	return data, nil
}

func nullableTrimmedString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	trimmed := strings.TrimSpace(value.String)
	if trimmed == "" {
		return nil
	}
	return ptrString(trimmed)
}

func buildSaudeOperacionalEscola(row saudeOperacionalDBRow) (SaudeOperacionalEscola, error) {
	out := SaudeOperacionalEscola{
		SchoolID:   row.SchoolID,
		CensusID:   nil,
		CodigoINEP: nullableTrimmedString(row.CodigoINEP),
		Escola:     row.Escola,
		Municipio:  row.Municipio,
		DRE:        row.DRE,
		Zona:       nullableTrimmedString(row.Zona),
		Status:     "sem_dados",
		Dimensoes:  SaudeOperacionalDimensoes{},
	}

	if !row.CensusID.Valid {
		return out, nil
	}

	censusID := int(row.CensusID.Int64)
	out.CensusID = &censusID

	data, err := decodeSaudeOperacionalData(row.Data)
	if err != nil {
		return SaudeOperacionalEscola{}, fmt.Errorf("decodificar JSONB do censo %d: %w", censusID, err)
	}
	calculation := calculateSchoolHealth(data)
	out.TotalAlunos = calculation.TotalAlunos
	out.SalasAula = calculation.SalasAula
	out.AlunosPorSala = calculation.AlunosPorSala
	out.Saude = calculation.Saude
	out.Criticidade = calculation.Criticidade
	out.Status = calculation.Status
	out.Dimensoes = calculation.Dimensoes

	return out, nil
}

func parseSaudeOperacionalYear(raw string, now time.Time) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return now.Year(), nil
	}
	if len(raw) != 4 {
		return 0, fmt.Errorf("year inválido: informe um ano com quatro dígitos")
	}
	year, err := strconv.Atoi(raw)
	if err != nil || year < 1900 {
		return 0, fmt.Errorf("year inválido: informe um ano com quatro dígitos")
	}
	return year, nil
}

// AdminAnalyticsSaudeOperacionalEscolas retorna todas as escolas cadastradas.
// Somente censos completed do ano solicitado alimentam métricas e dimensões.
func (app *application) AdminAnalyticsSaudeOperacionalEscolas(w http.ResponseWriter, r *http.Request) {
	year, err := parseSaudeOperacionalYear(r.URL.Query().Get("year"), time.Now())
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	rows, err := app.models.Schools.DB.QueryContext(r.Context(), `
		SELECT
			s.id,
			s.codigo_inep,
			COALESCE(s.nome_escola, ''),
			COALESCE(s.municipio, ''),
			COALESCE(s.dre, ''),
			s.zona,
			cr.id,
			cr.data
		FROM schools s
		LEFT JOIN census_responses cr
		  ON cr.school_id = s.id
		 AND cr.year = $1
		 AND cr.status = 'completed'
		ORDER BY s.nome_escola
	`, year)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("consultar saúde operacional das escolas: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := SaudeOperacionalPayload{
		AnoReferencia: year,
		Metodologia:   saudeOperacionalMetodologiaPayload(),
		Escolas:       []SaudeOperacionalEscola{},
	}

	for rows.Next() {
		var row saudeOperacionalDBRow
		if err := rows.Scan(
			&row.SchoolID,
			&row.CodigoINEP,
			&row.Escola,
			&row.Municipio,
			&row.DRE,
			&row.Zona,
			&row.CensusID,
			&row.Data,
		); err != nil {
			app.errorJSON(w, fmt.Errorf("ler escola da saúde operacional: %v", err), http.StatusInternalServerError)
			return
		}

		escola, err := buildSaudeOperacionalEscola(row)
		if err != nil {
			app.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
		out.Escolas = append(out.Escolas, escola)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar escolas da saúde operacional: %v", err), http.StatusInternalServerError)
		return
	}

	out.TotalEscolas = len(out.Escolas)
	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
