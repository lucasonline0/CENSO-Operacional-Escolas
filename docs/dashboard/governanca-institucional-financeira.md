# Governança Institucional e Financeira — Metodologia para a aba Gestão Financeira e Governança

- **Status:** documento metodológico / planejamento.
- **Escopo:** não implementa código, migration, endpoint, carga de dados ou frontend. Documento exclusivamente conceitual.
- **Branch:** `docs/governanca-institucional-financeira` (a partir de `develop`).
- **Data de referência da auditoria:** junho/2026 (consulta somente-leitura ao banco de produção/Railway).

> **Convenção de marcação usada neste documento**
> - **Previsto** — já descrito na metodologia/documentação do projeto, mas não necessariamente implementado.
> - **Auditado** — verificado empiricamente no banco em consulta somente-leitura.
> - **Implementação futura** — proposta que ainda **não existe** em código e dependerá de PR próprio.
> - **Fora do escopo** — explicitamente não tratado nesta etapa.
>
> Nada neste documento deve ser lido como "já implementado". Em particular, **o Índice de Saúde Operacional ainda não calcula a dimensão Governança** (ver §9).

---

## 1. Estado atual confirmado (checklist da auditoria)

Confirmações verificadas na leitura do código e do banco:

| Afirmação | Situação | Evidência |
|---|---|---|
| Os campos existem no formulário | ✅ confirmado | `web/src/schemas/steps/gestao.ts` (linhas 4-7); render em `web/src/components/forms/gestao-form.tsx` (linhas 76-80) |
| Os campos são salvos no JSONB do censo | ✅ confirmado (auditado) | `census_responses.data` — completude alta (§5.4) |
| Os campos são exportados para o Sheets | ✅ confirmado | `api/internal/services/sheets.go` (linhas 238-240) |
| Os campos **ainda não** são explorados em endpoint analítico | ✅ confirmado | `api/cmd/api/analytics_financeiro_governanca.go` lê **apenas** `prodep_repasses`, nunca o JSONB |
| A aba atual consome principalmente dados PRODEP | ✅ confirmado | `web/src/components/admin/AbaGestaoFinanceiraGovernanca.tsx` chama só `/v1/admin/analytics/financeiro-governanca/prodep` |
| A dimensão Governança do Índice de Saúde está **prevista** na metodologia | ✅ confirmado (previsto) | `docs/dashboard/METODOLOGIA_Indice_Saude_Operacional_por_Escola.md` (dimensão Governança, peso 0,08) |
| ...mas **ainda não está habilitada** no cálculo atual | ✅ confirmado | `api/cmd/api/analytics_saude_operacional.go`: `dimensoes_habilitadas` não inclui `governanca`; `calculateSchoolHealth` retorna `Governanca: nil`. A UI confirma: `SaudeOperacionalMetodologiaInfo.tsx` lista Governança como "prevista", "ainda não entra na nota exibida" |

**Resumo do ciclo de vida do dado hoje:** coletado ✅ · salvo ✅ · exportado ✅ · **exibido no dashboard ❌** · **usado em endpoint analítico ❌** · **usado no Índice de Saúde ❌**.

---

## 2. Conceito — duas dimensões complementares

A aba **Gestão Financeira e Governança** deve passar a tratar duas dimensões **complementares e distintas**:

### Governança Institucional
Origem: **formulário do Censo Operacional** (autodeclaração do diretor).
- regularização junto ao CEE/PA;
- Conselho Escolar constituído;
- Conselho Escolar em funcionamento ativo.

### Governança Financeira
Origem: **base administrativa PRODEP** (dado administrativo, não declaratório).
- execução dos recursos PRODEP;
- reprogramação de recursos;
- prestação de contas;
- situação financeira consolidada por escola.

> **Princípio reitor:** Governança Institucional vem do formulário do Censo; Governança Financeira vem da base PRODEP. As duas **podem ser cruzadas**, mas **não são a mesma coisa** e não devem ser somadas em um único número sem critério metodológico explícito.

---

## 3. Campos do Censo

Três campos da etapa **Gestão, Participação e Política** do formulário (`gestao.ts`):

| Campo (JSONB) | Domínio | Obrigatoriedade |
|---|---|---|
| `regularizada_cee` | `Sim` / `Não` | obrigatório |
| `conselho_escolar` | `Sim` / `Não` | obrigatório |
| `conselho_ativo` | `Sim` / `Parcialmente` / `Não` | **condicional / opcional** |

> **Observação metodológica (essencial):** `conselho_ativo` é um campo **condicional** — no formulário só é exibido quando `conselho_escolar = "Sim"`. Portanto **só faz sentido quando há Conselho Escolar constituído**. Escolas sem conselho deixam o campo vazio **por desenho**, não por dado faltante. Isso impacta diretamente o denominador desse indicador (ver §5).

---

## 4. Pergunta de cada campo no formulário

| Campo | Pergunta exibida ao diretor |
|---|---|
| `regularizada_cee` | "A escola está regularizada junto ao CEE/PA?" |
| `conselho_escolar` | "A escola possui Conselho Escolar constituído?" |
| `conselho_ativo` | "O Conselho Escolar está em funcionamento ativo?" |

---

## 5. Evidências da auditoria (somente-leitura)

> Todos os números abaixo foram **auditados** em consulta read-only ao banco. Não devem ser inventados novos números além destes ou dos derivados diretamente deles.

### 5.4.a Volume e status

```txt
census_responses: 859 respostas
  completed: 822
  draft:      37
```

### 5.4.b Completude dos três campos

| Campo | Preenchido (total /859) | Preenchido (concluídas /822) |
|---|---|---|
| `regularizada_cee` | 834 | 822 |
| `conselho_escolar` | 834 | 822 |
| `conselho_ativo` | 768 | 757 |

Os "vazios" de `conselho_ativo` nas concluídas correspondem essencialmente às escolas sem conselho constituído — coerente com a regra condicional do §3.

### 5.4.c Distribuições gerais (total /859)

```txt
regularizada_cee:
  Sim            712
  Não            122
  Não informado   25

conselho_escolar:
  Sim            774
  Não             60
  Não informado   25

conselho_ativo:
  Sim            704
  Parcialmente    51
  Não             13
  Não informado   91
```

### 5.4.d Governança institucional completa e crítica

Regra observada: `regularizada_cee = Sim` **e** `conselho_escolar = Sim` **e** `conselho_ativo = Sim`.

```txt
Governança institucional completa:      624 escolas
Governança incompleta/crítica
  (algum campo = "Não"):                160 escolas
Conselho parcialmente ativo:             51 escolas
Sem conselho constituído:                60 escolas
```

---

## 5.5 Denominadores (regra metodológica)

| Indicador | Denominador |
|---|---|
| Regularização CEE | respostas `completed` |
| Conselho Escolar constituído | respostas `completed` |
| **Conselho ativo** | **escolas com `conselho_escolar = Sim`** |
| Governança institucional completa | respostas `completed` |
| Governança incompleta/crítica | respostas `completed` |

> **Regra firme:** `Não informado` **não** deve ser tratado como `Não`. `Não informado` fica **fora do numerador** e deve ser exibido como **ausência de informação** (estado próprio na UI), nunca convertido em "Não".
>
> O denominador de **Conselho ativo** é diferente dos demais: é o conjunto de escolas com conselho constituído, não o total de censos. Usar o total infla artificialmente o percentual de "não ativos".

---

## 5.6 Cards candidatos — bloco "Governança Institucional"

> Os cards abaixo são **implementação futura** (PR 1). Não existem hoje. Fonte: campos JSONB do Censo (§3).

### Card 1 — Escolas regularizadas no CEE/PA
- **Fonte:** `regularizada_cee` (Censo).
- **Numerador:** `regularizada_cee = Sim`.
- **Denominador:** respostas `completed`.
- **Interpretação:** conformidade regulatória da escola junto ao Conselho Estadual de Educação.
- **Observação:** `Não informado` fora do numerador, exibido como tal.

### Card 2 — Escolas com Conselho Escolar constituído
- **Fonte:** `conselho_escolar` (Censo).
- **Numerador:** `conselho_escolar = Sim`.
- **Denominador:** respostas `completed`.
- **Interpretação:** existência formal de instância de participação/controle social.
- **Observação:** base para o denominador do Card 3.

### Card 3 — Conselhos em funcionamento ativo
- **Fonte:** `conselho_ativo` (Censo).
- **Numerador:** `conselho_ativo = Sim`.
- **Denominador:** **escolas com `conselho_escolar = Sim`** (não o total).
- **Interpretação:** efetividade do conselho, não apenas sua existência formal.
- **Observação:** campo condicional; denominador distinto dos demais cards.

### Card 4 — Conselhos parcialmente ativos
- **Fonte:** `conselho_ativo` (Censo).
- **Numerador:** `conselho_ativo = Parcialmente`.
- **Denominador:** escolas com `conselho_escolar = Sim`.
- **Interpretação:** sinal de fragilidade da instância (funciona, mas de forma irregular).
- **Observação:** não confundir com inativo; é estado intermediário.

### Card 5 — Governança institucional completa
- **Fonte:** combinação dos três campos (Censo).
- **Numerador:** `regularizada_cee = Sim` ∧ `conselho_escolar = Sim` ∧ `conselho_ativo = Sim`.
- **Denominador:** respostas `completed`.
- **Interpretação:** escola plenamente regular e participativa nos três quesitos institucionais.
- **Observação:** valor auditado de referência: **624 escolas**.

### Card 6 — Governança institucional incompleta/crítica
- **Fonte:** combinação dos três campos (Censo).
- **Numerador:** pelo menos um dos três campos = `Não`.
- **Denominador:** respostas `completed`.
- **Interpretação:** escolas com lacuna institucional relevante — foco de ação.
- **Observação:** valor auditado de referência: **160 escolas**. `Não informado` não entra como "Não".

---

## 5.7 Tabelas e análises futuras

> **Implementação futura.** Análises sugeridas para PRs posteriores:

- Governança institucional por **DRE**;
- Governança institucional por **município**;
- Governança institucional por **zona**;
- **Matriz** CEE × Conselho Escolar × Conselho Ativo;
- **Lista de escolas com governança crítica** (drilldown das escolas com algum "Não");
- **Cruzamento** Governança Institucional × PRODEP (§5.8).

### Achado territorial (auditado)
> A **zona rural** apresentou percentuais menores de regularização CEE e de Conselho Escolar constituído em relação à **zona urbana**. Esse recorte territorial é um candidato natural a destaque na aba e a recorte de política pública. (Achado verificado na auditoria; números detalhados por zona/DRE serão consolidados no PR de tabelas.)

---

## 5.8 Cruzamentos com PRODEP

O cruzamento entre Governança Institucional (Censo) e Governança Financeira (PRODEP) deve ser feito **posteriormente**, por `school_id`, **apenas para escolas com vínculo cadastral seguro** (escolas com `school_id` resolvido na base PRODEP). Registros PRODEP sem `school_id` não entram no cruzamento por escola.

Cruzamentos sugeridos (**implementação futura**):

- escolas **sem conselho ativo** e **com não prestação de contas**;
- escolas **sem regularização CEE** e **com alto percentual reprogramado**;
- escolas **com governança institucional completa** e **boa execução financeira**;
- escolas **com governança institucional incompleta**, mas **sem pendência PRODEP**.

> **Regra firme sobre volume financeiro:**
> - **Não** usar valor recebido bruto como indicador de saúde.
> - Volume de recurso **não** deve virar nota.
> - O que **pode** virar indicador é **execução, regularidade e conformidade** — não o montante.

---

## 5.9 / §9 — Relação com o Índice de Saúde Operacional

### Previsto
A metodologia atual do Índice **já prevê** a dimensão **Governança**, com **peso 0,08 (8%)**, incluindo:

```txt
regularização CEE/PA
conselho constituído
conselho ativo
execução PRODEP
pendências de prestação de contas
```

### Auditado / estado da implementação
A implementação atual **ainda não calcula Governança**:

```txt
dimensoes_habilitadas NÃO inclui "governanca"
calculateSchoolHealth retorna Governanca: nil  (e Pedagogico: nil)
```

A própria UI da metodologia (`SaudeOperacionalMetodologiaInfo.tsx`) já comunica isso: Governança e Pedagógico aparecem como **"previstos na metodologia"**, mas **"ainda não entram na nota exibida"**. As 6 dimensões hoje habilitadas no cálculo são: Infraestrutura, Energia, Merenda, Segurança, Pessoal e Tecnologia.

> Não afirmar, em nenhum material, que o Índice de Saúde já considera Governança. Ele **não** considera.

### Regra futura proposta (sem implementar) — Governança Institucional

```txt
regularizada_cee:
  Sim  = 100
  Não  =   0
  (Não informado = nil → não penaliza)

conselho_escolar:
  Sim  = 100
  Não  =   0

conselho_ativo:
  Sim          = 100
  Parcialmente =  50
  Não          =   0
  (nil quando não há conselho → ver nota abaixo)
```

> Nota de desenho: como `conselho_ativo` é condicional, uma escola sem conselho já pontua 0 via `conselho_escolar`; o `conselho_ativo` vazio deve ser **ignorado** no cálculo (à semelhança do tratamento de campos ausentes já existente no código, que descarta `nil`), evitando penalizar a mesma ausência duas vezes.

### Conceito futuro (sem implementar) — Governança Financeira (PRODEP)

```txt
sem não prestação de contas         = bom
não prestou contas em algum registro = crítico
percentual reprogramado baixo        = bom
percentual reprogramado alto         = atenção/crítico
sem recurso                          = neutro/null, NÃO penalizar automaticamente
valor recebido bruto                 = NÃO entra como nota
```

> **A ativação da dimensão Governança no Índice de Saúde deve ser um PR posterior**, com **versionamento da metodologia** (`saudeOperacionalVersao`) e **auditoria dos impactos nos escores** — ao habilitar uma nova dimensão, a renormalização dos pesos muda as notas históricas das escolas.

---

## 5.10 / §10 — Fatiamento futuro em PRs

| PR | Conteúdo | Escopo |
|---|---|---|
| **PR 0** | Documento metodológico (este) | documental |
| **PR 1** | Endpoint + cards de Governança Institucional | backend + frontend |
| **PR 2** | Tabelas por DRE / município / zona | backend + frontend |
| **PR 3** | Cruzamento Governança Institucional × PRODEP | backend + frontend |
| **PR 4** | Situação financeira consolidada por escola | backend + frontend |
| **PR 5** | Ativação da dimensão Governança no Índice de Saúde | backend + versionamento + auditoria |

Cada PR deve seguir as regras do `CLAUDE.md`: pequeno e reversível, SQL parametrizado, views idempotentes, novos endpoints sob `/v1/admin/analytics/*` dentro do grupo protegido por JWT, sem ORM, sem alterar o fluxo do formulário nem o caminho de submissão (`POST /v1/census`).

---

## Fora do escopo (explícito)

- Qualquer alteração em backend, frontend, migration ou importador PRODEP.
- Ativação real da dimensão Governança no Índice de Saúde.
- As abas "Perfil dos Alunos e Resultados" e (a parte declaratória de) qualquer remodelagem que dependa de outra planilha.
- Commit/push — esta etapa entrega apenas o documento.
