"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  UsersRound, AlertCircle, Loader2, GraduationCap, BookOpen,
  Briefcase, UserCheck, Users, ClipboardList, MapPinned, Layers,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  PessoalEstrutura, PessoalCoordenacao, QuadroPessoal, DashboardFilters,
  PessoalEscolaRow, EscolasPayload,
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

type AbaPessoalGestaoProps = {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
};

function fmtMedia(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(1).replace(".", ",");
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

const PESSOAL_ESCOLAS_SORT_KEYS = ["escola", "dre", "municipio", "zona", "diretor"] as const;
type PessoalEscolasSortKey = (typeof PESSOAL_ESCOLAS_SORT_KEYS)[number];

const PESSOAL_ESCOLAS_COLUMNS: DataTableColumn<PessoalEscolaRow>[] = [
  { key: "nome_escola",                  label: "Escola",           sortable: true },
  { key: "codigo_inep",                  label: "INEP"                             },
  { key: "dre",                          label: "DRE",              sortable: true },
  { key: "municipio",                    label: "Município",        sortable: true },
  { key: "zona",                         label: "Zona",             sortable: true },
  { key: "nome_diretor",                 label: "Diretor",          sortable: true },
  { key: "possui_direcao",               label: "Direção"                          },
  { key: "possui_coord_pedagogico",      label: "Coord. Pedagógico"                },
  { key: "qtd_professores_efetivos",     label: "Prof. Efetivos",   align: "right" },
  { key: "qtd_professores_temporarios",  label: "Prof. Temporários",align: "right" },
  { key: "qtd_servidores_administrativos", label: "Serv. Adm.",     align: "right" },
  {
    key: "has_censo",
    label: "Censo",
    render: (row) => row.has_censo
      ? <span className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">Preenchido</span>
      : <span className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 border-slate-200">Sem dados</span>,
  },
];

export function AbaPessoalGestao({
  token, onUnauth, filters,
}: AbaPessoalGestaoProps) {
  const [estrutura,   setEstrutura]   = useState<PessoalEstrutura | null>(null);
  const [coordenacao, setCoordenacao] = useState<PessoalCoordenacao | null>(null);
  const [quadro,      setQuadro]      = useState<QuadroPessoal | null>(null);
  const [estruturaErr,   setEstruturaErr]   = useState("");
  const [coordenacaoErr, setCoordenacaoErr] = useState("");
  const [quadroErr,      setQuadroErr]      = useState("");
  const [loading,        setLoading]        = useState(true);

  // Estado da tabela escola-a-escola
  const [escolasData,    setEscolasData]    = useState<EscolasPayload<PessoalEscolaRow> | null>(null);
  const [escolasLoading, setEscolasLoading] = useState(true);
  const [escolasError,   setEscolasError]   = useState("");
  const [esPage,     setEsPage]     = useState(1);
  const [esPageSize, setEsPageSize] = useState(10);
  const [esSortKey,  setEsSortKey]  = useState<PessoalEscolasSortKey>("escola");
  const [esSortDir,  setEsSortDir]  = useState<"asc" | "desc">("asc");
  const [esSearch,   setEsSearch]   = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEstrutura(null); setCoordenacao(null); setQuadro(null);
    setEstruturaErr(""); setCoordenacaoErr(""); setQuadroErr("");

    const qs = buildFilterParams(filters);

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pEstrutura = apiFetch<PessoalEstrutura>(
      `/v1/admin/analytics/pessoal-gestao/estrutura${qs}`, token,
    )
      .then((d) => { if (!cancelled) setEstrutura(d); })
      .catch(handleErr(setEstruturaErr));

    const pCoord = apiFetch<PessoalCoordenacao>(
      `/v1/admin/analytics/pessoal-gestao/coordenacao${qs}`, token,
    )
      .then((d) => { if (!cancelled) setCoordenacao(d); })
      .catch(handleErr(setCoordenacaoErr));

    const pQuadro = apiFetch<QuadroPessoal>(
      `/v1/admin/analytics/pessoal-gestao/quadro-pessoal${qs}`, token,
    )
      .then((d) => { if (!cancelled) setQuadro(d); })
      .catch(handleErr(setQuadroErr));

    Promise.all([pEstrutura, pCoord, pQuadro]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, onUnauth, filters]);

  // useEffect separado para a tabela escola-a-escola
  const handleEsSort = useCallback((key: string) => {
    setEsSortDir((d) => esSortKey === key ? (d === "asc" ? "desc" : "asc") : "asc");
    setEsSortKey(key as PessoalEscolasSortKey);
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

    apiFetch<EscolasPayload<PessoalEscolaRow>>(
      `/v1/admin/analytics/pessoal-gestao/escolas?${p.toString()}`, token,
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

  if (!estrutura && !coordenacao && !quadro) {
    const msg = estruturaErr || coordenacaoErr || quadroErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  // Estrutura de Gestão: HBarChart usando percentual.
  const composicaoRows = (estrutura?.composicao_gestao ?? []).map((c) => ({
    label: c.valor,
    value: Math.round(c.percentual),
  }));

  // Coordenação por área.
  const porAreaRows = (coordenacao?.por_area ?? []).map((c) => ({
    label: c.valor,
    value: Math.round(c.percentual),
  }));

  // Donut efetivo vs temporário.
  const vinculoSegments = quadro
    ? [
        { label: "Efetivos",   value: Math.round(quadro.total_professores_efetivos),    color: "#1E5B8A" },
        { label: "Temporários", value: Math.round(quadro.total_professores_temporarios), color: "#8B5CF6" },
      ].filter((s) => s.value > 0)
    : [];

  // Por DRE: top 10 com mais professores (efetivos+temporários).
  const porDreSorted = (quadro?.por_dre ?? [])
    .slice()
    .sort((a, b) => (b.total_efetivos + b.total_temporarios) - (a.total_efetivos + a.total_temporarios));
  const porDreTopRows = porDreSorted.slice(0, 10).map((d) => ({
    label: d.dre,
    value: Math.round(d.total_efetivos + d.total_temporarios),
  }));

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div data-pres-hide="true" className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: {buildPostgresSourceLabel(filters)}</span>
      </div>

      {/* ── Estrutura de Gestão Escolar ──────────────────────────── */}
      <div id="sec-pessoal-estrutura" data-pres-hide="true" className="flex items-center gap-3">
        <UsersRound size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Estrutura de Gestão Escolar</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Banners de erro parcial */}
      {estruturaErr && (coordenacao || quadro) && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de estrutura de gestão indisponíveis ({estruturaErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {coordenacaoErr && (estrutura || quadro) && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de coordenação indisponíveis ({coordenacaoErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {quadroErr && (estrutura || coordenacao) && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Dados de quadro de pessoal indisponíveis ({quadroErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}

      <div data-pres-slide="pessoal-estrutura-resumo" className="space-y-6">
      {/* ── Resumo Executivo ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
        <StatCard
          label="Coordenadores Pedagógicos"
          value={fmtInt(estrutura?.total_coordenadores_pedagogicos)}
          Icon={GraduationCap}
          tone="blue"
          sub="total declarado pelas escolas"
        />
        <StatCard
          label="Cobertura Média de Coordenação"
          value={fmtMedia(coordenacao?.cobertura_media)}
          Icon={BookOpen}
          tone="green"
          sub="áreas cobertas por escola"
        />
        <StatCard
          label="Professores Efetivos"
          value={fmtInt(quadro?.total_professores_efetivos)}
          Icon={Briefcase}
          tone="amber"
          sub="total declarado"
        />
        <StatCard
          label="Professores Temporários"
          value={fmtInt(quadro?.total_professores_temporarios)}
          Icon={Users}
          tone="purple"
          sub="total declarado"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fade-in-up [animation-delay:150ms]">
        <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
          <UsersRound size={16} style={{ color: C.primary }} />
          Composição da Gestão Escolar
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          Percentual de escolas que declaram possuir cada função/cargo de gestão.
        </p>
        {composicaoRows.length > 0 ? (
          <HBarChart rows={composicaoRows} unit="%" color={C.primary} />
        ) : (
          <NoData />
        )}
      </div>

      </div>
      {/* ── Coordenação Pedagógica ───────────────────────────────── */}
      <div id="sec-pessoal-coordenacao" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4 animate-fade-in-up [animation-delay:300ms]">
        <GraduationCap size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Coordenação Pedagógica</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="pessoal-coordenacao" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Layers size={16} style={{ color: C.primary }} />
            Coordenação por área
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Cada escola pode declarar mais de uma área de coordenação.
          </p>
          {porAreaRows.length > 0 ? (
            <HBarChart rows={porAreaRows} unit="%" color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      </div>
      {/* ── Quadro de Pessoal ────────────────────────────────────── */}
      <div id="sec-pessoal-quadro" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <Briefcase size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Quadro de Pessoal</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="pessoal-quadro-indicadores" className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Servidores Administrativos"
          value={fmtInt(quadro?.total_servidores_administrativos)}
          Icon={Briefcase}
          tone="blue"
          sub="total declarado"
        />
        <StatCard
          label="Professores Readaptados"
          value={fmtInt(quadro?.total_professores_readaptados)}
          Icon={UserCheck}
          tone="amber"
          sub="total declarado"
        />
        <StatCard
          label="Média de Efetivos / Escola"
          value={fmtMedia(quadro?.media_por_escola.efetivos)}
          Icon={Users}
          tone="green"
          sub="média declarada"
        />
        <StatCard
          label="Média de Temporários / Escola"
          value={fmtMedia(quadro?.media_por_escola.temporarios)}
          Icon={Users}
          tone="purple"
          sub="média declarada"
        />
      </div>

      </div>
      <div data-pres-slide="pessoal-quadro-distribuicao" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Users size={16} style={{ color: C.primary }} />
            Distribuição do quadro docente
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Mix entre professores efetivos e temporários.
          </p>
          {vinculoSegments.length > 0 ? (
            <Donut segments={vinculoSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <MapPinned size={16} style={{ color: C.primary }} />
            Quadro docente por DRE (Top 10)
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Soma de efetivos e temporários declarados, por DRE.
          </p>
          {porDreTopRows.length > 0 ? (
            <HBarChart rows={porDreTopRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      </div>
      <div data-pres-slide="pessoal-quadro-dre" className="space-y-6">
      {quadro && quadro.por_dre.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div
            className="px-6 py-4 border-b flex items-center gap-2"
            style={{ background: C.primaryLight }}
          >
            <ClipboardList size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-sm">Detalhamento por DRE</h2>
          </div>
          <div data-pres-table-scroll="true" className="p-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4 font-medium">DRE</th>
                  <th className="py-2 pr-4 font-medium text-right">Efetivos</th>
                  <th className="py-2 pr-4 font-medium text-right">Temporários</th>
                  <th className="py-2 font-medium text-right">Média total de professores</th>
                </tr>
              </thead>
              <tbody>
                {porDreSorted.map((d) => (
                  <tr key={d.dre} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                    <td className="py-2 pr-4 text-slate-700 font-medium group-hover:text-blue-700 transition-colors">{d.dre}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-800 group-hover:text-slate-900 transition-colors">
                      {Math.round(d.total_efetivos).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-800 group-hover:text-slate-900 transition-colors">
                      {Math.round(d.total_temporarios).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-800 font-semibold group-hover:text-blue-900 transition-colors">
                      {fmtMedia(d.media_total_professores)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-4">
              Valores declarados pelas escolas no formulário do censo.
            </p>
          </div>
        </div>
      )}
      </div>

      {/* Tabela escola-a-escola — oculta no modo apresentação */}
      <div data-pres-hide="true">
        <AdminDataTable<PessoalEscolaRow>
          title="Pessoal e Gestão Escolar — Escola a Escola"
          columns={PESSOAL_ESCOLAS_COLUMNS}
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
