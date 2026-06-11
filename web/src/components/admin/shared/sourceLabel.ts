import type { DashboardFilters } from "./types";

// Helpers compartilhados para o label de fonte das abas que consomem
// PostgreSQL. O ano exibido deve refletir o filtro global selecionado
// pelo operador; quando nenhum ano é escolhido, o backend usa seu padrão.

export function formatAnoReferencia(filters?: DashboardFilters): string {
  return filters?.ano ? `ano ${filters.ano}` : "ano padrão do backend";
}

export function buildPostgresSourceLabel(filters?: DashboardFilters): string {
  return `PostgreSQL · ${formatAnoReferencia(filters)} · censos concluídos`;
}
