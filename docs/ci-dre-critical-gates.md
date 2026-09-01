# CI: checks obrigatórios para merge (gates DRE críticos)

Antes de mergear em `develop`, os checks abaixo devem estar verdes.
Todos rodam contra PostgreSQL 16 real efêmero e não dependem de estado externo.

## API CI (`.github/workflows/api-ci.yml`)

1. **DRE critical migrations gate**
   - Aplica a cadeia administrativa crítica em ordem (`0014` → `0018` → `0019` → `0020` → `0021`) com `ON_ERROR_STOP=1`.
   - Roda `applyMigrations` (loader real de runtime) e os testes de fail-closed/idempotência em schemas isolados.
   - Falha de migration administrativa crítica — inclusive futura — torna o CI vermelho.

2. **DRE lifecycle & auth gate**
   - Contratos de lifecycle DRE + autenticação (cobre #209), via `dre_lifecycle_*`, `dre_runtime_auth_*` e `dre_lifecycle_contracts`.
   - Schemas isolados por teste; reprova se o lifecycle/autenticação DRE regredir.

3. **API integration gate**
   - `go vet ./...` e `go test ./...` completos.
   - Stress/race DRE atuais: propriedades (20k/50k cenários), batch (1000 escolas), remap (1000 escolas/5 ciclos) e `-race` do fluxo de integração.

## Web CI (`.github/workflows/web-ci.yml`)

4. **Web build & lint**
   - `npm ci` (lockfile) + `npm run lint` + `npm run build`.
   - Roda em mudanças de `web/**`, impedindo frontend com contrato quebrado de passar sem build aplicável.