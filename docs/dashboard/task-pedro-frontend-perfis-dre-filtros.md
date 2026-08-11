# Task — Pedro — Frontend dos perfis DRE + filtros Escola/INEP

**Branch sugerida:** `feat/admin-dre-filtros-frontend`  
**Dependências:** contrato de `/v1/admin/me` do Ed + suporte backend dos filtros do Lucas  
**Pode iniciar em paralelo:** componentes/tipos e UX usando contrato documentado; rebase antes do aceite.

## 1. Objetivo

Evoluir o frontend do `/admin` para:

- mostrar os dois novos filtros globais **Nome da Escola** e **Código INEP**;
- reconhecer se o usuário atual é `admin` ou `dre`;
- manter todas as abas atuais iguais em conteúdo/estrutura;
- deixar claro para usuário DRE que a visão está restrita à sua DRE;
- impedir pela UX mudanças de DRE que o backend de qualquer forma já bloqueará;
- não depender de fallback que possa devolver informação global para perfil DRE.

## 2. Regra principal

O frontend **não é a barreira de segurança**.

A UI deve refletir o escopo retornado por `/v1/admin/me`, mas nenhuma decisão do browser substitui a autorização implementada no backend.

## 3. Entregáveis

### PEDRO-01 — tipo de perfil da sessão

Adicionar tipo compartilhado, por exemplo:

```ts
export interface AdminProfile {
  username: string;
  role: "admin" | "dre";
  dre: string | null;
}
```

Após login/prefetch, carregar:

```text
GET /v1/admin/me
```

Também recuperar `/admin/me` quando uma sessão é restaurada a partir do token salvo.

Se `/admin/me` retornar 401, limpar a sessão como já ocorre com token inválido.

Não usar role/DRE armazenados no browser como fonte definitiva de autorização.

### PEDRO-02 — expandir `DashboardFilters`

Adicionar:

```ts
school_id?: number;
codigo_inep?: string;
```

Preservar os campos atuais:

```ts
ano
regiao_integracao
dre
municipio
zona
```

### PEDRO-03 — filtro "Nome da Escola"

Usar `FiltrosOpcoes.escolas`, que já traz `school_id`, nome, DRE, município, zona e INEP.

Comportamento:

- label: `Nome da Escola`;
- value real enviado ao backend: `school_id`;
- opção visível deve permitir distinguir escolas homônimas, usando nome + município/DRE e, quando disponível, INEP;
- busca/select deve continuar utilizável mesmo com lista grande;
- ao selecionar Escola, limpar `codigo_inep` para evitar dois identificadores contraditórios.

Se o select nativo ficar inadequado pelo volume, criar componente pesquisável simples sem introduzir biblioteca pesada desnecessária.

### PEDRO-04 — filtro "Código INEP"

Derivar as opções de `FiltrosOpcoes.escolas`.

Comportamento:

- label: `Código INEP`;
- value enviado: `codigo_inep`;
- não assumir que INEP é sempre único;
- se o mesmo INEP existir em mais de uma unidade, não deduplicar semanticamente de forma que esconda esse fato; a UI pode mostrar o INEP uma vez como filtro, mas o resultado backend pode conter múltiplas unidades legítimas;
- ao selecionar INEP, limpar `school_id`.

### PEDRO-05 — tags e limpar filtros

Atualizar:

- contador de filtros ativos;
- tags dos filtros;
- botão `Limpar filtros`.

Regras:

- admin: limpar tudo continua removendo DRE;
- DRE user: limpar filtros **não pode apagar visualmente a DRE fixa**; após limpar, a DRE da sessão continua sendo apresentada como escopo obrigatório;
- Escola/INEP devem ter tags removíveis normalmente.

### PEDRO-06 — comportamento do filtro DRE por role

#### Admin

Manter o seletor DRE como hoje.

#### DRE user

- valor da DRE vem do `AdminProfile`;
- mostrar a DRE de forma fixa/desabilitada;
- não permitir selecionar outra DRE;
- apresentar indicação discreta no painel, por exemplo:

```text
Acesso restrito à DRE: <nome>
```

Não criar uma página nova e não duplicar as abas.

### PEDRO-07 — cascata das opções

O carregamento de `GET /admin/analytics/filtros/opcoes` deve continuar acompanhando os filtros ativos.

Adicionar `school_id`/`codigo_inep` na lógica quando fizer sentido, mas evitar loops de requests causados por cascata.

Para usuário DRE, a UI deve assumir que o backend já devolve somente opções permitidas. Ainda assim, nunca mesclar com cache de opções carregado por outro usuário/sessão.

Ao trocar de conta/logout:

- limpar cache de API;
- limpar filtros antigos;
- não reaproveitar lista de escolas/INEPs da sessão anterior.

### PEDRO-08 — requests das abas

Auditar todos os componentes do admin para garantir que recebem o `DashboardFilters` atualizado e repassam `school_id`/`codigo_inep` onde hoje montam query manualmente.

Atenção especial aos componentes com builders próprios:

```text
AbaPerfilAlunos.tsx
AbaGestaoFinanceiraGovernanca.tsx
AbaSaudeOperacionalEscolas.tsx
AbaPorDre.tsx
AbaTodosCensos.tsx / carregamento no page.tsx
```

Não alterar gráficos nem conteúdo das abas; apenas propagar o recorte.

### PEDRO-09 — remover dependência insegura de fallback para DRE

A Caracterização ainda possui fallback legado para Sheets.

Para `role=dre`:

- não usar fallback que devolva visão global caso o endpoint PostgreSQL falhe;
- mostrar estado de erro normal se a fonte segura não responder;
- admin pode manter fallback atual enquanto ele fizer parte do comportamento existente.

Também evitar prefetch de endpoints legados `admin`-only quando a sessão for DRE.

### PEDRO-10 — ações administrativas globais

Se existir ação visual que o backend passa a restringir a admin (ex.: sincronização global de Sheets):

- esconder/desabilitar para `role=dre`;
- não remover para admin;
- não alterar navegação das abas.

### PEDRO-11 — relatórios

`ReportButton` deve continuar funcionando sem API paralela.

Confirmar que os filtros novos entram na URL do relatório quando aplicáveis:

```text
school_id
codigo_inep
```

A DRE de usuário DRE não precisa ser confiada ao frontend, pois o backend aplica o scope; ela pode aparecer na URL apenas por consistência visual, nunca como controle de autorização.

## 4. Arquivos principais de Pedro

```text
web/src/app/admin/page.tsx
web/src/components/admin/FiltrosGlobais.tsx
web/src/components/admin/shared/types.ts
web/src/components/admin/shared/api.ts
web/src/components/admin/shared/ReportButton.tsx
web/src/components/admin/Aba*.tsx
web/src/app/admin/admin.css             (somente se necessário para a UX)
```

Pode criar componente específico de select pesquisável em `web/src/components/admin/shared/` se necessário.

## 5. Arquivos que Pedro não deve alterar

```text
api/cmd/api/admin.go
api/cmd/api/analytics*.go
api/cmd/api/reports*.go
api/cmd/api/migrations/*
infra/migrations/*
web/src/components/forms/*
web/src/schemas/steps/*
```

Nenhuma alteração no questionário.

## 6. Comportamento esperado por cenário

### Login admin

```text
DRE: editável
Escola: editável
INEP: editável
Todas as abas: iguais ao estado atual
Visão: rede completa ou filtro escolhido
```

### Login DRE_A

```text
DRE: fixa em DRE_A
Município: opções apenas de DRE_A
Zona: opções apenas de DRE_A
Escola: opções apenas de DRE_A
INEP: opções apenas de DRE_A
Todas as abas: continuam disponíveis
Dados: somente DRE_A
```

### Tentativa manual de fraude

Mesmo que alguém altere no DevTools:

```text
?dre=DRE_B
?school_id=<B1>
?codigo_inep=<INEP_B1>
```

a UI pode até emitir uma request adulterada, mas o backend deve continuar devolvendo somente o escopo autorizado. Pedro deve validar isso na integração final; não precisa tentar resolver segurança no browser.

## 7. Validação manual obrigatória

Executar roteiro com duas contas DRE distintas e um admin.

### Admin

- consegue alternar DRE;
- filtros Escola/INEP funcionam;
- limpar filtros volta para rede completa;
- abas continuam iguais.

### DRE_A

- DRE aparece fixa;
- não aparecem escolas/INEPs de DRE_B;
- dashboards mostram somente A;
- Todos os Censos mostra somente A;
- Por DRE mostra somente A;
- Saúde mostra somente A;
- IDEB mostra somente A;
- Financeiro/Governança mostra somente A;
- XLSX não contém B;
- logout + login como DRE_B não reaproveita cache/opções de A.

### Estado de erro

- falha do endpoint PostgreSQL não deve provocar fallback global para DRE user;
- token expirado limpa sessão;
- `/admin/me` indisponível não deve assumir role admin por padrão.

## 8. Qualidade

O frontend atual não possui suíte automatizada configurada. Nesta task o mínimo obrigatório é:

```text
npm run lint
npm run build
```

Além disso, anexar ao PR o roteiro manual executado com os três perfis (admin, DRE_A, DRE_B).

Se for criada suíte de testes frontend nesta rodada, ela deve ser pequena e diretamente ligada aos filtros/perfis; não transformar esta task numa refatoração geral de testes.

## 9. Critérios de aceite

- duas novas opções aparecem no filtro global;
- Nome da Escola usa `school_id`;
- Código INEP usa `codigo_inep`;
- selecionar um identificador limpa o outro;
- DRE user vê mesma estrutura de dashboard, sem abas removidas;
- DRE fica fixa para perfil DRE;
- nenhuma opção de outra DRE aparece nos selects;
- cache é limpo entre sessões;
- fallback Sheets inseguro não é usado por perfil DRE;
- ações globais não aparecem para DRE;
- relatórios recebem filtros novos;
- `npm run lint` e `npm run build` passam.
