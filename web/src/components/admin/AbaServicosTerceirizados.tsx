"use client";

import React, { useEffect, useState } from "react";
import {
  ClipboardCheck, AlertCircle, Loader2, Briefcase, Users, Building,
  Layers, ShieldCheck, DoorClosed, UsersRound, Construction,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  ServicosVisaoGeral, ServicosGerais, ServicosPortaria,
} from "./shared/types";

type AbaServicosTerceirizadosProps = {
  token: string;
  onUnauth: () => void;
};

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

function fmtMedia(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(1).replace(".", ",");
}

function NoData({ msg = "Sem dados disponíveis para este indicador." }: { msg?: string }) {
  return (
    <div className="text-xs text-slate-400 italic py-6 text-center">{msg}</div>
  );
}

export function AbaServicosTerceirizados({
  token, onUnauth,
}: AbaServicosTerceirizadosProps) {
  const [visao,    setVisao]    = useState<ServicosVisaoGeral | null>(null);
  const [sg,       setSg]       = useState<ServicosGerais | null>(null);
  const [portaria, setPortaria] = useState<ServicosPortaria | null>(null);
  const [visaoErr,    setVisaoErr]    = useState("");
  const [sgErr,       setSgErr]       = useState("");
  const [portariaErr, setPortariaErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pVisao = apiFetch<ServicosVisaoGeral>(
      "/v1/admin/analytics/servicos-terceirizados/visao-geral", token,
    )
      .then((d) => { if (!cancelled) setVisao(d); })
      .catch(handleErr(setVisaoErr));

    const pSg = apiFetch<ServicosGerais>(
      "/v1/admin/analytics/servicos-terceirizados/servicos-gerais", token,
    )
      .then((d) => { if (!cancelled) setSg(d); })
      .catch(handleErr(setSgErr));

    const pPortaria = apiFetch<ServicosPortaria>(
      "/v1/admin/analytics/servicos-terceirizados/portaria", token,
    )
      .then((d) => { if (!cancelled) setPortaria(d); })
      .catch(handleErr(setPortariaErr));

    Promise.all([pVisao, pSg, pPortaria]).finally(() => {
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

  if (!visao && !sg && !portaria) {
    const msg = visaoErr || sgErr || portariaErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  // Métrica derivada: número de áreas com pelo menos uma escola terceirizada.
  const areasComTerceirizacao = (visao?.por_area ?? []).filter((a) => a.escolas > 0).length;

  const totalSg =
    Math.round((sg?.total_efetivo ?? 0) + (sg?.total_temporario ?? 0) + (sg?.total_terceirizado ?? 0));

  // Visão geral — cobertura por área (HBar) e quantidade de áreas (Donut).
  const porAreaRows = (visao?.por_area ?? []).map((a) => ({
    label: a.area,
    value: a.escolas,
  }));
  const qtdAreasSegments = (visao?.por_quantidade_areas ?? []).map((s, i) => ({
    label: `${s.valor} ${s.valor === "1" ? "área" : "áreas"}`,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));

  // Donut de vínculo dos serviços gerais — derivado dos 3 totais reais.
  const vinculoSgSegments = sg
    ? [
        { label: "Efetivo",      value: Math.round(sg.total_efetivo),      color: "#1E5B8A" },
        { label: "Temporário",   value: Math.round(sg.total_temporario),   color: "#8B5CF6" },
        { label: "Terceirizado", value: Math.round(sg.total_terceirizado), color: "#F59E0B" },
      ].filter((s) => s.value > 0)
    : [];

  const topEmpresasPortariaRows = (portaria?.top_empresas ?? []).map((e) => ({
    label: e.empresa,
    value: e.escolas,
  }));

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: PostgreSQL · ano corrente · censos concluídos</span>
      </div>

      {/* Banners de erro parcial */}
      {visaoErr && (sg || portaria) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Visão geral dos serviços terceirizados indisponível ({visaoErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {sgErr && (visao || portaria) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Serviços gerais indisponíveis ({sgErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {portariaErr && (visao || sg) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Portaria indisponível ({portariaErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}

      {/* ── Resumo Executivo ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Áreas com Terceirização"
          value={visao ? `${areasComTerceirizacao} de ${visao.por_area.length || 3}` : "—"}
          Icon={ClipboardCheck}
          tone="blue"
          sub="merenda, portaria, serviços gerais"
        />
        <StatCard
          label="Trabalhadores Serviços Gerais"
          value={sg ? totalSg.toLocaleString("pt-BR") : "—"}
          Icon={Users}
          tone="purple"
          sub="efetivo + temporário + terceirizado"
        />
        <StatCard
          label="Escolas com Agentes de Portaria"
          value={fmtPct(portaria?.pct_com_agentes)}
          Icon={ShieldCheck}
          tone="green"
          sub="das escolas"
        />
        <StatCard
          label="Média de Agentes por Escola"
          value={fmtMedia(portaria?.media_agentes_por_escola)}
          Icon={DoorClosed}
          tone="amber"
          sub="agentes de portaria"
        />
      </div>

      {/* ── Visão Geral dos Serviços Terceirizados ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <ClipboardCheck size={16} style={{ color: C.primary }} />
            Cobertura por área terceirizada
          </h3>
          {porAreaRows.length > 0 ? (
            <HBarChart rows={porAreaRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Layers size={16} style={{ color: C.primary }} />
            Quantidade de áreas terceirizadas por escola
          </h3>
          {qtdAreasSegments.length > 0 ? (
            <Donut segments={qtdAreasSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* ── Serviços Gerais ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <UsersRound size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Serviços Gerais</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Efetivos"
              value={Math.round(sg?.total_efetivo ?? 0).toLocaleString("pt-BR")}
              Icon={Briefcase}
              tone="blue"
              sub="total"
            />
            <StatCard
              label="Temporários"
              value={Math.round(sg?.total_temporario ?? 0).toLocaleString("pt-BR")}
              Icon={Users}
              tone="purple"
              sub="total"
            />
            <StatCard
              label="Terceirizados"
              value={Math.round(sg?.total_terceirizado ?? 0).toLocaleString("pt-BR")}
              Icon={Building}
              tone="amber"
              sub="total"
            />
            <StatCard
              label="Média total por escola"
              value={fmtMedia(sg?.media_total_por_escola)}
              Icon={UsersRound}
              tone="green"
              sub="trabalhadores"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Users size={16} style={{ color: C.primary }} />
                Distribuição do vínculo em serviços gerais
              </h3>
              {vinculoSgSegments.length > 0 ? (
                <Donut segments={vinculoSgSegments} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="flex items-center justify-center">
              <StatCard
                label="Trabalhadores SG (total)"
                value={sg ? totalSg.toLocaleString("pt-BR") : "—"}
                Icon={UsersRound}
                tone="blue"
                sub="efetivo + temporário + terceirizado"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Portaria ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <ShieldCheck size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Portaria</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
            <StatCard
              label="Escolas com Agentes"
              value={fmtPct(portaria?.pct_com_agentes)}
              Icon={ShieldCheck}
              tone="green"
              sub="das escolas"
            />
            <StatCard
              label="Média de Agentes por Escola"
              value={fmtMedia(portaria?.media_agentes_por_escola)}
              Icon={DoorClosed}
              tone="amber"
              sub="agentes de portaria"
            />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
              <Building size={16} style={{ color: C.primary }} />
              Top empresas de portaria
            </h3>
            {topEmpresasPortariaRows.length > 0 ? (
              <HBarChart rows={topEmpresasPortariaRows} color={C.primary} />
            ) : (
              <NoData />
            )}
          </div>
        </div>
      </div>

      {/* ── Governança / Supervisão (empty interno) ─────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <Construction size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Governança e Supervisão</h2>
        </div>
        <div className="px-6 py-8 flex flex-col items-center text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm mb-3"
            style={{ background: C.primary }}
          >
            <Construction size={22} strokeWidth={1.75} />
          </div>
          <p className="text-sm text-slate-600 max-w-2xl">
            Dados de supervisão e governança dos serviços terceirizados ainda não estão disponíveis
            nos endpoints analíticos desta aba. Este bloco será integrado em etapa posterior.
          </p>
        </div>
      </div>
    </div>
  );
}
