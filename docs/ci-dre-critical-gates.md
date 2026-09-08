# CI: checks obrigatórios para merge (gates DRE críticos)

Antes de mergear em `develop`, os checks abaixo devem estar verdes.
Todos rodam contra PostgreSQL 16 real efêmero e não dependem de estado externo.

## API CI (`.github/workflows/api-ci.yml`)

1. **DRE critical migrations gate**
   - Aplica a cadeia administrativa crítica em ordem (`0014` → `0018` → `0019` → `0020` → `0021` → `0024`) com `ON_ERROR_STOP=1`.
   - Roda `applyMigrations` (loader real de runtime) e os testes de fail-closed/idempotência em schemas isolados.
   - Falha de migration administrativa crítica — inclusive futura — torna o CI vermelho.

2. **DRE lifecycle & auth gate**
   - Contratos de lifecycle DRE + autenticação (cobre #209), via `dre_lifecycle_*`, `dre_runtime_auth_*` e `dre_lifecycle_contracts`.
   - Schemas isolados por teste; reprova se o lifecycle/autenticação DRE regredir.

3. **API integration gate**
   - Inicializa PostgreSQL com `init.sql` + `0014` → `0018` → `0019` → `0020` → `0021` → `0024` antes de `go vet ./...` e `go test ./...`.
   - `TestDREIntegrationSchemaIsCanonicalPost0021` exige `schools.dre_id`, a FK canônica e os índices normalizados de `0021`; portanto a suíte ampla não pode passar se for inicializada apenas até `0019`.
   - Stress/race DRE atuais: propriedades (20k/50k cenários), batch (1000 escolas), remap (1000 escolas/5 ciclos) e `-race` do fluxo de integração.

## Web CI (`.github/workflows/web-ci.yml`)

4. **Web build & lint**
   - `npm ci` (lockfile) + `npm run lint` + `npm run build`.
   - Roda em todo pull request para `develop`, para que o contexto requerido exista também quando a alteração não tocar `web/**`.

## Proteção obrigatória da `develop`

Auditoria refeita em **2026-09-08**:

- o repositório possui **zero repository rulesets** ativos;
- o endpoint de branch protection exige permissão administrativa e a integração GitHub usada na auditoria não possui essa permissão (`403 Resource not accessible by integration`);
- portanto a proteção precisa ser aplicada por um owner/admin do repositório antes de considerar #236 concluída.

A regra de proteção/ruleset da `develop` deve exigir:

- pull request obrigatório para alteração da branch;
- branch atualizada antes do merge, quando aplicável;
- bloqueio de merge se qualquer check obrigatório falhar;
- bloqueio de force-push;
- bloqueio de deleção da branch;
- os seguintes contextos obrigatórios:
  - `DRE critical migrations gate`
  - `DRE lifecycle & auth gate`
  - `API integration gate`
  - `Web build & lint`

Após aplicar a regra, validar em um PR para `develop` que os quatro checks aparecem como obrigatórios e que um check vermelho impede o merge.
