"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Loader2, MonitorPlay, Pause, Play, X } from "lucide-react";

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
};

const SLIDES: PresentationSlide[] = [
  {
    id: "perfil-dimensao",
    tabId: "perfil",
    tabLabel: "Caracterização da Rede",
    sectionLabel: "Dimensão e Perfil da Rede",
    contentId: "perfil-dimensao-indicadores,perfil-dimensao-distribuicao,perfil-dimensao-matriculas",
  },
  {
    id: "perfil-oferta",
    tabId: "perfil",
    tabLabel: "Caracterização da Rede",
    sectionLabel: "Organização da Oferta e Funcionamento",
    contentId: "perfil-oferta-etapas,perfil-oferta-turnos",
  },
  {
    id: "perfil-infra",
    tabId: "perfil",
    tabLabel: "Caracterização da Rede",
    sectionLabel: "Infraestrutura Educacional",
    contentId: "perfil-infra-indicadores,perfil-infra-ambientes,perfil-infra-media",
  },
  {
    id: "perfil-dre",
    tabId: "perfil",
    tabLabel: "Caracterização da Rede",
    sectionLabel: "Detalhamento por DRE",
    contentId: "perfil-dre-tabela",
  },

  {
    id: "pessoal-estrutura",
    tabId: "pessoal",
    tabLabel: "Pessoal e Gestão Escolar",
    sectionLabel: "Estrutura de Gestão Escolar",
    contentId: "pessoal-estrutura-resumo,pessoal-estrutura-composicao",
  },
  {
    id: "pessoal-coordenacao",
    tabId: "pessoal",
    tabLabel: "Pessoal e Gestão Escolar",
    sectionLabel: "Coordenação Pedagógica",
    contentId: "pessoal-coordenacao",
  },
  {
    id: "pessoal-quadro",
    tabId: "pessoal",
    tabLabel: "Pessoal e Gestão Escolar",
    sectionLabel: "Quadro de Pessoal - Visão Geral",
    contentId: "pessoal-quadro-indicadores,pessoal-quadro-distribuicao",
  },
  {
    id: "pessoal-quadro-dre-slide",
    tabId: "pessoal",
    tabLabel: "Pessoal e Gestão Escolar",
    sectionLabel: "Quadro de Pessoal - Detalhamento por DRE",
    contentId: "pessoal-quadro-dre",
  },

  {
    id: "tecnologia-digital",
    tabId: "tecnologia",
    tabLabel: "Tecnologia e Equipamentos",
    sectionLabel: "Infraestrutura Digital",
    contentId: "tecnologia-digital-indicadores,tecnologia-digital-conexao",
  },
  {
    id: "tecnologia-parque",
    tabId: "tecnologia",
    tabLabel: "Tecnologia e Equipamentos",
    sectionLabel: "Parque Tecnológico",
    contentId: "tecnologia-parque-indicadores,tecnologia-parque-distribuicao,tecnologia-parque-notes",
  },
  {
    id: "tecnologia-pedagogico",
    tabId: "tecnologia",
    tabLabel: "Tecnologia e Equipamentos",
    sectionLabel: "Uso Pedagógico",
    contentId: "tecnologia-pedagogico-indicadores,tecnologia-pedagogico-distribuicao",
  },

  {
    id: "infra-condicoes",
    tabId: "infraestrutura",
    tabLabel: "Infraestrutura e Segurança",
    sectionLabel: "Condições Estruturais e Ambientes",
    contentId: "infra-condicoes-resumo,infra-condicoes-situacao,infra-condicoes-ambientes",
  },
  {
    id: "infra-energia",
    tabId: "infraestrutura",
    tabLabel: "Infraestrutura e Segurança",
    sectionLabel: "Energia, Climatização e Capacidade Elétrica",
    contentId: "infra-energia-distribuicao",
  },
  {
    id: "infra-energia-tabela-slide",
    tabId: "infraestrutura",
    tabLabel: "Infraestrutura e Segurança",
    sectionLabel: "Salas Climatizadas por DRE",
    contentId: "infra-energia-tabela",
  },
  {
    id: "infra-seguranca",
    tabId: "infraestrutura",
    tabLabel: "Infraestrutura e Segurança",
    sectionLabel: "Segurança Física e Patrimonial",
    contentId: "infra-seguranca-indicadores,infra-seguranca-acesso,infra-seguranca-iluminacao,infra-seguranca-perimetro",
  },

  {
    id: "merenda-oferta",
    tabId: "merenda",
    tabLabel: "Merenda Escolar",
    sectionLabel: "Oferta e Adequação da Merenda",
    contentId: "merenda-oferta-resumo,merenda-oferta-graficos,merenda-oferta-necessidades",
  },
  {
    id: "merenda-estrutura",
    tabId: "merenda",
    tabLabel: "Merenda Escolar",
    sectionLabel: "Estrutura Física da Cozinha",
    contentId: "merenda-estrutura-cozinha,merenda-estrutura-refeitorio",
  },
  {
    id: "merenda-equipamentos",
    tabId: "merenda",
    tabLabel: "Merenda Escolar",
    sectionLabel: "Equipamentos da Merenda - Visão Geral",
    contentId: "merenda-equipamentos-cards,merenda-equipamentos-cobertura,merenda-equipamentos-criticidade,merenda-equipamentos-conservacao",
  },
  {
    id: "merenda-equipamentos-tabela-slide",
    tabId: "merenda",
    tabLabel: "Merenda Escolar",
    sectionLabel: "Equipamentos da Merenda - Distribuição por DRE",
    contentId: "merenda-equipamentos-tabela",
  },
  {
    id: "merenda-sanitarias",
    tabId: "merenda",
    tabLabel: "Merenda Escolar",
    sectionLabel: "Condições Sanitárias e Segurança",
    contentId: "merenda-sanitarias-armazenamento,merenda-sanitarias-itens,merenda-sanitarias-seguranca",
  },

  {
    id: "servicos-visao",
    tabId: "servicos",
    tabLabel: "Serviços Terceirizados",
    sectionLabel: "Visão Geral",
    contentId: "servicos-visao-resumo,servicos-visao-cobertura",
  },
  {
    id: "servicos-gerais",
    tabId: "servicos",
    tabLabel: "Serviços Terceirizados",
    sectionLabel: "Serviços Gerais",
    contentId: "servicos-gerais-indicadores,servicos-gerais-distribuicao",
  },
  {
    id: "servicos-portaria",
    tabId: "servicos",
    tabLabel: "Serviços Terceirizados",
    sectionLabel: "Portaria",
    contentId: "servicos-portaria-indicadores,servicos-portaria-empresas",
  },
  {
    id: "servicos-manipuladores",
    tabId: "servicos",
    tabLabel: "Serviços Terceirizados",
    sectionLabel: "Manipuladores de Alimentos",
    contentId: "servicos-manipuladores-indicadores,servicos-manipuladores-distribuicao,servicos-manipuladores-empresas",
  },
  {
    id: "servicos-governanca",
    tabId: "servicos",
    tabLabel: "Serviços Terceirizados",
    sectionLabel: "Governança e Supervisão",
    contentId: "servicos-governanca-aviso",
  },

  {
    id: "alunos-visao",
    tabId: "alunos",
    tabLabel: "Perfil dos Alunos e Resultados",
    sectionLabel: "Visão Geral dos Alunos",
    contentId: "alunos-visao-indicadores",
  },
  {
    id: "alunos-faixas",
    tabId: "alunos",
    tabLabel: "Perfil dos Alunos e Resultados",
    sectionLabel: "Distribuição por Faixa",
    contentId: "alunos-faixas-distribuicao",
  },
  {
    id: "alunos-abandono",
    tabId: "alunos",
    tabLabel: "Perfil dos Alunos e Resultados",
    sectionLabel: "Abandono e Risco",
    contentId: "alunos-abandono-risco",
  },

  {
    id: "saude-resumo",
    tabId: "saude",
    tabLabel: "Saúde Operacional",
    sectionLabel: "Resumo da Saúde Operacional",
    contentId: "saude-resumo-indicadores",
  },
  {
    id: "saude-escolas",
    tabId: "saude",
    tabLabel: "Saúde Operacional",
    sectionLabel: "Escolas por Índice de Saúde",
    contentId: "saude-escolas-tabela",
  },
];

function removeActiveSlideState() {
  document.querySelectorAll<HTMLElement>("[data-pres-slide]").forEach((element) => {
    element.classList.remove("ca-pres-slide-active");
    element.removeAttribute("aria-current");
  });
}

export default function PresentationMode({ onClose, onNavigateTab }: PresentationModeProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideStatus, setSlideStatus] = useState<"idle" | "found" | "missing">("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(10); // 10 segundos por padrão
  const [progress, setProgress] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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
      const ids = target.contentId.split(",");
      let foundCount = 0;
      ids.forEach((id) => {
        const element = document.querySelector<HTMLElement>(
          `[data-pres-slide="${id.trim()}"]`,
        );
        if (element) {
          element.classList.add("ca-pres-slide-active");
          element.setAttribute("aria-current", "true");
          foundCount++;
        }
      });

      if (foundCount === ids.length) {
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
          setTimeout(goNext, 0);
          return 0;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, slideStatus, duration, goNext]);

  // Efeito para rolar automaticamente os elementos com scroll durante a reprodução automática
  useEffect(() => {
    if (!isPlaying || slideStatus !== "found") {
      return;
    }

    // Busca primeiro uma tabela com scroll ativa
    let scrollableEl = document.querySelector<HTMLElement>(
      ".ca-pres-slide-active [data-pres-table-scroll='true']"
    );

    // Se não houver tabela com scroll, tenta rolar a página inteira (.admin-page)
    if (!scrollableEl) {
      scrollableEl = document.querySelector<HTMLElement>(
        ".censo-admin .ca-app.presenting .admin-page"
      );
    }

    if (!scrollableEl) return;

    // Reinicia o scroll ao carregar o slide
    scrollableEl.scrollTop = 0;

    let animationFrameId: number;
    let lastTime = performance.now();
    let currentScroll = 0;

    const animate = (time: number) => {
      const deltaTime = (time - lastTime) / 1000; // segundos
      lastTime = time;

      const totalScroll = scrollableEl.scrollHeight - scrollableEl.clientHeight;
      if (totalScroll <= 0) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      // Calcula velocidade para atingir o fim da rolagem em 85% da duração do slide
      const scrollSpeed = totalScroll / (duration * 0.85); // pixels por segundo

      currentScroll += scrollSpeed * deltaTime;
      if (currentScroll >= totalScroll) {
        scrollableEl.scrollTop = totalScroll;
        return; // Chegou ao fim, encerra animação
      }

      scrollableEl.scrollTop = currentScroll;
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, slideStatus, duration]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => goToSlide(0), 0);
    return () => window.clearTimeout(initialTimer);
  }, [goToSlide]);

  // Efeito para fechar o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

    // Entra no modo tela cheia (Fullscreen) ao iniciar a apresentação
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Não foi possível entrar no modo tela cheia:", err);
      });
    }

    return () => {
      navigationTokenRef.current += 1;
      clearRetryTimer();
      removeActiveSlideState();
      document.body.style.overflow = previousBodyOverflow;

      // Sai do modo tela cheia (Fullscreen) ao fechar a apresentação
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.warn("Não foi possível sair do modo tela cheia:", err);
        });
      }
    };
  }, [clearRetryTimer]);

  return (
    <div className="ca-pres-shell" role="dialog" aria-modal="true" aria-label="Modo Apresentação">
      <header className="ca-pres-top">
        <div className="ca-pres-heading">
          <span className="ca-pres-kicker">
            <MonitorPlay size={14} />
            {slide.tabLabel}
          </span>
          <span className="text-slate-300 font-normal select-none">/</span>
          <span className="ca-pres-title">{slide.sectionLabel}</span>
          {slide.slideTitle && (
            <>
              <span className="text-slate-300 font-normal select-none">/</span>
              <span className="ca-pres-subtitle">{slide.slideTitle}</span>
            </>
          )}
          {slideStatus === "idle" && (
            <span className="ca-pres-loading ml-2">
              <Loader2 size={13} className="animate-spin" />
              Aguardando gráficos...
            </span>
          )}
          {slideStatus === "missing" && (
            <span className="ca-pres-missing ml-2">Não encontrado</span>
          )}
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

          {/* Seletor de Tempo de Transição Personalizado */}
          <div className="ca-pres-dropdown-container" ref={dropdownRef}>
            <button
              type="button"
              className="ca-pres-dropdown-trigger"
              onClick={() => setIsDropdownOpen((o) => !o)}
              title="Tempo de permanência em cada slide"
              aria-expanded={isDropdownOpen}
              aria-label={`Tempo atual: ${duration} segundos`}
            >
              <Clock size={15} />
              <span>{duration}s</span>
              <ChevronDown size={14} className={`ca-pres-dropdown-chevron ${isDropdownOpen ? "open" : ""}`} />
            </button>

            {isDropdownOpen && (
              <ul className="ca-pres-dropdown-menu">
                {[5, 10, 15, 30, 60].map((val) => (
                  <li key={val}>
                    <button
                      type="button"
                      className={`ca-pres-dropdown-item ${duration === val ? "selected" : ""}`}
                      onClick={() => {
                        setDuration(val);
                        setProgress(0);
                        setIsDropdownOpen(false);
                      }}
                    >
                      {val} segundos
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
    </div>
  );
}
