package services

import (
	"censo-api/internal/models"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

// Constante para a aba de escrita principal na planilha de Censo
const SheetRange = "Base_dados!A:A"

type SheetsService struct {
	srv                    *sheets.Service
	censusSpreadsheetID    string // ID da planilha para SALVAR dados (Escrita)
	locationsSpreadsheetID string // ID da planilha para LER setores (Leitura)
}

// NewSheetsService inicializa o serviço do Google Sheets.
// Lê DUAS variáveis de ambiente diferentes.
func NewSheetsService() (*SheetsService, error) {
	ctx := context.Background()
	var creds []byte
	
	// 1. Autenticação (Credenciais)
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

	// 2. Configuração dos IDs das Planilhas
	
	// Planilha de ESCRITA (Censo)
	censusID := os.Getenv("SPREADSHEET_ID")
	if censusID == "" {
		return nil, fmt.Errorf("ERRO: Variável SPREADSHEET_ID (para salvar dados) não configurada")
	}

	// Planilha de LEITURA (Setores/DREs)
	locationsID := os.Getenv("SPREADSHEET_ID_LOCATIONS")
	if locationsID == "" {
		// Se esquecerem de configurar, avisa no log, mas não derruba a aplicação inteira,
		// porém a busca de DREs vai falhar.
		fmt.Println("AVISO: Variável SPREADSHEET_ID_LOCATIONS não configurada. Busca de DREs falhará.")
	}

	return &SheetsService{
		srv:                    srv,
		censusSpreadsheetID:    censusID,
		locationsSpreadsheetID: locationsID,
	}, nil
}

// GetLocations lê a planilha de "Setores" (LEITURA)
func (s *SheetsService) GetLocations() (map[string][]string, error) {
	if s.locationsSpreadsheetID == "" {
		return nil, fmt.Errorf("ID da planilha de setores não configurado no servidor")
	}

	// Range: Aba 'setores', da coluna B até E, começando na linha 2
	readRange := "setores!B2:E"

	// USA O ID DE LOCALIZAÇÕES
	resp, err := s.srv.Spreadsheets.Values.Get(s.locationsSpreadsheetID, readRange).Do()
	if err != nil {
		return nil, fmt.Errorf("erro ao ler planilha de setores: %v", err)
	}

	mapping := make(map[string][]string)
	tempMap := make(map[string]map[string]bool)

	for _, row := range resp.Values {
		// B=0 (DRE), C=1, D=2, E=3 (Município)
		if len(row) > 3 {
			dre := fmt.Sprintf("%v", row[0])
			municipio := fmt.Sprintf("%v", row[3])

			if dre == "" || municipio == "" {
				continue
			}

			if tempMap[dre] == nil {
				tempMap[dre] = make(map[string]bool)
			}
			
			if !tempMap[dre][municipio] {
				tempMap[dre][municipio] = true
				mapping[dre] = append(mapping[dre], municipio)
			}
		}
	}

	return mapping, nil
}

// AppendCenso salva dados na planilha do Censo (ESCRITA)
func (s *SheetsService) AppendCenso(censo models.CensusResponse, school models.School) error {
	// USA O ID DO CENSO
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
		// --- 1. DADOS DE IDENTIFICAÇÃO ---
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
		
		// --- 2. INFRAESTRUTURA E ENSINO ---
		val("tipo_predio"),
		val("possui_anexos"),
		val("qtd_anexos"),
		val("tipo_predio_anexo"),
		val("etapas_ofertadas"),      
		val("modalidades_ofertadas"), 
		val("qtd_salas_aula"),
		
		val("turmas_manha"), val("turmas_tarde"), val("turmas_noite"),
		val("total_alunos"), val("alunos_pcd"), val("alunos_rural"), val("alunos_urbana"),
		val("muro_cerca"), val("perimetro_fechado"), val("situacao_estrutura"), val("data_ultima_reforma"),
		val("ambientes"), val("quadra_coberta"), val("qtd_quadras"), val("banda_fanfarra"),
		val("banheiros_alunos"), val("banheiros_prof"), val("banheiros_chuveiro"), val("banheiros_vasos_funcionais"),
		val("salas_climatizadas"), val("energia"), val("transformador"), val("rede_eletrica_atende"),
		val("problemas_eletricos"), val("estrutura_climatizacao"), val("suporta_novos_equipamentos"),
		val("cameras_funcionamento"), val("cameras_cobrem"),
		
		// --- 3. MERENDA ---
		val("condicoes_cozinha"), val("tamanho_cozinha"), val("oferta_regular"), val("qualidade_merenda"),
		val("atende_necessidades"), val("possui_refeitorio"), val("refeitorio_adequado"), val("possui_balanca"),
		val("qtd_freezers"), val("estado_freezers"), val("qtd_geladeiras"), val("estado_geladeiras"),
		val("qtd_fogoes"), val("estado_fogoes"), val("qtd_fornos"), val("estado_fornos"),
		val("qtd_bebedouros"), val("estado_bebedouros"), val("bancadas_inox"), val("sistema_exaustao"),
		val("despensa_exclusiva"), val("deposito_conserva"), val("estoque_epi_extintor"), val("manutencao_extintores"),
		val("qtd_merendeiras_estatutaria"), val("qtd_merendeiras_terceirizada"), val("qtd_merendeiras_temporaria"),
		
		val("qtd_atende_necessidade_merenda"),
		val("empresa_terceirizada_merenda"),
		val("possui_supervisor_merenda"),
		val("nome_supervisor_merenda"),
		val("contato_supervisor_merenda"),

		// --- 4. SERVIÇOS GERAIS ---
		val("qtd_servicos_gerais_efetivo"), val("qtd_servicos_gerais_temporario"), val("qtd_servicos_gerais_terceirizado"),
		val("qtd_atende_necessidade_sg"),
		val("quantitativo_necessario_sg"),
		val("empresa_terceirizada_sg"),
		val("possui_supervisor_sg"),
		val("nome_supervisor_sg"),
		val("contato_supervisor_sg"),

		// --- 5. PORTARIA ---
		val("possui_guarita"), val("controle_portao"), val("iluminacao_externa"), val("possui_botao_panico"),
		val("qtd_agentes_portaria"),
		val("qtd_atende_necessidade_portaria"),
		val("quantitativo_necessario_portaria"),
		val("empresa_terceirizada_portaria"),
		val("possui_supervisor_portaria"),
		val("nome_supervisor_portaria"),
		val("contato_supervisor_portaria"),

		// --- 6. TECNOLOGIA ---
		val("internet_disponivel"),
		val("provedor_internet"),
		val("qualidade_internet"),
		val("qtd_desktop_adm"), val("qtd_desktop_alunos"), val("qtd_notebooks"), val("qtd_chromebooks"),
		val("computadores_atendem"), val("qtd_computadores_inoperantes"), 
		val("possui_projetor"), val("qtd_projetores"), val("possui_lousa_digital"),

		// --- 7. SERVIDORES ---
		val("possui_direcao"), val("possui_vice_pedagogico"), val("possui_vice_administrativo"), val("possui_secretario"),
		val("possui_coord_pedagogico"), val("qtd_coord_pedagogico"), val("possui_coord_area_matematica"),
		val("possui_coord_area_linguagem"), val("possui_coord_area_humanas"), val("possui_coord_area_natureza"),
		val("qtd_professores_efetivos"), val("qtd_professores_temporarios"), val("qtd_servidores_administrativos"),
		val("possui_professor_readaptado"), val("qtd_professor_readaptado"),

		// --- 8. ALUNOS ---
		val("total_beneficiarios"), val("taxa_abandono"), 
		val("taxa_reprovacao_fund1"), val("taxa_reprovacao_fund2"), val("taxa_reprovacao_medio"), 
		val("ideb_anos_iniciais"), val("ideb_anos_finais"), val("ideb_ensino_medio"),

		// --- 9. GESTÃO E FINANCEIRO ---
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

		// --- 10. AVALIAÇÃO ---
		val("avaliacao_merendeiras"), val("avaliacao_portaria"), val("avaliacao_limpeza"),
		val("avaliacao_comunicacao"), val("avaliacao_supervisao"),

		// --- 11. OBSERVAÇÕES ---
		fmt.Sprintf("1. %v | 2. %v | 3. %v", val("prioridade_1"), val("prioridade_2"), val("prioridade_3")),
		val("demanda_urgente"), val("descricao_urgencia"), val("sugestao_melhoria"), val("descricao_sugestao"),
		val("nome_responsavel"), val("cargo_funcao"), val("matricula_funcional"), val("declaracao_verdadeira"),
	}

	vr := &sheets.ValueRange{Values: [][]interface{}{row}}

	// USA O ID DO CENSO
	_, err = s.srv.Spreadsheets.Values.Append(s.censusSpreadsheetID, SheetRange, vr).ValueInputOption("USER_ENTERED").Do()
	if err != nil {
		return fmt.Errorf("erro ao escrever na planilha do censo: %v", err)
	}

	return nil
}