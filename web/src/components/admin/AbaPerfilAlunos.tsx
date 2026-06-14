"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertCircle, Loader2, School, BadgeCheck, MinusCircle,
  PieChart, Gauge, Scale, Link2Off, Info, TrendingUp, TrendingDown,
  LayoutDashboard, GraduationCap, BarChart3, Trophy, MapPinned, ShieldCheck,
} from "lucide-react";
import { apiFetch, getCached } from "./shared/api";
import { C } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { HBarChart } from "./shared/BarChart";
import type {
  DashboardFilters, IdebAnalytics, IdebPorEtapa, IdebRankingItem,
} from "./shared/types";

// ─── Configuração de etapa (seletor interno da aba) ─────────────────────────
// "todas" significa "sem filtro de etapa" — o endpoint trata etapa vazia como
// todas as etapas. Os demais valores são os enumerados aceitos pelo backend.
type EtapaSel = "todas" | "anos_iniciais" | "anos_finais" | "ensino_medio";

const ETAPA_OPCOES: { value: EtapaSel; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "anos_iniciais", label: "Anos iniciais" },
  { value: "anos_finais", label: "Anos finais" },
  { value: "ensino_medio", label: "Ensino médio" },
];

const ETAPA_LABELS: Record<string, string> = {
  anos_iniciais: "Anos iniciais",
  anos_finais: "Anos finais",
  ensino_medio: "Ensino médio",
};

const STATUS_VINCULO_LABELS: Record<string, string> = {
  match_inep: "Vinculado",
  sem_match_inep: "Sem vínculo",
  conflito_nome: "Conflito de nome",
  pendente_validacao: "Pendente",
};

// Ordem canônica das faixas (espelha o backend) para a distribuição.
const FAIXAS_ORDEM = [
  "Abaixo de 3,0",
  "3,0 a 3,9",
  "4,0 a 4,9",
  "5,0 a 5,9",
  "6,0 a 6,9",
  "7,0+",
  "Sem IDEB divulgado",
];

// ─── Helpers de formatação ──────────────────────────────────────────────────
const etapaLabel = (e: string) => ETAPA_LABELS[e] ?? e;
const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR");
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtIdeb = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum2 = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Monta a query string respeitando os filtros globais compatíveis + etapa.
// IMPORTANTE: o endpoint IDEB usa `ano` (não `year`). Nunca enviar filtros
// vazios. `ano` ausente faz o backend assumir 2023 (default IDEB).
function buildIdebParams(filters: DashboardFilters | undefined, etapa: EtapaSel): string {
  const p = new URLSearchParams();
  if (filters?.ano) p.set("ano", String(filters.ano));
  if (filters?.dre) p.set("dre", filters.dre);
  if (filters?.municipio) p.set("municipio", filters.municipio);
  if (filters?.zona) p.set("zona", filters.zona);
  // Mapeamento: filtro global de Região de Integração → regiao_integracao.
  if (filters?.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);
  if (etapa !== "todas") p.set("etapa", etapa);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const IDEB_BASE = "/v1/admin/analytics/perfil-alunos-resultados/ideb";

// Cabeçalho separador de seção, no mesmo padrão visual da aba "Gestão
// Financeira e Governança" (ícone + título + régua). O `id` é a âncora usada
// pela navegação lateral; `data-pres-hide` mantém o título fora dos slides do
// modo apresentação (o conteúdo segue marcado por `data-pres-slide`).
function SectionTitle({
  id, Icon, title, description, borderTop = false,
}: {
  id: string;
  Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  title: string;
  description?: string;
  borderTop?: boolean;
}) {
  return (
    <div id={id} data-pres-hide="true" className={borderTop ? "border-t border-slate-200 pt-5" : ""}>
      <div className="flex items-center gap-3">
        <Icon size={18} style={{ color: C.primary }} />
        <h2 className="font-semibold text-slate-800 text-base">{title}</h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      {description && (
        <p className="text-xs text-slate-500 mt-1.5 ml-[30px] leading-snug">{description}</p>
      )}
    </div>
  );
}

export function AbaPerfilAlunos({
  token, onUnauth, filters, presentationMode, onLoadComplete,
}: {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
  presentationMode?: boolean;
  activeAnchor?: string;
  onLoadComplete?: () => void;
}) {
  const [etapa, setEtapa] = useState<EtapaSel>("todas");

  const path = useMemo(
    () => `${IDEB_BASE}${buildIdebParams(filters, etapa)}`,
    [filters, etapa],
  );

  const [data, setData] = useState<IdebAnalytics | null>(() => getCached<IdebAnalytics>(path));
  const [loading, setLoading] = useState<boolean>(() => getCached<IdebAnalytics>(path) === null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cached = getCached<IdebAnalytics>(path);
    setErr("");
    if (cached) {
      setData(cached);
      setLoading(false);
      onLoadComplete?.();
      return;
    }
    setLoading(true);
    apiFetch<IdebAnalytics>(path, token)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => {
        if ((e as Error).message === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); onLoadComplete?.(); }
      });
    return () => { cancelled = true; };
  }, [path, token, onUnauth, onLoadComplete]);

  // Distribuição por faixas agrupada por etapa, na ordem canônica.
  const faixasPorEtapa = useMemo(() => {
    if (!data) return [];
    const grupos = new Map<string, { faixa: string; registros: number; percentual: number }[]>();
    for (const item of data.distribuicaoFaixas) {
      if (!grupos.has(item.etapa)) grupos.set(item.etapa, []);
      grupos.get(item.etapa)!.push(item);
    }
    const ordemEtapa = ["anos_iniciais", "anos_finais", "ensino_medio"];
    return [...grupos.entries()]
      .sort((a, b) => {
        const ia = ordemEtapa.indexOf(a[0]); const ib = ordemEtapa.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([etapaKey, itens]) => ({
        etapa: etapaKey,
        itens: [...itens].sort(
          (a, b) => FAIXAS_ORDEM.indexOf(a.faixa) - FAIXAS_ORDEM.indexOf(b.faixa),
        ),
      }));
  }, [data]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-slate-400">
      <Loader2 className="animate-spin mr-2" size={22} style={{ color: C.primary }} /> Carregando resultados do IDEB…
    </div>
  );
  if (err) return (
    <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
      <AlertCircle size={16} className="shrink-0 mt-0.5" /> {err}
    </div>
  );
  if (!data) return null;

  const { resumo, porEtapa, porDre, rankingEscolas, qualidade, metadados } = data;
  const anoRef = resumo.ano_referencia;

  return (
    <div className="space-y-5">
      {/* ── 1. Cabeçalho + nota metodológica ─────────────────────────── */}
      {!presentationMode && (
        <div data-pres-hide="true" className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 animate-slide-in-right space-y-2">
          <div>
            <p className="text-sm font-semibold text-orange-900">Perfil dos Alunos e Resultados</p>
            <p className="text-xs text-orange-800/90 mt-0.5">
              Resultados oficiais do IDEB {anoRef} por escola, etapa e recortes administrativos.
            </p>
          </div>
          <div className="flex items-start gap-2 text-[11px] leading-snug text-orange-800/80 border-t border-orange-200/70 pt-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              IDEB ausente não equivale a nota zero. As médias por DRE, município e demais
              recortes são cálculos do dashboard, não IDEB oficial agregado do INEP.
            </span>
          </div>
        </div>
      )}

      {/* Seletor de etapa (filtro próprio da aba) */}
      <div className="flex flex-wrap items-center gap-2" data-pres-hide="true">
        <span className="text-xs font-medium text-slate-500 mr-1">Etapa:</span>
        {ETAPA_OPCOES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setEtapa(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              etapa === opt.value
                ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── 2. Cards de resumo ───────────────────────────────────────── */}
      <SectionTitle
        id="sec-alunos-resumo"
        Icon={LayoutDashboard}
        title="Resumo IDEB 2023"
        description="Visão geral dos registros oficiais do IDEB por escola, etapa e recortes administrativos."
      />
      <div data-pres-slide="alunos-resumo-cards" className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up [animation-delay:150ms]">
          <StatCard
            label="Escolas/INEPs analisados"
            value={resumo.total_escolas_inep}
            Icon={School}
            tone="blue"
            sub={`${fmtInt(resumo.total_registros)} registros (escola × etapa)`}
            compact={presentationMode}
          />
          <StatCard
            label="Registros com IDEB"
            value={resumo.registros_com_ideb}
            Icon={BadgeCheck}
            tone="green"
            sub={`${fmtInt(resumo.escolas_com_algum_ideb)} escolas com algum IDEB`}
            compact={presentationMode}
          />
          <StatCard
            label="Sem IDEB divulgado"
            value={resumo.registros_sem_ideb}
            Icon={MinusCircle}
            tone="amber"
            sub="ausência, não nota zero"
            compact={presentationMode}
          />
          <StatCard
            label="Cobertura IDEB"
            value={fmtPct(resumo.cobertura_ideb_percentual)}
            Icon={PieChart}
            tone="purple"
            sub="registros com IDEB / total"
            compact={presentationMode}
          />
          <StatCard
            label="IDEB médio simples"
            value={fmtIdeb(resumo.ideb_medio_simples)}
            Icon={Gauge}
            tone="blue"
            sub="escolas com IDEB divulgado"
            compact={presentationMode}
          />
          <StatCard
            label="IDEB médio ponderado"
            value={fmtIdeb(resumo.ideb_medio_ponderado)}
            Icon={Scale}
            tone="green"
            sub="ponderado pelo total avaliado"
            compact={presentationMode}
          />
          <StatCard
            label="Sem vínculo cadastral"
            value={resumo.registros_sem_match_schools}
            Icon={Link2Off}
            tone="orange"
            sub="registros sem match em schools"
            compact={presentationMode}
          />
          <StatCard
            label="Escolas sem IDEB em qualquer etapa"
            value={resumo.escolas_sem_ideb_em_qualquer_etapa}
            Icon={MinusCircle}
            tone="amber"
            sub="nenhuma etapa com IDEB divulgado"
            compact={presentationMode}
          />
        </div>
      </div>

      {/* ── 3. Resultado por etapa ───────────────────────────────────── */}
      <SectionTitle
        id="sec-alunos-etapa"
        Icon={GraduationCap}
        title="Resultado por etapa"
        description="Indicadores do IDEB por etapa de ensino, considerando apenas escolas com IDEB divulgado nas médias."
        borderTop
      />
      <div data-pres-slide="alunos-etapa-tabela" className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fade-in-up">
          {porEtapa.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Etapa</th>
                    <th className="py-2 px-2 font-semibold text-right">Registros</th>
                    <th className="py-2 px-2 font-semibold text-right">Com IDEB</th>
                    <th className="py-2 px-2 font-semibold text-right">Sem IDEB</th>
                    <th className="py-2 px-2 font-semibold text-right">Cobertura</th>
                    <th className="py-2 px-2 font-semibold text-right">Médio simples</th>
                    <th className="py-2 px-2 font-semibold text-right">Médio ponderado</th>
                    <th className="py-2 px-2 font-semibold text-right">Mediana</th>
                    <th className="py-2 px-2 font-semibold text-right">Mín.</th>
                    <th className="py-2 px-2 font-semibold text-right">Máx.</th>
                    <th className="py-2 px-2 font-semibold text-right">Português</th>
                    <th className="py-2 px-2 font-semibold text-right">Matemática</th>
                    <th className="py-2 pl-2 font-semibold text-right">Fluxo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {porEtapa.map((e: IdebPorEtapa) => (
                    <tr key={e.etapa} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-700">{etapaLabel(e.etapa)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(e.registros)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(e.registros_com_ideb)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(e.registros_sem_ideb)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtPct(e.cobertura_ideb_percentual)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-800">{fmtIdeb(e.ideb_medio_simples)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-700">{fmtIdeb(e.ideb_medio_ponderado)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtIdeb(e.ideb_mediana)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtIdeb(e.ideb_min)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtIdeb(e.ideb_max)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtNum2(e.proficiencia_portugues_media)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtNum2(e.proficiencia_matematica_media)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-slate-600">{fmtNum2(e.fluxo_medio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">Nenhum registro IDEB no recorte selecionado.</p>
          )}
        </div>
      </div>

      {/* ── 4. Distribuição por faixas ───────────────────────────────── */}
      <SectionTitle
        id="sec-alunos-faixas"
        Icon={BarChart3}
        title="Distribuição por faixas"
        description="Distribuição dos registros por faixas de IDEB, com “Sem IDEB divulgado” tratado como ausência, não como desempenho."
        borderTop
      />
      <div data-pres-slide="alunos-faixas-distribuicao" className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fade-in-up">
          {faixasPorEtapa.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {faixasPorEtapa.map((g) => (
                <div key={g.etapa}>
                  <h4 className="text-xs font-semibold text-slate-600 mb-3">{etapaLabel(g.etapa)}</h4>
                  <HBarChart
                    rows={g.itens.map((it) => ({
                      label: it.faixa,
                      value: it.registros,
                      pct: it.percentual,
                    }))}
                    color={C.primary}
                    labelWidth="6.5rem"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">Sem distribuição para o recorte selecionado.</p>
          )}
        </div>
      </div>

      {/* ── 5. Ranking por escola ────────────────────────────────────── */}
      <SectionTitle
        id="sec-alunos-ranking"
        Icon={Trophy}
        title="Ranking por escola"
        description="Listas por etapa, sem misturar anos iniciais, anos finais e ensino médio."
        borderTop
      />
      <div data-pres-slide="alunos-ranking-escolas" className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in-up">
          <RankingCard
            title="Maiores IDEBs"
            subtitle="por etapa, IDEB divulgado"
            Icon={TrendingUp}
            tone="green"
            items={rankingEscolas.maioresIdebs}
          />
          <RankingCard
            title="Menores IDEBs"
            subtitle="por etapa, IDEB divulgado"
            Icon={TrendingDown}
            tone="rose"
            items={rankingEscolas.menoresIdebs}
          />
          <RankingCard
            title="Sem IDEB divulgado"
            subtitle="ausência — não é pior desempenho"
            Icon={MinusCircle}
            tone="amber"
            items={rankingEscolas.semIdebDivulgado}
            hideIdeb
          />
        </div>
        {rankingEscolas.baixaParticipacao.length > 0 && (
          <RankingCard
            title="Baixa participação"
            subtitle="percentual avaliado abaixo de 80%"
            Icon={AlertCircle}
            tone="orange"
            items={rankingEscolas.baixaParticipacao}
            showParticipacao
          />
        )}
      </div>

      {/* ── 6. Por DRE ───────────────────────────────────────────────── */}
      <SectionTitle
        id="sec-alunos-dre"
        Icon={MapPinned}
        title="Resultado por DRE"
        description="Agregações calculadas pelo dashboard para escolas vinculadas ao cadastro operacional."
        borderTop
      />
      <div data-pres-slide="alunos-dre-tabela" className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fade-in-up">
          {porDre.length > 0 ? (
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">DRE</th>
                    <th className="py-2 px-2 font-semibold">Etapa</th>
                    <th className="py-2 px-2 font-semibold text-right">Registros</th>
                    <th className="py-2 px-2 font-semibold text-right">Escolas</th>
                    <th className="py-2 px-2 font-semibold text-right">Com IDEB</th>
                    <th className="py-2 px-2 font-semibold text-right">Sem IDEB</th>
                    <th className="py-2 px-2 font-semibold text-right">Médio simples</th>
                    <th className="py-2 pl-2 font-semibold text-right">Médio ponderado</th>
                  </tr>
                </thead>
                <tbody>
                  {porDre.map((d, i) => (
                    <tr key={`${d.dre}-${d.etapa}-${i}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-3 font-medium text-slate-700">{d.dre}</td>
                      <td className="py-2 px-2 text-slate-600">{etapaLabel(d.etapa)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(d.registros)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(d.escolas)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(d.registros_com_ideb)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{fmtInt(d.registros_sem_ideb)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-800">{fmtIdeb(d.ideb_medio_simples)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-slate-700">{fmtIdeb(d.ideb_medio_ponderado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">Sem dados por DRE no recorte selecionado.</p>
          )}
        </div>
      </div>

      {/* ── 7. Qualidade da base ─────────────────────────────────────── */}
      <SectionTitle
        id="sec-alunos-qualidade"
        Icon={ShieldCheck}
        title="Qualidade da base"
        description="Indicadores de consistência, vínculo cadastral e características da importação IDEB 2023."
        borderTop
      />
      <div data-pres-slide="alunos-qualidade" className="space-y-5">
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 animate-fade-in-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <QualidadeItem label="Duplicidades de chave" value={fmtInt(qualidade.duplicidades_chave)} />
            <QualidadeItem label="ND proficiência" value={fmtInt(qualidade.registros_nd_proficiencia)} />
            <QualidadeItem label="% avaliado > 100" value={fmtInt(qualidade.percentuais_acima_100)} />
            <QualidadeItem label="% avaliado < 80" value={fmtInt(qualidade.percentuais_abaixo_80)} />
            <QualidadeItem label="Sem vínculo com schools" value={fmtInt(qualidade.registros_sem_match_schools)} />
            <QualidadeItem label="Batch de importação" value={metadados.import_batch_id ?? "—"} small />
          </div>
          <p className="text-[11px] text-slate-400 mt-4 leading-snug">
            Fonte: {metadados.fonte_arquivo} · {metadados.grao}.{" "}
            <a href={metadados.fonte_metodologica} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
              Nota metodológica IDEB {anoRef}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Componentes auxiliares (locais à aba) ──────────────────────────────────

function QualidadeItem({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
      <p className={`font-bold text-slate-800 tabular-nums mt-1 ${small ? "text-xs break-all" : "text-lg"}`}>{value}</p>
    </div>
  );
}

const RANKING_TONES: Record<string, string> = {
  green: "text-emerald-700 bg-emerald-50 ring-emerald-100",
  rose: "text-rose-700 bg-rose-50 ring-rose-100",
  amber: "text-amber-700 bg-amber-50 ring-amber-100",
  orange: "text-orange-700 bg-orange-50 ring-orange-100",
};

function RankingCard({
  title, subtitle, Icon, tone, items, hideIdeb = false, showParticipacao = false,
}: {
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "green" | "rose" | "amber" | "orange";
  items: IdebRankingItem[];
  hideIdeb?: boolean;
  showParticipacao?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start gap-2 mb-3">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${RANKING_TONES[tone]}`}>
          <Icon size={16} />
        </span>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm leading-tight">{title}</h3>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={`${it.codigo_inep}-${it.etapa}-${i}`} className="flex items-center justify-between gap-2 text-xs border-b border-slate-50 last:border-0 pb-1.5 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-slate-700 truncate" title={it.nome_escola_origem}>{it.nome_escola_origem}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {etapaLabel(it.etapa)}
                  {it.dre ? ` · ${it.dre}` : ""}
                  {it.status_vinculo && it.status_vinculo !== "match_inep"
                    ? ` · ${STATUS_VINCULO_LABELS[it.status_vinculo] ?? it.status_vinculo}`
                    : ""}
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                {hideIdeb ? (
                  <span className="text-slate-400 text-[11px]">Sem IDEB</span>
                ) : showParticipacao ? (
                  <span className="font-bold text-slate-800">{fmtPct(it.percentual_avaliado)}</span>
                ) : (
                  <span className="font-bold text-slate-800">{fmtIdeb(it.ideb)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6">Sem itens no recorte.</p>
      )}
    </div>
  );
}
