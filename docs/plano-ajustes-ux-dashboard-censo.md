# Plano de Ajustes UX e Funcionais — Dashboard Censo Operacional e Estrutural SEDUC/PA

## 1. Contexto

Este documento organiza pequenas implementações planejadas para o painel próprio do **Censo Operacional e Estrutural das Escolas da Rede Estadual da SEDUC/PA**.

O objetivo é melhorar a experiência de consulta, apresentação institucional e exploração dos dados, mantendo o fluxo incremental do projeto:

```text
develop
  ↓
feature branch
  ↓
PR para develop
  ↓
validação
  ↓
merge em develop
  ↓
PR posterior develop → main
```

A branch base para todas as frentes descritas neste documento deve ser:

```text
develop
```

A branch `main` representa produção e não deve receber alterações diretas, salvo hotfix explicitamente autorizado.

---

## 2. Diretrizes gerais

As implementações devem seguir as seguintes premissas:

- PRs pequenos e rastreáveis;
- não alterar migrations sem necessidade explícita;
- não alterar Google Sheets;
- não alterar cálculos existentes sem validação prévia;
- preservar comportamento atual das abas;
- reaproveitar componentes existentes sempre que possível;
- priorizar componentes reutilizáveis no frontend;
- priorizar funções compartilhadas no backend quando tabelas e relatórios usarem dados semelhantes;
- manter filtros globais existentes funcionando como estão;
- tratar filtros específicos de aba como filtros locais, não globais;
- validar build e testes antes de abrir PR.

---

## 3. Frente 1 — Filtro local na aba Saúde Operacional

### 3.1. Objetivo

Adicionar filtros específicos na tela **Saúde Operacional** para permitir ao usuário filtrar a tabela de escolas por:

- status de saúde operacional;
- criticidade.

Esses filtros devem existir apenas nesta tela e não devem interferir nos filtros globais do dashboard.

### 3.2. Situação atual

A aba **Saúde Operacional** já possui:

- tabela escola a escola;
- paginação;
- busca;
- ordenação por colunas;
- status por escola;
- índice de saúde;
- criticidade;
- dimensões avaliadas.

Os filtros globais já filtram por:

- ano;
- DRE;
- município;
- zona;
- região de integração.

### 3.3. Comportamento esperado

Adicionar um bloco de filtro local, preferencialmente próximo ao cabeçalho ou acima da tabela, com opções como:

#### Status

- Todos;
- Saudável;
- Atenção;
- Crítica;
- Sem dados.

O valor técnico esperado no backend/frontend deve respeitar os status já existentes:

```text
saudavel
atencao
critica
sem_dados
```

#### Criticidade

A criticidade pode ser filtrada de duas formas. A opção recomendada inicialmente é por faixas simples, para facilitar o uso pela gestão:

- Todas;
- Alta criticidade;
- Média criticidade;
- Baixa criticidade;
- Sem criticidade / sem dados.

A definição exata das faixas deve ser documentada no código e, se possível, alinhada com a metodologia já usada pela aba.

Alternativa técnica: permitir `criticidade_min` e `criticidade_max`, mas esta opção é menos amigável para o usuário final.

### 3.4. Recomendação técnica

Como a tabela de Saúde Operacional usa paginação, busca e ordenação, o filtro deve preferencialmente ser aplicado no backend, evitando carregar todo o conjunto de escolas no frontend apenas para filtrar localmente.

O endpoint candidato é:

```http
GET /v1/admin/analytics/escolas/saude-operacional
```

Novos query params sugeridos:

```text
status=saudavel|atencao|critica|sem_dados
criticidade_faixa=alta|media|baixa|sem_dados
```

Ou, caso seja tecnicamente mais simples:

```text
status=critica
criticidade_min=70
criticidade_max=100
```

### 3.5. Regras de UX

- Alterar filtros locais deve resetar a paginação para a primeira página.
- Filtros locais devem ser visualmente separados dos filtros globais.
- Deve haver botão ou opção “Limpar filtros da aba”.
- O estado vazio deve informar que nenhuma escola foi encontrada para o recorte atual.
- A busca textual deve continuar funcionando em conjunto com os filtros locais.
- A ordenação deve continuar funcionando em conjunto com os filtros locais.

### 3.6. Relatório XLSX

Decisão recomendada para a primeira etapa:

- o botão de relatório XLSX continua respeitando apenas os filtros globais;
- os filtros locais de status/criticidade ficam restritos à visualização da tabela.

Evolução futura:

- permitir que o relatório de Saúde Operacional também respeite filtros locais, caso a gestão entenda que o XLSX deve refletir exatamente a visualização da tela.

### 3.7. Critérios de aceite

A implementação será considerada concluída quando:

- a aba Saúde Operacional exibir filtros locais por status e criticidade;
- os filtros funcionarem junto com busca, paginação e ordenação;
- alterar filtros resetar a página para 1;
- filtros globais continuarem funcionando;
- o comportamento das demais abas não for alterado;
- build do frontend executar com sucesso;
- testes Go continuarem passando, caso o backend seja alterado.

---

## 4. Frente 2 — Tabelas detalhadas ao final das abas

### 4.1. Objetivo

Adicionar ao final das abas analíticas uma tabela escola a escola com os dados relevantes daquela aba, permitindo consulta rápida sem depender apenas dos cards e gráficos.

A tabela deve seguir uma experiência semelhante a:

- paginação da tela **Registros do Censo**;
- ordenação por colunas semelhante à tela **Saúde Operacional**.

### 4.2. Abas candidatas

As tabelas devem ser adicionadas progressivamente, priorizando as abas que ainda não possuem uma tabela escola a escola consolidada.

Abas candidatas:

- Caracterização da Rede;
- Pessoal e Gestão Escolar;
- Tecnologia e Equipamentos;
- Infraestrutura e Segurança;
- Merenda Escolar;
- Serviços Terceirizados;
- Gestão Financeira e Governança;
- Perfil dos Alunos e Resultados.

A aba **Saúde Operacional** já possui tabela e deve servir como referência visual e funcional.

A aba **Registros do Censo** já possui tabela própria e não deve ser alterada nesta frente.

### 4.3. Estratégia recomendada

Não implementar todas as tabelas em um único PR.

A estratégia recomendada é:

1. criar ou consolidar um componente reutilizável de tabela administrativa;
2. implementar uma primeira tabela piloto em uma aba com dados já maduros;
3. validar UX, performance e padrão visual;
4. replicar o padrão nas demais abas em PRs separados.

### 4.4. Aba piloto recomendada

A aba piloto recomendada é:

```text
Infraestrutura e Segurança
```

Justificativa:

- já possui relatório XLSX backend;
- já possui dados escola a escola no relatório;
- possui campos operacionais claros para consulta;
- tem alta utilidade para gestão e priorização.

### 4.5. Padrão visual esperado

A tabela deve conter:

- título claro;
- breve descrição do que está sendo listado;
- informação do recorte atual;
- campo de busca;
- paginação;
- ordenação por colunas;
- estado de carregamento;
- estado vazio;
- mensagem de erro;
- colunas relevantes para a aba.

### 4.6. Componente reutilizável sugerido

Criar componente frontend reutilizável, por exemplo:

```text
web/src/components/admin/shared/AdminDataTable.tsx
```

Ou, se for mais prudente na primeira etapa, extrair apenas partes reutilizáveis depois do piloto.

Funcionalidades desejadas:

- cabeçalhos ordenáveis;
- paginação;
- estado vazio;
- loading;
- erro;
- formatação de células;
- responsividade;
- suporte a colunas textuais, numéricas e badges.

### 4.7. Backend

Como a base possui muitas escolas e as tabelas devem ter paginação e ordenação, recomenda-se criar endpoints backend específicos por tabela, em vez de carregar tudo no frontend.

Padrão sugerido:

```http
GET /v1/admin/analytics/{aba}/escolas
```

Exemplos futuros:

```http
GET /v1/admin/analytics/infraestrutura/escolas
GET /v1/admin/analytics/merenda/escolas
GET /v1/admin/analytics/tecnologia/escolas
GET /v1/admin/analytics/pessoal-gestao/escolas
GET /v1/admin/analytics/servicos-terceirizados/escolas
GET /v1/admin/analytics/perfil-alunos-resultados/escolas
GET /v1/admin/analytics/financeiro-governanca/escolas
```

Os endpoints devem aceitar:

```text
year
dre
municipio
zona
regiao_integracao
q
page
page_size
sort
direction
```

### 4.8. Relação com relatórios XLSX

Sempre que possível, a tabela e o relatório XLSX da mesma aba devem reaproveitar a mesma lógica de montagem de linhas ou a mesma consulta base, evitando divergência entre:

- dados exibidos na tela;
- dados exportados no relatório.

### 4.9. Critérios de aceite da tabela piloto

A primeira tabela piloto será considerada concluída quando:

- existir tabela ao final da aba escolhida;
- a tabela respeitar filtros globais;
- a tabela possuir busca textual;
- a tabela possuir paginação;
- a tabela possuir ordenação por colunas relevantes;
- a tabela carregar rapidamente;
- a tabela não quebrar os cards e gráficos já existentes;
- backend e frontend passarem nas validações aplicáveis.

---

## 5. Frente 3 — Logo institucional no modo apresentação

### 5.1. Objetivo

Adicionar a logo institucional atualmente presente no rodapé do dashboard também no **Modo Apresentação**, melhorando a identidade visual das apresentações para reuniões de gestão.

### 5.2. Situação atual

O modo apresentação possui controles de navegação, play/reprodução automática e estrutura própria de slides.

A logo institucional aparece no rodapé da tela principal do dashboard, mas ainda não aparece de forma destacada no modo apresentação.

### 5.3. Proposta de layout

A proposta recomendada é:

- inserir a logo na parte superior do modo apresentação;
- manter a logo discreta, sem disputar atenção com o conteúdo;
- mover controles de navegação/play para a parte inferior;
- permitir ocultar os controles durante a apresentação;
- manter atalhos de teclado funcionando.

### 5.4. Comportamento esperado

Controles inferiores sugeridos:

- slide anterior;
- próximo slide;
- play/pausar;
- fechar modo apresentação;
- ocultar/mostrar controles.

Opções de ocultação:

- botão manual “Ocultar controles”;
- auto-ocultação após alguns segundos sem interação;
- reaparecer ao mover o mouse ou pressionar tecla.

### 5.5. Logo recomendada

Usar preferencialmente os assets já existentes em `public/`, respeitando tema/contraste:

```text
/parceiros.png
/logo-horizontal-letter-white.png
```

A escolha entre uma e outra deve considerar o fundo do modo apresentação.

### 5.6. Critérios de aceite

A implementação será considerada concluída quando:

- a logo aparecer no modo apresentação em posição institucionalmente adequada;
- os controles forem movidos para a parte inferior;
- os controles puderem ser ocultados;
- a navegação por teclado continuar funcionando;
- o play automático continuar funcionando;
- o comportamento mobile permanecer seguro, respeitando a restrição atual do modo apresentação.

---

## 6. Frente 4 — Logo institucional na parte superior da tela principal

### 6.1. Objetivo

Trazer a logo institucional do rodapé para uma posição mais visível na tela principal do dashboard, reforçando a identidade institucional sem prejudicar navegação, filtros ou conteúdo.

### 6.2. Situação atual

A logo institucional aparece no rodapé da área principal:

```text
ca-partners-strip
```

No topo, a tela possui:

- breadcrumb;
- botão de modo apresentação;
- botão de tema;
- botão de sair.

### 6.3. Proposta recomendada

A alternativa mais segura é inserir uma versão compacta da logo no topo, sem remover imediatamente o rodapé.

Posição sugerida:

- desktop: lado esquerdo da topbar, antes ou acima do breadcrumb;
- mobile: ocultar ou usar versão reduzida, para não competir com o botão de menu.

Layout sugerido:

```text
[Logo compacta]  Painel SEDUC / Aba atual                         [Modo Apresentação] [Tema] [Sair]
```

### 6.4. Cuidados de UX

- evitar que a logo ocupe espaço excessivo;
- preservar breadcrumbs;
- preservar botão de modo apresentação;
- preservar alternância de tema;
- garantir contraste em light mode e dark mode;
- evitar duplicação visual excessiva com o rodapé.

### 6.5. Decisão sobre o rodapé

Na primeira etapa, recomenda-se:

- manter a logo no rodapé;
- adicionar logo compacta no topo;
- validar visualmente com a gestão.

Após validação, pode-se decidir entre:

- manter topo + rodapé;
- manter apenas topo;
- manter topo nas telas internas e rodapé apenas em modo institucional.

### 6.6. Critérios de aceite

A implementação será considerada concluída quando:

- a logo aparecer de forma adequada na topbar;
- o layout não quebrar em desktop;
- o layout não quebrar em telas menores;
- light mode e dark mode mantiverem contraste;
- o rodapé permanecer funcional;
- nenhum fluxo de navegação for alterado.

---

## 7. Ordem recomendada dos PRs

### PR 1 — Documentação

Criar este documento em:

```text
docs/plano-ajustes-ux-dashboard-censo.md
```

Sem alteração de código.

### PR 2 — Filtros locais em Saúde Operacional

Implementar filtros de status e criticidade na aba Saúde Operacional.

### PR 3 — Tabela piloto em Infraestrutura e Segurança

Criar o padrão de tabela e validar em uma aba.

### PR 4+ — Tabelas nas demais abas

Replicar progressivamente o padrão validado.

### PR separado — Modo apresentação

Adicionar logo, reorganizar controles e permitir ocultação.

### PR separado — Logo na topbar

Adicionar logo compacta na tela principal.

---

## 8. Validações obrigatórias

### Backend Go

Quando houver alteração backend:

```bash
cd api
go test -count=1 ./...
go vet ./...
go build ./cmd/api/...
```

### Frontend

Quando houver alteração frontend:

```bash
cd web
npm run build
npm run lint
```

Caso o lint falhe por erros pré-existentes, registrar claramente no PR e não corrigir fora do escopo.

---

## 9. Comandos obrigatórios antes de cada feature

Toda frente deve iniciar com:

```bash
git checkout develop
git pull origin develop
git status --short
```

Depois criar branch específica:

```bash
git checkout -b feat/nome-curto-da-feature
```

Nunca usar sem autorização explícita:

```bash
git reset --hard
git push --force
```

---

## 10. Observações finais

As quatro frentes são complementares, mas não devem ser implementadas juntas.

A prioridade recomendada é:

1. filtros locais em Saúde Operacional;
2. tabela piloto em Infraestrutura e Segurança;
3. modo apresentação;
4. logo na topbar;
5. replicação gradual das tabelas nas demais abas.

Essa ordem reduz risco, permite validação rápida pela gestão e evita um PR grande com mudanças simultâneas em UX, backend, frontend e identidade visual.
