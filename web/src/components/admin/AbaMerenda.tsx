"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Utensils, AlertCircle, Loader2, CheckCircle2, Users,
  Snowflake, Refrigerator, Flame, Microwave, GlassWater,
  ChefHat, ClipboardList,
  ShieldCheck, Package, FireExtinguisher,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  MerendaOferta, MerendaEquipamentos, EquipTotais,
  MerendaCondicoesSanitarias, DashboardFilters,
  MerendaEscolaRow, EscolasPayload,
} from "./shared/types";
import { buildPostgresSourceLabel } from "./shared/sourceLabel";
import { ReportButton } from "./shared/ReportButton";
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

type AbaMerendaProps = {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
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

// Cores institucionais por estado de conservação.
const CONSERVACAO_CORES: Record<string, string> = {
  "Bom": "#10B981",            // verde positivo
  "Regular": "#F59E0B",        // âmbar
  "Ruim/Inoperante": "#E11D48", // vermelho/rose
};

// Barras empilhadas horizontais (100%) do estado de conservação por equipamento.
// Reaproveita a estrutura já pivotada de `estado_consolidado`.
function StackedConservationBar({
  equipamentos,
  estados,
  dados,
  nomeEquip,
}: {
  equipamentos: string[];
  estados: string[];
  dados: Record<string, Record<string, { escolas: number; percentual: number }>>;
  nomeEquip: (eq: string) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        {estados.map((est) => (
          <span key={est} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ background: CONSERVACAO_CORES[est] ?? "#94A3B8" }}
            />
            {est}
          </span>
        ))}
      </div>

      {/* Uma barra 100% por equipamento */}
      <div className="space-y-3">
        {equipamentos.map((eq) => {
          const linha = dados[eq] ?? {};
          const total = estados.reduce((acc, est) => acc + (linha[est]?.escolas ?? 0), 0);
          const ruimCell = linha["Ruim/Inoperante"];
          const ruimWidth = total > 0 && ruimCell ? (ruimCell.escolas / total) * 100 : 0;
          const showRuimOutside = !!ruimCell && ruimCell.escolas > 0 && ruimWidth < 12;
          const ruimOutsideLabel = showRuimOutside && ruimCell ? fmtPct(ruimCell.percentual) : "0%";
          const ruimOutsideTitle =
            showRuimOutside && ruimCell
              ? `${nomeEquip(eq)} · Ruim/Inoperante: ${ruimCell.escolas.toLocaleString("pt-BR")} (${fmtPct(ruimCell.percentual)})`
              : undefined;
          return (
            <div key={eq} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-slate-700">{nomeEquip(eq)}</span>
              <div className="flex-1 flex h-6 rounded-md overflow-hidden bg-slate-100">
                {total > 0 &&
                  estados.map((est) => {
                    const cell = linha[est];
                    if (!cell || cell.escolas <= 0) return null;
                    const w = (cell.escolas / total) * 100;
                    return (
                      <div
                        key={est}
                        className="flex items-center justify-center text-[11px] font-medium text-white overflow-hidden whitespace-nowrap"
                        style={{ width: `${w}%`, background: CONSERVACAO_CORES[est] ?? "#94A3B8" }}
                        title={`${nomeEquip(eq)} · ${est}: ${cell.escolas.toLocaleString("pt-BR")} (${fmtPct(cell.percentual)})`}
                      >
                        {w >= 12 ? `${Math.round(w)}%` : ""}
                      </div>
                    );
                  })}
              </div>
              <span
                className={`w-14 shrink-0 text-xs font-semibold tabular-nums ${
                  showRuimOutside ? "text-rose-700" : "text-transparent"
                }`}
                title={ruimOutsideTitle}
                aria-hidden={!showRuimOutside}
              >
                {ruimOutsideLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MERENDA_ESCOLAS_SORT_KEYS = ["escola", "dre", "municipio", "zona", "oferta", "qualidade"] as const;
type MerendaEscolasSortKey = (typeof MERENDA_ESCOLAS_SORT_KEYS)[number];

const MERENDA_ESCOLAS_COLUMNS: DataTableColumn<MerendaEscolaRow>[] = [
  { key: "nome_escola",                  label: "Escola",         sortable: true },
  { key: "codigo_inep",                  label: "INEP"                           },
  { key: "dre",                          label: "DRE",            sortable: true },
  { key: "municipio",                    label: "Município",      sortable: true },
  { key: "zona",                         label: "Zona",           sortable: true },
  { key: "oferta_regular",               label: "Oferta Regular", sortable: true },
  { key: "qualidade_merenda",            label: "Qualidade",      sortable: true },
  { key: "possui_refeitorio",            label: "Refeitório"                     },
  { key: "condicoes_cozinha",            label: "Cond. Cozinha"                  },
  { key: "qtd_freezers",                 label: "Freezers",       align: "right" },
  { key: "qtd_geladeiras",               label: "Geladeiras",     align: "right" },
  { key: "qtd_fogoes",                   label: "Fogões",         align: "right" },
  { key: "qtd_fornos",                   label: "Fornos",         align: "right" },
  { key: "empresa_terceirizada_merenda", label: "Empresa Merenda"                },
  {
    key: "has_censo",
    label: "Censo",
    render: (row) => row.has_censo
      ? <span className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">Preenchido</span>
      : <span className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 border-slate-200">Sem dados</span>,
  },
];

export function AbaMerenda({ token, onUnauth, filters }: AbaMerendaProps) {
  const [oferta,     setOferta]     = useState<MerendaOferta | null>(null);
  const [equip,      setEquip]      = useState<MerendaEquipamentos | null>(null);
  const [sanit,      setSanit]      = useState<MerendaCondicoesSanitarias | null>(null);
  const [ofertaErr,  setOfertaErr]  = useState("");
  const [equipErr,   setEquipErr]   = useState("");
  const [sanitErr,   setSanitErr]   = useState("");
  const [loading,    setLoading]    = useState(true);

  // Estado da tabela escola-a-escola
  const [escolasData,    setEscolasData]    = useState<EscolasPayload<MerendaEscolaRow> | null>(null);
  const [escolasLoading, setEscolasLoading] = useState(true);
  const [escolasError,   setEscolasError]   = useState("");
  const [esPage,     setEsPage]     = useState(1);
  const [esPageSize, setEsPageSize] = useState(10);
  const [esSortKey,  setEsSortKey]  = useState<MerendaEscolasSortKey>("escola");
  const [esSortDir,  setEsSortDir]  = useState<"asc" | "desc">("asc");
  const [esSearch,   setEsSearch]   = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOferta(null); setEquip(null); setSanit(null);
    setOfertaErr(""); setEquipErr(""); setSanitErr("");

    const qs = buildFilterParams(filters);

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pOferta = apiFetch<MerendaOferta>(`/v1/admin/analytics/merenda/oferta${qs}`, token)
      .then((d) => { if (!cancelled) setOferta(d); })
      .catch(handleErr(setOfertaErr));

    const pEquip = apiFetch<MerendaEquipamentos>(`/v1/admin/analytics/merenda/equipamentos${qs}`, token)
      .then((d) => { if (!cancelled) setEquip(d); })
      .catch(handleErr(setEquipErr));

    const pSanit = apiFetch<MerendaCondicoesSanitarias>(`/v1/admin/analytics/merenda/condicoes-sanitarias${qs}`, token)
      .then((d) => { if (!cancelled) setSanit(d); })
      .catch(handleErr(setSanitErr));

    Promise.all([pOferta, pEquip, pSanit]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, onUnauth, filters]);

  // useEffect separado para a tabela escola-a-escola
  const handleEsSort = useCallback((key: string) => {
    setEsSortDir((d) => esSortKey === key ? (d === "asc" ? "desc" : "asc") : "asc");
    setEsSortKey(key as MerendaEscolasSortKey);
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

    apiFetch<EscolasPayload<MerendaEscolaRow>>(
      `/v1/admin/analytics/merenda/escolas?${p.toString()}`, token,
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

  if (!oferta && !equip && !sanit) {
    const msg = ofertaErr || equipErr || sanitErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

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
  const atendeNecessidadesSegments = (oferta?.dist_atende_necessidades ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const condCozinhaRows = (oferta?.dist_condicoes_cozinha ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
  }));
  const possuiRefeitorioSegments = (oferta?.dist_possui_refeitorio ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const tamanhoCozinhaRows = (oferta?.dist_tamanho_cozinha ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
  }));
  const refeitorioAdequadoRows = (oferta?.dist_refeitorio_adequado ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
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
  const equipNome = (eq: string) => equipLabels[eq] ?? eq;

  // Gráficos sintéticos de equipamentos (MER-01B).
  const presencaRows = (equip?.presenca_por_tipo ?? []).map((p) => ({
    label: equipNome(p.equipamento),
    value: p.escolas,
    pct: p.percentual,
  }));
  const faixasRows = (equip?.faixas_qtd_tipos ?? []).map((f) => ({
    label: f.label,
    value: f.escolas,
    pct: f.percentual,
  }));
  const mediaRows = (equip?.media_por_tipo ?? []).map((m) => ({
    label: equipNome(m.equipamento),
    value: m.media,
    display: fmtMedia(m.media),
  }));
  const criticidadeRows = (equip?.criticidade_por_equipamento ?? []).map((c) => ({
    label: equipNome(c.equipamento),
    value: c.percentual,
    display: fmtPct(c.percentual),
    trailing: `${c.escolas_criticas} esc.`,
  }));

  // Estado consolidado pivotado por equipamento (Bom / Regular / Ruim-Inoperante).
  const estadosConsolidados = ["Bom", "Regular", "Ruim/Inoperante"];
  const consolidadoPorEquip: Record<string, Record<string, { escolas: number; percentual: number }>> = {};
  (equip?.estado_consolidado ?? []).forEach((s) => {
    if (!consolidadoPorEquip[s.equipamento]) consolidadoPorEquip[s.equipamento] = {};
    consolidadoPorEquip[s.equipamento][s.estado] = { escolas: s.escolas, percentual: s.percentual };
  });
  const consolidadoEquipList = equipOrder.filter((eq) => consolidadoPorEquip[eq]);

  // ── Condições Sanitárias e Segurança (MER-01C) ──────────────────
  const despensaSegments = (sanit?.dist_despensa_exclusiva ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const depositoSegments = (sanit?.dist_deposito_conserva ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const itensBasicosRows = (sanit?.presenca_itens_basicos ?? []).map((p) => ({
    label: p.item,
    value: p.escolas,
    pct: p.percentual,
  }));
  const epiExtintorRows = (sanit?.dist_estoque_epi_extintor ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
  }));
  const manutencaoExtintorRows = (sanit?.dist_manutencao_extintores ?? []).map((s) => ({
    label: s.valor,
    value: s.escolas,
  }));

  return (
    <div className="space-y-6">
      {/* Badge de fonte + ação de relatório */}
      <div data-pres-hide="true" className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span>Fonte: {buildPostgresSourceLabel(filters)}</span>
        </div>
        <ReportButton
          reportId="merenda-escolar-condicoes"
          token={token}
          filters={filters}
          onUnauth={onUnauth}
        />
      </div>

      {/* Banners de erro parcial */}
      {ofertaErr && (equip || sanit) && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Oferta e estrutura da merenda indisponíveis ({ofertaErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {equipErr && (oferta || sanit) && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Equipamentos da merenda indisponíveis ({equipErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}
      {sanitErr && (oferta || equip) && (
        <div data-pres-hide="true" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Condições sanitárias e segurança da merenda indisponíveis ({sanitErr}). Exibindo apenas os demais blocos.</span>
        </div>
      )}

      {/* ── Oferta e Adequação da Merenda ────────────────────────── */}
      <div id="sec-merenda-oferta" data-pres-hide="true" className="flex items-center gap-3">
        <Utensils size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Oferta e Adequação da Merenda</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="merenda-oferta-resumo" className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      </div>
      <div data-pres-slide="merenda-oferta-graficos" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
            Merenda atende às necessidades dos alunos
          </h3>
          {atendeNecessidadesSegments.length > 0 ? (
            <Donut segments={atendeNecessidadesSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      <div data-pres-slide="merenda-oferta-necessidades" className="space-y-6">
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
      <div id="sec-merenda-estrutura" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <ChefHat size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Estrutura Física da Cozinha</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div data-pres-slide="merenda-estrutura-cozinha" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <ClipboardList size={16} style={{ color: C.primary }} />
            Condições da cozinha
          </h3>
          {condCozinhaRows.length > 0 ? (
            <HBarChart rows={condCozinhaRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Utensils size={16} style={{ color: C.primary }} />
            Possui refeitório?
          </h3>
          {possuiRefeitorioSegments.length > 0 ? (
            <Donut segments={possuiRefeitorioSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>
      <div data-pres-slide="merenda-estrutura-refeitorio" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <ChefHat size={16} style={{ color: C.primary }} />
            Tamanho da cozinha
          </h3>
          {tamanhoCozinhaRows.length > 0 ? (
            <HBarChart rows={tamanhoCozinhaRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: C.primary }} />
            O refeitório atende a necessidade da escola adequadamente?
          </h3>
          {refeitorioAdequadoRows.length > 0 ? (
            <HBarChart rows={refeitorioAdequadoRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
      </div>

      </div>
      {/* ── Equipamentos da Merenda ──────────────────────────────── */}
      <div id="sec-merenda-equipamentos" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <Refrigerator size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Equipamentos da Merenda</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div data-pres-slide="merenda-equipamentos-cards" className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <EquipCard label="Freezers"   dados={equip?.freezers}   Icon={Snowflake}    tone="blue" />
        <EquipCard label="Geladeiras" dados={equip?.geladeiras} Icon={Refrigerator} tone="green" />
        <EquipCard label="Fogões"     dados={equip?.fogoes}     Icon={Flame}        tone="orange" />
        <EquipCard label="Fornos"     dados={equip?.fornos}     Icon={Microwave}    tone="amber" />
        <EquipCard label="Bebedouros" dados={equip?.bebedouros} Icon={GlassWater}   tone="purple" />
      </div>
      </div>

      <div data-pres-slide="merenda-equipamentos-cobertura" className="space-y-6">
      {/* Gráficos sintéticos de equipamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: C.primary }} />
            Presença de equipamentos por tipo
          </h3>
          {presencaRows.length > 0 ? (
            <HBarChart rows={presencaRows} color={C.primary} labelWidth="6rem" />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Users size={16} style={{ color: C.primary }} />
            Escolas com 1, 2 ou mais tipos de equipamentos
          </h3>
          {faixasRows.length > 0 ? (
            <HBarChart rows={faixasRows} color={C.primary} labelWidth="7rem" />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      <div data-pres-slide="merenda-equipamentos-criticidade" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <ClipboardList size={16} style={{ color: C.primary }} />
            Quantidade média de equipamentos por escola
          </h3>
          {mediaRows.some((r) => r.value > 0) ? (
            <HBarChart rows={mediaRows} color={C.primary} labelWidth="6rem" />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-500" />
            Criticidade por equipamento
          </h3>
          <p className="text-xs text-slate-400 -mt-3 mb-4">% de escolas com estado ruim ou inoperante</p>
          {criticidadeRows.length > 0 ? (
            <HBarChart rows={criticidadeRows} color="#E11D48" labelWidth="6rem" />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      <div data-pres-slide="merenda-equipamentos-conservacao" className="space-y-6">
      {/* Estado de conservação — visão consolidada */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className="px-6 py-4 border-b flex items-center gap-2"
          style={{ background: C.primaryLight }}
        >
          <ClipboardList size={16} className="shrink-0" strokeWidth={2} style={{ color: C.primary }} />
          <h2 className="font-semibold text-slate-800 text-sm">Estado de conservação — visão consolidada</h2>
        </div>
        <div className="p-6">
          {consolidadoEquipList.length > 0 ? (
            <StackedConservationBar
              equipamentos={consolidadoEquipList}
              estados={estadosConsolidados}
              dados={consolidadoPorEquip}
              nomeEquip={equipNome}
            />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      <div data-pres-slide="merenda-equipamentos-tabela" className="space-y-6">
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
            <div data-pres-table-scroll="true" className="overflow-x-auto">
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
                      <tr key={`${eq}-${row.estado}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                        <td className="py-2 pr-4 text-slate-700 font-medium group-hover:text-blue-700 transition-colors">
                          {idx === 0 ? (equipLabels[eq] ?? eq) : ""}
                        </td>
                        <td className="py-2 pr-4 text-slate-600 group-hover:text-slate-900 transition-colors">{row.estado}</td>
                        <td className="py-2 text-right tabular-nums text-slate-800 font-semibold group-hover:text-blue-900 transition-colors">
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
      </div>

      {/* ── Condições Sanitárias e Segurança ─────────────────────── */}
      <div id="sec-merenda-sanitarias" data-pres-hide="true" className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <ShieldCheck size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">Condições Sanitárias e Segurança</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div data-pres-slide="merenda-sanitarias-armazenamento" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Package size={16} style={{ color: C.primary }} />
            Despensa exclusiva p/ gêneros alimentícios
          </h3>
          {despensaSegments.length > 0 ? (
            <Donut segments={despensaSegments} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: C.primary }} />
            O depósito conserva adequadamente os alimentos?
          </h3>
          {depositoSegments.length > 0 ? (
            <Donut segments={depositoSegments} />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      <div data-pres-slide="merenda-sanitarias-itens" className="space-y-6">
      <div className="grid grid-cols-1 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <ClipboardList size={16} style={{ color: C.primary }} />
            Presença de itens básicos
          </h3>
          <p className="text-xs text-slate-400 -mt-4 mb-5">% sobre o total de escolas concluídas no recorte</p>
          {itensBasicosRows.length > 0 ? (
            <HBarChart rows={itensBasicosRows} color={C.primary} labelWidth="9rem" />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      <div data-pres-slide="merenda-sanitarias-seguranca" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <FireExtinguisher size={16} style={{ color: C.primary }} />
            Estoque de EPIs e extintor de incêndio
          </h3>
          {epiExtintorRows.length > 0 ? (
            <HBarChart rows={epiExtintorRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
            <Flame size={16} style={{ color: C.primary }} />
            Recarga e manutenção dos extintores
          </h3>
          {manutencaoExtintorRows.length > 0 ? (
            <HBarChart rows={manutencaoExtintorRows} color={C.primary} />
          ) : (
            <NoData />
          )}
        </div>
      </div>
      </div>

      {/* Tabela escola-a-escola — oculta no modo apresentação */}
      <div data-pres-hide="true">
        <AdminDataTable<MerendaEscolaRow>
          title="Merenda Escolar — Escola a Escola"
          columns={MERENDA_ESCOLAS_COLUMNS}
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
