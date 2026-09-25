import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { adminCredentials, apiGet, apiRawPost, apiURL, loginViaAPI, randomPassword } from "./helpers";

test.describe.configure({ mode: "serial" });
const suffix = Date.now().toString(36);
let token = "";
let readyDreID = 0;
let missingDreID = 0;
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
  ignoredDreID = await createDre(request, `DRE-E2E-TEST-${suffix}`, "E2E", `ignored.${suffix}@example.test`);
  await openManagement(page);

  const bulkButton = page.getByRole("button", { name: "Gerar acessos de todas as DREs", exact: true });
  await expect(bulkButton).toBeVisible(); await bulkButton.click();
  const modal = page.getByRole("dialog", { name: "Provisionar acessos das DREs" });
  await expect(modal.getByText(`DRE BULK READY ${suffix}`, { exact: true })).toBeVisible();
  await expect(modal.getByText("Pronta", { exact: true })).toHaveCount(2);
  await expect(modal.getByText("Ignorada — fixture E2E", { exact: true })).toBeVisible();
  await expect(modal.getByLabel(`E-mail DRE BULK EMAIL ${suffix}`)).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Provisionar e baixar TXT" }).click();
  const download = await downloadPromise; const path = await download.path(); expect(path).toBeTruthy();
  const fs = await import("node:fs/promises"); const content = await fs.readFile(path!, "utf8");
  expect(content).toContain("CENSO OPERACIONAL — ACESSOS INICIAIS"); expect(content).toContain("Senha temporária:"); expect(content).toContain("E-mail: não informado");
  await expect(modal.getByText(/contas criadas/)).toBeVisible(); await modal.getByRole("button", { name: "Fechar", exact: true }).click();

  const users = await apiGet<Array<{ role:string;dre_id:number;email:string;must_change_password:boolean;data_scope:string;dre_ids:number[];permissions:string[] }>>(request, token, "/v1/admin/users");
  for (const id of [readyDreID, missingDreID]) { const user=users.find((item)=>item.dre_id===id);expect(user).toBeTruthy();expect(user).toMatchObject({role:"dre",must_change_password:true,data_scope:"selected"});expect(user!.dre_ids).toEqual([id]);expect(user!.permissions.sort()).toEqual(["analytics.read","census.read","reports.read"]); }
  expect(users.some((item)=>item.dre_id===ignoredDreID)).toBe(false);
  expect(users.find((item)=>item.dre_id===missingDreID)?.email).toBeUndefined();
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

test("delete DRE vazia e explica dependências sem remover DRE ocupada", async ({ page, request }) => {
  const admin=adminCredentials();token=await loginViaAPI(request,admin.username,admin.password,"198.51.100.182");await page.addInitScript((value)=>sessionStorage.setItem("censo_admin_token",value),token);await page.goto("/admin/");const emptyName=`DRE DELETE EMPTY ${suffix}`;const busyName=`DRE DELETE BUSY ${suffix}`;await createDre(request,emptyName,"DEL",`empty.${suffix}@example.test`);const busyID=await createDre(request,busyName,"BUS",`busy.${suffix}@example.test`);const password=await randomPassword();const user=await apiRawPost(request,token,"/v1/admin/users",{username:`dre.busy.${suffix}`,email:`busy.user.${suffix}@example.test`,password,role:"dre",dre_id:busyID});expect(user.status(),await user.text()).toBe(201);
  await openManagement(page);const emptyRow=page.getByRole("row").filter({hasText:emptyName});await emptyRow.getByTitle("Excluir DRE").click();let modal=page.getByRole("dialog",{name:"Excluir DRE?"});await modal.getByRole("button",{name:"Excluir DRE"}).click();await expect(emptyRow).toHaveCount(0);
  const busyRow=page.getByRole("row").filter({hasText:busyName});await busyRow.getByTitle("Excluir DRE").click();modal=page.getByRole("dialog",{name:"Excluir DRE?"});await modal.getByRole("button",{name:"Excluir DRE"}).click();await expect(modal.getByText("Não é possível excluir esta DRE.")).toBeVisible();await expect(modal.getByText("Usuários: 1")).toBeVisible();await expect(busyRow).toBeVisible();
  const remaining=await apiGet<Array<{id:number}>>(request,token,"/v1/admin/dres");expect(remaining.some((item)=>item.id===busyID)).toBe(true);
});
