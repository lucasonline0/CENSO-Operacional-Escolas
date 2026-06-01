package main

import (
	"fmt"
	"net/http"
)

// =====================================================================
// Fase 2A — Backend analítico da Caracterização da Rede
// =====================================================================
// Endpoints abaixo consomem vw_censo_enriquecida (migration 0002),
// derivada de vw_censo_base. Critérios provisórios herdados da Fase 1:
//
//   - status = 'completed';
//   - ano corrente (EXTRACT(YEAR FROM CURRENT_DATE));
//   - sem deduplicação automática por INEP;
//   - COUNT(DISTINCT school_id) quando o indicador é "quantidade de
//     escolas" — uma escola com censos em múltiplos anos não é contada
//     duas vezes.
//
// Divergências contra Google Sheets devem ser registradas em
// docs/dashboard/validacao-fase-2.md, não corrigidas silenciosamente.
// =====================================================================

// CaracterizacaoPerfil é o payload de
// GET /v1/admin/analytics/caracterizacao/perfil.
type CaracterizacaoPerfil struct {
	KPIs               CaracterizacaoKPIs       `json:"kpis"`
	PorPorte           []PorteStat              `json:"por_porte"`
	PorZona            []ZonaPercentStat        `json:"por_zona"`
	MatriculasPorPorte []MatriculasPorPorteStat `json:"matriculas_por_porte"`
}

// CaracterizacaoKPIs reúne os indicadores agregados do topo da aba.
type CaracterizacaoKPIs struct {
	TotalEscolas         int     `json:"total_escolas"`
	TotalAlunos          float64 `json:"total_alunos"`
	MediaAlunosPorEscola float64 `json:"media_alunos_por_escola"`
	AlunosPcd            float64 `json:"alunos_pcd"`
}

// PorteStat é a distribuição de escolas por porte (donut).
type PorteStat struct {
	Porte      string  `json:"porte"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

// ZonaPercentStat é a distribuição de escolas por zona (donut), com
// percentual já calculado no SQL para evitar reprocessamento no front.
type ZonaPercentStat struct {
	Zona       string  `json:"zona"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

// MatriculasPorPorteStat é a soma de alunos por porte (gráfico de barras).
type MatriculasPorPorteStat struct {
	Porte       string  `json:"porte"`
	TotalAlunos float64 `json:"total_alunos"`
}

// CaracterizacaoDRE é o payload de
// GET /v1/admin/analytics/caracterizacao/dre.
type CaracterizacaoDRE struct {
	TopDRES       []DRECountStat   `json:"top_dres"`
	Detalhamento  []DRESummaryStat `json:"detalhamento"`
}

// DRECountStat é a contagem de escolas por DRE ordenada desc (top).
type DRECountStat struct {
	DRE     string `json:"dre"`
	Escolas int    `json:"escolas"`
}

// DRESummaryStat é o resumo agregado por DRE para a tabela detalhada.
type DRESummaryStat struct {
	DRE                  string  `json:"dre"`
	Escolas              int     `json:"escolas"`
	TotalAlunos          float64 `json:"total_alunos"`
	MediaAlunosPorEscola float64 `json:"media_alunos_por_escola"`
	SalasAula            float64 `json:"salas_aula"`
}

// AnalyticsOverview é o payload do endpoint GET /v1/admin/analytics/overview.
// Reúne os KPIs principais do dashboard a partir do PostgreSQL (view
// vw_censo_base), substituindo, nos cards principais, a leitura que hoje
// vem de sheet-metrics.
type AnalyticsOverview struct {
	TotalSchools         int        `json:"total_schools"`
	TotalCensuses        int        `json:"total_censuses"`
	Completed            int        `json:"completed"`
	Drafts               int        `json:"drafts"`
	TotalAlunos          float64    `json:"total_alunos"`
	AlunosPcd            float64    `json:"alunos_pcd"`
	MediaAlunosPorEscola float64    `json:"media_alunos_por_escola"`
	PorZona              []ZonaStat `json:"por_zona"`
}

// ZonaStat é a contagem de escolas por zona.
type ZonaStat struct {
	Zona  string `json:"zona"`
	Total int    `json:"total"`
}

// AdminAnalyticsOverview lê vw_censo_base e devolve os KPIs principais.
//
// Critérios usados (documentados aqui para evitar drift no futuro):
//
//   - Contagens operacionais usam diretamente o banco via vw_censo_base
//     (que produz LEFT JOIN entre schools e census_responses):
//     * "total_schools"  = total de escolas cadastradas (independente de censo).
//     * "total_censuses" = total de linhas de censo registradas (todas as
//       combinações school_id × year), filtrando "census_id IS NOT NULL"
//       para descartar escolas sem nenhum censo (LEFT JOIN preenche NULL).
//   - "completed" e "drafts" contam ESCOLAS DISTINTAS (COUNT DISTINCT
//     school_id) — uma escola com censos em vários anos é contada uma
//     única vez. Isso casa com a semântica do card "Total de Escolas
//     (Censos concluídos)" no painel admin.
//   - Métricas QUANTITATIVAS DE ALUNOS ("total_alunos", "alunos_pcd",
//     "media_alunos_por_escola") consideram somente:
//        status = 'completed'  AND  year = EXTRACT(YEAR FROM CURRENT_DATE)::int
//     O filtro de ano corrente evita inflação caso a base já contenha
//     censos completados de múltiplos anos (cenário futuro do ciclo
//     anual). Filtros por ano via querystring serão tratados em fase
//     futura — por ora o critério é fixo no ano corrente.
//   - "por_zona" agrupa escolas (COUNT DISTINCT school_id) por s.zona;
//     uma escola sem zona informada cai em "Não informado".
func (app *application) AdminAnalyticsOverview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := AnalyticsOverview{
		PorZona: []ZonaStat{},
	}

	// 1) Contagens operacionais e quantitativos de alunos (1 query).
	//    - COUNT DISTINCT school_id em completed/drafts: evita contar
	//      a mesma escola múltiplas vezes quando houver censos de mais
	//      de um ano.
	//    - SUM/AVG filtram pelo ano corrente para evitar inflação
	//      acumulada entre ciclos anuais.
	//    - COALESCE garante 0 quando não há linhas completed no ano.
	err := db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM schools)                                                       AS total_schools,
			COUNT(*) FILTER (WHERE census_id IS NOT NULL)                                        AS total_censuses,
			COUNT(DISTINCT school_id) FILTER (WHERE status = 'completed')                        AS completed,
			COUNT(DISTINCT school_id) FILTER (WHERE status = 'draft')                            AS drafts,
			COALESCE(SUM(total_alunos)
				FILTER (
					WHERE status = 'completed'
					  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
				), 0)::float8                                                                    AS total_alunos,
			COALESCE(SUM(alunos_pcd)
				FILTER (
					WHERE status = 'completed'
					  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
				), 0)::float8                                                                    AS alunos_pcd,
			COALESCE(AVG(total_alunos)
				FILTER (
					WHERE status = 'completed'
					  AND total_alunos IS NOT NULL
					  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
				), 0)::float8                                                                    AS media_alunos
		FROM vw_censo_base
	`).Scan(
		&out.TotalSchools,
		&out.TotalCensuses,
		&out.Completed,
		&out.Drafts,
		&out.TotalAlunos,
		&out.AlunosPcd,
		&out.MediaAlunosPorEscola,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao calcular overview: %v", err), http.StatusInternalServerError)
		return
	}

	// 2) Distribuição por zona — escolas DISTINTAS por zona.
	rows, err := db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(zona, ''), 'Não informado') AS zona,
			COUNT(DISTINCT school_id)                   AS total
		FROM vw_censo_base
		GROUP BY 1
		ORDER BY 2 DESC, 1
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao agrupar por zona: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var z ZonaStat
		if err := rows.Scan(&z.Zona, &z.Total); err != nil {
			app.errorJSON(w, fmt.Errorf("erro ao ler zona: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorZona = append(out.PorZona, z)
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro ao iterar zona: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsCaracterizacaoPerfil lê vw_censo_enriquecida e devolve
// KPIs + distribuições principais da aba "Caracterização da Rede".
//
// Critérios (Fase 2A — provisórios, herdados da Fase 1):
//   - filtros analíticos:   status='completed' AND year=ano corrente;
//   - "total_escolas":      COUNT DISTINCT school_id;
//   - "total_alunos":       SUM(total_alunos);
//   - "media_alunos_por_escola": AVG(total_alunos) considerando apenas
//     escolas com total_alunos NOT NULL — evita média subestimada;
//   - "alunos_pcd":         SUM(alunos_pcd);
//   - "por_porte" e "por_zona": percentual sobre o total de escolas
//     consideradas (mesmo recorte);
//   - "matriculas_por_porte": SUM(total_alunos) GROUP BY porte_escola.
func (app *application) AdminAnalyticsCaracterizacaoPerfil(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := CaracterizacaoPerfil{
		PorPorte:           []PorteStat{},
		PorZona:            []ZonaPercentStat{},
		MatriculasPorPorte: []MatriculasPorPorteStat{},
	}

	// 1) KPIs agregados.
	err := db.QueryRowContext(ctx, `
		SELECT
			COUNT(DISTINCT school_id)                                    AS total_escolas,
			COALESCE(SUM(total_alunos), 0)::float8                       AS total_alunos,
			COALESCE(AVG(total_alunos) FILTER (WHERE total_alunos IS NOT NULL), 0)::float8 AS media_alunos,
			COALESCE(SUM(alunos_pcd),   0)::float8                       AS alunos_pcd
		FROM vw_censo_enriquecida
		WHERE status = 'completed'
		  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
	`).Scan(
		&out.KPIs.TotalEscolas,
		&out.KPIs.TotalAlunos,
		&out.KPIs.MediaAlunosPorEscola,
		&out.KPIs.AlunosPcd,
	)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro nos KPIs de caracterização: %v", err), http.StatusInternalServerError)
		return
	}

	// 2) Escolas por porte (donut). Percentual computado sobre o total
	//    de escolas DISTINTAS dentro do mesmo recorte completed/ano.
	rowsPorte, err := db.QueryContext(ctx, `
		WITH base AS (
			SELECT school_id, porte_escola_nome, porte_escola_cod
			FROM vw_censo_enriquecida
			WHERE status = 'completed'
			  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		totais AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS total FROM base
		)
		SELECT
			b.porte_escola_nome                                      AS porte,
			COUNT(DISTINCT b.school_id)                              AS escolas,
			CASE WHEN t.total > 0
				 THEN ROUND(100.0 * COUNT(DISTINCT b.school_id) / t.total, 2)
				 ELSE 0
			END::float8                                              AS percentual,
			MIN(b.porte_escola_cod)                                  AS ord
		FROM base b CROSS JOIN totais t
		GROUP BY b.porte_escola_nome, t.total
		ORDER BY ord
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em por_porte: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsPorte.Close()
	for rowsPorte.Next() {
		var p PorteStat
		var ord int
		if err := rowsPorte.Scan(&p.Porte, &p.Escolas, &p.Percentual, &ord); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo por_porte: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorPorte = append(out.PorPorte, p)
	}
	if err := rowsPorte.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando por_porte: %v", err), http.StatusInternalServerError)
		return
	}

	// 3) Escolas por zona (donut). 'Não informado' agrupa NULL/vazio.
	rowsZona, err := db.QueryContext(ctx, `
		WITH base AS (
			SELECT school_id, COALESCE(NULLIF(zona, ''), 'Não informado') AS zona
			FROM vw_censo_enriquecida
			WHERE status = 'completed'
			  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		totais AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS total FROM base
		)
		SELECT
			b.zona                                                   AS zona,
			COUNT(DISTINCT b.school_id)                              AS escolas,
			CASE WHEN t.total > 0
				 THEN ROUND(100.0 * COUNT(DISTINCT b.school_id) / t.total, 2)
				 ELSE 0
			END::float8                                              AS percentual
		FROM base b CROSS JOIN totais t
		GROUP BY b.zona, t.total
		ORDER BY escolas DESC, zona
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em por_zona: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsZona.Close()
	for rowsZona.Next() {
		var z ZonaPercentStat
		if err := rowsZona.Scan(&z.Zona, &z.Escolas, &z.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo por_zona: %v", err), http.StatusInternalServerError)
			return
		}
		out.PorZona = append(out.PorZona, z)
	}
	if err := rowsZona.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando por_zona: %v", err), http.StatusInternalServerError)
		return
	}

	// 4) Matrículas por porte (barras): SUM(total_alunos) por faixa.
	rowsMat, err := db.QueryContext(ctx, `
		SELECT
			porte_escola_nome              AS porte,
			COALESCE(SUM(total_alunos), 0)::float8 AS total_alunos,
			MIN(porte_escola_cod)          AS ord
		FROM vw_censo_enriquecida
		WHERE status = 'completed'
		  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		GROUP BY porte_escola_nome
		ORDER BY ord
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em matriculas_por_porte: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsMat.Close()
	for rowsMat.Next() {
		var m MatriculasPorPorteStat
		var ord int
		if err := rowsMat.Scan(&m.Porte, &m.TotalAlunos, &ord); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo matriculas_por_porte: %v", err), http.StatusInternalServerError)
			return
		}
		out.MatriculasPorPorte = append(out.MatriculasPorPorte, m)
	}
	if err := rowsMat.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando matriculas_por_porte: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// AdminAnalyticsCaracterizacaoDRE lê vw_censo_enriquecida e devolve o
// resumo por DRE consumido pela tabela "Detalhamento por DRE" e pelas
// barras "Escolas por DRE" da aba "Caracterização da Rede".
//
// Critérios (Fase 2A — provisórios, herdados da Fase 1):
//   - status='completed' AND year=ano corrente;
//   - "escolas":              COUNT DISTINCT school_id;
//   - "total_alunos":         SUM(total_alunos);
//   - "media_alunos_por_escola": AVG(total_alunos) restrita a escolas
//                              com total_alunos NOT NULL;
//   - "salas_aula":           SUM(qtd_salas_aula);
//   - DREs vazias/NULL caem em 'Não informado' para não sumirem do top.
func (app *application) AdminAnalyticsCaracterizacaoDRE(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := CaracterizacaoDRE{
		TopDRES:      []DRECountStat{},
		Detalhamento: []DRESummaryStat{},
	}

	// 1) Detalhamento por DRE. A mesma agregação serve para o "top",
	//    então calculamos uma vez e derivamos top_dres em Go,
	//    evitando uma segunda query e mantendo consistência total
	//    entre os dois blocos.
	rows, err := db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(dre, ''), 'Não informado')                                     AS dre,
			COUNT(DISTINCT school_id)                                                      AS escolas,
			COALESCE(SUM(total_alunos), 0)::float8                                         AS total_alunos,
			COALESCE(AVG(total_alunos) FILTER (WHERE total_alunos IS NOT NULL), 0)::float8 AS media_alunos,
			COALESCE(SUM(qtd_salas_aula), 0)::float8                                       AS salas_aula
		FROM vw_censo_enriquecida
		WHERE status = 'completed'
		  AND year   = EXTRACT(YEAR FROM CURRENT_DATE)::int
		GROUP BY 1
		ORDER BY escolas DESC, dre
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro no detalhamento por DRE: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d DRESummaryStat
		if err := rows.Scan(&d.DRE, &d.Escolas, &d.TotalAlunos, &d.MediaAlunosPorEscola, &d.SalasAula); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo DRE: %v", err), http.StatusInternalServerError)
			return
		}
		out.Detalhamento = append(out.Detalhamento, d)
		out.TopDRES = append(out.TopDRES, DRECountStat{DRE: d.DRE, Escolas: d.Escolas})
	}
	if err := rows.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando DRE: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}

// =====================================================================
// Caracterização da Rede — Organização da Oferta e Funcionamento
// =====================================================================

// LabelEscolasStat é uma linha genérica label/escolas/percentual usada
// nas distribuições de etapas, modalidades e turnos.
type LabelEscolasStat struct {
	Label      string  `json:"label"`
	Escolas    int     `json:"escolas"`
	Percentual float64 `json:"percentual"`
}

// MediaTurnosPorPorteStat é a média de turnos distintos por faixa de porte.
type MediaTurnosPorPorteStat struct {
	Porte       string  `json:"porte"`
	MediaTurnos float64 `json:"media_turnos"`
}

// CaracterizacaoOfertaFuncionamento é o payload de
// GET /v1/admin/analytics/caracterizacao/oferta-funcionamento.
type CaracterizacaoOfertaFuncionamento struct {
	EtapasOfertadas      []LabelEscolasStat        `json:"etapas_ofertadas"`
	ModalidadesOfertadas []LabelEscolasStat        `json:"modalidades_ofertadas"`
	Turnos               []LabelEscolasStat        `json:"turnos"`
	MediaTurnosPorPorte  []MediaTurnosPorPorteStat `json:"media_turnos_por_porte"`
}

// AdminAnalyticsCaracterizacaoOfertaFuncionamento lê os campos multivalorados
// da tabela schools (turnos, etapas_ofertadas, modalidades_ofertadas) para
// escolas com censo concluído no ano corrente e devolve as distribuições
// necessárias para o bloco "Organização da Oferta e Funcionamento".
//
// Critérios:
//   - Escolas elegíveis: census_responses.status='completed' AND year=ano corrente.
//   - Denominador de percentual: COUNT(DISTINCT school_id) elegíveis.
//   - Uma escola pode contribuir para múltiplas etapas/modalidades/turnos
//     (campo multivalorado) — percentuais somam > 100%, o que é esperado.
//   - Escolas sem o campo preenchido entram no denominador mas não em nenhuma
//     categoria.
//   - media_turnos_por_porte exclui escolas sem turnos declarados no banco.
func (app *application) AdminAnalyticsCaracterizacaoOfertaFuncionamento(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := app.models.Schools.DB

	out := CaracterizacaoOfertaFuncionamento{
		EtapasOfertadas:      []LabelEscolasStat{},
		ModalidadesOfertadas: []LabelEscolasStat{},
		Turnos:               []LabelEscolasStat{},
		MediaTurnosPorPorte:  []MediaTurnosPorPorteStat{},
	}

	// 1) Etapas ofertadas — unnest de census_responses.data->'etapas_ofertadas'.
	// Fonte: JSONB do censo (Step 2), não schools.etapas_ofertadas — ver
	// docs/dashboard/jsonb-field-inventory.md seção 3.1 (duplicidade R5).
	rowsEtapas, err := db.QueryContext(ctx, `
		WITH completed AS (
			SELECT cr.school_id, cr.data
			FROM census_responses cr
			WHERE cr.status = 'completed'
			  AND cr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		total AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS n FROM completed
		),
		expanded AS (
			SELECT c.school_id, trim(e.val) AS etapa
			FROM completed c
			CROSS JOIN jsonb_array_elements_text(
				CASE
					WHEN jsonb_typeof(c.data->'etapas_ofertadas') = 'array'
					THEN c.data->'etapas_ofertadas'
					ELSE '[]'::jsonb
				END
			) AS e(val)
			WHERE trim(e.val) != ''
		)
		SELECT
			ex.etapa                                                    AS label,
			COUNT(DISTINCT ex.school_id)                                AS escolas,
			CASE WHEN t.n > 0
				THEN ROUND(100.0 * COUNT(DISTINCT ex.school_id) / t.n, 1)
				ELSE 0
			END::float8                                                 AS percentual
		FROM expanded ex
		CROSS JOIN total t
		GROUP BY ex.etapa, t.n
		ORDER BY escolas DESC, label
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em etapas_ofertadas: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsEtapas.Close()
	for rowsEtapas.Next() {
		var s LabelEscolasStat
		if err := rowsEtapas.Scan(&s.Label, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo etapas: %v", err), http.StatusInternalServerError)
			return
		}
		out.EtapasOfertadas = append(out.EtapasOfertadas, s)
	}
	if err := rowsEtapas.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando etapas: %v", err), http.StatusInternalServerError)
		return
	}

	// 2) Modalidades ofertadas — unnest de census_responses.data->'modalidades_ofertadas'.
	// Mesma razão que etapas: fonte correta é o JSONB do censo (Step 2).
	rowsMod, err := db.QueryContext(ctx, `
		WITH completed AS (
			SELECT cr.school_id, cr.data
			FROM census_responses cr
			WHERE cr.status = 'completed'
			  AND cr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		total AS (
			SELECT COUNT(DISTINCT school_id)::numeric AS n FROM completed
		),
		expanded AS (
			SELECT c.school_id, trim(m.val) AS modalidade
			FROM completed c
			CROSS JOIN jsonb_array_elements_text(
				CASE
					WHEN jsonb_typeof(c.data->'modalidades_ofertadas') = 'array'
					THEN c.data->'modalidades_ofertadas'
					ELSE '[]'::jsonb
				END
			) AS m(val)
			WHERE trim(m.val) != ''
		)
		SELECT
			ex.modalidade                                               AS label,
			COUNT(DISTINCT ex.school_id)                                AS escolas,
			CASE WHEN t.n > 0
				THEN ROUND(100.0 * COUNT(DISTINCT ex.school_id) / t.n, 1)
				ELSE 0
			END::float8                                                 AS percentual
		FROM expanded ex
		CROSS JOIN total t
		GROUP BY ex.modalidade, t.n
		ORDER BY escolas DESC, label
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em modalidades_ofertadas: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsMod.Close()
	for rowsMod.Next() {
		var s LabelEscolasStat
		if err := rowsMod.Scan(&s.Label, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo modalidades: %v", err), http.StatusInternalServerError)
			return
		}
		out.ModalidadesOfertadas = append(out.ModalidadesOfertadas, s)
	}
	if err := rowsMod.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando modalidades: %v", err), http.StatusInternalServerError)
		return
	}

	// CTE base para queries 3 e 4: school_id de censos concluídos (sem data).
	const baseCTE = `
		WITH completed AS (
			SELECT DISTINCT cr.school_id
			FROM census_responses cr
			WHERE cr.status = 'completed'
			  AND cr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		total AS (
			SELECT COUNT(*)::numeric AS n FROM completed
		)`

	// 3) Distribuição por turno — unnest de schools.turnos.
	rowsTurnos, err := db.QueryContext(ctx, baseCTE+`,
		expanded AS (
			SELECT c.school_id, trim(t2.val) AS turno
			FROM completed c
			JOIN schools s ON s.id = c.school_id
			CROSS JOIN jsonb_array_elements_text(
				CASE
					WHEN s.turnos IS NOT NULL
					 AND s.turnos != ''
					 AND s.turnos != 'null'
					 AND s.turnos ~ '^\s*\[.*\]\s*$'
					THEN s.turnos::jsonb
					ELSE '[]'::jsonb
				END
			) AS t2(val)
			WHERE trim(t2.val) != ''
		)
		SELECT
			ex.turno                                                    AS label,
			COUNT(DISTINCT ex.school_id)                                AS escolas,
			CASE WHEN t.n > 0
				THEN ROUND(100.0 * COUNT(DISTINCT ex.school_id) / t.n, 1)
				ELSE 0
			END::float8                                                 AS percentual
		FROM expanded ex
		CROSS JOIN total t
		GROUP BY ex.turno, t.n
		ORDER BY escolas DESC, label
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em turnos: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsTurnos.Close()
	for rowsTurnos.Next() {
		var s LabelEscolasStat
		if err := rowsTurnos.Scan(&s.Label, &s.Escolas, &s.Percentual); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo turnos: %v", err), http.StatusInternalServerError)
			return
		}
		out.Turnos = append(out.Turnos, s)
	}
	if err := rowsTurnos.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando turnos: %v", err), http.StatusInternalServerError)
		return
	}

	// 4) Média de turnos distintos por porte — escolas sem turnos declarados
	//    são excluídas do cálculo (não entram como zero).
	rowsMedia, err := db.QueryContext(ctx, `
		WITH completed AS (
			SELECT DISTINCT cr.school_id
			FROM census_responses cr
			WHERE cr.status = 'completed'
			  AND cr.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
		),
		turnos_por_escola AS (
			SELECT c.school_id,
				   COUNT(DISTINCT trim(t.val))::numeric AS qtd_turnos
			FROM completed c
			JOIN schools s ON s.id = c.school_id
			CROSS JOIN jsonb_array_elements_text(
				CASE
					WHEN s.turnos IS NOT NULL
					 AND s.turnos != ''
					 AND s.turnos != 'null'
					 AND s.turnos ~ '^\s*\[.*\]\s*$'
					THEN s.turnos::jsonb
					ELSE '[]'::jsonb
				END
			) AS t(val)
			WHERE trim(t.val) != ''
			GROUP BY c.school_id
		)
		SELECT
			e.porte_escola_nome                   AS porte,
			ROUND(AVG(tp.qtd_turnos), 1)::float8  AS media_turnos,
			MIN(e.porte_escola_cod)               AS ord
		FROM turnos_por_escola tp
		JOIN vw_censo_enriquecida e
		  ON e.school_id = tp.school_id
		 AND e.status    = 'completed'
		 AND e.year      = EXTRACT(YEAR FROM CURRENT_DATE)::int
		GROUP BY e.porte_escola_nome
		ORDER BY ord
	`)
	if err != nil {
		app.errorJSON(w, fmt.Errorf("erro em media_turnos_por_porte: %v", err), http.StatusInternalServerError)
		return
	}
	defer rowsMedia.Close()
	for rowsMedia.Next() {
		var s MediaTurnosPorPorteStat
		var ord int
		if err := rowsMedia.Scan(&s.Porte, &s.MediaTurnos, &ord); err != nil {
			app.errorJSON(w, fmt.Errorf("erro lendo media_turnos: %v", err), http.StatusInternalServerError)
			return
		}
		out.MediaTurnosPorPorte = append(out.MediaTurnosPorPorte, s)
	}
	if err := rowsMedia.Err(); err != nil {
		app.errorJSON(w, fmt.Errorf("erro iterando media_turnos: %v", err), http.StatusInternalServerError)
		return
	}

	app.writeJSON(w, http.StatusOK, jsonResponse{Error: false, Data: out})
}
