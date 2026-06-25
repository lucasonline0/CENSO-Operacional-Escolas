"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  MonitorSmartphone, AlertCircle, Loader2, Wifi, Signal, Monitor,
  Laptop, Tablet, Projector, PenSquare, Gauge, ZapOff, Boxes, PieChart,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  TecnologiaInfra, TecnologiaUso, CategoricStat, DashboardFilters,
  TecnologiaEscolaRow, EscolasPayload,
} from "./shared/types";
import { buildPostgresSourceLabel } from "./shared/sourceLabel";
import { AdminDataTable, type DataTableColumn } from "./shared/AdminDataTable";

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

// Cores semânticas para distribuições Sim/Parcialmente/Não; demais rótulos
// caem no rodízio PORTE_COLORS, preservando o estilo visual da aba.
const DIST_COLORS: Record<string, string> = {
  "Sim": "#10B981",
  "Não": "#F43F5E",
  "Parcialmente": "#F59E0B",
  "Não informado": "#94A3B8",
};

function distColor(label: string, i: number): string {
  return DIST_COLORS[label] ?? PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8";
}

function toSegments(items: CategoricStat[] | undefined) {
  return (items ?? []).map((it, i) => ({
    label: it.valor,
    value: it.escolas,
    color: distColor(it.valor, i),
    pct: it.percentual,
  }));
}

type AbaTecnologiaProps = {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
};

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("pt-BR");
}

function fmtDec(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function NoData({ msg = "Sem dados disponíveis para este indicador." }: { msg?: string }) {
  return (
    <div className="text-xs text-slate-400 italic py-6 text-center">{msg}</div>
  );
}

const TECNOLOGIA_ESCOLAS_SORT_KEYS = ["escola", "dre", "municipio", "zona", "internet", "provedor", "qualidade"] as const;
type TecnologiaEscolasSortKey = (typeof TECNOLOGIA_ESCOLAS_SORT_KEYS)[number];

const TECNOLOGIA_ESCOLAS_COLUMNS: DataTableColumn<TecnologiaEscolaRow>[] = [
  { key: "nome_escola",         label: "Escola",         sortable: true },
  { key: "codigo_inep",         label: "INEP"                           },
  { key: "dre",                 label: "DRE",            sortable: true },
  { key: "municipio",           label: "Município",      sortable: true },
  { key: "zona",                label: "Zona",           sortable: true },
  { key: "internet_disponivel", label: "Internet",       sortable: true },
  { key: "provedor_internet",   label: "Provedor",       sortable: true },
  { key: "qualidade_internet",  label: "Qualidade",      sortable: true },
  { key: "qtd_desktop_alunos",  label: "Desktop alunos", align: "right" },
  { key: "qtd_notebooks",       label: "Notebooks",      align: "right" },
  { key: "qtd_chromebooks",     label: "Chromebooks",    align: "right" },
  { key: "possui_projetor",     label: "Projetor"                       },
  { key: "possui_lousa_digital", label: "Lousa Digital"                 },
  {
    key: "has_censo",
    label: "Censo",
    render: (row) => row.has_censo
      ? <span className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">Preenchido</span>
      : <span className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 border-slate-200">Sem dados</span>,
  },
];

export function AbaTecnologia({
  token, onUnauth, filters,
}: AbaTecnologiaProps) {
  const [infra, setInfra] = useState<TecnologiaInfra | null>(null);
  const [uso,   setUso]   = useState<TecnologiaUso | null>(null);
  const [infraErr, setInfraErr] = useState("");
  const [usoErr,   setUsoErr]   = useState("");
  const [loading,  setLoading]  = useState(true);

  // Estado da tabela escola-a-escola
  const [escolasData,    setEscolasData]    = useState<EscolasPayload<TecnologiaEscolaRow> | null>(null);
  const [escolasLoading, setEscolasLoading] = useState(true);
  const [escolasError,   setEscolasError]   = useState("");
  const [esPage,     setEsPage]     = useState(1);
  const [esPageSize, setEsPageSize] = useState(10);
  const [esSortKey,  setEsSortKey]  = useState<TecnologiaEscolasSortKey>("escola");
  const [esSortDir,  setEsSortDir]  = useState<"asc" | "desc">("asc");
  const [esSearch,   setEsSearch]   = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInfra(null); setUso(null);
    setInfraErr(""); setUsoErr("");

    const qs = buildFilterParams(filters);

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pInfra = apiFetch<TecnologiaInfra>(
      `/v1/admin/analytics/tecnologia/infraestrutura${qs}`, token,
    )
      .then((d) => { if (!cancelled) setInfra(d); })
      .catch(handleErr(setInfraErr));

    const pUso = apiFetch<TecnologiaUso>(
      `/v1/admin/analytics/tecnologia/uso-pedagogico${qs}`, token,
    )
      .then((d) => { if (!cancelled) setUso(d); })
      .catch(handleErr(setUsoErr));

    Promise.all([pInfra, pUso]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, onUnauth, filters]);

  // useEffect separado para a tabela escola-a-escola
  const handleEsSort = useCallback((key: string) => {
    setEsSortDir((d) => esSortKey === key ? (d === "asc" ? "desc" : "asc") : "asc");
    setEsSortKey(key as TecnologiaEscolasSortKey);
    setEsPage(1);
  }, [esSortKey]);

  const handleEsSearch = useCallback((q: string) => {
    setEsSearch(q);
    setEsPage(1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEscolasLoading(true);
    setEscolasError("");

    const p = new URLSearchParams();
    if (filters?.ano)               p.set("year",              String(filters.ano));
    if (filters?.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);
    if (filters?.dre)               p.set("dre",               filters.dre);
    if (filters?.municipio)         p.set("municipio",         filters.municipio);
    if (filters?.zona)              p.set("zona",              filters.zona);
    if (esSearch.trim())            p.set("q",                 esSearch.trim());
    p.set("page",      String(esPage));
    p.set("page_size", String(esPageSize));
    p.set("sort",      esSortKey);
    p.set("direction", esSortDir);

    apiFetch<EscolasPayload<TecnologiaEscolaRow>>(
      `/v1/admin/analytics/tecnologia/escolas?${p.toString()}`, token,
    )
      .then((d) => { if (!cancelled) { setEscolasData(d); setEscolasError(""); } })
      .catch((e: unknown) => {
        const msg = (e as Error).message;
        if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
        if (!cancelled) setEscolasError(msg);
      })
      .finally(() => { if (!cancelled) setEscolasLoading(false); });

    return () => { cancelled = true; };
  }, [token, onUnauth, filters, esPage, esPageSize, esSortKey, esSortDir, esSearch]);

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

  const provedorSegments = (infra?.por_provedor ?? []).map((p, i) => ({
    label: p.valor,
    value: p.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
    pct: p.percentual,
  }));
  // Qualidade da internet em barras horizontais: rótulos longos não cabem bem
  // num donut. Valor numérico dentro da barra + percentual à direita (padrão HBarChart).
  const qualidadeBars = (infra?.por_qualidade ?? []).map((q) => ({
    label: q.valor,
    value: q.escolas,
    display: q.escolas.toLocaleString("pt-BR"),
    pct: q.percentual,
  }));

  // Distribuições derivadas do payload expandido.
  const internetSegments  = toSegments(infra?.disponibilidade_internet);
  const atendeSegments    = toSegments(infra?.computadores_atendem_demanda);
  const projetorSegments  = toSegments(uso?.possui_projetor_dist);
  const lousaSegments     = toSegments(uso?.possui_lousa_digital_dist);

  // Média por tipo de equipamento (vinda do backend) → barras horizontais.
  const mediaRows = (infra?.media_equipamentos_por_escola ?? []).map((m) => ({
    label: m.valor,
    value: m.media,
    display: m.media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  }));

  // Distribuição do parque tecnológico (%) — calculada no frontend a partir dos
  // totais já entregues pelo endpoint, sem ida adicional ao backend.
  const parqueTotals = [
    { label: "Desktops administrativos", value: infra?.total_desktops_adm ?? 0 },
    { label: "Desktops de alunos",       value: infra?.total_desktops_alunos ?? 0 },
    { label: "Notebooks",                value: infra?.total_notebooks ?? 0 },
    { label: "Chromebooks",              value: infra?.total_chromebooks ?? 0 },
  ];
  const parqueTotal = parqueTotals.reduce((s, r) => s + r.value, 0);
  const parqueSegments = parqueTotals.map((r, i) => ({
    label: r.label,
    value: r.value,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
    pct: parqueTotal > 0 ? (r.value / parqueTotal) * 100 : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div data-pres-hide="true" className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: {buildPostgresSourceLabel(filters)}</span>
      </div>

      {/* Banners de erro parcial */}
      {infraErr && uso && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de infraestrutura tecnológica indisponíveis ({infraErr}). Exibindo apenas o uso pedagógico.</span>
        </div>
      )}
      {usoErr && infra && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de uso pedagógico indisponíveis ({usoErr}). Exibindo apenas a infraestrutura tecnológica.</span>
        </div>
      )}

      {/* ── Infraestrutura Digital ───────────────────────────────── */}
      <div id="sec-tecnologia-digital" data-pres-hide="true" className="flex items-center gap-3">
        <Wifi size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Infraestrutura Digital</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="tecnologia-digital-indicadores" className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      </div>
      <div data-pres-slide="tecnologia-digital-conexao" className="space-y-6">
      {/* 4 colunas no lg: Disponibilidade e Provedores ocupam 1 cada (rótulos
          curtos); Qualidade ocupa 2 (rótulos longos, em barras horizontais). */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Wifi size={16} style={{ color: C.primary }} />
            Disponibilidade de internet
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Escolas com e sem internet declarada.
          </p>
          {internetSegments.length > 0 ? (
            <Donut segments={internetSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Signal size={16} style={{ color: C.primary }} />
            Provedores de internet
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Número de escolas por provedor declarado.
          </p>
          {provedorSegments.length > 0 ? (
            <Donut segments={provedorSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Wifi size={16} style={{ color: C.primary }} />
            Qualidade da conexão
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Distribuição categórica auto-declarada pelas escolas.
          </p>
          {qualidadeBars.length > 0 ? (
            <HBarChart rows={qualidadeBars} labelWidth="45%" rowGap="1.25rem" />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      </div>
      {/* ── Parque Tecnológico ───────────────────────────────────── */}
      <div id="sec-tecnologia-parque" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <Boxes size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Parque Tecnológico</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="tecnologia-parque-indicadores" className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
          label="Escolas c/ Computadores Inoperantes"
          value={fmtInt(infra?.escolas_com_computadores_inoperantes)}
          Icon={ZapOff}
          tone="orange"
          sub="escolas declararam"
        />
        <StatCard
          label="Total de Computadores Inoperantes"
          value={fmtInt(infra?.total_computadores_inoperantes)}
          Icon={ZapOff}
          tone="orange"
          sub="equipamentos declarados"
        />
      </div>

      </div>
      <div data-pres-slide="tecnologia-parque-distribuicao" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Boxes size={16} style={{ color: C.primary }} />
            Quantidade média de equipamentos por escola
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Média por tipo no recorte (total declarado ÷ nº de escolas).
          </p>
          {mediaRows.length > 0 ? (
            <HBarChart rows={mediaRows} labelWidth="11rem" />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <PieChart size={16} style={{ color: C.primary }} />
            Distribuição do parque tecnológico
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Participação de cada tipo no total de equipamentos declarados.
          </p>
          {parqueTotal > 0 ? (
            <Donut segments={parqueSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      </div>
      <div data-pres-slide="tecnologia-parque-notas" className="space-y-6">
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
            O número de escolas com computadores inoperantes não representa automaticamente um percentual do parque total.
          </p>
        </div>
      </div>

      </div>
      {/* ── Uso Pedagógico ───────────────────────────────────────── */}
      <div id="sec-tecnologia-pedagogico" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <Projector size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Uso Pedagógico</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="tecnologia-pedagogico-indicadores" className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          label="Média de Projetores por Escola"
          value={fmtDec(uso?.media_projetores_por_escola)}
          Icon={Projector}
          tone="green"
          sub="por escola no recorte"
        />
        <StatCard
          label="Escolas com Lousa Digital"
          value={fmtPct(uso?.percentual_com_lousa_digital)}
          Icon={PenSquare}
          tone="purple"
          sub="das escolas"
        />
      </div>

      </div>
      <div data-pres-slide="tecnologia-pedagogico-distribuicao" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Gauge size={16} style={{ color: C.primary }} />
            Equipamentos atendem à demanda
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Distribuição Sim / Parcialmente / Não declarada pelas escolas.
          </p>
          {atendeSegments.length > 0 ? (
            <Donut segments={atendeSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Projector size={16} style={{ color: C.primary }} />
            Projetor multimídia
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Escolas com e sem projetor multimídia.
          </p>
          {projetorSegments.length > 0 ? (
            <Donut segments={projetorSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <PenSquare size={16} style={{ color: C.primary }} />
            Lousa digital
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Escolas com e sem lousa digital.
          </p>
          {lousaSegments.length > 0 ? (
            <Donut segments={lousaSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      <p data-pres-hide="true" className="text-xs text-slate-400">
        Indicadores baseados nas declarações das escolas no formulário do censo.
      </p>

      {/* Tabela escola-a-escola — oculta no modo apresentação */}
      <div data-pres-hide="true">
        <AdminDataTable<TecnologiaEscolaRow>
          title="Tecnologia e Equipamentos — Escola a Escola"
          columns={TECNOLOGIA_ESCOLAS_COLUMNS}
          rows={escolasData?.escolas ?? []}
          keyField="codigo_inep"
          totalEscolas={escolasData?.total_escolas ?? 0}
          totalFiltrado={escolasData?.total_filtrado ?? 0}
          page={escolasData?.page ?? esPage}
          pageSize={escolasData?.page_size ?? esPageSize}
          totalPages={escolasData?.total_pages ?? 1}
          sortKey={esSortKey}
          sortDir={esSortDir}
          loading={escolasLoading}
          error={escolasError}
          onSort={handleEsSort}
          onPage={setEsPage}
          onPageSize={(s) => { setEsPageSize(s); setEsPage(1); }}
          onSearch={handleEsSearch}
        />
      </div>
    </div>
  );
}
