"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Eye, EyeOff, Loader2, MonitorPlay, Pause, Play, X } from "lucide-react";

type PresentationTab =
  | "perfil"
  | "pessoal"
  | "tecnologia"
  | "infraestrutura"
  | "merenda"
  | "servicos"
  | "alunos"
  | "governanca"
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
    ["perfil-dimensao-indicadores", "Indicadores, distribuição e matrículas"],
  ]),
  ...createSlides("perfil", "Caracterização da Rede", "Organização da Oferta e Funcionamento", [
    ["perfil-oferta-etapas", "Etapas, modalidades e turnos"],
  ]),
  ...createSlides("perfil", "Caracterização da Rede", "Infraestrutura Educacional", [
    ["perfil-infra-indicadores", "Indicadores, ambientes e média por porte"],
  ]),
  ...createSlides("perfil", "Caracterização da Rede", "Detalhamento por DRE", [
    ["perfil-dre-tabela", "Tabela consolidada"],
  ]),

  {
    id: "pessoal-quadro",
    tabId: "pessoal",
    tabLabel: "Pessoal e Gestão Escolar",
    sectionLabel: "Quadro de Pessoal",
    slideTitle: "Indicadores e Distribuição",
    contentId: "pessoal-quadro-indicadores, pessoal-quadro-distribuicao",
  },

  {
    id: "pessoal-quadro",
    tabId: "pessoal",
    tabLabel: "Pessoal e Gestão Escolar",
    sectionLabel: "Quadro de Pessoal",
    slideTitle: "Detalhamento por DRE",
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
    contentId: "tecnologia-parque-indicadores,tecnologia-parque-distribuicao,tecnologia-parque-notas",
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
    sectionLabel: "Condições Estruturais",
    contentId: "infra-condicoes-resumo,infra-condicoes-situacao",
  },
  {
    id: "infra-condicoes",
    tabId: "infraestrutura",
    tabLabel: "Infraestrutura e Segurança",
    sectionLabel: "Condições Estruturais",
    slideTitle: "Ambientes e Manutenção",
    contentId: "infra-condicoes-ambientes",
  },
  {
    id: "infra-energia",
    tabId: "infraestrutura",
    tabLabel: "Infraestrutura e Segurança",
    sectionLabel: "Energia, Climatização e Capacidade Elétrica",
    contentId: "infra-energia-distribuicao, infra-energia-tabela",
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

  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Resumo IDEB 2023", [
    ["alunos-resumo-cards", "Indicadores gerais"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Resultado por Etapa", [
    ["alunos-etapa-tabela", "IDEB por etapa"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Distribuição por Faixas", [
    ["alunos-faixas-distribuicao", "Faixas de IDEB por etapa"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Ranking por Escola", [
    ["alunos-ranking-escolas", "Maiores, menores e sem IDEB"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Resultado por DRE", [
    ["alunos-dre-tabela", "Agregações por DRE e etapa"],
  ]),
  ...createSlides("alunos", "Perfil dos Alunos e Resultados", "Qualidade da Base", [
    ["alunos-qualidade", "Indicadores de qualidade"],
  ]),

  ...createSlides("governanca", "Gestão Financeira e Governança", "Visão Geral Financeira", [
    ["financeiro-resumo-cards", "Indicadores de repasses e despesas"],
  ]),
  ...createSlides("governanca", "Gestão Financeira e Governança", "Execução por Ano", [
    ["financeiro-evolucao-ano", "Evolução histórica do programa"],
  ]),
  ...createSlides("governanca", "Gestão Financeira e Governança", "Status de Prestação", [
    ["financeiro-prestacao-status", "Adimplência e regularidade das contas"],
  ]),
  ...createSlides("governanca", "Gestão Financeira e Governança", "Vínculo Cadastral", [
    ["financeiro-vinculo-cadastral", "Associação com código Inep"],
  ]),
  ...createSlides("governanca", "Gestão Financeira e Governança", "Maiores Repasses", [
    ["financeiro-ranking-recebido", "Escolas que mais receberam recursos"],
  ]),
  ...createSlides("governanca", "Gestão Financeira e Governança", "Saldos Reprogramados", [
    ["financeiro-ranking-reprogramado", "Saldos retidos de exercícios anteriores"],
  ]),
  ...createSlides("governanca", "Gestão Financeira e Governança", "Conselhos Escolares", [
    ["governanca-institucional-cards", "Indicadores de controle social"],
  ]),

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

// top padding (~80px header) + bottom padding (~80px footer) + breathing room (16px)
const PRES_PAGE_PADDING = 176;

// Tempo (ms) sem atividade do mouse antes de ocultar a barra de controles.
const CONTROLS_AUTO_HIDE_MS = 4000;

function removeActiveSlideState() {
  document.querySelectorAll<HTMLElement>("[data-pres-slide]").forEach((element) => {
    element.classList.remove("ca-pres-slide-active");
    element.removeAttribute("aria-current");
    element.style.zoom = "";
  });
}

export default function PresentationMode({ onClose, onNavigateTab }: PresentationModeProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideStatus, setSlideStatus] = useState<"idle" | "found" | "missing">("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(10); // 10 segundos por padrão
  const [progress, setProgress] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsManualHidden, setControlsManualHidden] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);

  const slideIndexRef = useRef(0);
  const transitionInProgressRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);
  const maxWaitTimeoutRef = useRef<number | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const navigationTokenRef = useRef(0);
  const onNavigateTabRef = useRef(onNavigateTab);
  const consecutiveSkipsRef = useRef(0);
  const durationRef = useRef(duration);

  const total = SLIDES.length;
  const slide = SLIDES[slideIndex];

  useEffect(() => {
    onNavigateTabRef.current = onNavigateTab;
  }, [onNavigateTab]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (slideStatus === "found" || slideStatus === "missing") {
      const timer = setTimeout(() => {
        transitionInProgressRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [slideStatus]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (safetyTimeoutRef.current !== null) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (maxWaitTimeoutRef.current !== null) {
      window.clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null;
    }
    if (observerRef.current !== null) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  const applySlideZoom = useCallback((element: HTMLElement) => {
    const measure = () => {
      const available = window.innerHeight - PRES_PAGE_PADDING;
      const natural = element.scrollHeight;
      if (natural > 0 && available > 0) {
        const zoom = available / natural;
        // Só encolhe se o conteúdo for maior que a tela — CSS cuida de crescer
        element.style.zoom = zoom < 1 ? zoom.toFixed(3) : "1";
      }
    };

    element.style.zoom = "1";
    requestAnimationFrame(measure);

    // Re-measure after async data may have loaded (e.g. HBarChart rows)
    window.setTimeout(() => {
      if (!element.classList.contains("ca-pres-slide-active")) return;
      element.style.zoom = "1";
      requestAnimationFrame(measure);
    }, 800);
  }, []);

  const activateSlideWithRetry = useCallback((target: PresentationSlide, navigationToken: number) => {
    clearRetryTimer();

    const tryActivate = () => {
      removeActiveSlideState();
      
      const ids = target.contentId.split(",").map(id => id.trim());
      const elements: HTMLElement[] = [];
      
      for (const id of ids) {
        const element = document.querySelector<HTMLElement>(
          `[data-pres-slide="${id}"]`,
        );
        if (element) {
          elements.push(element);
        }
      }

      if (elements.length === ids.length) {
        elements.forEach((element) => {
          element.classList.add("ca-pres-slide-active");
          element.setAttribute("aria-current", "true");
          applySlideZoom(element);
        });
        retryTimerRef.current = null;
        setSlideStatus("found");
        if (maxWaitTimeoutRef.current !== null) {
          window.clearTimeout(maxWaitTimeoutRef.current);
          maxWaitTimeoutRef.current = null;
        }
        if (safetyTimeoutRef.current !== null) {
          window.clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
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

    // Helper para verificar se a aba de trás ainda está carregando dados da API
    const isTabLoading = () => {
      const loaders = document.querySelectorAll(".animate-spin");
      for (let i = 0; i < loaders.length; i++) {
        if (!loaders[i].closest(".ca-pres-shell")) {
          return true;
        }
      }
      const adminPage = document.querySelector(".admin-page");
      if (adminPage) {
        const text = adminPage.textContent || "";
        if (text.includes("Carregando")) {
          return true;
        }
      }
      return false;
    };

    // Timeout de segurança (5 segundos)
    const checkAndSetStatus = () => {
      if (navigationToken !== navigationTokenRef.current) {
        return;
      }
      // Se ainda está carregando os dados na aba, aguarda mais 1 segundo e checa novamente
      if (isTabLoading()) {
        safetyTimeoutRef.current = window.setTimeout(checkAndSetStatus, 1000);
        return;
      }
      setSlideStatus((prev) => (prev === "found" ? "found" : "missing"));
      clearRetryTimer();
    };

    safetyTimeoutRef.current = window.setTimeout(checkAndSetStatus, 5000);

    // Timeout de limite máximo: o dobro do tempo selecionado (duration * 2)
    const maxWaitTimeMs = durationRef.current * 2 * 1000;
    maxWaitTimeoutRef.current = window.setTimeout(() => {
      if (navigationToken !== navigationTokenRef.current) {
        return;
      }
      setSlideStatus((prev) => {
        if (prev !== "found") {
          console.warn(`Tempo limite de carregamento excedido (${durationRef.current * 2}s). Avançando.`);
          return "missing";
        }
        return "found";
      });
      clearRetryTimer();
    }, maxWaitTimeMs);
  }, [applySlideZoom, clearRetryTimer]);

  const goToSlide = useCallback((nextIndex: number, isAutoSkip = false) => {
    const normalized = ((nextIndex % total) + total) % total;
    const target = SLIDES[normalized];
    const navigationToken = navigationTokenRef.current + 1;

    if (!isAutoSkip) {
      consecutiveSkipsRef.current = 0;
    }

    transitionInProgressRef.current = true;
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

  const goNext = useCallback(() => {
    if (transitionInProgressRef.current) return;
    goToSlide(slideIndexRef.current + 1);
  }, [goToSlide]);

  const goPrev = useCallback(() => {
    if (transitionInProgressRef.current) return;
    goToSlide(slideIndexRef.current - 1);
  }, [goToSlide]);

  // Efeito para o Timer de reprodução automática
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    if (slideStatus !== "found") {
      return;
    }

    const intervalMs = 50;
    let timer: any = null;

    timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (intervalMs / (duration * 1000)) * 100;
        if (next >= 100) {
          if (timer) {
            clearInterval(timer);
          }
          setTimeout(goNext, 0);
          return 0;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isPlaying, slideStatus, duration, goNext, slideIndex]);

  // Efeito para resetar a trava de transição com debounce
  useEffect(() => {
    if (slideStatus === "found" || slideStatus === "missing") {
      const timer = setTimeout(() => {
        transitionInProgressRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [slideStatus, slideIndex]);

  // Efeito para pular automaticamente para o próximo slide se este não for encontrado (missing)
  useEffect(() => {
    if (slideStatus === "missing") {
      consecutiveSkipsRef.current += 1;
      if (consecutiveSkipsRef.current >= total) {
        console.warn("Todos os slides estão indisponíveis.");
        return;
      }
      goToSlide(slideIndexRef.current + 1, true);
    } else if (slideStatus === "found") {
      consecutiveSkipsRef.current = 0;
    }
  }, [slideStatus, goToSlide, total]);

  // Efeito para rolar automaticamente os elementos com scroll durante a reprodução automática
  useEffect(() => {
    if (!isPlaying || slideStatus !== "found") {
      return;
    }

    let scrollableEl: HTMLElement | null = null;
    const activeSlide = document.querySelector<HTMLElement>(".ca-pres-slide-active");
    
    if (activeSlide) {
      // 1. Tenta encontrar elemento marcado com data-pres-table-scroll
      scrollableEl = activeSlide.querySelector<HTMLElement>("[data-pres-table-scroll='true']");
      
      // 2. Se não achar, procura recursivamente por qualquer elemento interno com overflow vertical
      if (!scrollableEl) {
        const elements = activeSlide.querySelectorAll<HTMLElement>("*");
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const hasOverflow = el.scrollHeight > el.clientHeight + 15;
          if (hasOverflow) {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY || style.overflow || "";
            if (
              overflowY === "auto" ||
              overflowY === "scroll" ||
              el.classList.contains("overflow-auto") ||
              el.classList.contains("overflow-y-auto")
            ) {
              scrollableEl = el;
              break;
            }
          }
        }
      }

      // Novo: Se não achar nos descendentes, verifica se o próprio activeSlide tem overflow e scroll habilitado
      if (!scrollableEl) {
        const hasOverflow = activeSlide.scrollHeight > activeSlide.clientHeight + 15;
        if (hasOverflow) {
          const style = window.getComputedStyle(activeSlide);
          const overflowY = style.overflowY || style.overflow || "";
          if (
            overflowY === "auto" ||
            overflowY === "scroll" ||
            activeSlide.classList.contains("overflow-auto") ||
            activeSlide.classList.contains("overflow-y-auto")
          ) {
            scrollableEl = activeSlide;
          }
        }
      }
    }

    // 3. Se não houver nenhum interno com scroll, tenta rolar a página inteira (.admin-page)
    if (!scrollableEl) {
      const adminPage = document.querySelector<HTMLElement>(
        ".censo-admin .ca-app.presenting .admin-page"
      );
      if (adminPage && adminPage.scrollHeight > adminPage.clientHeight + 15) {
        scrollableEl = adminPage;
      }
    }

    if (!scrollableEl) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let currentScroll = scrollableEl.scrollTop;

    const animate = (time: number) => {
      const deltaTime = (time - lastTime) / 1000; // segundos
      lastTime = time;

      const totalScroll = scrollableEl.scrollHeight - scrollableEl.clientHeight;
      if (totalScroll <= 0) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      // Sincroniza se o usuário fez scroll manual para evitar "combate" entre o mouse e a animação
      if (Math.abs(scrollableEl.scrollTop - currentScroll) > 5) {
        currentScroll = scrollableEl.scrollTop;
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
  }, [isPlaying, slideStatus, duration, slideIndex]);

  // Efeito separado para garantir o reset da rolagem ao trocar de slide
  // (independente de estar no modo automático/reprodução ativa ou manual)
  useEffect(() => {
    if (slideStatus !== "found") {
      return;
    }

    const timer = setTimeout(() => {
      const activeSlide = document.querySelector<HTMLElement>(".ca-pres-slide-active");
      if (activeSlide) {
        // Reset scroll de tabelas
        const tableScrolls = activeSlide.querySelectorAll<HTMLElement>("[data-pres-table-scroll='true']");
        tableScrolls.forEach(el => {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        });

        // Reset scroll de outros elementos internos com overflow
        const elements = activeSlide.querySelectorAll<HTMLElement>("*");
        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY || style.overflow || "";
          if (
            overflowY === "auto" ||
            overflowY === "scroll" ||
            el.classList.contains("overflow-auto") ||
            el.classList.contains("overflow-y-auto")
          ) {
            el.scrollTop = 0;
          }
        });

        // Reset scroll do próprio slide
        activeSlide.scrollTop = 0;
      }

      // Reset scroll do container da página inteira
      const adminPage = document.querySelector<HTMLElement>(
        ".censo-admin .ca-app.presenting .admin-page"
      );
      if (adminPage) {
        adminPage.scrollTop = 0;
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [slideIndex, slideStatus]);

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

  // Auto-ocultação dos controles após período sem atividade do mouse.
  // O usuário pode forçar a ocultação manual via botão; nesse caso não
  // reaparece com mousemove (apenas com clique no próprio botão).
  useEffect(() => {
    const clearTimer = () => {
      if (autoHideTimerRef.current !== null) {
        window.clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
    };

    const scheduleHide = () => {
      clearTimer();
      autoHideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_AUTO_HIDE_MS);
    };

    const handleActivity = () => {
      if (controlsManualHidden) return;
      setControlsVisible(true);
      scheduleHide();
    };

    scheduleHide();
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      clearTimer();
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [controlsManualHidden]);

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

  // Controla o scroll do mouse: desabilita durante reprodução automática
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
    };

    if (isPlaying) {
      window.addEventListener("wheel", handleWheel, { passive: false });
      return () => window.removeEventListener("wheel", handleWheel);
    }
  }, [isPlaying]);

  useEffect(() => {
    const handleResize = () => {
      const active = document.querySelector<HTMLElement>("[data-pres-slide].ca-pres-slide-active");
      if (active) applySlideZoom(active);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [applySlideZoom]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    }

    return () => {
      navigationTokenRef.current += 1;
      clearRetryTimer();
      removeActiveSlideState();
      document.body.style.overflow = previousBodyOverflow;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    };
  }, [clearRetryTimer]);

  const isHidden = !controlsVisible || controlsManualHidden;

  return (
    <div
      className={`ca-pres-shell${isHidden ? " controls-hidden" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Modo Apresentação"
    >
      <header className="ca-pres-top">
        <div className="ca-pres-heading">
          <span className="ca-pres-kicker">
            <MonitorPlay size={18} />
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
              <Loader2 size={16} className="animate-spin" />
              Aguardando gráficos...
            </span>
          )}
          {slideStatus === "missing" && (
            <span className="ca-pres-missing ml-2">Não encontrado</span>
          )}
        </div>

        <img
          src="/parceiros.png"
          alt="FADEP · Secretaria de Educação · Governo do Pará"
          className="ca-pres-logo"
        />

        {/* Barra de Progresso do Timer */}
        <div className="ca-pres-progress-bar-container">
          <div
            className={`ca-pres-progress-bar-fill ${slideStatus !== "found" ? "waiting" : ""}`}
            style={{ width: `${slideStatus === "found" ? progress : 0}%` }}
          />
        </div>
      </header>

      <footer className="ca-pres-bottom">
        <div className="ca-pres-controls">
          <button
            type="button"
            className="ca-pres-nav-btn"
            title="Slide anterior (←)"
            aria-label="Slide anterior"
            onClick={goPrev}
          >
            <ChevronLeft size={20} />
          </button>

          <button
            type="button"
            className={`ca-pres-autoplay-btn ${isPlaying ? "active" : ""}`}
            title={isPlaying ? "Pausar reprodução automática (Espaço)" : "Iniciar reprodução automática (Espaço)"}
            aria-label={isPlaying ? "Pausar reprodução automática" : "Iniciar reprodução automática"}
            onClick={() => setIsPlaying((p) => !p)}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            type="button"
            className="ca-pres-nav-btn"
            title="Próximo slide (→)"
            aria-label="Próximo slide"
            onClick={goNext}
          >
            <ChevronRight size={20} />
          </button>

          <span className="ca-pres-counter">
            {slideIndex + 1} / {total}
          </span>

          {/* Seletor de Tempo de Transição */}
          <div className="ca-pres-dropdown-container" ref={dropdownRef}>
            <button
              type="button"
              className="ca-pres-dropdown-trigger"
              onClick={() => setIsDropdownOpen((o) => !o)}
              title="Tempo de permanência em cada slide"
              aria-expanded={isDropdownOpen}
              aria-label={`Tempo atual: ${duration} segundos`}
            >
              <Clock size={17} />
              <span>{duration}s</span>
              <ChevronDown size={16} className={`ca-pres-dropdown-chevron ${isDropdownOpen ? "open" : ""}`} />
            </button>

            {isDropdownOpen && (
              <ul className="ca-pres-dropdown-menu ca-pres-dropdown-menu--up">
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

          <button
            type="button"
            className="ca-pres-toggle-btn"
            title={controlsManualHidden ? "Mostrar controles" : "Ocultar controles"}
            aria-label={controlsManualHidden ? "Mostrar controles" : "Ocultar controles"}
            onClick={() => setControlsManualHidden((h) => !h)}
          >
            {controlsManualHidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>

          <button
            type="button"
            className="ca-pres-close"
            title="Fechar apresentação (Esc)"
            aria-label="Fechar apresentação"
            onClick={onClose}
          >
            <X size={18} />
            <span>Fechar</span>
          </button>
        </div>
      </footer>

      {/* Botão flutuante para reexibir controles quando ocultos manualmente */}
      {controlsManualHidden && (
        <button
          type="button"
          className="ca-pres-reveal-btn"
          title="Mostrar controles"
          aria-label="Mostrar controles"
          onClick={() => setControlsManualHidden(false)}
        >
          <Eye size={18} />
        </button>
      )}
    </div>
  );
}
