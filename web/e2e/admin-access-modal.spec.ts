import { expect, test } from "@playwright/test";
import { adminCredentials, loginViaUI } from "./helpers";

test("modelo manual permanece estável e separa território de capabilities", async ({ page }) => {
  const admin = adminCredentials();
  await loginViaUI(page, admin.username, admin.password);
  await page.getByText("Gestão de DREs e Acessos", { exact: true }).click();
  await page.getByRole("button", { name: "Nova conta" }).click();

  const modal = page.getByRole("dialog");
  const custom = modal.getByRole("button", { name: "Personalizado", exact: true });
  await custom.click();
  await page.waitForTimeout(2_000);
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  await expect(modal.getByRole("button", { name: "Acesso DRE", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "DREs selecionadas", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Todas as DREs", exact: true })).toHaveCount(0);

  await modal.getByLabel("Buscar DRE").fill("DRE");
  await modal.locator('input[type="checkbox"]').first().check();
  await modal.getByText("Visualizar contas", { exact: true }).click();
  await modal.getByLabel("E-mail institucional").fill("modal.persistence@example.test");
  await modal.getByLabel("Nome de usuário").fill("modal.persistence");
  await expect(custom).toHaveAttribute("aria-pressed", "true");
  expect(await modal.locator('input[type="checkbox"]').count()).toBeGreaterThan(0);

  const global = modal.getByRole("button", { name: "Consulta global", exact: true });
  await global.click();
  await page.waitForTimeout(2_000);
  await expect(global).toHaveAttribute("aria-pressed", "true");
  await expect(modal.getByLabel("Buscar DRE")).toHaveCount(0);
  await expect(modal.getByText("Permissões", { exact: true })).toBeVisible();
  await expect(modal.getByText("Visualizar contas", { exact: true })).toBeVisible();
});
