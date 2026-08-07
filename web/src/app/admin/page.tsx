"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  LogOut, Search, RefreshCw, CloudUpload, Lock, User as UserIcon,
  AlertCircle, Loader2, PanelLeftClose, Eye, EyeOff, ArrowRight,
  BarChart2, UsersRound, MonitorSmartphone, ShieldCheck, Utensils,
  ClipboardCheck, Activity, Landmark, Database, MapPinned,
  Menu, X, ChevronDown, HeartPulse,
  MonitorPlay,
  Sun,
  Moon,
} from "lucide-react";

import "./admin.css";

import { API, C } from "@/components/admin/shared/constants";
import {
  apiFetch, saveToken, loadToken, clearToken, clearApiCache, sanitize, prefetchDashboard,
} from "@/components/admin/shared/api";
import { JsonModal } from "@/components/admin/shared/JsonModal";
import { AbaTodosCensos } from "@/components/admin/AbaTodosCensos";
import { AbaPorDre } from "@/components/admin/AbaPorDre";
import { AbaPerfilAlunos } from "@/components/admin/AbaPerfilAlunos";
import { AbaCaracterizacao } from "@/components/admin/AbaCaracterizacao";
import { AbaPessoalGestao } from "@/components/admin/AbaPessoalGestao";
import { AbaTecnologia } from "@/components/admin/AbaTecnologia";
import { AbaInfraestruturaSeguranca } from "@/components/admin/AbaInfraestruturaSeguranca";
import { AbaMerenda } from "@/components/admin/AbaMerenda";
import { AbaServicosTerceirizados } from "@/components/admin/AbaServicosTerceirizados";
import { AbaGestaoFinanceiraGovernanca } from "@/components/admin/AbaGestaoFinanceiraGovernanca";
import { AbaSaudeOperacionalEscolas } from "@/components/admin/AbaSaudeOperacionalEscolas";
import { FiltrosGlobais } from "@/components/admin/FiltrosGlobais";
import PresentationMode from "@/components/admin/PresentationMode";
import type {
  CensusPage, DashboardData, DashboardFilters, FiltrosOpcoes,
} from "@/components/admin/shared/types";

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (t: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "auth" | "prefetch">("idle");
  const [attempts, setAttempts] = useState(0);
  const blocked = attempts >= 5;
  const loading = status !== "idle";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    setError(""); setStatus("auth");
    const u = sanitize(username).slice(0, 64);
    const p = sanitize(password).slice(0, 128);
    if (!u || !p) { setError("Preencha usuário e senha."); setStatus("idle"); return; }
    try {
      const res = await fetch(`${API}/v1/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const json = await res.json();
      if (!res.ok) { setAttempts((a) => a + 1); setError(json.message ?? "Credenciais inválidas."); setStatus("idle"); return; }
      const token = (json.data as { token: string }).token;
      saveToken(token);
      setStatus("prefetch");
      await prefetchDashboard(token);
      onLogin(token);
    } catch { setError("Não foi possível conectar ao servidor."); setStatus("idle"); }
  }

  return (
    <div className="censo-admin">
      <main className="login">

        {/* ── Left: institutional panel ── */}
        <div className="login__left">
          <div className="login__left-circle login__left-circle--lg" aria-hidden="true" />
          <div className="login__left-circle login__left-circle--sm" aria-hidden="true" />
          <div className="login__left-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="login__left-logo"
              src="/logo-horizontal-letter-white.png"
              alt="FADEP · Secretaria de Educação · Governo do Pará"
            />
            <div className="login__left-brand">
              <h1 className="login__left-title">Censo SEDUC</h1>
              <p className="login__left-subtitle">Operacional e Estrutural</p>
            </div>
          </div>
        </div>

        {/* ── Right: form ── */}
        <div className="login__right">
          <div className="login__form-wrapper">
            <div className="login__form-header">
              <span className="login__mobile-app">Censo SEDUC</span>
              <h2 className="login__heading">Entrar no painel</h2>
              <p className="login__subheading">Utilize suas credenciais institucionais da SEDUC‑PA.</p>
            </div>

            <form className="login__form" onSubmit={submit} noValidate>
              {/* Usuário */}
              <label className="login__field">
                <span className="login__label">Usuário</span>
                <div className="login__input-wrap">
                  <span className="login__input-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <input
                    type="text" autoComplete="username" maxLength={64}
                    className="login__input login__input--icon"
                    disabled={loading || blocked} value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin_seduc_pa" required
                  />
                </div>
              </label>

              {/* Senha */}
              <label className="login__field">
                <span className="login__label">Senha de acesso</span>
                <div className="login__input-wrap">
                  <span className="login__input-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                      <rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <input
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password" maxLength={128}
                    className="login__input login__input--icon"
                    disabled={loading || blocked} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••" required
                  />
                  <button
                    type="button" className="login__input-toggle" tabIndex={-1}
                    aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M2 10s3.2-5 8-5 8 5 8 5-3.2 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5"/>
                      {showPwd && <line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>}
                    </svg>
                  </button>
                </div>
              </label>

              {error && <p className="login__error">{error}</p>}
              {blocked && <p className="login__warning">Muitas tentativas. Aguarde alguns minutos.</p>}

              <button type="submit" className="login__button" disabled={loading || blocked}>
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" />{status === "auth" ? "Autenticando…" : "Carregando painel…"}</>
                ) : (
                  <>
                    Entrar no painel
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="login__button-arrow">
                      <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

      </main>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type Tab =
  | "perfil"
  | "pessoal"
  | "tecnologia"
  | "infraestrutura"
  | "merenda"
  | "servicos"
  | "alunos"
  | "governanca"
  | "saude"
  | "census"
  | "dre";

const PAGE_META: Record<Tab, { title: string }> = {
  perfil: { title: "Caracterização da Rede" },
  pessoal: { title: "Pessoal e Gestão Escolar" },
  tecnologia: { title: "Tecnologia e Equipamentos" },
  infraestrutura: { title: "Infraestrutura e Segurança" },
  merenda: { title: "Merenda Escolar" },
  servicos: { title: "Serviços Terceirizados" },
  alunos: { title: "Perfil dos Alunos e Resultados" },
  governanca: { title: "Gestão Financeira e Governança" },
  saude: { title: "Índice de Saúde Operacional por escola" },
  census: { title: "Registros de Preenchimento do Censo" },
  dre: { title: "Andamento do Preenchimento por DRE" },
};

type SubItem = { label: string; anchor: string };

type NavItem = {
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  subItems?: SubItem[];
};

const NAV_INDICATORS: NavItem[] = [
  {
    id: "perfil", label: "Caracterização da Rede", Icon: BarChart2,
    subItems: [
      { label: "Dimensão e Perfil da Rede", anchor: "sec-perfil-dimensao" },
      { label: "Organização da Oferta e Funcionamento", anchor: "sec-perfil-oferta" },
      { label: "Infraestrutura Educacional", anchor: "sec-perfil-infra" },
    ],
  },
  {
    id: "pessoal", label: "Pessoal e Gestão Escolar", Icon: UsersRound,
    subItems: [
      { label: "Estrutura de Gestão Escolar", anchor: "sec-pessoal-estrutura" },
      { label: "Coordenação Pedagógica", anchor: "sec-pessoal-coordenacao" },
      { label: "Quadro de Pessoal", anchor: "sec-pessoal-quadro" },
    ],
  },
  {
    id: "tecnologia", label: "Tecnologia e Equipamentos", Icon: MonitorSmartphone,
    subItems: [
      { label: "Infraestrutura Digital", anchor: "sec-tecnologia-digital" },
      { label: "Parque Tecnológico", anchor: "sec-tecnologia-parque" },
      { label: "Uso Pedagógico", anchor: "sec-tecnologia-pedagogico" },
    ],
  },
  {
    id: "infraestrutura", label: "Infraestrutura e Segurança", Icon: ShieldCheck,
    subItems: [
      { label: "Condições Estruturais e Ambientes", anchor: "sec-infra-condicoes" },
      { label: "Energia, Climatização e Cap. Elétrica", anchor: "sec-infra-energia" },
      { label: "Segurança Física e Patrimonial", anchor: "sec-infra-seguranca" },
    ],
  },
  {
    id: "merenda", label: "Merenda Escolar", Icon: Utensils,
    subItems: [
      { label: "Oferta e Adequação da Merenda", anchor: "sec-merenda-oferta" },
      { label: "Estrutura Física", anchor: "sec-merenda-estrutura" },
      { label: "Equipamentos da Merenda", anchor: "sec-merenda-equipamentos" },
      { label: "Condições Sanitárias e Segurança", anchor: "sec-merenda-sanitarias" },
    ],
  },
  {
    id: "servicos", label: "Serviços Terceirizados", Icon: ClipboardCheck,
    subItems: [
      { label: "Visão Geral", anchor: "sec-servicos-visao" },
      { label: "Serviços Gerais", anchor: "sec-servicos-gerais" },
      { label: "Portaria", anchor: "sec-servicos-portaria" },
      { label: "Manipulador de Alimentos", anchor: "sec-servicos-manipuladores" },
      { label: "Governança / Supervisão", anchor: "sec-servicos-governanca" },
    ],
  },
  {
    id: "alunos", label: "Perfil dos Alunos e Resultados", Icon: Activity,
    subItems: [
      { label: "Resumo IDEB 2023", anchor: "sec-alunos-resumo" },
      { label: "Resultado por Etapa", anchor: "sec-alunos-etapa" },
      { label: "Distribuição por Faixas", anchor: "sec-alunos-faixas" },
      { label: "Ranking por Escola", anchor: "sec-alunos-ranking" },
      { label: "Resultado por DRE", anchor: "sec-alunos-dre" },
      { label: "Qualidade da Base", anchor: "sec-alunos-qualidade" },
    ],
  },
  {
    id: "governanca", label: "Gestão Financeira e Governança", Icon: Landmark,
    subItems: [
      { label: "Visão Geral Financeira", anchor: "sec-financeiro-resumo" },
      { label: "Execução por Ano", anchor: "sec-financeiro-evolucao" },
      { label: "Prestação de Contas", anchor: "sec-financeiro-prestacao" },
      { label: "Vínculo Cadastral", anchor: "sec-financeiro-vinculo" },
      { label: "Rankings de Escolas", anchor: "sec-financeiro-rankings" },
    ],
  },
];

const NAV_OPERACIONAL: NavItem[] = [
  { id: "saude", label: "Saúde Operacional", Icon: HeartPulse },
  { id: "census", label: "Registros do Censo", Icon: Database },
  { id: "dre", label: "Preenchimento por DRE", Icon: MapPinned },
];

function NavGroup({
  items, active, onNav, mobileOpen = false,
}: {
  items: NavItem[]; active: Tab; onNav: (id: Tab) => void; mobileOpen?: boolean;
}) {
  const [openSub, setOpenSub] = useState<Tab | null>(null);

  const scrollTo = (anchor: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleItemClick = (it: NavItem) => {
    if (it.subItems) {
      if (openSub === it.id) {
        setOpenSub(null);
      } else {
        setOpenSub(it.id);
        // No mobile (menu aberto): apenas expande os sub-itens — não navega ainda.
        // No desktop: navega imediatamente como antes.
        if (!mobileOpen && it.id !== active) onNav(it.id);
      }
    } else {
      onNav(it.id);
    }
  };

  const handleSubItemClick = (parentId: Tab, anchor: string) => {
    if (mobileOpen) {
      // Navega para a aba (fecha o menu) e depois rola até a seção.
      onNav(parentId);
      setTimeout(() => scrollTo(anchor), 350);
    } else {
      scrollTo(anchor);
    }
  };

  return (
    <>
      {items.map((it) => (
        <div key={it.id}>
          <div
            className={`ca-nav-item${active === it.id ? " active" : ""}`}
            onClick={() => handleItemClick(it)}
          >
            <it.Icon size={17} strokeWidth={1.6} className="ca-icon" />
            <span>{it.label}</span>
            {it.subItems && (
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={`ca-nav-chevron${openSub === it.id ? " open" : ""}`}
              />
            )}
          </div>
          {it.subItems && (
            <div className={`ca-nav-subitems${openSub === it.id ? " open" : ""}`}>
              <div className="ca-nav-subitems-inner">
                {it.subItems.map((sub) => (
                  <div key={sub.anchor} className="ca-nav-subitem" onClick={() => handleSubItemClick(it.id, sub.anchor)}>
                    {sub.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [censusPage, setCensusPage] = useState<CensusPage | null>(null);
  const [tab, setTab] = useState<Tab>("perfil");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(["perfil"]));
  const [censusLimit, setCensusLimit] = useState(10);
  const [censusPageNum, setCensusPageNum] = useState(1);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [filtrosOpcoes, setFiltrosOpcoes] = useState<FiltrosOpcoes | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [showMobilePresAlert, setShowMobilePresAlert] = useState(false);

  const logout = useCallback(() => { clearToken(); clearApiCache(); onLogout(); }, [onLogout]);

  // O endpoint legado /v1/admin/dashboard segue sendo consultado para gatear o
  // estado de carregamento/erro do painel operacional. O payload (incl. by_dre)
  // não é mais armazenado no cliente: a aba "Preenchimento por DRE" agora usa o
  // endpoint analítico próprio /v1/admin/analytics/preenchimento/dre.
  const loadDb = useCallback(async () => {
    try {
      await apiFetch<DashboardData>("/v1/admin/dashboard", token);
    } catch (e) {
      if ((e as Error).message === "UNAUTHORIZED") { logout(); return; }
      setErr("Erro ao carregar painel operacional.");
    } finally { setLoading(false); }
  }, [token, logout]);

  // Registros do Censo: filtros globais (ano, DRE, município, zona, Região de
  // Integração) viram query params; status e busca textual são filtros locais
  // da aba, mas a busca roda no backend (filtra todo o recorte, não só a página).
  const loadCensus = useCallback(async (limit = censusLimit, page = censusPageNum) => {
    const p = new URLSearchParams();
    if (filterStatus) p.set("status", filterStatus);
    if (filters.ano) p.set("year", String(filters.ano));
    if (filters.dre) p.set("dre", filters.dre);
    if (filters.municipio) p.set("municipio", filters.municipio);
    if (filters.zona) p.set("zona", filters.zona);
    if (filters.regiao_integracao) p.set("regiao_integracao", filters.regiao_integracao);
    if (search) p.set("search", search);
    p.set("limit", String(limit));
    p.set("page", String(page));
    try { setCensusPage(await apiFetch<CensusPage>(`/v1/admin/census?${p}`, token)); }
    catch (e) { if ((e as Error).message === "UNAUTHORIZED") logout(); }
  }, [token, filterStatus, filters, search, censusLimit, censusPageNum, logout]);

  useEffect(() => { loadDb(); }, [loadDb]);
  // Pequeno debounce: a busca textual agora dispara requisição ao backend e o
  // timeout evita uma chamada por tecla digitada.
  useEffect(() => {
    if (tab !== "census") return;
    const t = setTimeout(() => { loadCensus(); }, 300);
    return () => clearTimeout(t);
  }, [tab, loadCensus]);
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.dre) qs.set("dre", filters.dre);
    if (filters.municipio) qs.set("municipio", filters.municipio);
    if (filters.zona) qs.set("zona", filters.zona);
    if (filters.regiao_integracao) qs.set("regiao_integracao", filters.regiao_integracao);
    const url = `/v1/admin/analytics/filtros/opcoes${qs.toString() ? `?${qs}` : ""}`;
    apiFetch<FiltrosOpcoes>(url, token)
      .then(setFiltrosOpcoes)
      .catch((e) => { if ((e as Error).message === "UNAUTHORIZED") logout(); });
  }, [filters, token, logout]);


  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/v1/admin/sync-sheets`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      alert(json.message ?? "Sync concluído.");
      loadDb();
    } catch { alert("Erro ao sincronizar."); }
    finally { setSyncing(false); }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Mudanças de recorte (filtros globais, status ou busca) voltam para a página 1.
  const updateSearch = (s: string) => { setSearch(s); setCensusPageNum(1); };
  const updateFilterStatus = (s: string) => { setFilterStatus(s); setCensusPageNum(1); };
  const updateFilters = (f: DashboardFilters) => { setFilters(f); setCensusPageNum(1); };

  const handleNav = (id: Tab) => { setTab(id); updateSearch(""); setVisited((prev) => new Set([...prev, id])); setMobileNavOpen(false); };

  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("censo_admin_theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("censo_admin_theme", dark ? "dark" : "light");
  }, [dark]);

  if (loading) return (
    <div className="censo-admin" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 className="animate-spin" size={32} style={{ color: C.primary }} />
    </div>
  );

  return (
    <div className={`censo-admin${dark ? " dark" : ""}`}>
      <div className={`ca-app${collapsed ? " collapsed" : ""}${mobileNavOpen ? " nav-open" : ""}${presentationMode ? " presenting" : ""}`}>

        {/* Overlay da gaveta de navegação — visível apenas no mobile (CSS) */}
        <div className="ca-nav-overlay" onClick={() => setMobileNavOpen(false)} />

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className="ca-sidebar">
          <div className="ca-side-top">
            <div className="ca-brand-row">
              <div className="ca-brand-mark-img">
                <img src="/brasao-para.png" alt="Brasão do Estado do Pará" />
              </div>
              <div className="ca-brand-text">
                <span className="bt1">Censo Operacional</span>
                <span className="bt2">SEDUC · Pará</span>
              </div>
            </div>
            <div
              className="ca-collapse-btn"
              title={collapsed ? "Expandir" : "Recolher"}
              onClick={() => setCollapsed((c) => !c)}
            >
              <PanelLeftClose size={17} strokeWidth={1.6} />
            </div>
            <button
              className="ca-drawer-close"
              aria-label="Fechar menu"
              onClick={() => setMobileNavOpen(false)}
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>

          <div className="ca-nav-group">
            <div className="ca-nav-group-label">Indicadores</div>
            <NavGroup items={NAV_INDICATORS} active={tab} onNav={handleNav} mobileOpen={mobileNavOpen} />
          </div>

          <div className="ca-nav-group">
            <div className="ca-nav-group-label">Operacional</div>
            <NavGroup items={NAV_OPERACIONAL} active={tab} onNav={handleNav} mobileOpen={mobileNavOpen} />
          </div>

          <div className="ca-side-footer">
            <div className="ca-sf-icon">
              <RefreshCw size={16} />
            </div>
            <div>
              <div className="ca-sf-t">Dados do censo</div>
              <div className="ca-sf-s">Atualizado em 27/05/2026</div>
            </div>
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────── */}
        <main className="ca-main">
          {/* Topbar */}
          <div className="ca-topbar">
            <div className="ca-topbar-left">
              <button
                className="ca-mobile-menu-btn"
                aria-label="Abrir menu de navegação"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={18} strokeWidth={1.8} />
              </button>
              <div className="ca-crumbs">
                <span>Painel SEDUC</span>
                <span className="sep">/</span>
                <span className="cur">{PAGE_META[tab].title}</span>
              </div>
            </div>
            <div className="ca-topbar-right">
              <img
                src={dark ? "/logo-horizontal-letter-white.png" : "/parceiros.png"}
                alt="FADEP · Secretaria de Educação · Governo do Pará"
                className="ca-topbar-logo"
              />
              <button
                type="button"
                className="ca-pres-launch-btn ca-pres-mobile-disabled z-10"
                title="Modo Apresentação"
                onClick={() => {
                  if (window.innerWidth < 768) {
                    setShowMobilePresAlert(true);
                  } else {
                    setPresentationMode(true);
                  }
                }}
              >
                <MonitorPlay size={16} />
                <span>Modo Apresentação</span>
              </button>
              <button className="ca-icon-btn" title="Mudar tema" onClick={() => setDark(!dark)}>
                {
                  dark
                    ? <Sun size={16} />
                    : <Moon size={16} />
                }
              </button>
              <button className="ca-icon-btn" title="Sair" onClick={logout}>
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Page content */}
          <div className="admin-page">
            {err && (
              <div className="ca-error-note">
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                {err}
              </div>
            )}

            {tab !== "saude" && (
              <div className="ca-filters-wrap">
                <FiltrosGlobais
                  opcoes={filtrosOpcoes}
                  filters={filters}
                  onFiltersChange={updateFilters}
                />
              </div>
            )}
            {/* Renderiza todas as abas já visitadas. Quando volta para uma aba os dados já são carregados*/}
            {visited.has("perfil") && (
              <div style={{ display: tab === "perfil" ? undefined : "none" }}>
                <AbaCaracterizacao token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("pessoal") && (
              <div style={{ display: tab === "pessoal" ? undefined : "none" }}>
                <AbaPessoalGestao token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("tecnologia") && (
              <div style={{ display: tab === "tecnologia" ? undefined : "none" }}>
                <AbaTecnologia token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("infraestrutura") && (
              <div style={{ display: tab === "infraestrutura" ? undefined : "none" }}>
                <AbaInfraestruturaSeguranca token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("merenda") && (
              <div style={{ display: tab === "merenda" ? undefined : "none" }}>
                <AbaMerenda token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("servicos") && (
              <div style={{ display: tab === "servicos" ? undefined : "none" }}>
                <AbaServicosTerceirizados token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("alunos") && (
              <div style={{ display: tab === "alunos" ? undefined : "none" }}>
                <AbaPerfilAlunos token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("governanca") && (
              <div style={{ display: tab === "governanca" ? undefined : "none" }}>
                <AbaGestaoFinanceiraGovernanca token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
            {visited.has("saude") && (
              <div style={{ display: tab === "saude" ? undefined : "none" }}>
                <AbaSaudeOperacionalEscolas
                  token={token}
                  onUnauth={logout}
                  filters={filters}
                  opcoes={filtrosOpcoes}
                  onFiltersChange={updateFilters}
                />
              </div>
            )}

            {tab === "census" && (
              <AbaTodosCensos
                censusPage={censusPage}
                filterStatus={filterStatus}
                setFilterStatus={updateFilterStatus}
                search={search}
                setSearch={updateSearch}
                censusLimit={censusLimit}
                setCensusLimit={(l) => { setCensusLimit(l); setCensusPageNum(1); }}
                censusPageNum={censusPageNum}
                setCensusPageNum={setCensusPageNum}
                onView={setViewId}
                formatDate={fmtDate}
              />
            )}

            {visited.has("dre") && (
              <div style={{ display: tab === "dre" ? undefined : "none" }}>
                <AbaPorDre token={token} onUnauth={logout} filters={filters} />
              </div>
            )}
          </div>

          {/* Partners footer */}
          <footer className="ca-partners-strip">
            <img
              src={dark ? "/logo-horizontal-letter-white.png" : "/parceiros.png"}
              alt="FADEP · Secretaria de Educação · Governo do Pará"
            />
          </footer>
        </main>

      </div>

      {viewId !== null && (
        <JsonModal censusId={viewId} token={token} onClose={() => setViewId(null)} />
      )}

      {presentationMode && (
        <PresentationMode
          onClose={() => setPresentationMode(false)}
          onNavigateTab={(tabId) => handleNav(tabId as Tab)}
        />
      )}

      {showMobilePresAlert && (
        <div className="ca-mobile-pres-overlay" onClick={() => setShowMobilePresAlert(false)}>
          <div className="ca-mobile-pres-popup" onClick={(e) => e.stopPropagation()}>
            <div className="ca-mobile-pres-popup-icon">
              <MonitorPlay size={32} />
            </div>
            <h3>Funcionalidade indisponível</h3>
            <p>
              O <strong>Modo Apresentação</strong> está disponível apenas em
              <strong> desktops</strong> ou <strong>tablets</strong>.
            </p>
            <p className="ca-mobile-pres-hint">
              Acesse pelo computador ou tablet para utilizar este recurso.
            </p>
            <button
              type="button"
              className="ca-mobile-pres-popup-btn"
              onClick={() => setShowMobilePresAlert(false)}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [auth, setAuth] = useState<{ token: string | null; ready: boolean }>({ token: null, ready: false });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuth({ token: loadToken(), ready: true });
  }, []);
  if (!auth.ready) return null;
  if (!auth.token) return <LoginForm onLogin={(t) => setAuth({ token: t, ready: true })} />;
  return <Dashboard token={auth.token} onLogout={() => setAuth({ token: null, ready: true })} />;
}
