"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  LogOut, Search, RefreshCw, CloudUpload, Lock, User as UserIcon,
  AlertCircle, Loader2, PanelLeftClose, Eye, EyeOff, ArrowRight,
  BarChart2, UsersRound, MonitorSmartphone, ShieldCheck, Utensils,
  ClipboardCheck, Activity, Landmark, LayoutDashboard, Database, MapPinned,
  Menu, X, ChevronDown,
} from "lucide-react";

import "./admin.css";

import { API, C } from "@/components/admin/shared/constants";
import {
  apiFetch, saveToken, loadToken, clearToken, clearApiCache, sanitize, prefetchDashboard,
} from "@/components/admin/shared/api";
import { JsonModal } from "@/components/admin/shared/JsonModal";
import { AbaOperacional } from "@/components/admin/AbaOperacional";
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
import type {
  CensusRow, CensusPage, DashboardData,
} from "@/components/admin/shared/types";

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (t: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState("");
  const [status,   setStatus]   = useState<"idle" | "auth" | "prefetch">("idle");
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
      const res  = await fetch(`${API}/v1/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
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
    <div className="censo-admin login-shell">
      <div className="ca-login-frame">

        {/* ── Left: institutional identity ── */}
        <aside className="ca-identity">
          <div className="ca-id-top">
            <div className="ca-id-brasao">
              <img src="/brasao-para.png" alt="Brasão do Estado do Pará" />
            </div>
            <div className="ca-id-org">
              <div className="ot1">Censo Operacional</div>
              <div className="ot2">SEDUC · Pará</div>
            </div>
          </div>

          <div className="ca-id-eyebrow-row">
            <span className="ca-id-badge">Painel Administrativo</span>
            <span className="ca-id-eyebrow">Censo Escolar 2026</span>
          </div>

          <h1 className="ca-id-title">
            Acesso ao painel de gestão da rede estadual.
          </h1>

          <div className="ca-id-footer">
            <span className="ca-dot" />
            Sistema ativo · dados atualizados
          </div>
        </aside>

        {/* ── Right: form ── */}
        <section className="ca-form-side">
          <div className="ca-form-wrap">
            <div>
              <div className="ca-form-eyebrow">Acesso administrativo</div>
              <h2 className="ca-form-title">Entrar no painel</h2>
              <p className="ca-form-sub">Utilize suas credenciais institucionais da SEDUC‑PA.</p>
            </div>

            <form className="ca-lform" onSubmit={submit} noValidate>
              {/* Usuário */}
              <div className="ca-lfield">
                <label className="ca-lfield-label" htmlFor="u">Usuário</label>
                <div className="ca-linput">
                  <UserIcon size={16} className="ca-linput-icon" />
                  <input
                    id="u" type="text" autoComplete="username" maxLength={64}
                    disabled={loading || blocked} value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin_seduc_pa" required
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="ca-lfield">
                <label className="ca-lfield-label" htmlFor="pw">Senha</label>
                <div className="ca-linput">
                  <Lock size={16} className="ca-linput-icon" />
                  <input
                    id="pw" type={showPwd ? "text" : "password"}
                    autoComplete="current-password" maxLength={128}
                    disabled={loading || blocked} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••" required
                  />
                  <button
                    type="button" className="ca-linput-suffix"
                    aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Checkbox row */}
              <div className="ca-checkbox-row">
                <label className="ca-lcheckbox">
                  <input type="checkbox" name="remember" />
                  <span>Manter sessão ativa</span>
                </label>
                <span className="ca-session-note">Sessão expira em 2 horas</span>
              </div>

              {error && (
                <div className="ca-login-error">
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}
              {blocked && (
                <div className="ca-login-warn">
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Muitas tentativas. Aguarde alguns minutos.
                </div>
              )}

              <button type="submit" className="ca-submit-btn" disabled={loading || blocked}>
                {status === "auth"     ? <><Loader2 size={15} className="animate-spin" />Autenticando…</>
                : status === "prefetch"? <><Loader2 size={15} className="animate-spin" />Carregando painel…</>
                :                        <>Entrar no painel <ArrowRight size={14} /></>}
              </button>
            </form>
          </div>
        </section>

      </div>
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
  | "operacional"
  | "census"
  | "dre";

const PAGE_META: Record<Tab, { title: string }> = {
  perfil:         { title: "Caracterização da Rede"         },
  pessoal:        { title: "Pessoal e Gestão Escolar"       },
  tecnologia:     { title: "Tecnologia e Equipamentos"      },
  infraestrutura: { title: "Infraestrutura e Segurança"     },
  merenda:        { title: "Merenda Escolar"                },
  servicos:       { title: "Serviços Terceirizados"         },
  alunos:         { title: "Perfil dos Alunos e Resultados" },
  governanca:     { title: "Gestão Financeira e Governança" },
  operacional:    { title: "Operacional"                    },
  census:         { title: "Todos os Censos"                },
  dre:            { title: "Por DRE"                        },
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
      { label: "Dimensão e Perfil da Rede",              anchor: "sec-perfil-dimensao" },
      { label: "Organização da Oferta e Funcionamento",  anchor: "sec-perfil-oferta"   },
      { label: "Infraestrutura Educacional",             anchor: "sec-perfil-infra"    },
    ],
  },
  {
    id: "pessoal", label: "Pessoal e Gestão Escolar", Icon: UsersRound,
    subItems: [
      { label: "Estrutura de Gestão Escolar", anchor: "sec-pessoal-estrutura"   },
      { label: "Coordenação Pedagógica",      anchor: "sec-pessoal-coordenacao" },
      { label: "Quadro de Pessoal",           anchor: "sec-pessoal-quadro"      },
    ],
  },
  {
    id: "tecnologia", label: "Tecnologia e Equipamentos", Icon: MonitorSmartphone,
    subItems: [
      { label: "Infraestrutura Digital", anchor: "sec-tecnologia-digital"    },
      { label: "Parque Tecnológico",     anchor: "sec-tecnologia-parque"     },
      { label: "Uso Pedagógico",         anchor: "sec-tecnologia-pedagogico" },
    ],
  },
  {
    id: "infraestrutura", label: "Infraestrutura e Segurança", Icon: ShieldCheck,
    subItems: [
      { label: "Condições Estruturais e Ambientes",       anchor: "sec-infra-condicoes" },
      { label: "Energia, Climatização e Cap. Elétrica",   anchor: "sec-infra-energia"   },
      { label: "Segurança Física e Patrimonial",          anchor: "sec-infra-seguranca" },
    ],
  },
  {
    id: "merenda", label: "Merenda Escolar", Icon: Utensils,
    subItems: [
      { label: "Oferta e Adequação da Merenda", anchor: "sec-merenda-oferta"       },
      { label: "Estrutura Física",              anchor: "sec-merenda-estrutura"    },
      { label: "Equipamentos da Merenda",       anchor: "sec-merenda-equipamentos" },
      { label: "Recursos Humanos",              anchor: "sec-merenda-rh"           },
    ],
  },
  {
    id: "servicos", label: "Serviços Terceirizados", Icon: ClipboardCheck,
    subItems: [
      { label: "Visão Geral",             anchor: "sec-servicos-visao"       },
      { label: "Serviços Gerais",         anchor: "sec-servicos-gerais"      },
      { label: "Portaria",                anchor: "sec-servicos-portaria"    },
      { label: "Governança / Supervisão", anchor: "sec-servicos-governanca"  },
    ],
  },
  { id: "alunos",     label: "Perfil dos Alunos e Resultados", Icon: Activity  },
  { id: "governanca", label: "Gestão Financeira e Governança", Icon: Landmark  },
];

const NAV_OPERACIONAL: NavItem[] = [
  { id: "operacional", label: "Operacional",    Icon: LayoutDashboard },
  { id: "census",      label: "Todos os Censos",Icon: Database        },
  { id: "dre",         label: "Por DRE",         Icon: MapPinned      },
];

function NavGroup({ items, active, onNav }: { items: NavItem[]; active: Tab; onNav: (id: Tab) => void }) {
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
        if (it.id !== active) onNav(it.id);
      }
    } else {
      onNav(it.id);
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
                  <div key={sub.anchor} className="ca-nav-subitem" onClick={() => scrollTo(sub.anchor)}>
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
  const [dbData,         setDbData]         = useState<DashboardData | null>(null);
  const [censusPage,     setCensusPage]     = useState<CensusPage | null>(null);
  const [tab,            setTab]            = useState<Tab>("perfil");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [filterDre,      setFilterDre]      = useState("");
  const [search,         setSearch]         = useState("");
  const [err,            setErr]            = useState("");
  const [loading,        setLoading]        = useState(true);
  const [syncing,        setSyncing]        = useState(false);
  const [viewId,         setViewId]         = useState<number | null>(null);
  const [collapsed,      setCollapsed]      = useState(false);
  const [visited,        setVisited]        = useState<Set<Tab>>(() => new Set<Tab>(["perfil"]));
  const [censusLimit,    setCensusLimit]    = useState(10);
  const [censusPageNum,  setCensusPageNum]  = useState(1);
  const [mobileNavOpen,  setMobileNavOpen]  = useState(false);

  const logout = useCallback(() => { clearToken(); clearApiCache(); onLogout(); }, [onLogout]);

  const loadDb = useCallback(async () => {
    try {
      setDbData(await apiFetch<DashboardData>("/v1/admin/dashboard", token));
    } catch (e) {
      if ((e as Error).message === "UNAUTHORIZED") { logout(); return; }
      setErr("Erro ao carregar painel operacional.");
    } finally { setLoading(false); }
  }, [token, logout]);

  const loadCensus = useCallback(async (limit = censusLimit, page = censusPageNum) => {
    const p = new URLSearchParams();
    if (filterStatus) p.set("status", filterStatus);
    if (filterDre)    p.set("dre", filterDre);
    p.set("limit", String(limit));
    p.set("page",  String(page));
    try { setCensusPage(await apiFetch<CensusPage>(`/v1/admin/census?${p}`, token)); }
    catch (e) { if ((e as Error).message === "UNAUTHORIZED") logout(); }
  }, [token, filterStatus, filterDre, censusLimit, censusPageNum, logout]);

  useEffect(() => { loadDb(); }, [loadDb]);
  useEffect(() => { if (tab === "census") loadCensus(); }, [tab, filterStatus, filterDre, censusLimit, censusPageNum, loadCensus]);


  async function handleSync() {
    setSyncing(true);
    try {
      const res  = await fetch(`${API}/v1/admin/sync-sheets`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      alert(json.message ?? "Sync concluído.");
      loadDb();
    } catch { alert("Erro ao sincronizar."); }
    finally { setSyncing(false); }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit" });

  const match = (r: CensusRow, q: string) => {
    const l = q.toLowerCase();
    return r.nome_escola.toLowerCase().includes(l) || r.codigo_inep.includes(l) ||
           r.municipio.toLowerCase().includes(l)   || r.dre.toLowerCase().includes(l);
  };

  const filteredRecent  = (dbData?.recent ?? []).filter((r) => !search || match(r, search));
  const filteredCensus  = (censusPage?.rows ?? []).filter((r) => !search || match(r, search));

  const handleNav = (id: Tab) => { setTab(id); setSearch(""); setVisited((prev) => new Set([...prev, id])); setMobileNavOpen(false); };

  if (loading) return (
    <div className="censo-admin" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 className="animate-spin" size={32} style={{ color: C.primary }} />
    </div>
  );

  return (
    <div className="censo-admin">
      <div className={`ca-app${collapsed ? " collapsed" : ""}${mobileNavOpen ? " nav-open" : ""}`}>

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
            <NavGroup items={NAV_INDICATORS} active={tab} onNav={handleNav} />
          </div>

          <div className="ca-nav-group">
            <div className="ca-nav-group-label">Operacional</div>
            <NavGroup items={NAV_OPERACIONAL} active={tab} onNav={handleNav} />
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
              <div className="ca-search">
                <Search size={14} />
                <input
                  placeholder="Buscar indicadores, escolas, DREs…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>⌘ /</kbd>
              </div>
              <button
                className="ca-icon-btn"
                title={syncing ? "Sincronizando…" : "Sync Planilha"}
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing
                  ? <Loader2 size={16} className="animate-spin" />
                  : <CloudUpload size={16} />}
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
{/* Renderiza todas as abas já visitadas. Quando volta para uma aba os dados já são carregados*/}
            {visited.has("perfil") && (
              <div style={{ display: tab === "perfil" ? undefined : "none" }}>
                <AbaCaracterizacao token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("pessoal") && (
              <div style={{ display: tab === "pessoal" ? undefined : "none" }}>
                <AbaPessoalGestao token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("tecnologia") && (
              <div style={{ display: tab === "tecnologia" ? undefined : "none" }}>
                <AbaTecnologia token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("infraestrutura") && (
              <div style={{ display: tab === "infraestrutura" ? undefined : "none" }}>
                <AbaInfraestruturaSeguranca token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("merenda") && (
              <div style={{ display: tab === "merenda" ? undefined : "none" }}>
                <AbaMerenda token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("servicos") && (
              <div style={{ display: tab === "servicos" ? undefined : "none" }}>
                <AbaServicosTerceirizados token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("alunos") && (
              <div style={{ display: tab === "alunos" ? undefined : "none" }}>
                <AbaPerfilAlunos token={token} onUnauth={logout} />
              </div>
            )}
            {visited.has("governanca") && (
              <div style={{ display: tab === "governanca" ? undefined : "none" }}>
                <AbaGestaoFinanceiraGovernanca />
              </div>
            )}

            {tab === "operacional" && dbData && (
              <AbaOperacional
                dbData={dbData}
                search={search}
                setSearch={setSearch}
                filteredRecent={filteredRecent}
                onView={setViewId}
                formatDate={fmtDate}
              />
            )}

            {tab === "census" && (
              <AbaTodosCensos
                dbData={dbData}
                censusPage={censusPage}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                filterDre={filterDre}
                setFilterDre={setFilterDre}
                search={search}
                setSearch={setSearch}
                filteredCensus={filteredCensus}
                censusLimit={censusLimit}
                setCensusLimit={(l) => { setCensusLimit(l); setCensusPageNum(1); }}
                censusPageNum={censusPageNum}
                setCensusPageNum={setCensusPageNum}
                onView={setViewId}
                formatDate={fmtDate}
              />
            )}

            {tab === "dre" && dbData && (
              <AbaPorDre dbData={dbData} />
            )}
          </div>

          {/* Partners footer */}
          <footer className="ca-partners-strip">
            <img src="/parceiros.png" alt="FADEP · Secretaria de Educação · Governo do Pará" />
          </footer>
        </main>

      </div>

      {viewId !== null && (
        <JsonModal censusId={viewId} token={token} onClose={() => setViewId(null)} />
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
