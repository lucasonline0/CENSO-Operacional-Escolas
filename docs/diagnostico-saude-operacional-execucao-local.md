# Diagnóstico local (pós-merge) — Aba "Saúde Operacional das Escolas"

> **Natureza:** diagnóstico operacional local executado **após o merge** da
> instrumentação (PR #116) na `develop`. **Sem alteração de código** do projeto.
> Branch de origem: `develop` (working tree limpo no início).
> Data da execução: 2026-06-15.

---

## 1. Resumo executivo

A aba **Saúde Operacional** trava por uma razão agora **medida e confirmada**: o
endpoint
`GET /v1/admin/analytics/escolas/saude-operacional` transfere o **JSONB completo de
todos os censos concluídos** do banco e o banco usado localmente é o **Railway
remoto** (não há Postgres local). O **plano da query executa em ~3 ms no servidor**,
mas **puxar os ~4,1 MB de JSONB (822 censos) pela rede até o backend local leva
~91 segundos**.

Como o servidor HTTP tem `WriteTimeout: 30s`, a conexão é encerrada **muito antes**
de o handler concluir → o navegador exibe `Failed to fetch` / requisição pendente.
E **nenhum log `saude_operacional_perf` aparece** porque o handler fica preso no
**loop de iteração das linhas** (`rows.Next()` / `Scan`), **nunca chegando ao log
final de sucesso e sem retornar erro** — exatamente o ponto cego previsto na Parte 1.

**Veredito:** o problema é de **backend + ambiente local (banco remoto)**, de
natureza **estrutural** (o endpoint faz trabalho/transferência proporcional a *todas*
as escolas antes de paginar). Não é frontend, não é rota ausente, não é CORS, não é
401, não é processo desatualizado.

---

## 2. Ambiente local testado

| Item | Valor |
|------|-------|
| SO | Windows 11, Go 1.26.3 |
| Backend em execução | processo `api` PID 27208, porta **8000**, iniciado 10:04:44 |
| Build em execução | **contém** a string `saude_operacional_perf` → **é o build instrumentado** (pós-merge das 10:02:45) |
| `.env` do backend | `infra/.env` (carregado via loader de `main.go`; **valores não impressos**) |
| Banco | **Railway remoto** via `DATABASE_URL` (não há Postgres local) |
| `web/.env` / `web/.env.local` | **ausentes** → Next.js não lê `infra/.env`; `API` cai no fallback `http://localhost:8000` |
| `NEXT_PUBLIC_API_URL` efetivo no front | `http://localhost:8000` (fallback de `constants.ts`) — **bate com o backend** |
| `psql` | **indisponível** no PATH (medições feitas por programa Go descartável, fora do repo) |

Observação: tentar subir um segundo backend falhou com
`bind: Only one usage of each socket address ... :8000` — confirmando que **já havia
um backend instrumentado de pé** na 8000.

---

## 3. Resultado do backend

Boot do backend (log redigido, sem segredos):

- `Arquivo .env carregado com sucesso de: …\infra\.env`
- `Credenciais de ADMIN carregadas no ambiente com sucesso.`
- `Banco conectado!` (conexão ao Railway levou ~3 s no boot)
- `applyMigrations: 17 migration(s) encontrada(s)` → **0001–0016 aplicadas**; duas
  falhas **não-fatais** de idempotência:
  - `0015_prodep_repasses.sql: relation "prodep_repasses_inep_ano_cat_uniq" already exists (42P07)`
  - `0017_create_ideb_resultados.sql: relation "ideb_resultados_ano_inep_etapa_uniq" already exists (42P07)`
  - → As tabelas **já existem** no banco; o erro é apenas o `ADD CONSTRAINT UNIQUE`
    cujo índice-relação já existe e cuja cláusula `EXCEPTION` trata
    `duplicate_object`, não `duplicate_table`. **Não impede o funcionamento** (a
    tabela `ideb_resultados` está presente e populada — ver §9).
- `AVISO: SheetsService/DriveService ... auth: email must be provided` (credenciais
  Google ausentes localmente; irrelevante para a Saúde Operacional).
- `Servidor rodando porta 8000`.

Healthcheck e alcance da rota (contra o backend já no ar):

| Requisição | Status | Tempo |
|------------|--------|-------|
| `GET /v1/health` | **200** | 3,5 ms |
| `GET /` | **200** ("Censo API Online") | 2,9 ms |
| `GET /v1/admin/analytics/escolas/saude-operacional` **sem token** | **401** ("token de autenticação necessário") | **4,4 ms** |

➡️ A rota **está registrada e é alcançável**; o middleware `requireAdminAuth` rejeita
em **~4 ms**. Logo, qualquer travamento ocorre **dentro do handler**, depois da
autenticação — só reproduzível com token válido **ou** medindo as queries direto no
banco (foi o caminho adotado, ver §6 e §10).

---

## 4. Resultado do frontend

- **Não há `web/.env` nem `web/.env.local`.** Portanto o Next.js **não** injeta
  `NEXT_PUBLIC_API_URL` (a definição existe apenas em `infra/.env`, que o Next não
  lê). `API` resolve para o fallback `http://localhost:8000`
  (`web/src/components/admin/shared/constants.ts:5`).
- O backend está exatamente em `http://localhost:8000` → **não há divergência de
  host/porta** entre front e back. Sem `127.0.0.1` vs `localhost`, sem URL remota.
- A montagem da URL pela aba (`AbaSaudeOperacionalEscolas.tsx:117-138`) e o
  `apiFetch` (`shared/api.ts:33-53`) estão corretos; o token vai no header
  `Authorization`. **O frontend chama a rota certa.**

➡️ Frontend **descartado** como causa raiz. Ele apenas **expõe** a falha de rede que
vem do backend (handler que não responde dentro do `WriteTimeout`).

---

## 5. Resultado do DevTools/Network (esperado) e como confirmar

Não foi possível dirigir o navegador autenticado nesta sessão (login exige
credenciais que não devem ser impressas). Porém, com base na medição direta (§6/§10),
o comportamento esperado no DevTools é:

- A chamada
  `GET …/v1/admin/analytics/escolas/saude-operacional?year=2026&page=1&page_size=10&sort=criticidade&direction=desc`
  **aparece no Network**, fica **`Pending`** por dezenas de segundos.
- Por volta de **~30 s** (o `WriteTimeout` do servidor), a conexão cai e a aba
  renderiza **`Failed to fetch`** (a `fetch()` rejeita com `TypeError`).
- Provável **preflight `OPTIONS`** antes do GET (Authorization + Content-Type tornam
  a requisição não-simples); o `OPTIONS` responde **200** rápido — não é o gargalo.
- **Não** será 401 (o token é válido), **não** será 404 (rota existe), **não** será
  erro de CORS de origem (front e back no mesmo host:porta esperado).

**Runbook para o usuário confirmar no navegador:** `/admin` → login → DevTools >
Network → abrir a aba → observar a linha da rota: status (Pending → failed), Time
(~30 s), e Console (`TypeError: Failed to fetch`).

---

## 6. Resultado do "curl"/medição direta

Token admin **não** foi obtido nesta sessão: só há `ADMIN_PASSWORD_HASH` (bcrypt) no
ambiente; a senha em texto não está disponível e **não deve ser adivinhada/impressa**.
Em vez do curl autenticado, mediu-se **diretamente no banco** o trabalho exato que o
handler faz (mais preciso que o curl, pois isola transferência de cálculo). Programa
Go descartável **fora do repositório**, lendo `DATABASE_URL` de `infra/.env` **sem
imprimir o valor**.

Resultados (uma amostra, conexão local → Railway remoto):

| Etapa medida | Resultado |
|--------------|-----------|
| Conexão + ping ao Railway | **1.737 ms** |
| Query Pedagógico/IDEB (`loadPedagogicoPorEscola`) — query+scan | **1.146 ms** (796 linhas) |
| **Query principal Saúde (year=2026, sem filtros) — query+scan+transfer** | **91.710 ms (~91 s)** |
| └ linhas | 894 (822 com censo `completed`) |
| └ **volume de JSONB transferido** | **~4.243 KB (~4,1 MB)** |

➡️ O `curl` autenticado, se executado, **excederia o `--max-time` de 45 s** e cairia
pelo `WriteTimeout` de 30 s do servidor antes disso. Nenhuma linha
`saude_operacional_perf` seria emitida (o handler não conclui).

---

## 7. Logs encontrados

- **Backend de boot:** OK (conexão, migrations, "Servidor rodando porta 8000").
- **`saude_operacional_perf:`** — **NÃO** apareceu (handler não conclui).
- **`saude_operacional_perf_error:`** — **NÃO** apareceu de forma confiável (o loop de
  transferência não retorna erro; só surgiria se/quando o cancelamento de contexto
  (queda da conexão) abortasse o `Scan`, virando `stage=scan`/`stage=rows_err` —
  comportamento tardio e dependente de timing).
- **Middleware Logger do Chi:** registra a entrada do GET, mas a **linha de conclusão
  da requisição** (status/tempo) só sai quando o handler retorna — que aqui não
  acontece dentro da janela útil.

### Por que a ausência de log já era previsível (Parte 1)

Na `develop`, em `api/cmd/api/analytics_saude_operacional.go`, os logs estão **apenas**:

- **sucesso**, no **fim** do handler (linha ~1214, após montar o payload);
- **erro**, somente quando uma função **retorna erro**: `stage=load_pedagogico`
  (~1124), `stage=query` (~1134), `stage=scan` (~1160), `stage=build_escola`
  (~1169), `stage=rows_err` (~1177).

**Não há** log de início de rota, nem antes de `loadPedagogicoPorEscola`, nem antes da
query principal. Portanto, se a requisição **fica pendente** numa chamada de banco
**bloqueante** (transferência das linhas), ela **não emite log algum** — nem sucesso
(não chegou ao fim) nem erro (nada retornou erro). **A ausência de log é, ela mesma, a
evidência de que o handler trava na fase de iteração/transferência.**

---

## 8. Se a instrumentação apareceu ou não

**Não apareceu** `saude_operacional_perf` nem `saude_operacional_perf_error`. Isso
**não** significa instrumentação ausente:

- A `develop` **contém** os logs (grep no fonte: linhas 1124/1134/1160/1169/1177/1214).
- O **binário em execução** (PID 27208, iniciado 10:04:44, após o merge das 10:02:45)
  **contém** a string `saude_operacional_perf` — é o build instrumentado.

➡️ A instrumentação está ativa; ela simplesmente **só registra ao concluir/errar**, e o
handler faz nenhum dos dois dentro do tempo útil. Isso motiva a recomendação de §12
(log de início de rota + por etapa antes de bloquear).

---

## 9. Contagens do banco (Parte 7)

| Consulta | Valor | Tempo (round-trip ao Railway) |
|----------|-------|-------------------------------|
| `COUNT(*) FROM schools` | **894** | 637 ms |
| `COUNT(*) FROM census_responses` | **859** | 425 ms |
| `… WHERE status='completed'` | **822** | 426 ms |
| `… status='completed' AND year=2026` | **822** | 425 ms |
| `COUNT(*) FROM ideb_resultados` | **1.570** | 1.153 ms |
| `MAX(ano) FROM ideb_resultados` | **2023** | 647 ms |
| `… WHERE school_id IS NOT NULL` | **1.300** | 429 ms |

Tabelas presentes e populadas: `schools`, `census_responses`, `reg_integracao`
(migration 0014 aplicada com sucesso), `ideb_resultados` (com colunas `school_id`,
`ano`, `ideb`, `total_avaliado`). **Nenhuma tabela/migration faltando** explica o
sintoma — a base local (Railway) está íntegra para este endpoint.

> Note a **latência por consulta**: até consultas triviais de `COUNT` levam
> ~0,4–1,2 s cada por causa do RTT ao Railway. Esse mesmo fator, multiplicado pelo
> volume de JSONB, é o que estoura o tempo da query principal.

---

## 10. Tempos medidos (Parte 8 — EXPLAIN ANALYZE)

Execução **no servidor** (plano), via `EXPLAIN (ANALYZE, BUFFERS)`:

| Query | Planning | **Execution Time (servidor)** |
|-------|----------|-------------------------------|
| Pedagógico/IDEB | 0,25 ms | **2,48 ms** |
| Principal Saúde | 0,37 ms | **3,33 ms** |

Plano da principal: `Seq Scan schools` + `Seq Scan census_responses` → `Hash Right
Join` → `Sort (quicksort, 146kB)`. Tudo barato (894/822 linhas).

### A descoberta central

| | Servidor (EXPLAIN) | Wall-clock local (query+scan+transfer) |
|---|---|---|
| Query principal | **3,3 ms** | **91.710 ms** |

A diferença de **~3 ms vs ~91 s** **não está na computação SQL** — está **inteiramente
na transferência do resultado** (~4,1 MB de JSONB, 822 linhas) do **Railway remoto**
para o backend local, sob alta latência/baixa vazão do ambiente. Os índices
(`idx_cr_status_year`, GIN etc.) **não ajudam** este caminho: o gargalo é **egress de
dados**, não busca.

> Caveat honesto: foi **uma** amostra (o transfer leva ~90 s; re-execução é cara).
> Mesmo que varie para, digamos, 40–60 s, a conclusão se mantém: **excede o
> `WriteTimeout` de 30 s**. Recomenda-se ao usuário repetir 2–3× para registrar a
> faixa real no seu link.

---

## 11. Hipótese mais provável

**Confirmada por medição:** o handler **não trava em CPU nem em SQL**, e sim na
**iteração/transferência de ~4,1 MB de JSONB de todos os 822 censos concluídos** a
partir do **banco Railway remoto**, levando **~91 s** — muito acima do **`WriteTimeout`
de 30 s**. Consequências encadeadas:

1. A conexão é cortada pelo servidor aos ~30 s → navegador: **`Failed to fetch`** /
   requisição pendente.
2. O handler fica preso no loop `rows.Next()`/`Scan` (entre `iterateStart` e o log
   final) → **nenhum `saude_operacional_perf` é emitido**.
3. A aba é, além disso, a **única fora do `prefetchDashboard`** e a **única que faz
   `SELECT cr.data` cru** (as demais consomem views agregadas e payloads pequenos) —
   por isso só ela falha enquanto as outras carregam.

Causa secundária (não-bloqueante, mas a corrigir): `loadPedagogicoPorEscola` roda a
cada requisição (~1,1 s aqui) sem cache.

---

## 12. Próxima ação recomendada

Esta missão é **diagnóstico**; nada de correção foi implementado. Para a próxima
etapa, em ordem de prioridade:

1. **Reduzir o volume transferido (correção de fundo).** O endpoint não deve trazer o
   `cr.data` inteiro de todas as escolas para paginar 10. Opções (uma ou combinação):
   - **Paginar/agregar no SQL** (calcular dimensões em view/consulta e devolver só a
     página + resumo), evitando egress de ~4 MB por request;
   - **Materializar** o índice de saúde por escola (view materializada / tabela de
     apoio atualizada em background) e servir leituras baratas;
   - **Cache server-side** do resultado calculado por (`year` + filtros), com TTL.
2. **Cachear `loadPedagogicoPorEscola`** (muda raramente; hoje custa ~1,1 s/request).
3. **Observabilidade — PR mínimo de logs de início/etapa** (autorizar antes):
   adicionar `saude_operacional_perf_start` no topo do handler e logs imediatamente
   **antes** de `loadPedagogicoPorEscola` e da query principal, para que um travamento
   futuro seja visível **enquanto** ocorre (e não só ao concluir/errar).
4. **Revisar `WriteTimeout`** apenas como paliativo — aumentar o limite mascara o
   gargalo; preferir (1). Se usado, combinar com timeout/erro amigável no `apiFetch`
   (hoje sem `AbortController`).
5. **Só então** incluir a aba no `prefetchDashboard` — antes de (1), o prefetch apenas
   transfere a lentidão para o login.
6. **Idempotência das migrations 0015/0017**: tratar `duplicate_table` (42P07) além de
   `duplicate_object` no `ADD CONSTRAINT UNIQUE`, para parar os erros de startup
   (cosmético; não afeta o sintoma).

---

## Conclusão direta (respostas objetivas)

- **Reproduziu o problema?** Sim — por medição direta do banco (a query principal leva
  ~91 s; o `WriteTimeout` é 30 s).
- **A requisição chega ao backend?** Sim (health 200; rota retorna 401 sem token em
  ~4 ms).
- **A rota entra no handler?** Sim, com token válido (após o `requireAdminAuth`); ela
  então bloqueia na transferência das linhas.
- **Apareceu `saude_operacional_perf`?** Não (handler não conclui).
- **Apareceu `saude_operacional_perf_error`?** Não de forma confiável (o loop de
  transferência não retorna erro).
- **Qual etapa trava?** A **iteração/transferência das linhas** da query principal
  (egress de ~4,1 MB de JSONB do Railway), não o SQL nem o cálculo.
- **Frontend, backend, banco ou ambiente?** **Backend + ambiente local (banco remoto)**
  — design do endpoint (transfere tudo antes de paginar) somado à latência/baixa vazão
  do Railway remoto, estourando o `WriteTimeout`.
