"use client";

import React, { useEffect, useState } from "react";
import {
  Utensils, AlertCircle, Loader2, CheckCircle2, UserCheck, Users,
  Snowflake, Refrigerator, Flame, Microwave, GlassWater,
  ChefHat, ClipboardList, Building, Briefcase,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  MerendaOferta, MerendaEquipamentos, MerendaRH, EquipTotais,
} from "./shared/types";

type AbaMerendaProps = {
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

// Card de equipamento — total + média/escola.
function EquipCard({
  label, dados, Icon, tone,
}: {
  label: string;
  dados: EquipTotais | undefined;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  tone: "blue" | "green" | "amber" | "orange" | "purple";
}) {
  const total = dados?.total ?? 0;
  const media = dados?.media_por_escola;
  return (
    <StatCard
      label={label}
      value={Math.round(total).toLocaleString("pt-BR")}
      Icon={Icon}
      tone={tone}
      sub={`média ${fmtMedia(media)} por escola`}
    />
  );
}

export function AbaMerenda({ token, onUnauth }: AbaMerendaProps) {
  const [oferta,     setOferta]     = useState<MerendaOferta | null>(null);
  const [equip,      setEquip]      = useState<MerendaEquipamentos | null>(null);
  const [rh,         setRh]         = useState<MerendaRH | null>(null);
  const [ofertaErr,  setOfertaErr]  = useState("");
  const [equipErr,   setEquipErr]   = useState("");
  const [rhErr,      setRhErr]      = useState("");
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    let cancelled = false;

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pOferta = apiFetch<MerendaOferta>("/v1/admin/analytics/merenda/oferta", token)
      .then((d) => { if (!cancelled) setOferta(d); })
      .catch(handleErr(setOfertaErr));

    const pEquip = apiFetch<MerendaEquipamentos>("/v1/admin/analytics/merenda/equipamentos", token)
      .then((d) => { if (!cancelled) setEquip(d); })
      .catch(handleErr(setEquipErr));

    const pRh = apiFetch<MerendaRH>("/v1/admin/analytics/merenda/recursos-humanos", token)
      .then((d) => { if (!cancelled) setRh(d); })
      .catch(handleErr(setRhErr));

    Promise.all([pOferta, pEquip, pRh]).finally(() => {
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

  if (!oferta && !equip && !rh) {
    const msg = ofertaErr || equipErr || rhErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  const totalMerendeiras =
    Math.round((rh?.total_estatutaria ?? 0) + (rh?.total_terceirizada ?? 0) + (rh?.total_temporaria ?? 0));

  // Segmentos pré-computados — empty arrays vira NoData.
  const ofertaSegments = (oferta?.dist_oferta_regular ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const qualidadeRows = (oferta?.dist_qualidade ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
  }));
  const condCozinhaRows = (oferta?.dist_condicoes_cozinha ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
  }));

  const vinculoSegments = rh
    ? [
        { label: "Estatutária",  value: Math.round(rh.total_estatutaria),  color: "#1E5B8A" },
        { label: "Terceirizada", value: Math.round(rh.total_terceirizada), color: "#F59E0B" },
        { label: "Temporária",   value: Math.round(rh.total_temporaria),   color: "#8B5CF6" },
      ].filter((s) => s.value > 0)
    : [];

  const topEmpresasRows = (rh?.top_empresas ?? []).map((e) => ({
    label: e.empresa,
    value: e.escolas,
  }));

  // Agrupar dist_estados por equipamento para a tabela compacta.
  const estadosPorEquip: Record<string, { estado: string; escolas: number }[]> = {};
  (equip?.dist_estados ?? []).forEach((s) => {
    if (!estadosPorEquip[s.equipamento]) estadosPorEquip[s.equipamento] = [];
    estadosPorEquip[s.equipamento].push({ estado: s.estado, escolas: s.escolas });
  });
  const equipLabels: Record<string, string> = {
    freezers: "Freezers",
    geladeiras: "Geladeiras",
    fogoes: "Fogões",
    fornos: "Fornos",
    bebedouros: "Bebedouros",
  };
  const equipOrder = ["freezers", "geladeiras", "fogoes", "fornos", "bebedouros"];

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: PostgreSQL · ano corrente · censos concluídos</span>
      </div>

      {/* Banners de erro parcial */}
      {ofertaErr && (equip || rh) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Oferta e estrutura da merenda indisponíveis ({ofertaErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {equipErr && (oferta || rh) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Equipamentos da merenda indisponíveis ({equipErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {rhErr && (oferta || equip) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Recursos humanos da merenda indisponíveis ({rhErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}

      {/* ── Resumo Executivo ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Atende às Necessidades"
          value={fmtPct(oferta?.pct_atende_necessidades)}
          Icon={CheckCircle2}
          tone="green"
          sub="das escolas"
        />
        <StatCard
          label="Possui Refeitório"
          value={fmtPct(oferta?.pct_possui_refeitorio)}
          Icon={Utensils}
          tone="blue"
          sub="das escolas"
        />
        <StatCard
          label="Com Supervisor"
          value={fmtPct(rh?.pct_com_supervisor)}
          Icon={UserCheck}
          tone="amber"
          sub="das escolas"
        />
        <StatCard
          label="Total de Merendeiras"
          value={totalMerendeiras.toLocaleString("pt-BR")}
          Icon={Users}
          tone="purple"
          sub="estatutária + terceirizada + temporária"
        />
      </div>

      {/* ── Oferta e Adequação da Merenda ────────────────────────── */}
      <div id="sec-merenda-oferta" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <ClipboardList size={16} style={{ color: C.primary }} />
            Oferta regular da merenda
          </h3>
          {ofertaSegments.length > 0 ? (
            <Donut segments={ofertaSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: C.primary }} />
            Qualidade da merenda
          </h3>
          {qualidadeRows.length > 0 ? (
            <HBarChart rows={qualidadeRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* ── Estrutura Física da Cozinha ──────────────────────────── */}
      <div id="sec-merenda-estrutura" className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <ChefHat size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Estrutura Física da Cozinha</h2>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm mb-4">Condições da cozinha</h3>
            {condCozinhaRows.length > 0 ? (
              <HBarChart rows={condCozinhaRows} color={C.primary} />
            ) : (
              <NoData />
            )}
          </div>
          <div className="flex items-center justify-center">
            <StatCard
              label="Possui Refeitório"
              value={fmtPct(oferta?.pct_possui_refeitorio)}
              Icon={Utensils}
              tone="blue"
              sub="das escolas"
            />
          </div>
        </div>
      </div>

      {/* ── Equipamentos da Merenda ──────────────────────────────── */}
      <div id="sec-merenda-equipamentos" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <EquipCard label="Freezers"   dados={equip?.freezers}   Icon={Snowflake}    tone="blue" />
        <EquipCard label="Geladeiras" dados={equip?.geladeiras} Icon={Refrigerator} tone="green" />
        <EquipCard label="Fogões"     dados={equip?.fogoes}     Icon={Flame}        tone="orange" />
        <EquipCard label="Fornos"     dados={equip?.fornos}     Icon={Microwave}    tone="amber" />
        <EquipCard label="Bebedouros" dados={equip?.bebedouros} Icon={GlassWater}   tone="purple" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <ClipboardList size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Distribuição do estado dos equipamentos</h2>
        </div>
        <div className="p-6">
          {equip && equip.dist_estados.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-medium">Equipamento</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium text-right">Escolas</th>
                  </tr>
                </thead>
                <tbody>
                  {equipOrder.flatMap((eq) =>
                    (estadosPorEquip[eq] ?? []).map((row, idx) => (
                      <tr key={`${eq}-${row.estado}`} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 text-slate-700">
                          {idx === 0 ? (equipLabels[eq] ?? eq) : ""}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{row.estado}</td>
                        <td className="py-2 text-right tabular-nums text-slate-800 font-semibold">
                          {row.escolas.toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* ── Recursos Humanos da Merenda ──────────────────────────── */}
      <div id="sec-merenda-rh" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Merendeiras Estatutárias"
          value={Math.round(rh?.total_estatutaria ?? 0).toLocaleString("pt-BR")}
          Icon={Briefcase}
          tone="blue"
          sub="total"
        />
        <StatCard
          label="Merendeiras Terceirizadas"
          value={Math.round(rh?.total_terceirizada ?? 0).toLocaleString("pt-BR")}
          Icon={Building}
          tone="amber"
          sub="total"
        />
        <StatCard
          label="Merendeiras Temporárias"
          value={Math.round(rh?.total_temporaria ?? 0).toLocaleString("pt-BR")}
          Icon={Users}
          tone="purple"
          sub="total"
        />
        <StatCard
          label="Supervisor de Merenda"
          value={fmtPct(rh?.pct_com_supervisor)}
          Icon={UserCheck}
          tone="green"
          sub="das escolas"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Users size={16} style={{ color: C.primary }} />
            Distribuição por vínculo
          </h3>
          {vinculoSegments.length > 0 ? (
            <Donut segments={vinculoSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Building size={16} style={{ color: C.primary }} />
            Top empresas terceirizadas
          </h3>
          {topEmpresasRows.length > 0 ? (
            <HBarChart rows={topEmpresasRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
      </div>
    </div>
  );
}
