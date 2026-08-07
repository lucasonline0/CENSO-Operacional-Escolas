# Plano de Trabalho Paralelo — Perfis DRE + filtros por Escola/INEP

**Projeto:** Censo Operacional e Estrutural das Escolas — SEDUC/PA  
**Branch base:** `main`  
**Escopo:** somente Dashboard Admin e backend administrativo. **Não alterar o questionário nem o fluxo público de gravação do Censo.**

## 1. Objetivo

Esta rodada entrega duas evoluções do `/admin`:

1. adicionar duas novas opções ao filtro global:
   - **Nome da Escola**;
   - **Código INEP**;
2. criar perfis de acesso por **DRE**, mantendo exatamente as abas e informações já existentes, porém garantindo que um usuário de DRE veja **somente dados da própria DRE**.

A implementação deve preservar o perfil administrativo atual, que continua com visão ampla da rede.

## 2. Decisão sobre os dois novos filtros

O backend atual de `GET /v1/admin/analytics/filtros/opcoes` já devolve `escolas[]` com:

- `school_id`;
- `codigo_inep`;
- `nome_escola`;
- `municipio`;
- `dre`;
- `zona`.

Por isso os dois filtros novos serão implementados sem criar uma nova fonte:

- **Nome da Escola** → filtro canônico `school_id`;
- **Código INEP** → filtro `codigo_inep`.

### 2.1 Semântica importante

`school_id` identifica exatamente uma linha de `schools` e deve ser o filtro mais preciso.

`codigo_inep` não deve ser tratado como chave interna única absoluta, pois o projeto já documenta casos legítimos de unidades/anexos compartilhando ou repetindo INEP. Assim:

- selecionar **Nome da Escola** filtra por `school_id`;
- selecionar **Código INEP** filtra por `codigo_inep` e pode, legitimamente, alcançar mais de uma unidade quando houver duplicidade cadastrada;
- no frontend, selecionar um desses dois identificadores deve limpar o outro para evitar combinação contraditória.

## 3. Princípio de segurança dos perfis DRE

A restrição de DRE **não pode ser apenas visual**.

É proibido implementar a segurança somente escondendo o seletor de DRE ou preenchendo `?dre=...` no frontend. Um usuário poderia alterar a URL/request manualmente.

A DRE autorizada deve fazer parte da identidade autenticada e ser aplicada no backend em todas as consultas administrativas.

Fluxo alvo:

```text
login
  ↓
JWT
  ├── username
  ├── role = admin | dre
  └── dre = <DRE autorizada> | vazio para admin
  ↓
requireAdminAuth
  ↓
AdminAccessScope no context
  ↓
handlers / analytics / reports
  ↓
escopo DRE obrigatório no servidor
```

### 3.1 Regras de autorização

#### Perfil `admin`

- mantém o comportamento atual;
- pode visualizar toda a rede;
- pode selecionar qualquer DRE;
- mantém operações administrativas globais existentes.

#### Perfil `dre`

- vê as mesmas abas do dashboard;
- não recebe nenhuma nova versão simplificada do painel;
- enxerga somente registros/indicadores da DRE vinculada ao perfil;
- pode continuar refinando o recorte por Ano, Região, Município, Zona, Nome da Escola e Código INEP, desde que o resultado pertença à própria DRE;
- não pode ampliar o escopo trocando `dre` via query string, request manual ou DevTools;
- não pode acessar por ID um Censo de outra DRE;
- relatórios XLSX devem sair restritos à DRE do perfil;
- endpoint de opções dos filtros não pode enumerar escolas, municípios, INEPs ou DREs fora do escopo permitido.

## 4. Modelo de contas

O projeto atual possui um único admin definido por `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` e JWT.

Nesta rodada:

- o admin por env deve continuar funcionando, para evitar migração arriscada do acesso atual;
- usuários DRE passam a ser persistidos em tabela própria, com senha em bcrypt;
- nenhuma senha padrão ou credencial real pode ser versionada no repositório.

Modelo conceitual:

```text
admin_users
  id
  username UNIQUE
  password_hash
  role            -- 'dre' nesta primeira evolução; preparado para expansão
  dre
  active
  created_at
  updated_at
```

A criação/manutenção das contas deve ser feita por ferramenta administrativa/CLI controlada. A DRE informada deve existir no cadastro `schools`.

## 5. Escopo técnico que precisa ser coberto

O isolamento DRE deve valer para **todos os endpoints protegidos que entregam dados**, incluindo:

- `/v1/admin/dashboard`;
- `/v1/admin/census`;
- `/v1/admin/census/{id}`;
- `/v1/admin/analytics/overview`;
- todos os `/v1/admin/analytics/caracterizacao/*`;
- todos os `/v1/admin/analytics/pessoal-gestao/*`;
- todos os `/v1/admin/analytics/tecnologia/*`;
- todos os `/v1/admin/analytics/infraestrutura/*`;
- todos os `/v1/admin/analytics/merenda/*`;
- todos os `/v1/admin/analytics/servicos-terceirizados/*`;
- `/v1/admin/analytics/escolas/saude-operacional`;
- `/v1/admin/analytics/financeiro-governanca/*`;
- `/v1/admin/analytics/perfil-alunos-resultados/ideb`;
- `/v1/admin/analytics/preenchimento/dre`;
- `/v1/admin/analytics/filtros/opcoes`;
- `/v1/admin/reports/{report_id}`.

Endpoints legados baseados em Sheets que não conseguirem garantir escopo DRE devem ser bloqueados para `role=dre` em vez de retornar informação global. O frontend DRE não deve depender de fallback não escopado.

Operações globais como `POST /v1/admin/sync-sheets` permanecem exclusivas do `admin`.

## 6. Divisão em 3 pessoas

| Pessoa | Frente | Branch sugerida | Responsabilidade principal |
|---|---|---|---|
| **Ed** | Autenticação, identidade e autorização | `feat/admin-perfis-dre-auth` | contas DRE, claims JWT, escopo no context, `/admin/me`, proteção de endpoints administrativos legados e BOLA por ID |
| **Lucas** | Backend analítico, isolamento e filtros | `feat/admin-dre-scope-filtros` | aplicar escopo DRE em analytics/reports e implementar `school_id` + `codigo_inep` como filtros globais reais |
| **Pedro** | Frontend e validação integrada | `feat/admin-dre-filtros-frontend` | UI dos novos filtros, sessão/perfil DRE, seletor DRE travado, remoção de fallback inseguro e bateria de testes manuais de isolamento |

Documentos individuais:

- `task-ed-autenticacao-perfis-dre.md`;
- `task-lucas-escopo-dre-filtros-backend.md`;
- `task-pedro-frontend-perfis-dre-filtros.md`.

## 7. Contrato compartilhado entre as três frentes

Para reduzir conflito, todos devem assumir o seguinte contrato:

```go
type AdminAccessScope struct {
    Username string
    Role     string // "admin" | "dre"
    DRE      string // obrigatório quando Role == "dre"
}
```

O middleware de autenticação coloca esse escopo em `request.Context()`.

Helpers de domínio devem permitir obter o escopo sem reprocessar JWT em cada handler.

### 7.1 Regra de precedência de DRE

```text
role=admin
  → usa filtro ?dre= se informado

role=dre
  → DRE efetiva = DRE do JWT/context
  → qualquer ?dre= diferente é ignorado ou rejeitado
  → nunca ampliar o escopo
```

Preferência desta rodada: **substituir internamente pela DRE autorizada e não confiar no valor enviado pelo cliente**. Para endpoints de escrita/ação global, usar `403` quando a role não tiver permissão.

## 8. Novo contrato dos filtros globais

Frontend:

```ts
interface DashboardFilters {
  ano?: number;
  regiao_integracao?: string;
  dre?: string;
  municipio?: string;
  zona?: string;
  school_id?: number;
  codigo_inep?: string;
}
```

Backend compartilhado:

```text
?year=
?regiao_integracao=
?dre=
?municipio=
?zona=
?school_id=
?codigo_inep=
```

Todos os endpoints em que o conceito de escola existe devem respeitar esses identificadores.

Para fontes externas/especiais:

- **IDEB:** `codigo_inep` pode ser aplicado diretamente; `school_id` depende do vínculo com `schools`;
- **PRODEP:** usar o vínculo cadastral existente (`school_id` quando disponível; INEP PRODEP quando o filtro for `codigo_inep`), documentando a semântica;
- **Governança Censo:** filtrar via `schools`/view vinculada;
- **relatórios:** repetir exatamente o mesmo recorte usado na tela correspondente.

## 9. Endpoint de perfil atual

Criar:

```text
GET /v1/admin/me
```

Payload mínimo:

```json
{
  "username": "usuario_dre",
  "role": "dre",
  "dre": "DRE EXEMPLO"
}
```

Para o admin atual:

```json
{
  "username": "admin",
  "role": "admin",
  "dre": null
}
```

Esse endpoint permite restaurar corretamente a sessão depois de reload sem confiar em informações de autorização persistidas pelo browser.

## 10. Comportamento visual esperado

Não remover, renomear ou duplicar abas.

### Admin

- filtro DRE continua editável;
- novos filtros Escola e Código INEP aparecem normalmente.

### Usuário DRE

- mesmas abas;
- mesmos cards, gráficos, tabelas e relatórios, porém já escopados;
- filtro DRE aparece fixo/desabilitado com a DRE da conta;
- mostrar indicação discreta: `Acesso restrito à DRE <nome>`;
- Município/Zona/Escola/INEP recebem apenas opções da própria DRE;
- não mostrar ações globais que o backend proíbe, como sincronização global de Sheets.

## 11. Testes obrigatórios de isolamento

Criar pelo menos duas DREs de teste: `DRE_A` e `DRE_B`.

Para token de `DRE_A`:

1. `/analytics/filtros/opcoes` não contém `DRE_B` nem escolas de `DRE_B`;
2. `?dre=DRE_B` nunca retorna dados de `DRE_B`;
3. `?school_id=<escola de DRE_B>` retorna conjunto vazio/403, nunca o registro;
4. `?codigo_inep=<INEP de DRE_B>` não vaza dados;
5. `/admin/census/{id}` de escola da `DRE_B` retorna `403` ou `404`;
6. saúde operacional só contém escolas de `DRE_A`;
7. IDEB só contém resultados permitidos pelo vínculo/INEP da `DRE_A`;
8. Financeiro/Governança só contém escolas/registros da `DRE_A`;
9. relatórios XLSX não contêm linhas de `DRE_B`;
10. paginação, totais e percentuais são calculados sobre o conjunto da `DRE_A`, e não sobre a rede completa antes de filtrar.

Este último item é crítico: não basta remover linhas no final; **agregações e denominadores precisam nascer do recorte autorizado**.

## 12. Ordem de merge

1. **Ed** — identidade/autorização e contrato `AdminAccessScope`;
2. **Lucas** — aplicação do escopo em analytics/reports + filtros Escola/INEP;
3. **Pedro** — frontend final e validação integrada.

Pedro pode desenvolver a UI em paralelo usando mock/tipo local do payload `/admin/me`, mas deve rebasear sobre Ed antes do aceite.

Lucas pode preparar as mudanças dos filtros em paralelo, mas a versão final deve consumir o helper de escopo entregue por Ed, sem duplicar lógica de JWT.

## 13. Critério de aceite global

A rodada está concluída quando:

- admin atual continua acessando toda a rede;
- existe suporte operacional para criar uma conta para cada DRE, sem senha versionada;
- cada conta DRE só enxerga a própria DRE em **todas as abas atuais**;
- tentativa manual de trocar DRE/Escola/INEP na request não provoca vazamento;
- Nome da Escola e Código INEP funcionam como filtros globais;
- filtros continuam funcionando em conjunto com Ano, Região, DRE, Município e Zona;
- opções do filtro são escopadas/cascateadas;
- relatórios respeitam o mesmo recorte;
- `go test ./...` passa;
- `npm run lint` e `npm run build` passam;
- nenhum arquivo do questionário ou endpoint público de gravação foi alterado.
