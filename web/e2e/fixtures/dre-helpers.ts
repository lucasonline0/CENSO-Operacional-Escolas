const API_BASE = process.env.API_URL ?? "http://localhost:8000";

export interface DREItem {
  id: number;
  nome: string;
  sigla: string;
  municipio_sede: string;
  polo: string;
  gestor_nome: string;
  email: string;
  telefone: string;
  ativa: boolean;
}

export interface AdminUserItem {
  id: number;
  username: string;
  role: string;
  dre: string;
  dre_id: number | null;
  active: boolean;
}

async function apiRequest<T>(
  path: string,
  token: string,
  opts?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  const json = await res.json() as { data?: T; message?: string };
  if (!res.ok) {
    throw new Error(`API ${opts?.method ?? "GET"} ${path} failed: ${json.message ?? res.status}`);
  }
  return json.data as T;
}

export async function createDRE(
  token: string,
  payload: { nome: string; sigla?: string; municipio_sede?: string; polo?: string; ativa?: boolean },
): Promise<DREItem> {
  return apiRequest<DREItem>("/v1/admin/dres", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listDREs(token: string): Promise<DREItem[]> {
  return apiRequest<DREItem[]>("/v1/admin/dres", token);
}

export async function updateDRE(
  token: string,
  id: number,
  payload: Partial<DREItem>,
): Promise<DREItem> {
  return apiRequest<DREItem>(`/v1/admin/dres/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateDREStatus(
  token: string,
  id: number,
  ativa: boolean,
): Promise<DREItem> {
  return apiRequest<DREItem>(`/v1/admin/dres/${id}`, token, {
    method: "PUT",
    body: JSON.stringify({ ativa }),
  });
}

export async function createDREUser(
  token: string,
  payload: { username: string; password: string; role?: string; dre: string },
): Promise<AdminUserItem> {
  return apiRequest<AdminUserItem>("/v1/admin/users", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminUsers(token: string): Promise<AdminUserItem[]> {
  return apiRequest<AdminUserItem[]>("/v1/admin/users", token);
}

export async function updateUserStatus(
  token: string,
  id: number,
  active: boolean,
): Promise<AdminUserItem> {
  return apiRequest<AdminUserItem>(`/v1/admin/users/${id}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function resetUserPassword(
  token: string,
  id: number,
  password: string,
): Promise<{ message?: string }> {
  return apiRequest<{ message?: string }>(`/v1/admin/users/${id}/reset-password`, token, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function generatePassword(length = 14): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

let counter = 0;
export function uniqueSuffix(): string {
  counter++;
  return `${Date.now()}_${counter}`;
}
