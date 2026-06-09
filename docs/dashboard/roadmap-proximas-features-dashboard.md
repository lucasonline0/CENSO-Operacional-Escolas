# Roadmap de Evolução do Dashboard Admin

## 1. Objetivo

Este documento registra as próximas features previstas para evolução do Dashboard Admin do **Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA**.

As features propostas buscam ampliar a capacidade de análise, melhorar a performance da tela de Saúde Operacional, oferecer melhor experiência visual e transformar o painel em uma ferramenta também utilizável em apresentações institucionais.

Este documento é uma referência de planejamento para socialização com a equipe e para orientar as próximas tasks de implementação.

## 2. Contexto atual

O dashboard já possui abas temáticas e operacionais, incluindo a tela **Índice de Saúde Operacional por escola**, implementada no grupo **Operacional**.

A tela de Saúde Operacional apresenta atualmente:

- cards sintéticos;
- busca local;
- tabela escola a escola;
- farol de status;
- barra de saúde;
- criticidade;
- notas por dimensão;
- metodologia v1.0.0;
- seis dimensões habilitadas inicialmente: Infraestrutura, Energia, Merenda, Segurança, Pessoal/RH e Tecnologia;
- Pedagógico e Governança como dimensões explicitamente nulas até decisão de fonte.

Com a tela em uso, surgem quatro frentes naturais de evolução:

1. **Filtros globais**;
2. **Paginação server-side da Saúde Operacional**;
3. **Modo dark**;
4. **Modo apresentação**.

## 3. Decisões já tomadas

As seguintes decisões ficam registradas como diretrizes iniciais:

| Tema | Decisão |
|---|---|
| Paginação da Saúde Operacional | Usar **Caminho B — paginação no backend** |
| Modo apresentação | Submenus simples viram 1 slide |
| Modo apresentação | Submenus grandes podem virar 2 ou mais slides |
| Saúde Operacional em modo apresentação | Não exibir a lista completa de escolas; privilegiar síntese |
| Saúde Operacional por DRE | Avaliar e planejar uma visão sintética agregada por DRE |

## 4. Features previstas

As features planejadas são:

| Feature | Tipo | Impacto | Observação |
|---|---|---|---|
| Filtros globais | Backend + Frontend + Dados | Alto | Afeta todas as abas e endpoints |
| Paginação da Saúde Operacional | Backend + Frontend | Alto | Reduz carga inicial e prepara filtros |
| Saúde Operacional por DRE | Backend + Frontend | Médio/Alto | Pode enriquecer a própria tela e o modo apresentação |
| Modo dark | Frontend / Design System | Médio | Exige revisão visual transversal |
| Modo apresentação | Frontend / UX avançada | Alto | Transforma o painel em ferramenta institucional de apresentação |

## 5. Feature 1 — Filtros globais

### 5.1 Objetivo

Criar um conjunto de filtros globais no dashboard, permitindo que o usuário selecione recortes territoriais e institucionais que afetem todas as telas do painel.

### 5.2 Filtros previstos

Os filtros previstos são:

- Região de Integração;
- DRE;
- Município;
- Nome da Escola;
- Zona;
- Ano de referência;
- Limpar filtros.

### 5.3 Comportamento esperado

Ao selecionar um filtro, todas as abas do dashboard deverão respeitar o recorte selecionado.

Exemplo:

```txt
Região de Integração: Guajará
Município: Belém
Zona: Urbana
```

Nesse caso, os indicadores, gráficos, cards e tabelas deverão exibir apenas os dados correspondentes ao recorte selecionado.

### 5.4 Estado global no frontend

O frontend deverá manter um estado global de filtros no `/admin`, compartilhado entre as abas.

Estrutura conceitual sugerida:

```ts
interface DashboardFilters {
  ano?: number;
  regiao_integracao?: string;
  dre?: string;
  municipio?: string;
  school_id?: number;
  codigo_inep?: string;
  zona?: string;
}
```

Esse estado deverá ser repassado para as abas e usado na montagem das URLs dos endpoints.

### 5.5 Parâmetros nos endpoints

Os endpoints analíticos deverão passar a aceitar parâmetros como:

```txt
year
regiao_integracao
dre
municipio
school_id
codigo_inep
zona
```

Exemplo:

```txt
/v1/admin/analytics/merenda/oferta?year=2026&dre=CASTANHAL&municipio=INHANGAPI&zona=Rural
```

### 5.6 Região de Integração

A informação de **Região de Integração** ainda não existe no banco de dados.

Recomenda-se criar uma base territorial própria, por meio de migration, associando cada município à respectiva Região de Integração.

A solução recomendada é uma tabela auxiliar, e não uma coluna direta em `schools`, pois a Região de Integração é uma propriedade territorial derivada do município.

Tabela sugerida:

```txt
municipio_regiao_integracao
```

Campos sugeridos:

```txt
municipio_chave
municipio_nome
regiao_integracao
```

A chave normalizada deve reduzir riscos com acentos, hífens, apóstrofos e grafias variantes, por exemplo:

```txt
IGARAPE MIRI / IGARAPE-MIRI
PAU DARCO / PAU D'ARCO
BELEM / BELÉM
```

### 5.7 Endpoint de opções dos filtros

Recomenda-se criar um endpoint específico para alimentar os selects dos filtros:

```txt
GET /v1/admin/analytics/filtros/opcoes
```

Esse endpoint poderá retornar:

```json
{
  "anos": [2026],
  "regioes_integracao": ["GUAJARA", "GUAMA", "BAIXO AMAZONAS"],
  "dres": ["BELEM", "CASTANHAL"],
  "municipios": ["BELEM", "CASTANHAL"],
  "zonas": ["Urbana", "Rural"],
  "escolas": [
    {
      "school_id": 1,
      "codigo_inep": "15000000",
      "nome_escola": "ESCOLA EXEMPLO",
      "municipio": "BELEM",
      "dre": "BELEM",
      "zona": "Urbana"
    }
  ]
}
```

Em uma evolução posterior, o endpoint poderá aceitar filtros parciais para retornar opções dependentes, por exemplo:

```txt
/v1/admin/analytics/filtros/opcoes?dre=CASTANHAL
```

### 5.8 Fatiamento recomendado

A implementação dos filtros globais deve ser feita em etapas:

1. diagnóstico técnico dos endpoints e queries afetadas;
2. migration da base territorial de Região de Integração;
3. endpoint de opções dos filtros;
4. componente frontend de filtros globais;
5. adaptação gradual dos endpoints analíticos;
6. validação visual e funcional em todas as abas.

## 6. Feature 2 — Paginação server-side da Saúde Operacional

### 6.1 Objetivo

A tela **Índice de Saúde Operacional por escola** deve evoluir para carregar os dados de forma paginada, reduzindo o volume inicial carregado e melhorando a performance da tabela.

### 6.2 Decisão tomada

Foi decidido adotar o **Caminho B — paginação no backend**.

A paginação apenas no frontend não é suficiente para reduzir o carregamento real, pois todos os registros continuariam vindo do backend. A solução server-side reduz tráfego, memória, tempo de renderização e prepara a tela para filtros globais.

### 6.3 Comportamento esperado

A tela deverá carregar, por padrão, 10 escolas por página.

O usuário poderá escolher:

```txt
10
50
100
1000
```

registros por página.

Também deverão existir controles para avançar e voltar páginas.

### 6.4 Parâmetros recomendados

O endpoint de Saúde Operacional deve evoluir para aceitar:

```txt
page
page_size
search
sort
direction
year
```

Exemplo:

```txt
GET /v1/admin/analytics/escolas/saude-operacional?page=1&page_size=10&sort=criticidade&direction=desc&year=2026
```

### 6.5 Payload recomendado

O payload deve passar a incluir metadados de paginação:

```ts
interface SaudeOperacionalPaginadoPayload {
  total_escolas: number;
  total_filtrado: number;
  page: number;
  page_size: number;
  total_pages: number;
  ano_referencia: number;
  metodologia: SaudeOperacionalMetodologia;
  escolas: SaudeOperacionalEscola[];
}
```

### 6.6 Busca e ordenação

Com paginação server-side, a busca e a ordenação também devem ser server-side.

Se a busca continuar apenas no frontend, ela filtrará somente a página atual, o que pode gerar comportamento incorreto.

Portanto, a evolução recomendada é:

```txt
search server-side
sort server-side
direction server-side
page/page_size server-side
```

### 6.7 Ordenação padrão

A ordenação padrão deve permanecer:

```txt
criticidade desc
```

Regras:

- escolas críticas aparecem primeiro;
- escolas sem dados permanecem ao final;
- nulos permanecem ao final;
- desempate recomendado por nome da escola e `school_id`.

### 6.8 Compatibilidade

Como o endpoint atual já retorna a lista completa, há duas opções:

1. manter fallback sem `page/page_size` retornando todos os registros;
2. tornar a paginação padrão do endpoint.

Recomendação inicial:

```txt
Com page/page_size: retorna paginado.
Sem page/page_size: manter comportamento atual temporariamente para compatibilidade.
```

Depois que o frontend migrar totalmente, pode-se avaliar tornar a paginação obrigatória.

## 7. Feature complementar — Saúde Operacional por DRE

### 7.1 Motivação

A tela atual de Saúde Operacional é escola a escola. Essa visão é essencial para intervenção operacional, pois permite identificar quais unidades exigem prioridade.

Entretanto, para gestão estratégica e para o futuro modo apresentação, uma lista completa de escolas pode ser excessivamente detalhada. Uma visão agregada por DRE pode tornar a tela mais executiva e útil para priorização regional.

### 7.2 Recomendação de produto

Recomenda-se criar uma síntese de **Saúde Operacional por DRE** como complemento da tela atual, sem substituir a lista escola a escola.

A tela poderia passar a ter duas visões:

```txt
Visão por DRE
Visão por escola
```

Ou, alternativamente:

```txt
Bloco superior: síntese por DRE
Bloco inferior: escolas críticas / tabela escola a escola
```

### 7.3 Por que não substituir a lista por escolas

A lista por escola continua necessária porque:

- mostra a unidade exata que precisa de intervenção;
- permite busca por escola, município, DRE e INEP;
- permite priorização operacional;
- exibe notas por dimensão em nível de escola.

A visão por DRE deve ser uma camada executiva acima da lista, não um substituto.

### 7.4 Indicadores recomendados por DRE

Para cada DRE, a síntese pode exibir:

- total de escolas;
- escolas com nota;
- escolas sem dados;
- saúde média;
- criticidade média;
- quantidade de escolas saudáveis;
- quantidade de escolas em atenção;
- quantidade de escolas críticas;
- percentual de escolas críticas;
- menor saúde da DRE;
- maior saúde da DRE;
- dimensão média mais crítica;
- ranking da DRE por criticidade.

### 7.5 Payload conceitual

Um endpoint futuro poderia retornar:

```ts
interface SaudeOperacionalDREItem {
  dre: string;
  total_escolas: number;
  escolas_com_nota: number;
  escolas_sem_dados: number;
  saude_media: number | null;
  criticidade_media: number | null;
  saudaveis: number;
  em_atencao: number;
  criticas: number;
  percentual_criticas: number | null;
  menor_saude: number | null;
  maior_saude: number | null;
  dimensoes_medias: {
    infraestrutura: number | null;
    energia: number | null;
    merenda: number | null;
    seguranca: number | null;
    pessoal: number | null;
    tecnologia: number | null;
    pedagogico: number | null;
    governanca: number | null;
  };
  dimensao_mais_critica: string | null;
}
```

### 7.6 Endpoint recomendado

Criar endpoint próprio, sem alterar a semântica do endpoint escola a escola:

```txt
GET /v1/admin/analytics/escolas/saude-operacional/dre
```

Parâmetros futuros:

```txt
year
regiao_integracao
dre
municipio
zona
```

### 7.7 Uso na tela Saúde Operacional

A tela Saúde Operacional pode evoluir para exibir:

1. cards gerais da rede;
2. tabela ou cards por DRE;
3. ranking de DREs com maior criticidade média;
4. ranking de DREs com maior percentual de escolas críticas;
5. tabela paginada de escolas.

Essa composição permite que a tela atenda tanto à gestão estratégica quanto à intervenção operacional.

### 7.8 Uso no modo apresentação

No modo apresentação, a Saúde Operacional deve evitar a lista completa de escolas.

Sugestão de divisão:

```txt
Slide 1 — Saúde Operacional: panorama geral
Slide 2 — Saúde Operacional por DRE
Slide 3 — Escolas mais críticas
```

Assim, o modo apresentação comunica o essencial sem transformar a apresentação em uma tabela extensa.

### 7.9 Ordem de implementação recomendada

A visão por DRE deve vir depois da paginação da escola a escola e antes ou junto do modo apresentação.

Ordem sugerida:

1. paginação server-side da lista de escolas;
2. endpoint de síntese por DRE;
3. bloco frontend de Saúde Operacional por DRE;
4. uso da síntese por DRE no modo apresentação.

## 8. Feature 3 — Modo dark

### 8.1 Objetivo

Adicionar suporte a modo escuro em toda a aplicação.

### 8.2 Comportamento esperado

O usuário deverá poder alternar entre:

- modo claro;
- modo escuro.

A preferência deverá ser persistida no navegador.

### 8.3 Estratégia visual

O modo dark deve ser tratado como uma evolução do tema da aplicação, não como ajuste isolado em uma única tela.

Devem ser avaliados:

- layout do `/admin`;
- sidebar;
- cards;
- tabelas;
- badges;
- gráficos;
- inputs;
- modais;
- telas vazias;
- mensagens de erro;
- contraste de textos e ícones.

### 8.4 Pontos técnicos

Antes da implementação, deve ser verificado:

- suporte atual do Tailwind ou sistema de estilos a `darkMode`;
- uso de cores hardcoded;
- adaptação de cards, tabelas, badges, gráficos e menus;
- contraste e legibilidade;
- persistência em `localStorage`;
- opção de seguir ou não a preferência do sistema operacional.

### 8.5 Fatiamento recomendado

1. diagnóstico visual e técnico;
2. infraestrutura global de tema;
3. ajuste dos componentes compartilhados;
4. ajuste das abas do dashboard;
5. validação visual.

## 9. Feature 4 — Modo apresentação

### 9.1 Objetivo

Criar um modo de apresentação para o dashboard, permitindo que as abas sejam visualizadas como slides em tela cheia.

Esse modo permitirá o uso do dashboard em reuniões, apresentações institucionais e acompanhamento gerencial em telões.

### 9.2 Decisões tomadas

Ficam registradas as seguintes decisões:

```txt
Submenus simples → 1 slide
Submenus grandes → 2 ou mais slides
```

Ou seja, o modo apresentação não deve assumir automaticamente que cada submenu sempre cabe em um único slide.

### 9.3 Comportamento esperado

Ao ativar o modo apresentação, a aplicação deverá:

- ocultar ou reduzir elementos de navegação;
- ocupar a tela inteira;
- apresentar uma aba ou seção por vez;
- permitir navegação para slide anterior e próximo;
- permitir saída do modo apresentação;
- evitar rolagem longa;
- adaptar conteúdos extensos em mais de um slide, quando necessário.

### 9.4 Modo animação

Dentro do modo apresentação, deverá existir uma opção de apresentação automática.

Comportamento previsto:

- cada slide permanece visível por 10 segundos;
- ao final do intervalo, avança automaticamente;
- o usuário pode pausar;
- o usuário pode avançar ou voltar manualmente;
- o usuário pode sair do modo apresentação.

### 9.5 Divisão de slides

Nem toda aba deve virar apenas um slide.

Exemplo:

```txt
Caracterização da Rede → 1 ou 2 slides
Infraestrutura e Segurança → 2 ou mais slides
Merenda Escolar → 2 ou mais slides
Serviços Terceirizados → 1 ou 2 slides
Saúde Operacional → 2 ou 3 slides
Todos os Censos → provavelmente não entra integralmente no modo apresentação
```

### 9.6 Conteúdo sintético

O modo apresentação deve privilegiar síntese, não exploração detalhada.

Tabelas extensas, listas completas e bases operacionais devem ser substituídas por:

- cards;
- rankings;
- gráficos resumidos;
- destaques;
- recortes críticos;
- top N itens prioritários.

### 9.7 Arquitetura provável

Criar uma camada própria para apresentação:

```txt
PresentationMode
```

Com uma lista de slides:

```ts
interface PresentationSlide {
  id: string;
  title: string;
  sourceTab: Tab;
  section?: string;
  durationMs?: number;
}
```

A implementação inicial pode usar configuração hardcoded, com evolução futura para slides configuráveis.

## 10. Priorização recomendada

A ordem recomendada de implementação é:

1. **Paginação server-side da Saúde Operacional**;
2. **Síntese da Saúde Operacional por DRE**;
3. **Filtros globais**;
4. **Modo dark**;
5. **Modo apresentação**.

Justificativa:

- a paginação resolve uma necessidade imediata de performance da tela recém-criada;
- a síntese por DRE complementa a Saúde Operacional e prepara o modo apresentação;
- os filtros globais afetam todo o dashboard e devem ser planejados com maior cuidado;
- o modo dark exige revisão visual transversal;
- o modo apresentação depende de uma base de telas mais estável e de sínteses executivas como a visão por DRE.

## 11. Riscos técnicos

| Feature | Risco | Mitigação |
|---|---|---|
| Filtros globais | Alterar todos os endpoints ao mesmo tempo | Implementar de forma gradual |
| Região de Integração | Divergência de grafia de municípios | Usar chave normalizada |
| Paginação | Ordenação inconsistente entre páginas | Sort server-side determinístico |
| Paginação | Busca local limitada à página atual | Implementar busca server-side |
| Saúde por DRE | Média mascarar escolas muito críticas | Exibir também percentual de críticas e mínimos |
| Saúde por DRE | DRE com poucas escolas distorcer ranking | Mostrar total de escolas e escolas com nota |
| Modo dark | Cores hardcoded quebrando contraste | Diagnóstico visual antes da implementação |
| Modo apresentação | Telas com conteúdo excessivo | Criar slides sintéticos por seção |
| Modo apresentação automático | Troca de slides durante leitura | Permitir pausa e controle manual |

## 12. Decisões pendentes

Antes das implementações, devem ser decididos:

1. a paginação da Saúde Operacional manterá fallback sem `page/page_size` retornando tudo?
2. o limite `1000` será permitido sempre ou apenas para perfis administrativos?
3. a busca da Saúde Operacional pesquisará também município, DRE, zona e INEP?
4. a síntese por DRE entrará na mesma tela ou em subaba dentro da Saúde Operacional?
5. a síntese por DRE terá endpoint próprio ou será derivada do endpoint escola a escola?
6. o filtro global incluirá Ano de referência desde a primeira versão?
7. Região de Integração será criada como tabela territorial auxiliar?
8. os filtros serão aplicados em todas as abas no primeiro PR ou gradualmente?
9. o modo dark seguirá preferência do sistema operacional ou apenas escolha manual?
10. o modo apresentação exibirá todas as abas ou apenas abas selecionadas?
11. o modo apresentação terá slides configuráveis ou inicialmente hardcoded?

## 13. Próxima task recomendada

A próxima task recomendada é implementar a **paginação server-side da tela Saúde Operacional**, com suporte a:

```txt
page
page_size
search
sort
direction
year
```

Em seguida, recomenda-se implementar a **síntese de Saúde Operacional por DRE**, com endpoint próprio e bloco visual na mesma tela.

Essas duas frentes preparam a tela para maior volume de dados, melhoram a experiência operacional e criam uma base mais adequada para o futuro modo apresentação.
