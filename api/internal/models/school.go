package models

import (
	"time"

	"gorm.io/gorm"
)

// School (Identificação)
type School struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	// Identificação Básica [doc: 3-15]
	NomeEscola            string `gorm:"type:varchar(255);not null" json:"nome_escola"`
	CodigoINEP            string `gorm:"type:varchar(20);unique;not null" json:"codigo_inep"`
	CNPJ                  string `gorm:"type:varchar(20)" json:"cnpj"`
	Endereco              string `gorm:"type:text" json:"endereco"`
	TelefoneInstitucional string `gorm:"type:varchar(20)" json:"telefone_institucional"`
	Municipio             string `gorm:"type:varchar(100);not null" json:"municipio"`
	CEP                   string `gorm:"type:varchar(10)" json:"cep"`
	Zona                  string `gorm:"type:varchar(20)" json:"zona"` // Urbana, Rural
	NomeDiretor           string `gorm:"type:varchar(150)" json:"nome_diretor"`
	MatriculaDiretor      string `gorm:"type:varchar(50)" json:"matricula_diretor"`
	ContatoDiretor        string `gorm:"type:varchar(20)" json:"contato_diretor"`
	DRE                   string `gorm:"type:varchar(100)" json:"dre"`

	// Turnos [doc: 16-20]
	TurnoManha    bool `json:"turno_manha"`
	TurnoTarde    bool `json:"turno_tarde"`
	TurnoNoite    bool `json:"turno_noite"`
	TurnoIntegral bool `json:"turno_integral"`

	// Relacionamentos 1:1
	Infrastructure   Infrastructure   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"infrastructure"`
	FoodSecurity     FoodSecurity     `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"food_security"`
	HumanResources   HumanResources   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"human_resources"`
	Technology       Technology       `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"technology"`
}

// Infrastructure (Seção 2: Dados Gerais e Infraestrutura)
type Infrastructure struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `json:"school_id"`

	TipoPredio            string `json:"tipo_predio"`
	PossuiAnexos          bool   `json:"possui_anexos"`
	QuantidadeAnexos      int    `json:"quantidade_anexos"`
	TipoPredioAnexo       string `json:"tipo_predio_anexo"`
	
	// Segurança Perimetral
	PossuiMuroCerca       string `json:"possui_muro_cerca"` // Muro, Cerca, Ambos, Não
	PerimetroFechado      string `json:"perimetro_fechado"` // Total, Parcial, Não

	// Estado da Reforma
	SituacaoEstrutura     string `json:"situacao_estrutura"` // Reforma Geral, Parcial, etc.
	DataUltimaReforma     string `json:"data_ultima_reforma"`

	// Ambientes (Checklist) [doc: 82-94]
	PossuiBiblioteca      bool `json:"possui_biblioteca"`
	PossuiLabCiencias     bool `json:"possui_lab_ciencias"`
	PossuiLabInformatica  bool `json:"possui_lab_informatica"`
	PossuiQuadra          bool `json:"possui_quadra"`
	QuadraCoberta         bool `json:"quadra_coberta"`
	PossuiRefeitorio      bool `json:"possui_refeitorio"`
	PossuiAuditorio       bool `json:"possui_auditorio"`
	PossuiSalaLeitura     bool `json:"possui_sala_leitura"`
	PossuiSalaProfessores bool `json:"possui_sala_professores"`
	PossuiSecretaria      bool `json:"possui_secretaria"`
	
	// Elétrica e Hidráulica [doc: 110-134]
	FonteEnergia          string `json:"fonte_energia"` // Rede pública, Gerador
	RedeEletricaAtende    string `json:"rede_eletrica_atende"` // Sim, Não, Parcial
	ProblemasEletricos    string `json:"problemas_eletricos"` // Quedas, Fiação antiga
	SuportaClimatizacao   string `json:"suporta_climatizacao"`
	
	// Segurança [doc: 135-142]
	PossuiCameras         string `json:"possui_cameras"`
}

// FoodSecurity (Seção 3: Merenda Escolar) [doc: 143-241]
type FoodSecurity struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `json:"school_id"`

	CondicaoCozinha       string `json:"condicao_cozinha"` // Boa, Regular, Precária
	TamanhoCozinha        string `json:"tamanho_cozinha"`
	QualidadeMerenda      string `json:"qualidade_merenda"`
	
	// Equipamentos (Contadores)
	QtdFreezers           int    `json:"qtd_freezers"`
	EstadoFreezers        string `json:"estado_freezers"`
	QtdGeladeiras         int    `json:"qtd_geladeiras"`
	EstadoGeladeiras      string `json:"estado_geladeiras"`
	QtdFogoes             int    `json:"qtd_fogoes"`
	QtdBebedouros         int    `json:"qtd_bebedouros"`
	
	// Infra Cozinha
	PossuiDespensa        bool   `json:"possui_despensa"`
	PossuiExaustao        bool   `json:"possui_exaustao"`
	BancadasInox          bool   `json:"bancadas_inox"`
}

// Technology (Seção 6: Tecnologia) [doc: 296-326]
type Technology struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `json:"school_id"`

	InternetDisponivel    bool   `json:"internet_disponivel"`
	ProvedorInternet      string `json:"provedor_internet"` // Prodepa, Starlink
	QualidadeInternet     string `json:"qualidade_internet"`
	
	QtdDesktopsAdmin      int    `json:"qtd_desktops_admin"`
	QtdDesktopsAlunos     int    `json:"qtd_desktops_alunos"`
	QtdNotebooks          int    `json:"qtd_notebooks"`
	QtdProjetores         int    `json:"qtd_projetores"`
	PossuiLousaDigital    bool   `json:"possui_lousa_digital"`
}

// HumanResources (Seção 7: Servidores e Seção 4: Serviços Gerais)
type HumanResources struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `json:"school_id"`

	// Equipe Gestora [doc: 328-342]
	PossuiVicePedagogico  bool `json:"possui_vice_pedagogico"`
	PossuiViceAdmin       bool `json:"possui_vice_admin"`
	PossuiSecretario      bool `json:"possui_secretario"`
	PossuiCoordenador     bool `json:"possui_coordenador"`
	
	// Quantitativos
	QtdProfessoresEfetivos   int `json:"qtd_professores_efetivos"`
	QtdProfessoresTemporarios int `json:"qtd_professores_temporarios"`
	QtdMerendeiras           int `json:"qtd_merendeiras"`
	QtdServicosGerais        int `json:"qtd_servicos_gerais"`
	QtdPortaria              int `json:"qtd_portaria"`
}