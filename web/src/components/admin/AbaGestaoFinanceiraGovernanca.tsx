"use client";

import React, { useEffect, useState } from "react";
import {
  Landmark, AlertCircle, Loader2, Wallet, RefreshCcw, Percent,
  Building2, Link2, Unlink, CalendarRange, FileCheck2, Network, Trophy,
} from "lucide-react";
import { apiFetch } from "./shared/api";
import { C } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import type { DashboardFilters } from "./shared/types";

// =========================================================================
// Gestão Financeira e Governança — aba PRODEP (PR técnico 3)
//
// Primeira versão funcional, consumindo o endpoint analítico protegido:
//   GET /v1/admin/analytics/financeiro-governanca/prodep
//
// Os tipos do payload são declarados localmente (e não em shared/types) para
// manter o PR pequeno e contido a este arquivo, conforme escopo definido.
//
// Notas metodológicas (espelham o backend):
//   * Fonte = PRODEP; somente registros usar_na_carga = true.
//   * codigo_inep_prodep é a chave de identidade financeira (nunca a sede).
//   * matched_by_base_dige e prodep_only_validado entram no financeiro, mas
//     podem não alimentar o Índice de Saúde Operacional enquanto não houver
//     vínculo confirmado com `schools`.
// =========================================================================

type ProdepResumo = {
  totalRecebido: number;
  totalReprogramado: number;
  percentualReprogramado: number;
  totalRegistros: number;
  totalEscolas: number;
  totalEscolasComSchoolId: number;
  totalEscolasSemSchoolId: number;
};

type ProdepSerieAno = {
  ano: number;
  totalRecebido: number;
  totalReprogramado: number;
  percentualReprogramado: number;
  totalEscolas: number;
};

type ProdepStatusPrestacao = {
  status: string;
  totalRegistros: number;
  totalEscolas: number;
  totalRecebido: number;
  totalReprogramado: number;
};

type ProdepVinculo = {
  matchStatus: string;
  totalEscolas: number;
  totalRegistros: number;
  totalRecebido: number;
  totalReprogramado: number;
};

type ProdepRankingEscola = {
  codigoInepProdep: string;
  escola: string;
  dre: string | null;
  municipio: string | null;
  matchStatus: string;
  schoolId: number | null;
  codigoInepSede: string | null;
  schoolIdSede: number | null;
  totalRecebido: number;
  totalReprogramado: number;
  percentualReprogramado: number;
};

type ProdepFinanceiroPayload = {
  resumo: ProdepResumo;
  porAno: ProdepSerieAno[];
  porStatusPrestacaoContas: ProdepStatusPrestacao[];
  porVinculoCadastral: ProdepVinculo[];
  topEscolasPorRecebido: ProdepRankingEscola[];
  topEscolasPorReprogramado: ProdepRankingEscola[];
  metadados: {
    fonte: string;
    usarNaCarga: boolean;
    observacao: string;
  };
};

type AbaGestaoFinanceiraGovernancaProps = {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
  // Mantidos por compatibilidade com o padrão das demais abas, ainda que não
  // sejam usados diretamente nesta versão.
  presentationMode?: boolean;
  activeAnchor?: string;
  onLoadComplete?: () => void;
};

// O endpoint PRODEP usa `ano` (não `year`) e `ri` (não `regiao_integracao`), e
// NÃO suporta `zona`. Mapeamos apenas os filtros globais compatíveis.
function buildFinanceiroParams(filters?: DashboardFilters): string {
  const p = new URLSearchParams();
  if (filters?.ano) p.set("ano", String(filters.ano));
  if (filters?.dre) p.set("dre", filters.dre);
  if (filters?.municipio) p.set("municipio", filters.municipio);
  if (filters?.regiao_integracao) p.set("ri", filters.regiao_integracao);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Dinheiro compacto em pt-BR: R$ 235,7 mi / R$ 88,9 mil / R$ 1,2 bi.
function fmtMoneyCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `R$ ${fmt(v / 1_000_000_000)} bi`;
  if (abs >= 1_000_000) return `R$ ${fmt(v / 1_000_000)} mi`;
  if (abs >= 1_000) return `R$ ${fmt(v / 1_000)} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Dinheiro completo (tabelas/rankings).
function fmtMoneyFull(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v).toLocaleString("pt-BR");
}

// Rótulos amigáveis para status de prestação de contas.
const STATUS_PC_LABELS: Record<string, string> = {
  ok: "Regular / informado",
  sem_recurso: "Sem recurso",
  nao_prestou_contas: "Não prestou contas",
  nao_informado: "Não informado",
};

function labelStatusPC(status: string): string {
  return STATUS_PC_LABELS[status] ?? status;
}

// Rótulos amigáveis para vínculo cadastral (match_status).
const VINCULO_LABELS: Record<string, string> = {
  matched_by_inep_schools: "Vinculado ao cadastro schools",
  matched_by_base_dige: "Localizado na base_dige",
  prodep_only_validado: "PRODEP-only validado",
  anexo_vinculado_sede: "Anexo vinculado à sede",
};

function labelVinculo(match: string): string {
  return VINCULO_LABELS[match] ?? match;
}

function NoData({ msg = "Sem dados disponíveis para este recorte." }: { msg?: string }) {
  return <div className="text-xs text-slate-400 italic py-6 text-center">{msg}</div>;
}

// Cabeçalho de seção, no mesmo padrão visual das demais abas analíticas.
function SectionHeader({
  id, Icon, title, borderTop = false,
}: {
  id: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  title: string;
  borderTop?: boolean;
}) {
  return (
    <div
      id={id}
      data-pres-hide="true"
      className={`flex items-center gap-3 ${borderTop ? "border-t border-slate-200 pt-4" : ""}`}
    >
      <Icon size={18} style={{ color: C.primary }} />
      <h2 className="font-semibold text-slate-800 text-base">{title}</h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function RankingTable({ rows }: { rows: ProdepRankingEscola[] }) {
  if (rows.length === 0) return <NoData />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3 font-semibold">Escola</th>
            <th className="py-2 px-3 font-semibold">Município</th>
            <th className="py-2 px-3 font-semibold">DRE</th>
            <th className="py-2 px-3 font-semibold">Vínculo</th>
            <th className="py-2 px-3 font-semibold text-right">Recebido</th>
            <th className="py-2 px-3 font-semibold text-right">Reprogramado</th>
            <th className="py-2 pl-3 font-semibold text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.codigoInepProdep}
              className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <td className="py-2 pr-3 align-top">
                <div className="font-medium text-slate-800">{r.escola || "—"}</div>
                <div className="text-xs text-slate-400">INEP {r.codigoInepProdep}</div>
                {r.codigoInepSede && (
                  <div className="text-xs text-slate-400 italic">
                    Anexo vinculado à sede INEP {r.codigoInepSede}
                  </div>
                )}
              </td>
              <td className="py-2 px-3 align-top text-slate-600">{r.municipio ?? "—"}</td>
              <td className="py-2 px-3 align-top text-slate-600">{r.dre ?? "—"}</td>
              <td className="py-2 px-3 align-top text-slate-600">{labelVinculo(r.matchStatus)}</td>
              <td className="py-2 px-3 align-top text-right tabular-nums text-slate-800">
                {fmtMoneyFull(r.totalRecebido)}
              </td>
              <td className="py-2 px-3 align-top text-right tabular-nums text-slate-800">
                {fmtMoneyFull(r.totalReprogramado)}
              </td>
              <td className="py-2 pl-3 align-top text-right tabular-nums text-slate-500">
                {fmtPct(r.percentualReprogramado)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AbaGestaoFinanceiraGovernanca({
  token, onUnauth, filters, onLoadComplete,
}: AbaGestaoFinanceiraGovernancaProps) {
  const [data, setData] = useState<ProdepFinanceiroPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError("");

    const qs = buildFinanceiroParams(filters);

    apiFetch<ProdepFinanceiroPayload>(
      `/v1/admin/analytics/financeiro-governanca/prodep${qs}`, token,
    )
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        const msg = (e as Error).message;
        if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
        if (!cancelled) setError(msg);
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); onLoadComplete?.(); }
      });

    return () => { cancelled = true; };
  }, [token, onUnauth, filters, onLoadComplete]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} />
        Carregando indicadores financeiros…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        Não foi possível carregar os indicadores financeiros: {error}
      </div>
    );
  }

  // Sem dados importados para o recorte: estado vazio informativo, sem quebrar layout.
  if (!data || data.resumo.totalRegistros === 0) {
    return (
      <div className="space-y-6">
        <div data-pres-hide="true" className="flex items-center gap-2 text-xs text-emerald-700">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span>Fonte: PRODEP · registros validados para carga</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-12 flex flex-col items-center text-center shadow-sm">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-sm mb-4"
            style={{ background: C.primary }}
          >
            <Landmark size={26} strokeWidth={1.75} />
          </div>
          <h3 className="font-semibold text-slate-800 text-base">
            Sem dados financeiros para este recorte
          </h3>
          <p className="text-sm text-slate-600 max-w-xl mt-2">
            Ainda não há dados PRODEP importados para este recorte.
          </p>
        </div>
      </div>
    );
  }

  const { resumo } = data;

  return (
    <div className="space-y-6">
      {/* Badge de fonte */}
      <div data-pres-hide="true" className="flex items-center gap-2 text-xs text-emerald-700">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        <span>Fonte: PRODEP · registros validados para carga</span>
      </div>

      {/* ── 9.1 Visão Geral Financeira ──────────────────────────────── */}
      <SectionHeader id="sec-financeiro-resumo" Icon={Wallet} title="Visão Geral Financeira" />

      <div data-pres-slide="financeiro-resumo-cards" className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Total Recebido"
            value={fmtMoneyCompact(resumo.totalRecebido)}
            Icon={Wallet}
            tone="green"
            sub="repasses PRODEP no recorte"
          />
          <StatCard
            label="Total Reprogramado"
            value={fmtMoneyCompact(resumo.totalReprogramado)}
            Icon={RefreshCcw}
            tone="amber"
            sub="saldo reprogramado"
          />
          <StatCard
            label="% Reprogramado"
            value={fmtPct(resumo.percentualReprogramado)}
            Icon={Percent}
            tone="orange"
            sub="reprogramado ÷ recebido"
          />
          <StatCard
            label="Escolas no PRODEP"
            value={fmtInt(resumo.totalEscolas)}
            Icon={Building2}
            tone="blue"
            sub={`${fmtInt(resumo.totalRegistros)} registros`}
          />
          <StatCard
            label="Com Vínculo no Cadastro"
            value={fmtInt(resumo.totalEscolasComSchoolId)}
            Icon={Link2}
            tone="green"
            sub="escolas com school_id"
          />
          <StatCard
            label="Sem Vínculo Operacional"
            value={fmtInt(resumo.totalEscolasSemSchoolId)}
            Icon={Unlink}
            tone="purple"
            sub="escolas sem school_id"
          />
        </div>

        {/* Aviso metodológico fixo */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed">
          Fonte: PRODEP. A análise financeira inclui registros localizados em
          base_dige e registros PRODEP-only validados. Esses registros não alimentam
          automaticamente o Índice de Saúde Operacional escola-a-escola enquanto não
          houver vínculo confirmado com <code className="font-mono">schools</code>.
        </div>
      </div>

      {/* ── 9.2 Execução por Ano ────────────────────────────────────── */}
      <SectionHeader id="sec-financeiro-evolucao" Icon={CalendarRange} title="Execução por Ano" borderTop />

      <div data-pres-slide="financeiro-evolucao-ano" className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          {data.porAno.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Ano</th>
                    <th className="py-2 px-3 font-semibold text-right">Recebido</th>
                    <th className="py-2 px-3 font-semibold text-right">Reprogramado</th>
                    <th className="py-2 px-3 font-semibold text-right">% Reprog.</th>
                    <th className="py-2 pl-3 font-semibold text-right">Escolas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porAno.map((a) => (
                    <tr key={a.ano} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-800">{a.ano}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-800">{fmtMoneyFull(a.totalRecebido)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-800">{fmtMoneyFull(a.totalReprogramado)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-500">{fmtPct(a.percentualReprogramado)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-600">{fmtInt(a.totalEscolas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* ── 9.3 Prestação de Contas ─────────────────────────────────── */}
      <SectionHeader id="sec-financeiro-prestacao" Icon={FileCheck2} title="Prestação de Contas" borderTop />

      <div data-pres-slide="financeiro-prestacao-status" className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <FileCheck2 size={16} style={{ color: C.primary }} />
            Distribuição por status de prestação de contas
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Registros e escolas por situação declarada no PRODEP.
          </p>
          {data.porStatusPrestacaoContas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 px-3 font-semibold text-right">Registros</th>
                    <th className="py-2 px-3 font-semibold text-right">Escolas</th>
                    <th className="py-2 px-3 font-semibold text-right">Recebido</th>
                    <th className="py-2 pl-3 font-semibold text-right">Reprogramado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porStatusPrestacaoContas.map((s) => (
                    <tr key={s.status} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-800">{labelStatusPC(s.status)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtInt(s.totalRegistros)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtInt(s.totalEscolas)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-800">{fmtMoneyFull(s.totalRecebido)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-800">{fmtMoneyFull(s.totalReprogramado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* ── 9.4 Vínculo Cadastral ───────────────────────────────────── */}
      <SectionHeader id="sec-financeiro-vinculo" Icon={Network} title="Vínculo Cadastral" borderTop />

      <div data-pres-slide="financeiro-vinculo-cadastral" className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Network size={16} style={{ color: C.primary }} />
            Distribuição por vínculo financeiro-cadastral
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Como cada registro PRODEP se relaciona ao cadastro operacional.
          </p>
          {data.porVinculoCadastral.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Vínculo</th>
                    <th className="py-2 px-3 font-semibold text-right">Escolas</th>
                    <th className="py-2 px-3 font-semibold text-right">Registros</th>
                    <th className="py-2 px-3 font-semibold text-right">Recebido</th>
                    <th className="py-2 pl-3 font-semibold text-right">Reprogramado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porVinculoCadastral.map((v) => (
                    <tr key={v.matchStatus} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-800">{labelVinculo(v.matchStatus)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtInt(v.totalEscolas)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtInt(v.totalRegistros)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-800">{fmtMoneyFull(v.totalRecebido)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-slate-800">{fmtMoneyFull(v.totalReprogramado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <NoData />
          )}

          {/* Nota metodológica do vínculo cadastral */}
          <div className="mt-5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs leading-relaxed">
            Registros localizados apenas na base_dige ou PRODEP-only entram na análise
            financeira, mas não entram automaticamente no Índice de Saúde Operacional.
          </div>
        </div>
      </div>

      {/* ── 9.5 Rankings de Escolas ─────────────────────────────────── */}
      <SectionHeader id="sec-financeiro-rankings" Icon={Trophy} title="Rankings de Escolas" borderTop />

      <div data-pres-slide="financeiro-ranking-recebido" className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <Trophy size={16} style={{ color: C.primary }} />
            Top escolas por valor recebido
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Maiores volumes de repasse recebido por escola (chave INEP PRODEP).
          </p>
          <RankingTable rows={data.topEscolasPorRecebido} />
        </div>
      </div>

      <div data-pres-slide="financeiro-ranking-reprogramado" className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
            <RefreshCcw size={16} style={{ color: C.primary }} />
            Top escolas por valor reprogramado
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Maiores saldos reprogramados por escola (chave INEP PRODEP).
          </p>
          <RankingTable rows={data.topEscolasPorReprogramado} />
        </div>
      </div>

      <p data-pres-hide="true" className="text-xs text-slate-400">
        {data.metadados.observacao}
      </p>
    </div>
  );
}
