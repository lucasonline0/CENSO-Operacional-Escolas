# Diagnóstico Técnico — Índice de Saúde Operacional por escola

> Diagnóstico somente documental, produzido por leitura estática da branch
> `docs/indice-saude-operacional-escola`. Nenhum endpoint foi executado contra
> banco local ou homologação nesta rodada.

## 1. Objetivo

Avaliar a viabilidade técnica da nova tela transversal **Índice de Saúde
Operacional por escola**, cruzando a metodologia v1.0 com:

- os campos efetivamente gravados em `census_responses.data`;
- as views analíticas e os endpoints já existentes;
- as decisões de fonte consolidadas para o dashboard;
- os padrões atuais do frontend administrativo;
- os requisitos de auditabilidade, versionamento e tratamento de dados ausentes.

O resultado deve permitir que a implementação posterior seja pequena,
reversível e verificável. Esta task não implementa cálculo, backend, frontend,
view, migration, endpoint, menu ou teste automatizado.

## 2. Contexto da branch develop

O `/admin` atual possui oito abas no grupo **Indicadores** e três abas no grupo
**Operacional**. As cinco abas temáticas do censo já usam PostgreSQL; Perfil dos
Alunos e Resultados ainda usa Google Sheets; Gestão Financeira e Governança é um
placeholder cuja fonte futura será externa.

O frontend está componentizado em `web/src/components/admin/Aba*.tsx`.
`web/src/app/admin/page.tsx` concentra o tipo de aba, metadados, grupos do menu e
montagem dos componentes. Os tipos compartilhados estão em
`web/src/components/admin/shared/types.ts`, e o acesso HTTP usa
`apiFetch`, `getCached` e `allCached` de `shared/api.ts`.

No backend, todas as rotas analíticas ficam no grupo protegido por JWT em
`api/cmd/api/main.go`. Os endpoints PostgreSQL usam, como recorte predominante:

```txt
status = 'completed'
year = ano de referência, hoje normalmente o ano corrente
census_id IS NOT NULL
```

As migrations executadas no startup são os arquivos embarcados em
`api/cmd/api/migrations/`. Há uma segunda árvore em `infra/migrations/`. Na
auditoria, `0004` a `0013` estavam idênticas; `0001` a `0003` diferiam apenas em
comentários, não no SQL funcional. Mesmo assim, a duplicidade é um risco real
para qualquer solução que introduza nova lógica em view.

O universo operacional inclui escolas sem censo. Já as métricas analíticas de
conteúdo usam censos concluídos no ano. Para esta tela, recomenda-se preservar
ambas as ideias: listar todas as escolas cadastradas, mas calcular notas apenas
com o censo concluído do ano de referência. Escola sem dado elegível aparece
como `sem_dados`.

## 3. Documento metodológico incorporado

Foi incorporado como referência o documento
`METODOLOGIA_Indice_Saude_Operacional_por_Escola.md`, versão 1.0, de junho de
2026.

A metodologia define:

```txt
Resposta → pontos de 0 a 100
Pontos válidos → média da dimensão
Dimensões válidas → média ponderada
Criticidade = 100 − Saúde
```

As oito dimensões e seus pesos são:

| Dimensão | Peso |
|---|---:|
| Infraestrutura | 0,20 |
| Merenda | 0,15 |
| Segurança | 0,15 |
| Pessoal/RH | 0,12 |
| Tecnologia | 0,12 |
| Energia | 0,10 |
| Pedagógico | 0,08 |
| Governança | 0,08 |
| **Total** | **1,00** |

O documento metodológico contém exemplos de mapeamento, mas não fecha todas as
respostas possíveis de todos os campos. Antes da implementação, cada tabela
resposta→pontos precisa ser explicitada na versão da metodologia; respostas não
mapeadas não podem virar zero silenciosamente.

## 4. Nome final da tela

**Recomendação:** manter o nome completo:

```txt
Índice de Saúde Operacional por escola
```

O nome deixa claro que:

- é um índice composto;
- a unidade de análise é a escola;
- não se trata de um agregado por DRE nem de progresso de preenchimento.

No título da página, breadcrumb, documentação e payload metodológico, deve ser
usada exatamente essa forma.

## 5. Posicionamento recomendado no dashboard

**Grupo recomendado:** `Operacional`.

**Rótulo recomendado no menu lateral:** `Saúde Operacional`.

O rótulo reduzido evita uma entrada excessivamente longa na sidebar sem alterar
o nome oficial da tela. A página deve ficar como item próprio no grupo
Operacional, preferencialmente após `Operacional` e antes de `Todos os Censos`.

Não deve:

- entrar como aba temática em `Indicadores`;
- substituir `Todos os Censos`;
- ser incorporada a `Por DRE`;
- ser tratada como uma nova seção de Infraestrutura.

A tela combina várias áreas, apresenta uma linha por escola e serve à
priorização de intervenção. Portanto, sua função é transversal e operacional,
não a análise temática agregada que caracteriza o grupo Indicadores.

## 6. Modelo conceitual do índice

### 6.1 Mapeamento resposta → pontos

Cada campo categórico deve ter um mapa próprio e exato:

```txt
texto persistido no JSONB → *float64 entre 0 e 100
```

Regras:

- resposta ideal respondida pode valer `100`;
- pior caso explicitamente respondido pode valer `0`;
- branco, chave ausente, não aplicável, desconhecido ou texto não reconhecido
  valem `null`;
- acento, pontuação e grafia precisam casar com os valores reais do formulário;
- normalização defensiva pode remover espaços externos, mas não deve fundir
  categorias semanticamente diferentes;
- toda ocorrência não mapeada deve ser auditável por log/contador de qualidade,
  sem derrubar o endpoint.

### 6.2 Pontos → dimensão

A nota da dimensão é a média simples apenas dos itens válidos:

```txt
dimensão = soma(pontos não nulos) / quantidade(pontos não nulos)
```

Se nenhum item da dimensão for válido, a dimensão é `null`. Uma dimensão não
pode nascer como `0` apenas porque todos os seus campos estavam ausentes.

### 6.3 Dimensões → índice ponderado

```txt
Saúde = Σ(nota_dimensão × peso) / Σ(pesos das dimensões não nulas)
```

Os pesos devem ser armazenados como constantes da metodologia em Go e validados
por teste para somarem `1,00`. Quando uma dimensão for `null`, seu peso sai
simultaneamente do numerador e do denominador.

Se nenhuma dimensão for válida, `saude = null`. O arredondamento deve ocorrer
somente no resultado exposto, recomendado em uma casa decimal; os cálculos
intermediários devem manter precisão.

### 6.4 Criticidade

```txt
criticidade = 100 − saude
```

Se `saude` for `null`, `criticidade` também será `null`.

| Status | Regra |
|---|---|
| `saudavel` | `saude >= 70` |
| `atencao` | `50 <= saude < 70` |
| `critica` | `saude < 50` |
| `sem_dados` | `saude == null` |

Os limites devem pertencer à mesma versão da metodologia que pesos e mapas.

## 7. Dimensões previstas e viabilidade técnica

| Dimensão | Campos previstos | Fonte provável | Disponibilidade atual | Complexidade | Decisão recomendada |
|---|---|---|---|---|---|
| Infraestrutura | `situacao_estrutura`, `banheiros_vasos_funcionais`, `muro_cerca`, `estrutura_climatizacao`, `tipo_predio` | JSONB + `vw_censo_infraestrutura_seguranca` | Imediata; parte já usada por endpoints | Média | Habilitar na v1 após fechar todos os mapas |
| Energia | `rede_eletrica_atende`, `suporta_novos_equipamentos`, `energia` | JSONB + view de infra | Imediata; dois campos não estão no payload atual | Média | Habilitar na v1; validar escala de tipo de fornecimento |
| Merenda | `oferta_regular`, `qualidade_merenda`, `atende_necessidades`, `condicoes_cozinha`, `qtd_atende_necessidade_merenda` | JSONB + views `0009/0010` | Imediata | Média | Habilitar; usar o campo correto de suficiência da equipe |
| Segurança | `cameras_funcionamento`, `possui_guarita`, `possui_botao_panico`, `controle_portao`, `iluminacao_externa`, `qtd_atende_necessidade_portaria` | JSONB + views `0008/0012` | Imediata | Média | Habilitar; confirmar pontuação dos tipos de controle |
| Pessoal/RH | suficiência de merenda, serviços gerais e portaria; `possui_direcao`; `possui_coord_pedagogico` | JSONB + views `0003/0010/0011/0012` | Imediata | Média | Habilitar; confirmar dupla incidência de portaria/merenda |
| Tecnologia | `internet_disponivel`/`qualidade_internet`, `computadores_atendem`, `possui_projetor` | JSONB + `vw_censo_equipamentos_tecnologia` | Imediata | Média | Habilitar; internet explicitamente ausente deve pontuar 0 |
| Pedagógico | `taxa_abandono`, reprovação por etapa, IDEB por etapa | JSONB; aba atual usa Sheets | Campos locais existem, mas a fonte oficial do tema está pendente | Alta | Nascer `null` na primeira versão, salvo aprovação explícita do uso do censo |
| Governança | `regularizada_cee`, `conselho_escolar`, `conselho_ativo`, `execucao_prodep`, `pendencias_prodep` | JSONB; aba futura definida como externa | Campos locais existem, mas conflitam com a decisão de fonte da aba | Alta | Nascer `null` na primeira versão, salvo decisão explícita de produto |

Assim, **seis dimensões são tecnicamente viáveis de imediato**:
Infraestrutura, Energia, Merenda, Segurança, Pessoal/RH e Tecnologia.

Pedagógico e Governança não estão ausentes do formulário, mas dependem de uma
decisão de fonte e autoridade do dado. O diagnóstico recomenda não ativá-las
silenciosamente porque a matriz oficial reserva esses temas a fontes externas.
Quando as seis dimensões estiverem válidas e as outras duas nulas, o denominador
será `0,84`; a fórmula renormaliza os pesos válidos e nunca completa os `0,16`
restantes com nota zero.

## 8. Campos e views que precisam ser auditados

### 8.1 Infraestrutura

- **Campos:** `situacao_estrutura`, `banheiros_vasos_funcionais`, `muro_cerca`,
  `estrutura_climatizacao`, `tipo_predio`.
- **Formulário/JSONB:** Step Dados Gerais e Infraestrutura. As opções reais
  incluem pontuação e acentos relevantes, como `Não necessita de reforma.`,
  `Está em reforma, porém a obra está parada`, `Sim, muro`, `Sim, cerca`,
  `Não possui`, `Todos`, `Alguns`, `Nenhum`, `Próprio`, `Alugado`,
  `Compartilhado` e `Cedido`.
- **Views:** tipo de prédio, situação, muro e rede já aparecem em
  `vw_censo_base`; todos os campos previstos aparecem em
  `vw_censo_infraestrutura_seguranca`. `vw_censo_enriquecida` não acrescenta
  campo necessário ao cálculo desta dimensão.
- **Endpoints atuais:** `/infraestrutura/condicoes` usa tipo, situação e muro;
  `/infraestrutura/energia` usa `estrutura_climatizacao`.
  `banheiros_vasos_funcionais` ainda não é usado por endpoint analítico.
- **Reaproveitamento:** não exige nova view. A query do novo endpoint pode ler o
  JSONB diretamente, usando as views atuais como referência de nomes e recorte.
- **Fonte externa:** não.
- **Viabilidade:** imediata após fechar os mapas.
- **Quando usar `null`:** chave ausente, branco, valor legado não mapeado ou
  resposta não aplicável.
- **Riscos textuais:** o ponto final em `Não necessita de reforma.` é parte do
  valor atual; `estrutura_climatizacao` possui a opção semanticamente positiva
  `Não, todas as salas são climatizadas`, que não pode receber nota baixa por
  começar com “Não”. O schema ainda aceita um `Não` simples que não aparece no
  formulário atual e pode existir em dados antigos.
- **Decisões pendentes:** notas de `Sim, muro` versus `Sim, cerca`; notas de
  prédio alugado, compartilhado e cedido; notas de `Alguns`; tratamento do
  legado `estrutura_climatizacao = "Não"`.

### 8.2 Energia

- **Campos:** `rede_eletrica_atende`, `suporta_novos_equipamentos`, `energia`.
- **Formulário/JSONB:** Step Dados Gerais e Infraestrutura. Valores atuais:
  `Sim`, `Parcialmente`, `Não`; e, para fornecimento,
  `Concessionária de energia - Equatorial`, `Geração própria`, `Outro`.
- **Views:** `rede_eletrica_atende` está na base; os três campos estão em
  `vw_censo_infraestrutura_seguranca`.
- **Endpoints atuais:** `/infraestrutura/energia` expõe
  `rede_eletrica_atende`, mas não expõe `suporta_novos_equipamentos` nem
  `energia`.
- **Reaproveitamento:** nova query do endpoint; nenhuma view nova é necessária.
- **Fonte externa:** não.
- **Viabilidade:** imediata.
- **Quando usar `null`:** campo ausente, branco ou tipo de fornecimento não
  reconhecido.
- **Riscos textuais:** não inferir qualidade apenas por palavras como
  “própria”; `Outro` não informa confiabilidade.
- **Decisões pendentes:** pontuação oficial dos três tipos de fornecimento e se
  `Outro` deve ser `null` até existir detalhamento.

### 8.3 Merenda

- **Campos:** `oferta_regular`, `qualidade_merenda`, `atende_necessidades`,
  `condicoes_cozinha`, `qtd_atende_necessidade_merenda`.
- **Formulário/JSONB:** Step Merenda. Categorias: `Sim`, `Sim, com falhas`,
  `Não`; `Boa`, `Regular`, `Ruim`; `Sim`, `Parcialmente`, `Não`; cozinha
  `Boa`, `Regular`, `Precária`; equipe suficiente `Sim`/`Não`.
- **Views:** os três primeiros campos e a suficiência da equipe estão em
  `vw_censo_rh_merendeiras`; condições da cozinha estão em
  `vw_censo_equipamentos_merenda`.
- **Endpoints atuais:** `/merenda/oferta` usa os quatro campos finalísticos.
  O endpoint de Manipuladores de Alimentos documenta atendimento à necessidade,
  mas atualmente monta sua distribuição com `atende_necessidades`, e não com
  `qtd_atende_necessidade_merenda`. O índice não deve repetir essa ambiguidade.
- **Reaproveitamento:** nova query, sem view nova. Usar explicitamente
  `qtd_atende_necessidade_merenda` para “equipe suficiente”.
- **Fonte externa:** não para a metodologia proposta.
- **Viabilidade:** imediata.
- **Quando usar `null`:** equipe não informada, valor condicional ausente,
  branco ou categoria desconhecida.
- **Riscos textuais:** `atende_necessidades` mede a oferta/estrutura da merenda;
  `qtd_atende_necessidade_merenda` mede suficiência do quantitativo. Os nomes
  próximos podem gerar mapeamento incorreto.
- **Decisões pendentes:** pontos intermediários para `Sim, com falhas`,
  `Regular`, `Parcialmente` e `Precária`.

### 8.4 Segurança

- **Campos:** `cameras_funcionamento`, `possui_guarita`,
  `possui_botao_panico`, `controle_portao`, `iluminacao_externa`,
  `qtd_atende_necessidade_portaria`.
- **Formulário/JSONB:** câmeras em Dados Gerais; os demais campos no Step
  Portaria. Controle de portão usa `Manual`, `Fechadura`, `Eletrônica`;
  iluminação usa `Adequada`, `Regular`, `Insuficiente`.
- **Views:** os cinco primeiros campos estão em
  `vw_censo_infraestrutura_seguranca`; suficiência da portaria está em
  `vw_censo_servicos_terceirizados`.
- **Endpoints atuais:** `/infraestrutura/seguranca` usa os cinco primeiros;
  `/servicos-terceirizados/portaria` não expõe a suficiência declarada.
- **Reaproveitamento:** nova query, sem view nova.
- **Fonte externa:** não.
- **Viabilidade:** imediata.
- **Quando usar `null`:** branco, chave ausente ou valor fora do vocabulário.
- **Riscos textuais:** o endpoint atual considera qualquer controle de portão
  informado como presença; o índice precisa decidir se Manual, Fechadura e
  Eletrônica têm notas diferentes. Não usar `IS NOT NULL` como pontuação.
- **Decisões pendentes:** escala dos três controles de portão e confirmação de
  que suficiência de portaria deve entrar também em Pessoal/RH.

### 8.5 Pessoal/RH

- **Campos:** `qtd_atende_necessidade_merenda`,
  `qtd_atende_necessidade_sg`, `qtd_atende_necessidade_portaria`,
  `possui_direcao`, `possui_coord_pedagogico`.
- **Formulário/JSONB:** Steps Merenda, Serviços Gerais, Portaria e Servidores.
  Todos são `Sim`/`Não`, mas os três primeiros são condicionais/opcionais.
- **Views:** `vw_censo_rh_merendeiras`, `vw_censo_rh_servicos_gerais`,
  `vw_censo_servicos_terceirizados` e `vw_censo_direcao_escolar`.
- **Endpoints atuais:** estrutura de gestão usa direção e coordenação;
  os endpoints de serviços não expõem de forma consistente as três respostas de
  suficiência. A distribuição de Manipuladores usa hoje o campo de adequação da
  merenda, não o campo de quantitativo.
- **Reaproveitamento:** nova query única sobre o JSONB é preferível a juntar
  quatro views para compor uma linha.
- **Fonte externa:** não.
- **Viabilidade:** imediata.
- **Quando usar `null`:** serviço não aplicável, resposta condicional não
  preenchida, branco ou chave ausente.
- **Riscos textuais:** views/handlers agregados podem tratar ausência como “não”
  no denominador; o cálculo por escola deve preservar ausência. Campos
  condicionais não podem receber zero apenas porque não foram renderizados.
- **Decisões pendentes:** confirmar a repetição intencional de suficiência de
  merenda e portaria em mais de uma dimensão; decidir se “tem direção” significa
  somente `possui_direcao` ou exige alguma composição mínima.

### 8.6 Tecnologia

- **Campos:** `internet_disponivel`, `qualidade_internet`,
  `computadores_atendem`, `possui_projetor`.
- **Formulário/JSONB:** Step Tecnologia. A qualidade só é perguntada quando
  `internet_disponivel = "Sim"`.
- **Views:** todos estão em `vw_censo_equipamentos_tecnologia`; os campos
  booleanos são derivados de texto.
- **Endpoints atuais:** `/tecnologia/infraestrutura` usa disponibilidade,
  qualidade e atendimento; `/tecnologia/uso-pedagogico` usa projetor.
- **Reaproveitamento:** nova query, sem view nova.
- **Fonte externa:** não.
- **Viabilidade:** imediata, com regra condicional explícita.
- **Quando usar `null`:** `internet_disponivel` ausente; internet disponível
  com qualidade em branco/desconhecida; demais campos ausentes.
- **Riscos textuais:** quando a escola responde que não tem internet,
  `qualidade_internet` fica ausente. A metodologia, porém, atribui zero a
  internet indisponível. Portanto, `internet_disponivel = "Não"` deve produzir
  zero no item de qualidade/conectividade; não deve virar `null`. As opções
  reais são frases longas e precisam de mapa literal.
- **Decisões pendentes:** confirmar se disponibilidade e qualidade formam um
  único item condicional ou dois itens separados. Recomenda-se um único item
  para não dar peso duplo à internet.

### 8.7 Pedagógico

- **Campos:** `taxa_abandono`, `taxa_reprovacao_fund1`,
  `taxa_reprovacao_fund2`, `taxa_reprovacao_medio`,
  `ideb_anos_iniciais`, `ideb_anos_finais`, `ideb_ensino_medio`.
- **Formulário/JSONB:** Step Perfil dos Alunos. Campos de etapa são exibidos de
  acordo com `etapas_ofertadas`.
- **Views:** nenhuma migration atual materializa reprovação ou IDEB, embora o
  inventário tenha proposto `vw_censo_reprovacao_etapa` e
  `vw_censo_ideb_etapa`. Os campos não estão em `vw_censo_base` nem na
  enriquecida.
- **Endpoints atuais:** a aba Perfil dos Alunos usa
  `/v1/admin/indicadores-metrics`, alimentado por Sheets; os campos PostgreSQL
  por escola não são usados por endpoint analítico atual.
- **Reaproveitamento:** tecnicamente, o cálculo em Go pode ler o JSONB sem nova
  view. Institucionalmente, a fonte precisa ser aprovada.
- **Fonte externa:** a matriz atual prevê planilha/base externa para a futura
  remodelagem do tema. O JSONB contém autodeclarações que podem ser usadas
  somente se produto assumir explicitamente essa fonte para o índice.
- **Viabilidade:** parser e fórmula são implementáveis, mas a dimensão não está
  pronta para ativação oficial.
- **Quando usar `null`:** recomendação inicial é dimensão inteira `null`.
  Quando habilitada, etapas não ofertadas, IDEB zero/branco e valores inválidos
  também serão `null`.
- **Riscos textuais/numéricos:** o formulário inicializa campos com zero. Para
  reprovação, zero pode significar taxa real perfeita ou etapa não ofertada.
  A aplicabilidade deve usar `etapas_ofertadas`, nunca apenas o valor numérico.
- **Decisões pendentes:** fonte oficial; precedência entre JSONB e base externa;
  agrupamento das três reprovações e dos três IDEBs; ano de referência do IDEB;
  tratamento de taxa zero em campo não aplicável.

### 8.8 Governança

- **Campos:** `regularizada_cee`, `conselho_escolar`, `conselho_ativo`,
  `execucao_prodep`, `pendencias_prodep`.
- **Formulário/JSONB:** Step Gestão. Execução e pendências só aparecem quando
  `recursos_prodep = "Sim"`.
- **Views:** os campos da metodologia não estão em view analítica própria.
  `plano_evacuacao` e `politica_bullying`, que pertencem ao mesmo Step, aparecem
  na view de infraestrutura, mas não compõem a dimensão metodológica proposta.
- **Endpoints atuais:** nenhum. A aba Gestão Financeira e Governança é
  placeholder sem fetch.
- **Reaproveitamento:** tecnicamente pode ler JSONB; não exige view. A fonte
  institucional precisa ser decidida antes.
- **Fonte externa:** a matriz oficial determina uma base externa validada pelas
  coordenações responsáveis para essa área.
- **Viabilidade:** tecnicamente possível, mas bloqueada para ativação.
- **Quando usar `null`:** recomendação inicial é dimensão inteira `null`.
  Futuramente, ausência de recursos PRODEP deve tornar execução e pendências
  não aplicáveis, não automaticamente boas ou ruins.
- **Riscos textuais:** `pendencias_prodep = "Não"` é a melhor resposta, enquanto
  vários outros campos usam “Sim” como melhor resposta. `Não sabe informar`
  deve ser `null`. Regras condicionais precisam considerar `recursos_prodep`.
- **Decisões pendentes:** fonte oficial; efeito de não recebimento de PRODEP;
  pontuação de execução parcial e pendência em regularização; se os campos
  autodeclarados do censo podem coexistir com a base externa.

### 8.9 Query-base recomendada

Para o primeiro endpoint, não é necessário criar uma view consolidada. Uma
query parametrizada pode partir de `schools` e selecionar o censo concluído do
ano:

```sql
SELECT
  s.id,
  s.codigo_inep,
  s.nome_escola,
  s.municipio,
  s.dre,
  s.zona,
  cr.id,
  cr.data
FROM schools s
LEFT JOIN census_responses cr
  ON cr.school_id = s.id
 AND cr.year = $1
 AND cr.status = 'completed'
ORDER BY s.nome_escola;
```

A restrição única `(school_id, year)` evita múltiplos censos no mesmo ano. Essa
query inclui escolas sem censo e evita juntar várias views temáticas apenas para
recompor o JSON original.

## 9. Tratamento de null, zero, branco e não aplicável

Regras obrigatórias em toda a cadeia:

1. `null` não é zero.
2. `0` significa pior caso explicitamente respondido ou resultado legítimo de
   fórmula.
3. `null` significa ausência, não aplicável, indisponível ou não reconhecido.
4. Item `null` sai da média da dimensão.
5. Dimensão `null` sai do denominador ponderado.
6. Sem dimensão válida, `saude` e `criticidade` são `null`.
7. Nenhuma função pode dividir por zero ou produzir `NaN`/`Infinity`.
8. Branco e chave ausente nunca derrubam a nota da escola.
9. Texto desconhecido nunca vira zero automaticamente.
10. No frontend, testar `valor === null`, não usar truthiness:

```ts
valor === null ? "—" : valor.toLocaleString("pt-BR")
```

Assim, `0` aparece como `0`, enquanto somente `null` aparece como `—`.

Em Go, recomenda-se representar notas opcionais com ponteiros (`*float64`) ou
tipo nullable explícito. Os campos JSON não devem usar `omitempty`, pois o
cliente precisa receber `null` para distinguir indisponibilidade.

## 10. Tratamento de indicadores numéricos

Não deve existir um parser universal que trate todo ponto como decimal ou
milhar. O parser precisa conhecer o tipo do campo.

### Números inteiros

- aceitar JSON numérico ou string sem ruído;
- aceitar milhar pt-BR como `1.234` quando o campo for conceitualmente inteiro;
- rejeitar negativos e frações em contagens;
- não arredondar automaticamente dados legados fracionários;
- `total_alunos` e `qtd_salas_aula` fracionários devem virar `null` no novo
  payload e gerar evidência de qualidade, não correção silenciosa.

### Decimais

- `3,4` → `3.4`;
- `1.234,56` → `1234.56`;
- quando houver apenas ponto em campo decimal persistido, tratá-lo como
  separador decimal (`3.4`);
- remover espaços normais e não separáveis;
- exigir consumo completo da string; não aceitar parser que leia apenas o
  prefixo numérico de um texto inválido.

### Percentuais

- aceitar sufixo `%` após `TrimSpace`;
- faixa válida recomendada: `0` a `100`;
- valor fora da faixa deve ser `null` e registrado como problema de qualidade;
- abandono:

```txt
pontos = max(0, 100 − abandono × 8)
```

- reprovação por etapa:

```txt
pontos = max(0, 100 − reprovação × 6)
```

Taxa zero é válida quando a pergunta se aplica. Para campos por etapa, a
aplicabilidade deve ser decidida por `etapas_ofertadas`.

### IDEB

- aceitar decimal com vírgula ou ponto;
- vazio e zero são `null`;
- valor negativo ou superior ao domínio oficial esperado deve ser `null` e
  auditado;
- fórmula:

```txt
pontos = min(100, IDEB / 6 × 100)
```

O teto metodológico em 6,0 não deve esconder um valor impossível de origem.
Primeiro validar o domínio; depois aplicar a fórmula.

### Ambiguidades que exigem decisão

- `1.234` significa milhar para contagem e decimal para indicador;
- reprovação `0` pode ser legítima ou default de etapa não ofertada;
- IDEB zero é não aplicável, não desempenho mínimo;
- o formulário atual transforma strings válidas em número antes de persistir,
  mas dados históricos podem manter strings e separadores diferentes.

## 11. Estratégia de cálculo

### 11.1 Opção A — Go

**Vantagens**

- preserva `null` com funções pequenas e legíveis;
- permite mapas literais separados por pergunta;
- facilita testes de extremos, desconhecidos, acentos e condicionais;
- evita uma view longa com dezenas de `CASE WHEN`;
- permite incluir nome, versão, pesos e status no mesmo contrato;
- não exige migration no primeiro PR;
- é adequada a uma query por escola que retorna o JSONB bruto.

**Riscos**

- mapas hardcoded podem divergir do formulário se não houver inventário e
  testes;
- alterações futuras recalculam o índice dinamicamente, exigindo versionamento;
- leitura de `map[string]any` sem helpers tipados pode degradar a manutenção.

**Testabilidade**

Alta. Recomenda-se separar:

```txt
parseNumeric
scoreCategorical
meanValid
weightedMeanValid
classifyHealth
calculateSchoolHealth
```

Os mapas devem ficar próximos da constante de versão, com testes table-driven.

### 11.2 Opção B — SQL/view

**Vantagens**

- cálculo consultável diretamente no banco;
- bom desempenho para filtros e ordenação;
- centraliza o valor para outros consumidores SQL.

**Riscos**

- muitos `CASE WHEN` tornam mapeamentos textuais extensos e difíceis de testar;
- preservar `null` em todas as etapas exige disciplina;
- qualquer mudança em peso ou mapa altera retroativamente todos os resultados;
- aumenta a dependência entre views temáticas;
- a lógica precisaria ser mantida nas árvores
  `api/cmd/api/migrations` e `infra/migrations`.

Hoje não há divergência funcional entre os pares auditados, mas já existem
diferenças documentais em `0001` a `0003`. Uma nova view grande ampliaria o risco
de drift. Para o primeiro ciclo, o ganho não compensa.

### 11.3 Opção C — configuração parametrizável

Pesos, faixas e respostas poderiam evoluir para tabelas como:

```txt
health_methodologies
health_dimension_weights
health_answer_scores
```

com versão, vigência e autoria. Essa solução melhora governança e permite
alteração sem deploy, mas exige:

- validação de integridade;
- controle de acesso;
- publicação atômica de versões;
- interface ou processo operacional;
- proteção contra configuração incompleta.

É evolução adequada após a metodologia v1 ser validada, não requisito do
primeiro PR.

### 11.4 Recomendação

**Usar cálculo em Go no primeiro ciclo**, com:

- mapeamentos hardcoded e explícitos;
- funções pequenas e puras;
- testes unitários table-driven;
- query parametrizada única;
- nenhuma migration;
- versão semântica da metodologia, por exemplo `1.0.0`;
- pesos e limites de status pertencendo à mesma versão;
- Pedagógico e Governança `null` até aprovação de fonte.

Qualquer mudança em peso, fórmula, mapa, regra de `null`, limite de status ou
arredondamento deve incrementar a versão e atualizar um changelog metodológico.

## 12. Endpoint recomendado

**Recomendação:**

```txt
GET /v1/admin/analytics/escolas/saude-operacional
```

Justificativa:

- `escolas` explicita a granularidade;
- `saude-operacional` coincide com o conceito do produto;
- o caminho deixa espaço para outros endpoints escola a escola;
- não confunde o recurso com um agregado.

Alternativas rejeitadas:

| Endpoint | Problema |
|---|---|
| `/escolas/base-completa` | Genérico demais; sugere exposição ampla de dados brutos e não comunica a metodologia |
| `/escolas/indice-operacional` | “Índice operacional” é mais ambíguo e não coincide com o nome oficial |

O endpoint deve ser registrado no grupo JWT protegido. Recomenda-se aceitar
`?year=` desde o primeiro backend, com fallback para o ano corrente e parâmetro
SQL `$1`. Filtros por `dre`, `municipio` e `zona` podem ser adicionados no mesmo
contrato se houver uso imediato, sempre parametrizados.

Universo recomendado:

- uma linha por escola cadastrada;
- dados e notas vindos somente do censo `completed` do ano selecionado;
- escola sem censo concluído permanece na lista com `census_id = null`,
  dimensões nulas e `status = "sem_dados"`.

## 13. Payload recomendado

Recomenda-se incluir `metodologia` já no primeiro endpoint. O custo é pequeno,
evita peso/versão duplicados no frontend e torna cada resposta autoexplicativa.
O payload não precisa incluir todas as tabelas resposta→pontos; elas permanecem
na documentação e no código versionado.

Também é recomendável acrescentar `ano_referencia` no topo:

```ts
{
  total_escolas: number;
  ano_referencia: number;
  metodologia: {
    nome: "Índice de Saúde Operacional por escola";
    versao: string;
    dimensoes_habilitadas: Array<
      | "infraestrutura"
      | "energia"
      | "merenda"
      | "seguranca"
      | "pessoal"
      | "tecnologia"
      | "pedagogico"
      | "governanca"
    >;
    pesos: {
      infraestrutura: number;
      energia: number;
      merenda: number;
      seguranca: number;
      pessoal: number;
      tecnologia: number;
      pedagogico: number;
      governanca: number;
    };
  };
  escolas: Array<{
    school_id: number;
    census_id: number | null;
    codigo_inep: string | null;
    escola: string;
    municipio: string;
    dre: string;
    zona: string | null;

    total_alunos: number | null;
    salas_aula: number | null;
    alunos_por_sala: number | null;

    saude: number | null;
    criticidade: number | null;
    status: "saudavel" | "atencao" | "critica" | "sem_dados";

    dimensoes: {
      infraestrutura: number | null;
      energia: number | null;
      merenda: number | null;
      seguranca: number | null;
      pessoal: number | null;
      tecnologia: number | null;
      pedagogico: number | null;
      governanca: number | null;
    };
  }>;
}
```

`alunos_por_sala` deve ser `null` quando alunos ou salas forem `null`, quando
salas for zero, ou quando alguma contagem for inválida. Não usar zero como
fallback do denominador.

No primeiro ciclo, Pedagógico e Governança podem constar explicitamente como
`null`; o peso de ambas sai do denominador. Isso mantém o contrato estável para
ativação posterior. `dimensoes_habilitadas` deve listar as seis dimensões
efetivamente autorizadas na versão, sem retirar do objeto `pesos` as dimensões
previstas pela metodologia.

## 14. Proposta de frontend

Componente recomendado:

```txt
web/src/components/admin/AbaSaudeOperacionalEscolas.tsx
```

Alterações futuras esperadas:

- `web/src/app/admin/page.tsx`
  - importar o componente;
  - adicionar a aba ao union type;
  - usar o título completo em `PAGE_META`;
  - adicionar `Saúde Operacional` a `NAV_OPERACIONAL`;
  - montar a nova aba sem alterar as existentes.
- `web/src/components/admin/shared/types.ts`
  - adicionar tipos do payload e do status.
- `web/src/components/admin/shared/api.ts`
  - reutilizar `apiFetch` e cache;
  - não incluir inicialmente o endpoint no prefetch global, pois a resposta terá
    mais de 800 linhas e pode atrasar o login. Preferir fetch lazy no primeiro
    acesso, já beneficiado pelo cache.

Componentes/padrões reutilizáveis:

- `apiFetch`, `getCached`, `allCached`;
- cards brancos, cabeçalhos e estados de loading das abas atuais;
- tabela responsiva de `CensusTable` como referência visual;
- `StatCard`, caso sejam adicionados contadores sintéticos no refinamento;
- paleta institucional e padrões de erro.

`Donut` e `HBarChart` não são necessários para a primeira tabela. A barra de
saúde, o farol e os badges de dimensão têm semântica própria e devem nascer como
componentes locais pequenos no arquivo da aba. Só devem migrar para `shared/`
se outro consumidor real surgir.

`StatusPill` atual é específico de `completed`/`draft`; não deve ser reutilizado
sem generalização explícita.

## 15. Ordenação, busca e comportamento da tabela

Regras recomendadas:

- uma linha por escola;
- abertura por `criticidade` decrescente;
- linhas com criticidade `null` depois das linhas pontuadas;
- desempate estável por nome da escola;
- clique no cabeçalho alterna ascendente/descendente;
- valores `null` sempre ficam ao final, independentemente do sentido, para não
  esconder escolas críticas atrás das sem dados;
- busca única por escola, município ou DRE;
- busca sem diferenciação de maiúsculas/minúsculas e, preferencialmente,
  diacríticos;
- contador `Exibindo X de Y escolas`;
- DRE em chip/pill;
- números alinhados com `tabular-nums`;
- saúde como barra + valor;
- dimensões como badges 0–100;
- crítico com borda lateral ou fundo sutil vermelho;
- tabela com `overflow-x-auto`, pois haverá muitas colunas;
- `null` como `—`; zero como `0`.

A criticidade pode ser exibida explicitamente em coluna ou apenas representada
pela ordenação e pelo farol. Para auditabilidade, recomenda-se coluna explícita
na primeira versão, ainda que compacta.

## 16. Validação e auditoria do índice

Antes da ativação:

1. Levantar frequências reais de cada campo categórico no banco de homologação.
2. Comparar cada valor encontrado com o mapa versionado.
3. Registrar valores não reconhecidos e cobertura por dimensão.
4. Selecionar amostra de escolas com perfis ideal, intermediário, crítico e
   incompleto.
5. Recalcular manualmente a amostra em planilha de validação.
6. Comparar nota por item, dimensão, índice, criticidade e status.
7. Validar o universo: total do payload deve coincidir com `COUNT(*) FROM schools`.
8. Validar que somente censo concluído do ano escolhido alimenta notas.
9. Registrar a versão da metodologia junto ao resultado de homologação.

Não existe fonte Sheets equivalente para paridade direta do índice, pois ele é
novo. A validação deve ser por casos dourados, amostra manual e auditoria dos
campos de origem.

Métricas de qualidade recomendadas para a homologação, mesmo que não entrem no
payload público:

- quantidade de respostas não mapeadas por campo;
- quantidade de escolas sem cada dimensão;
- distribuição de número de dimensões válidas por escola;
- mínimo, máximo, média e percentis do índice;
- quantidade de `sem_dados`;
- quantidade de contagens numéricas rejeitadas.

## 17. Testes recomendados

### Backend unitário

- cada resposta categórica conhecida;
- acentos, pontuação e espaços externos;
- branco, chave ausente e texto desconhecido;
- `0` preservado;
- média de dimensão com valores mistos e nulos;
- média ponderada com todas, algumas e nenhuma dimensão;
- pesos somando `1,00`;
- classificação nos limites `49,9`, `50`, `69,9`, `70`;
- criticidade complementar;
- parser de inteiro, decimal, milhar, percentual e IDEB;
- rejeição de `NaN`, infinito, negativo e faixa impossível;
- internet ausente explicitamente respondida como `Não` valendo zero;
- IDEB zero valendo `null`;
- etapa não ofertada removida da dimensão pedagógica.

### Casos extremos

- todas as respostas ideais → saúde `100`, criticidade `0`;
- todas as respostas de pior caso → saúde `0`, criticidade `100`;
- todas ausentes → saúde/criticidade `null`, `sem_dados`;
- somente uma dimensão válida → saúde igual àquela dimensão;
- dimensão válida com nota zero → índice zero, não `null`;
- campo desconhecido em uma pergunta → pergunta ignorada, endpoint continua.

### Handler/integração

- rota exige JWT;
- `year` inválido retorna erro de entrada;
- escolas sem censo aparecem;
- rascunho não alimenta cálculo;
- payload serializa `null` explicitamente;
- ordenação do backend é determinística, mesmo que o frontend reordene.

### Frontend

- zero renderiza `0`;
- nulo renderiza `—`;
- busca e ordenação;
- criticidade decrescente inicial;
- limites visuais do farol;
- erro e loading;
- tabela em viewport estreito.

## 18. Riscos técnicos

| Risco | Impacto | Mitigação |
|---|---|---|
| Mapas incompletos ou grafia divergente | Dimensão fica artificialmente nula | Inventário de frequências + mapas literais testados |
| Tratar ausência como `false`/zero | Penalização indevida | Ler JSONB e usar tipos nullable |
| Campos condicionais com default zero | Confusão entre não aplicável e resposta real | Usar campos de aplicabilidade, como etapas e respostas-pai |
| Pedagógico/Governança com fonte não aprovada | Índice institucionalmente inconsistente | Nascer `null` e ativar por nova versão |
| Mesmo campo em duas dimensões | Peso efetivo maior que o declarado | Decisão de produto documentada |
| Alterar mapas sem versão | Resultados históricos irreproduzíveis | SemVer + changelog + metadata no payload |
| Recalcular histórico dinamicamente | Nota antiga muda após deploy | Versão explícita; snapshots futuros se necessário |
| Duplicidade de migrations | Drift entre runtime e infra | Evitar migration no primeiro PR; automatizar comparação futura |
| Contagens legadas fracionárias | Métricas alunos/sala inconsistentes | Rejeitar fração, expor `null`, auditar sem corrigir em massa |
| Payload com 800+ linhas no prefetch | Login mais lento | Fetch lazy e cache por aba |
| Tabela com muitas colunas | Baixa legibilidade | Scroll horizontal, cabeçalhos compactos e colunas fixas seletivas |
| Ano implícito | Comparação temporal ambígua | `ano_referencia` no payload e `?year=` parametrizado |

## 19. Decisões de produto pendentes

Antes do PR de backend, fechar:

1. mapa completo de pontos para cada resposta categórica;
2. fonte oficial de Pedagógico;
3. fonte oficial de Governança;
4. se Pedagógico/Governança ficam nulos na versão `1.0.0`;
5. se suficiência de portaria e merenda pode incidir em duas dimensões;
6. pontuação dos tipos de prédio;
7. pontuação dos tipos de fornecimento de energia;
8. pontuação dos controles de portão;
9. se internet é um item condicional único ou disponibilidade + qualidade;
10. como agrupar reprovação e IDEB por etapa;
11. regra de não recebimento de PRODEP;
12. ano padrão e possibilidade de consultar anos anteriores;
13. se a coluna Criticidade será visível ou apenas implícita;
14. número de casas decimais exibidas;
15. se todas as escolas cadastradas ou apenas concluídas entram na tabela.

Este diagnóstico recomenda todas as escolas cadastradas, seis dimensões locais
ativas, duas dimensões nulas, uma casa decimal e criticidade explícita.

## 20. Fatiamento em PRs

### PR 1 — Diagnóstico documental

Criar este diagnóstico, sem código funcional.

### PR 2 — Backend do Índice de Saúde Operacional

- criar arquivo dedicado, por exemplo
  `api/cmd/api/analytics_saude_operacional.go`;
- implementar parser, mapas, médias e classificação;
- consultar escolas + JSONB concluído do ano;
- registrar `GET /v1/admin/analytics/escolas/saude-operacional`;
- retornar payload versionado;
- habilitar as seis dimensões locais;
- manter Pedagógico e Governança como `null`;
- adicionar testes unitários e de handler;
- não criar migration.

### PR 3 — Frontend da tela Saúde Operacional

- criar `AbaSaudeOperacionalEscolas.tsx`;
- adicionar tipos compartilhados;
- incluir a aba no grupo Operacional com rótulo reduzido;
- implementar tabela, busca, ordenação, farol, barra e badges;
- fetch lazy com cache;
- preservar todas as telas existentes.

### PR 4 — Refinamentos e validação com gestão

- validar amostra e extremos com a gestão;
- adicionar tooltips metodológicos;
- ajustar mapas, pesos ou limites somente com nova versão;
- avaliar filtros avançados e exportação;
- decidir e, se aprovado, ativar Pedagógico/Governança;
- produzir nota final de validação.

Se as fontes externas forem aprovadas depois, a ativação de Pedagógico e
Governança deve ser um PR separado dentro do ciclo 4, não um ajuste silencioso.

## 21. Menor PR implementável

O menor PR funcional posterior a este diagnóstico é um **backend isolado**, sem
frontend e sem migration, contendo:

1. query por escolas e censo concluído do ano;
2. serviço Go versionado;
3. seis dimensões locais;
4. Pedagógico/Governança nulos;
5. endpoint protegido;
6. payload completo;
7. testes dos extremos, `null` e mapas.

Essa fatia já é consumível e auditável, não altera o menu e permite validar
números antes de expor a tela à gestão.

## 22. Fora de escopo

Nesta task não serão implementados:

```txt
backend
frontend
endpoint
view
migration
menu
componentes
cálculo real
testes automatizados
dados fake
correção de dados legados
integração com fonte externa
alteração do formulário
```

Também permanecem fora de escopo:

- mudar telas existentes;
- remover endpoints atuais;
- inferir valores de imagem de referência;
- corrigir automaticamente `total_alunos`;
- alterar a metodologia sem justificativa e nova versão;
- criar tabela parametrizável no primeiro ciclo.

## 23. Conclusão

| Pergunta | Resposta |
|---|---|
| Nome final | **Índice de Saúde Operacional por escola** |
| Rótulo no menu | **Saúde Operacional** |
| Grupo | **Operacional** |
| Endpoint | `GET /v1/admin/analytics/escolas/saude-operacional` |
| Estratégia | Go, mapas hardcoded, funções pequenas, testes e versão explícita |
| Dimensões imediatas | Infraestrutura, Energia, Merenda, Segurança, Pessoal/RH e Tecnologia |
| Dimensões dependentes de decisão/fonte externa | Pedagógico e Governança |
| Dimensão indisponível | `null`, fora do denominador, exibida como `—` |
| Versionamento | SemVer no código e payload; qualquer mudança metodológica incrementa a versão |
| Validação de extremos | Casos ideais, piores, todos nulos, uma dimensão válida e zero legítimo |
| Prevenção de `NaN` | Médias retornam `null` quando o denominador é zero; valores não finitos são rejeitados |
| Garantia de `null` ≠ zero | Tipos nullable no Go e teste explícito `valor === null` no frontend |
| Menor PR seguinte | Backend isolado, seis dimensões, endpoint e testes, sem migration/frontend |

A tela deve nascer como uma visão operacional transversal, escola a escola, com
metodologia transparente no próprio payload. O repositório já contém os campos
necessários para seis dimensões e não precisa de nova view no primeiro ciclo. A
principal condição de segurança é não confundir disponibilidade técnica de
campos com aprovação institucional da fonte: por isso Pedagógico e Governança
devem permanecer nulos até decisão explícita.
