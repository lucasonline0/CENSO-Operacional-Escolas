-- 0023_fix_ideb_2025_total_avaliado_semantics
--
-- Corrige cargas IDEB 2025 realizadas antes da normalização semântica do
-- importador. Na fonte 2025, "QT. DE ALUNOS MATRICULADOS CENSO" é o
-- denominador da taxa de participação; "PRESENTES" representa a quantidade
-- efetivamente participante/avaliada e é o equivalente semântico do campo
-- canônico total_avaliado usado pelo dashboard.
--
-- Idempotente: uma segunda execução não altera linhas já normalizadas.

UPDATE ideb_resultados
SET
    total_avaliado = presentes,
    updated_at = CURRENT_TIMESTAMP
WHERE ano = 2025
  AND presentes IS NOT NULL
  AND total_avaliado IS DISTINCT FROM presentes;
