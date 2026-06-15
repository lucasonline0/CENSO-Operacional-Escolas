# Diagnóstico — Aba "Saúde Operacional das Escolas" (`Failed to fetch`)

> **Natureza deste documento:** diagnóstico técnico, **sem alteração de código**.
> Nenhum arquivo de backend, frontend, migration ou cálculo foi modificado.
> Branch: `develop`. Endpoint sob análise:
> `GET /v1/admin/analytics/escolas/saude-operacional`.

---

## 1. Resumo executivo

A aba **Saúde Operacional** é a única aba do dashboard que **não é pré-carregada
no login** (não está na lista `DASHBOARD_ENDPOINTS` de `prefetchDashboard`). Por
isso, ao abri-la, o navegador dispara uma requisição **real e fria**, enquanto as
demais abas já abrem servidas pelo cache em memória aquecido no login.

Essa requisição fria cai sobre o endpoint **mais pesado de toda a camada
analítica**: ele carrega **todas as ~800 escolas cadastradas**, traz o **JSONB
completo de cada censo concluído**, decodifica e calcula **8 dimensões para todas
elas em memória Go**, ordena e só **então** pagina. O trabalho é proporcional ao
total de escolas **mesmo com `page_size=10`**.

O sintoma relatado — **`Failed to fetch`** — é, por definição do navegador, um
**erro de nível de rede** (a `fetch()` rejeita com `TypeError: Failed to fetch`),
**não** um erro HTTP. Erros HTTP (500/4xx) seriam convertidos em mensagens como
`HTTP 500` ou na mensagem do backend pelo `apiFetch`, e **não** em `Failed to
fetch`. Logo, a falha ocorre **antes de uma resposta HTTP válida chegar**: conexão
não estabelecida, conexão derrubada no meio, preflight CORS, ou — o cenário mais
compatível com "demorou demasiadamente **ou** não carregou" — o **`WriteTimeout`
de 30 s do servidor encerrando a conexão** enquanto o endpoint ainda processava.

**Conclusão antecipada:** o problema é predominantemente de **backend +
ambiente local**, não de frontend. Detalhamento e ranqueamento nas seções 9 e 10.

---

## 2. Sintoma observado

- Abas do dashboard carregam normalmente.
- A aba **Saúde Operacional** "demora demasiadamente **ou** não carrega".
- No frontend aparece o texto de erro **`Failed to fetch`**.

O componente exibe esse texto porque renderiza `error` (a `message` da exceção)
quando `payload === null`:

```tsx
// web/src/components/admin/AbaSaudeOperacionalEscolas.tsx:371-378
if (payload === null) {
  return ( … {error || "Não foi possível carregar…"} … );
}
```

E `error` recebe diretamente `(requestError as Error).message`
(`AbaSaudeOperacionalEscolas.tsx:345-352`). Como a `fetch()` do navegador lança
`TypeError` com a mensagem literal **`Failed to fetch`** em falhas de rede, é
exatamente esse texto que sobe até a UI.

---

## 3. Caminho da requisição (frontend → backend)

### 3.1 Montagem da URL (frontend)

`buildEndpoint` (`AbaSaudeOperacionalEscolas.tsx:117-138`) monta:

```
{API}/v1/admin/analytics/escolas/saude-operacional
    ?year=2026
    &sort=criticidade
    &direction=desc
    &page=1
    &page_size=10
    [&search=…] [&dre=…] [&municipio=…] [&zona=…] [&regiao_integracao=…]
```

- **`API`** = `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`
  (`shared/constants.ts:5`).
- **`year`** = `filters?.ano ?? 2026` (`DASHBOARD_REFERENCE_YEAR`, fixo no código).
- **`page`/`page_size`/`sort`/`direction`** = estado inicial `1 / 10 / criticidade
  / desc`.
- **Authorization** = `Bearer <token>` injetado pelo `apiFetch`
  (`shared/api.ts:41-43`).

`ENDPOINT_BASE` (`AbaSaudeOperacionalEscolas.tsx:30`) bate **exatamente** com a
rota registrada em `main.go:367`
(`/admin/analytics/escolas/saude-operacional`) — **não há erro de path**.

### 3.2 Disparo (frontend)

```tsx
// AbaSaudeOperacionalEscolas.tsx:333-360
useEffect(() => {
  const url = buildEndpoint(sortKey, sortDir, page, pageSize, serverSearch, filters);
  apiFetch<SaudeOperacionalPayload>(url, token)
    .then(setPayload…)
    .catch(message === "UNAUTHORIZED" ? onUnauth : setError)
    .finally(setLoading(false));
}, [token, onUnauth, sortKey, sortDir, page, pageSize, serverSearch, filters]);
```

### 3.3 `apiFetch` (frontend)

```ts
// web/src/components/admin/shared/api.ts:33-53
const res = await fetch(`${API}${path}`, {
  ...opts,
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, … },
});
if (res.status === 401) throw new Error("UNAUTHORIZED");
if (!res.ok) {
  const b = await res.json().catch(() => ({}));
  throw new Error(b.message ?? `HTTP ${res.status}`);
}
const data = (await res.json()).data as T;
```

**Pontos relevantes do `apiFetch`:**

- **Sem `AbortController` / sem timeout no cliente.** A requisição fica
  **pendente até o navegador/servidor desistir**. É isso que produz a percepção de
  "demorou demasiadamente" antes do `Failed to fetch`.
- O envio de `Content-Type: application/json` + `Authorization` em requisição
  cross-origin (`localhost:3000` → `localhost:8000`) **torna a requisição não-simples
  e dispara preflight `OPTIONS`**.
- **Erro HTTP ≠ `Failed to fetch`.** Um 500 entra no ramo `!res.ok` e vira
  `HTTP 500` ou a `message` do backend. Um 401 vira `UNAUTHORIZED`. **Só falha de
  rede produz `Failed to fetch`.** Esse é o discriminador central do diagnóstico.
- Cache GET em memória de 5 min por `path` completo (`api.ts:12-23,33-39,51`) —
  mas só ajuda **após** o primeiro sucesso; o primeiro fetch da aba é sempre real.

### 3.4 Backend

`mux.Use(app.enableCORS)` → `requireAdminAuth` → `AdminAnalyticsSaudeOperacionalEscolas`
(rota protegida JWT em `main.go:328-367`). Servidor com:

```go
// main.go:178-184
srv := &http.Server{
  Addr:         "0.0.0.0:" + cfg.port, // PORT, default 8000
  ReadTimeout:  10 * time.Second,
  WriteTimeout: 30 * time.Second,   // ← janela máxima para responder
  IdleTimeout:  time.Minute,
}
```

---

## 4. Hipóteses avaliadas

| # | Hipótese | Veredito |
|---|----------|----------|
| H1 | Aba fora do prefetch → requisição fria só ao abrir | **Confirmado** (explica a diferença de percepção) |
| H2 | Endpoint faz trabalho O(todas as escolas) mesmo com `page_size=10` | **Confirmado** (paginação tardia, em memória) |
| H3 | `WriteTimeout` 30 s encerra a conexão → `Failed to fetch` | **Provável** (compatível com "demorou ou não carregou") |
| H4 | Ambiente local aponta para Railway remoto → latência/transferência de JSONB grande | **Provável** (memória do projeto; agrava H2/H3) |
| H5 | Backend local fora do ar / porta errada / `NEXT_PUBLIC_API_URL` errado | **Possível** (causa clássica de `Failed to fetch`; verificar no ambiente) |
| H6 | CORS / preflight `OPTIONS` falhando | **Improvável** (middleware trata OPTIONS e libera Authorization) |
| H7 | 500 por `ideb_resultados` ausente/migration não aplicada | **Improvável como causa do texto** (geraria `HTTP 500`/mensagem, não `Failed to fetch`); ainda assim é risco real em base fresca |
| H8 | 401 / token expirado | **Descartado como causa do texto** (viraria `UNAUTHORIZED` → `onUnauth`, não `Failed to fetch`) |
| H9 | Panic/`Recoverer` derrubando a resposta | **Possível** (Recoverer responde 500 se o panic ocorre antes do write; se ocorrer durante o stream do JSON, a conexão quebra → `Failed to fetch`) |

---

## 5. Evidências encontradas no código

### 5.1 A aba está FORA do prefetch (evidência central da percepção)

A lista `DASHBOARD_ENDPOINTS` (`shared/api.ts:57-84`), disparada no login por
`prefetchDashboard`, **não inclui** `/v1/admin/analytics/escolas/saude-operacional`.
Ela inclui caracterização, pessoal-gestão, tecnologia, infraestrutura, merenda,
serviços-terceirizados, IDEB, filtros etc. — **todas as outras abas**.

➡️ **Consequência:** as demais abas abrem com **cache quente** (resposta instantânea
do `apiCache`); a Saúde Operacional **sempre** executa um fetch real e síncrono ao
abrir. Isso, por si só, explica por que "as outras carregaram e essa não".

### 5.2 Trabalho proporcional a TODAS as escolas (paginação tardia)

No handler (`analytics_saude_operacional.go:1058-1173`), a ordem é:

1. Parse de parâmetros (`year`, `page`, `page_size`, `sort`, `direction`, filtros).
2. **`loadPedagogicoPorEscola(ctx)`** — agrega `ideb_resultados` (linha 1107) —
   **uma query inteira a cada requisição**.
3. Query principal `saudeOperacionalSelectSQL` — `schools LEFT JOIN
   census_responses` trazendo **`cr.data` (JSONB completo)** de **todas** as
   escolas no recorte (linhas 1015-1039, 1113).
4. Loop `for dbRows.Next()` decodificando o **JSONB de cada censo concluído** e
   chamando `buildSaudeOperacionalEscola` → `calculateSchoolHealth`
   (8 dimensões) para **cada** escola (linhas 1120-1146).
5. `buildSaudeOperacionalPage` aplica busca, **ordena tudo em memória**
   (`sort.SliceStable`) e **só aí recorta a página** (linhas 942-976).

➡️ **`page_size=10` não reduz o custo**: SQL, transferência do JSONB, decodificação
e cálculo são feitos para **o conjunto inteiro** antes de cortar 10 linhas.

### 5.3 `loadPedagogicoPorEscola` roda em toda requisição

```sql
-- analytics_saude_operacional.go:569-584
WITH ultimo_ano AS (SELECT MAX(ano) FROM ideb_resultados)
SELECT i.school_id, SUM(i.ideb*i.total_avaliado) FILTER(...), … 
FROM ideb_resultados i JOIN ultimo_ano u ON u.ano = i.ano
WHERE i.school_id IS NOT NULL
GROUP BY i.school_id
```

- Executada **a cada chamada** (`analytics_saude_operacional.go:1107`), sem cache.
- `MAX(ano)` + `JOIN` na própria tabela; `ideb_resultados` tem **índice em `ano`**
  e em `school_id` (`0017_create_ideb_resultados.sql:160-167`). A tabela é pequena
  (≈1.570 registros, conforme histórico de carga), então **não** é o gargalo
  dominante — mas é trabalho repetido e desnecessário por requisição.
- **Se `ideb_resultados` não existir** (migration não aplicada na base usada),
  `QueryContext` retorna erro → o handler responde **500 com a mensagem**
  `consultar pedagógico/IDEB por escola: …` (linhas 590-593, 1107-1111). Isso
  **NÃO** geraria `Failed to fetch` — geraria a mensagem do backend na UI.
  Logo, a ausência de migration é um **risco**, mas **não** é a causa do sintoma
  específico relatado.

### 5.4 A query principal não usa as views nem índice de JSONB no cálculo

O endpoint **não** consome `vw_censo_*`; faz `SELECT … cr.data` cru e decodifica em
Go. O índice GIN `idx_cr_data_gin` (`0013_performance_indexes.sql:22-23`) acelera
**extração de campos via SQL**, mas aqui o JSONB é **transferido inteiro** e
decodificado na aplicação — o índice GIN **não ajuda** este caminho. Os índices
úteis ao JOIN existem: `idx_cr_status_year` e `idx_cr_school_id`
(`0013_performance_indexes.sql:6-11`).

➡️ O custo real é **(a)** transferir ~800 blobs JSONB pela rede e **(b)** decodificá-los
em Go — ambos amplificados se o banco for **remoto** (ver 5.6).

### 5.5 `WriteTimeout` de 30 s e ausência de timeout no cliente

- Servidor: `WriteTimeout: 30 * time.Second` (`main.go:183`). Se a resposta não for
  totalmente escrita em 30 s, a conexão é **encerrada pelo servidor** → o navegador
  vê conexão abortada → **`Failed to fetch`**.
- Importante: `WriteTimeout` **não cancela** `r.Context()`; a query/processamento
  continua no servidor, mas o cliente já perdeu a conexão.
- Cliente: `apiFetch` **não** usa `AbortController` nem timeout → a aba fica em
  `loading` "pendente" até o servidor cortar (≈30 s) e então renderiza o erro.
  Isso casa com "demorou demasiadamente **ou** não carregou".

### 5.6 Ambiente local aponta para banco remoto (Railway)

Conforme registro do projeto, **não há Postgres local**; o backend local conecta no
**Railway compartilhado** via `DATABASE_URL` (ver `main.go:103-125`, que prioriza
`DATABASE_URL`/`DB_DSN`). Isso:

- Adiciona **latência de rede** a cada ida ao banco (a query pesada + a transferência
  do JSONB de ~800 censos saem do Railway até a máquina local).
- Torna **muito mais fácil** estourar os 30 s de `WriteTimeout` do que com um Postgres
  local em `localhost`.
- Sofre com variação de banda/latência do ambiente local — explica o comportamento
  intermitente ("às vezes demora, às vezes não carrega").

### 5.7 CORS e preflight — provavelmente OK

`enableCORS` (`middleware.go:9-67`):

- Trata `OPTIONS` retornando **200** (linhas 60-63).
- Expõe `Authorization` em `Access-Control-Allow-Headers` (linha 47).
- Sem `ALLOWED_ORIGINS` definido, responde `Access-Control-Allow-Origin: *`
  (linhas 41-44) — aceita `localhost:3000`.

➡️ CORS **não** é causa provável **se** o backend estiver no ar. Atenção a um detalhe:
se `ALLOWED_ORIGINS` estiver **definido** localmente sem incluir
`http://localhost:3000`, o header `Allow-Origin` **não** é emitido e o navegador
**bloqueia** a resposta → aí sim `Failed to fetch`. Verificar a env local (seção 6).

---

## 6. Pontos de maior risco

1. **Endpoint sem prefetch + custo O(N) + `WriteTimeout` 30 s + banco remoto.**
   A combinação é o cenário mais consistente com o sintoma: requisição fria, pesada,
   sobre banco remoto, estourando a janela de escrita do servidor.
2. **Paginação tardia (em memória).** Estrutural: nenhuma página é "barata".
3. **`loadPedagogicoPorEscola` por requisição, sem cache.** Não é o gargalo dominante,
   mas é trabalho repetido e ponto único de falha se `ideb_resultados` faltar.
4. **Ausência de timeout/feedback no cliente.** UX ruim: 30 s de espera → erro genérico.
5. **Divergência de ambiente local.** Backend fora do ar, `PORT` ≠ 8000,
   `NEXT_PUBLIC_API_URL` divergente ou `ALLOWED_ORIGINS` restritivo produzem o mesmo
   texto `Failed to fetch` — precisam ser descartados empiricamente.
6. **Migrations na base usada.** `infra/migrations` e `api/cmd/api/migrations` são
   **duas cópias** que devem ser mantidas em paralelo; o que roda em runtime é a
   **embarcada via `go:embed`** (`main.go:34-35,220-258`). Se a base remota não tiver
   `ideb_resultados`/`reg_integracao`, o endpoint responde **500** (não `Failed to
   fetch`), mas falha mesmo assim.

---

## 7. Como reproduzir localmente (sem corrigir)

### 7.1 Subir backend e frontend

```bash
# Backend (porta 8000 por padrão)
cd api
go run ./cmd/api/main.go
# Observar no log:
#   "Executando a partir de: …"
#   "Banco conectado!"
#   "applyMigrations: N migration(s) … aplicada com sucesso"
#   "Servidor rodando porta 8000"
```

```bash
# Frontend (porta 3000)
cd web
npm run dev
```

Conferir `web/.env` / ambiente: `NEXT_PUBLIC_API_URL` deve apontar para
`http://localhost:8000` (ou para onde o backend realmente subiu).

### 7.2 Reproduzir pelo navegador

1. Acesse `http://localhost:3000/admin` e faça login (admin).
2. Abra **DevTools → Network**.
3. Clique na aba **Saúde Operacional**.
4. Capture, da requisição
   `…/v1/admin/analytics/escolas/saude-operacional?year=2026&page=1&page_size=10&…`:
   - **Status** (pendente? `(failed)`? 200? 500?);
   - **Time** (quanto tempo até falhar — perto de 30 s sugere `WriteTimeout`);
   - **Size** (tamanho do payload);
   - presença de **preflight `OPTIONS`** antes do GET e seu status;
   - aba **Console**: a mensagem exata (`TypeError: Failed to fetch` confirma
     rede; `HTTP 500`/mensagem do backend aponta para erro de aplicação).
5. **Log do backend** no mesmo intervalo: procurar por
   - `consultar saúde operacional das escolas: …`,
   - `consultar pedagógico/IDEB por escola: …`,
   - traços do `middleware.Recoverer` (panic),
   - ausência total de log da requisição (= nem chegou ao backend → porta/URL/CORS).

### 7.3 Testar o endpoint isolado (sem o frontend)

```bash
# Substituir <TOKEN_ADMIN> por um JWT válido (copiar do sessionStorage:
#   chave "censo_admin_token", ou da resposta de POST /v1/admin/login)
curl -v -m 120 \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  "http://localhost:8000/v1/admin/analytics/escolas/saude-operacional?year=2026&page=1&page_size=10&sort=criticidade&direction=desc"
```

Interpretação:
- **Conexão recusada** → backend fora do ar / porta errada (causa de `Failed to fetch`).
- **Demora ~30 s e a conexão cai** → `WriteTimeout` (H3) — gargalo de performance.
- **200 rápido via curl, mas falha no navegador** → suspeitar de **CORS/preflight**
  (`ALLOWED_ORIGINS`) ou de `NEXT_PUBLIC_API_URL` divergente.
- **500 com mensagem JSON** → erro de aplicação/SQL (ex.: `ideb_resultados` ausente).

Medir o tempo "puro" do endpoint:

```bash
curl -s -o NUL -w "tempo_total=%{time_total}s http=%{http_code}\n" \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  "http://localhost:8000/v1/admin/analytics/escolas/saude-operacional?year=2026&page=1&page_size=10"
```

> Observação (Windows/PowerShell): use `-o NUL`. Repetir a chamada compara
> 1ª chamada (fria) vs. seguintes; lembrando que o **cache de 5 min é do
> frontend**, não do backend — o backend recalcula a cada chamada.

---

## 8. Queries a medir com `EXPLAIN ANALYZE`

Rodar conectado à **mesma base** que o backend usa (provavelmente Railway —
confirmar `DATABASE_URL`). **Não criar índice/migration nesta fase**; apenas medir.

### 8.1 Query principal de Saúde Operacional

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.id, s.codigo_inep, COALESCE(s.nome_escola,''),
       COALESCE(s.municipio,''), COALESCE(s.dre,''), s.zona, cr.id, cr.data
FROM schools s
LEFT JOIN census_responses cr
  ON cr.school_id = s.id
 AND cr.year = 2026
 AND cr.status = 'completed'
WHERE ('' = '' OR UPPER(TRIM(s.dre)) = UPPER(TRIM('')))
  AND ('' = '' OR UPPER(TRIM(s.municipio)) = UPPER(TRIM('')))
  AND ('' = '' OR UPPER(TRIM(s.zona)) = UPPER(TRIM('')))
ORDER BY s.nome_escola, s.id;
```

Observar: uso de `idx_cr_status_year` / `idx_cr_school_id`; **tempo total vs.
tamanho de `cr.data`** (a transferência do JSONB tende a dominar o custo real,
que o `EXPLAIN` de plano não captura inteiramente — comparar com o `curl` da 7.3).

### 8.2 Query de Pedagógico/IDEB

```sql
EXPLAIN (ANALYZE, BUFFERS)
WITH ultimo_ano AS (SELECT MAX(ano) AS ano FROM ideb_resultados)
SELECT i.school_id,
       COALESCE(SUM(i.ideb*i.total_avaliado) FILTER (WHERE i.ideb IS NOT NULL AND i.total_avaliado > 0),0),
       COALESCE(SUM(i.total_avaliado)        FILTER (WHERE i.ideb IS NOT NULL AND i.total_avaliado > 0),0),
       AVG(i.ideb) FILTER (WHERE i.ideb IS NOT NULL)
FROM ideb_resultados i
JOIN ultimo_ano u ON u.ano = i.ano
WHERE i.school_id IS NOT NULL
GROUP BY i.school_id;
```

Esperado barato (tabela pequena, índice em `ano`/`school_id`). Confirmar.

### 8.3 Subconsulta do filtro de Região de Integração (quando usado)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT municipio FROM reg_integracao
WHERE UPPER(TRIM(regiao_de_integracao)) = UPPER(TRIM('<REGIAO>'));
```

Atenção: a comparação `schools.municipio IN (SELECT municipio FROM reg_integracao …)`
usa `UPPER(TRIM(...))` **sem `unaccent`** — municípios com acentuação divergente
podem não casar (documentado em `analytics_saude_operacional.go:1010-1014`).

### 8.4 Diagnóstico de índices/tabelas existentes

```sql
\d+ ideb_resultados
\d+ reg_integracao
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('census_responses','schools','ideb_resultados','reg_integracao')
ORDER BY tablename, indexname;
```

Confirmar presença de `idx_cr_status_year`, `idx_cr_school_id`, `idx_schools_dre`,
`idx_schools_municipio`, `idx_cr_data_gin` e dos índices de `ideb_resultados`.

---

## 9. Causas prováveis, ranqueadas

1. **(Mais provável) Latência/timeout do endpoint pesado sobre banco remoto.**
   Requisição fria (fora do prefetch) + custo O(todas as escolas) + transferência
   do JSONB completo a partir do Railway + `WriteTimeout` 30 s sem cancelamento →
   conexão encerrada pelo servidor → `Failed to fetch`. Casa com "demorou ou não
   carregou" e com a intermitência.
2. **Ambiente local mal apontado / backend indisponível.** `NEXT_PUBLIC_API_URL`
   divergente, backend não iniciado, `PORT` ≠ 8000 ou crash no boot. Causa clássica
   e instantânea de `Failed to fetch` — precisa ser descartada empiricamente (seção 7).
3. **CORS restritivo no ambiente local.** `ALLOWED_ORIGINS` definido **sem**
   `http://localhost:3000`. Se 2 e 1 forem descartados e o `curl` retornar 200, esta
   sobe no ranking.
4. **Panic/Recoverer durante o streaming da resposta.** Menos provável; geraria 500
   se ocorresse antes do write, mas `Failed to fetch` se a conexão quebrar durante o
   envio do JSON.
5. **(Não explica o texto, mas é falha real) `ideb_resultados`/`reg_integracao`
   ausentes na base** → **500** com mensagem do backend (não `Failed to fetch`).
   Importante para bases frescas, porém produz outro sintoma.

---

## 10. Recomendações de correção (para a PRÓXIMA etapa)

> Apenas recomendações — **nada implementado aqui**. Cada item é um PR pequeno e
> reversível, alinhado às regras do track (mudar um cartão/seção por vez).

**Curto prazo (confirmar a causa, baixo risco):**

1. **Instrumentar tempo no handler** (logar `duração` de `loadPedagogicoPorEscola`,
   da query principal e do cálculo em Go) para quantificar o gargalo real.
2. **Validar ambiente local**: conferir `NEXT_PUBLIC_API_URL`, `PORT`,
   `ALLOWED_ORIGINS`, e se o backend sobe sem erro de migration na base usada.

**Correção do gargalo (PR recomendado):**

3. **Aliviar o custo por requisição** (escolher uma ou combinar):
   - **Cache server-side** do resultado calculado por (`year` + filtros), com TTL
     curto, evitando recomputar todas as escolas a cada página/ordenação.
   - **Cachear `loadPedagogicoPorEscola`** (muda raramente; hoje roda toda chamada).
   - Avaliar **empurrar parte do trabalho para SQL/view materializada** em vez de
     transferir o JSONB inteiro e decodificar ~800 censos em Go a cada chamada
     (respeitando o padrão de views analíticas do projeto e os casts seguros).
4. **Subir o `WriteTimeout`** do servidor **ou** adotar um handler com timeout
   explícito + resposta de erro amigável, em vez de a conexão "morrer" a 30 s.
   (Tratar com cuidado: aumentar timeout mascara o gargalo; preferir 3.)

**Frontend / UX:**

5. **Incluir a aba no `prefetchDashboard`** (`DASHBOARD_ENDPOINTS`) — **somente
   depois** de aliviar o custo (item 3); caso contrário o prefetch só transfere a
   lentidão para o login.
6. **Adicionar `AbortController`/timeout no `apiFetch`** e mensagem de erro
   distinguindo "rede/timeout" de "erro do servidor", melhorando o diagnóstico para
   o usuário e evitando o `loading` indefinido.

**Robustez de dados:**

7. **Garantir/idempotência das migrations** `0017_create_ideb_resultados` e
   `0014_reg_integracao` na base usada; opcionalmente tornar `loadPedagogicoPorEscola`
   **tolerante à ausência** de `ideb_resultados` (degradar Pedagógico para "sem dados"
   em vez de 500) — **decisão de produto/metodologia**, fora do escopo deste diagnóstico.

---

## 11. Itens fora de escopo

- Implementar qualquer correção de backend, frontend, migrations ou cálculo.
- Alterar a metodologia/cálculo de Saúde Operacional, Governança ou Pedagógico.
- Alterar o importador IDEB ou a carga de `ideb_resultados`.
- Tocar no fluxo do formulário (`POST /v1/census`), na sincronização com Sheets
  ou nos endpoints `sheet-metrics` / `indicadores-metrics`.
- Mexer nas abas "Perfil dos Alunos e Resultados" e "Gestão Financeira e
  Governança" (remodeladas para outra planilha) e na "Caracterização da Rede".

---

## Conclusão direta

- **Onde está o problema:** predominantemente **backend + ambiente local**, não
  frontend. O frontend apenas **expõe** uma falha de rede (`Failed to fetch`) que vem
  de uma requisição **fria, pesada e sem timeout** atingindo um endpoint **O(todas as
  escolas)** sobre um **banco remoto**, com risco de estourar o **`WriteTimeout` de
  30 s** do servidor.
- **Evidências que sustentam:** (1) a aba é a única **fora do prefetch**
  (`shared/api.ts:57-84`); (2) o handler **pagina por último**, após carregar/calcular
  tudo (`analytics_saude_operacional.go:1120-1155`, `942-976`); (3) `WriteTimeout: 30s`
  sem timeout no cliente (`main.go:183`, `shared/api.ts:33-53`); (4) `Failed to fetch`
  é, por contrato do navegador, **erro de rede** — 500/401 produziriam outras mensagens;
  (5) base remota (Railway) amplifica latência e transferência de JSONB.
- **PR de correção recomendado depois do diagnóstico:** **aliviar o custo por
  requisição do endpoint** (cache server-side do resultado por `year`+filtros e/ou do
  Pedagógico; avaliar mover trabalho para SQL/view), e **só então** incluir a aba no
  prefetch; em paralelo, **timeout + mensagem de erro no `apiFetch`** e revisão do
  `WriteTimeout`. Antes disso, um PR mínimo de **instrumentação de tempo** confirma o
  gargalo com números.
