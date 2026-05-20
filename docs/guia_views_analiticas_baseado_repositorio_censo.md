# Guia técnico — Views, Tabelas Analíticas e Serviços de Indicadores do Dashboard Próprio

**Projeto:** Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA  
**Repositório:** `lucasonline0/CENSO-Operacional-Escolas`  
**Objetivo:** orientar a criação da camada analítica que substituirá a dependência de Google Sheets/Looker Studio, usando como fonte oficial o banco PostgreSQL atualmente utilizado pela aplicação.

---

## 1. Premissa central

O novo dashboard próprio deve ser reconstruído a partir do **banco de dados do sistema**, e não a partir da planilha usada anteriormente como apoio ao Looker Studio.

A planilha deve ser tratada apenas como **referência histórica/metodológica**. Para a implementação com Claude, o repositório e o banco devem ser a fonte de verdade.

Fluxo-alvo:

```txt
Formulário Next.js
   ↓
API Go
   ↓
PostgreSQL / Railway
   ↓
Views SQL + tabelas analíticas + serviços de indicadores
   ↓
Endpoints do dashboard
   ↓
Dashboard próprio em Next.js / Vercel
```

---

## 2. Estado atual identificado no repositório

O projeto é um monorepo composto por:

```txt
api/      # backend Go
web/      # frontend Next.js
infra/    # configuração de ambiente e banco
```

### 2.1 Backend atual

O backend está em Go e usa:

- `database/sql`;
- driver PostgreSQL `pgx/v5`;
- roteador `go-chi/chi`;
- SQL manual, sem ORM;
- autenticação administrativa por JWT;
- integração com Google Sheets e Google Drive;
- endpoints públicos sob `/v1`;
- endpoints administrativos sob `/v1/admin`.

### 2.2 Banco atual

O banco é PostgreSQL, configurado por variáveis como:

```env
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
DATABASE_URL
```

O arquivo `infra/init.sql` define duas tabelas principais:

1. `schools`
2. `census_responses`

A estrutura atual é simples, mas suficiente para iniciar a camada analítica.

---

## 3. Tabelas atuais do banco

## 3.1 Tabela `schools`

A tabela `schools` armazena a identificação da escola e dados fixos básicos.

### Estrutura atual

```sql
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    nome_escola VARCHAR(255),
    codigo_inep VARCHAR(20) UNIQUE,
    municipio VARCHAR(100),
    dre VARCHAR(100),
    zona VARCHAR(50),
    endereco TEXT,

    cnpj VARCHAR(30),
    telefone VARCHAR(50),
    email VARCHAR(150),
    cep VARCHAR(20),
    nome_diretor VARCHAR(150),
    matricula_diretor VARCHAR(50),
    contato_diretor VARCHAR(50),

    turnos TEXT,
    etapas_ofertadas TEXT,
    modalidades_ofertadas TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Papel no dashboard

A tabela `schools` deve ser usada para:

- identificação da escola;
- filtros globais;
- agrupamentos por DRE;
- agrupamentos por município;
- agrupamentos por zona;
- ligação com as respostas do censo;
- código INEP como identificador institucional.

### Observação importante

Os campos `turnos`, `etapas_ofertadas` e `modalidades_ofertadas` estão como `TEXT`, mas representam arrays serializados em JSON/texto. Para o dashboard, será necessário tratá-los como listas.

---

## 3.2 Tabela `census_responses`

A tabela `census_responses` armazena as respostas variáveis do censo.

### Estrutura atual

```sql
CREATE TABLE IF NOT EXISTS census_responses (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL,
    year INT NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_school
      FOREIGN KEY(school_id)
      REFERENCES schools(id)
      ON DELETE CASCADE,

    sheet_synced_at TIMESTAMP DEFAULT NULL,

    CONSTRAINT unique_school_year
      UNIQUE (school_id, year)
);
```

### Papel no dashboard

A tabela `census_responses` deve ser usada para:

- todas as respostas operacionais e estruturais do censo;
- indicadores do dashboard;
- status de preenchimento;
- ano de referência;
- data de atualização;
- reconstrução dos gráficos do painel.

### Observação importante

A coluna `data JSONB` guarda a maior parte das respostas do formulário. Logo, a primeira fase da camada analítica será criar views que “abram” esse JSONB em colunas tipadas.

---

## 4. Problema técnico a resolver

O dashboard atual no Looker Studio usava uma base tabular já tratada. No banco real, porém, os dados estão majoritariamente em:

```txt
schools + census_responses.data JSONB
```

Portanto, o desafio não é apenas criar gráficos. O desafio é criar uma **camada analítica intermediária** entre o banco transacional e o dashboard.

Essa camada deve:

- extrair campos do JSONB;
- tipar números, percentuais e categorias;
- normalizar listas multivaloradas;
- calcular flags;
- calcular faixas;
- calcular métricas agregadas;
- entregar dados prontos para os gráficos.

---

## 5. Estratégia recomendada

A estratégia recomendada é criar três níveis de camada analítica.

```txt
Nível 1 — View base expandida
Nível 2 — Views normalizadas e indicadores por escola
Nível 3 — Endpoints/serviços de agregação para gráficos
```

---

# PARTE I — VIEWS BASE

## 6. View `vw_censo_escolas_base`

### Objetivo

Criar uma visão única, uma linha por escola/ano, combinando `schools` e `census_responses`.

Essa view será a fundação de praticamente todo o dashboard.

### Fonte

- `schools`
- `census_responses`

### Granularidade

Uma linha por:

```txt
school_id + year
```

### SQL conceitual

```sql
CREATE OR REPLACE VIEW vw_censo_escolas_base AS
SELECT
    s.id AS school_id,
    s.codigo_inep,
    s.nome_escola,
    s.dre,
    s.municipio,
    s.zona,
    s.endereco,
    s.cnpj,
    s.telefone,
    s.cep,
    s.nome_diretor,
    s.matricula_diretor,
    s.contato_diretor,
    s.turnos,
    s.etapas_ofertadas,
    s.modalidades_ofertadas,

    cr.id AS census_id,
    cr.year,
    cr.status,
    cr.created_at,
    cr.updated_at,
    cr.sheet_synced_at,
    cr.data,

    NULLIF(cr.data->>'qtd_salas_aula', '')::numeric AS qtd_salas_aula,
    NULLIF(cr.data->>'total_alunos', '')::numeric AS total_alunos,
    NULLIF(cr.data->>'alunos_pcd', '')::numeric AS alunos_pcd,
    NULLIF(cr.data->>'alunos_rural', '')::numeric AS alunos_rural,
    NULLIF(cr.data->>'alunos_urbana', '')::numeric AS alunos_urbana,

    NULLIF(cr.data->>'turmas_manha', '')::numeric AS turmas_manha,
    NULLIF(cr.data->>'turmas_tarde', '')::numeric AS turmas_tarde,
    NULLIF(cr.data->>'turmas_noite', '')::numeric AS turmas_noite,
    NULLIF(cr.data->>'turmas_integral', '')::numeric AS turmas_integral,
    NULLIF(cr.data->>'salas_climatizadas', '')::numeric AS salas_climatizadas,

    cr.data->>'tipo_predio' AS tipo_predio,
    cr.data->>'possui_anexos' AS possui_anexos,
    cr.data->>'situacao_estrutura' AS situacao_estrutura,
    cr.data->>'muro_cerca' AS muro_cerca,
    cr.data->>'perimetro_fechado' AS perimetro_fechado,
    cr.data->>'rede_eletrica_atende' AS rede_eletrica_atende,
    cr.data->>'estrutura_climatizacao' AS estrutura_climatizacao,
    cr.data->>'suporta_novos_equipamentos' AS suporta_novos_equipamentos,
    cr.data->>'cameras_funcionamento' AS cameras_funcionamento,
    cr.data->>'cameras_cobrem' AS cameras_cobrem
FROM schools s
LEFT JOIN census_responses cr
    ON cr.school_id = s.id;
```

### Observação

Os nomes exatos das chaves JSONB devem ser confirmados por inspeção dos schemas do frontend e de registros reais em `census_responses.data`.

A Claude deve gerar uma etapa de diagnóstico para listar todas as chaves JSONB existentes:

```sql
SELECT DISTINCT jsonb_object_keys(data)
FROM census_responses
WHERE data IS NOT NULL;
```

---

## 7. View `vw_censo_escolas_enriquecida`

### Objetivo

Adicionar campos derivados usados em vários gráficos.

### Fonte

- `vw_censo_escolas_base`

### Campos derivados recomendados

- `qtd_turmas_total`
- `qtd_salas_nao_climatizadas`
- `situacao_climatizacao_salas`
- `porte_escola`
- `porte_escola_cod`
- `qtd_alunos`
- `qtd_professores`
- `qtd_merendeiras`
- `qtd_servicos_gerais`
- `qtd_portaria`
- `regiao_integracao`, quando houver fonte institucional disponível.

### SQL conceitual

```sql
CREATE OR REPLACE VIEW vw_censo_escolas_enriquecida AS
SELECT
    b.*,

    COALESCE(b.turmas_manha, 0)
  + COALESCE(b.turmas_tarde, 0)
  + COALESCE(b.turmas_noite, 0)
  + COALESCE(b.turmas_integral, 0) AS qtd_turmas_total,

    GREATEST(
      COALESCE(b.qtd_salas_aula, 0) - COALESCE(b.salas_climatizadas, 0),
      0
    ) AS qtd_salas_nao_climatizadas,

    CASE
      WHEN b.qtd_salas_aula IS NULL OR b.qtd_salas_aula = 0 THEN 'Não informado'
      WHEN COALESCE(b.salas_climatizadas, 0) = 0 THEN 'Não climatizadas'
      WHEN b.salas_climatizadas >= b.qtd_salas_aula THEN 'Totalmente climatizadas'
      ELSE 'Parcialmente climatizadas'
    END AS situacao_climatizacao_salas,

    CASE
      WHEN b.total_alunos IS NULL THEN 'Não informado'
      WHEN b.total_alunos <= 50 THEN '0–50'
      WHEN b.total_alunos <= 150 THEN '50–150'
      WHEN b.total_alunos <= 300 THEN '150–300'
      WHEN b.total_alunos <= 500 THEN '300–500'
      WHEN b.total_alunos <= 1000 THEN '500–1000'
      ELSE '1000+'
    END AS porte_escola,

    CASE
      WHEN b.total_alunos IS NULL THEN 0
      WHEN b.total_alunos <= 50 THEN 1
      WHEN b.total_alunos <= 150 THEN 2
      WHEN b.total_alunos <= 300 THEN 3
      WHEN b.total_alunos <= 500 THEN 4
      WHEN b.total_alunos <= 1000 THEN 5
      ELSE 6
    END AS porte_escola_cod

FROM vw_censo_escolas_base b;
```

---

# PARTE II — VIEWS NORMALIZADAS

## 8. View `vw_censo_turnos`

### Objetivo

Normalizar os turnos da escola para recriar gráficos como:

- Distribuição por turnos;
- Média de turnos por porte;
- filtros futuros por turno.

### Fonte

- `schools.turnos`
- ou `census_responses.data`, caso o campo esteja no JSONB.

### Granularidade

Uma linha por:

```txt
school_id + turno
```

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
turno
```

### Cuidados

Se `turnos` não estiver em JSON válido, a Claude deve criar uma função auxiliar para parse seguro ou ajustar o armazenamento futuro para `JSONB`.

---

## 9. View `vw_censo_etapas`

### Objetivo

Normalizar as etapas ofertadas.

### Gráficos atendidos

- Etapas Ofertadas;
- cruzamentos futuros por etapa;
- IDEB por etapa, quando integrado.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
etapa
```

---

## 10. View `vw_censo_modalidades`

### Objetivo

Normalizar modalidades ofertadas.

### Gráficos atendidos

- Modalidades Ofertadas;
- quantidade de modalidades;
- caracterização da rede.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
modalidade
```

---

## 11. View `vw_censo_ambientes`

### Objetivo

Normalizar a lista de ambientes marcados na seção de infraestrutura.

### Fonte

Campo multivalorado do JSONB:

```txt
data->'ambientes'
```

### Gráficos atendidos

- Presença de Ambientes;
- Ambientes existentes na escola;
- Quantidade de ambientes;
- Quantidade de ambientes essenciais;
- Cobertura de ambientes essenciais.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
ambiente
is_essencial
```

---

## 12. View `vw_censo_equipamentos_tecnologia`

### Objetivo

Transformar campos de quantidade de tecnologia em linhas.

### Gráficos atendidos

- Quantidade mediana de equipamentos por escola;
- distribuição do parque tecnológico;
- quantidade por tipo de equipamento.

### Campos da view

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
tipo_equipamento
quantidade
```

### Tipos iniciais

- Desktop administrativo
- Desktop alunos
- Notebook
- Chromebook

---

## 13. View `vw_censo_equipamentos_merenda`

### Objetivo

Transformar equipamentos da merenda em linhas com quantidade e estado de conservação.

### Gráficos atendidos

- Presença de equipamentos por tipo;
- quantidade média de equipamentos por escola;
- faixas de quantidade;
- estado de conservação;
- criticidade por equipamento.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
tipo_equipamento
quantidade
estado_conservacao
faixa_quantidade
estado_conservacao_ajustado
```

---

## 14. View `vw_censo_rh_merendeiras`

### Objetivo

Normalizar a quantidade de merendeiras por vínculo.

### Gráficos atendidos

- Total de merendeiras por vínculo;
- quantidade média de merendeiras por escola;
- déficit de merendeiras;
- atendimento da necessidade.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
tipo_vinculo
quantidade
```

---

## 15. View `vw_censo_rh_servicos_gerais`

### Objetivo

Normalizar a quantidade de serviços gerais por vínculo.

### Gráficos atendidos

- Quem executa os serviços gerais na rede;
- média de serviços gerais por escola;
- déficit de serviços gerais;
- quadro atual suficiente.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
tipo_vinculo
quantidade
```

---

## 16. View `vw_censo_direcao_escolar`

### Objetivo

Normalizar os cargos de gestão escolar.

### Gráficos atendidos

- Direção escolar;
- secretário escolar;
- equipe de gestão completa;
- composição da gestão escolar.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
cargo
possui
ordem
```

### Cargos

- Direção Escolar
- Vice-Diretor Pedagógico
- Vice-Diretor Administrativo
- Secretário Escolar

---

## 17. View `vw_censo_coordenacao_area`

### Objetivo

Normalizar as coordenações por área do conhecimento.

### Gráficos atendidos

- Presença de coordenação por área;
- cobertura pedagógica da escola.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
area
possui
ordem
```

### Áreas

- Matemática
- Linguagens
- Humanas
- Natureza

---

## 18. View `vw_censo_quadro_pessoal`

### Objetivo

Normalizar professores e servidores administrativos.

### Gráficos atendidos

- Composição do quadro de pessoal;
- dependência de professores temporários;
- média de docentes por porte;
- quantitativo de readaptados.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
tipo_pessoal
quantidade
```

### Tipos

- Professores efetivos
- Professores temporários
- Servidores administrativos

---

## 19. View `vw_censo_servicos_terceirizados`

### Objetivo

Criar uma visão comparativa entre Serviços Gerais e Portaria.

### Gráficos atendidos

- percentual de terceirização;
- satisfação por serviço;
- existência de supervisor por serviço.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
servico
atende_necessidade
terceirizado
ha_supervisor
empresa
deficit
quantidade_atual
```

---

## 20. View `vw_censo_reprovacao_etapa`

### Objetivo

Normalizar taxas de reprovação por etapa.

### Gráficos atendidos

- taxa de reprovação por etapa;
- faixas de reprovação;
- cruzamentos com DRE/município/porte.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
etapa
taxa_reprovacao
faixa_reprovacao
```

---

## 21. View `vw_censo_ideb_etapa`

### Objetivo

Normalizar IDEB por etapa.

### Gráficos atendidos

- IDEB médio por etapa;
- distribuição por faixa de IDEB;
- ranking de DREs por IDEB;
- IDEB médio por porte.

### Campos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year
etapa
ideb
faixa_ideb
```

### Observação

A aba IDEB estava desabilitada no painel atual, mas deve ficar prevista na arquitetura.

---

# PARTE III — VIEW DE INDICADORES POR ESCOLA

## 22. View `vw_censo_indicadores_escola`

### Objetivo

Concentrar flags, faixas e indicadores por escola.

Essa view substitui a ideia de uma aba intermediária de indicadores, mas agora diretamente no banco.

### Fonte

- `vw_censo_escolas_enriquecida`
- views normalizadas auxiliares
- cálculos SQL

### Granularidade

Uma linha por:

```txt
school_id + year
```

### Campos mínimos

```txt
school_id
codigo_inep
nome_escola
dre
municipio
zona
year

total_alunos
porte_escola
porte_escola_cod

qtd_turnos
qtd_etapas
qtd_modalidades
qtd_ambientes
qtd_ambientes_essenciais

faixa_ambientes_essenciais
situacao_climatizacao_salas
qtd_salas_climatizadas
qtd_salas_nao_climatizadas

qtd_merendeiras
qtd_servicos_gerais
qtd_portaria
qtd_professores
qtd_coordenadores

equipe_gestao_completa
faixa_dependencia_temporarios
faixa_qtd_coord_pedagogicos
nivel_cobertura_pedagogica

perc_beneficiarios
faixa_beneficiarios
faixa_abandono
flag_risco_fluxo
flag_risco_ideb

flag_infra_critica
flag_merenda_critica
flag_pessoal_critico
flag_tecnologia_critica
flag_gestao_critica
flag_servicos_terceirizados_critico

nivel_risco
prioridade
status_semaforo
```

---

# PARTE IV — SERVIÇOS DE AGREGAÇÃO PARA GRÁFICOS

## 23. Padrão de filtros globais

Todos os endpoints do dashboard devem aceitar os mesmos filtros:

```txt
year
regiao_integracao
dre
municipio
school_id
codigo_inep
zona
porte_escola
status
```

Como ainda não há `regiao_integracao` no banco atual, ela deve ser tratada como evolução futura ou criada por integração com fonte institucional de municípios.

### Helper recomendado no backend

Criar um serviço/helper que monte filtros parametrizados.

Exemplo conceitual em Go:

```go
type DashboardFilters struct {
    Year      int
    Dre       string
    Municipio string
    Zona      string
    SchoolID  int
    Porte     string
    Status    string
}
```

Evitar interpolação direta de strings em SQL. Usar parâmetros.

---

## 24. Contratos de resposta para gráficos

### KPI

```json
{
  "title": "Total de escolas",
  "value": 1027,
  "format": "number"
}
```

### Distribuição categórica

```json
{
  "title": "Distribuição de escolas por zona",
  "type": "donut",
  "data": [
    { "label": "Urbana", "value": 758, "percentage": 73.8 },
    { "label": "Rural", "value": 210, "percentage": 20.4 }
  ]
}
```

### Série por categoria

```json
{
  "title": "Média de alunos por porte",
  "type": "bar",
  "data": [
    { "label": "0–50", "value": 35 },
    { "label": "50–150", "value": 112 }
  ]
}
```

### Barra empilhada 100%

```json
{
  "title": "Composição da gestão escolar",
  "type": "stacked_100",
  "data": [
    { "label": "Direção Escolar", "Sim": 97.7, "Não": 2.3 },
    { "label": "Vice-Diretor Pedagógico", "Sim": 70.0, "Não": 30.0 }
  ]
}
```

---

# PARTE V — RECONSTRUÇÃO DOS GRÁFICOS POR PÁGINA

## 25. Caracterização da Rede

### 25.1 Dimensão e Perfil da Rede

Views necessárias:

- `vw_censo_escolas_enriquecida`
- `vw_censo_indicadores_escola`

Gráficos:

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Total de escolas | `vw_censo_escolas_enriquecida` | `COUNT(DISTINCT school_id)` |
| Total de alunos | `vw_censo_escolas_enriquecida` | `SUM(total_alunos)` |
| Média de alunos por escola | `vw_censo_escolas_enriquecida` | `AVG(total_alunos)` |
| Matrículas por porte | `vw_censo_indicadores_escola` | `SUM(total_alunos) GROUP BY porte_escola` |
| Escolas por porte | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY porte_escola` |
| Escolas por zona | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY zona` |

---

### 25.2 Organização da Oferta e Funcionamento

Views necessárias:

- `vw_censo_etapas`
- `vw_censo_modalidades`
- `vw_censo_turnos`
- `vw_censo_indicadores_escola`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Etapas ofertadas | `vw_censo_etapas` | `COUNT(DISTINCT school_id) GROUP BY etapa` |
| Modalidades ofertadas | `vw_censo_modalidades` | `COUNT(DISTINCT school_id) GROUP BY modalidade` |
| Distribuição por turnos | `vw_censo_turnos` | `COUNT(DISTINCT school_id) GROUP BY turno` |
| Média de turnos por porte | `vw_censo_indicadores_escola` | `AVG(qtd_turnos) GROUP BY porte_escola` |

---

### 25.3 Infraestrutura Educacional

Views necessárias:

- `vw_censo_ambientes`
- `vw_censo_indicadores_escola`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Presença de ambientes | `vw_censo_ambientes` | `COUNT(DISTINCT school_id) GROUP BY ambiente` |
| Média de ambientes essenciais por porte | `vw_censo_indicadores_escola` | `AVG(qtd_ambientes_essenciais) GROUP BY porte_escola` |
| Cobertura de ambientes essenciais | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY faixa_ambientes_essenciais` |

---

## 26. Pessoal e Gestão Escolar

Views principais:

- `vw_censo_direcao_escolar`
- `vw_censo_coordenacao_area`
- `vw_censo_quadro_pessoal`
- `vw_censo_indicadores_escola`

| Página / gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Possui Direção Escolar | `vw_censo_direcao_escolar` | filtro cargo; distribuição `possui` |
| Possui Secretário Escolar | `vw_censo_direcao_escolar` | filtro cargo; distribuição `possui` |
| Equipe de gestão completa | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY equipe_gestao_completa` |
| Composição da gestão | `vw_censo_direcao_escolar` | `% Sim/Não GROUP BY cargo` |
| Possui coordenação pedagógica | `vw_censo_indicadores_escola` | distribuição Sim/Não |
| Faixa de coordenadores | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY faixa_qtd_coord_pedagogicos` |
| Cobertura pedagógica | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY nivel_cobertura_pedagogica` |
| Coordenação por área | `vw_censo_coordenacao_area` | `% Sim/Não GROUP BY area` |
| Média de coordenadores por porte | `vw_censo_indicadores_escola` | `AVG(qtd_coordenadores) GROUP BY porte_escola` |
| Composição do quadro | `vw_censo_quadro_pessoal` | `SUM(quantidade) GROUP BY tipo_pessoal` |
| Dependência temporários | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY faixa_dependencia_temporarios` |
| Média de docentes por porte | `vw_censo_indicadores_escola` | `AVG(qtd_professores) GROUP BY porte_escola` |

---

## 27. Infraestrutura e Segurança

Views principais:

- `vw_censo_escolas_enriquecida`
- `vw_censo_ambientes`
- `vw_censo_indicadores_escola`

| Página / gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Situação estrutural | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY situacao_estrutura` |
| Cobertura de ambientes essenciais | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY faixa_ambientes_essenciais` |
| Ambientes existentes | `vw_censo_ambientes` | `COUNT(DISTINCT school_id) GROUP BY ambiente` |
| Rede elétrica atende demanda | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY rede_eletrica_atende` |
| Climatização das salas | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY situacao_climatizacao_salas` |
| Estrutura permite climatizar | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY estrutura_climatizacao` |
| Muro ou cerca | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY muro_cerca` |
| Perímetro fechado | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY perimetro_fechado` |
| Câmeras | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY cameras_funcionamento` |

---

## 28. Merenda Escolar

Views principais:

- `vw_censo_escolas_enriquecida`
- `vw_censo_equipamentos_merenda`
- `vw_censo_rh_merendeiras`
- `vw_censo_indicadores_escola`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Merenda ofertada regularmente | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY merenda_regular` |
| Qualidade da merenda | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY merenda_qualidade` |
| Merenda atende necessidades | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY merenda_atende` |
| Condições da cozinha | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY condicoes_cozinha` |
| Possui refeitório | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY possui_refeitorio` |
| Tamanho da cozinha | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY tamanho_cozinha` |
| Presença de equipamentos | `vw_censo_equipamentos_merenda` | `% escolas com quantidade > 0 GROUP BY tipo_equipamento` |
| Média de equipamentos | `vw_censo_equipamentos_merenda` | `AVG(quantidade) GROUP BY tipo_equipamento` |
| Estado de conservação | `vw_censo_equipamentos_merenda` | `COUNT(*) GROUP BY tipo_equipamento, estado_conservacao` |
| Merendeiras por vínculo | `vw_censo_rh_merendeiras` | `SUM(quantidade) GROUP BY tipo_vinculo` |
| Média de merendeiras | `vw_censo_indicadores_escola` | `AVG(qtd_merendeiras)` |

---

## 29. Perfil dos Alunos e Resultados

Views principais:

- `vw_censo_indicadores_escola`
- `vw_censo_reprovacao_etapa`
- `vw_censo_ideb_etapa`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Faixa de beneficiários | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY faixa_beneficiarios` |
| Taxa de abandono | `vw_censo_indicadores_escola` | `COUNT(*) GROUP BY faixa_abandono` |
| Top 10 DREs abandono | `vw_censo_indicadores_escola` | `AVG(taxa_abandono) GROUP BY dre ORDER BY DESC LIMIT 10` |
| Escolas com risco de fluxo | `vw_censo_indicadores_escola` | `COUNT(*) WHERE flag_risco_fluxo = true` |
| IDEB médio por etapa | `vw_censo_ideb_etapa` | `AVG(ideb) GROUP BY etapa` |
| IDEB por faixa | `vw_censo_ideb_etapa` | `COUNT(*) GROUP BY faixa_ideb` |

---

## 30. Gestão Financeira e Governança

Views principais:

- `vw_censo_escolas_enriquecida`
- `vw_censo_indicadores_escola`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Regularizada CEE | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY regularizada_cee` |
| Conselho constituído | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY conselho_escolar` |
| Conselho ativo | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY conselho_ativo` |
| Grêmio estudantil | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY gremio_estudantil` |
| Plano evacuação | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY plano_evacuacao` |
| Política bullying | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY politica_bullying` |
| Recebeu PRODEP | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY recebeu_prodep` |
| PRODEP executado | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY prodep_executado`, filtrando quem recebeu |
| Pendência PRODEP | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY prodep_pendencias`, filtrando quem recebeu |
| Recursos federais | `vw_censo_escolas_enriquecida` | análogo ao PRODEP |
| Reuniões comunidade | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY reunioes_comunidade` |

---

## 31. Tecnologia e Equipamentos

Views principais:

- `vw_censo_escolas_enriquecida`
- `vw_censo_equipamentos_tecnologia`
- `vw_censo_indicadores_escola`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| Mediana de equipamentos | `vw_censo_equipamentos_tecnologia` | `PERCENTILE_CONT(0.5) GROUP BY tipo_equipamento` |
| Provedor de internet | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY provedor_internet` |
| Parque tecnológico | `vw_censo_equipamentos_tecnologia` | `SUM(quantidade) GROUP BY tipo_equipamento` |
| Disponibilidade internet | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY internet_disponivel` |
| Qualidade internet | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY qualidade_internet` |
| Equipamentos atendem demanda | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY computadores_atendem_demanda` |
| Possui projetor | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY possui_projetor` |
| Possui lousa digital | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY possui_lousa_digital` |
| Média projetores | `vw_censo_escolas_enriquecida` | `AVG(qtd_projetores)` |
| Computadores inoperantes | `vw_censo_escolas_enriquecida` | `COUNT(*) WHERE qtd_computadores_inoperantes > 0` |

---

## 32. Serviços Terceirizados

Views principais:

- `vw_censo_servicos_terceirizados`
- `vw_censo_rh_servicos_gerais`
- `vw_censo_escolas_enriquecida`

| Gráfico | Fonte recomendada | Cálculo |
|---|---|---|
| % terceirização | `vw_censo_servicos_terceirizados` | `% Sim/Não GROUP BY servico` |
| Serviços satisfatórios | `vw_censo_servicos_terceirizados` | `% Sim/Não GROUP BY servico` |
| Supervisor por empresa | `vw_censo_servicos_terceirizados` | `% Sim/Não GROUP BY servico` |
| Avaliação supervisão | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY avaliacao_supervisao` |
| Empresas serviços gerais | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY empresa_servicos_gerais` |
| Quadro serviços gerais suficiente | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY servicos_gerais_atende` |
| Déficit serviços gerais | `vw_censo_escolas_enriquecida` | `SUM(deficit_servicos_gerais)` |
| Média serviços gerais | `vw_censo_escolas_enriquecida` | `AVG(qtd_servicos_gerais)` |
| Executor serviços gerais | `vw_censo_rh_servicos_gerais` | `SUM(quantidade) GROUP BY tipo_vinculo` |
| Guarita | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY possui_guarita` |
| Botão de pânico | `vw_censo_escolas_enriquecida` | `COUNT(*) GROUP BY possui_botao_panico` |
| Déficit portaria | `vw_censo_escolas_enriquecida` | `SUM(deficit_portaria)` |
| Média agentes portaria | `vw_censo_escolas_enriquecida` | `AVG(qtd_agentes_portaria)` |

---

# PARTE VI — ENDPOINTS RECOMENDADOS

## 33. Endpoints do dashboard

A API atual já possui endpoints administrativos simples, mas o dashboard próprio deve ganhar endpoints analíticos específicos.

Sugestão:

```txt
GET /v1/dashboard/filters
GET /v1/dashboard/overview
GET /v1/dashboard/caracterizacao/dimensao-perfil
GET /v1/dashboard/caracterizacao/oferta-funcionamento
GET /v1/dashboard/caracterizacao/infraestrutura-educacional
GET /v1/dashboard/caracterizacao/estatistica-descritiva

GET /v1/dashboard/pessoal-gestao/estrutura
GET /v1/dashboard/pessoal-gestao/coordenacao
GET /v1/dashboard/pessoal-gestao/quadro-pessoal

GET /v1/dashboard/infraestrutura/condicoes
GET /v1/dashboard/infraestrutura/energia-climatizacao
GET /v1/dashboard/infraestrutura/seguranca

GET /v1/dashboard/merenda/oferta
GET /v1/dashboard/merenda/estrutura
GET /v1/dashboard/merenda/equipamentos
GET /v1/dashboard/merenda/condicoes-sanitarias
GET /v1/dashboard/merenda/recursos-humanos

GET /v1/dashboard/alunos/permanencia
GET /v1/dashboard/alunos/ideb

GET /v1/dashboard/financeiro/governanca
GET /v1/dashboard/financeiro/execucao
GET /v1/dashboard/financeiro/participacao

GET /v1/dashboard/tecnologia/infraestrutura
GET /v1/dashboard/tecnologia/uso-pedagogico

GET /v1/dashboard/servicos-terceirizados/visao-geral
GET /v1/dashboard/servicos-terceirizados/servicos-gerais
GET /v1/dashboard/servicos-terceirizados/portaria

GET /v1/dashboard/escolas/{id}
GET /v1/dashboard/alertas
```

---

# PARTE VII — ORDEM DE IMPLEMENTAÇÃO

## 34. Incremento 1 — Diagnóstico real do JSONB

Antes de criar todas as views, a Claude deve gerar uma rotina ou comando SQL para descobrir as chaves reais em `census_responses.data`.

Entregáveis:

- documento `docs/dashboard/jsonb-field-inventory.md`;
- query para listar chaves;
- amostra anonimizada de payload;
- mapa preliminar `campo_formulario → chave_jsonb`.

Queries úteis:

```sql
SELECT DISTINCT jsonb_object_keys(data) AS key
FROM census_responses
WHERE data IS NOT NULL
ORDER BY key;
```

```sql
SELECT data
FROM census_responses
WHERE data IS NOT NULL
LIMIT 5;
```

---

## 35. Incremento 2 — View base

Criar:

```txt
vw_censo_escolas_base
vw_censo_escolas_enriquecida
```

Validar:

- total de escolas;
- total de censos;
- total de completed;
- total de alunos;
- distribuição por DRE;
- distribuição por zona.

---

## 36. Incremento 3 — Views de caracterização

Criar:

```txt
vw_censo_turnos
vw_censo_etapas
vw_censo_modalidades
vw_censo_ambientes
vw_censo_indicadores_escola
```

Recriar páginas:

- Dimensão e Perfil da Rede;
- Organização da Oferta e Funcionamento;
- Infraestrutura Educacional.

---

## 37. Incremento 4 — Infraestrutura e Segurança

Completar campos de:

- situação estrutural;
- energia;
- climatização;
- segurança física;
- câmeras;
- muro/cerca.

Recriar páginas:

- Condições Estruturais e Ambientes;
- Energia, Climatização e Capacidade Elétrica;
- Segurança Física e Patrimonial.

---

## 38. Incremento 5 — Pessoal e Gestão

Criar:

```txt
vw_censo_direcao_escolar
vw_censo_coordenacao_area
vw_censo_quadro_pessoal
```

Recriar páginas:

- Estrutura de Gestão Escolar;
- Coordenação Pedagógica;
- Quadro de Pessoal.

---

## 39. Incremento 6 — Merenda

Criar:

```txt
vw_censo_equipamentos_merenda
vw_censo_rh_merendeiras
```

Recriar páginas:

- Oferta e Adequação da Merenda;
- Estrutura Física;
- Equipamentos;
- Condições Sanitárias;
- Recursos Humanos.

---

## 40. Incremento 7 — Tecnologia

Criar:

```txt
vw_censo_equipamentos_tecnologia
```

Recriar páginas:

- Infraestrutura Digital;
- Uso Pedagógico.

---

## 41. Incremento 8 — Serviços Terceirizados

Criar:

```txt
vw_censo_rh_servicos_gerais
vw_censo_servicos_terceirizados
```

Recriar páginas:

- Visão Geral;
- Serviços Gerais;
- Portaria.

---

## 42. Incremento 9 — Alunos, Resultados e Governança

Criar:

```txt
vw_censo_reprovacao_etapa
vw_censo_ideb_etapa
```

Completar:

- perfil socioeducacional;
- abandono;
- reprovação;
- IDEB;
- governança;
- execução financeira;
- participação comunitária.

---

## 43. Incremento 10 — Alertas e ficha da escola

Criar:

```txt
vw_censo_alertas_escolas
vw_censo_ficha_escola
```

Implementar:

- página de alertas;
- ficha individual da escola;
- exportação em PDF/CSV.

---

# PARTE VIII — INSTRUÇÃO PARA CLAUDE

## 44. Prompt recomendado

```txt
Estamos reconstruindo o dashboard do Censo Operacional e Estrutural da SEDUC/PA em uma aplicação própria, sem depender da planilha Google nem do Looker Studio.

Use o repositório lucasonline0/CENSO-Operacional-Escolas como fonte principal.

Antes de implementar qualquer gráfico, analise:

- api/;
- web/;
- infra/init.sql;
- api/internal/models/models.go;
- api/cmd/api/handlers.go;
- api/cmd/api/admin.go;
- api/cmd/api/main.go;
- schemas do frontend em web/src/schemas/;
- componentes de formulário em web/src/components/forms/.

A fonte de dados oficial atual é o PostgreSQL, com as tabelas:

- schools;
- census_responses.

A maior parte das respostas do formulário está em census_responses.data JSONB.

A tarefa inicial é criar documentação e SQL para a camada analítica do dashboard próprio, não implementar o frontend ainda.

Primeiro, gere um inventário real das chaves existentes em census_responses.data e relacione essas chaves com as etapas do formulário.

Depois, proponha e implemente migrations SQL para criar as primeiras views:

- vw_censo_escolas_base;
- vw_censo_escolas_enriquecida;
- vw_censo_turnos;
- vw_censo_etapas;
- vw_censo_modalidades;
- vw_censo_ambientes;
- vw_censo_indicadores_escola.

As views devem alimentar inicialmente os gráficos das páginas:

1. Dimensão e Perfil da Rede;
2. Organização da Oferta e Funcionamento;
3. Infraestrutura Educacional;
4. Condições Estruturais e Ambientes.

Não altere o fluxo atual do formulário.
Não remova a sincronização com Google Sheets nesta etapa.
Não exponha variáveis sensíveis.
Não substitua endpoints existentes sem necessidade.
Use SQL parametrizado nos endpoints.
Documente cada view criada, sua finalidade, campos expostos e gráficos atendidos.
```

---

# PARTE IX — CONCLUSÃO

A reconstrução do dashboard deve partir do banco real do projeto:

```txt
schools
census_responses
census_responses.data JSONB
```

A camada de planilha deixa de ser dependência operacional. O novo dashboard deve consumir:

1. views SQL;
2. tabelas analíticas, se necessário;
3. endpoints específicos de agregação;
4. serviços de indicadores versionados.

A principal decisão técnica é não tentar recriar a planilha dentro do frontend. O correto é criar uma camada analítica no PostgreSQL/API, de forma que cada gráfico consuma dados já tratados, filtráveis e auditáveis.
