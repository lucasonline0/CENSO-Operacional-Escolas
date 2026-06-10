"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, Play, Pause, LayoutList,
  Maximize2, Minimize2,
  BarChart2, UsersRound, MonitorSmartphone, ShieldCheck, Utensils,
  ClipboardCheck, Activity, Landmark, HeartPulse,
} from "lucide-react";

import { AbaCaracterizacao } from "./AbaCaracterizacao";
import { AbaPessoalGestao } from "./AbaPessoalGestao";
import { AbaTecnologia } from "./AbaTecnologia";
import { AbaInfraestruturaSeguranca } from "./AbaInfraestruturaSeguranca";
import { AbaMerenda } from "./AbaMerenda";
import { AbaServicosTerceirizados } from "./AbaServicosTerceirizados";
import { AbaPerfilAlunos } from "./AbaPerfilAlunos";
import { AbaGestaoFinanceiraGovernanca } from "./AbaGestaoFinanceiraGovernanca";
import { AbaSaudeOperacionalEscolas } from "./AbaSaudeOperacionalEscolas";

// ─── Types ────────────────────────────────────────────────────────────────────

type PresentationTab =
  | "perfil" | "pessoal" | "tecnologia" | "infraestrutura"
  | "merenda" | "servicos" | "alunos" | "governanca" | "saude";

interface PresentationSlide {
  id: string;
  tabId: PresentationTab;
  tabLabel: string;
  subLabel?: string;
  anchor?: string;
}

// ─── Slide list ───────────────────────────────────────────────────────────────

const SLIDES: PresentationSlide[] = [
  { id: "perfil-dimensao", tabId: "perfil", tabLabel: "Caracterização da Rede", subLabel: "Dimensão e Perfil da Rede", anchor: "sec-perfil-dimensao" },
  { id: "perfil-oferta", tabId: "perfil", tabLabel: "Caracterização da Rede", subLabel: "Organização da Oferta e Funcionamento", anchor: "sec-perfil-oferta" },
  { id: "perfil-infra", tabId: "perfil", tabLabel: "Caracterização da Rede", subLabel: "Infraestrutura Educacional", anchor: "sec-perfil-infra" },
  { id: "pessoal-estrutura", tabId: "pessoal", tabLabel: "Pessoal e Gestão Escolar", subLabel: "Estrutura de Gestão Escolar", anchor: "sec-pessoal-estrutura" },
  { id: "pessoal-coordenacao", tabId: "pessoal", tabLabel: "Pessoal e Gestão Escolar", subLabel: "Coordenação Pedagógica", anchor: "sec-pessoal-coordenacao" },
  { id: "pessoal-quadro", tabId: "pessoal", tabLabel: "Pessoal e Gestão Escolar", subLabel: "Quadro de Pessoal", anchor: "sec-pessoal-quadro" },
  { id: "tecnologia-digital", tabId: "tecnologia", tabLabel: "Tecnologia e Equipamentos", subLabel: "Infraestrutura Digital", anchor: "sec-tecnologia-digital" },
  { id: "tecnologia-parque", tabId: "tecnologia", tabLabel: "Tecnologia e Equipamentos", subLabel: "Parque Tecnológico", anchor: "sec-tecnologia-parque" },
  { id: "tecnologia-pedagogico", tabId: "tecnologia", tabLabel: "Tecnologia e Equipamentos", subLabel: "Uso Pedagógico", anchor: "sec-tecnologia-pedagogico" },
  { id: "infra-condicoes", tabId: "infraestrutura", tabLabel: "Infraestrutura e Segurança", subLabel: "Condições Estruturais e Ambientes", anchor: "sec-infra-condicoes" },
  { id: "infra-energia", tabId: "infraestrutura", tabLabel: "Infraestrutura e Segurança", subLabel: "Energia, Climatização e Cap. Elétrica", anchor: "sec-infra-energia" },
  { id: "infra-seguranca", tabId: "infraestrutura", tabLabel: "Infraestrutura e Segurança", subLabel: "Segurança Física e Patrimonial", anchor: "sec-infra-seguranca" },
  { id: "merenda-oferta", tabId: "merenda", tabLabel: "Merenda Escolar", subLabel: "Oferta e Adequação da Merenda", anchor: "sec-merenda-oferta" },
  { id: "merenda-estrutura", tabId: "merenda", tabLabel: "Merenda Escolar", subLabel: "Estrutura Física", anchor: "sec-merenda-estrutura" },
  { id: "merenda-equipamentos", tabId: "merenda", tabLabel: "Merenda Escolar", subLabel: "Equipamentos da Merenda", anchor: "sec-merenda-equipamentos" },
  { id: "merenda-sanitarias", tabId: "merenda", tabLabel: "Merenda Escolar", subLabel: "Condições Sanitárias e Segurança", anchor: "sec-merenda-sanitarias" },
  { id: "servicos-visao", tabId: "servicos", tabLabel: "Serviços Terceirizados", subLabel: "Visão Geral", anchor: "sec-servicos-visao" },
  { id: "servicos-gerais", tabId: "servicos", tabLabel: "Serviços Terceirizados", subLabel: "Serviços Gerais", anchor: "sec-servicos-gerais" },
  { id: "servicos-portaria", tabId: "servicos", tabLabel: "Serviços Terceirizados", subLabel: "Portaria", anchor: "sec-servicos-portaria" },
  { id: "servicos-manipuladores", tabId: "servicos", tabLabel: "Serviços Terceirizados", subLabel: "Manipulador de Alimentos", anchor: "sec-servicos-manipuladores" },
  { id: "servicos-governanca", tabId: "servicos", tabLabel: "Serviços Terceirizados", subLabel: "Governança / Supervisão", anchor: "sec-servicos-governanca" },
  { id: "alunos", tabId: "alunos", tabLabel: "Perfil dos Alunos e Resultados" },
  { id: "governanca", tabId: "governanca", tabLabel: "Gestão Financeira e Governança" },
  { id: "saude", tabId: "saude", tabLabel: "Saúde Operacional" },
];

const INTERVAL_OPTIONS = [
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "15s", value: 15000 },
  { label: "30s", value: 30000 },
  { label: "60s", value: 60000 },
];

type SlidesByTab = { tabId: PresentationTab; tabLabel: string; slides: PresentationSlide[] }[];

const SLIDES_BY_TAB: SlidesByTab = SLIDES.reduce<SlidesByTab>((acc, slide) => {
  const existing = acc.find((g) => g.tabId === slide.tabId);
  if (existing) existing.slides.push(slide);
  else acc.push({ tabId: slide.tabId, tabLabel: slide.tabLabel, slides: [slide] });
  return acc;
}, []);

const TAB_ICONS: Record<PresentationTab, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  perfil: BarChart2,
  pessoal: UsersRound,
  tecnologia: MonitorSmartphone,
  infraestrutura: ShieldCheck,
  merenda: Utensils,
  servicos: ClipboardCheck,
  alunos: Activity,
  governanca: Landmark,
  saude: HeartPulse,
};

const ALL_TAB_IDS = [...new Set(SLIDES.map((s) => s.tabId))];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  onUnauth: () => void;
  onClose: () => void;
}

export function PresentationMode({ token, onUnauth, onClose }: Props) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [intervalMs, setIntervalMs] = useState(10000);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [visited, setVisited] = useState<Set<PresentationTab>>(() => new Set<PresentationTab>([SLIDES[0].tabId]));

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollAnim = useRef<number | null>(null);

  const currentSlide = SLIDES[slideIndex];
  const total = SLIDES.length;

  // ── Lock body scroll ─────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Auto fullscreen on open ───────────────────────────────────
  useEffect(() => {
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => { });
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    };
  }, []);

  // ── Track fullscreen state ────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }, []);

  // ── Navigation helpers ────────────────────────────────────────
  const visit = useCallback((tabId: PresentationTab) => {
    setVisited((prev) => new Set([...prev, tabId]));
  }, []);

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, idx));
    visit(SLIDES[clamped].tabId);
    setSlideIndex(clamped);
  }, [visit]);

  const goNext = useCallback(() => {
    setSlideIndex((i) => {
      const next = i === SLIDES.length - 1 ? 0 : i + 1;
      visit(SLIDES[next].tabId);
      return next;
    });
  }, [visit]);

  const goPrev = useCallback(() => {
    setSlideIndex((i) => {
      const prev = i === 0 ? SLIDES.length - 1 : i - 1;
      visit(SLIDES[prev].tabId);
      return prev;
    });
  }, [visit]);

  // ── Cancel in-flight scroll animation ────────────────────────
  const cancelScroll = useCallback(() => {
    if (scrollAnim.current !== null) {
      cancelAnimationFrame(scrollAnim.current);
      scrollAnim.current = null;
    }
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === " ") { e.preventDefault(); if (mode === "auto") setIsPlaying((p) => !p); }
      else if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose, mode]);

  // ── Auto-advance timer ────────────────────────────────────────
  useEffect(() => {
    if (mode !== "auto" || !isPlaying) return;
    const timer = setTimeout(goNext, intervalMs);
    return () => clearTimeout(timer);
  }, [mode, isPlaying, slideIndex, intervalMs, goNext]);

  // ── Section scroll + content auto-pan ────────────────────────
  useEffect(() => {
    cancelScroll();

    const container = contentRef.current;
    if (!container) return;

    let initTimer: ReturnType<typeof setTimeout>;

    initTimer = setTimeout(() => {
      const slide = SLIDES[slideIndex];

      // No anchor — scroll to top
      if (!slide.anchor) {
        container.scrollTop = 0;
        return;
      }

      const anchorEl = container.querySelector(`#${slide.anchor}`) as HTMLElement | null;
      if (!anchorEl) return;

      // ── Position section at top of viewport ──────────────────
      const cRect = container.getBoundingClientRect();
      const aRect = anchorEl.getBoundingClientRect();
      const startY = Math.max(0, container.scrollTop + (aRect.top - cRect.top) - 10);
      container.scrollTop = startY;

      // Manual mode: just jump to anchor, no pan animation
      if (mode !== "auto") return;

      // ── Find section end (= next anchor in same tab) ─────────
      const nextInTab = SLIDES.find((s, i) => i > slideIndex && s.tabId === slide.tabId && s.anchor);
      let endY = container.scrollHeight;

      if (nextInTab?.anchor) {
        const nextEl = container.querySelector(`#${nextInTab.anchor}`) as HTMLElement | null;
        if (nextEl) {
          const nRect = nextEl.getBoundingClientRect();
          const nextTop = container.scrollTop + (nRect.top - cRect.top);
          if (nextTop > startY + 80) endY = nextTop - 14;
        }
      }

      // ── Decide whether content needs panning ─────────────────
      const viewportH = container.clientHeight;
      const sectionH = endY - startY;
      const scrollDist = Math.max(0, sectionH - viewportH * 0.93);

      if (scrollDist <= 24) return; // fits — nothing to do

      // ── Animate: wait → pan down → pause → pan up ────────────
      const DOWN_PX_S = 40;   // scroll speed downwards  (px/s)
      const UP_PX_S = 110;  // scroll speed upwards    (px/s)
      const WAIT_MS = 750;  // pause before starting
      const PAUSE_MS = 900;  // pause at bottom

      const downMs = (scrollDist / DOWN_PX_S) * 1000;
      const upMs = (scrollDist / UP_PX_S) * 1000;

      type Phase = "wait" | "down" | "pause" | "up";
      let phase: Phase = "wait";
      let phaseStart = 0;

      const tick = (ts: number) => {
        if (!phaseStart) phaseStart = ts;
        const elapsed = ts - phaseStart;

        switch (phase) {
          case "wait":
            if (elapsed >= WAIT_MS) { phase = "down"; phaseStart = ts; }
            break;

          case "down": {
            const p = Math.min(elapsed / downMs, 1);
            container.scrollTop = startY + easeInOut(p) * scrollDist;
            if (p >= 1) { phase = "pause"; phaseStart = ts; }
            break;
          }

          case "pause":
            if (elapsed >= PAUSE_MS) { phase = "up"; phaseStart = ts; }
            break;

          case "up": {
            const p = Math.min(elapsed / upMs, 1);
            container.scrollTop = startY + (1 - easeInOut(p)) * scrollDist;
            if (p >= 1) { scrollAnim.current = null; return; }
            break;
          }
        }

        scrollAnim.current = requestAnimationFrame(tick);
      };

      scrollAnim.current = requestAnimationFrame(tick);
    }, 350);

    return () => {
      clearTimeout(initTimer);
      cancelScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex, mode]);

  // ── Tab renderer ─────────────────────────────────────────────
  const renderTab = (tabId: PresentationTab, activeAnchor?: string) => {
    switch (tabId) {
      case "perfil": return <AbaCaracterizacao token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "pessoal": return <AbaPessoalGestao token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "tecnologia": return <AbaTecnologia token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "infraestrutura": return <AbaInfraestruturaSeguranca token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "merenda": return <AbaMerenda token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "servicos": return <AbaServicosTerceirizados token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "alunos": return <AbaPerfilAlunos token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      case "governanca": return <AbaGestaoFinanceiraGovernanca presentationMode activeAnchor={activeAnchor} />;
      case "saude": return <AbaSaudeOperacionalEscolas token={token} onUnauth={onUnauth} presentationMode activeAnchor={activeAnchor} />;
      default: return null;
    }
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="ca-presentation">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="ca-pres-header">

        {/* Left: logo + slide title */}
        <div className="ca-pres-left">
          <div className="ca-pres-logo">
            <img src="/brasao-para.png" alt="Brasão" />
            <span className="ca-pres-logo-text">Censo Operacional · SEDUC PA</span>
          </div>
          <div className="ca-pres-vdivider" />
          <div className="ca-pres-title-block">
            {currentSlide.subLabel ? (
              <>
                <div className="ca-pres-tab-name">{currentSlide.tabLabel}</div>
                <div className="ca-pres-section-name">{currentSlide.subLabel}</div>
              </>
            ) : (
              <div className="ca-pres-section-name">{currentSlide.tabLabel}</div>
            )}
          </div>
        </div>

        {/* Right: controls */}
        <div className="ca-pres-controls">

          {/* Mode toggle */}
          <div className="ca-pres-mode-toggle">
            <button
              className={`ca-pres-mode-btn${mode === "manual" ? " active" : ""}`}
              onClick={() => { setMode("manual"); setIsPlaying(false); }}
            >
              Manual
            </button>
            <button
              className={`ca-pres-mode-btn${mode === "auto" ? " active" : ""}`}
              onClick={() => setMode("auto")}
            >
              Automático
            </button>
          </div>

          {/* Auto controls */}
          {mode === "auto" && (
            <>
              <select
                className="ca-pres-select"
                value={intervalMs}
                title="Tempo por slide"
                onChange={(e) => setIntervalMs(Number(e.target.value))}
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                className={`ca-pres-icon-btn${isPlaying ? " ca-pres-play" : ""}`}
                title={isPlaying ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
                onClick={() => setIsPlaying((p) => !p)}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </>
          )}

          <div className="ca-pres-vdivider" />

          {/* Navigation */}
          <button className="ca-pres-icon-btn" title="Anterior (←)" onClick={goPrev}>
            <ChevronLeft size={15} />
          </button>

          <span className="ca-pres-counter">{slideIndex + 1} / {total}</span>

          <button className="ca-pres-icon-btn" title="Próximo (→)" onClick={goNext}>
            <ChevronRight size={15} />
          </button>

          <div className="ca-pres-vdivider" />

          {/* Slide list */}
          <button
            className={`ca-pres-icon-btn${showPanel ? " ca-pres-active" : ""}`}
            title="Lista de slides"
            onClick={() => setShowPanel((p) => !p)}
          >
            <LayoutList size={15} />
          </button>

          {/* Fullscreen toggle */}
          <button
            className="ca-pres-icon-btn"
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Exit presentation */}
          <button
            className="ca-pres-icon-btn"
            title="Encerrar apresentação"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Slide-advance progress bar (auto mode) ───────────── */}
      {mode === "auto" && isPlaying && (
        <div className="ca-pres-progress">
          <div
            key={`${slideIndex}-${isPlaying}-${intervalMs}`}
            className="ca-pres-progress-bar"
            style={{ animationDuration: `${intervalMs}ms` }}
          />
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="ca-pres-body">

        {/* Content area */}
        <div className="ca-pres-content" ref={contentRef}>
          <div className="admin-page ca-pres-compact">
            {ALL_TAB_IDS.map((tabId) => (
              <div
                key={tabId}
                style={{ display: currentSlide.tabId === tabId ? undefined : "none" }}
              >
                {visited.has(tabId) && renderTab(tabId, currentSlide.anchor)}
              </div>
            ))}
          </div>
        </div>

        {/* Slide list panel */}
        {showPanel && (
          <div className="ca-pres-slide-panel">
            <div className="ca-pres-panel-hdr">
              <span>Slides</span>
              <button className="ca-pres-icon-btn" onClick={() => setShowPanel(false)}>
                <X size={13} />
              </button>
            </div>

            {SLIDES_BY_TAB.map((group) => {
              const Icon = TAB_ICONS[group.tabId];
              return (
                <div key={group.tabId} className="ca-pres-panel-group">
                  <div className="ca-pres-panel-group-label">
                    <Icon size={11} strokeWidth={1.8} />
                    {group.tabLabel}
                  </div>
                  {group.slides.map((slide) => {
                    const globalIdx = SLIDES.findIndex((s) => s.id === slide.id);
                    const isCurrent = globalIdx === slideIndex;
                    return (
                      <div
                        key={slide.id}
                        className={`ca-pres-panel-item${isCurrent ? " active" : ""}`}
                        onClick={() => { goTo(globalIdx); setShowPanel(false); }}
                      >
                        <span className="ca-pres-panel-dot" />
                        <span>{slide.subLabel ?? slide.tabLabel}</span>
                        <span className="ca-pres-panel-num">{globalIdx + 1}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
