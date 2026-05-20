# Inventário do JSONB — Censo Operacional

> **Status:** Fase 0 do [roadmap-dashboard-proprio.md](../roadmap-dashboard-proprio.md).
> **Tipo:** somente documentação. Nenhuma view, endpoint ou alteração de código deve ser feita nesta fase.
> **Documento companheiro:** [checklist-dashboard-proprio.md](../checklist-dashboard-proprio.md).

---

## 1. Objetivo

Mapear, a partir do código-fonte (schemas Zod + componentes de formulário), todos os campos que o formulário do Censo grava em `census_responses.data` (JSONB) e em `schools`, e prepará-los para serem consumidos pela camada analítica. O inventário é a base de:

- definição da `vw_censo_base` (Fase 1);
- montagem das views temáticas e da `vw_censo_indicadores_escola` (Fases 2–6);
- validação de paridade contra a planilha (`sheet-metrics`, `indicadores-metrics`).

Este documento é **derivado do contrato de gravação** (schemas Zod + payloads do front). A validação final exige inspeção real do banco — ver seção 8.

---

## 2. Fonte de verdade atual

Hoje a fonte oficial dos campos de gravação está em:

- **Schemas Zod** em [`web/src/schemas/steps/*.ts`](../../web/src/schemas/steps/) — definem nome técnico e tipo esperado.
- **Componentes de formulário** em [`web/src/components/forms/*.tsx`](../../web/src/components/forms/) — definem o payload efetivamente enviado (com nullificações condicionais e poucos `delete`).
- **`POST /v1/census`** em [`api/cmd/api/handlers.go:123`](../../api/cmd/api/handlers.go) — recebe `{ school_id, year, status, data }` e faz **merge** com o JSONB existente (`oldMap ⨯ newMap`). Importante: **chaves antigas não são removidas pelo merge**; um campo que deixou de ser enviado permanece no JSONB.
- **`POST /v1/schools`** em [`api/cmd/api/handlers.go:67`](../../api/cmd/api/handlers.go) — recebe identificação (Step 1) e grava em `schools` (não no JSONB).
- **Tabela `schools`** e **`census_responses`** em [`infra/init.sql`](../../infra/init.sql).

> O merge realizado no handler é importante para o inventário: o JSONB de uma escola que preencheu o formulário em vários passos contém a união dos campos de todos os steps enviados, e pode conter resíduos de versões antigas do formulário (ex.: `transformadores`, hoje removido por `delete payload.transformadores` em `general-data-form.tsx:241`).

---

## 3. Tabelas envolvidas

### 3.1 `schools` — identificação (Step 1)

| Coluna | Tipo SQL | Origem (schema) |
|---|---|---|
| `id` | `SERIAL PK` | gerado pelo backend |
| `nome_escola` | `VARCHAR(255)` | `nome_escola` |
| `codigo_inep` | `VARCHAR(20) UNIQUE` | `codigo_inep` |
| `municipio` | `VARCHAR(100)` | `municipio` |
| `dre` | `VARCHAR(100)` | `dre` |
| `zona` | `VARCHAR(50)` | `zona` (`Urbana`\|`Rural`\|`Ribeirinha`) |
| `endereco` | `TEXT` | `endereco` |
| `cnpj` | `VARCHAR(30)` | `cnpj` (opcional) |
| `telefone` | `VARCHAR(50)` | `telefone_institucional` (renomeado no Go) |
| `email` | `VARCHAR(150)` | (não está no schema atual de identificação; gravado pelo backend se enviado) |
| `cep` | `VARCHAR(20)` | `cep` |
| `nome_diretor` | `VARCHAR(150)` | `nome_diretor` (opcional) |
| `matricula_diretor` | `VARCHAR(50)` | `matricula_diretor` (opcional) |
| `contato_diretor` | `VARCHAR(50)` | `contato_diretor` (opcional) |
| `turnos` | `TEXT` (lista serializada) | `turnos: string[]` (gravado como JSON serializado) |
| `etapas_ofertadas` | `TEXT` | (ver Atenção abaixo) |
| `modalidades_ofertadas` | `TEXT` | (ver Atenção abaixo) |
| `created_at` | `TIMESTAMP` | gerado pelo banco |

> **Atenção — duplicidade `etapas_ofertadas`/`modalidades_ofertadas`.** Esses campos também aparecem no Step 2 (`general-data.ts`) e portanto **também são gravados em `census_responses.data`** com o mesmo nome. A view analítica deve resolver a precedência (sugestão: usar o que está no JSONB do ano corrente para análises por censo e o de `schools` apenas como fallback).

### 3.2 `census_responses` — variáveis (Steps 2–11)

| Coluna | Tipo SQL | Observação |
|---|---|---|
| `id` | `SERIAL PK` | |
| `school_id` | `INT FK schools(id)` | |
| `year` | `INT` | (`UNIQUE (school_id, year)`) |
| `status` | `VARCHAR(50)` | `draft` \| `completed` |
| `data` | `JSONB` | **alvo central deste documento** |
| `sheet_synced_at` | `TIMESTAMP` | null = pendente de sync |
| `created_at` / `updated_at` | `TIMESTAMP` | |

---

## 4. Estratégia de validação

1. **Inventário estático** (esta seção 5): derivado dos schemas Zod e componentes — fonte é o código.
2. **Inventário dinâmico** (seção 8): queries SQL a serem executadas manualmente contra uma cópia do banco (homologação ou dump anonimizado) para confirmar quais chaves realmente estão presentes, em que percentual de registros e com que tipos efetivos.
3. **Reconciliação**: cruzar (1) e (2) e marcar discrepâncias.
4. **Decisão por campo**: cada campo recebe um destino — `vw_censo_base` (Fase 1), view temática futura (Fases 2–6), indicador derivado (Fase 5) ou ignorado.

Convenções nas tabelas da seção 5:

- **Origem**: componente `.tsx` que envia o campo.
- **Destino esperado**:
  - 🔹 **`vw_censo_base`** — campo simples, presente em quase todas as escolas, alto valor analítico transversal.
  - 🟦 **View temática** — campo específico de uma dimensão (merenda, tecnologia, etc.).
  - 🟧 **Indicador derivado** — não é campo bruto; será computado em `vw_censo_indicadores_escola` ou na enriquecida.
  - 🟨 **Lista multivalorada** — `array` que precisa de view normalizada própria.
  - ⚪ **Auxiliar / não analítico** — campos de controle (nomes, descrições livres, declarações).
- **Uso analítico**: nota curta indicando como o campo entra no dashboard. "—" significa baixo valor analítico imediato.

---

## 5. Campos por etapa do formulário

### 5.1 Dados Gerais e Infraestrutura

Schema: [`general-data.ts`](../../web/src/schemas/steps/general-data.ts) · Componente: [`general-data-form.tsx`](../../web/src/components/forms/general-data-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `tipo_predio` | string (`Próprio`/`Alugado`/`Compartilhado`/`Cedido`) | RadioInput | distribuição categórica | 🔹 base |
| `possui_anexos` | enum (`Sim`/`Não`) | RadioInput | distribuição | 🔹 base |
| `qtd_anexos` | number (opcional, nullificado se `possui_anexos != "Sim"`) | NumberInput | média/condicional | 🟦 infraestrutura |
| `tipo_predio_anexo` | string (opcional) | RadioInput | distribuição condicional | 🟦 infraestrutura |
| `etapas_ofertadas` | string[] (≥1) | CheckboxList | multivalorado | 🟨 `vw_censo_etapas` |
| `modalidades_ofertadas` | string[] (≥1) | CheckboxList | multivalorado | 🟨 `vw_censo_modalidades` |
| `qtd_salas_aula` | number (≥1) | NumberInput | total/média | 🔹 base |
| `turmas_manha` | number (opc.) | NumberInput | distribuição por turno | 🔹 base |
| `turmas_tarde` | number (opc.) | NumberInput | idem | 🔹 base |
| `turmas_noite` | number (opc.) | NumberInput | idem | 🔹 base |
| `turmas_integral` | number (opc.) | NumberInput | idem | 🔹 base |
| `total_alunos` | number (≥1) | NumberInput | **KPI principal** | 🔹 base |
| `alunos_pcd` | number (≥0) | NumberInput | KPI inclusão | 🔹 base |
| `alunos_rural` | number (≥0) | NumberInput | distribuição | 🔹 base |
| `alunos_urbana` | number (≥0) | NumberInput | distribuição | 🔹 base |
| `muro_cerca` | string (`Sim, muro`/`Sim, cerca`/`Não possui`) | RadioInput | segurança | 🟦 infra/segurança |
| `perimetro_fechado` | enum (opc.; nullificado se `muro_cerca = "Não possui"`) | RadioInput | segurança | 🟦 infra/segurança |
| `situacao_estrutura` | string (6 opções) | SelectInput | distribuição | 🔹 base |
| `data_ultima_reforma` | string (opc.) | DateInput | temporal | ⚪ auxiliar |
| `ambientes` | string[] (opc.) | CheckboxList | multivalorado | 🟨 `vw_censo_ambientes` |
| `quadra_coberta` | enum (`Sim`/`Não`, condicional) | RadioInput | infraestrutura | 🟦 infraestrutura |
| `qtd_quadras` | number (condicional) | NumberInput | infraestrutura | 🟦 infraestrutura |
| `banda_fanfarra` | enum (`Sim`/`Não`) | RadioInput | distribuição | 🟦 infraestrutura |
| `banheiros_alunos` | number (≥0) | NumberInput | média/escola | 🟦 infra/sanitário |
| `banheiros_prof` | number (≥0) | NumberInput | idem | 🟦 infra/sanitário |
| `banheiros_chuveiro` | number (≥0) | NumberInput | idem | 🟦 infra/sanitário |
| `banheiros_vasos_funcionais` | string (`Todos`/`Alguns`/`Nenhum`) | RadioInput | distribuição | 🟦 infra/sanitário |
| `salas_climatizadas` | number (≥0) | NumberInput | base p/ `situacao_climatizacao_salas` | 🔹 base + 🟧 derivado |
| `energia` | string | SelectInput | distribuição | 🟦 infra/energia |
| `rede_eletrica_atende` | enum (`Sim`/`Parcialmente`/`Não`) | RadioInput | distribuição | 🔹 base |
| `problemas_eletricos` | string[] (≥1) | CheckboxList | multivalorado | 🟨 view futura `vw_censo_problemas_eletricos` |
| `estrutura_climatizacao` | enum (4 opções) | SelectInput | distribuição | 🔹 base |
| `suporta_novos_equipamentos` | enum (`Sim`/`Parcialmente`/`Não`) | RadioInput | distribuição | 🔹 base |
| `cameras_funcionamento` | string (3 opções, inclui "Não possui") | SelectInput | segurança | 🔹 base |
| `cameras_cobrem` | string (opc.; nullificado se "Não possui") | RadioInput | segurança | 🔹 base |

> Resíduo histórico observado: `delete payload.transformadores` em `general-data-form.tsx:241`. Provável chave morta em escolas antigas — confirmar via SQL na seção 8.

### 5.2 Merenda Escolar

Schema: [`merenda.ts`](../../web/src/schemas/steps/merenda.ts) · Componente: [`merenda-form.tsx`](../../web/src/components/forms/merenda-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `condicoes_cozinha` | string | SelectInput | distribuição | 🟦 merenda |
| `tamanho_cozinha` | string | SelectInput | distribuição | 🟦 merenda |
| `oferta_regular` | string | SelectInput | KPI merenda | 🟦 merenda |
| `qualidade_merenda` | string | SelectInput | KPI merenda | 🟦 merenda |
| `atende_necessidades` | enum (`Sim`/`Parcialmente`/`Não`) | RadioInput | KPI | 🟦 merenda |
| `possui_refeitorio` | enum | RadioInput | distribuição | 🟦 merenda |
| `refeitorio_adequado` | enum (opc.) | RadioInput | distribuição | 🟦 merenda |
| `possui_balanca` | enum | RadioInput | distribuição | 🟦 merenda |
| `qtd_freezers` | number | NumberInput | parque equipamentos | 🟦 `vw_censo_equipamentos_merenda` |
| `estado_freezers` | string (opc.) | SelectInput | criticidade | 🟦 idem |
| `qtd_geladeiras` | number | NumberInput | idem | 🟦 idem |
| `estado_geladeiras` | string (opc.) | SelectInput | idem | 🟦 idem |
| `qtd_fogoes` | number | NumberInput | idem | 🟦 idem |
| `estado_fogoes` | string (opc.) | SelectInput | idem | 🟦 idem |
| `qtd_fornos` | number | NumberInput | idem | 🟦 idem |
| `estado_fornos` | string (opc.) | SelectInput | idem | 🟦 idem |
| `qtd_bebedouros` | number | NumberInput | idem | 🟦 idem |
| `estado_bebedouros` | string (opc.) | SelectInput | idem | 🟦 idem |
| `bancadas_inox` | enum | RadioInput | distribuição | 🟦 merenda |
| `sistema_exaustao` | enum | RadioInput | distribuição | 🟦 merenda |
| `despensa_exclusiva` | enum | RadioInput | distribuição | 🟦 merenda |
| `deposito_conserva` | enum (`Sim`/`Parcialmente`/`Não`) | RadioInput | distribuição | 🟦 merenda |
| `estoque_epi_extintor` | string (opc.) | SelectInput | distribuição | 🟦 merenda |
| `manutencao_extintores` | string (opc.) | SelectInput | distribuição | 🟦 merenda |
| `qtd_merendeiras_estatutaria` | number | NumberInput | RH | 🟦 `vw_censo_rh_merendeiras` |
| `qtd_merendeiras_terceirizada` | number | NumberInput | RH | 🟦 idem |
| `qtd_merendeiras_temporaria` | number | NumberInput | RH | 🟦 idem |
| `qtd_atende_necessidade_merenda` | enum (`Sim`/`Não`, opc.) | RadioInput | déficit | 🟦 merenda |
| `quantitativo_necessario_merenda` | number (opc.) | NumberInput | déficit | 🟦 merenda |
| `empresa_terceirizada_merenda` | string (opc.) | TextInput | tag empresa | ⚪ auxiliar |
| `possui_supervisor_merenda` | enum (opc.) | RadioInput | distribuição | 🟦 serviços terceirizados |
| `nome_supervisor_merenda` | string (opc.) | TextInput | livre | ⚪ auxiliar |
| `contato_supervisor_merenda` | string (opc.) | TextInput | livre | ⚪ auxiliar |

### 5.3 Serviços Gerais

Schema: [`servicos-gerais.ts`](../../web/src/schemas/steps/servicos-gerais.ts) · Componente: [`servicos-gerais-form.tsx`](../../web/src/components/forms/servicos-gerais-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `qtd_servicos_gerais_efetivo` | number | NumberInput | composição RH | 🟦 `vw_censo_rh_servicos_gerais` |
| `qtd_servicos_gerais_temporario` | number | NumberInput | idem | 🟦 idem |
| `qtd_servicos_gerais_terceirizado` | number | NumberInput | idem | 🟦 idem |
| `qtd_atende_necessidade_sg` | enum (opc.) | RadioInput | déficit | 🟦 serviços terceirizados |
| `quantitativo_necessario_sg` | number (opc.) | NumberInput | déficit | 🟦 idem |
| `empresa_terceirizada_sg` | string (opc.) | TextInput | tag empresa | ⚪ auxiliar |
| `possui_supervisor_sg` | enum (opc.) | RadioInput | distribuição | 🟦 idem |
| `nome_supervisor_sg` | string (opc.) | TextInput | livre | ⚪ auxiliar |
| `contato_supervisor_sg` | string (opc.) | TextInput | livre | ⚪ auxiliar |

### 5.4 Portaria

Schema: [`portaria.ts`](../../web/src/schemas/steps/portaria.ts) · Componente: [`portaria-form.tsx`](../../web/src/components/forms/portaria-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `possui_guarita` | enum | RadioInput | distribuição | 🟦 portaria/segurança |
| `controle_portao` | string | SelectInput | distribuição | 🟦 portaria/segurança |
| `iluminacao_externa` | string | SelectInput | distribuição | 🟦 portaria/segurança |
| `possui_botao_panico` | enum | RadioInput | distribuição | 🟦 portaria/segurança |
| `qtd_agentes_portaria` | number | NumberInput | composição RH | 🟦 portaria |
| `qtd_atende_necessidade_portaria` | enum (opc.) | RadioInput | déficit | 🟦 portaria |
| `quantitativo_necessario_portaria` | number (opc.) | NumberInput | déficit | 🟦 portaria |
| `empresa_terceirizada_portaria` | string (opc.) | TextInput | tag empresa | ⚪ auxiliar |
| `possui_supervisor_portaria` | enum (opc.) | RadioInput | distribuição | 🟦 portaria |
| `nome_supervisor_portaria` | string (opc.) | TextInput | livre | ⚪ auxiliar |
| `contato_supervisor_portaria` | string (opc.) | TextInput | livre | ⚪ auxiliar |

### 5.5 Tecnologia

Schema: [`tecnologia.ts`](../../web/src/schemas/steps/tecnologia.ts) · Componente: [`tecnologia-form.tsx`](../../web/src/components/forms/tecnologia-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `internet_disponivel` | enum | RadioInput | distribuição | 🟦 tecnologia |
| `provedor_internet` | string (opc.) | SelectInput | distribuição | 🟦 tecnologia |
| `qualidade_internet` | string (opc.) | SelectInput | distribuição | 🟦 tecnologia |
| `qtd_desktop_adm` | number | NumberInput | parque tecnológico | 🟦 `vw_censo_equipamentos_tecnologia` |
| `qtd_desktop_alunos` | number | NumberInput | idem | 🟦 idem |
| `qtd_notebooks` | number | NumberInput | idem | 🟦 idem |
| `qtd_chromebooks` | number | NumberInput | idem | 🟦 idem |
| `computadores_atendem` | enum (opc.) | RadioInput | distribuição | 🟦 tecnologia |
| `qtd_computadores_inoperantes` | number | NumberInput | criticidade | 🟦 tecnologia |
| `possui_projetor` | enum | RadioInput | distribuição | 🟦 tecnologia |
| `qtd_projetores` | number (opc.) | NumberInput | parque | 🟦 tecnologia |
| `possui_lousa_digital` | enum | RadioInput | distribuição | 🟦 tecnologia |

### 5.6 Servidores

Schema: [`servidores.ts`](../../web/src/schemas/steps/servidores.ts) · Componente: [`servidores-form.tsx`](../../web/src/components/forms/servidores-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `possui_direcao` | enum | RadioInput | gestão | 🟦 `vw_censo_direcao_escolar` |
| `possui_vice_pedagogico` | enum | RadioInput | gestão | 🟦 idem |
| `possui_vice_administrativo` | enum | RadioInput | gestão | 🟦 idem |
| `possui_secretario` | enum | RadioInput | gestão | 🟦 idem |
| `possui_coord_pedagogico` | enum | RadioInput | cobertura pedagógica | 🟦 pessoal-gestão |
| `qtd_coord_pedagogico` | number (opc.) | NumberInput | faixa de coordenadores | 🟦 pessoal-gestão |
| `possui_coord_area_matematica` | enum | RadioInput | cobertura por área | 🟦 `vw_censo_coordenacao_area` |
| `possui_coord_area_linguagem` | enum | RadioInput | idem | 🟦 idem |
| `possui_coord_area_humanas` | enum | RadioInput | idem | 🟦 idem |
| `possui_coord_area_natureza` | enum | RadioInput | idem | 🟦 idem |
| `qtd_professores_efetivos` | number | NumberInput | quadro pessoal | 🟦 `vw_censo_quadro_pessoal` |
| `qtd_professores_temporarios` | number | NumberInput | dependência temporários | 🟦 idem + 🟧 derivado |
| `qtd_servidores_administrativos` | number | NumberInput | quadro pessoal | 🟦 idem |
| `possui_professor_readaptado` | enum | RadioInput | distribuição | 🟦 pessoal-gestão |
| `qtd_professor_readaptado` | number (opc.) | NumberInput | distribuição | 🟦 pessoal-gestão |

### 5.7 Perfil dos Alunos

Schema: [`alunos.ts`](../../web/src/schemas/steps/alunos.ts) · Componente: [`alunos-form.tsx`](../../web/src/components/forms/alunos-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `total_beneficiarios` | number | NumberInput | faixa beneficiários | 🟧 indicador derivado |
| `taxa_abandono` | number (decimal com vírgula) | TextInput→float | faixa abandono / risco fluxo | 🟧 indicador derivado |
| `taxa_reprovacao_fund1` | number | TextInput→float | faixa reprovação | 🟦 `vw_censo_reprovacao_etapa` |
| `taxa_reprovacao_fund2` | number | TextInput→float | idem | 🟦 idem |
| `taxa_reprovacao_medio` | number | TextInput→float | idem | 🟦 idem |
| `ideb_anos_iniciais` | number (opc.) | TextInput→float | IDEB | 🟦 `vw_censo_ideb_etapa` |
| `ideb_anos_finais` | number (opc.) | TextInput→float | idem | 🟦 idem |
| `ideb_ensino_medio` | number (opc.) | TextInput→float | idem | 🟦 idem |

> **Atenção tipos.** Os campos `taxa_*` e `ideb_*` aceitam vírgula no front e devem ser convertidos para `numeric` antes de cair no JSONB. O cast SQL precisa tolerar tanto `"3.4"` quanto `"3,4"` — validar na seção 8.

### 5.8 Gestão

Schema: [`gestao.ts`](../../web/src/schemas/steps/gestao.ts) · Componente: [`gestao-form.tsx`](../../web/src/components/forms/gestao-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `regularizada_cee` | enum (`Sim`/`Não`) | RadioInput | governança | 🟦 governança |
| `conselho_escolar` | enum | RadioInput | governança | 🟦 governança |
| `conselho_ativo` | enum (`Sim`/`Parcialmente`/`Não`, opc.) | RadioInput | governança | 🟦 governança |
| `recursos_prodep` | enum (`Sim`/`Não`/`Não sabe informar`) | RadioInput | financeiro | 🟦 governança |
| `valor_prodep` | number (opc.) | NumberInput | financeiro | 🟦 governança |
| `execucao_prodep` | enum (opc.) | RadioInput | financeiro | 🟦 governança |
| `pendencias_prodep` | enum (opc.) | RadioInput | financeiro | 🟦 governança |
| `recursos_federais` | enum | RadioInput | financeiro | 🟦 governança |
| `valor_federais` | number (opc.) | NumberInput | financeiro | 🟦 governança |
| `execucao_federais` | enum (opc.) | RadioInput | financeiro | 🟦 governança |
| `pendencias_federais` | enum (opc.) | RadioInput | financeiro | 🟦 governança |
| `gremio_estudantil` | enum | RadioInput | governança | 🟦 governança |
| `reunioes_comunidade` | enum (4 opções) | RadioInput | governança | 🟦 governança |
| `plano_evacuacao` | enum | RadioInput | segurança | 🟦 governança |
| `politica_bullying` | enum (3 opções) | RadioInput | governança | 🟦 governança |

### 5.9 Avaliação

Schema: [`avaliacao.ts`](../../web/src/schemas/steps/avaliacao.ts) · Componente: [`avaliacao-form.tsx`](../../web/src/components/forms/avaliacao-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `avaliacao_merendeiras` | enum (`Ruim`\|`Regular`\|`Bom`\|`Excelente`\|`Não se aplica`) | RadioInput | índice de satisfação | 🟦 serviços terceirizados |
| `avaliacao_portaria` | enum | RadioInput | idem | 🟦 idem |
| `avaliacao_limpeza` | enum | RadioInput | idem | 🟦 idem |
| `avaliacao_comunicacao` | enum | RadioInput | idem | 🟦 idem |
| `avaliacao_supervisao` | enum | RadioInput | idem | 🟦 idem |

### 5.10 Observações

Schema: [`observacoes.ts`](../../web/src/schemas/steps/observacoes.ts) · Componente: [`observacoes-form.tsx`](../../web/src/components/forms/observacoes-form.tsx)

| Campo | Tipo esperado | Origem | Uso analítico | Destino recomendado |
|---|---|---|---|---|
| `prioridade_1` | string (livre) | TextInput | texto livre | ⚪ auxiliar |
| `prioridade_2` | string | TextInput | texto livre | ⚪ auxiliar |
| `prioridade_3` | string | TextInput | texto livre | ⚪ auxiliar |
| `demanda_urgente` | enum (`Sim`/`Não`) | RadioInput | flag textual | ⚪ auxiliar |
| `descricao_urgencia` | string (opc.) | TextArea | texto livre | ⚪ auxiliar |
| `sugestao_melhoria` | enum | RadioInput | flag textual | ⚪ auxiliar |
| `descricao_sugestao` | string (opc.) | TextArea | texto livre | ⚪ auxiliar |
| `nome_responsavel` | string | TextInput | rastreabilidade | ⚪ auxiliar |
| `cargo_funcao` | string | TextInput | rastreabilidade | ⚪ auxiliar |
| `matricula_funcional` | string | TextInput | rastreabilidade | ⚪ auxiliar |
| `declaracao_verdadeira` | boolean (true obrigatório) | Checkbox | termo de aceite | ⚪ auxiliar |

---

## 6. Campos prioritários para a Fase 1

> **Escopo da Fase 1**: criar `vw_censo_base` + endpoint `GET /v1/admin/analytics/overview` + cards principais do `/admin`.

Tabela mínima de campos necessários para a Fase 1 — todos têm contraparte direta nos cards atuais alimentados por `sheet-metrics`:

### 6.1 De `schools` (já são colunas — sem cast)

- `id` (PK)
- `codigo_inep`
- `nome_escola`
- `dre`
- `municipio`
- `zona`

### 6.2 De `census_responses`

- `id` (`census_id`)
- `school_id`
- `year`
- `status` (filtro `status = 'completed'` para KPIs)
- `created_at`, `updated_at`, `sheet_synced_at` (operacional)

### 6.3 De `census_responses.data` (campos JSONB que entram em `vw_censo_base` na Fase 1)

| Campo | Cast SQL recomendado | Card / KPI alimentado |
|---|---|---|
| `total_alunos` | `NULLIF(data->>'total_alunos','')::numeric` | Total de alunos, média por escola |
| `alunos_pcd` | `NULLIF(data->>'alunos_pcd','')::numeric` | Alunos PcD |
| `alunos_rural` | `NULLIF(data->>'alunos_rural','')::numeric` | distribuição por residência |
| `alunos_urbana` | `NULLIF(data->>'alunos_urbana','')::numeric` | distribuição por residência |
| `qtd_salas_aula` | `NULLIF(data->>'qtd_salas_aula','')::numeric` | tabela DRE × salas |
| `salas_climatizadas` | `NULLIF(data->>'salas_climatizadas','')::numeric` | base p/ futura `situacao_climatizacao_salas` |
| `turmas_manha` | `NULLIF(data->>'turmas_manha','')::numeric` | base p/ `qtd_turmas_total` |
| `turmas_tarde` | idem | idem |
| `turmas_noite` | idem | idem |
| `turmas_integral` | idem | idem |
| `tipo_predio` | `NULLIF(data->>'tipo_predio','')` | distribuição |
| `situacao_estrutura` | `NULLIF(data->>'situacao_estrutura','')` | distribuição |
| `muro_cerca` | `NULLIF(data->>'muro_cerca','')` | segurança |
| `perimetro_fechado` | `NULLIF(data->>'perimetro_fechado','')` | segurança |
| `rede_eletrica_atende` | `NULLIF(data->>'rede_eletrica_atende','')` | distribuição |
| `cameras_funcionamento` | `NULLIF(data->>'cameras_funcionamento','')` | segurança |
| `cameras_cobrem` | `NULLIF(data->>'cameras_cobrem','')` | segurança |

Esses 17 campos do JSONB + as colunas de `schools` e `census_responses` são suficientes para:
- KPIs `Total de Escolas`, `Total de Alunos`, `Média de Alunos por Escola`, `Alunos PcD`;
- distribuição por zona (vinda direto de `schools.zona`);
- a tabela "Detalhamento por DRE" do admin (`escolas`, `alunos`, `media`, `salas`).

### 6.4 Não entram na Fase 1

- Listas multivaloradas (`etapas_ofertadas`, `modalidades_ofertadas`, `ambientes`, `problemas_eletricos`) — exigem views normalizadas (Fase 4).
- `taxa_*` e `ideb_*` — exigem decisão sobre vírgula vs ponto (Fase 3).
- Qualquer campo de merenda, tecnologia, gestão, RH — Fases 5–6.

---

## 7. Campos para views futuras

Resumo do destino dos campos não-base — referência para o roadmap das Fases 2–6:

| View futura | Fase prevista | Campos JSONB envolvidos |
|---|---|---|
| `vw_censo_enriquecida` (derivada) | 2 | `salas_climatizadas` + `qtd_salas_aula` → `qtd_salas_nao_climatizadas`, `situacao_climatizacao_salas`; `total_alunos` → `porte_escola`; soma `turmas_*` → `qtd_turmas_total` |
| `vw_censo_etapas` | 4 | `etapas_ofertadas` (array) |
| `vw_censo_modalidades` | 4 | `modalidades_ofertadas` (array) |
| `vw_censo_turnos` | 4 | `schools.turnos` (lista serializada em `TEXT`) |
| `vw_censo_ambientes` | 4 | `ambientes` (array) |
| `vw_censo_problemas_eletricos` (opcional) | 4/5 | `problemas_eletricos` (array) |
| `vw_censo_indicadores_escola` (mínima) | 3 | `total_beneficiarios`, `taxa_abandono` → `faixa_*`, `flag_risco_fluxo` |
| `vw_censo_indicadores_escola` (completa) | 5 | acima + flags de criticidade (infra, merenda, pessoal, tecnologia, gestão, serviços) |
| `vw_censo_direcao_escolar` | 6 | `possui_direcao`, `possui_vice_pedagogico`, `possui_vice_administrativo`, `possui_secretario` |
| `vw_censo_coordenacao_area` | 6 | `possui_coord_area_*` |
| `vw_censo_quadro_pessoal` | 6 | `qtd_professores_*`, `qtd_servidores_administrativos`, `qtd_professor_readaptado` |
| `vw_censo_equipamentos_merenda` | 6 | `qtd_*` + `estado_*` para freezers/geladeiras/fogões/fornos/bebedouros |
| `vw_censo_rh_merendeiras` | 6 | `qtd_merendeiras_estatutaria/terceirizada/temporaria` |
| `vw_censo_rh_servicos_gerais` | 6 | `qtd_servicos_gerais_efetivo/temporario/terceirizado` |
| `vw_censo_servicos_terceirizados` | 6 | `empresa_terceirizada_*`, `possui_supervisor_*`, `qtd_atende_necessidade_*`, `quantitativo_necessario_*` |
| `vw_censo_equipamentos_tecnologia` | 6 | `qtd_desktop_adm/alunos`, `qtd_notebooks`, `qtd_chromebooks`, `qtd_computadores_inoperantes`, `qtd_projetores` |
| `vw_censo_reprovacao_etapa` | 6 | `taxa_reprovacao_fund1/fund2/medio` |
| `vw_censo_ideb_etapa` | 6 | `ideb_anos_iniciais/finais`, `ideb_ensino_medio` |

---

## 8. Queries SQL de validação manual

> **Não rodar em produção.** Usar contra cópia em homologação ou dump anonimizado. Salvar os resultados como anexos deste documento ao concluir.

### 8.1 Universo dos dados

```sql
-- Volumes por tabela
SELECT
  (SELECT COUNT(*) FROM schools)                                            AS total_schools,
  (SELECT COUNT(*) FROM census_responses)                                   AS total_census,
  (SELECT COUNT(*) FROM census_responses WHERE status = 'completed')        AS completed,
  (SELECT COUNT(*) FROM census_responses WHERE status = 'draft')            AS draft,
  (SELECT COUNT(*) FROM census_responses WHERE data IS NULL)                AS data_null,
  (SELECT COUNT(*) FROM census_responses WHERE sheet_synced_at IS NULL
                                            AND status = 'completed')       AS pending_sync;
```

### 8.2 Inventário de chaves do JSONB

```sql
-- Todas as chaves observadas
SELECT DISTINCT jsonb_object_keys(data) AS key
FROM census_responses
WHERE data IS NOT NULL
ORDER BY 1;
```

```sql
-- Frequência de cada chave (em quantos % dos registros aparece)
WITH base AS (
  SELECT id, data FROM census_responses WHERE data IS NOT NULL
), keys AS (
  SELECT b.id, jsonb_object_keys(b.data) AS key FROM base b
)
SELECT
  k.key,
  COUNT(DISTINCT k.id)                                  AS registros_com_a_chave,
  ROUND(100.0 * COUNT(DISTINCT k.id) / NULLIF((SELECT COUNT(*) FROM base), 0), 1) AS pct
FROM keys k
GROUP BY k.key
ORDER BY registros_com_a_chave DESC;
```

```sql
-- Frequência da chave SOMENTE em status 'completed' (mais relevante para análise)
WITH base AS (
  SELECT id, data FROM census_responses WHERE data IS NOT NULL AND status = 'completed'
), keys AS (
  SELECT b.id, jsonb_object_keys(b.data) AS key FROM base b
)
SELECT
  k.key,
  COUNT(DISTINCT k.id) AS registros_completed_com_a_chave,
  ROUND(100.0 * COUNT(DISTINCT k.id) / NULLIF((SELECT COUNT(*) FROM base), 0), 1) AS pct
FROM keys k
GROUP BY k.key
ORDER BY registros_completed_com_a_chave DESC;
```

### 8.3 Amostras de payloads

```sql
SELECT id, school_id, year, updated_at, jsonb_pretty(data) AS data
FROM census_responses
WHERE status = 'completed'
ORDER BY updated_at DESC
LIMIT 5;
```

```sql
SELECT id, school_id, year, updated_at, jsonb_pretty(data) AS data
FROM census_responses
WHERE status = 'draft'
ORDER BY updated_at DESC
LIMIT 5;
```

### 8.4 Saneamento dos campos numéricos da Fase 1

Verificar se algum valor não-numérico está armazenado nos campos que entrarão na `vw_censo_base`:

```sql
-- Substituir 'total_alunos' por cada um dos campos da seção 6.3
SELECT id, school_id, data->>'total_alunos' AS valor
FROM census_responses
WHERE data ? 'total_alunos'
  AND data->>'total_alunos' IS NOT NULL
  AND data->>'total_alunos' <> ''
  AND data->>'total_alunos' !~ '^-?[0-9]+(\.[0-9]+)?$'
ORDER BY id
LIMIT 50;
```

Repetir para: `alunos_pcd`, `alunos_rural`, `alunos_urbana`, `qtd_salas_aula`, `salas_climatizadas`, `turmas_manha`, `turmas_tarde`, `turmas_noite`, `turmas_integral`.

### 8.5 Saneamento dos campos com vírgula (`taxa_*`, `ideb_*`)

```sql
-- Detecta uso de vírgula como separador decimal
SELECT id, school_id, data->>'taxa_abandono' AS valor
FROM census_responses
WHERE data->>'taxa_abandono' LIKE '%,%'
LIMIT 50;
```

Repetir para `taxa_reprovacao_fund1`, `taxa_reprovacao_fund2`, `taxa_reprovacao_medio`, `ideb_anos_iniciais`, `ideb_anos_finais`, `ideb_ensino_medio`.

### 8.6 Verificação dos campos categóricos (enums)

Verificar valores divergentes do enum esperado para os campos categóricos que vão para a `vw_censo_base`:

```sql
SELECT data->>'rede_eletrica_atende' AS valor, COUNT(*) AS qtd
FROM census_responses
WHERE data ? 'rede_eletrica_atende'
GROUP BY 1
ORDER BY qtd DESC;
```

Repetir para `tipo_predio`, `situacao_estrutura`, `muro_cerca`, `perimetro_fechado`, `cameras_funcionamento`, `cameras_cobrem`, `estrutura_climatizacao`, `suporta_novos_equipamentos`.

### 8.7 Verificação das listas serializadas em `schools`

```sql
SELECT id, codigo_inep, turnos
FROM schools
ORDER BY id
LIMIT 20;
```

```sql
SELECT id, codigo_inep, etapas_ofertadas, modalidades_ofertadas
FROM schools
ORDER BY id
LIMIT 20;
```

Detectar registros que não são JSON válido:

```sql
SELECT id, codigo_inep, turnos
FROM schools
WHERE turnos IS NOT NULL
  AND turnos <> ''
  AND (
    LEFT(BTRIM(turnos), 1) <> '['
    OR RIGHT(BTRIM(turnos), 1) <> ']'
  );
```

### 8.8 Resíduos históricos suspeitos

```sql
-- Chaves não previstas em nenhum schema atual
SELECT DISTINCT k AS chave_orfa
FROM census_responses, jsonb_object_keys(data) k
WHERE data IS NOT NULL
  AND k NOT IN (
    -- Lista derivada da seção 5 (preencher com cópia dos campos válidos atuais)
    'tipo_predio','possui_anexos','qtd_anexos','tipo_predio_anexo',
    'etapas_ofertadas','modalidades_ofertadas','qtd_salas_aula',
    'turmas_manha','turmas_tarde','turmas_noite','turmas_integral',
    'total_alunos','alunos_pcd','alunos_rural','alunos_urbana',
    'muro_cerca','perimetro_fechado','situacao_estrutura','data_ultima_reforma',
    'ambientes','quadra_coberta','qtd_quadras','banda_fanfarra',
    'banheiros_alunos','banheiros_prof','banheiros_chuveiro','banheiros_vasos_funcionais',
    'salas_climatizadas','energia','rede_eletrica_atende','problemas_eletricos',
    'estrutura_climatizacao','suporta_novos_equipamentos',
    'cameras_funcionamento','cameras_cobrem',
    -- merenda, sg, portaria, tec, servidores, alunos, gestão, avaliação, observações
    'condicoes_cozinha','tamanho_cozinha','oferta_regular','qualidade_merenda',
    'atende_necessidades','possui_refeitorio','refeitorio_adequado','possui_balanca',
    'qtd_freezers','estado_freezers','qtd_geladeiras','estado_geladeiras',
    'qtd_fogoes','estado_fogoes','qtd_fornos','estado_fornos',
    'qtd_bebedouros','estado_bebedouros','bancadas_inox','sistema_exaustao',
    'despensa_exclusiva','deposito_conserva','estoque_epi_extintor','manutencao_extintores',
    'qtd_merendeiras_estatutaria','qtd_merendeiras_terceirizada','qtd_merendeiras_temporaria',
    'qtd_atende_necessidade_merenda','quantitativo_necessario_merenda',
    'empresa_terceirizada_merenda','possui_supervisor_merenda',
    'nome_supervisor_merenda','contato_supervisor_merenda',
    'qtd_servicos_gerais_efetivo','qtd_servicos_gerais_temporario','qtd_servicos_gerais_terceirizado',
    'qtd_atende_necessidade_sg','quantitativo_necessario_sg',
    'empresa_terceirizada_sg','possui_supervisor_sg','nome_supervisor_sg','contato_supervisor_sg',
    'possui_guarita','controle_portao','iluminacao_externa','possui_botao_panico',
    'qtd_agentes_portaria','qtd_atende_necessidade_portaria','quantitativo_necessario_portaria',
    'empresa_terceirizada_portaria','possui_supervisor_portaria',
    'nome_supervisor_portaria','contato_supervisor_portaria',
    'internet_disponivel','provedor_internet','qualidade_internet',
    'qtd_desktop_adm','qtd_desktop_alunos','qtd_notebooks','qtd_chromebooks',
    'computadores_atendem','qtd_computadores_inoperantes',
    'possui_projetor','qtd_projetores','possui_lousa_digital',
    'possui_direcao','possui_vice_pedagogico','possui_vice_administrativo','possui_secretario',
    'possui_coord_pedagogico','qtd_coord_pedagogico',
    'possui_coord_area_matematica','possui_coord_area_linguagem',
    'possui_coord_area_humanas','possui_coord_area_natureza',
    'qtd_professores_efetivos','qtd_professores_temporarios','qtd_servidores_administrativos',
    'possui_professor_readaptado','qtd_professor_readaptado',
    'total_beneficiarios','taxa_abandono',
    'taxa_reprovacao_fund1','taxa_reprovacao_fund2','taxa_reprovacao_medio',
    'ideb_anos_iniciais','ideb_anos_finais','ideb_ensino_medio',
    'regularizada_cee','conselho_escolar','conselho_ativo',
    'recursos_prodep','valor_prodep','execucao_prodep','pendencias_prodep',
    'recursos_federais','valor_federais','execucao_federais','pendencias_federais',
    'gremio_estudantil','reunioes_comunidade','plano_evacuacao','politica_bullying',
    'avaliacao_merendeiras','avaliacao_portaria','avaliacao_limpeza',
    'avaliacao_comunicacao','avaliacao_supervisao',
    'prioridade_1','prioridade_2','prioridade_3',
    'demanda_urgente','descricao_urgencia','sugestao_melhoria','descricao_sugestao',
    'nome_responsavel','cargo_funcao','matricula_funcional','declaracao_verdadeira'
  );
```

> Resultado esperado: nenhuma chave **OU** somente `transformadores` (resíduo conhecido). Qualquer outra chave deve ser investigada antes da Fase 1.

---

## 9. Riscos encontrados

| # | Risco | Evidência no código | Impacto na Fase 1 |
|---|---|---|---|
| R1 | Merge no `POST /v1/census` nunca remove chaves antigas | `handlers.go:142–157` — `for k, v := range newMap { oldMap[k] = v }` | Pode existir resíduo de campos descontinuados (ex.: `transformadores`). Não afeta `vw_censo_base` desde que ela só leia chaves explicitamente nomeadas. |
| R2 | Campos `turnos`, `etapas_ofertadas`, `modalidades_ofertadas` em `schools` são `TEXT` com JSON serializado | `init.sql:21–23`; `models.go:69–71` | Não usar na Fase 1. Adiar para Fase 4 com parser dedicado. |
| R3 | `taxa_*` e `ideb_*` chegam ao banco como string com possível vírgula | `alunos.ts` (transform decimal) | Fora da Fase 1; tratar na Fase 3. |
| R4 | Campos numéricos do JSONB podem ter string vazia ou string não-numérica | `general-data-form.tsx:226–238` (nullifica condicionais) + ausência de validação backend | Cast `::numeric` precisa de `NULLIF` e tratamento de falha. Validação obrigatória em 8.4 antes de promover a view a produção. |
| R5 | `etapas_ofertadas` e `modalidades_ofertadas` aparecem em duas fontes (`schools` e `data`) | `identification-form.tsx` + `general-data.ts` | Definir precedência. Sugestão: usar JSONB do ano corrente, com `schools` apenas como fallback. Discrepância pode causar drift entre painéis. |
| R6 | Backend faz merge no Go e grava JSONB inteiro — não há controle de versão de schema | `handlers.go:146–157` | Campos podem coexistir em versões diferentes entre escolas. Mitigar com seção 8.8. |
| R7 | `data IS NULL` é possível (registros muito antigos / `draft` vazio) | sem `NOT NULL` em `init.sql:34` | `vw_censo_base` deve usar `LEFT JOIN census_responses` + COALESCE para evitar quebra. |
| R8 | `init.sql` só roda em ambiente novo | docker-compose | Toda view nova precisa **também** ir como migration aplicada no startup do `main.go`. |
| R9 | Resíduo `transformadores` é removido apenas no front via `delete payload.transformadores` | `general-data-form.tsx:241` | Não afeta gravação atual, mas a chave pode existir em registros antigos no banco. Marcar como esperada na seção 8.8. |
| R10 | Sem auditoria sobre quem alterou o JSONB | n/a | Não impacta Fase 1. Apenas registrar como débito técnico. |

---

## 10. Recomendações para a Fase 1

1. **Restringir `vw_censo_base` aos 17 campos listados em 6.3** + colunas tabulares de `schools` e `census_responses`. Não tentar abraçar listas, decimais com vírgula ou enums multi-fonte nesta fase.
2. **Padrão de cast obrigatório** para qualquer numérico vindo do JSONB:
   ```sql
   NULLIF(NULLIF(cr.data->>'campo', ''), 'null')::numeric
   ```
   Se a query 8.4 encontrar valores não-numéricos, primeiro decidir a remediação (ignorar como `NULL`, `regexp_replace`, ou exigir correção no front) antes de aplicar a migration.
3. **Executar todas as queries da seção 8 em homologação** e anexar os resultados a este documento. Sem isso a Fase 1 não tem aceite.
4. **Definir filtro padrão** para o endpoint `analytics/overview`: começar com `WHERE cr.status = 'completed'` para casar com o comportamento atual da aba "Caracterização da Rede" (que hoje só lê linhas `completed` da planilha).
5. **Não usar** `schools.turnos / etapas_ofertadas / modalidades_ofertadas` na Fase 1. Documentar publicamente que esses campos serão tratados na Fase 4.
6. **Manter `sheet-metrics` ativo** durante toda a Fase 1; o endpoint novo é adicional, não substitutivo.
7. **Antes da migration**: ter um registro de paridade card-a-card (PostgreSQL vs planilha) em `docs/dashboard/validacao-fase-1.md` (a criar quando a Fase 1 começar).
8. **Limitar a Fase 1 a um único PR**: migration `0001_vw_censo_base.sql` + handler `AdminAnalyticsOverview` + alteração mínima na página `/admin`. Nenhuma outra view ou endpoint.
