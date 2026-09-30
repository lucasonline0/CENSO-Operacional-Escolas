import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { adminCredentials, apiGet, apiRawPost, apiURL, loginViaAPI, randomPassword } from "./helpers";

test.describe.configure({ mode: "serial" });
const suffix = Date.now().toString(36);
let token = "";
let readyDreID = 0;
let missingDreID = 0;
let noEmailDreID = 0;
let ignoredDreID = 0;

async function createDre(request: APIRequestContext, name: string, sigla: string, email = "") {
  const response = await apiRawPost(request, token, "/v1/admin/dres", { nome: name, sigla, email, ativa: true });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json() as { data: { id: number } }).data.id;
}
async function openManagement(page: Page) {
  await page.getByText("Gestão de DREs e Acessos", { exact: true }).click();
  await expect(page.getByText("Administração regional")).toBeVisible();
}

test("bulk real corrige e-mail, ignora fixture e é idempotente", async ({ page, request }) => {
  const admin = adminCredentials(); token = await loginViaAPI(request, admin.username, admin.password, "198.51.100.180"); await page.addInitScript((value)=>sessionStorage.setItem("censo_admin_token",value),token); await page.goto("/admin/");
  readyDreID = await createDre(request, `DRE BULK READY ${suffix}`, "BRD", `bulk.ready.${suffix}@example.test`);
  missingDreID = await createDre(request, `DRE BULK EMAIL ${suffix}`, "BEM");
  noEmailDreID = await createDre(request, `DRE BULK NO EMAIL ${suffix}`, "BNE");
  ignoredDreID = await createDre(request, `DRE-E2E-TEST-${suffix}`, "E2E", `ignored.${suffix}@example.test`);
  await openManagement(page);

  const bulkButton = page.getByRole("button", { name: "Gerar acessos de todas as DREs", exact: true });
  await expect(bulkButton).toBeVisible(); await bulkButton.click();
  const modal = page.getByRole("dialog", { name: "Provisionar acessos das DREs" });
  await expect(modal.getByText(`DRE BULK READY ${suffix}`, { exact: true })).toBeVisible();
  await expect(modal.getByText("Pronta (sem e-mail — override opcional)", { exact: true })).toHaveCount(2);
  await expect(modal.getByLabel(`E-mail DRE BULK NO EMAIL ${suffix}`)).toBeVisible();
  await expect(modal.getByText("Ignorada — fixture E2E", { exact: true })).toBeVisible();
  await modal.getByLabel(`E-mail DRE BULK EMAIL ${suffix}`).fill(`bulk.email.${suffix}@example.test`);
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Provisionar e baixar TXT" }).click();
  const download = await downloadPromise; const path = await download.path(); expect(path).toBeTruthy();
  const fs = await import("node:fs/promises"); const content = await fs.readFile(path!, "utf8");
  expect(content).toContain("CENSO OPERACIONAL — ACESSOS INICIAIS"); expect(content).toContain("Senha temporária:");
  const noEmailBlock = content.split("----------------------------------------").find((block) => block.includes(`DRE: DRE BULK NO EMAIL ${suffix}`));
  expect(noEmailBlock).toBeTruthy(); expect(noEmailBlock).not.toContain("E-mail:");
  await expect(modal.getByText(/contas criadas/)).toBeVisible(); await modal.getByRole("button", { name: "Fechar", exact: true }).click();

  const users = await apiGet<Array<{ role:string;dre_id:number;must_change_password:boolean;data_scope:string;dre_ids:number[];permissions:string[] }>>(request, token, "/v1/admin/users");
  for (const id of [readyDreID, missingDreID, noEmailDreID]) { const user=users.find((item)=>item.dre_id===id);expect(user).toBeTruthy();expect(user).toMatchObject({role:"dre",must_change_password:true,data_scope:"selected"});expect(user!.dre_ids).toEqual([id]);expect(user!.permissions.sort()).toEqual(["analytics.read","census.read","reports.read"]); }
  expect(users.some((item)=>item.dre_id===ignoredDreID)).toBe(false);
  const dres=await apiGet<Array<{id:number;email:string}>>(request,token,"/v1/admin/dres");expect(dres.find((item)=>item.id===missingDreID)?.email).toBe(`bulk.email.${suffix}@example.test`);
  const preview=await apiGet<{pending:number}>(request,token,"/v1/admin/users/bulk-dre-bootstrap/preview");expect(preview.pending).toBe(0);
  const second=await apiRawPost(request,token,"/v1/admin/users/bulk-dre-bootstrap",{email_overrides:{}});expect(second.status(),await second.text()).toBe(200);expect((await second.json() as {data:{credentials:unknown[]}}).data.credentials).toHaveLength(0);
});

test("delete perfil revoga conta e remove da interface", async ({ page, request }) => {
  const admin=adminCredentials();token=await loginViaAPI(request,admin.username,admin.password,"198.51.100.181");await page.addInitScript((value)=>sessionStorage.setItem("censo_admin_token",value),token);await page.goto("/admin/");const password=await randomPassword();const username=`delete.user.${suffix}`;
  const created=await apiRawPost(request,token,"/v1/admin/users",{username,email:`${username}@example.test`,password,role:"custom",permissions:["census.read"],data_scope:"all",dre_ids:[]});expect(created.status(),await created.text()).toBe(201);const id=(await created.json() as {data:{id:number}}).data.id;
  await openManagement(page);const row=page.getByRole("row").filter({hasText:username});await expect(row).toBeVisible();await row.getByRole("button",{name:"Excluir perfil"}).click();const modal=page.getByRole("dialog",{name:"Excluir perfil?"});await expect(modal.getByText(`Usuário: ${username}`)).toBeVisible();await modal.getByRole("button",{name:"Excluir perfil"}).click();await expect(row).toHaveCount(0);
  expect((await apiGet<Array<{id:number}>>(request,token,"/v1/admin/users")).some((item)=>item.id===id)).toBe(false);
  const login=await request.post(`${apiURL}/v1/admin/login`,{data:{username,password}});expect(login.status()).toBe(401);
});

test("não oferece exclusão de DRE na interface", async ({ page, request }) => {
  const admin=adminCredentials();token=await loginViaAPI(request,admin.username,admin.password,"198.51.100.182");await page.addInitScript((value)=>sessionStorage.setItem("censo_admin_token",value),token);await page.goto("/admin/");const dreName=`DRE NO DELETE ${suffix}`;await createDre(request,dreName,"NDE",`nodelete.${suffix}@example.test`);
  await openManagement(page);const row=page.getByRole("row").filter({hasText:dreName});await expect(row).toBeVisible();await expect(row.getByTitle("Excluir DRE")).toHaveCount(0);await expect(page.getByRole("dialog",{name:"Excluir DRE?"})).toHaveCount(0);
});
