# Matriz de autorização da API administrativa

Todas as rotas abaixo passam, nesta ordem, por autenticação runtime (estado da
conta, `must_change_password`, DRE ativa e `auth_version`) e capability. Rotas
desconhecidas no grupo protegido são negadas por padrão.

| Método | Rota | Capability | Data scope | Checagem de objeto |
|---|---|---|---|---|
| GET | `/v1/admin/me` | bootstrap autenticado | runtime | própria conta |
| POST | `/v1/admin/me/change-password` | bootstrap autenticado | runtime | própria conta, senha atual |
| GET | `/v1/admin/dashboard` | `analytics.read` | interseção `all/selected` | DRE canônica |
| GET | `/v1/admin/sheet-metrics`, `/indicadores-metrics` | `analytics.read` | runtime | somente serviço autorizado |
| GET | `/v1/admin/census`, `/census/{id}` | `census.read` | interseção `all/selected` | censo → escola → DRE |
| GET | `/v1/admin/analytics/*` | `analytics.read` | interseção `all/selected` | escola/filtro → DRE |
| GET | `/v1/admin/reports/{report_id}` | `reports.read` | interseção `all/selected` | linhas → DRE |
| POST | `/v1/admin/sync-sheets` | `sync.execute` | runtime | operação global explícita |
| GET | `/v1/admin/dres` | `dres.manage`, `users.read` ou `users.create` | lista intersectada | DRE por ID |
| POST | `/v1/admin/dres` | `dres.manage` | `all` | criação global |
| PUT | `/v1/admin/dres/{id}` | `dres.manage` | `all/selected` | ID da DRE no escopo |
| GET | `/v1/admin/dres/{id}/resumo` | `analytics.read` | `all/selected` | ID da DRE no escopo |
| POST | `/v1/admin/dres/{id}/schools` | `schools.manage_dre` | `all/selected` | origem e destino no escopo |
| PATCH | `/v1/admin/schools/{id}/dre` | `schools.manage_dre` | `all/selected` | escola real e destino no escopo |
| GET | `/v1/admin/users` | `users.read` | `all/selected` | contas visíveis por território |
| POST | `/v1/admin/users` | `users.create` | subset-only | grants e DREs subordinados |
| PUT | `/v1/admin/users/{id}/authorization` | `users.manage` | subset-only | alvo atual e grants novos subordinados |
| PATCH | `/v1/admin/users/{id}/status` | `users.manage` | subset-only | alvo subordinado, nunca self |
| POST | `/v1/admin/users/{id}/reset-password` | `users.reset_password` | subset-only | alvo subordinado, nunca self |

O admin de ambiente recebe bypass explícito. Contas DRE legadas são
normalizadas para leitura censitária/analítica/relatórios e escopo `selected`.
Alterações de autorização, senha, reset ou status rotacionam/revalidam a sessão;
assim, o JWT anterior deixa de autorizar na requisição seguinte.
