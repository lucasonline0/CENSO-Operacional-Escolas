package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIndiceGovernancaSelectSQLCoalesceNullableIndicators(t *testing.T) {
	t.Parallel()

	indicators := []string{
		"conselho_escolar",
		"conselho_ativo",
		"regularizada_cee",
		"gremio_estudantil",
	}

	for _, indicator := range indicators {
		want := "COALESCE(cr.data->>'" + indicator + "' = 'Sim', false) AS " + indicator
		if !strings.Contains(indiceGovernancaSelectSQL, want) {
			t.Errorf("indiceGovernancaSelectSQL deve proteger %s contra NULL com %q", indicator, want)
		}
	}
}

func TestWriteIndiceGovernancaPayloadUsesAPIEnvelope(t *testing.T) {
	t.Parallel()

	payload := IndiceGovernancaPayload{
		TotalEscolas: 1,
		Escolas: []IndiceGovernancaEscola{
			{SchoolID: 42, Escola: "Escola teste", HasCenso: true},
		},
	}
	recorder := httptest.NewRecorder()
	app := &application{}

	if err := app.writeIndiceGovernancaPayload(recorder, payload); err != nil {
		t.Fatalf("writeIndiceGovernancaPayload retornou erro: %v", err)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("status: esperava %d, obtive %d", http.StatusOK, recorder.Code)
	}

	var response struct {
		Error bool                    `json:"error"`
		Data  IndiceGovernancaPayload `json:"data"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decodificar resposta: %v", err)
	}
	if response.Error {
		t.Fatal("envelope retornou error=true")
	}
	if response.Data.TotalEscolas != 1 || len(response.Data.Escolas) != 1 {
		t.Fatalf("payload ausente do campo data: %+v", response.Data)
	}
	if response.Data.Escolas[0].SchoolID != 42 {
		t.Fatalf("escola inesperada no envelope: %+v", response.Data.Escolas[0])
	}
}
