# Validação — Frente 1 (Pessoal e Gestão Escolar + Tecnologia)

Este documento registra a paridade e a qualidade dos dados para os endpoints analíticos da Frente 1, baseados exclusivamente no PostgreSQL.

---

## 1. View `vw_censo_direcao_escolar` (0003)

### 1.1 Payload de exemplo (`/pessoal-gestao/estrutura`)

```json
{
  "error": false,
  "data": {
    "composicao_gestao": [
      {
        "valor": "Direção Escolar",
        "escolas": 150,
        "percentual": 98.5
      },
      {
        "valor": "Vice-Diretor Pedagógico",
        "escolas": 120,
        "percentual": 78.9
      },
      {
        "valor": "Vice-Diretor Administrativo",
        "escolas": 85,
        "percentual": 55.9
      },
      {
        "valor": "Secretário Escolar",
        "escolas": 140,
        "percentual": 92.1
      },
      {
        "valor": "Coordenação Pedagógica",
        "escolas": 135,
        "percentual": 88.8
      }
    ],
    "total_coordenadores_pedagogicos": 450.0
  }
}
```

### 1.2 Inspeção Manual (Amostra de 3 escolas)

| school_id | Nome da Escola | Campo JSONB (`possui_direcao`) | View `possui` | Status |
|---|---|---|---|---|
| [ID 1] | [Nome 1] | "Sim" | true | ✅ |
| [ID 2] | [Nome 2] | "Não" | false | ✅ |
| [ID 3] | [Nome 3] | null | false | ✅ |

### 1.3 SQL de Sanity-Check

```sql
-- Cardinalidade: deve retornar exatamente 5 linhas por (escola, ano) completed
SELECT school_id, year, COUNT(*) 
FROM vw_censo_direcao_escolar 
WHERE status = 'completed'
GROUP BY 1, 2
HAVING COUNT(*) <> 5;
-- Resultado esperado: zero linhas.
```

---

## 2. View `vw_censo_coordenacao_area` (0004)

### 2.1 Payload de exemplo (`/pessoal-gestao/coordenacao`)

```json
{
  "error": false,
  "data": {
    "por_area": [
      {
        "valor": "Linguagens",
        "escolas": 130,
        "percentual": 85.5
      },
      {
        "valor": "Matemática",
        "escolas": 125,
        "percentual": 82.2
      },
      {
        "valor": "Ciências Humanas",
        "escolas": 110,
        "percentual": 72.4
      },
      {
        "valor": "Ciências da Natureza",
        "escolas": 105,
        "percentual": 69.1
      }
    ],
    "cobertura_media": 3.09
  }
}
```

### 2.2 Inspeção Manual (Amostra de 3 escolas)

| school_id | Nome da Escola | Campo JSONB (`possui_coord_area_matematica`) | View `possui` | Status |
|---|---|---|---|---|
| [ID 1] | [Nome 1] | "Sim" | true | ✅ |
| [ID 2] | [Nome 2] | "Não" | false | ✅ |
| [ID 3] | [Nome 3] | null | false | ✅ |

### 2.3 SQL de Sanity-Check

```sql
-- Cardinalidade: deve retornar exatamente 4 linhas por (escola, ano) completed
SELECT school_id, year, COUNT(*) 
FROM vw_censo_coordenacao_area 
WHERE status = 'completed'
GROUP BY 1, 2
HAVING COUNT(*) <> 4;
-- Resultado esperado: zero linhas.
```

---

## 3. View `vw_censo_quadro_pessoal` (0005)

### 3.1 Payload de exemplo (`/pessoal-gestao/quadro-pessoal`)

```json
{
  "error": false,
  "data": {
    "total_professores_efetivos": 1200.0,
    "total_professores_temporarios": 800.0,
    "total_servidores_administrativos": 450.0,
    "total_professores_readaptados": 60.0,
    "media_por_escola": {
      "efetivos": 7.5,
      "temporarios": 5.0,
      "administrativos": 2.8,
      "readaptados": 0.4
    },
    "por_dre": [
      {
        "dre": "DRE Belém",
        "total_efetivos": 340.0,
        "total_temporarios": 210.0,
        "media_total_professores": 12.8
      }
    ]
  }
}
```

### 3.2 Inspeção Manual (Amostra de 3 escolas)

| school_id | Nome da Escola | JSONB `qtd_professores_efetivos` | View `qtd_professores_efetivos` | Status |
|---|---|---|---|---|
| [ID 1] | [Nome 1] | "12" | 12 | ✅ |
| [ID 2] | [Nome 2] | "" | 0 | ✅ |
| [ID 3] | [Nome 3] | null | 0 | ✅ |

### 3.3 SQL de Sanity-Check

```sql
-- Cardinalidade: deve retornar exatamente 1 linha por (escola, ano) completed
SELECT school_id, year, COUNT(*)
FROM vw_censo_quadro_pessoal
WHERE status = 'completed'
GROUP BY 1, 2
HAVING COUNT(*) <> 1;
-- Resultado esperado: zero linhas.

-- Total de professores não deve ser negativo
SELECT school_id, year, total_professores
FROM vw_censo_quadro_pessoal
WHERE total_professores < 0;
-- Resultado esperado: zero linhas.
```

---

## 4. View `vw_censo_equipamentos_tecnologia` (0006)

### 4.1 Payload de exemplo (`/tecnologia/infraestrutura`)

```json
{
  "error": false,
  "data": {
    "escolas_com_internet": 120,
    "percentual_internet": 79.0,
    "por_provedor": [
      { "valor": "Claro", "escolas": 55, "percentual": 36.2 },
      { "valor": "Oi", "escolas": 40, "percentual": 26.3 }
    ],
    "por_qualidade": [
      { "valor": "Boa", "escolas": 60, "percentual": 39.5 },
      { "valor": "Regular", "escolas": 45, "percentual": 29.6 },
      { "valor": "Ruim", "escolas": 15, "percentual": 9.9 }
    ],
    "total_desktops_adm": 450.0,
    "total_desktops_alunos": 3200.0,
    "total_notebooks": 280.0,
    "total_chromebooks": 150.0,
    "total_computadores_inoperantes": 85.0,
    "percentual_computadores_atendem": 65.0
  }
}
```

### 4.2 Payload de exemplo (`/tecnologia/uso-pedagogico`)

```json
{
  "error": false,
  "data": {
    "escolas_com_projetor": 95,
    "percentual_com_projetor": 62.5,
    "total_projetores": 140.0,
    "escolas_com_lousa_digital": 45,
    "percentual_com_lousa_digital": 29.6
  }
}
```

### 4.3 Inspeção Manual (Amostra de 3 escolas)

| school_id | Nome da Escola | JSONB `internet_disponivel` | View `internet_disponivel` | Status |
|---|---|---|---|---|
| [ID 1] | [Nome 1] | "Sim" | true | ✅ |
| [ID 2] | [Nome 2] | "Não" | false | ✅ |
| [ID 3] | [Nome 3] | null | false | ✅ |

### 4.4 SQL de Sanity-Check

```sql
-- Cardinalidade: deve retornar exatamente 1 linha por (escola, ano) completed
SELECT school_id, year, COUNT(*)
FROM vw_censo_equipamentos_tecnologia
WHERE status = 'completed'
GROUP BY 1, 2
HAVING COUNT(*) <> 1;
-- Resultado esperado: zero linhas.

-- Quantitativos negativos não devem existir
SELECT school_id, year, qtd_desktop_adm, qtd_desktop_alunos, qtd_notebooks
FROM vw_censo_equipamentos_tecnologia
WHERE qtd_desktop_adm < 0
   OR qtd_desktop_alunos < 0
   OR qtd_notebooks < 0
   OR qtd_chromebooks < 0
   OR qtd_computadores_inoperantes < 0
   OR qtd_projetores < 0;
-- Resultado esperado: zero linhas.
```

---

## 5. Pendências de Validação

- [ ] Coletar payloads reais em ambiente de homologação.
- [ ] Preencher IDs e nomes reais na inspeção manual (Seções 1.2, 2.2, 3.2, 4.3).
- [ ] Executar sanity-checks SQL contra banco de homologação.

---

## 3. Preservação de Serviços

- [x] `sheet-metrics` continua funcional.
- [x] `indicadores-metrics` continua funcional.
- [x] `/v1/locations` continua consumindo do Sheets.
- [x] Job de sincronização (`sheetSyncRetryJob`) operando normalmente.
