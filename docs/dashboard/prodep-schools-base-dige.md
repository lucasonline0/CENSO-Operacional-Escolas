# PRODEP, schools e base_dige — Governança de vínculo cadastral

**Status:** documento técnico/metodológico de planejamento. **Nada implementado.** Esta frente é exclusivamente documental — não cria migration, tabela, script de importação, endpoint, payload, frontend, nem carrega dados.

**Branch de origem:** `docs/prodep-schools-base-dige` a partir de `develop`.

**Documento companheiro:** [gestao-financeira-governanca-prodep.md](gestao-financeira-governanca-prodep.md) — planejamento geral da aba Gestão Financeira e Governança. Este documento aprofunda **especificamente a governança de vínculo cadastral** entre as três fontes (PRODEP, `schools`, `base_dige`), incluindo o tratamento dos registros PRODEP sem correspondência em `schools` e o papel da `base_dige` como fonte administrativa complementar.

> **Posicionamento.** A aplicação já está em produção e a branch `develop` será futuramente mergeada na `main`. Portanto, nenhuma decisão deste documento pode alterar o comportamento atual da produção. A `base_dige` **não** substitui imediatamente a tabela `schools`; ela será usada **primeiro para saneamento, comparação e sugestão de vínculo**, sempre sujeita a validação humana antes de qualquer carga analítica.

---

## 1. Contexto

A futura aba **Gestão Financeira e Governança** consolidará os repasses do **PRODEP** (recursos recebidos, reprogramados e status de prestação de contas) cruzados com os dados declaratórios do censo. Esse cruzamento depende de uma **chave de vínculo** entre o registro financeiro do PRODEP e a escola operacional cadastrada em `schools`.

Ao preparar a integração, identificou-se um problema cadastral concreto:

- existem **95 registros do PRODEP sem match na tabela `schools`** (sem correspondência segura por `INEP`);
- esses registros têm **relevância financeira** — descartá-los distorceria os totais da aba;
- forçar um vínculo artificial poderia **atribuir valor financeiro à escola errada**.

Em paralelo, foi recebida recentemente uma nova base administrativa, a **`base_dige`**, que cobre escolas com campos cadastrais (DRE, Município, `Cod_Inep`, `Cod_Setor`, Nome da Escola) e é **possivelmente mais atualizada** que parte do cadastro atual. Ela surge como **fonte auxiliar de saneamento**, capaz de ajudar a localizar e contextualizar registros que hoje não casam com `schools`.

Este documento estabelece a **governança das três fontes**: o papel de cada uma, a decisão metodológica sobre os 95 registros sem match, os status de vínculo, o uso da `base_dige` como fonte de **sugestão** (não de substituição) e a modelagem futura sugerida. O objetivo é deixar a regra clara antes de qualquer implementação: **a `base_dige` não altera `schools` automaticamente**.

---

## 2. Fontes envolvidas

A integração da aba mobiliza três fontes distintas, cada uma com papel e regra próprios.

### 2.1 PRODEP

Fonte **financeira administrativa** dos repasses.

**Papel:**

- registrar valores recebidos;
- registrar valores reprogramados;
- registrar status de prestação de contas;
- alimentar a futura aba **Gestão Financeira e Governança**.

**Regra:**

> O PRODEP é a **fonte financeira**. Os registros do PRODEP **não devem ser descartados** apenas porque não possuem match em `schools`. A ausência de vínculo cadastral é um problema de **saneamento**, não um motivo para excluir um registro financeiro válido.

### 2.2 schools

Cadastro **operacional** atual usado pela aplicação.

**Papel:**

- base atual de escolas usada pelo sistema;
- base dos filtros globais e das abas existentes;
- referência operacional para o dashboard e para o **Índice de Saúde Operacional**.

**Regra:**

> `schools` continua sendo a **fonte operacional oficial** da aplicação em produção. Nenhum processo desta frente altera, sobrescreve ou substitui `schools` automaticamente.

Colunas relevantes (`infra/init.sql`): `id` (PK, referenciado como `school_id` em `census_responses`), `codigo_inep` (`UNIQUE`), `nome_escola`, `dre`, `municipio`, `zona`.

### 2.3 base_dige

Nova **base administrativa complementar**, **possivelmente mais atualizada**, recebida recentemente. É uma **fonte auxiliar de saneamento e de sugestão de vínculo** — não uma base oficial substituta.

Campos conhecidos (confirmados pela inspeção da planilha local — ver §2.3.1):

```txt
DRE
Município
Cod_Inep
Cod_Setor
Nome da Escola
```

**Papel:**

- apoiar o **saneamento cadastral**;
- ajudar a resolver registros PRODEP sem match em `schools`;
- identificar anexos;
- identificar escolas rurais;
- identificar escolas indígenas;
- identificar divergências de INEP, nome, município ou DRE;
- servir como **fonte auxiliar de validação**.

**Regra:**

> - `base_dige` **não substitui** `schools` automaticamente.
> - `base_dige` **não cria** `school_id` automaticamente.
> - `base_dige` **não altera** filtros nem o comportamento da aplicação em produção.
>
> A `base_dige` é uma base administrativa complementar, possivelmente mais atualizada, usada como fonte auxiliar de saneamento e de sugestão de vínculo. Ela **não** é tratada como base oficial substituta nem como fonte única da verdade.

#### 2.3.1 Estrutura observada na planilha local

A planilha foi disponibilizada localmente (fora do controle de versão, em `_local/base_dige/`, **não versionada** — ver §12) e inspecionada apenas como **referência de estrutura e evidência cadastral**. A inspeção inicial indica:

| Aspecto | Observado |
|---|---|
| Abas | uma única aba (`base_dige`) |
| Linhas | **1025** registros |
| Colunas | `DRE`, `Município`, `Cod_Inep`, `Cod_Setor`, `Nome da Escola` |
| `DRE` | sem vazios; **40** DREs distintas |
| `Município` | sem vazios; **148** municípios distintos |
| `Cod_Inep` | **1007** com 8 dígitos; **13** ausentes (vazios) + marcadores textuais como `SEM INEP` (4) e `?` (1) |
| `Cod_Setor` | **14** ausentes, incluindo marcador `SEM SETOR` (4) |

Características relevantes detectadas (linguagem cautelosa — a análise comparativa futura deverá confirmar):

- **há indícios de registros sem `Cod_Inep`**, parte como célula vazia e parte com **marcador textual equivalente** (`SEM INEP`, `?`) — esses casos exigem tratamento explícito e não podem ser lidos como INEP válido;
- **há indícios de registros sem `Cod_Setor`**, parte vazia e parte com marcador `SEM SETOR`;
- **foram observados registros com perfil de anexo** — a inspeção inicial indica ~63 registros cujo nome contém o termo `ANEXO`;
- **foram observados registros com perfil de escola rural/do campo** — a inspeção inicial indica ~105 registros cujo nome contém `DO CAMPO`/`RURAL`;
- **foram observados registros com perfil de escola indígena** — a inspeção inicial indica ~27 registros cujo nome sugere unidade indígena;
- **foram observadas possíveis duplicidades** de `Cod_Inep` (alguns INEP numéricos repetidos, além da repetição do marcador `SEM INEP`) e de `Cod_Setor` — todas **exigem análise posterior**, pois podem refletir anexos legítimos, registros distintos ou erro de origem.

> Os contadores acima são da **inspeção inicial** e têm caráter indicativo. A base **deverá passar por normalização** (encoding do campo `Município`, padronização de marcadores de ausência, normalização de nome) **antes de qualquer carga**. Nenhum desses números deve ser tratado como fechado: o `relatorio_qualidade_base_dige.md` (§10) é quem os confirma formalmente. A inspeção **não** altera a planilha, não a converte nem a versiona.

---

## 3. Problema dos registros PRODEP sem match

Ao tentar vincular cada linha do PRODEP a uma escola operacional por `INEP` (`schools.codigo_inep`), **95 registros não encontram correspondência segura** em `schools`.

Possíveis causas (a confirmar no relatório de qualidade):

- escola presente no PRODEP mas ausente do cadastro `schools` atual;
- INEP divergente, ausente ou inconsistente entre as fontes;
- registro que representa um **anexo** cuja sede está cadastrada com outro INEP;
- escola rural ou indígena com identificação cadastral incompleta;
- diferença de recorte temporal entre o cadastro `schools` e a base de repasses.

A tensão central é:

- **excluir** os 95 registros **distorce os totais financeiros** da aba (valores recebidos/reprogramados some da rede);
- **forçar match** artificial pode **atribuir o valor à escola errada**, corrompendo o cruzamento com o censo e o Índice de Saúde Operacional.

A `base_dige`, por ser possivelmente mais atualizada, pode **ajudar a localizar** parte desses 95 registros — mas localizar na `base_dige` é **sugestão de vínculo**, não vínculo operacional confirmado em `schools` (ver §7).

---

## 4. Decisão metodológica

Decisão sobre os **95 registros PRODEP sem match**:

```txt
não excluir os 95 registros
não forçar match artificial com schools
não inventar school_id
não sobrescrever INEP
não criar escolas automaticamente em schools
manter os registros na análise financeira
registrar school_id como nulo quando não houver vínculo seguro
usar status de vínculo cadastral
```

Em texto:

1. **Não excluir** os 95 registros — eles permanecem na base analítica financeira.
2. **Não forçar match** artificial com `schools`.
3. **Não inventar** `school_id`.
4. **Não sobrescrever** o `INEP` de origem.
5. **Não criar** escolas automaticamente em `schools`.
6. **Manter** os registros na análise financeira (totais, rankings, tabelas).
7. **Registrar `school_id` como `NULL`** quando não houver vínculo seguro.
8. **Usar um status de vínculo cadastral** explícito (§7) para qualificar cada registro.

**Justificativa:**

- os registros têm **relevância financeira** e fazem parte do volume real de repasses da rede;
- **excluir** esses registros distorce os totais da aba financeira;
- **forçar match** pode atribuir dado financeiro à escola errada, contaminando análises operacionais.

A regra de ouro: **um registro financeiro pode existir sem vínculo operacional confirmado**. O dado financeiro é preservado; o vínculo é qualificado por status e só vira atribuição escola-a-escola quando houver segurança.

---

## 5. Regras para uso financeiro

Os registros PRODEP sem match **entram normalmente nos totais financeiros** da aba Gestão Financeira e Governança, pois representam recursos reais da rede:

```txt
total recebido
total reprogramado
percentual reprogramado
prestação de contas
ranking por DRE
ranking por município
tabela por unidade PRODEP
```

Esses registros, porém, devem aparecer com **status explícito**, para que o leitor saiba que ainda não há vínculo operacional confirmado:

```txt
Sem vínculo confirmado em schools
Localizado apenas na base_dige
Pendente de saneamento cadastral
Anexo identificado
```

Princípios de exibição:

- **Totais de rede** (recebido, reprogramado, % reprogramado, prestação de contas) **incluem** os registros sem match — caso contrário o total da rede ficaria subestimado.
- **Rankings por DRE/município** usam, quando possível, a DRE/município de **origem do PRODEP** ou o valor resolvido pela `base_dige`, sempre sinalizando a procedência.
- **Tabela por unidade PRODEP** lista o registro com o seu status de vínculo, sem ocultá-lo.
- Nenhum registro é silenciosamente removido dos agregados financeiros por falta de vínculo; a falta de vínculo é **informada**, não **descartada**.

---

## 6. Regras para o Índice de Saúde Operacional

Regra **conservadora** para o Índice de Saúde Operacional por escola:

> **Somente registros PRODEP com `school_id` confirmado em `schools`** entram no cálculo escola-a-escola do **Índice de Saúde Operacional**.

A `base_dige` **pode sugerir** vínculo, mas **não alimenta automaticamente** o índice. Um vínculo no status `matched_by_base_dige` (§7) é **sugestão de saneamento**, não vínculo operacional definitivo — e, portanto, **não** habilita atribuição automática ao índice.

**Justificativa:**

- o Índice de Saúde Operacional é calculado **por escola operacional** (entidade de `schools`);
- a atribuição financeira a uma escola só deve ocorrer **quando houver vínculo seguro**;
- usar um vínculo apenas sugerido (não validado) poderia injetar dado financeiro na escola errada e distorcer o índice.

Resumo da assimetria entre as duas leituras:

| Uso | Inclui registros sem match em `schools`? | Inclui registros só localizados na `base_dige`? |
|---|---|---|
| **Totais financeiros da aba** (§5) | Sim, com status explícito | Sim, com status explícito |
| **Índice de Saúde Operacional** (§6) | Não | Não (somente após validação humana que confirme vínculo em `schools`) |

---

## 7. Status de vínculo cadastral

Cada registro PRODEP recebe um **status de vínculo** que qualifica a confiança do vínculo com uma escola operacional. Status recomendados:

```txt
matched_by_inep_schools
matched_by_base_dige
matched_by_manual_override
anexo_vinculado_sede
prodep_only_validado
pendente_match
nao_usar
```

### matched_by_inep_schools

O `INEP` do PRODEP **existe diretamente em `schools`** (`schools.codigo_inep`). É o vínculo mais forte: vínculo operacional confirmado. **Habilita** uso no Índice de Saúde Operacional.

### matched_by_base_dige

`matched_by_base_dige` significa que o registro foi **localizado na `base_dige`**, mas **ainda não representa vínculo operacional definitivo com `schools`**. O registro **não existe em `schools`** (ou não casou por INEP), e a `base_dige` apenas o **localizou** — é uma **sugestão de saneamento**, não uma confirmação. A decisão definitiva deve vir de **`matched_by_manual_override`** (validação humana) ou de **vínculo seguro com `schools`** (`matched_by_inep_schools`). Por isso, esse status **não habilita**, por si só, uso no Índice de Saúde Operacional.

### matched_by_manual_override

Houve **decisão humana** validando um vínculo específico (correção revisada e registrada). É o caminho oficial para promover um registro a vínculo confiável quando o match automático não basta. Ver `prodep_school_overrides` (§11).

### anexo_vinculado_sede

O registro PRODEP representa um **anexo**, e foi possível identificar a **escola sede** correspondente. O valor financeiro pode ser associado à sede, preservando a informação de que a origem é um anexo (campos de sede em separado — ver §11).

### prodep_only_validado

O registro financeiro é **válido**, mas **não possui escola correspondente em `schools`**. Foi validado como registro financeiro legítimo a manter na análise, mesmo sem vínculo operacional. Entra nos totais (§5), **não** entra no índice (§6).

### pendente_match

Ainda **não há decisão segura** sobre o vínculo. Estado inicial padrão de um registro sem match automático, antes da validação humana. Entra nos totais com status explícito; **não** entra no índice.

### nao_usar

A validação humana indicou que o registro **não deve entrar na carga analítica** (ex.: duplicidade, registro inválido, erro de origem). Excluído dos agregados — mas a exclusão é **decisão humana registrada**, não automática.

> Transições típicas: um registro nasce `pendente_match`; pode ser localizado na `base_dige` (`matched_by_base_dige`) ou casar por INEP em `schools` (`matched_by_inep_schools`); a validação humana pode promovê-lo a `matched_by_manual_override`, `anexo_vinculado_sede` ou `prodep_only_validado`, ou descartá-lo como `nao_usar`. Apenas `matched_by_inep_schools` e os status confirmados por decisão humana que resolvam um `school_id` em `schools` habilitam o Índice de Saúde Operacional.

---

## 8. Uso da base_dige como fonte auxiliar

A `base_dige` será usada para **gerar candidatos de match** (sugestões), apoiando o saneamento dos registros sem correspondência em `schools`.

Critérios de geração de candidatos (exemplos):

```txt
match por Cod_Inep
match por nome normalizado
match por município
match por DRE
match por Cod_Setor
identificação de anexo pelo nome
identificação de escola rural pelo nome
identificação de escola indígena pelo nome
```

Mas a regra é inequívoca:

> **Match por `base_dige` é sugestão de saneamento, não alteração automática da tabela `schools`.**

Diretrizes:

- a `base_dige` produz **candidatos**, ordenados por confiança (ex.: match exato de `Cod_Inep` é mais forte que match por nome normalizado);
- nenhum candidato é aplicado automaticamente a `schools` nem gera `school_id` automaticamente;
- todo candidato passa por **validação humana** antes de virar vínculo confiável (`matched_by_manual_override`);
- a normalização (nome, município) serve apenas para **aproximar** registros — não para afirmar identidade;
- a `base_dige`, por ser possivelmente mais atualizada, é útil justamente para os registros que `schools` ainda não cobre, mas isso **não** a torna a fonte da verdade: discrepâncias entre `base_dige` e `schools` são **divergências a investigar**, não correções automáticas.

---

## 9. Tratamento de anexos, escolas rurais e indígenas

A `base_dige` ajuda a **classificar** registros que hoje aparecem como "sem match" por características específicas. A inspeção inicial da planilha local (§2.3.1) já mostra indícios desses três perfis, que a análise comparativa futura deverá confirmar:

- **Anexos.** Muitos registros sem match podem ser **anexos** de uma escola sede — a inspeção inicial indica ~63 registros com `ANEXO` no nome. A `base_dige` (nome, `Cod_Setor`, DRE, município) ajuda a identificar a sede provável. Quando a sede é identificada com segurança, o registro recebe `anexo_vinculado_sede`, e os campos de sede (`codigo_inep_sede`, `school_id_sede`) são preenchidos — preservando que a origem é anexo.
- **Escolas rurais / do campo.** Identificáveis por padrões no nome (a inspeção inicial indica ~105 registros com `DO CAMPO`/`RURAL`) e por atributos cadastrais. Marcadas com flag (`is_rural`) para análise territorial, sem alterar `schools`.
- **Escolas indígenas.** Identificáveis por padrões no nome (a inspeção inicial indica ~27 registros com perfil indígena) e por atributos cadastrais. Marcadas com flag (`is_indigena`).

Princípios:

- a identificação por nome é **heurística** e gera **sugestão**, sempre sujeita a revisão humana;
- as flags (`is_anexo`, `is_rural`, `is_indigena`) são **atributos de saneamento/análise**, não alteram a tabela `schools` nem os filtros da produção;
- o vínculo anexo→sede, quando aplicado a valor financeiro, deve ser **auditável** (registrar INEP e `school_id` da sede separadamente do INEP de origem do anexo).

---

## 10. Saídas esperadas da análise comparativa

A etapa seguinte (fora do escopo desta documentação) deverá realizar **três cruzamentos** e, a partir deles, gerar artefatos de apoio à **validação humana**, antes de qualquer migration ou importação:

```txt
PRODEP × schools        — match operacional por INEP (vínculo forte / 95 sem match)
PRODEP × base_dige      — sugestão de localização dos registros sem match
schools × base_dige     — diagnóstico de divergências e cobertura cadastral
```

- **PRODEP × schools** identifica quais registros financeiros casam por INEP (`matched_by_inep_schools`) e quais permanecem sem vínculo seguro (os 95 e eventuais residuais).
- **PRODEP × base_dige** tenta **localizar** os registros sem match usando a base administrativa complementar, gerando **candidatos** (`matched_by_base_dige`) — sugestão, nunca aplicação automática (§8).
- **schools × base_dige** compara as duas bases cadastrais para mapear **divergências** (INEP, nome, município, DRE) e **cobertura** (registros presentes em uma e ausentes na outra), sem decidir qual está "correta".

Artefatos derivados desses cruzamentos:

```txt
prodep_match_candidates_base_dige.xlsx
schools_vs_base_dige_diff.xlsx
prodep_pendencias_residuais.xlsx
relatorio_qualidade_base_dige.md
prodep_school_overrides.csv
```

Finalidade de cada saída:

- **`prodep_match_candidates_base_dige.xlsx`** — candidatos de vínculo gerados pela `base_dige` para os registros PRODEP sem match, ordenados por confiança, para revisão.
- **`schools_vs_base_dige_diff.xlsx`** — divergências entre `schools` e `base_dige` (INEP, nome, município, DRE), para diagnóstico de saneamento.
- **`prodep_pendencias_residuais.xlsx`** — registros PRODEP que permanecem sem vínculo seguro mesmo após o cruzamento com a `base_dige` (candidatos a `prodep_only_validado` ou `pendente_match`).
- **`relatorio_qualidade_base_dige.md`** — relatório de qualidade da `base_dige` (cobertura, duplicidades, campos ausentes, taxa de match com `schools` e com o PRODEP).
- **`prodep_school_overrides.csv`** — decisões humanas de vínculo (overrides) prontas para alimentar a futura tabela de overrides (§11).

Esses arquivos **apoiam a validação humana** e antecedem qualquer migration ou importação. Nenhum deles altera código, banco ou produção. Eles serão **derivados de análise local** (a partir da planilha em `_local/`, fora do controle de versão) e **não necessariamente versionados** no repositório — assim como a própria `base_dige` não é versionada (§12). O que entra no repositório é a **documentação metodológica**, não os dados brutos nem os artefatos intermediários.

---

## 11. Modelagem futura sugerida

A futura implementação (fora do escopo deste PR) **poderá** criar tabelas próprias no PostgreSQL para a `base_dige` e para os repasses PRODEP, separadas do JSONB do censo e **sem alterar `schools`**. Nomes e campos são **sugestões conceituais**, a confirmar na fase de migration estrutural.

Tabelas sugeridas:

```txt
dige_school_registry
dige_import_batches
prodep_repasses
prodep_school_overrides
prodep_import_batches
```

### dige_school_registry

Espelho administrativo da `base_dige`, carregado por lote, **sem** sobrescrever `schools`.

```txt
id
cod_inep
cod_setor
nome_escola
dre
municipio
nome_normalizado
municipio_normalizado
is_anexo
is_rural
is_indigena
status_registro
import_batch_id
created_at
updated_at
```

### dige_import_batches

Controle de auditoria das cargas da `base_dige` (origem do arquivo, momento, contagens, responsável). Permite rastrear de qual lote veio cada registro de `dige_school_registry`.

### prodep_repasses

Registros financeiros do PRODEP, em formato adequado a totais e cruzamentos, com vínculo qualificado por status (§7).

```txt
id
codigo_inep_prodep
escola_nome_prodep
school_id nullable
codigo_inep_sede nullable
school_id_sede nullable
dre_prodep
ri_prodep
municipio_prodep
municipio_resolvido
ano
categoria
valor_recebido
valor_reprogramado
status_prestacao_contas
match_status
match_tipo
fonte_validacao
observacao_validacao
import_batch_id
created_at
updated_at
```

> `school_id` permanece `NULL` quando não há vínculo seguro (§4). `codigo_inep_sede`/`school_id_sede` cobrem o caso `anexo_vinculado_sede` (§9). `match_status` recebe um dos valores de §7. `municipio_resolvido` segue a estratégia de saneamento em camadas já descrita no documento companheiro. O par valor/`status_prestacao_contas` preserva o status textual (ex.: `NÃO PRESTOU CONTAS`) sem coagir a `0`.

### prodep_school_overrides

Decisões humanas de vínculo (overrides validados), fonte do status `matched_by_manual_override` e dos demais vínculos confirmados por pessoa.

```txt
codigo_inep_prodep
escola_nome_prodep
tipo_override
school_id_corrigido nullable
codigo_inep_sede nullable
school_id_sede nullable
municipio_corrigido
match_status
usar_na_carga
fonte_validacao
validado_por
validado_em
observacao
```

### prodep_import_batches

Controle de auditoria das cargas do PRODEP (origem do arquivo, momento, contagens, responsável), análogo a `dige_import_batches`.

> **Princípio transversal.** Nenhuma dessas tabelas escreve em `schools`. O vínculo operacional só é "resolvido" preenchendo `school_id` (e/ou `school_id_sede`) **a partir de `schools.id`** quando há match por INEP ou decisão humana — nunca o contrário. A `base_dige` vive em `dige_school_registry`, isolada do cadastro operacional.

---

## 12. Riscos e salvaguardas

| Risco | Salvaguarda |
|---|---|
| Excluir os 95 registros sem match e subestimar os totais financeiros | **Não excluir** (§4); registros entram nos totais com status explícito (§5). |
| Forçar match e atribuir valor à escola errada | **Não forçar match** (§4); `school_id` fica `NULL` até vínculo seguro; índice só usa vínculo confirmado (§6). |
| Tratar a `base_dige` como fonte da verdade e sobrescrever `schools` | `base_dige` é **fonte auxiliar de sugestão** (§2.3, §8); vive em tabela isolada; **não** altera `schools` nem a produção. |
| Vínculo sugerido pela `base_dige` contaminar o Índice de Saúde Operacional | Índice usa **somente** vínculo confirmado em `schools` (§6); `matched_by_base_dige` não habilita o índice. |
| Anexo somar valor à escola errada | `anexo_vinculado_sede` com campos de sede separados e auditáveis (§9, §11). |
| Heurística de nome (rural/indígena/anexo) gerar classificação incorreta | Identificação por nome é **sugestão**, sempre revisada por humano (§9). |
| Carga sem rastreabilidade | Tabelas de batch (`*_import_batches`) e campos de auditoria (`fonte_validacao`, `validado_por`, `import_batch_id`) (§11). |
| Decisão humana de vínculo perder-se | `prodep_school_overrides` registra cada override com autor e data (§11). |
| Alterar comportamento da produção antes do merge em `main` | Toda esta frente é **documental**; nenhuma mudança de código, banco ou filtros. |
| Dados sensíveis da `base_dige` (e artefatos derivados) vazarem para o repositório | A planilha vive em `_local/` (protegido em `.git/info/exclude`), **não versionada**; só a documentação metodológica entra no Git (§2.3.1, §10). |
| `Cod_Inep` ausente/textual (`SEM INEP`, `?`) ser lido como INEP válido | Marcadores de ausência são tratados explicitamente; registro sem INEP válido não casa por INEP e segue para `pendente_match`/sugestão pela `base_dige` (§2.3.1, §7). |
| Duplicidades de `Cod_Inep`/`Cod_Setor` gerarem vínculo ambíguo | Duplicidades observadas **exigem análise posterior** antes da carga; normalização precede qualquer importação (§2.3.1). |

---

## 13. Próximos PRs

Sequência recomendada (cada passo é uma frente/PR próprio; **nada além do passo 1 está em escopo agora**):

1. **Documentação desta governança de vínculo** ← *este PR*.
2. **Análise comparativa** PRODEP × `schools` × `base_dige`, gerando as saídas de §10.
3. **Relatório de qualidade da `base_dige`** (cobertura, duplicidades, taxa de match).
4. **Validação humana** dos candidatos e consolidação de `prodep_school_overrides.csv`.
5. **Migration estrutural** das tabelas sugeridas em §11 (`CREATE TABLE IF NOT EXISTS`, idempotente, replicada em `infra/init.sql`), **sem dados**.
6. **Scripts de importação** controlados (`base_dige` e PRODEP), idempotentes, com registro de batch.
7. **Resolução de vínculo** (preenchimento de `school_id`/`school_id_sede` por INEP e por override), **sem escrever em `schools`**.
8. **Endpoints backend** sob `/v1/admin/analytics/gestao-financeira/*`, JWT-protegidos, queries parametrizadas.
9. **Payload e frontend** da aba Gestão Financeira e Governança (substituindo o placeholder), exibindo status de vínculo (§5).
10. **Testes e auditoria** (paridade numérica e trilha de auditoria da carga).

> Esta documentação não autoriza nenhum dos passos 2 em diante. Cada um exige escopo, revisão e validação próprios. As decisões pendentes de validação humana (domínio de status, critérios de anexo, dono da `base_dige`, periodicidade das cargas) seguem registradas no documento companheiro [gestao-financeira-governanca-prodep.md](gestao-financeira-governanca-prodep.md) §9.
