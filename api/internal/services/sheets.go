package services

import (
	"censo-api/internal/models"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

const SheetRange = "Base_dados!A:A"

type SheetsService struct {
	srv                 *sheets.Service
	censusSpreadsheetID string
	localFilePath       string
}

func NewSheetsService() (*SheetsService, error) {
	ctx := context.Background()
	var creds []byte

	envCreds := os.Getenv("GOOGLE_CREDENTIALS_JSON")
	if envCreds != "" {
		creds = []byte(envCreds)
	} else {
		paths := []string{"credentials.json", "../credentials.json", "../../credentials.json"}
		for _, path := range paths {
			fileCreds, err := os.ReadFile(path)
			if err == nil {
				creds = fileCreds
				break
			}
		}
		if len(creds) == 0 {
			return nil, fmt.Errorf("credenciais do google não encontradas")
		}
	}

	srv, err := sheets.NewService(ctx, option.WithCredentialsJSON(creds))
	if err != nil {
		return nil, fmt.Errorf("erro ao criar cliente Sheets: %v", err)
	}

	censusID := os.Getenv("SPREADSHEET_ID")
	if censusID == "" {
		return nil, fmt.Errorf("ERRO: Variável SPREADSHEET_ID não configurada")
	}

	return &SheetsService{
		srv:                 srv,
		censusSpreadsheetID: censusID,
		localFilePath:       "data/locations.xlsx",
	}, nil
}

func (s *SheetsService) GetLocations() (map[string]map[string][]string, error) {
	f, err := excelize.OpenFile(s.localFilePath)
	if err != nil {
		return nil, fmt.Errorf("erro ao abrir planilha local: %v", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, err
	}

	mapping := make(map[string]map[string][]string)

	for i, row := range rows {
		if i == 0 {
			continue
		}

		if len(row) <= 2 {
			continue
		}

		dre := strings.TrimSpace(row[0])
		municipio := strings.TrimSpace(row[1])
		escola := strings.TrimSpace(row[2])

		if dre == "" || municipio == "" || escola == "" {
			continue
		}

		if mapping[dre] == nil {
			mapping[dre] = make(map[string][]string)
		}

		found := false
		for _, ex := range mapping[dre][municipio] {
			if ex == escola {
				found = true
				break
			}
		}
		if !found {
			mapping[dre][municipio] = append(mapping[dre][municipio], escola)
		}
	}

	for dre, cities := range mapping {
		for city, schools := range cities {
			sort.Strings(schools)
			mapping[dre][city] = schools
		}
	}

	return mapping, nil
}

func (s *SheetsService) AppendCenso(censo models.CensusResponse, school models.School) error {
	if s.censusSpreadsheetID == "" {
		return fmt.Errorf("ID da planilha do Censo não configurado")
	}

	var data map[string]interface{}
	err := json.Unmarshal(censo.Data, &data)
	if err != nil {
		return fmt.Errorf("erro ao decodificar JSON: %v", err)
	}

	val := func(key string) interface{} {
		if v, ok := data[key]; ok {
			if arr, ok := v.([]interface{}); ok {
				strs := make([]string, len(arr))
				for i, item := range arr {
					strs[i] = fmt.Sprint(item)
				}
				return strings.Join(strs, ", ")
			}
			return v
		}
		return ""
	}

	formatJsonField := func(raw json.RawMessage) string {
		if len(raw) == 0 { return "" }
		var arr []string
		if err := json.Unmarshal(raw, &arr); err == nil {
			return strings.Join(arr, ", ")
		}
		return strings.Trim(string(raw), "\"")
	}

	row := []interface{}{
		school.NomeDiretor,
		school.MatriculaDiretor,
		school.ContatoDiretor,
		school.Dre,
		school.Nome,
		school.INEP,
		school.CNPJ,
		school.Endereco,
		school.Telefone,
		school.Municipio,
		school.CEP,
		school.Zona,
		formatJsonField(school.Turnos),

		val("tipo_predio"),
		val("possui_anexos"),
		val("qtd_anexos"),
		val("tipo_predio_anexo"),
		val("etapas_ofertadas"),
		val("modalidades_ofertadas"),
		val("qtd_salas_aula"),

		val("turmas_manha"), val("turmas_tarde"), val("turmas_noite"), val("turmas_integral"),
		val("total_alunos"), val("alunos_pcd"), val("alunos_rural"), val("alunos_urbana"),
		val("muro_cerca"), val("perimetro_fechado"), val("situacao_estrutura"), val("data_ultima_reforma"),
		val("ambientes"), val("quadra_coberta"), val("qtd_quadras"), val("banda_fanfarra"),
		val("banheiros_alunos"), val("banheiros_prof"), val("banheiros_chuveiro"), val("banheiros_vasos_funcionais"),
		val("salas_climatizadas"), val("energia"), val("transformador"), val("rede_eletrica_atende"),
		val("problemas_eletricos"), val("estrutura_climatizacao"), val("suporta_novos_equipamentos"),
		val("cameras_funcionamento"), val("cameras_cobrem"),

		val("condicoes_cozinha"), val("tamanho_cozinha"), val("oferta_regular"), val("qualidade_merenda"),
		val("atende_necessidades"), val("possui_refeitorio"), val("refeitorio_adequado"), val("possui_balanca"),
		val("qtd_freezers"), val("estado_freezers"), val("qtd_geladeiras"), val("estado_geladeiras"),
		val("qtd_fogoes"), val("estado_fogoes"), val("qtd_fornos"), val("estado_fornos"),
		val("qtd_bebedouros"), val("estado_bebedouros"), val("bancadas_inox"), val("sistema_exaustao"),
		val("despensa_exclusiva"), val("deposito_conserva"), val("estoque_epi_extintor"), val("manutencao_extintores"),
		val("qtd_merendeiras_estatutaria"), val("qtd_merendeiras_terceirizada"), val("qtd_merendeiras_temporaria"),

		val("qtd_atende_necessidade_merenda"),
		val("quantitativo_necessario_merenda"),
		val("empresa_terceirizada_merenda"),
		val("possui_supervisor_merenda"),
		val("nome_supervisor_merenda"),
		val("contato_supervisor_merenda"),

		val("qtd_servicos_gerais_efetivo"), val("qtd_servicos_gerais_temporario"), val("qtd_servicos_gerais_terceirizado"),
		val("qtd_atende_necessidade_sg"),
		val("quantitativo_necessario_sg"),
		val("empresa_terceirizada_sg"),
		val("possui_supervisor_sg"),
		val("nome_supervisor_sg"),
		val("contato_supervisor_sg"),

		val("possui_guarita"), val("controle_portao"), val("iluminacao_externa"), val("possui_botao_panico"),
		val("qtd_agentes_portaria"),
		val("qtd_atende_necessidade_portaria"),
		val("quantitativo_necessario_portaria"),
		val("empresa_terceirizada_portaria"),
		val("possui_supervisor_portaria"),
		val("nome_supervisor_portaria"),
		val("contato_supervisor_portaria"),

		val("internet_disponivel"),
		val("provedor_internet"),
		val("qualidade_internet"),
		val("qtd_desktop_adm"), val("qtd_desktop_alunos"), val("qtd_notebooks"), val("qtd_chromebooks"),
		val("computadores_atendem"), val("qtd_computadores_inoperantes"),
		val("possui_projetor"), val("qtd_projetores"), val("possui_lousa_digital"),

		val("possui_direcao"), val("possui_vice_pedagogico"), val("possui_vice_administrativo"), val("possui_secretario"),
		val("possui_coord_pedagogico"), val("qtd_coord_pedagogico"), val("possui_coord_area_matematica"),
		val("possui_coord_area_linguagem"), val("possui_coord_area_humanas"), val("possui_coord_area_natureza"),
		val("qtd_professores_efetivos"), val("qtd_professores_temporarios"), val("qtd_servidores_administrativos"),
		val("possui_professor_readaptado"), val("qtd_professor_readaptado"),

		val("total_beneficiarios"), val("taxa_abandono"),
		val("taxa_reprovacao_fund1"), val("taxa_reprovacao_fund2"), val("taxa_reprovacao_medio"),
		val("ideb_anos_iniciais"), val("ideb_anos_finais"), val("ideb_ensino_medio"),

		val("regularizada_cee"),
		val("conselho_escolar"),
		val("conselho_ativo"),
		val("recursos_prodep"),
		val("valor_prodep"),
		val("execucao_prodep"),
		val("pendencias_prodep"),
		val("recursos_federais"),
		val("valor_federais"),
		val("execucao_federais"),
		val("pendencias_federais"),
		val("gremio_estudantil"), val("reunioes_comunidade"), val("plano_evacuacao"), val("politica_bullying"),

		val("avaliacao_merendeiras"), val("avaliacao_portaria"), val("avaliacao_limpeza"),
		val("avaliacao_comunicacao"), val("avaliacao_supervisao"),

		fmt.Sprintf("1. %v | 2. %v | 3. %v", val("prioridade_1"), val("prioridade_2"), val("prioridade_3")),
		val("demanda_urgente"), val("descricao_urgencia"), val("sugestao_melhoria"), val("descricao_sugestao"),
		val("nome_responsavel"), val("cargo_funcao"), val("matricula_funcional"), val("declaracao_verdadeira"),
	}

	vr := &sheets.ValueRange{Values: [][]interface{}{row}}

	_, err = s.srv.Spreadsheets.Values.Append(s.censusSpreadsheetID, SheetRange, vr).ValueInputOption("RAW").Do()
	if err != nil {
		return fmt.Errorf("erro ao escrever na planilha do censo: %v", err)
	}

	// Valores JSON chegam como float64; usar fmt.Sprint evita comparação errada de tipos (interface{float64} != int(0))
	if str := fmt.Sprint(val("quantitativo_necessario_portaria")); str != "" && str != "0" {
		_ = s.ensureAndAppendDeficit(
			"Deficit_Portaria",
			"Para atender plenamente à demanda atual da escola, quantos agentes de portaria faltam para completar a equipe?",
			str, school,
		)
	}

	if str := fmt.Sprint(val("quantitativo_necessario_sg")); str != "" && str != "0" {
		_ = s.ensureAndAppendDeficit(
			"Deficit_Servicos_Gerais",
			"Para atender plenamente à demanda atual da escola, quantas serviços gerais faltam para completar a equipe?",
			str, school,
		)
	}

	if str := fmt.Sprint(val("quantitativo_necessario_merenda")); str != "" && str != "0" {
		_ = s.ensureAndAppendDeficit(
			"Deficit_Merenda",
			"Para atender plenamente à demanda atual da merenda escolar, quantas merendeiras faltam para completar a equipe da cozinha?",
			str, school,
		)
	}

	return nil
}

// ─── Dashboard metrics ────────────────────────────────────────────────────────

// Colunas em Base_dados (0-based, mesma ordem do AppendCenso):
// 0:NomeDiretor 1:Matricula 2:Contato 3:DRE 4:Nome 5:INEP 6:CNPJ
// 7:Endereco 8:Telefone 9:Municipio 10:CEP 11:Zona 12:Turnos
// 13:tipo_predio 14:possui_anexos 15:qtd_anexos 16:tipo_predio_anexo
// 17:etapas_ofertadas 18:modalidades_ofertadas 19:qtd_salas_aula
// 20:turmas_manha 21:turmas_tarde 22:turmas_noite 23:turmas_integral
// 24:total_alunos 25:alunos_pcd 26:alunos_rural 27:alunos_urbana

const (
	colDre       = 3
	colNome      = 4
	colINEP      = 5
	colZona      = 11
	colEtapas    = 17
	colModalidades = 18
	colSalas     = 19
	colTurnosManha = 20
	colTurnosTarde = 21
	colTurnosNoite = 22
	colTurnosIntegral = 23
	colTotalAlunos = 24
	colAlunosPCD = 25
)

// PorteLabel categoriza a escola pelo número de alunos, igual ao Looker Studio.
func PorteLabel(alunos int) string {
	switch {
	case alunos <= 50:   return "0–50"
	case alunos <= 150:  return "50–150"
	case alunos <= 300:  return "150–300"
	case alunos <= 500:  return "300–500"
	case alunos <= 1000: return "500–1.000"
	default:             return "1.000+"
	}
}

// PorteOrder define a ordem de exibição dos grupos de porte.
var PorteOrder = []string{"0–50", "50–150", "150–300", "300–500", "500–1.000", "1.000+"}

type ZonaStat struct {
	Zona  string `json:"zona"`
	Count int    `json:"count"`
}
type PorteStat struct {
	Porte  string `json:"porte"`
	Count  int    `json:"count"`
	Alunos int    `json:"alunos"`
}
type DreStat struct {
	Dre    string `json:"dre"`
	Escolas int   `json:"escolas"`
	Alunos int    `json:"alunos"`
	Salas  int    `json:"salas"`
}
type SheetMetrics struct {
	TotalEscolas        int         `json:"total_escolas"`
	TotalAlunos         int         `json:"total_alunos"`
	TotalAlunosPCD      int         `json:"total_alunos_pcd"`
	MediaAlunosPorEscola float64    `json:"media_alunos_por_escola"`
	PorZona             []ZonaStat  `json:"por_zona"`
	PorPorte            []PorteStat `json:"por_porte"`
	PorDre              []DreStat   `json:"por_dre"`
}

func toInt(v interface{}) int {
	if v == nil { return 0 }
	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" { return 0 }
	// Remove pontos de milhar que podem vir do Sheets
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, ",", "")
	n, _ := strconv.Atoi(s)
	return n
}

func cell(row []interface{}, idx int) string {
	if idx >= len(row) { return "" }
	if row[idx] == nil { return "" }
	return strings.TrimSpace(fmt.Sprint(row[idx]))
}

// GetSheetMetrics lê Base_dados e devolve os indicadores agregados para o dashboard.
func (s *SheetsService) GetSheetMetrics() (*SheetMetrics, error) {
	resp, err := s.srv.Spreadsheets.Values.Get(
		s.censusSpreadsheetID,
		"Base_dados!A:AB",
	).Do()
	if err != nil {
		return nil, fmt.Errorf("erro ao ler Base_dados: %v", err)
	}

	zonaCount := map[string]int{}
	porteSchools := map[string]int{}
	porteAlunos  := map[string]int{}
	dreMap       := map[string]*DreStat{}

	var totalAlunos, totalPCD, escolas int

	for i, row := range resp.Values {
		// Pula header se a primeira linha tiver texto no campo INEP
		if i == 0 {
			inep := cell(row, colINEP)
			if _, err := strconv.Atoi(inep); err != nil {
				continue // é header
			}
		}
		if len(row) <= colINEP { continue }
		if cell(row, colINEP) == "" { continue }

		dre  := cell(row, colDre)
		zona := cell(row, colZona)
		alunos := toInt(cell(row, colTotalAlunos))
		salas  := toInt(cell(row, colSalas))
		pcd    := toInt(cell(row, colAlunosPCD))

		if zona == "" { zona = "Não informado" }
		porte := PorteLabel(alunos)

		escolas++
		totalAlunos += alunos
		totalPCD    += pcd
		zonaCount[zona]++
		porteSchools[porte]++
		porteAlunos[porte] += alunos

		if dre != "" {
			if _, ok := dreMap[dre]; !ok {
				dreMap[dre] = &DreStat{Dre: dre}
			}
			dreMap[dre].Escolas++
			dreMap[dre].Alunos += alunos
			dreMap[dre].Salas  += salas
		}
	}

	media := 0.0
	if escolas > 0 {
		media = math.Round(float64(totalAlunos)/float64(escolas)*10) / 10
	}

	// Zonas
	zonaOrder := []string{"Urbana", "Rural", "Ribeirinha", "Não informado"}
	var zonas []ZonaStat
	for _, z := range zonaOrder {
		if c, ok := zonaCount[z]; ok {
			zonas = append(zonas, ZonaStat{Zona: z, Count: c})
		}
	}
	for z, c := range zonaCount {
		found := false
		for _, zo := range zonaOrder { if zo == z { found = true; break } }
		if !found { zonas = append(zonas, ZonaStat{Zona: z, Count: c}) }
	}

	// Porte (ordenado)
	var portes []PorteStat
	for _, p := range PorteOrder {
		portes = append(portes, PorteStat{Porte: p, Count: porteSchools[p], Alunos: porteAlunos[p]})
	}

	// DRE ordenado por escolas desc
	var dres []DreStat
	for _, d := range dreMap { dres = append(dres, *d) }
	sort.Slice(dres, func(i, j int) bool { return dres[i].Escolas > dres[j].Escolas })

	return &SheetMetrics{
		TotalEscolas:         escolas,
		TotalAlunos:          totalAlunos,
		TotalAlunosPCD:       totalPCD,
		MediaAlunosPorEscola: media,
		PorZona:              zonas,
		PorPorte:             portes,
		PorDre:               dres,
	}, nil
}

// ─── Indicadores_Flags metrics ────────────────────────────────────────────────

type BenefStat struct {
	Faixa string `json:"faixa"`
	Count int    `json:"count"`
}
type AbandonoStat struct {
	Faixa string  `json:"faixa"`
	Count int     `json:"count"`
}
type DreAbandonoStat struct {
	Dre   string  `json:"dre"`
	Media float64 `json:"media"`
	Count int     `json:"count"`
}
type IndicadoresMetrics struct {
	EscolasRiscoFluxo    int               `json:"escolas_risco_fluxo"`
	PorFaixaBenef        []BenefStat       `json:"por_faixa_benef"`
	PorFaixaAbandono     []AbandonoStat    `json:"por_faixa_abandono"`
	TopDreAbandono       []DreAbandonoStat `json:"top_dre_abandono"`
}

// findCol retorna o índice (0-based) do primeiro header que contenha algum dos padrões.
func findCol(headers []interface{}, patterns ...string) int {
	for _, pat := range patterns {
		patL := strings.ToLower(strings.TrimSpace(pat))
		for i, h := range headers {
			if strings.ToLower(strings.TrimSpace(fmt.Sprint(h))) == patL {
				return i
			}
		}
	}
	// segunda passagem: contains
	for _, pat := range patterns {
		patL := strings.ToLower(strings.TrimSpace(pat))
		for i, h := range headers {
			if strings.Contains(strings.ToLower(fmt.Sprint(h)), patL) {
				return i
			}
		}
	}
	return -1
}

var benefOrder = []string{"Até 25%", "26% a 50%", "51% a 75%", "Acima de 75%", "Não informado"}
var abandonoOrder = []string{"Até 2%", "2% a 5%", "5% a 10%", "Acima de 10%"}

// GetIndicadoresMetrics lê Indicadores_Flags e agrega os dados de perfil dos alunos.
func (s *SheetsService) GetIndicadoresMetrics() (*IndicadoresMetrics, error) {
	resp, err := s.srv.Spreadsheets.Values.Get(
		s.censusSpreadsheetID,
		"Indicadores_Flags!A1:DZ1023",
	).Do()
	if err != nil {
		return nil, fmt.Errorf("erro ao ler Indicadores_Flags: %v", err)
	}
	if len(resp.Values) < 2 {
		return &IndicadoresMetrics{}, nil
	}

	headers := resp.Values[0]

	// Localiza colunas por nome (flexível)
	colDre         := findCol(headers, "dre")
	colBenef       := findCol(headers, "faixa_beneficiarios", "faixa_benef", "beneficiarios_faixa", "beneficiarios")
	colFxAbandono  := findCol(headers, "faixa_abandono", "abandono_faixa")
	colTxAbandono  := findCol(headers, "taxa_abandono", "tx_abandono", "abandono")
	colRiscoFluxo  := findCol(headers, "flag_risco_fluxo", "risco_fluxo", "flag_fluxo", "risco_de_fluxo")

	benefCount    := map[string]int{}
	abandonoCount := map[string]int{}
	dreAbandono   := map[string][]float64{} // dre → lista de taxas
	riscoFluxo    := 0

	for _, row := range resp.Values[1:] {
		if len(row) == 0 { continue }

		dre := ""
		if colDre >= 0 && colDre < len(row) { dre = strings.TrimSpace(fmt.Sprint(row[colDre])) }

		// Faixa Beneficiários
		if colBenef >= 0 && colBenef < len(row) {
			v := strings.TrimSpace(fmt.Sprint(row[colBenef]))
			if v == "" || v == "0" || strings.EqualFold(v, "não informado") {
				v = "Não informado"
			}
			benefCount[v]++
		}

		// Faixa / Taxa de Abandono
		fxAbandono := ""
		if colFxAbandono >= 0 && colFxAbandono < len(row) {
			fxAbandono = strings.TrimSpace(fmt.Sprint(row[colFxAbandono]))
		}
		if fxAbandono != "" {
			abandonoCount[fxAbandono]++
		}

		// Taxa abandono numérica para média por DRE
		if colTxAbandono >= 0 && colTxAbandono < len(row) && dre != "" {
			raw := strings.TrimSpace(fmt.Sprint(row[colTxAbandono]))
			raw = strings.ReplaceAll(raw, ",", ".")
			raw = strings.ReplaceAll(raw, "%", "")
			if f, err := strconv.ParseFloat(raw, 64); err == nil {
				dreAbandono[dre] = append(dreAbandono[dre], f)
			}
		}

		// Risco de Fluxo
		if colRiscoFluxo >= 0 && colRiscoFluxo < len(row) {
			v := strings.TrimSpace(fmt.Sprint(row[colRiscoFluxo]))
			if v == "1" || strings.EqualFold(v, "sim") || strings.EqualFold(v, "true") {
				riscoFluxo++
			}
		}
	}

	// Ordena faixas de beneficiários
	var benefStats []BenefStat
	for _, f := range benefOrder {
		benefStats = append(benefStats, BenefStat{Faixa: f, Count: benefCount[f]})
	}
	// Adiciona faixas não previstas
	for f, c := range benefCount {
		known := false
		for _, o := range benefOrder { if o == f { known = true; break } }
		if !known { benefStats = append(benefStats, BenefStat{Faixa: f, Count: c}) }
	}

	// Ordena faixas de abandono
	var abandonoStats []AbandonoStat
	for _, f := range abandonoOrder {
		abandonoStats = append(abandonoStats, AbandonoStat{Faixa: f, Count: abandonoCount[f]})
	}

	// Top 10 DREs por taxa média de abandono
	var dreStats []DreAbandonoStat
	for dre, taxas := range dreAbandono {
		if dre == "" || len(taxas) == 0 { continue }
		sum := 0.0
		for _, t := range taxas { sum += t }
		media := math.Round((sum/float64(len(taxas)))*100) / 100
		dreStats = append(dreStats, DreAbandonoStat{Dre: dre, Media: media, Count: len(taxas)})
	}
	sort.Slice(dreStats, func(i, j int) bool { return dreStats[i].Media > dreStats[j].Media })
	if len(dreStats) > 10 { dreStats = dreStats[:10] }

	return &IndicadoresMetrics{
		EscolasRiscoFluxo: riscoFluxo,
		PorFaixaBenef:     benefStats,
		PorFaixaAbandono:  abandonoStats,
		TopDreAbandono:    dreStats,
	}, nil
}

func (s *SheetsService) ensureAndAppendDeficit(sheetTitle string, questionText string, value interface{}, school models.School) error {
	spreadsheet, err := s.srv.Spreadsheets.Get(s.censusSpreadsheetID).Do()
	if err != nil {
		return err
	}

	exists := false
	for _, sheet := range spreadsheet.Sheets {
		if sheet.Properties.Title == sheetTitle {
			exists = true
			break
		}
	}

	if !exists {
		addSheetReq := &sheets.Request{
			AddSheet: &sheets.AddSheetRequest{
				Properties: &sheets.SheetProperties{
					Title: sheetTitle,
				},
			},
		}
		
		_, err := s.srv.Spreadsheets.BatchUpdate(s.censusSpreadsheetID, &sheets.BatchUpdateSpreadsheetRequest{
			Requests: []*sheets.Request{addSheetReq},
		}).Do()
		
		if err != nil {
			return fmt.Errorf("erro ao criar aba %s: %v", sheetTitle, err)
		}

		header := []interface{}{"INEP", "Escola", "DRE", "Município", questionText}
		headerVr := &sheets.ValueRange{Values: [][]interface{}{header}}
		_, err = s.srv.Spreadsheets.Values.Append(s.censusSpreadsheetID, fmt.Sprintf("%s!A1", sheetTitle), headerVr).ValueInputOption("RAW").Do()
		if err != nil {
			return fmt.Errorf("erro ao escrever cabeçalho na aba %s: %v", sheetTitle, err)
		}
	}

	row := []interface{}{
		school.INEP,
		school.Nome,
		school.Dre,
		school.Municipio,
		value,
	}
	vr := &sheets.ValueRange{Values: [][]interface{}{row}}
	_, err = s.srv.Spreadsheets.Values.Append(s.censusSpreadsheetID, fmt.Sprintf("%s!A:A", sheetTitle), vr).ValueInputOption("RAW").Do()
	
	return err
}