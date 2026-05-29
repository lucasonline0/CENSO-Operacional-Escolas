"use client";

import React, { useEffect, useState } from "react";
import {
  MonitorSmartphone, AlertCircle, Loader2, Wifi, Signal, Monitor,
  Laptop, Tablet, Projector, PenSquare, Gauge, ZapOff,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  TecnologiaInfra, TecnologiaUso,
} from "./shared/types";

type AbaTecnologiaProps = {
  token: string;
  onUnauth: () => void;
};

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("pt-BR");
}

function NoData({ msg = "Sem dados disponíveis para este indicador." }: { msg?: string }) {
  return (
    <div className="text-xs text-slate-400 italic py-6 text-center">{msg}</div>
  );
}

export function AbaTecnologia({
  token, onUnauth,
}: AbaTecnologiaProps) {
  const [infra, setInfra] = useState<TecnologiaInfra | null>(null);
  const [uso,   setUso]   = useState<TecnologiaUso | null>(null);
  const [infraErr, setInfraErr] = useState("");
  const [usoErr,   setUsoErr]   = useState("");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pInfra = apiFetch<TecnologiaInfra>(
      "/v1/admin/analytics/tecnologia/infraestrutura", token,
    )
      .then((d) => { if (!cancelled) setInfra(d); })
      .catch(handleErr(setInfraErr));

    const pUso = apiFetch<TecnologiaUso>(
      "/v1/admin/analytics/tecnologia/uso-pedagogico", token,
    )
      .then((d) => { if (!cancelled) setUso(d); })
      .catch(handleErr(setUsoErr));

    Promise.all([pInfra, pUso]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, onUnauth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Carregando indicadores…
      </div>
    );
  }

  if (!infra && !uso) {
    const msg = infraErr || usoErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  const provedorRows = (infra?.por_provedor ?? []).map((p) => ({
    label: p.valor,
    value: p.escolas,
  }));
  const qualidadeSegments = (infra?.por_qualidade ?? []).map((q, i) => ({
    label: q.valor,
    value: q.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: PostgreSQL · ano corrente · censos concluídos</span>
      </div>

      {/* Banners de erro parcial */}
      {infraErr && uso && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de infraestrutura tecnológica indisponíveis ({infraErr}). Exibindo apenas o uso pedagógico.</span>
        </div>
      )}
      {usoErr && infra && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de uso pedagógico indisponíveis ({usoErr}). Exibindo apenas a infraestrutura tecnológica.</span>
        </div>
      )}

      {/* ── Resumo Executivo ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Escolas com Internet"
          value={fmtPct(infra?.percentual_internet)}
          Icon={Wifi}
          tone="blue"
          sub="das escolas"
        />
        <StatCard
          label="Computadores Atendem"
          value={fmtPct(infra?.percentual_computadores_atendem)}
          Icon={Gauge}
          tone="green"
          sub="escolas que afirmam atender à demanda"
        />
        <StatCard
          label="Computadores Inoperantes"
          value={fmtInt(infra?.total_computadores_inoperantes)}
          Icon={ZapOff}
          tone="orange"
          sub="total declarado"
        />
        <StatCard
          label="Projetores"
          value={fmtInt(uso?.total_projetores)}
          Icon={Projector}
          tone="amber"
          sub="total declarado"
        />
        <StatCard
          label="Lousa Digital"
          value={fmtPct(uso?.percentual_com_lousa_digital)}
          Icon={PenSquare}
          tone="purple"
          sub="das escolas"
        />
      </div>

      {/* ── Infraestrutura Digital ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Signal size={16} style={{ color: C.primary }} />
            Provedores de internet
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Número de escolas por provedor declarado.
          </p>
          {provedorRows.length > 0 ? (
            <HBarChart rows={provedorRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Wifi size={16} style={{ color: C.primary }} />
            Qualidade da conexão
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Distribuição categórica auto-declarada pelas escolas.
          </p>
          {qualidadeSegments.length > 0 ? (
            <Donut segments={qualidadeSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* ── Parque Tecnológico ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Desktops Administrativos"
          value={fmtInt(infra?.total_desktops_adm)}
          Icon={Monitor}
          tone="blue"
          sub="total declarado"
        />
        <StatCard
          label="Desktops de Alunos"
          value={fmtInt(infra?.total_desktops_alunos)}
          Icon={Monitor}
          tone="green"
          sub="total declarado"
        />
        <StatCard
          label="Notebooks"
          value={fmtInt(infra?.total_notebooks)}
          Icon={Laptop}
          tone="amber"
          sub="total declarado"
        />
        <StatCard
          label="Chromebooks"
          value={fmtInt(infra?.total_chromebooks)}
          Icon={Tablet}
          tone="purple"
          sub="total declarado"
        />
        <StatCard
          label="Computadores Inoperantes"
          value={fmtInt(infra?.total_computadores_inoperantes)}
          Icon={ZapOff}
          tone="orange"
          sub="total declarado"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <MonitorSmartphone size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Notas semânticas — Parque Tecnológico</h2>
        </div>
        <div className="px-6 py-4 text-xs text-slate-500 space-y-1">
          <p>
            Quantidades de equipamentos são declaradas pelas escolas no formulário do censo.
          </p>
          <p>
            O total de computadores inoperantes não representa automaticamente um percentual do parque total.
          </p>
        </div>
      </div>

      {/* ── Uso Pedagógico ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard
          label="Escolas com Projetor"
          value={fmtPct(uso?.percentual_com_projetor)}
          Icon={Projector}
          tone="blue"
          sub="das escolas"
        />
        <StatCard
          label="Total de Projetores"
          value={fmtInt(uso?.total_projetores)}
          Icon={Projector}
          tone="amber"
          sub="total declarado"
        />
        <StatCard
          label="Escolas com Lousa Digital"
          value={fmtPct(uso?.percentual_com_lousa_digital)}
          Icon={PenSquare}
          tone="purple"
          sub="das escolas"
        />
      </div>

      <p className="text-xs text-slate-400">
        Indicadores baseados nas declarações das escolas no formulário do censo.
      </p>
    </div>
  );
}
