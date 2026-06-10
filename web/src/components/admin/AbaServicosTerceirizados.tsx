"use client";

import React, { useEffect, useState } from "react";
import {
  ClipboardCheck, AlertCircle, Loader2, Layers, Users, ShieldCheck,
  Briefcase, Building, UserCheck, Construction, BadgeCheck,
  ChefHat,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  ServicosVisaoGeral, ServicosGerais, ServicosPortaria,
  ServicosManipuladoresAlimentos, DashboardFilters,
} from "./shared/types";

function buildFilterParams(filters?: DashboardFilters): string {
  if (!filters) return "";
  const p = new URLSearchParams();
  if (filters.ano) p.set("year", String(filters.ano));
  if (filters.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);
  if (filters.dre) p.set("dre", filters.dre);
  if (filters.municipio) p.set("municipio", filters.municipio);
  if (filters.zona) p.set("zona", filters.zona);
  const s = p.toString();
  return s ? `?${s}` : "";
}

type AbaServicosTerceirizadosProps = {
  token: string;
  onUnauth: () => void;
  presentationMode?: boolean;
  filters?: DashboardFilters;
  activeAnchor?: string;
  onLoadComplete?: () => void;
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
  token, onUnauth, presentationMode = false, filters, activeAnchor, onLoadComplete
}: AbaServicosTerceirizadosProps) {
  const [visao, setVisao] = useState<ServicosVisaoGeral | null>(null);
  const [sg, setSg] = useState<ServicosGerais | null>(null);
  const [portaria, setPortaria] = useState<ServicosPortaria | null>(null);
  const [manip, setManip] = useState<ServicosManipuladoresAlimentos | null>(null);
  const [visaoErr, setVisaoErr] = useState("");
  const [sgErr, setSgErr] = useState("");
  const [portariaErr, setPortariaErr] = useState("");
  const [manipErr, setManipErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVisao(null); setSg(null); setPortaria(null); setManip(null);
    setVisaoErr(""); setSgErr(""); setPortariaErr(""); setManipErr("");

    const qs = buildFilterParams(filters);

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pVisao = apiFetch<ServicosVisaoGeral>(
      `/v1/admin/analytics/servicos-terceirizados/visao-geral${qs}`, token,
    )
      .then((d) => { if (!cancelled) setVisao(d); })
      .catch(handleErr(setVisaoErr));

    const pSg = apiFetch<ServicosGerais>(
      `/v1/admin/analytics/servicos-terceirizados/servicos-gerais${qs}`, token,
    )
      .then((d) => { if (!cancelled) setSg(d); })
      .catch(handleErr(setSgErr));

    const pPortaria = apiFetch<ServicosPortaria>(
      `/v1/admin/analytics/servicos-terceirizados/portaria${qs}`, token,
    )
      .then((d) => { if (!cancelled) setPortaria(d); })
      .catch(handleErr(setPortariaErr));

    const pManip = apiFetch<ServicosManipuladoresAlimentos>(
      `/v1/admin/analytics/servicos-terceirizados/manipuladores-alimentos${qs}`, token,
    )
      .then((d) => { if (!cancelled) setManip(d); })
      .catch(handleErr(setManipErr));

    Promise.all([pVisao, pSg, pPortaria, pManip]).finally(() => {
      if (!cancelled) {
        setLoading(false);
        onLoadComplete?.();
      }
    });

    return () => { cancelled = true; };
  }, [token, onUnauth, filters, onLoadComplete]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Carregando indicadores…
      </div>
    );
  }

  if (!visao && !sg && !portaria && !manip) {
    const msg = visaoErr || sgErr || portariaErr || manipErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  const totalSg = Math.round(
    (sg?.total_efetivo ?? 0) + (sg?.total_temporario ?? 0) + (sg?.total_terceirizado ?? 0),
  );
  const areasComTerceirizacao = (visao?.por_area ?? []).filter((a) => a.escolas > 0).length;

  // Visão Geral: cobertura por área (HBarChart) e distribuição de qtd de áreas terceirizadas (Donut).
  const porAreaRows = (visao?.por_area ?? []).map((a) => ({
    label: a.area,
    value: a.escolas,
  }));
  const porQtdSegments = (visao?.por_quantidade_areas ?? []).map((s, i) => ({
    label: `${s.valor} área${s.valor === "1" ? "" : "s"}`,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));

  // Serviços Gerais: mix por vínculo.
  const sgVinculoSegments = sg
    ? [
      { label: "Efetivo", value: Math.round(sg.total_efetivo), color: "#1E5B8A" },
      { label: "Temporário", value: Math.round(sg.total_temporario), color: "#8B5CF6" },
      { label: "Terceirizado", value: Math.round(sg.total_terceirizado), color: "#F59E0B" },
    ].filter((s) => s.value > 0)
    : [];
  const topEmpresasSgRows = (sg?.top_empresas ?? []).map((e) => ({
    label: e.empresa,
    value: e.escolas,
  }));

  const topEmpresasPortariaRows = (portaria?.top_empresas ?? []).map((e) => ({
    label: e.empresa,
    value: e.escolas,
  }));
  const manipVinculoSegments = (manip?.dist_vinculo ?? [])
    .filter((s) => s.escolas > 0)
    .map((s, i) => ({
      label: s.valor,
      value: s.escolas,
      pct: s.percentual,
      color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
    }));
  const manipAtendeSegments = (manip?.dist_atende_necessidade ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    pct: s.percentual,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const topEmpresasManipRows = (manip?.top_empresas ?? []).map((e) => ({
    label: e.empresa,
    value: e.escolas,
  }));

  const isVisible = (anchor: string) => !presentationMode || activeAnchor === anchor;

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      {!presentationMode && (
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span>Fonte: PostgreSQL · ano corrente · censos concluídos</span>
        </div>
      )}

      {/* Banners de erro parcial */}
      {!presentationMode && visaoErr && (sg || portaria || manip) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de visão geral indisponíveis ({visaoErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {!presentationMode && sgErr && (visao || portaria || manip) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de serviços gerais indisponíveis ({sgErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {!presentationMode && portariaErr && (visao || sg || manip) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de portaria indisponíveis ({portariaErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {!presentationMode && manipErr && (visao || sg || portaria) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de manipuladores de alimentos indisponíveis ({manipErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}

      {/* ── Visão Geral ──────────────────────────────────────────── */}
      {isVisible("sec-servicos-visao") && (
        <div className="space-y-6">
          <div id="sec-servicos-visao" className="flex items-center gap-3 animate-fade-in-up">
            <Layers size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Visão Geral</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up [animation-delay:150ms]">
            <StatCard
              label="Áreas com Terceirização"
              value={areasComTerceirizacao.toLocaleString("pt-BR")}
              Icon={Layers}
              tone="blue"
              sub="categorias com pelo menos 1 escola"
              compact={presentationMode}
            />
            <StatCard
              label="Trabalhadores SG"
              value={totalSg.toLocaleString("pt-BR")}
              Icon={Users}
              tone="purple"
              sub="efetivo + temporário + terceirizado"
              compact={presentationMode}
            />
            <StatCard
              label="Escolas com Agentes de Portaria"
              value={fmtPct(portaria?.pct_com_agentes)}
              Icon={ShieldCheck}
              tone="green"
              sub="das escolas com qtd. de agentes > 0"
              compact={presentationMode}
            />
            <StatCard
              label="Média de Agentes por Escola"
              value={fmtMedia(portaria?.media_agentes_por_escola)}
              Icon={BadgeCheck}
              tone="amber"
              sub="entre escolas que informaram agentes"
              compact={presentationMode}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in-up [animation-delay:300ms]">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <Layers size={16} style={{ color: C.primary }} />
                Cobertura por área terceirizada
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Número de escolas que declaram serviço terceirizado em cada área.
              </p>
              {porAreaRows.length > 0 ? (
                <HBarChart rows={porAreaRows} color={C.primary} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <ClipboardCheck size={16} style={{ color: C.primary }} />
                Quantidade de áreas terceirizadas por escola
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Distribuição das escolas conforme the número de áreas terceirizadas.
              </p>
              {porQtdSegments.length > 0 ? (
                <Donut segments={porQtdSegments} />
              ) : (
                <NoData />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Serviços Gerais ──────────────────────────────────────── */}
      {isVisible("sec-servicos-gerais") && (
        <div className="space-y-6">
          <div id="sec-servicos-gerais" className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <Users size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Serviços Gerais</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Efetivos"
              value={Math.round(sg?.total_efetivo ?? 0).toLocaleString("pt-BR")}
              Icon={Briefcase}
              tone="blue"
              sub="total declarado"
              compact={presentationMode}
            />
            <StatCard
              label="Temporários"
              value={Math.round(sg?.total_temporario ?? 0).toLocaleString("pt-BR")}
              Icon={Users}
              tone="purple"
              sub="total declarado"
              compact={presentationMode}
            />
            <StatCard
              label="Terceirizados"
              value={Math.round(sg?.total_terceirizado ?? 0).toLocaleString("pt-BR")}
              Icon={Building}
              tone="amber"
              sub="total declarado"
              compact={presentationMode}
            />
            <StatCard
              label="Média total por escola"
              value={fmtMedia(sg?.media_total_por_escola)}
              Icon={UserCheck}
              tone="green"
              sub="média do total informado por escola"
              compact={presentationMode}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <Users size={16} style={{ color: C.primary }} />
                Serviços Gerais — distribuição por vínculo
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Soma dos quantitativos declarados pelas escolas em cada vínculo.
              </p>
              {sgVinculoSegments.length > 0 ? (
                <Donut segments={sgVinculoSegments} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <Building size={16} style={{ color: C.primary }} />
                Top empresas terceirizadas — Serviços Gerais
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Empresas informadas em campo textual; variações de grafia podem aparecer separadamente.
              </p>
              {topEmpresasSgRows.length > 0 ? (
                <HBarChart rows={topEmpresasSgRows} color={C.primary} labelWidth="9rem" />
              ) : (
                <NoData />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Portaria ─────────────────────────────────────────────── */}
      {isVisible("sec-servicos-portaria") && (
        <div className="space-y-6">
          <div id="sec-servicos-portaria" className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <ShieldCheck size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Portaria</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard
              label="Escolas com agentes de portaria"
              value={fmtPct(portaria?.pct_com_agentes)}
              Icon={ShieldCheck}
              tone="green"
              sub="das escolas com qtd. de agentes > 0"
              compact={presentationMode}
            />
            <StatCard
              label="Média de agentes por escola"
              value={fmtMedia(portaria?.media_agentes_por_escola)}
              Icon={BadgeCheck}
              tone="amber"
              sub="entre escolas que informaram agentes"
              compact={presentationMode}
            />
            <StatCard
              label="Empresas distintas no Top 10"
              value={(portaria?.top_empresas ?? []).length.toLocaleString("pt-BR")}
              Icon={Building}
              tone="blue"
              sub="empresas terceirizadas mais frequentes"
              compact={presentationMode}
            />
          </div>

          <div className={`bg-white rounded-2xl border border-slate-200 p-6 shadow-sm${presentationMode ? " min-h-96" : ""}`}>
            <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
              <Building size={16} style={{ color: C.primary }} />
              Top empresas terceirizadas — Agentes de Portaria
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Empresas informadas em campo textual; variações de grafia podem aparecer separadamente.
            </p>
            {topEmpresasPortariaRows.length > 0 ? (
              <HBarChart rows={topEmpresasPortariaRows} color={C.primary} />
            ) : (
              <NoData />
            )}
          </div>
        </div>
      )}

      {/* ── Manipulador de Alimentos ────────────────────────────── */}
      {isVisible("sec-servicos-manipuladores") && (
        <div className="space-y-6">
          <div id="sec-servicos-manipuladores" className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <ChefHat size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Manipulador de Alimentos</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {!presentationMode && (
            <p className="text-sm text-slate-500 -mt-2">
              Merendeiras / manipuladores vinculados ao serviço de alimentação escolar.
            </p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Merendeiras estatutárias"
              value={Math.round(manip?.total_estatutaria ?? 0).toLocaleString("pt-BR")}
              Icon={Briefcase}
              tone="blue"
              sub="total declarado"
              compact={presentationMode}
            />
            <StatCard
              label="Merendeiras terceirizadas"
              value={Math.round(manip?.total_terceirizada ?? 0).toLocaleString("pt-BR")}
              Icon={Building}
              tone="amber"
              sub="total declarado"
              compact={presentationMode}
            />
            <StatCard
              label="Merendeiras temporárias"
              value={Math.round(manip?.total_temporaria ?? 0).toLocaleString("pt-BR")}
              Icon={Users}
              tone="purple"
              sub="total declarado"
              compact={presentationMode}
            />
            <StatCard
              label="Total de manipuladores"
              value={Math.round(manip?.total_geral ?? 0).toLocaleString("pt-BR")}
              Icon={ChefHat}
              tone="green"
              sub="soma dos vínculos"
              compact={presentationMode}
            />
            <StatCard
              label="Média por escola"
              value={fmtMedia(manip?.media_por_escola)}
              Icon={BadgeCheck}
              tone="blue"
              sub="média do total informado"
              compact={presentationMode}
            />
            <StatCard
              label="Com supervisor"
              value={fmtPct(manip?.pct_com_supervisor)}
              Icon={UserCheck}
              tone="amber"
              sub="das escolas"
              compact={presentationMode}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <Users size={16} style={{ color: C.primary }} />
                Distribuição por vínculo
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Composição percentual da soma dos quantitativos declarados por vínculo.
              </p>
              {manipVinculoSegments.length > 0 ? (
                <Donut segments={manipVinculoSegments} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <ClipboardCheck size={16} style={{ color: C.primary }} />
                Quantidade atual atende à necessidade?
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Distribuição das escolas com resposta informada.
              </p>
              {manipAtendeSegments.length > 0 ? (
                <Donut segments={manipAtendeSegments} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
              <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
                <Building size={16} style={{ color: C.primary }} />
                Top empresas terceirizadas — Manipulador de Alimentos
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Empresas informadas em campo textual; variações de grafia podem aparecer separadamente.
              </p>
              {topEmpresasManipRows.length > 0 ? (
                <HBarChart rows={topEmpresasManipRows} color={C.primary} labelWidth="9rem" />
              ) : (
                <NoData />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Governança / Supervisão ──────────────────────────────── */}
      {isVisible("sec-servicos-governanca") && (
        <div className="space-y-6">
          <div id="sec-servicos-governanca" className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <UserCheck size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Governança / Supervisão</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center text-center py-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm mb-3"
              style={{ background: C.primary }}
            >
              <Construction size={22} strokeWidth={1.75} />
            </div>
            <p className="text-sm text-slate-600 max-w-2xl">
              Dados de supervisão/governança dos serviços terceirizados ainda não estão disponíveis nos
              endpoints analíticos desta aba.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}