type DreLike = { nome?: unknown };

function normalizeLegacyDreName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/á/g, "a")
    .replace(/\s+/g, " ");
}

export function isInvalidLegacyDreName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = normalizeLegacyDreName(value);
  return /^0?2(?:a|ª)?\s+ure\s*-\s*cameta$/.test(normalized);
}

export function sanitizeLegacyDrePayload<T>(path: string, data: T): T {
  if (path === "/v1/admin/dres" && Array.isArray(data)) {
    return data.filter((item) => !isInvalidLegacyDreName((item as DreLike | null)?.nome)) as T;
  }

  if (
    path.startsWith("/v1/admin/analytics/filtros/opcoes") &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    const payload = data as Record<string, unknown>;
    if (Array.isArray(payload.dres)) {
      return {
        ...payload,
        dres: payload.dres.filter((name) => !isInvalidLegacyDreName(name)),
      } as T;
    }
  }

  return data;
}
