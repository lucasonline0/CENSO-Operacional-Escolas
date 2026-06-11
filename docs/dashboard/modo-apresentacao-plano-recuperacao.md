# Modo Apresentação — Plano de Recuperação da Feature

## 1. Contexto

A feature **Modo Apresentação** do dashboard administrativo (`/admin`) foi iniciada
em branches antigas:

- `feat/modo-apresentacao` — PR `#67`, com título `feat: modo apresentação`;
- `fix/modo-apresentacao` — PR `#85`, também com título `feat: modo apresentação`,
  aberto contra `develop`.

Ambos os PRs ficaram **defasados** em relação à `develop`. A branch
`fix/modo-apresentacao` está cerca de **55 commits atrás** da `develop`, com apenas
**5 commits próprios**, e o PR `#85` **não é mergeável** no estado atual.

O objetivo agora é **recuperar a feature de forma segura**, em **PRs pequenos,
isolados e auditáveis**, sem reaproveitar diretamente o histórico das branches
antigas. Este documento registra o plano de recuperação. Não há código nesta
frente — ela é **exclusivamente documental**.

## 2. Diagnóstico das branches antigas

Problemas observados na branch `fix/modo-apresentacao` e no PR `#85`:

- **Branch defasada** — ~55 commits atrás de `develop`, contra apenas 5 commits próprios.
- **PR não mergeável** — `#85` aberto contra `develop`, mas com conflitos não resolvidos.
- **Duplicidade de PRs** — `#67` (`feat/modo-apresentacao`) e `#85`
  (`fix/modo-apresentacao`) cobrem o mesmo tema, gerando ambiguidade.
- **Alterações massivas em várias abas** — o diff toca ~15 arquivos com milhares de
  linhas alteradas, atingindo Merenda, Serviços, Tecnologia, Infraestrutura, Pessoal etc.
- **Mistura de feature com resolução de conflito** — o diff combina a feature de Modo
  Apresentação com mudanças transversais que parecem ter origem em merge/conflito,
  não na feature em si.
- **Alterações em helpers compartilhados** — duplicação de helpers de filtros/labels,
  inclusive em `shared/api.ts`.
- **Remoção / risco de remoção de funcionalidades da topbar** — remoção da busca da
  topbar e remoção do botão de sync da planilha.
- **Risco de regressão em cache, filtros e labels**:
  - reintrodução do label "ano corrente";
  - remoção de `getCached` / `allCached` em abas;
  - alterações transversais que podem **sobrescrever entregas recentes da `develop`**.

## 3. Decisão

Decisão formal sobre o tratamento das branches antigas:

- **Não mergear** `fix/modo-apresentacao` no estado atual.
- **Não continuar** o desenvolvimento em cima da branch antiga.
- Usar a branch antiga **apenas como referência de protótipo** (leitura), nunca como
  base de merge ou cherry-pick cego.
- **Reconstruir a feature em branch limpa**, criada a partir da `develop` atualizada.

Os PRs `#67` e `#85` **não serão editados** por esta frente. Podem ser fechados como
superados em momento posterior, fora do escopo deste documento.

## 4. Escopo do Modo Apresentação

O que a feature deve fazer:

- adicionar um **botão no dashboard admin** para entrar no modo apresentação;
- abrir um **overlay/painel de apresentação** sobre o dashboard;
- permitir **navegação por seções/abas** do dashboard;
- suportar **modo manual** (avanço/retrocesso pelo usuário) como primeira entrega;
- suportar **modo automático** (autoplay) como entrega posterior;
- oferecer **fullscreen opcional**;
- **não substituir** a navegação normal do dashboard — o modo apresentação é uma
  camada adicional, ativável e desativável a qualquer momento.

## 5. Fora de escopo

A feature **não deve**, em nenhuma das fases:

- remover a **busca** da topbar;
- remover o **sync da planilha** (botão de resync);
- alterar **filtros globais**;
- alterar **endpoints**;
- alterar **payloads**;
- alterar **migrations**;
- alterar **cálculos**;
- alterar **labels de fonte**;
- alterar **cache/prefetch** sem justificativa explícita;
- reestruturar **abas analíticas** como efeito colateral.

## 6. O que pode ser reaproveitado do protótipo

Como **referência**, não como cópia cega:

- a **ideia geral** do componente `PresentationMode`;
- a **lista inicial de slides** (estrutura conceitual);
- alguns **estilos CSS** específicos do overlay;
- a **navegação por teclado**;
- **fullscreen/autoplay** como fase futura.

## 7. O que não deve ser reaproveitado diretamente

- alterações massivas nas abas;
- helpers duplicados em `shared/api.ts`;
- reintrodução do label "ano corrente";
- remoção de `getCached` e `allCached`;
- remoção de busca/sync;
- qualquer mudança transversal fora do escopo do PR em questão.

## 8. Estratégia de PRs

A feature será reconstruída em **PRs pequenos e isolados**, cada um a partir de
`develop` atualizada.

### PR 1 — Shell do Modo Apresentação

Escopo:

- adicionar componente base `PresentationMode`;
- CSS isolado;
- botão na topbar;
- abrir/fechar overlay;
- **sem** alterações nas abas.

### PR 2 — Âncoras nas abas

Escopo:

- adicionar `id`s de seção nas abas;
- **sem** alterar fetch/cache/filtros/labels.

### PR 3 — Navegação por slides

Escopo:

- lista de slides;
- navegação anterior/próximo;
- atalhos de teclado;
- contador de slides;
- scroll até a âncora correspondente.

### PR 4 — Recursos avançados

Escopo:

- autoplay;
- fullscreen;
- intervalo configurável;
- painel lateral;
- modo compacto;
- ajustes visuais.

## 9. Critérios de aceite

- `build` passa;
- **busca** e **sync** continuam presentes na topbar;
- **filtros globais** continuam funcionando;
- **labels de fonte** continuam usando o helper atual;
- nenhuma aba perde **cache/prefetch** sem decisão explícita;
- **sem alteração de backend**;
- **sem migration**;
- **sem alteração de payload**;
- **sem regressão** em Merenda, Serviços, Saúde Operacional ou Registros do Censo.

## 10. Validação recomendada

- `git diff --stat`
- `npm run build`
- `npm run lint` — com registro de erros preexistentes, se houver;
- revisão visual no dashboard normal;
- revisão visual do modo apresentação.
