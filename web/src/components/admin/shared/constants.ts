// Constantes compartilhadas pela página /admin.
// Extraídas de web/src/app/admin/page.tsx no PR de refactor estrutural —
// valores idênticos ao original.

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const TOKEN_KEY = "censo_admin_token";

export const ZONA_COLORS: Record<string, string> = {
  "Urbana": "#1E5B8A", "Rural": "#F59E0B", "Ribeirinha": "#8B5CF6", "Não informado": "#94A3B8",
};
export const PORTE_COLORS = ["#93C5FD","#60A5FA","#3B82F6","#2563EB","#1D4ED8","#1E40AF"];

export const C = {
  primary:      "#1E5B8A",
  primaryLight: "#CFE7F5",
  pageBg:       "#F0F6FB",
  success:      "#10B981",
  warning:      "#F59E0B",
  danger:       "#EF4444",
};
