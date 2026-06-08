# Metodologia — Índice de Saúde Operacional por Escola & Tela "Índice de Saúde Operacional por escola"

> Documento de referência para implementar e replicar a lógica do dashboard do Censo Operacional (FADEP × SEDUC-PA) em outros estudos.
> Cobre dois blocos: **(1)** a construção do Índice de Saúde Operacional e **(2)** a engenharia da tela de base completa por escola.
> Versão 1.0 · Jun/2026.

---

## Parte 1 — Índice de Saúde Operacional

### 1.1 Conceito

O Índice de Saúde Operacional é uma **nota de 0 a 100 por escola** (quanto maior, melhor), obtida pela combinação ponderada de **8 dimensões temáticas**. Cada dimensão é, por sua vez, a média de várias perguntas do censo, depois de cada resposta ser convertida em pontos.

A lógica tem três camadas:

```txt
Resposta do formulário  →  pontos (0–100)      [camada de mapeamento]
média das perguntas     →  nota da dimensão    [camada de dimensão]
média ponderada das 8   →  Saúde Operacional   [camada de índice]
```

O espelho do índice é a **Criticidade**, definida simplesmente como:

```txt
Criticidade = 100 − Saúde
```

A criticidade é a mesma informação vista pelo lado do problema, usada nos rankings e na matriz de priorização.

### 1.2 Camada 1 — Mapeamento de respostas para pontos

Cada pergunta categórica recebe uma **tabela de conversão** que traduz o texto da resposta em uma nota de 0 a 100. A régua segue uma escala semântica única em toda a rede:

| Faixa | Significado | Exemplos de resposta |
|------:|-------------|----------------------|
| **100** | Situação ideal / plena | "Sim", "Boa", "Todos", "Adequada", "Próprio" |
| **70–90** | Bom, com ressalvas leves | "Foi reformada recentemente", "Sim, cerca" |
| **45–65** | Parcial / regular | "Parcialmente", "Regular", "Necessita de reforma parcial" |
| **10–30** | Ruim / crítico | "Precária", "Insuficiente", "Necessita de reforma geral" |
| **0** | Ausência total / pior caso | "Não", "Nenhum", "Não possui" |
| **null** | Resposta neutra / não aplicável | "Não se aplica", "Não sei avaliar", campo em branco |

Regras de ouro do mapeamento:

- **Sempre que o texto da resposta tiver acento, a chave da tabela tem que ter o acento idêntico** ao da planilha/base. Qualquer diferença de acento, espaço ou maiúscula pode impedir o casamento da resposta e gerar `null`.
- **Resposta em branco vira `null`, não vira 0.** Zero significa "respondeu o pior caso"; `null` significa "não temos o dado".
- **`null` é excluído da média**, não conta como nota.

Exemplos de mapeamento:

```txt
Situação da estrutura:
  Não necessita de reforma. ............................ 100
  Foi reformada recentemente ...........................  90
  Reforma em andamento .................................  62
  Necessita de reforma parcial (melhoria pontual) ......  45
  Está em reforma, porém a obra está parada ............  30
  Necessita de reforma geral ...........................  12

Câmeras em funcionamento:
  Sim, funcionando plenamente .......................... 100
  Sim, parcialmente ....................................  50
  Não possui ...........................................   0

Qualidade da internet:
  Estável, atende plenamente ........................... 100
  Velocidade aceitável, com oscilações .................  62
  Lentidão frequente, compromete atividades ............  28
  Não funciona / indisponível ..........................   0
  Não se aplica / Não sei avaliar ...................... null

Sim/Não genérico:
  Sim .................................................. 100
  Não ..................................................   0
```

### 1.3 Camada 2 — Dimensões e o que cada uma agrega

Cada dimensão é a **média simples** dos pontos das perguntas que a compõem, ignorando valores `null`.

| Dimensão | Perguntas que entram na média |
|----------|-------------------------------|
| **Infraestrutura** | situação da estrutura · vasos sanitários funcionais · muro/cerca · capacidade de climatizar salas · tipo de prédio |
| **Energia** | rede elétrica atende a demanda · suporta novos equipamentos · tipo de fornecimento |
| **Merenda** | regularidade da oferta · qualidade · atende às necessidades · condições da cozinha · equipe suficiente |
| **Segurança** | câmeras · guarita · botão de pânico · controle de portão · iluminação externa · portaria suficiente |
| **Pessoal/RH** | merendeiras/manipuladores suficientes · serviços gerais suficientes · portaria suficiente · tem direção · tem coordenador pedagógico |
| **Tecnologia** | qualidade da internet · computadores atendem · tem projetor |
| **Pedagógico** | taxa de abandono · reprovação (FI/FII/EM) · IDEB calculado |
| **Governança** | regularização CEE/PA · conselho constituído · conselho ativo · execução PRODEP · pendências de prestação de contas |

### 1.4 Camada 3 — Pesos e fórmula do índice

A nota final é a **média ponderada** das dimensões que têm valor. Dimensão `null` é excluída do numerador e seu peso sai do denominador.

```txt
Saúde = Σ (nota_dimensão × peso) / Σ (peso das dimensões válidas)
```

Pesos adotados:

| Dimensão | Peso |
|----------|-----:|
| Infraestrutura | 0,20 |
| Merenda | 0,15 |
| Segurança | 0,15 |
| Pessoal/RH | 0,12 |
| Tecnologia | 0,12 |
| Energia | 0,10 |
| Pedagógico | 0,08 |
| Governança | 0,08 |
| **Total** | **1,00** |

O critério de peso foi dar mais peso ao que é estrutural, caro de corrigir e impacta diretamente o funcionamento físico da escola: infraestrutura, merenda e segurança. Indicadores de resultado ou conformidade entram com peso menor: pedagógico e governança.

Esses pesos são **parâmetros editáveis**. Mudar os pesos é a forma legítima de adaptar o índice à prioridade de cada estudo.

### 1.5 Tratamentos especiais — indicadores numéricos

Perguntas numéricas precisam ser convertidas para escala 0–100 antes de entrar no índice:

- **Taxa de abandono:** `pontos = max(0, 100 − abandono% × 8)`. Cada 1% de abandono tira 8 pontos; 12,5% ou mais zera.
- **Reprovação:** `pontos = max(0, 100 − reprovação% × 6)`.
- **IDEB:** `pontos = min(100, IDEB / 6 × 100)`, tomando 6,0 como referência de excelência.
- **IDEB = 0 ou em branco** deve ser tratado como etapa não ofertada, não como nota zero.
- **Decimais com vírgula** e **milhar com ponto** precisam ser normalizados na leitura.

### 1.6 Classificação, farol e métricas derivadas

A partir da nota, cada escola recebe um status de farol:

| Status | Faixa | Cor sugerida |
|--------|------:|--------------|
| Saudável | ≥ 70 | verde `#00C8A0` |
| Atenção | 50–69 | laranja `#FF9B00` |
| Crítica | < 50 | vermelho `#FF5C6A` |
| Sem dados | índice nulo | cinza `#8890B0` |

Métricas complementares por escola:

- **Alunos por sala** = total de alunos ÷ salas de aula.
- **Alunos por professor** = total de alunos ÷ professores efetivos + temporários, quando a fonte estiver disponível.

### 1.7 Checklist de replicação do índice

1. Listar as perguntas e agrupá-las em dimensões temáticas.
2. Definir pesos das dimensões, somando 1,00.
3. Criar tabela resposta→pontos para cada pergunta categórica, copiando o texto exatamente como aparece na base.
4. Criar fórmula de conversão 0–100 para perguntas numéricas e regra de não aplicável.
5. Calcular pontos → dimensão → índice ponderado → criticidade.
6. Validar ausência de `NaN`, coerência dos extremos e dimensões zeradas por erro de texto.

---

## Parte 2 — Tela "Índice de Saúde Operacional por escola"

### 2.1 Objetivo da tela

A tela é a **camada de transparência e priorização escola a escola** do dashboard. Ela mostra a nota geral e a nota de cada dimensão em uma tabela única, ordenável e pesquisável.

A finalidade é permitir que a gestão saia dos agregados e chegue rapidamente ao caso individual, identificando:

- escolas críticas;
- escolas em atenção;
- escolas saudáveis;
- dimensão responsável pela fragilidade operacional;
- prioridade de intervenção.

### 2.2 Estrutura da tabela

Uma linha por escola.

| Coluna | Conteúdo | Formato |
|--------|----------|---------|
| **Farol** | status conforme saúde operacional | ícone/círculo |
| **Escola** | nome da escola | texto |
| **Município** | município | texto |
| **DRE** | diretoria regional | chip/pill |
| **Alunos** | matrícula total | número |
| **Aln/sala** | alunos por sala | número |
| **Saúde** | índice geral 0–100 | barra + valor |
| **Infra · Energia · Merenda · Segur. · Pessoal · Tec. · Pedag. · Gov.** | nota de cada dimensão | badge 0–100 ou `—` |

### 2.3 Regras de comportamento

**Ordenação.** Todo cabeçalho deve ser clicável. Um clique ordena pela coluna; outro clique inverte o sentido. O padrão de abertura deve ser por **criticidade decrescente**, equivalente às escolas com menor saúde operacional no topo.

**Busca.** Campo único filtrando por escola, município ou DRE, sem diferenciar maiúsculas/minúsculas. O contador deve exibir `Exibindo X de Y escolas`.

**Cores.** A mesma régua visual do farol deve ser reaplicada em barra de saúde e badges de dimensão.

**Valores ausentes.** `null` deve aparecer como `—`, nunca como zero.

**Destaque de linhas críticas.** Escolas com status crítico podem receber borda lateral vermelha, mantendo a leitura institucional.

### 2.4 Princípios de design

- Uma única régua visual: verde, laranja, vermelho e cinza.
- `null` diferente de 0 em toda a cadeia.
- Números alinhados e legíveis.
- A tabela é derivada do cálculo, nunca digitada manualmente.
- A tela deve ser explicável para a gestão: índice, criticidade e dimensões precisam ser transparentes.

### 2.5 Checklist de replicação da tela

- [ ] Cada registro possui identificação da escola.
- [ ] Cada registro possui métricas brutas mínimas: alunos e salas.
- [ ] Cada registro possui `saude`, `criticidade`, `status` e `dimensoes`.
- [ ] Abertura ordenada por criticidade decrescente.
- [ ] Busca por escola, município e DRE.
- [ ] Valores `null` exibidos como `—`.
- [ ] Farol, barra e badges seguem a mesma régua.
- [ ] Não há uso de dados fake.
- [ ] Não há inferência de valores a partir de imagem de referência.
