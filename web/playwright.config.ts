import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

// A suíte E2E de Perfil DRE roda contra a stack REAL (PostgreSQL + API Go +
// Next.js). Nenhum mock substitui autenticação, autorização, /admin/me ou
// analytics. As URLs e credenciais são fornecidas pelo orquestrador
// (scripts/dre-e2e/run-e2e.sh ou o workflow .github/workflows/dre-e2e-ci.yml).
const webURL = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const apiURL = process.env.E2E_API_URL ?? "http://localhost:8000";
const isCI = !!process.env.CI;

// Workers = 1: a stack é real e o login tem rate limit por IP (5 tentativas/15min).
// Execução serial evita estourar a janela e mantém o estado determinístico
// (tokens são compartilhados entre testes do mesmo arquivo via addInitScript).
const reporter: PlaywrightTestConfig["reporter"] = isCI
  ? [
      ["github"],
      ["html", { outputFolder: "playwright-report", open: "never" }],
    ]
  : [
      ["list"],
      ["html", { outputFolder: "playwright-report", open: "never" }],
    ];

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./playwright/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter,
  use: {
    baseURL: webURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  outputDir: "test-results",
  metadata: { apiURL, webURL },
});