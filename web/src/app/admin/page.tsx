"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Building2, LogOut,
  LayoutDashboard, Database, MapPinned, Lock, User as UserIcon,
  AlertCircle, Loader2, CloudUpload,
  BarChart2, Activity,
  UsersRound, MonitorSmartphone, ShieldCheck, Utensils, ClipboardCheck,
} from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${C.primary} 0%, #0F3A5C 100%)` }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-8 py-7 text-center" style={{ background: C.primaryLight }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 text-white shadow-lg" style={{ background: C.primary }}>
            <Building2 size={30} strokeWidth={1.75} />
          </div>
          <h1 className="font-bold text-xl text-slate-800">CENSO Operacional das Escolas</h1>
          <p className="text-slate-600 text-sm mt-1">Painel Administrativo — SEDUC-PA · FADEP</p>
        </div>
        <form onSubmit={submit} className="px-8 py-7 space-y-4" noValidate>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="u">Usuário</label>
            <div className="relative">
              <UserIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="u" type="text" autoComplete="username" maxLength={64} disabled={loading||blocked} value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" placeholder="Usuário" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="pw">Senha</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="pw" type="password" autoComplete="current-password" maxLength={128} disabled={loading||blocked} value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" placeholder="Senha" required />
            </div>
          </div>
          {error   && <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm"><AlertCircle size={15} className="shrink-0 mt-0.5" />{error}</div>}
          {blocked && <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm"><AlertCircle size={15} className="shrink-0 mt-0.5" />Muitas tentativas. Aguarde alguns minutos.</div>}
          <button type="submit" disabled={loading||blocked}
            className="w-full text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:opacity-90 transition-opacity"
            style={{ background: C.primary }}>
            {loading ? <><Loader2 size={15} className="animate-spin" />Autenticando…</> : "Entrar"}
          </button>
          <p className="text-center text-xs text-slate-400">Acesso restrito. Sessão expira em 2 horas.</p>
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
  | "operacional"
  | "census"
  | "dre";

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

  const tabs: { id: Tab; label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: "perfil",         label: "Caracterização da Rede",         Icon: BarChart2          },
    { id: "pessoal",        label: "Pessoal e Gestão Escolar",       Icon: UsersRound         },
    { id: "tecnologia",     label: "Tecnologia e Equipamentos",      Icon: MonitorSmartphone  },
    { id: "infraestrutura", label: "Infraestrutura e Segurança",     Icon: ShieldCheck        },
    { id: "merenda",        label: "Merenda Escolar",                Icon: Utensils           },
    { id: "servicos",       label: "Serviços Terceirizados",         Icon: ClipboardCheck     },
    { id: "alunos",         label: "Perfil dos Alunos e Resultados", Icon: Activity           },
    { id: "operacional",    label: "Operacional",                    Icon: LayoutDashboard    },
    { id: "census",         label: "Todos os Censos",                Icon: Database           },
    { id: "dre",            label: "Por DRE",                        Icon: MapPinned          },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.pageBg }}>
      <Loader2 className="animate-spin" size={32} style={{ color: C.primary }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: C.pageBg }}>
      {/* Banner SEDUC */}
      <header className="shadow-sm sticky top-0 z-30" style={{ background: C.primaryLight }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: C.primary }}>
              <Building2 size={25} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-800 leading-tight">CENSO Operacional das Escolas</h1>
              <p className="text-xs text-slate-600">Painel Administrativo — SEDUC-PA · FADEP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: C.primary }}>
              {syncing ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              {syncing ? "Sincronizando…" : "Sync Planilha"}
            </button>
            <button onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-colors">
              <LogOut size={15} /> Sair
            </button>
          </div>
        </div>
        {/* Tab nav — estilo Looker Studio */}
        <div className="max-w-7xl mx-auto px-6 pb-0 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch(""); }}
                className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-blue-800 text-blue-900 bg-white/40"
                    : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-white/20"
                }`}>
                <t.Icon size={15} strokeWidth={2} /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-7 space-y-6">
        {err && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {err}
          </div>
        )}

        {/* ── Caracterização da Rede ────────────────────────────── */}
        {tab === "perfil" && (
          <AbaCaracterizacao token={token} onUnauth={logout} />
        )}

        {/* ── Placeholders das 5 novas abas ───────────────────────── */}
        {tab === "pessoal"        && <AbaPessoalGestao />}
        {tab === "tecnologia"     && <AbaTecnologia />}
        {tab === "infraestrutura" && <AbaInfraestruturaSeguranca />}
        {tab === "merenda"        && <AbaMerenda />}
        {tab === "servicos"       && <AbaServicosTerceirizados />}

        {/* ── Perfil dos Alunos e Resultados ───────────────────── */}
        {tab === "alunos" && (
          <AbaPerfilAlunos token={token} onUnauth={logout} />
        )}

        {/* ── Operacional (DB stats + envios recentes) ───────────── */}
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

        {/* ── Todos os Censos ────────────────────────────────────── */}
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

        {/* ── Por DRE (DB) ───────────────────────────────────────── */}
        {tab === "dre" && dbData && (
          <AbaPorDre dbData={dbData} />
        )}
      </main>

      <footer className="text-center py-5 text-xs text-slate-400 border-t border-slate-200 mt-6">
        CENSO Operacional — SEDUC-PA · Painel restrito a administradores autorizados
      </footer>

      {viewId !== null && <JsonModal censusId={viewId} token={token} onClose={() => setViewId(null)} />}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  // Estado conjunto evita dois setState's no mesmo efeito e mantém o
  // padrão de "client-only restore" (renderiza null em SSR e no primeiro
  // paint do cliente para não dar mismatch de hidratação; só depois lê
  // o sessionStorage). useSyncExternalStore não cabe aqui porque o
  // evento "storage" não dispara para escritas same-window, então a
  // restauração inicial precisa rodar dentro de useEffect.
  const [auth, setAuth] = useState<{ token: string | null; ready: boolean }>({ token: null, ready: false });
  useEffect(() => {
    // Restauração client-only do token em sessionStorage (ver comentário acima).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuth({ token: loadToken(), ready: true });
  }, []);
  if (!auth.ready) return null;
  if (!auth.token) return <LoginForm onLogin={(t) => setAuth({ token: t, ready: true })} />;
  return <Dashboard token={auth.token} onLogout={() => setAuth({ token: null, ready: true })} />;
}
