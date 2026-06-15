// Constantes compartilhadas pela página /admin.
// Extraídas de web/src/app/admin/page.tsx no PR de refactor estrutural —
// valores baseados em variáveis CSS para suportar Dark Mode.

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const TOKEN_KEY = "censo_admin_token";

// Temporário: o dashboard atual está fixado no ciclo do Censo Escolar 2026.
// Usado como fallback de `year` quando nenhum ano é escolhido nos filtros globais.
export const DASHBOARD_REFERENCE_YEAR = 2026;

export const ZONA_COLORS: Record<string, string> = {
  "Urbana": "var(--zona-urbana)",
  "Rural": "var(--zona-rural)",
  "Ribeirinha": "var(--zona-ribeirinha)",
  "Não informado": "var(--zona-outros)",
};

export const PORTE_COLORS = [
  "var(--porte-1)",
  "var(--porte-2)",
  "var(--porte-3)",
  "var(--porte-4)",
  "var(--porte-5)",
  "var(--porte-6)",
];

export const C = {
  primary:      "var(--accent)",
  primaryLight: "var(--accent-soft)",
  pageBg:       "var(--bg)",
  success:      "var(--pos)",
  warning:      "var(--warn)",
  danger:       "var(--neg)",
};
