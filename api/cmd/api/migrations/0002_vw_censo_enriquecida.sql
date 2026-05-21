-- =====================================================================
-- Migration 0002 — vw_censo_enriquecida
-- =====================================================================
-- Fase 2A do roadmap do dashboard analítico próprio.
-- Deriva de vw_censo_base, sem alterar a view base, adicionando:
--   - qtd_turmas_total              (soma dos turmas_*)
--   - qtd_salas_nao_climatizadas    (qtd_salas_aula - salas_climatizadas)
--   - situacao_climatizacao_salas   (categórico: Não climatizadas /
--                                    Parcialmente / Totalmente / Não informado)
--   - porte_escola                  (label legível: '0-50', '50-150', ...)
--   - porte_escola_cod              (inteiro ordenável: 0..6)
--   - porte_escola_nome             (alias de porte_escola, mantido para
--                                    compatibilidade com o payload da API)
--
-- Critérios da Fase 2A:
--   - Filtros analíticos (status='completed', ano corrente) NÃO entram
--     na view — são aplicados no SQL dos endpoints. A view permanece
--     ampla para permitir filtros futuros sem reescrever a base.
--   - Nenhuma deduplicação automática por INEP.
--   - Faixas de porte conforme task da Frente B / guia metodológico
--     (seção 7); labels usam hífen ASCII ('-') para evitar problemas
--     com en-dash em payloads JSON consumidos pelo front.
--
-- Idempotência: CREATE OR REPLACE VIEW. Este arquivo é embarcado no
-- binário via go:embed em main.go (migrationsFS) e aplicado no startup.
-- A cópia em infra/migrations/0002_vw_censo_enriquecida.sql é mantida
-- como referência operacional / fonte de verdade documental.
-- =====================================================================

CREATE OR REPLACE VIEW vw_censo_enriquecida AS
SELECT
    b.*,

    -- Total de turmas (manhã + tarde + noite + integral). NULLs entram
    -- como 0 para permitir somar mesmo quando o diretor preencheu
    -- apenas alguns turnos.
    (COALESCE(b.turmas_manha,    0)
   + COALESCE(b.turmas_tarde,    0)
   + COALESCE(b.turmas_noite,    0)
   + COALESCE(b.turmas_integral, 0))::numeric                AS qtd_turmas_total,

    -- Salas não climatizadas = salas_aula - salas_climatizadas, com
    -- piso em 0. Quando salas_aula está ausente, retorna NULL para
    -- não inflar o numerador artificialmente.
    CASE
      WHEN b.qtd_salas_aula IS NULL THEN NULL
      ELSE GREATEST(
        COALESCE(b.qtd_salas_aula, 0) - COALESCE(b.salas_climatizadas, 0),
        0
      )::numeric
    END                                                     AS qtd_salas_nao_climatizadas,

    -- Categorização da climatização. A escola sem salas informadas
    -- (NULL ou 0) cai em 'Não informado' para evitar viés analítico.
    CASE
      WHEN b.qtd_salas_aula IS NULL OR b.qtd_salas_aula = 0 THEN 'Não informado'
      WHEN COALESCE(b.salas_climatizadas, 0) = 0            THEN 'Não climatizadas'
      WHEN b.salas_climatizadas >= b.qtd_salas_aula         THEN 'Totalmente climatizadas'
      ELSE                                                       'Parcialmente climatizadas'
    END                                                     AS situacao_climatizacao_salas,

    -- Porte (label legível). Faixas conforme task da Frente B.
    CASE
      WHEN b.total_alunos IS NULL    THEN 'Não informado'
      WHEN b.total_alunos <= 50      THEN '0-50'
      WHEN b.total_alunos <= 150     THEN '50-150'
      WHEN b.total_alunos <= 300     THEN '150-300'
      WHEN b.total_alunos <= 500     THEN '300-500'
      WHEN b.total_alunos <= 1000    THEN '500-1000'
      ELSE                                '1000+'
    END                                                     AS porte_escola,

    -- Código ordenável do porte (0 = não informado, 1..6 crescente).
    CASE
      WHEN b.total_alunos IS NULL    THEN 0
      WHEN b.total_alunos <= 50      THEN 1
      WHEN b.total_alunos <= 150     THEN 2
      WHEN b.total_alunos <= 300     THEN 3
      WHEN b.total_alunos <= 500     THEN 4
      WHEN b.total_alunos <= 1000    THEN 5
      ELSE                                6
    END                                                     AS porte_escola_cod,

    -- Alias do porte_escola, mantido para casar com o contrato do
    -- endpoint /caracterizacao/perfil (campo "porte" na resposta).
    CASE
      WHEN b.total_alunos IS NULL    THEN 'Não informado'
      WHEN b.total_alunos <= 50      THEN '0-50'
      WHEN b.total_alunos <= 150     THEN '50-150'
      WHEN b.total_alunos <= 300     THEN '150-300'
      WHEN b.total_alunos <= 500     THEN '300-500'
      WHEN b.total_alunos <= 1000    THEN '500-1000'
      ELSE                                '1000+'
    END                                                     AS porte_escola_nome
FROM vw_censo_base b;
