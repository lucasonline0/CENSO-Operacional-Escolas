"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  LogOut, Search, RefreshCw, CloudUpload, Lock, User as UserIcon,
  AlertCircle, Loader2, PanelLeftClose,
  BarChart2, UsersRound, MonitorSmartphone, ShieldCheck, Utensils,
  ClipboardCheck, Activity, Landmark, LayoutDashboard, Database, MapPinned,
} from "lucide-react";

import "./admin.css";

import { API, C } from "@/components/admin/shared/constants";
import {
  apiFetch, saveToken, loadToken, clearToken, sanitize,
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
  CensusRow, DashboardData,
} from "@/components/admin/shared/types";

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (t: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [attempts, setAttempts] = useState(0);
  const blocked = attempts >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    setError(""); setLoading(true);
    const u = sanitize(username).slice(0, 64);
    const p = sanitize(password).slice(0, 128);
    if (!u || !p) { setError("Preencha usuário e senha."); setLoading(false); return; }
    try {
      const res  = await fetch(`${API}/v1/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const json = await res.json();
      if (!res.ok) { setAttempts((a) => a + 1); setError(json.message ?? "Credenciais inválidas."); return; }
      const token = (json.data as { token: string }).token;
      saveToken(token); onLogin(token);
    } catch { setError("Não foi possível conectar ao servidor."); }
    finally   { setLoading(false); }
  }

  return (
    <div className="censo-admin login-shell">
      <div className="ca-login-card">
        <div className="ca-login-head">
          <div className="ca-login-mark">
            <img src="/brasao-para.png" alt="Brasão do Estado do Pará" />
          </div>
          <div className="ca-login-title">Censo Operacional</div>
          <div className="ca-login-sub">Painel Administrativo · SEDUC‑PA · FADEP</div>
        </div>

        <form onSubmit={submit} className="ca-login-body" noValidate>
          <div className="ca-field">
            <label htmlFor="u">Usuário</label>
            <div className="ca-input-wrap">
              <UserIcon size={15} className="ca-input-icon" />
              <input
                id="u" type="text" autoComplete="username" maxLength={64}
                disabled={loading || blocked} value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuário" required
              />
            </div>
          </div>

          <div className="ca-field">
            <label htmlFor="pw">Senha</label>
            <div className="ca-input-wrap">
              <Lock size={15} className="ca-input-icon" />
              <input
                id="pw" type="password" autoComplete="current-password" maxLength={128}
                disabled={loading || blocked} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha" required
              />
            </div>
          </div>

          {error   && (
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
            {loading ? <><Loader2 size={15} className="animate-spin" />Autenticando…</> : "Entrar"}
          </button>

          <p className="ca-login-note">Acesso restrito. Sessão expira em 2 horas.</p>
        </form>
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

type NavItem = {
  id: Tab;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

const NAV_INDICATORS: NavItem[] = [
  { id: "perfil",         label: "Caracterização da Rede",         Icon: BarChart2         },
  { id: "pessoal",        label: "Pessoal e Gestão Escolar",       Icon: UsersRound        },
  { id: "tecnologia",     label: "Tecnologia e Equipamentos",      Icon: MonitorSmartphone },
  { id: "infraestrutura", label: "Infraestrutura e Segurança",     Icon: ShieldCheck       },
  { id: "merenda",        label: "Merenda Escolar",                Icon: Utensils          },
  { id: "servicos",       label: "Serviços Terceirizados",         Icon: ClipboardCheck    },
  { id: "alunos",         label: "Perfil dos Alunos e Resultados", Icon: Activity          },
  { id: "governanca",     label: "Gestão Financeira e Governança", Icon: Landmark          },
];

const NAV_OPERACIONAL: NavItem[] = [
  { id: "operacional", label: "Operacional",    Icon: LayoutDashboard },
  { id: "census",      label: "Todos os Censos",Icon: Database        },
  { id: "dre",         label: "Por DRE",         Icon: MapPinned      },
];

function NavGroup({ items, active, onNav }: { items: NavItem[]; active: Tab; onNav: (id: Tab) => void }) {
  return (
    <>
      {items.map((it) => (
        <div
          key={it.id}
          className={`ca-nav-item${active === it.id ? " active" : ""}`}
          onClick={() => onNav(it.id)}
        >
          <it.Icon size={17} strokeWidth={1.6} className="ca-icon" />
          <span>{it.label}</span>
        </div>
      ))}
    </>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [dbData,       setDbData]       = useState<DashboardData | null>(null);
  const [allCensus,    setAllCensus]    = useState<CensusRow[] | null>(null);
  const [tab,          setTab]          = useState<Tab>("perfil");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDre,    setFilterDre]    = useState("");
  const [search,       setSearch]       = useState("");
  const [err,          setErr]          = useState("");
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [viewId,       setViewId]       = useState<number | null>(null);
  const [collapsed,    setCollapsed]    = useState(false);

  const logout = useCallback(() => { clearToken(); onLogout(); }, [onLogout]);

  const loadDb = useCallback(async () => {
    try {
      setDbData(await apiFetch<DashboardData>("/v1/admin/dashboard", token));
    } catch (e) {
      if ((e as Error).message === "UNAUTHORIZED") { logout(); return; }
      setErr("Erro ao carregar painel operacional.");
    } finally { setLoading(false); }
  }, [token, logout]);

  const loadCensus = useCallback(async () => {
    const p = new URLSearchParams();
    if (filterStatus) p.set("status", filterStatus);
    if (filterDre)    p.set("dre", filterDre);
    try { setAllCensus(await apiFetch<CensusRow[]>(`/v1/admin/census?${p}`, token)); }
    catch (e) { if ((e as Error).message === "UNAUTHORIZED") logout(); }
  }, [token, filterStatus, filterDre, logout]);

  useEffect(() => { loadDb(); }, [loadDb]);
  useEffect(() => { if (tab === "census") loadCensus(); }, [tab, filterStatus, filterDre, loadCensus]);

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

  const filteredRecent  = (dbData?.recent  ?? []).filter((r) => !search || match(r, search));
  const filteredCensus  = (allCensus       ?? []).filter((r) => !search || match(r, search));

  const handleNav = (id: Tab) => { setTab(id); setSearch(""); };

  if (loading) return (
    <div className="censo-admin" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 className="animate-spin" size={32} style={{ color: C.primary }} />
    </div>
  );

  return (
    <div className="censo-admin">
      <div className={`ca-app${collapsed ? " collapsed" : ""}`}>

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
            <div className="ca-crumbs">
              <span>Painel SEDUC</span>
              <span className="sep">/</span>
              <span className="cur">{PAGE_META[tab].title}</span>
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
          <div className="admin-page" key={tab}>
            {err && (
              <div className="ca-error-note">
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                {err}
              </div>
            )}

            {tab === "perfil"         && <AbaCaracterizacao token={token} onUnauth={logout} />}
            {tab === "pessoal"        && <AbaPessoalGestao />}
            {tab === "tecnologia"     && <AbaTecnologia />}
            {tab === "infraestrutura" && <AbaInfraestruturaSeguranca token={token} onUnauth={logout} />}
            {tab === "merenda"        && <AbaMerenda token={token} onUnauth={logout} />}
            {tab === "servicos"       && <AbaServicosTerceirizados />}
            {tab === "alunos"         && <AbaPerfilAlunos token={token} onUnauth={logout} />}
            {tab === "governanca"     && <AbaGestaoFinanceiraGovernanca />}

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
                allCensus={allCensus}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                filterDre={filterDre}
                setFilterDre={setFilterDre}
                search={search}
                setSearch={setSearch}
                filteredCensus={filteredCensus}
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
