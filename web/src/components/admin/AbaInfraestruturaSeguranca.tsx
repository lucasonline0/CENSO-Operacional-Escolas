"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldCheck, Building2, AlertCircle, Loader2,
  Camera, DoorClosed, Lightbulb, Siren, MapPinned, Layers, Home,
  Sparkles, BellRing, Zap, Wrench,
} from "lucide-react";
import { apiFetch, getCached } from "./shared/api";
import { C, PORTE_COLORS } from "./shared/constants";
import { StatCard } from "./shared/StatCard";
import { Donut } from "./shared/Donut";
import { HBarChart } from "./shared/BarChart";
import type {
  InfraCondicoes, InfraSeguranca, InfraEnergia, DashboardFilters,
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

type AbaInfraestruturaSegurancaProps = {
  token: string;
  onUnauth: () => void;
  filters?: DashboardFilters;
  presentationMode?: boolean;
  activeAnchor?: string;
  onLoadComplete?: () => void;
};

// Formata percentual vindo do backend (float entre 0 e 100) como "xx,x%".
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}

// Pequeno empty inline para gráficos sem dados.
function NoData({ msg = "Sem dados disponíveis para este indicador." }: { msg?: string }) {
  return (
    <div className="text-xs text-slate-400 italic py-6 text-center">{msg}</div>
  );
}

export function AbaInfraestruturaSeguranca({
  token, onUnauth, filters, presentationMode = false, activeAnchor, onLoadComplete
}: AbaInfraestruturaSegurancaProps) {
  const [condicoes, setCondicoes] = useState<InfraCondicoes | null>(() => getCached("/v1/admin/analytics/infraestrutura/condicoes"));
  const [seguranca, setSeguranca] = useState<InfraSeguranca | null>(() => getCached("/v1/admin/analytics/infraestrutura/seguranca"));
  const [energia, setEnergia] = useState<InfraEnergia | null>(() => getCached("/v1/admin/analytics/infraestrutura/energia"));
  const [condErr, setCondErr] = useState("");
  const [segErr, setSegErr] = useState("");
  const [loading, setLoading] = useState(!condicoes && !seguranca);

  useEffect(() => {
    let cancelled = false;
    if (!condicoes && !seguranca) setLoading(true);

    const qs = buildFilterParams(filters);

    const handleErr = (setter: (s: string) => void) => (e: unknown) => {
      const msg = (e as Error).message;
      if (msg === "UNAUTHORIZED") { if (!cancelled) onUnauth(); return; }
      if (!cancelled) setter(msg);
    };

    const pCond = apiFetch<InfraCondicoes>(`/v1/admin/analytics/infraestrutura/condicoes${qs}`, token)
      .then((d) => { if (!cancelled) setCondicoes(d); })
      .catch(handleErr(setCondErr));

    const pSeg = apiFetch<InfraSeguranca>(`/v1/admin/analytics/infraestrutura/seguranca${qs}`, token)
      .then((d) => { if (!cancelled) setSeguranca(d); })
      .catch(handleErr(setSegErr));

    const pEnergia = apiFetch<InfraEnergia>(`/v1/admin/analytics/infraestrutura/energia${qs}`, token)
      .then((d) => { if (!cancelled) setEnergia(d); })
      .catch((e: unknown) => {
        const msg = (e as Error).message;
        if (msg === "UNAUTHORIZED" && !cancelled) onUnauth();
      });

    Promise.all([pCond, pSeg, pEnergia]).finally(() => {
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

  // Erro total — ambos falharam e nenhum payload disponível.
  if (!condicoes && !seguranca) {
    const msg = condErr || segErr || "Não foi possível carregar indicadores.";
    return (
      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" /> {msg}
      </div>
    );
  }

  // Donuts: tipos de prédio e situação da estrutura.
  const tipoPredioSegments = (condicoes?.por_tipo_predio ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const situacaoSegments = (condicoes?.por_situacao_estrutura ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
  }));
  const ambientesRows = (condicoes?.top_ambientes ?? []).map((a) => ({
    label: a.ambiente,
    value: a.escolas,
  }));
  const camerasSegments = (seguranca?.dist_cameras ?? []).map((s, i) => ({
    label: s.valor,
    value: s.escolas,
    color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
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
      {!presentationMode && condErr && seguranca && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Condições estruturais indisponíveis ({condErr}). Exibindo apenas os indicadores de segurança.</span>
        </div>
      )}
      {!presentationMode && segErr && condicoes && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>Segurança física indisponível ({segErr}). Exibindo apenas as condições estruturais.</span>
        </div>
      )}

      {/* ── Condições Estruturais e Ambientes ────────────────────── */}
      {isVisible("sec-infra-condicoes") && (
        <div className={presentationMode ? "space-y-4" : "space-y-6"}>
          <div className="flex items-center gap-3 animate-fade-in-up">
            <Layers size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Condições Estruturais e Ambientes</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {condicoes && (
            <div className={`grid grid-cols-1 lg:grid-cols-2 ${presentationMode ? "gap-5" : "gap-5"} animate-fade-in-up [animation-delay:150ms]`}>
              <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 group cursor-default animate-fade-in-up ${presentationMode ? "p-6" : "p-5"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide group-hover:text-slate-700 transition-colors">Reforma Crítica</p>
                    <p className={`font-bold text-slate-900 tabular-nums group-hover:scale-105 origin-left transition-transform ${presentationMode ? "text-3xl mt-2" : "text-3xl mt-2"}`}>
                      {fmtPct(condicoes.pct_reforma_critica)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">das escolas necessitam de reforma geral ou estão com a obra parada</p>
                    {!presentationMode && (
                      <p className="text-xs text-slate-400 mt-2">
                        Reforma geral: {fmtPct(condicoes.pct_reforma_geral)} · Obra parada: {fmtPct(condicoes.pct_obra_parada)}
                      </p>
                    )}
                  </div>
                  <div className={`rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100 shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform ${presentationMode ? "w-11 h-11" : "w-11 h-11"}`}>
                    <Wrench size={21} strokeWidth={2} />
                  </div>
                </div>
              </div>
              <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 group cursor-default animate-fade-in-up ${presentationMode ? "p-6" : "p-5"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide group-hover:text-slate-700 transition-colors">Cobertura Plena de Ambientes</p>
                    <p className={`font-bold text-slate-900 tabular-nums group-hover:scale-105 origin-left transition-transform ${presentationMode ? "text-3xl mt-2" : "text-3xl mt-2"}`}>
                      {fmtPct(condicoes.pct_cobertura_plena)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">das escolas possuem todos os 8 ambientes essenciais</p>
                    {!presentationMode && (
                      <p className="text-xs text-slate-400 mt-2">
                        Biblioteca · Lab. Ciências · Lab. Informática · Quadra · Refeitório · Cozinha · Sala dos Professores · SAEE
                      </p>
                    )}
                  </div>
                  <div className={`rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform ${presentationMode ? "w-11 h-11" : "w-11 h-11"}`}>
                    <Building2 size={21} strokeWidth={2} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={`grid grid-cols-1 lg:grid-cols-2 ${presentationMode ? "gap-5" : "gap-5"} animate-fade-in-up [animation-delay:300ms]`}>
            <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${presentationMode ? "p-6" : "p-6"}`}>
              <h3 className={`font-semibold text-slate-800 text-sm flex items-center gap-2 ${presentationMode ? "mb-5" : "mb-5"}`}>
                <Layers size={16} style={{ color: C.primary }} />
                Situação da Estrutura
              </h3>
              {situacaoSegments.length > 0 ? (
                <Donut segments={situacaoSegments} />
              ) : (
                <NoData />
              )}
            </div>
            <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${presentationMode ? "p-6" : "p-6"}`}>
              <h3 className={`font-semibold text-slate-800 text-sm flex items-center gap-2 ${presentationMode ? "mb-5" : "mb-5"}`}>
                <Building2 size={16} style={{ color: C.primary }} />
                Distribuição por Tipo de Prédio
              </h3>
              {tipoPredioSegments.length > 0 ? (
                <Donut segments={tipoPredioSegments} />
              ) : (
                <NoData />
              )}
            </div>
          </div>

          <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${presentationMode ? "p-6" : "p-6"}`}>
            <h3 className={`font-semibold text-slate-800 text-sm flex items-center gap-2 ${presentationMode ? "mb-5" : "mb-5"}`}>
              <MapPinned size={16} style={{ color: C.primary }} />
              Ambientes mais presentes (Top 10)
            </h3>
            {ambientesRows.length > 0 ? (
              <HBarChart rows={ambientesRows} color={C.primary} />
            ) : (
              <NoData />
            )}
          </div>
        </div>
      )}

      {/* ── Energia, Climatização e Capacidade Elétrica ── */}
      {isVisible("sec-infra-energia") && (
        <div className="space-y-6">
          <div id="sec-infra-energia" className="flex items-center gap-3">
            <Zap size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Energia, Climatização e Cap. Elétrica</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Zap size={16} style={{ color: C.primary }} />
                Rede elétrica atende a demanda?
              </h3>
              {energia && energia.dist_rede_eletrica_atende.length > 0 ? (
                <Donut segments={energia.dist_rede_eletrica_atende.map((s, i) => ({
                  label: s.valor,
                  value: s.escolas,
                  color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
                }))} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Sparkles size={16} style={{ color: C.primary }} />
                Estrutura permite climatizar salas?
              </h3>
              {energia && energia.dist_estrutura_climatizacao.length > 0 ? (
                <Donut segments={energia.dist_estrutura_climatizacao.map((s, i) => ({
                  label: s.valor,
                  value: s.escolas,
                  color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
                }))} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Lightbulb size={16} style={{ color: C.primary }} />
                Climatização das salas de aula
              </h3>
              {energia && energia.dist_climatizacao_salas.length > 0 ? (
                <Donut segments={energia.dist_climatizacao_salas.map((s, i) => ({
                  label: s.valor,
                  value: s.escolas,
                  color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
                }))} />
              ) : (
                <NoData />
              )}
            </div>
          </div>

          {/* Tabela: salas climatizadas por faixa */}
          {energia && (energia.tabela_climatizacao ?? []).length > 0 && (() => {
            const rows = energia.tabela_climatizacao;
            const totSalas = rows.reduce((s, r) => s + r.total_salas, 0);
            const totClimat = rows.reduce((s, r) => s + r.climatizadas, 0);
            const totNao = rows.reduce((s, r) => s + r.nao_climatizadas, 0);
            return (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-5 py-3 font-semibold text-slate-700">Climatização de salas de aula</th>
                        <th className="text-right px-5 py-3 font-semibold text-slate-700">Total de salas</th>
                        <th className="text-right px-5 py-3 font-semibold text-slate-700">Climatizadas</th>
                        <th className="text-right px-5 py-3 font-semibold text-slate-700">Não climatizadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.faixa} className={`transition-colors hover:bg-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                          <td className="px-5 py-3 text-slate-700 font-medium">{r.faixa}</td>
                          <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{r.total_salas.toLocaleString("pt-BR")}</td>
                          <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{r.climatizadas.toLocaleString("pt-BR")}</td>
                          <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{r.nao_climatizadas.toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td className="px-5 py-3 text-slate-800">Total geral</td>
                        <td className="px-5 py-3 text-right text-slate-800">{totSalas.toLocaleString("pt-BR")}</td>
                        <td className="px-5 py-3 text-right text-slate-800">{totClimat.toLocaleString("pt-BR")}</td>
                        <td className="px-5 py-3 text-right text-slate-800">{totNao.toLocaleString("pt-BR")}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Segurança Física e Patrimonial ───────────────────────── */}
      {isVisible("sec-infra-seguranca") && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} style={{ color: C.primary }} />
            <h2 className="font-semibold text-slate-800 text-base">Segurança Física e Patrimonial</h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <div id="sec-infra-seguranca" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Guarita"
              value={fmtPct(seguranca?.pct_possui_guarita)}
              Icon={ShieldCheck}
              tone="blue"
              sub="das escolas"
              compact={presentationMode}
            />
            <StatCard
              label="Botão de Pânico"
              value={fmtPct(seguranca?.pct_possui_botao_panico)}
              Icon={Siren}
              tone="orange"
              sub="das escolas"
              compact={presentationMode}
            />
            <StatCard
              label="Plano de Evacuação"
              value={fmtPct(seguranca?.pct_plano_evacuacao)}
              Icon={BellRing}
              tone="green"
              sub="das escolas"
              compact={presentationMode}
            />
            <StatCard
              label="Política contra Bullying"
              value={fmtPct(seguranca?.pct_politica_bullying)}
              Icon={Sparkles}
              tone="purple"
              sub="das escolas"
              compact={presentationMode}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Camera size={16} style={{ color: C.primary }} />
                Distribuição do status das câmeras
              </h3>
              {camerasSegments.length > 0 ? (
                <Donut segments={camerasSegments} />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <DoorClosed size={16} style={{ color: C.primary }} />
                Controle de Portão
              </h3>
              {(seguranca?.dist_controle_portao ?? []).length > 0 ? (
                <Donut segments={(seguranca!.dist_controle_portao).map((s, i) => ({
                  label: s.valor,
                  value: s.escolas,
                  color: PORTE_COLORS[i % PORTE_COLORS.length] ?? "#94A3B8",
                }))} />
              ) : (
                <NoData />
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-fade-in-up [animation-delay:450ms]">
            <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
              <Lightbulb size={16} style={{ color: "#ec4899" }} />
              Iluminação Externa
            </h3>
            {(seguranca?.dist_iluminacao_externa ?? []).length > 0 ? (
              <div className="space-y-3">
                {(seguranca!.dist_iluminacao_externa).map((s) => {
                  const color =
                    s.valor === "Adequada" ? "#22c55e" :
                      s.valor === "Regular" ? "#f97316" : "#ec4899";
                  return (
                    <div key={s.valor} className="group cursor-default">
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span className="font-medium group-hover:text-slate-900 transition-colors">{s.valor}</span>
                        <span className="group-hover:text-slate-900 group-hover:font-medium transition-all">{s.escolas} escola{s.escolas !== 1 ? "s" : ""} · {s.percentual.toFixed(1).replace(".", ",")}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden transition-transform group-hover:scale-[1.01] origin-left">
                        <div
                          className="h-3 rounded-full transition-all duration-500 group-hover:brightness-110"
                          style={{ width: `${s.percentual}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <NoData />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Home size={16} style={{ color: C.primary }} />
                A escola possui muro ou cerca no perímetro?
              </h3>
              {(condicoes?.dist_muro_cerca ?? []).length > 0 ? (
                <HBarChart
                  rows={(condicoes!.dist_muro_cerca).map((s) => ({
                    label: s.valor,
                    value: s.escolas,
                    pct: s.percentual,
                  }))}
                  color={C.primary}
                />
              ) : (
                <NoData />
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-sm mb-5 flex items-center gap-2">
                <Home size={16} style={{ color: C.primary }} />
                O muro ou cerca fecham todo o perímetro?
              </h3>
              {(condicoes?.dist_perimetro_fechado ?? []).length > 0 ? (
                <HBarChart
                  rows={(condicoes!.dist_perimetro_fechado).map((s) => ({
                    label: s.valor,
                    value: s.escolas,
                    pct: s.percentual,
                  }))}
                  color={C.primary}
                />
              ) : (
                <NoData />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}