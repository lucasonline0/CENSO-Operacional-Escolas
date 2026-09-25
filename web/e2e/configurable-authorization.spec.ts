// E2E de autorização configurável contra a stack REAL.
// Cobre contas custom, multi-DRE, delegação subset-only e revogação imediata
// após edição de permissions/scope. Nenhum mock de auth/API/banco é usado.
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  adminCredentials,
  apiGet,
  apiRaw,
  apiRawPost,
  apiRawPut,
  apiURL,
  dreA,
  dreB,
  loginViaAPI,
  randomPassword,
} from "./helpers";

test.describe.configure({ mode: "serial" });

type DRE = { id: number; nome: string; ativa: boolean };
type CreatedUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  permissions?: string[];
  data_scope?: string;
  dre_ids?: number[];
};
type CensusPayload = { rows: Array<{ dre: string; nome_escola?: string }>; total: number };
type FilterOptions = { dres: string[] };
type UserListItem = {
  id: number;
  username: string;
  role: string;
  dre_id: number | null;
  dre_ids?: number[];
  data_scope?: string;
};

const suffix = Date.now().toString(36);
const ips = [
  "198.51.100.70",
  "198.51.100.71",
  "198.51.100.72",
  "198.51.100.73",
  "198.51.100.74",
  "198.51.100.75",
];

let adminToken = "";
let dreAID = 0;
let dreBID = 0;
let dreCID = 0;
let dreCName = "";

let globalUser: CreatedUser | null = null;
let globalToken = "";

let multiUser: CreatedUser | null = null;
let multiToken = "";
let multiPassword = "";

let delegateUser: CreatedUser | null = null;
let delegateToken = "";

async function createCustom(
  request: APIRequestContext,
  username: string,
  permissions: string[],
  dataScope: "all" | "selected",
  dreIDs: number[],
): Promise<{ user: CreatedUser; temporaryPassword: string }> {
  const temporaryPassword = await randomPassword();
  const response = await apiRawPost(request, adminToken, "/v1/admin/users", {
    username,
    email: `${username}@example.test`,
    password: temporaryPassword,
    role: "custom",
    permissions,
    data_scope: dataScope,
    dre_ids: dreIDs,
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { data: CreatedUser };
  return { user: body.data, temporaryPassword };
}

async function finishFirstAccess(
  request: APIRequestContext,
  username: string,
  temporaryPassword: string,
  ip: string,
): Promise<{ token: string; password: string }> {
  const login = await request.post(`${apiURL}/v1/admin/login`, {
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    data: JSON.stringify({ username, password: temporaryPassword }),
  });
  expect(login.status(), await login.text()).toBe(403);
  const setup = (await login.json()) as {
    code: string;
    data: { challenge_token: string };
  };
  expect(setup.code).toBe("PASSWORD_SETUP_REQUIRED");
  expect(setup.data.challenge_token).toBeTruthy();

  const password = await randomPassword();
  const completed = await request.post(`${apiURL}/v1/admin/first-access/password`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${setup.data.challenge_token}`,
    },
    data: JSON.stringify({ new_password: password, confirm_password: password }),
  });
  expect(completed.status(), await completed.text()).toBe(200);
  const body = (await completed.json()) as { data: { token: string } };
  expect(body.data.token).toBeTruthy();
  return { token: body.data.token, password };
}

test("1 — prepara DREs e admin real para matriz configurável", async ({ request }) => {
  const admin = adminCredentials();
  adminToken = await loginViaAPI(request, admin.username, admin.password, ips[0]);

  const dres = await apiGet<DRE[]>(request, adminToken, "/v1/admin/dres");
  const a = dres.find((d) => d.nome === dreA().name);
  const b = dres.find((d) => d.nome === dreB().name);
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  dreAID = a!.id;
  dreBID = b!.id;

  dreCName = `DRE CUSTOM C ${suffix}`;
  const created = await apiRawPost(request, adminToken, "/v1/admin/dres", {
    nome: dreCName,
    sigla: "CST",
    municipio_sede: "Município Custom",
    ativa: true,
  });
  expect(created.status(), await created.text()).toBe(201);
  const createdBody = (await created.json()) as { data: DRE };
  dreCID = createdBody.data.id;
  expect(dreCID).toBeGreaterThan(0);
});

test("2 — custom global read-only lê rede inteira e não ganha administração", async ({ request }) => {
  const created = await createCustom(
    request,
    `e2e.global.readonly.${suffix}`,
    ["census.read", "analytics.read", "reports.read"],
    "all",
    [],
  );
  globalUser = created.user;
  const activated = await finishFirstAccess(
    request,
    globalUser.email,
    created.temporaryPassword,
    ips[1],
  );
  globalToken = activated.token;

  const census = await apiGet<CensusPayload>(request, globalToken, "/v1/admin/census");
  const visibleDres = new Set(census.rows.map((row) => row.dre));
  expect(visibleDres.has(dreA().name)).toBe(true);
  expect(visibleDres.has(dreB().name)).toBe(true);

  expect((await apiRaw(request, globalToken, "/v1/admin/analytics/filtros/opcoes")).status()).toBe(200);
  expect((await apiRaw(request, globalToken, "/v1/admin/users")).status()).toBe(403);
  expect((await apiRaw(request, globalToken, "/v1/admin/dres")).status()).toBe(403);
  expect((await apiRawPost(request, globalToken, "/v1/admin/sync-sheets")).status()).toBe(403);
});

test("3 — custom multi-DRE A+B não consegue ampliar para C", async ({ request }) => {
  const created = await createCustom(
    request,
    `e2e.multi.${suffix}`,
    ["census.read", "analytics.read", "reports.read"],
    "selected",
    [dreAID, dreBID],
  );
  multiUser = created.user;
  const activated = await finishFirstAccess(
    request,
    multiUser.email,
    created.temporaryPassword,
    ips[2],
  );
  multiToken = activated.token;
  multiPassword = activated.password;

  const options = await apiGet<FilterOptions>(
    request,
    multiToken,
    "/v1/admin/analytics/filtros/opcoes",
  );
  expect(options.dres).toEqual(expect.arrayContaining([dreA().name, dreB().name]));
  expect(options.dres).not.toContain(dreCName);

  const census = await apiGet<CensusPayload>(request, multiToken, "/v1/admin/census");
  expect(census.rows.length).toBeGreaterThan(0);
  expect(census.rows.every((row) => row.dre === dreA().name || row.dre === dreB().name)).toBe(true);

  expect((await apiRaw(request, multiToken, `/v1/admin/dres/${dreAID}/resumo`)).status()).toBe(200);
  expect((await apiRaw(request, multiToken, `/v1/admin/dres/${dreBID}/resumo`)).status()).toBe(200);
  expect((await apiRaw(request, multiToken, `/v1/admin/dres/${dreCID}/resumo`)).status()).toBe(403);
});

test("4 — delegação é subset-only e self-edit continua proibido", async ({ request }) => {
  const created = await createCustom(
    request,
    `e2e.delegate.${suffix}`,
    ["users.create", "users.manage", "census.read"],
    "selected",
    [dreAID, dreBID],
  );
  delegateUser = created.user;
  const activated = await finishFirstAccess(
    request,
    delegateUser.email,
    created.temporaryPassword,
    ips[3],
  );
  delegateToken = activated.token;

  const childPassword = await randomPassword();
  const validChild = await apiRawPost(request, delegateToken, "/v1/admin/users", {
    username: `e2e.child.ok.${suffix}`,
    email: `e2e.child.ok.${suffix}@example.test`,
    password: childPassword,
    role: "custom",
    permissions: ["census.read"],
    data_scope: "selected",
    dre_ids: [dreAID],
  });
  expect(validChild.status(), await validChild.text()).toBe(201);

  const superiorPermission = await apiRawPost(request, delegateToken, "/v1/admin/users", {
    username: `e2e.child.permission.${suffix}`,
    email: `e2e.child.permission.${suffix}@example.test`,
    password: await randomPassword(),
    role: "custom",
    permissions: ["census.read", "analytics.read"],
    data_scope: "selected",
    dre_ids: [dreAID],
  });
  expect(superiorPermission.status()).toBe(403);

  const foreignDre = await apiRawPost(request, delegateToken, "/v1/admin/users", {
    username: `e2e.child.foreign.${suffix}`,
    email: `e2e.child.foreign.${suffix}@example.test`,
    password: await randomPassword(),
    role: "custom",
    permissions: ["census.read"],
    data_scope: "selected",
    dre_ids: [dreCID],
  });
  expect(foreignDre.status()).toBe(403);

  const globalEscalation = await apiRawPost(request, delegateToken, "/v1/admin/users", {
    username: `e2e.child.global.${suffix}`,
    email: `e2e.child.global.${suffix}@example.test`,
    password: await randomPassword(),
    role: "custom",
    permissions: ["census.read"],
    data_scope: "all",
    dre_ids: [],
  });
  expect(globalEscalation.status()).toBe(403);

  const selfEdit = await apiRawPut(
    request,
    delegateToken,
    `/v1/admin/users/${delegateUser.id}/authorization`,
    {
      permissions: ["users.create", "users.manage", "census.read"],
      data_scope: "selected",
      dre_ids: [dreAID, dreBID],
    },
  );
  expect(selfEdit.status()).toBe(403);
});

test("5 — users.read enxerga apenas contas do próprio território", async ({ request }) => {
  const created = await createCustom(
    request,
    `e2e.reader.${suffix}`,
    ["users.read"],
    "selected",
    [dreAID],
  );
  const activated = await finishFirstAccess(
    request,
    created.user.email,
    created.temporaryPassword,
    ips[4],
  );

  const users = await apiGet<UserListItem[]>(
    request,
    activated.token,
    "/v1/admin/users",
  );
  const usernames = users.map((user) => user.username);
  expect(usernames).toContain(dreA().username);
  expect(usernames).not.toContain(dreB().username);

  const createAttempt = await apiRawPost(request, activated.token, "/v1/admin/users", {
    username: `e2e.reader.denied.${suffix}`,
    email: `e2e.reader.denied.${suffix}@example.test`,
    password: await randomPassword(),
    role: "custom",
    permissions: [],
    data_scope: "selected",
    dre_ids: [dreAID],
  });
  expect(createAttempt.status()).toBe(403);
});

test("6 — editar autorização revoga token e reduz capability/scope imediatamente", async ({ request }) => {
  expect(multiUser).toBeTruthy();
  expect(multiToken).toBeTruthy();
  expect(multiPassword).toBeTruthy();

  const update = await apiRawPut(
    request,
    adminToken,
    `/v1/admin/users/${multiUser!.id}/authorization`,
    {
      permissions: ["census.read"],
      data_scope: "selected",
      dre_ids: [dreAID],
    },
  );
  expect(update.status(), await update.text()).toBe(200);

  expect((await apiRaw(request, multiToken, "/v1/admin/me")).status()).toBe(401);

  const freshToken = await loginViaAPI(
    request,
    multiUser!.email,
    multiPassword,
    ips[5],
  );
  expect(freshToken).toBeTruthy();

  expect((await apiRaw(request, freshToken, "/v1/admin/analytics/filtros/opcoes")).status()).toBe(403);

  const census = await apiGet<CensusPayload>(request, freshToken, "/v1/admin/census");
  expect(census.rows.length).toBeGreaterThan(0);
  expect(census.rows.every((row) => row.dre === dreA().name)).toBe(true);

  expect((await apiRaw(request, freshToken, `/v1/admin/dres/${dreBID}/resumo`)).status()).toBe(403);
});
