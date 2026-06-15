package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const (
	saudeOperacionalNome            = "Índice de Saúde Operacional por escola"
	saudeOperacionalVersao          = "1.1.0"
	saudeOperacionalPageSizeDefault = 10
)

var saudeOperacionalDimensoesHabilitadas = []string{
	"infraestrutura",
	"energia",
	"merenda",
	"seguranca",
	"pessoal",
	"tecnologia",
	"governanca",
}

var saudeOperacionalPageSizes = map[int]bool{
	10:   true,
	50:   true,
	100:  true,
	1000: true,
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

type SaudeOperacionalResumo struct {
	Saudaveis  int      `json:"saudaveis"`
	Atencao    int      `json:"atencao"`
	Criticas   int      `json:"criticas"`
	SemDados   int      `json:"sem_dados"`
	SaudeMedia *float64 `json:"saude_media"`
}

type SaudeOperacionalPayload struct {
	TotalEscolas  int                         `json:"total_escolas"`
	TotalFiltrado int                         `json:"total_filtrado"`
	Page          int                         `json:"page"`
	PageSize      int                         `json:"page_size"`
	TotalPages    int                         `json:"total_pages"`
	AnoReferencia int                         `json:"ano_referencia"`
	Metodologia   SaudeOperacionalMetodologia `json:"metodologia"`
	Resumo        SaudeOperacionalResumo      `json:"resumo"`
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

// calculatePeople mede a suficiência de pessoal operacional/de apoio (merenda,
// serviços gerais e portaria). As funções de gestão escolar (direção,
// coordenação pedagógica, etc.) migraram para a dimensão Governança a partir do
// Saúde-01B, evitando dupla contagem entre Pessoal/RH e Governança.
func calculatePeople(data map[string]any) *float64 {
	return meanValid(
		scoreCategorical(data["qtd_atende_necessidade_merenda"], simNaoScores),
		scoreCategorical(data["qtd_atende_necessidade_sg"], simNaoScores),
		scoreCategorical(data["qtd_atende_necessidade_portaria"], simNaoScores),
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

// normalizeGovText extrai uma string do JSONB e a normaliza para comparação
// tolerante (trim, minúsculas, sem acentos), reaproveitando normalizeSaudeSearch.
// O segundo retorno indica se há, de fato, um valor preenchido para o campo:
// valores ausentes, não-string ou vazios contam como "não informado".
func normalizeGovText(value any) (string, bool) {
	text, ok := value.(string)
	if !ok {
		return "", false
	}
	if strings.TrimSpace(text) == "" {
		return "", false
	}
	return normalizeSaudeSearch(text), true
}

// calculateGovernance pontua a dimensão Governança (0–100): equipe gestora
// (direção, secretário, coordenação pedagógica e, por regra OU, algum
// vice-diretor), regularização institucional junto ao CEE/PA e conselho escolar
// constituído/ativo. A comparação é case/acento-insensível.
//
// Se NENHUM campo candidato estiver presente no JSON, retorna nil para preservar
// o padrão "sem dados". Se ao menos um campo existir, retorna número: respostas
// "Não"/equivalentes/ausentes pontuam 0, mas não anulam a dimensão.
func calculateGovernance(data map[string]any) *float64 {
	var score float64
	present := false

	addSim := func(key string, points float64) {
		norm, ok := normalizeGovText(data[key])
		if !ok {
			return
		}
		present = true
		if norm == "sim" {
			score += points
		}
	}

	addSim("possui_direcao", 20)
	addSim("possui_secretario", 10)
	addSim("possui_coord_pedagogico", 10)

	// Bloco de vice-diretor por regra OU: pontua se houver vice pedagógico OU
	// administrativo. Considera-se presente se qualquer um dos campos existir.
	vicePed, okPed := normalizeGovText(data["possui_vice_pedagogico"])
	viceAdm, okAdm := normalizeGovText(data["possui_vice_administrativo"])
	if okPed || okAdm {
		present = true
		if vicePed == "sim" || viceAdm == "sim" {
			score += 10
		}
	}

	addSim("regularizada_cee", 15)
	addSim("conselho_escolar", 15)

	// Conselho ativo: Sim=20, Parcialmente=10, demais (Não/vazio)=0.
	if norm, ok := normalizeGovText(data["conselho_ativo"]); ok {
		present = true
		switch norm {
		case "sim":
			score += 20
		case "parcialmente":
			score += 10
		}
	}

	if !present {
		return nil
	}
	return ptrFloat(score)
}

func calculateSchoolHealth(data map[string]any) saudeOperacionalCalculation {
	pesos := saudeOperacionalPesosMetodologia()
	infraestrutura := calculateInfrastructure(data)
	energia := calculateEnergy(data)
	merenda := calculateMerenda(data)
	seguranca := calculateSecurity(data)
	pessoal := calculatePeople(data)
	tecnologia := calculateTechnology(data)
	governanca := calculateGovernance(data)

	saudeRaw := weightedMeanValid(
		weightedHealthValue{Value: infraestrutura, Weight: pesos.Infraestrutura},
		weightedHealthValue{Value: energia, Weight: pesos.Energia},
		weightedHealthValue{Value: merenda, Weight: pesos.Merenda},
		weightedHealthValue{Value: seguranca, Weight: pesos.Seguranca},
		weightedHealthValue{Value: pessoal, Weight: pesos.Pessoal},
		weightedHealthValue{Value: tecnologia, Weight: pesos.Tecnologia},
		weightedHealthValue{Value: governanca, Weight: pesos.Governanca},
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
			Governanca:     roundOptional1(governanca),
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

func normalizeSaudeSearch(s string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}), norm.NFC)
	result, _, _ := transform.String(t, strings.ToLower(strings.TrimSpace(s)))
	return result
}

func getSaudeEscolaValue(e SaudeOperacionalEscola, key string) (numVal *float64, strVal *string, isNum bool) {
	switch key {
	case "escola":
		return nil, &e.Escola, false
	case "municipio":
		return nil, &e.Municipio, false
	case "dre":
		return nil, &e.DRE, false
	case "zona":
		return nil, e.Zona, false
	case "total_alunos":
		if e.TotalAlunos != nil {
			f := float64(*e.TotalAlunos)
			return &f, nil, true
		}
		return nil, nil, true
	case "alunos_por_sala":
		return e.AlunosPorSala, nil, true
	case "saude":
		return e.Saude, nil, true
	case "criticidade":
		return e.Criticidade, nil, true
	case "infraestrutura":
		return e.Dimensoes.Infraestrutura, nil, true
	case "energia":
		return e.Dimensoes.Energia, nil, true
	case "merenda":
		return e.Dimensoes.Merenda, nil, true
	case "seguranca":
		return e.Dimensoes.Seguranca, nil, true
	case "pessoal":
		return e.Dimensoes.Pessoal, nil, true
	case "tecnologia":
		return e.Dimensoes.Tecnologia, nil, true
	case "pedagogico":
		return e.Dimensoes.Pedagogico, nil, true
	case "governanca":
		return e.Dimensoes.Governanca, nil, true
	default:
		return e.Criticidade, nil, true
	}
}

func compareSaudeEscola(a, b SaudeOperacionalEscola, key, direction string) int {
	// sem_dados sempre vai para o final, independente da direção.
	aSemDados := a.Status == "sem_dados"
	bSemDados := b.Status == "sem_dados"
	if aSemDados != bSemDados {
		if aSemDados {
			return 1
		}
		return -1
	}

	aNum, aStr, isNum := getSaudeEscolaValue(a, key)
	bNum, bStr, _ := getSaudeEscolaValue(b, key)

	var cmp int
	if isNum {
		aNull := aNum == nil
		bNull := bNum == nil
		if aNull != bNull {
			if aNull {
				return 1
			}
			return -1
		}
		if !aNull {
			if *aNum < *bNum {
				cmp = -1
			} else if *aNum > *bNum {
				cmp = 1
			}
		}
	} else {
		aNull := aStr == nil
		bNull := bStr == nil
		if aNull != bNull {
			if aNull {
				return 1
			}
			return -1
		}
		if !aNull {
			cmp = strings.Compare(normalizeSaudeSearch(*aStr), normalizeSaudeSearch(*bStr))
		}
	}

	if cmp != 0 {
		if direction == "desc" {
			return -cmp
		}
		return cmp
	}

	// Desempate: nome da escola, depois school_id.
	if cmpNome := strings.Compare(normalizeSaudeSearch(a.Escola), normalizeSaudeSearch(b.Escola)); cmpNome != 0 {
		return cmpNome
	}
	return a.SchoolID - b.SchoolID
}

func buildSaudeResumo(escolas []SaudeOperacionalEscola) SaudeOperacionalResumo {
	var resumo SaudeOperacionalResumo
	var sumSaude float64
	var countSaude int
	for _, e := range escolas {
		switch e.Status {
		case "saudavel":
			resumo.Saudaveis++
		case "atencao":
			resumo.Atencao++
		case "critica":
			resumo.Criticas++
		default:
			resumo.SemDados++
		}
		if e.Saude != nil {
			sumSaude += *e.Saude
			countSaude++
		}
	}
	if countSaude > 0 {
		media := round1(sumSaude / float64(countSaude))
		resumo.SaudeMedia = &media
	}
	return resumo
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

func parseSaudeOperacionalPageSize(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return saudeOperacionalPageSizeDefault, nil
	}

	pageSize, err := strconv.Atoi(raw)
	if err != nil || !saudeOperacionalPageSizes[pageSize] {
		return 0, fmt.Errorf("page_size inválido: use 10, 50, 100 ou 1000")
	}
	return pageSize, nil
}

func parseSaudeOperacionalDirection(raw string) (string, error) {
	direction := strings.TrimSpace(raw)
	if direction == "" {
		return "desc", nil
	}
	if direction != "asc" && direction != "desc" {
		return "", fmt.Errorf("direction inválido: use asc ou desc")
	}
	return direction, nil
}

func filterSaudeOperacionalEscolas(
	escolas []SaudeOperacionalEscola,
	searchQuery string,
) []SaudeOperacionalEscola {
	searchQuery = normalizeSaudeSearch(searchQuery)
	if searchQuery == "" {
		return append([]SaudeOperacionalEscola(nil), escolas...)
	}

	filtered := make([]SaudeOperacionalEscola, 0)
	for _, e := range escolas {
		inep := ""
		if e.CodigoINEP != nil {
			inep = *e.CodigoINEP
		}
		if strings.Contains(normalizeSaudeSearch(e.Escola), searchQuery) ||
			strings.Contains(normalizeSaudeSearch(e.Municipio), searchQuery) ||
			strings.Contains(normalizeSaudeSearch(e.DRE), searchQuery) ||
			strings.Contains(strings.ToLower(inep), searchQuery) {
			filtered = append(filtered, e)
		}
	}
	return filtered
}

func buildSaudeOperacionalPage(
	allEscolas []SaudeOperacionalEscola,
	searchQuery string,
	sortKey string,
	direction string,
	page int,
	pageSize int,
) (
	pageItems []SaudeOperacionalEscola,
	resumo SaudeOperacionalResumo,
	totalFiltrado int,
	totalPages int,
	currentPage int,
) {
	filtered := filterSaudeOperacionalEscolas(allEscolas, searchQuery)
	sort.SliceStable(filtered, func(i, j int) bool {
		return compareSaudeEscola(filtered[i], filtered[j], sortKey, direction) < 0
	})

	resumo = buildSaudeResumo(filtered)
	totalFiltrado = len(filtered)
	if totalFiltrado == 0 {
		return []SaudeOperacionalEscola{}, resumo, 0, 0, 1
	}

	totalPages = (totalFiltrado + pageSize - 1) / pageSize
	currentPage = page
	if currentPage > totalPages {
		currentPage = totalPages
	}

	offset := (currentPage - 1) * pageSize
	end := min(offset+pageSize, totalFiltrado)
	return filtered[offset:end], resumo, totalFiltrado, totalPages, currentPage
}

// saudeOperacionalFilters reúne os filtros globais do dashboard aplicados sobre
// o cadastro de escolas (schools s), antes do LEFT JOIN com os censos do ano.
// Strings vazias significam "filtro desativado".
type saudeOperacionalFilters struct {
	DRE              string
	Municipio        string
	Zona             string
	RegiaoIntegracao string
}

// parseSaudeOperacionalFilters lê os filtros globais da query string. Espaços em
// branco são removidos, de modo que um valor só com espaços equivale a ausência
// de filtro (o backend não filtra nada nesse caso).
func parseSaudeOperacionalFilters(q url.Values) saudeOperacionalFilters {
	return saudeOperacionalFilters{
		DRE:              strings.TrimSpace(q.Get("dre")),
		Municipio:        strings.TrimSpace(q.Get("municipio")),
		Zona:             strings.TrimSpace(q.Get("zona")),
		RegiaoIntegracao: strings.TrimSpace(q.Get("regiao_integracao")),
	}
}

// saudeOperacionalSelectSQL carrega TODAS as escolas cadastradas dentro do
// recorte global e traz, via LEFT JOIN, o censo concluído ($1 = year). O LEFT
// JOIN é essencial: escolas sem censo concluído continuam no resultado e são
// classificadas como "sem_dados" pela camada de cálculo em Go.
//
// Os filtros globais incidem sobre schools s (não sobre o censo), garantindo
// que total_escolas, resumo e paginação reflitam o recorte global e que as
// escolas pendentes de censo permaneçam visíveis dentro dele. Por isso este
// endpoint NÃO reutiliza AnalyticsFilters.WhereSQL(), que exige
// status = 'completed' AND census_id IS NOT NULL e excluiria os pendentes.
//
// A comparação usa UPPER(TRIM(...)) para tolerar caixa e espaços. O filtro de
// Região de Integração depende da compatibilidade entre schools.municipio e
// reg_integracao.municipio (sem unaccent nesta etapa): municípios com grafia
// divergente de acentuação podem não casar.
const saudeOperacionalSelectSQL = `
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
	WHERE ($2 = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM($2)))
	  AND ($3 = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM($3)))
	  AND ($4 = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM($4)))
	  AND ($5 = '' OR s.municipio IN (
	        SELECT municipio
	        FROM reg_integracao
	        WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM($5))
	      ))
	ORDER BY s.nome_escola, s.id
`

// buildSaudeOperacionalQuery devolve a query e os argumentos posicionais na
// ordem esperada por saudeOperacionalSelectSQL: $1=year, $2=dre, $3=municipio,
// $4=zona, $5=regiao_integracao.
func buildSaudeOperacionalQuery(year int, f saudeOperacionalFilters) (string, []any) {
	return saudeOperacionalSelectSQL, []any{
		year,
		f.DRE,
		f.Municipio,
		f.Zona,
		f.RegiaoIntegracao,
	}
}

// AdminAnalyticsSaudeOperacionalEscolas retorna escolas com índice de saúde operacional.
// Parâmetros opcionais: year, page, page_size, search, sort, direction.
// Filtros globais opcionais: dre, municipio, zona, regiao_integracao.
// Sem page_size: usa 10 registros por página.
func (app *application) AdminAnalyticsSaudeOperacionalEscolas(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	year, err := parseSaudeOperacionalYear(q.Get("year"), time.Now())
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	pageSize, err := parseSaudeOperacionalPageSize(q.Get("page_size"))
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	page := 1
	if raw := strings.TrimSpace(q.Get("page")); raw != "" {
		page, err = strconv.Atoi(raw)
		if err != nil || page < 1 {
			app.errorJSON(w, fmt.Errorf("page inválido: deve ser >= 1"), http.StatusBadRequest)
			return
		}
	}

	searchQuery := q.Get("search")

	sortKey := strings.TrimSpace(q.Get("sort"))
	validSortKeys := map[string]bool{
		"escola": true, "municipio": true, "dre": true, "zona": true,
		"total_alunos": true, "alunos_por_sala": true, "saude": true, "criticidade": true,
		"infraestrutura": true, "energia": true, "merenda": true, "seguranca": true,
		"pessoal": true, "tecnologia": true, "pedagogico": true, "governanca": true,
	}
	if !validSortKeys[sortKey] {
		sortKey = "criticidade"
	}

	direction, err := parseSaudeOperacionalDirection(q.Get("direction"))
	if err != nil {
		app.errorJSON(w, err, http.StatusBadRequest)
		return
	}

	filters := parseSaudeOperacionalFilters(q)
	query, args := buildSaudeOperacionalQuery(year, filters)

	dbRows, err := app.models.Schools.DB.QueryContext(r.Context(), query, args...)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("consultar saúde operacional das escolas: %v", err), http.StatusInternalServerError)
		return
	}
	defer dbRows.Close()

	allEscolas := make([]SaudeOperacionalEscola, 0)
	for dbRows.Next() {
		var row saudeOperacionalDBRow
		if err := dbRows.Scan(
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
		allEscolas = append(allEscolas, escola)
	}
	if err := dbRows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("iterar escolas da saúde operacional: %v", err), http.StatusInternalServerError)
		return
	}

	pageSlice, resumo, totalFiltrado, totalPages, page := buildSaudeOperacionalPage(
		allEscolas,
		searchQuery,
		sortKey,
		direction,
		page,
		pageSize,
	)

	out := SaudeOperacionalPayload{
		TotalEscolas:  len(allEscolas),
		TotalFiltrado: totalFiltrado,
		Page:          page,
		PageSize:      pageSize,
		TotalPages:    totalPages,
		AnoReferencia: year,
		Metodologia:   saudeOperacionalMetodologiaPayload(),
		Resumo:        resumo,
		Escolas:       pageSlice,
	}
	if out.Escolas == nil {
		out.Escolas = []SaudeOperacionalEscola{}
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
