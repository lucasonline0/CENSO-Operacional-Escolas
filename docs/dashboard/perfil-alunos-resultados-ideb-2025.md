# Perfil dos Alunos e Resultados — Documentação IDEB 2025

**Status:** documentação técnica da implementação IDEB 2025.

**Referência anterior:** [`perfil-alunos-resultados-ideb-2023.md`](perfil-alunos-resultados-ideb-2023.md)

---

## 1. Objetivo

Documentar a implementação da base **IDEB 2025** no dashboard, mantendo o mesmo padrão de governança e rastreabilidade utilizado para o IDEB 2023.

A entrada de 2025 é tratada como uma **nova versão temporal** da mesma série, não como uma tabela paralela. O modelo `ideb_resultados` já é temporal (coluna `ano`), portanto não houve necessidade de criar nova tabela.

---

## 2. Fontes de dados

### 2.1 Planilha oficial

Arquivo analisado:

```txt
ideb_2023_2025_iniciais_finais_medio.xlsx
```

Aba utilizada:

```txt
IDEB 2025
```

### 2.2 Diferenças em relação ao IDEB 2023

| Coluna IDEB 2023 | Coluna IDEB 2025 | Observação |
|------------------|------------------|------------|
| `Total avaliado` | `QT. DE ALUNOS MATRICULADOS CENSO` | Renomeada |
| `Percentual avaliado` | `TAXA DE PARTICIPACAO` | Renomeada |
| *(não existe)* | `PRESENTES` | **Nova** — número de alunos presentes |
| `IDEB 2023` | `IDEB 2025` | Nome muda com o ano |

### 2.3 Mapeamento para o modelo canônico

| Campo canônico | Coluna planilha 2023 | Coluna planilha 2025 |
|----------------|----------------------|----------------------|
| `ano` | `ANO` | `ANO` |
| `etapa` | `Ensino` | `Ensino` |
| `codigo_inep` | `INEP` | `INEP` |
| `nome_escola_origem` | `NOME DA ESCOLA` | `NOME DA ESCOLA` |
| `total_avaliado` | `Total avaliado` | `QT. DE ALUNOS MATRICULADOS CENSO` |
| `percentual_avaliado` | `Percentual avaliado` | `TAXA DE PARTICIPACAO` |
| `proficiencia_portugues` | `Proficiência Português` | `Proficiencia Portugues` |
| `proficiencia_matematica` | `Proficiência Matemática` | `Proficiencia Matematica` |
| `fluxo_indicador_rendimento` | `Fluxo - Indicador de rendimento` | `Fluxo - Indicador de rendimento` |
| `ideb` | `IDEB 2023` | `IDEB 2025` |
| `presentes` | *(não existe)* | `PRESENTES` |

### 2.4 Normalização de etapas

| Valor na planilha 2023 | Valor na planilha 2025 | Chave canônica |
|------------------------|------------------------|----------------|
| `anos iniciais` | `5º ano do Ensino Fundamental` | `anos_iniciais` |
| `anos finais` | `9º ano de Ensino Fundamental` | `anos_finais` |
| `ensino medio` | `3ª/4ª série do Ensino Médio` | `ensino_medio` |

---

## 3. Migration

### 3.1 Estrutura existente (0017)

A tabela `ideb_resultados` já existe com a estrutura temporal completa. A constraint `ano >= 2005` aceita 2025 sem alteração.

### 3.2 Nova coluna (0022)

```sql
ALTER TABLE ideb_resultados
    ADD COLUMN IF NOT EXISTS presentes INT NULL;
```

A coluna `presentes` é nullable para compatibilidade com dados de 2023 (onde não existe).

---

## 4. Importador

### 4.1 Uso multi-ano

O importador `scripts/ideb/import_ideb_resultados.py` foi generalizado para suportar múltiplos anos:

```bash
# Dry-run para 2025:
python scripts/ideb/import_ideb_resultados.py \
    --source _local/ideb/fontes/ideb_2025_iniciais_finais_medio.xlsx \
    --ano 2025 --dry-run

# Carga real para 2025:
python scripts/ideb/import_ideb_resultados.py \
    --source _local/ideb/fontes/ideb_2025_iniciais_finais_medio.xlsx \
    --ano 2025 --apply --confirm-apply \
    --batch-id ideb_2025_YYYYMMDD_HHMMSS
```

### 4.2 Configuração dinâmica

O ano define automaticamente:
- Nome da aba: `IDEB {ano}`
- Coluna IDEB: `IDEB {ano}`
- Mapeamento de colunas (diferente entre 2023 e 2025)
- Caminhos de relatório

### 4.3 Override da aba

Para usar uma aba com nome diferente:

```bash
python scripts/ideb/import_ideb_resultados.py \
    --source <planilha> --ano 2025 --aba "Nome Personalizado"
```

---

## 5. Backend

### 5.1 Endpoint

```
GET /v1/admin/analytics/perfil-alunos-resultados/ideb?ano=2025
```

### 5.2 Default do ano

O parâmetro `ano` tem como valor padrão `DefaultIdebAno = 2023`. Para consultar 2025, é necessário enviar `ano=2025` explicitamente.

### 5.3 Campo `total_presentes`

O response inclui `total_presentes` no resumo (soma de `presentes` de todos os registros). Este campo é `null` para dados de 2023 (onde a coluna não existia).

---

## 6. Regras metodológicas

As mesmas regras do IDEB 2023 se aplicam:

- `codigo_inep` preservado como **texto** (zeros à esquerda mantidos)
- IDEB ausente (`-`, `ND`, vazio) → `NULL`, nunca `0`
- `status_ideb`: `com_ideb` | `sem_ideb_divulgado`
- `detalhe_status_ideb`: `NULL` | `sem_resultado` | `nd_proficiencia` | `outro`
- `percentual_avaliado > 100` preservado (alerta de qualidade)
- UPSERT idempotente: `ON CONFLICT (ano, codigo_inep, etapa) DO UPDATE`
- Dados de 2023 permanecem intactos após carga de 2025

---

## 7. Critérios de aceite

| Critério | Status |
|----------|--------|
| Dados 2023 intactos após carga 2025 | ✅ |
| Dados 2025 carregáveis múltiplas vezes sem duplicação | ✅ |
| `codigo_inep` preservado com zeros à esquerda | ✅ |
| Ausência de IDEB permanece `NULL` | ✅ |
| Registros sem match em schools não descartados | ✅ |
| Métricas de auditoria comparáveis a 2023 | ✅ |
| Testes cobrem idempotência, -/ND, chave composta, vínculo | ✅ |
