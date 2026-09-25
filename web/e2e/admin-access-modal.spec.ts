import { expect, test } from "@playwright/test";
import { adminCredentials, loginViaUI } from "./helpers";

test("modelo manual permanece estável e separa território de capabilities", async ({ page }) => {
  const admin = adminCredentials();
  await loginViaUI(page, admin.username, admin.password);
  await page.getByText("Gestão de DREs e Acessos", { exact: true }).click();
  await page.getByRole("button", { name: "Nova conta" }).click();

  const custom = page.getByRole("button", { name: "Personalizado", exact: true });
  await custom.click();
  await page.waitForTimeout(2_000);
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Acesso DRE" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "DREs selecionadas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Todas as DREs" })).toHaveCount(0);

  await page.getByLabel("Buscar DRE").fill("DRE");
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByText("Visualizar contas", { exact: true }).click();
  await page.getByLabel("E-mail institucional").fill("modal.persistence@example.test");
  await page.getByLabel("Nome de usuário").fill("modal.persistence");
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator('input[type="checkbox"]').count()).toBeGreaterThan(0);

  const global = page.getByRole("button", { name: "Consulta global", exact: true });
  await global.click();
  await page.waitForTimeout(2_000);
  await expect(global).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Buscar DRE")).toHaveCount(0);
  await expect(page.getByText("Permissões", { exact: true })).toBeVisible();
  await expect(page.getByText("Visualizar contas", { exact: true })).toBeVisible();
});
