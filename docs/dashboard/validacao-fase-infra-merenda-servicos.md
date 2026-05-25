# Validação — Frente 2: Infraestrutura, Merenda e Serviços Terceirizados

**Branch:** `feat/analytics-infra-merenda-servicos`
**Data:** 2026-05-25
**Base de dados:** Railway (produção)

---

## 1. Views criadas

| Migration | View | Granularidade |
|---|---|---|
| 0007 | `vw_censo_ambientes` | 1 linha por (school_id, year, ambiente) |
| 0008 | `vw_censo_infraestrutura_seguranca` | 1 linha por (school_id, year) |
| 0009 | `vw_censo_equipamentos_merenda` | 1 linha por (school_id, year) |
| 0010 | `vw_censo_rh_merendeiras` | 1 linha por (school_id, year) |
| 0011 | `vw_censo_rh_servicos_gerais` | 1 linha por (school_id, year) |
| 0012 | `vw_censo_servicos_terceirizados` | 1 linha por (school_id, year) |

Confirmação no banco:
```sql
SELECT viewname FROM pg_views WHERE viewname LIKE 'vw_censo_%' ORDER BY 1;
```

---

## 2. Endpoints e payloads de exemplo

### GET /v1/admin/analytics/infraestrutura/condicoes

```json
{
  "por_tipo_predio": [
    { "valor": "Próprio",       "escolas": 588, "percentual": 71.5 },
    { "valor": "Alugado",       "escolas": 94,  "percentual": 11.4 },
    { "valor": "Cedido",        "escolas": 86,  "percentual": 10.5 },
    { "valor": "Compartilhado", "escolas": 54,  "percentual": 6.6  }
  ],
  "por_situacao_estrutura": [
    { "valor": "Necessita de reforma parcial (melhoria pontual)", "escolas": 321, "percentual": 39.1 },
    { "valor": "Necessita de reforma geral",                      "escolas": 260, "percentual": 31.6 },
    { "valor": "Não necessita de reforma.",                       "escolas": 88,  "percentual": 10.7 },
    { "valor": "Foi reformada recentemente",                      "escolas": 72,  "percentual": 8.8  },
    { "valor": "Reforma em andamento",                            "escolas": 60,  "percentual": 7.3  },
    { "valor": "Está em reforma, porém a obra está parada",       "escolas": 21,  "percentual": 2.6  }
  ],
  "pct_com_muro_ou_cerca": 91,
  "pct_perimetro_fechado": 89.3,
  "top_ambientes": [
    { "ambiente": "Cozinha",                   "escolas": 775 },
    { "ambiente": "Secretaria",                "escolas": 765 },
    { "ambiente": "Sala dos Professores",      "escolas": 714 },
    { "ambiente": "Refeitório",                "escolas": 520 },
    { "ambiente": "Quadra Esportiva",          "escolas": 445 },
    { "ambiente": "SAEE",                      "escolas": 419 },
    { "ambiente": "Biblioteca",                "escolas": 384 },
    { "ambiente": "Laboratório de Informática","escolas": 337 },
    { "ambiente": "Sala de leitura",           "escolas": 270 },
    { "ambiente": "Laboratório de Ciências",   "escolas": 257 }
  ]
}
```

### GET /v1/admin/analytics/infraestrutura/seguranca

```json
{
  "pct_possui_guarita":       18.5,
  "pct_controle_portao":      100,
  "pct_iluminacao_externa":   100,
  "pct_possui_botao_panico":  7.4,
  "pct_cameras_funcionais":   49.1,
  "pct_plano_evacuacao":      13.9,
  "pct_politica_bullying":    95.1,
  "dist_cameras": [
    { "valor": "Não possui",              "escolas": 418, "percentual": 50.9 },
    { "valor": "Sim, parcialmente",       "escolas": 210, "percentual": 25.5 },
    { "valor": "Sim, funcionando plenamente", "escolas": 194, "percentual": 23.6 }
  ]
}
```

> `pct_controle_portao` e `pct_iluminacao_externa` são 100% porque todos os valores
> possíveis no formulário implicam presença (Manual / Fechadura / Eletrônica;
> Regular / Insuficiente / Adequada). Não existe opção "Não possui" nesses campos.

### GET /v1/admin/analytics/merenda/oferta

```json
{
  "dist_oferta_regular": [
    { "valor": "Sim",           "escolas": 648, "percentual": 78.8 },
    { "valor": "Sim, com falhas","escolas": 163, "percentual": 19.8 },
    { "valor": "Não",           "escolas": 11,  "percentual": 1.3  }
  ],
  "dist_qualidade": [
    { "valor": "Boa",     "escolas": 620, "percentual": 75.4 },
    { "valor": "Regular", "escolas": 192, "percentual": 23.4 },
    { "valor": "Ruim",    "escolas": 10,  "percentual": 1.2  }
  ],
  "pct_atende_necessidades": 70.8,
  "dist_condicoes_cozinha": [
    { "valor": "Boa",     "escolas": 383, "percentual": 46.6 },
    { "valor": "Regular", "escolas": 345, "percentual": 42.0 },
    { "valor": "Precária","escolas": 94,  "percentual": 11.4 }
  ],
  "pct_possui_refeitorio": 65.1
}
```

### GET /v1/admin/analytics/merenda/equipamentos

```json
{
  "freezers":    { "total": 1976, "media_por_escola": 2.40 },
  "geladeiras":  { "total": 968,  "media_por_escola": 1.18 },
  "fogoes":      { "total": 1001, "media_por_escola": 1.22 },
  "fornos":      { "total": 365,  "media_por_escola": 0.44 },
  "bebedouros":  { "total": 1304, "media_por_escola": 1.59 },
  "dist_estados": [
    { "equipamento": "freezers",   "estado": "bom — funcionando plenamente",       "escolas": 549 },
    { "equipamento": "freezers",   "estado": "regular — funciona, com limitações", "escolas": 197 },
    { "equipamento": "geladeiras", "estado": "bom — funcionando plenamente",       "escolas": 484 },
    "..."
  ]
}
```

### GET /v1/admin/analytics/merenda/recursos-humanos

```json
{
  "total_estatutaria":  447,
  "total_terceirizada": 1785,
  "total_temporaria":   167,
  "pct_com_supervisor": 40.3,
  "top_empresas": [
    { "empresa": "KAPA CAPITAL", "escolas": 316 },
    { "empresa": "J.R LIMPEZA",  "escolas": 300 },
    { "empresa": "AJ LOURENÃO",  "escolas": 46  }
  ]
}
```

### GET /v1/admin/analytics/servicos-terceirizados/visao-geral

```json
{
  "por_area": [
    { "area": "Merenda",         "escolas": 749, "percentual": 91.1 },
    { "area": "Serviços Gerais", "escolas": 698, "percentual": 84.9 },
    { "area": "Portaria",        "escolas": 659, "percentual": 80.2 }
  ],
  "por_quantidade_areas": [
    { "valor": "0", "escolas": 35,  "percentual": 4.3  },
    { "valor": "1", "escolas": 47,  "percentual": 5.7  },
    { "valor": "2", "escolas": 161, "percentual": 19.6 },
    { "valor": "3", "escolas": 579, "percentual": 70.4 }
  ]
}
```

### GET /v1/admin/analytics/servicos-terceirizados/servicos-gerais

```json
{
  "total_efetivo":          12267,
  "total_temporario":       360,
  "total_terceirizado":     2328,
  "media_total_por_escola": 18.19
}
```

### GET /v1/admin/analytics/servicos-terceirizados/portaria

```json
{
  "pct_com_agentes":          77.9,
  "media_agentes_por_escola": 3.03,
  "top_empresas": [
    { "empresa": "SAP - SERVICE ALIANCA PARA", "escolas": 560 },
    { "empresa": "Outra",                      "escolas": 32  },
    { "empresa": "DIAMOND",                    "escolas": 19  }
  ]
}
```

---

## 3. Top 5 ambientes mais comuns na rede

| # | Ambiente | Escolas |
|---|---|---|
| 1 | Cozinha | 775 |
| 2 | Secretaria | 765 |
| 3 | Sala dos Professores | 714 |
| 4 | Refeitório | 520 |
| 5 | Quadra Esportiva | 445 |

---

## 4. Sanity checks

```sql
-- Cardinalidade das views
SELECT 'vw_censo_ambientes'                  AS view, COUNT(*) FROM vw_censo_ambientes
UNION ALL
SELECT 'vw_censo_infraestrutura_seguranca',           COUNT(*) FROM vw_censo_infraestrutura_seguranca
UNION ALL
SELECT 'vw_censo_equipamentos_merenda',               COUNT(*) FROM vw_censo_equipamentos_merenda
UNION ALL
SELECT 'vw_censo_rh_merendeiras',                     COUNT(*) FROM vw_censo_rh_merendeiras
UNION ALL
SELECT 'vw_censo_rh_servicos_gerais',                 COUNT(*) FROM vw_censo_rh_servicos_gerais
UNION ALL
SELECT 'vw_censo_servicos_terceirizados',             COUNT(*) FROM vw_censo_servicos_terceirizados;

-- Total de escolas completed no ano corrente (deve bater com analytics/overview)
SELECT COUNT(DISTINCT school_id)
FROM vw_censo_base
WHERE status = 'completed' AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int;
```

---

## 5. Preservação de endpoints existentes

Confirmado que os seguintes endpoints continuam respondendo normalmente após o deploy desta frente:

- `GET /v1/locations` ✅
- `GET /v1/admin/sheet-metrics` ✅
- `GET /v1/admin/indicadores-metrics` ✅
- `POST /v1/admin/sync-sheets` ✅
- `GET /v1/admin/analytics/overview` ✅
- `GET /v1/admin/analytics/caracterizacao/perfil` ✅
- `GET /v1/admin/analytics/caracterizacao/dre` ✅

Nenhuma alteração em `web/`, `handlers.go`, `admin.go` ou no fluxo de submissão do formulário.
