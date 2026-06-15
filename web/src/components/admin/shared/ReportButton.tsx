"use client";

// Botão reutilizável de geração de relatórios gerenciais XLSX.
// Consome a rota genérica protegida GET /v1/admin/reports/{reportId}, já existente
// e validada no backend. Repassa os filtros globais ativos do dashboard, baixa o
// arquivo respeitando o filename do header Content-Disposition e trata loading,
// autenticação expirada (401) e erros amigáveis sem quebrar a UI.

import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { API, DASHBOARD_REFERENCE_YEAR } from "./constants";
import type { DashboardFilters } from "./types";

type ReportButtonProps = {
  reportId: string;
  token: string;
  filters?: DashboardFilters;
  onUnauth: () => void;
  label?: string;
  className?: string;
};

// Monta a query string do relatório: format=xlsx + ano de referência + filtros
// globais ativos. Filtros vazios não são enviados.
function buildReportQuery(filters?: DashboardFilters): string {
  const p = new URLSearchParams();
  p.set("format", "xlsx");

  const year = filters?.ano ?? DASHBOARD_REFERENCE_YEAR;
  if (year) p.set("year", String(year));
  if (filters?.dre)               p.set("dre", filters.dre);
  if (filters?.municipio)         p.set("municipio", filters.municipio);
  if (filters?.zona)              p.set("zona", filters.zona);
  if (filters?.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);

  return p.toString();
}

// Extrai o filename do header Content-Disposition, tolerando os formatos
// `filename*=UTF-8''...` (RFC 5987) e `filename="..."`. Usa o fallback quando o
// header não vem ou não pôde ser interpretado.
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;

  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // ignora e tenta o formato simples abaixo
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain?.[1]) return plain[1].trim();

  return fallback;
}

export function ReportButton({
  reportId,
  token,
  filters,
  onUnauth,
  label = "Gerar relatório",
  className = "",
}: ReportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    if (loading) return; // evita duplo clique
    setLoading(true);
    setError("");

    try {
      const qs = buildReportQuery(filters);
      const res = await fetch(`${API}/v1/admin/reports/${reportId}?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        onUnauth();
        return;
      }

      if (!res.ok) {
        let msg = "Não foi possível gerar o relatório.";
        try {
          const body = await res.json();
          if (body && typeof body.message === "string" && body.message.trim()) {
            msg = body.message;
          }
        } catch {
          // corpo não-JSON: mantém a mensagem amigável padrão
        }
        setError(msg);
        return;
      }

      const blob = await res.blob();
      const year = filters?.ano ?? DASHBOARD_REFERENCE_YEAR;
      const fallbackName = `${reportId}-${year}.xlsx`;
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Não foi possível gerar o relatório.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {loading ? "Gerando..." : label}
      </button>
      {error && (
        <span className="text-[11px] text-rose-600 text-right max-w-xs" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
