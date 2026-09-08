import { FullConfig } from "@playwright/test";

// Smoke check da stack REAL antes da suíte: API Go e Next.js precisam responder.
// Este setup NÃO faz login (o login tem rate limit por IP de 5 tentativas/15min)
// para não gastar a janela — a validação de contas/roles acontece dentro da
// suíte através dos endpoints reais.
const required = ["E2E_WEB_URL", "E2E_API_URL", "E2E_ADMIN_USERNAME", "E2E_ADMIN_PASSWORD",
  "E2E_DRE_A_USERNAME", "E2E_DRE_A_PASSWORD", "E2E_DRE_A_NAME",
  "E2E_DRE_B_USERNAME", "E2E_DRE_B_PASSWORD", "E2E_DRE_B_NAME"];

export default async function globalSetup(_config: FullConfig) {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `E2E: variáveis de ambiente ausentes (${missing.join(", ")}). ` +
      `A suíte E2E exige a stack real provisionada por scripts/dre-e2e/run-e2e.sh ` +
      `ou pelo workflow .github/workflows/dre-e2e-ci.yml.`
    );
  }

  const webURL = process.env.E2E_WEB_URL!;
  const apiURL = process.env.E2E_API_URL!;

  const api = await fetch(`${apiURL}/v1/health`);
  if (!api.ok) {
    throw new Error(`E2E: API Go indisponível em ${apiURL}/v1/health (HTTP ${api.status})`);
  }

  const web = await fetch(`${webURL}/admin/`);
  if (!web.ok) {
    throw new Error(`E2E: frontend Next.js indisponível em ${webURL}/admin/ (HTTP ${web.status})`);
  }

  console.log(`[global-setup] stack real OK: web=${webURL} api=${apiURL}`);
}