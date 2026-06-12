"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, MonitorPlay, Pause, Play, X } from "lucide-react";

type PresentationTab =
  | "perfil"
  | "pessoal"
  | "tecnologia"
  | "infraestrutura"
  | "merenda"
  | "servicos"
  | "alunos"
  | "saude";

type PresentationSlide = {
  id: string;
  tabId: PresentationTab;
  tabLabel: string;
  sectionLabel: string;
  slideTitle?: string;
  contentId: string;
};

type PresentationModeProps = {
  onClose: () => void;
  onNavigateTab: (tabId: PresentationTab) => void;
  dark?: boolean;
};

function createSlides(
  tabId: PresentationTab,
  tabLabel: string,
  sectionLabel: string,
  entries: Array<[contentId: string, slideTitle?: string]>,
): PresentationSlide[] {
  return entries.map(([contentId, slideTitle]) => ({
    id: contentId,
    tabId,
    tabLabel,
    sectionLabel,
    slideTitle,
    contentId,
  }));
}

const SLIDES: PresentationSlide[] = [
  ...createSlides("perfil", "Caracterização da Rede", "Dimensão e Perfil da Rede", [
    ["perfil-dimensao-indicadores", "Indicadores gerais"],
    ["perfil-dimensao-distribuicao", "Distribuição das escolas"],
    ["perfil-dimensao-matriculas", "Matrículas por porte"],
  ]),
  ...createSlides("perfil", "Caracterização da Rede", "Organização da Oferta e Funcionamento", [
    ["perfil-oferta-etapas", "Etapas e modalidades"],
    ["perfil-oferta-turnos", "Turnos de funcionamento"],
  ]),
  ...createSlides("perfil", "Caracterização da Rede", "Infraestrutura Educacional", [
    ["perfil-infra-indicadores", "Indicadores de cobertura"],
    ["perfil-infra-ambientes", "Ambientes essenciais"],
    ["perfil-infra-media", "Média por porte"],
  ]),
  ...createSlides("perfil", "Caracterização da Rede", "Detalhamento por DRE", [
    ["perfil-dre-tabela", "Tabela consolidada"],
  ]),

  ...createSlides("pessoal", "Pessoal e Gestão Escolar", "Estrutura de Gestão Escolar", [
    ["pessoal-estrutura-resumo", "Indicadores gerais"],
    ["pessoal-estrutura-composicao", "Composição da gestão"],
  ]),
  ...createSlides("pessoal", "Pessoal e Gestão Escolar", "Coordenação Pedagógica", [
    ["pessoal-coordenacao", "Cobertura e composição"],
  ]),
  ...createSlides("pessoal", "Pessoal e Gestão Escolar", "Quadro de Pessoal", [
    ["pessoal-quadro-indicadores", "Indicadores gerais"],
    ["pessoal-quadro-distribuicao", "Distribuição por vínculo"],
    ["pessoal-quadro-dre", "Detalhamento por DRE"],
  ]),

  ...createSlides("tecnologia", "Tecnologia e Equipamentos", "Infraestrutura Digital", [
    ["tecnologia-digital-indicadores", "Indicadores gerais"],
    ["tecnologia-digital-conexao", "Disponibilidade e qualidade da conexão"],
  ]),
  ...createSlides("tecnologia", "Tecnologia e Equipamentos", "Parque Tecnológico", [
    ["tecnologia-parque-indicadores", "Inventário de equipamentos"],
    ["tecnologia-parque-distribuicao", "Distribuição do parque"],
    ["tecnologia-parque-notas", "Notas por equipamento"],
  ]),
  ...createSlides("tecnologia", "Tecnologia e Equipamentos", "Uso Pedagógico", [
    ["tecnologia-pedagogico-indicadores", "Indicadores gerais"],
    ["tecnologia-pedagogico-distribuicao", "Recursos e uso pedagógico"],
  ]),

  ...createSlides("infraestrutura", "Infraestrutura e Segurança", "Condições Estruturais e Ambientes", [
    ["infra-condicoes-resumo", "Indicadores gerais"],
    ["infra-condicoes-situacao", "Situação dos prédios"],
    ["infra-condicoes-ambientes", "Ambientes escolares"],
  ]),
  ...createSlides("infraestrutura", "Infraestrutura e Segurança", "Energia, Climatização e Capacidade Elétrica", [
    ["infra-energia-distribuicao", "Energia e climatização"],
    ["infra-energia-tabela", "Salas climatizadas"],
  ]),
  ...createSlides("infraestrutura", "Infraestrutura e Segurança", "Segurança Física e Patrimonial", [
    ["infra-seguranca-indicadores", "Indicadores gerais"],
    ["infra-seguranca-acesso", "Controle de acesso"],
    ["infra-seguranca-iluminacao", "Iluminação e monitoramento"],
    ["infra-seguranca-perimetro", "Proteção perimetral"],
  ]),

  ...createSlides("merenda", "Merenda Escolar", "Oferta e Adequação da Merenda", [
    ["merenda-oferta-resumo", "Indicadores gerais"],
    ["merenda-oferta-graficos", "Regularidade da oferta"],
    ["merenda-oferta-necessidades", "Qualidade e atendimento"],
  ]),
  ...createSlides("merenda", "Merenda Escolar", "Estrutura Física da Cozinha", [
    ["merenda-estrutura-cozinha", "Condições da cozinha e refeitório"],
    ["merenda-estrutura-refeitorio", "Tamanho e adequação"],
  ]),
  ...createSlides("merenda", "Merenda Escolar", "Equipamentos da Merenda", [
    ["merenda-equipamentos-cards", "Inventário geral"],
    ["merenda-equipamentos-cobertura", "Cobertura por tipo"],
    ["merenda-equipamentos-criticidade", "Médias e criticidade"],
    ["merenda-equipamentos-conservacao", "Estado de conservação"],
    ["merenda-equipamentos-tabela", "Distribuição dos estados"],
  ]),
  ...createSlides("merenda", "Merenda Escolar", "Condições Sanitárias e Segurança", [
    ["merenda-sanitarias-armazenamento", "Armazenamento dos alimentos"],
    ["merenda-sanitarias-itens", "Presença de itens básicos"],
    ["merenda-sanitarias-seguranca", "EPIs e extintores"],
  ]),

  ...createSlides("servicos", "Serviços Terceirizados", "Visão Geral", [
    ["servicos-visao-resumo", "Indicadores gerais"],
    ["servicos-visao-cobertura", "Cobertura por área"],
  ]),
  ...createSlides("servicos", "Serviços Terceirizados", "Serviços Gerais", [
    ["servicos-gerais-indicadores", "Quadro geral"],
    ["servicos-gerais-distribuicao", "Vínculos e empresas"],
  ]),
  ...createSlides("servicos", "Serviços Terceirizados", "Portaria", [
    ["servicos-portaria-indicadores", "Indicadores gerais"],
    ["servicos-portaria-empresas", "Empresas prestadoras"],
  ]),
  ...createSlides("servicos", "Serviços Terceirizados", "Manipuladores de Alimentos", [
    ["servicos-manipuladores-indicadores", "Quadro geral"],
    ["servicos-manipuladores-distribuicao", "Vínculos e atendimento"],
    ["servicos-manipuladores-empresas", "Empresas prestadoras"],
  ]),
  ...createSlides("servicos", "Serviços Terceirizados", "Governança e Supervisão", [
    ["servicos-governanca-aviso", "Disponibilidade dos indicadores"],
  ]),

  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Visão Geral dos Alunos", [
    ["alunos-visao-indicadores", "Indicadores gerais"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Distribuição por Faixa", [
    ["alunos-faixas-distribuicao", "Beneficiários e abandono"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Abandono e Risco", [
    ["alunos-abandono-risco", "DREs com maior taxa de abandono"],
  ]),

  ...createSlides("saude", "Saúde Operacional", "Resumo da Saúde Operacional", [
    ["saude-resumo-indicadores", "Indicadores gerais"],
  ]),
  ...createSlides("saude", "Saúde Operacional", "Escolas por Índice de Saúde", [
    ["saude-escolas-tabela", "Tabela por escola"],
  ]),
];

function removeActiveSlideState() {
  document.querySelectorAll<HTMLElement>("[data-pres-slide]").forEach((element) => {
    element.classList.remove("ca-pres-slide-active");
    element.removeAttribute("aria-current");
  });
}

export default function PresentationMode({ onClose, onNavigateTab, dark }: PresentationModeProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideStatus, setSlideStatus] = useState<"idle" | "found" | "missing">("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(10); // 10 segundos por padrão
  const [progress, setProgress] = useState(0);

  const slideIndexRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const navigationTokenRef = useRef(0);
  const onNavigateTabRef = useRef(onNavigateTab);

  const total = SLIDES.length;
  const slide = SLIDES[slideIndex];

  useEffect(() => {
    onNavigateTabRef.current = onNavigateTab;
  }, [onNavigateTab]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (safetyTimeoutRef.current !== null) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (observerRef.current !== null) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  const activateSlideWithRetry = useCallback((target: PresentationSlide, navigationToken: number) => {
    clearRetryTimer();

    const tryActivate = () => {
      removeActiveSlideState();
      const element = document.querySelector<HTMLElement>(
        `[data-pres-slide="${target.contentId}"]`,
      );

      if (element) {
        element.classList.add("ca-pres-slide-active");
        element.setAttribute("aria-current", "true");
        setSlideStatus("found");
        return true;
      }
      return false;
    };

    // Tenta ativar imediatamente
    if (tryActivate()) {
      return;
    }

    // Se não encontrou, observa mudanças no DOM (MutationObserver)
    const observer = new MutationObserver((mutations, obs) => {
      if (navigationToken !== navigationTokenRef.current) {
        obs.disconnect();
        return;
      }
      if (tryActivate()) {
        obs.disconnect();
        if (observerRef.current === obs) {
          observerRef.current = null;
        }
      }
    });

    observerRef.current = observer;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout de segurança longo (15 segundos)
    safetyTimeoutRef.current = window.setTimeout(() => {
      if (navigationToken === navigationTokenRef.current) {
        setSlideStatus((prev) => (prev === "found" ? "found" : "missing"));
      }
      clearRetryTimer();
    }, 15000);
  }, [clearRetryTimer]);

  const goToSlide = useCallback((nextIndex: number) => {
    const normalized = ((nextIndex % total) + total) % total;
    const target = SLIDES[normalized];
    const navigationToken = navigationTokenRef.current + 1;

    navigationTokenRef.current = navigationToken;
    slideIndexRef.current = normalized;
    clearRetryTimer();
    removeActiveSlideState();
    setSlideIndex(normalized);
    setSlideStatus("idle");
    setProgress(0); // Reinicia o progresso do timer
    onNavigateTabRef.current(target.tabId);
    activateSlideWithRetry(target, navigationToken);
  }, [activateSlideWithRetry, clearRetryTimer, total]);

  const goNext = useCallback(
    () => goToSlide(slideIndexRef.current + 1),
    [goToSlide],
  );
  const goPrev = useCallback(
    () => goToSlide(slideIndexRef.current - 1),
    [goToSlide],
  );

  // Efeito para o Timer de reprodução automática
  useEffect(() => {
    if (!isPlaying || slideStatus !== "found") {
      return;
    }

    const intervalMs = 50;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (intervalMs / (duration * 1000)) * 100;
        if (next >= 100) {
          return 100;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, slideStatus, duration]);

  // Efeito para avançar o slide quando o timer chega a 100%
  useEffect(() => {
    if (progress >= 100) {
      setProgress(0);
      goNext();
    }
  }, [progress, goNext]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => goToSlide(0), 0);
    return () => window.clearTimeout(initialTimer);
  }, [goToSlide]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === " ") {
        // Atalho de teclado: barra de espaço para Play/Pause
        event.preventDefault();
        setIsPlaying((p) => !p);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      navigationTokenRef.current += 1;
      clearRetryTimer();
      removeActiveSlideState();
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [clearRetryTimer]);

  return (
    <div className="ca-pres-shell" role="dialog" aria-modal="true" aria-label="Modo Apresentação">
      <header className="ca-pres-top">
        <div className="ca-pres-heading">
          <span className="ca-pres-kicker">
            <MonitorPlay size={15} />
            {slide.tabLabel}
          </span>
          <span className="ca-pres-title">{slide.sectionLabel}</span>
          <div className="flex items-center gap-3 mt-0.5">
            {slide.slideTitle && <span className="ca-pres-subtitle">{slide.slideTitle}</span>}
            {slideStatus === "idle" && (
              <span className="ca-pres-loading">
                <Loader2 size={13} className="animate-spin" />
                Aguardando carregamento dos gráficos...
              </span>
            )}
            {slideStatus === "missing" && (
              <span className="ca-pres-missing">Slide não encontrado após o carregamento da aba.</span>
            )}
          </div>
        </div>

        <div className="ca-pres-controls">
          {/* Botão de Play/Pause */}
          <button
            type="button"
            className={`ca-pres-autoplay-btn ${isPlaying ? "active" : ""}`}
            title={isPlaying ? "Pausar reprodução automática (Espaço)" : "Iniciar reprodução automática (Espaço)"}
            aria-label={isPlaying ? "Pausar reprodução automática" : "Iniciar reprodução automática"}
            onClick={() => setIsPlaying((p) => !p)}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          {/* Seletor de Tempo de Transição */}
          <select
            className="ca-pres-timer-select"
            value={duration}
            onChange={(e) => {
              setDuration(Number(e.target.value));
              setProgress(0);
            }}
            title="Tempo de permanência em cada slide"
            aria-label="Tempo de permanência em cada slide"
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>

          <span className="ca-pres-counter">
            {slideIndex + 1} / {total}
          </span>
          <button
            type="button"
            className="ca-pres-nav-btn"
            title="Slide anterior"
            aria-label="Slide anterior"
            onClick={goPrev}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="ca-pres-nav-btn"
            title="Próximo slide"
            aria-label="Próximo slide"
            onClick={goNext}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="ca-pres-close"
            title="Fechar apresentação"
            aria-label="Fechar apresentação"
            onClick={onClose}
          >
            <X size={16} />
            <span>Fechar</span>
          </button>
        </div>

        {/* Barra de Progresso do Timer */}
        <div className="ca-pres-progress-bar-container">
          <div
            className={`ca-pres-progress-bar-fill ${slideStatus !== "found" ? "waiting" : ""}`}
            style={{ width: `${slideStatus === "found" ? progress : 0}%` }}
          />
        </div>
      </header>

      <footer className="ca-pres-footer">
        <img
          className="ca-pres-footer-logo"
          src={dark ? "/logo-horizontal-letter-white.png" : "/parceiros.png"}
          alt="FADEP · Secretaria de Educação · Governo do Pará"
        />
      </footer>
    </div>
  );
}
