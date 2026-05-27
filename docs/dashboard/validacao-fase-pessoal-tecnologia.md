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

## 3. Pendências de Validação

- [ ] Coletar payloads reais em ambiente de homologação.
- [ ] Preencher IDs e nomes reais na inspeção manual (Seção 1.2).
- [ ] Validar endpoints de Coordenação por Área (View 0004).
- [ ] Validar endpoints de Quadro de Pessoal (View 0005).
- [ ] Validar endpoints de Tecnologia (View 0006).

---

## 3. Preservação de Serviços

- [x] `sheet-metrics` continua funcional.
- [x] `indicadores-metrics` continua funcional.
- [x] `/v1/locations` continua consumindo do Sheets.
- [x] Job de sincronização (`sheetSyncRetryJob`) operando normalmente.
