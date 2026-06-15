package main

import (
	"net/url"
	"testing"
)

func ptrF(v float64) *float64 { return &v }

func TestParseIdebFilters_Defaults(t *testing.T) {
	f, err := parseIdebFilters(url.Values{})
	if err != nil {
		t.Fatalf("filtros vazios não devem falhar: %v", err)
	}
	if f.Ano != 2023 {
		t.Fatalf("ano default esperado 2023, obtive %d", f.Ano)
	}
	if f.Etapa != "" || f.DRE != "" || f.Municipio != "" || f.Zona != "" ||
		f.RegiaoIntegracao != "" || f.StatusIdeb != "" || f.DetalheStatusIdeb != "" ||
		f.StatusVinculo != "" || f.SomenteComIdeb {
		t.Fatalf("esperava todos os filtros desativados, obtive %+v", f)
	}
}

func TestParseIdebFilters_ValidValues(t *testing.T) {
	q := url.Values{
		"ano":                 {"2023"},
		"etapa":               {"anos_iniciais"},
		"dre":                 {"  DRE X  "},
		"municipio":           {"Belém"},
		"zona":                {"urbana"},
		"regiao_integracao":   {"Xingu"},
		"status_ideb":         {"com_ideb"},
		"detalhe_status_ideb": {"sem_resultado"},
		"status_vinculo":      {"match_inep"},
		"somente_com_ideb":    {"true"},
	}
	f, err := parseIdebFilters(q)
	if err != nil {
		t.Fatalf("valores válidos não devem falhar: %v", err)
	}
	if f.Etapa != "anos_iniciais" {
		t.Fatalf("etapa: esperava anos_iniciais, obtive %q", f.Etapa)
	}
	if f.DRE != "DRE X" { // TrimSpace aplicado
		t.Fatalf("dre: esperava \"DRE X\" (trim), obtive %q", f.DRE)
	}
	if f.StatusIdeb != "com_ideb" || f.DetalheStatusIdeb != "sem_resultado" || f.StatusVinculo != "match_inep" {
		t.Fatalf("enumerados inesperados: %+v", f)
	}
	if !f.SomenteComIdeb {
		t.Fatalf("somente_com_ideb: esperava true")
	}
}

func TestParseIdebFilters_InvalidDomainRejected(t *testing.T) {
	cases := map[string]url.Values{
		"ano não numérico":        {"ano": {"abc"}},
		"ano <= 0":                {"ano": {"0"}},
		"etapa inválida":          {"etapa": {"creche"}},
		"status_ideb inválido":    {"status_ideb": {"nd_proficiencia"}}, // não pertence ao guarda-chuva
		"detalhe inválido":        {"detalhe_status_ideb": {"qualquer"}},
		"status_vinculo inválido": {"status_vinculo": {"talvez"}},
		"booleano inválido":       {"somente_com_ideb": {"sim"}},
	}
	for name, q := range cases {
		if _, err := parseIdebFilters(q); err == nil {
			t.Fatalf("%s: esperava erro de validação, obtive nil", name)
		}
	}
}

func TestParseIdebFilters_BooleanForms(t *testing.T) {
	truthy := []string{"true", "True", "1", "t", "TRUE"}
	for _, v := range truthy {
		f, err := parseIdebFilters(url.Values{"somente_com_ideb": {v}})
		if err != nil || !f.SomenteComIdeb {
			t.Fatalf("somente_com_ideb=%q deveria ser true (err=%v)", v, err)
		}
	}
	falsy := []string{"false", "False", "0", "f", ""}
	for _, v := range falsy {
		f, err := parseIdebFilters(url.Values{"somente_com_ideb": {v}})
		if err != nil || f.SomenteComIdeb {
			t.Fatalf("somente_com_ideb=%q deveria ser false (err=%v)", v, err)
		}
	}
}

func TestIdebArgsOrder(t *testing.T) {
	f := idebFilters{
		Ano: 2023, Etapa: "anos_finais", DRE: "d", Municipio: "m", Zona: "z",
		RegiaoIntegracao: "ri", StatusIdeb: "com_ideb", DetalheStatusIdeb: "outro",
		StatusVinculo: "match_inep", SomenteComIdeb: true,
	}
	args := f.args()
	if len(args) != 10 {
		t.Fatalf("esperava 10 args, obtive %d", len(args))
	}
	if args[0] != 2023 || args[1] != "anos_finais" || args[9] != true {
		t.Fatalf("ordem dos args inesperada: %+v", args)
	}
}

func TestIdebCoberturaPercentual(t *testing.T) {
	cases := []struct {
		com, total int
		want       float64
	}{
		{0, 0, 0}, // denominador zero
		{1115, 1570, 71.02},
		{179, 427, 41.92},
		{346, 451, 76.72},
		{590, 692, 85.26},
		{1, 3, 33.33}, // arredonda a 2 casas
		{1, 1, 100},
	}
	for _, c := range cases {
		if got := idebCoberturaPercentual(c.com, c.total); got != c.want {
			t.Fatalf("idebCoberturaPercentual(%d,%d) = %v, esperava %v", c.com, c.total, got, c.want)
		}
	}
}

func TestIdebMediaPonderada(t *testing.T) {
	// peso zero => nil (sem registros elegíveis)
	if got := idebMediaPonderada(0, 0); got != nil {
		t.Fatalf("peso zero deveria devolver nil, obtive %v", *got)
	}
	if got := idebMediaPonderada(123.4, 0); got != nil {
		t.Fatalf("peso zero (com produto) deveria devolver nil, obtive %v", *got)
	}
	// 5*100 + 6*300 = 500 + 1800 = 2300; peso = 400; 2300/400 = 5.75
	if got := idebMediaPonderada(2300, 400); got == nil || *got != 5.75 {
		t.Fatalf("esperava 5.75, obtive %v", got)
	}
	// arredondamento a 2 casas: 10/3 = 3.3333 -> 3.33
	if got := idebMediaPonderada(10, 3); got == nil || *got != 3.33 {
		t.Fatalf("esperava 3.33, obtive %v", got)
	}
}

func TestIdebFaixa(t *testing.T) {
	cases := []struct {
		in   *float64
		want string
	}{
		{nil, "Sem IDEB divulgado"},
		{ptrF(0.0), "Abaixo de 3,0"},
		{ptrF(2.99), "Abaixo de 3,0"},
		{ptrF(3.0), "3,0 a 3,9"},
		{ptrF(3.9), "3,0 a 3,9"},
		{ptrF(4.0), "4,0 a 4,9"},
		{ptrF(4.99), "4,0 a 4,9"},
		{ptrF(5.0), "5,0 a 5,9"},
		{ptrF(5.61), "5,0 a 5,9"},
		{ptrF(6.0), "6,0 a 6,9"},
		{ptrF(6.99), "6,0 a 6,9"},
		{ptrF(7.0), "7,0+"},
		{ptrF(7.6), "7,0+"},
	}
	for _, c := range cases {
		if got := idebFaixa(c.in); got != c.want {
			t.Fatalf("idebFaixa(%v) = %q, esperava %q", c.in, got, c.want)
		}
	}
}

func TestIdebFaixa_AusenteNaoEhZero(t *testing.T) {
	// Regra metodológica central: IDEB ausente (nil) NUNCA cai na faixa numérica
	// mais baixa; vai para "Sem IDEB divulgado".
	if idebFaixa(nil) == "Abaixo de 3,0" {
		t.Fatalf("IDEB ausente não pode ser classificado como Abaixo de 3,0")
	}
}

func TestSortEtapasCanonical(t *testing.T) {
	in := []string{"ensino_medio", "anos_finais", "anos_iniciais"}
	sortEtapas(in)
	want := []string{"anos_iniciais", "anos_finais", "ensino_medio"}
	for i := range want {
		if in[i] != want[i] {
			t.Fatalf("sortEtapas = %v, esperava %v", in, want)
		}
	}
}

func TestIdebFaixasOrdemCobreTodasAsFaixas(t *testing.T) {
	// Toda faixa retornada por idebFaixa precisa existir em idebFaixasOrdem,
	// senão a distribuição perde linhas.
	amostras := []*float64{nil, ptrF(1), ptrF(3.5), ptrF(4.5), ptrF(5.5), ptrF(6.5), ptrF(8)}
	for _, a := range amostras {
		if idebFaixaOrdemIdx(idebFaixa(a)) >= len(idebFaixasOrdem) {
			t.Fatalf("faixa %q não está em idebFaixasOrdem", idebFaixa(a))
		}
	}
}
