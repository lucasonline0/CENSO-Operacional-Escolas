"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  UserPlus,
  UsersRound,
  UserX,
} from "lucide-react";
import { fetchAdminUsers, fetchDREs, updateAdminUserStatus, updateDRE } from "./shared/api";
import { AdminToast, type AdminToastData } from "./shared/AdminToast";
import { CredentialsSuccessModal } from "./shared/CredentialsSuccessModal";
import { DreFormModal } from "./shared/DreFormModal";
import { QuickStatusToggle } from "./shared/QuickStatusToggle";
import { ResetPasswordModal } from "./shared/ResetPasswordModal";
import { StatCard } from "./shared/StatCard";
import { UserFormModal } from "./shared/UserFormModal";
import { C } from "./shared/constants";
import { copyToClipboard } from "./shared/credentialsUtils";
import type { AdminUserItem, DREItem } from "./shared/types";

interface AbaGestaoDresProps {
  token: string;
  onUnauth: () => void;
  onDataChanged?: () => void;
}

type StatusFilter = "all" | "active" | "inactive";

type CredentialsState = {
  title: string;
  subtitle: string;
  username: string;
  password?: string;
  dre: string;
};

export function AbaGestaoDres({ token, onUnauth, onDataChanged }: AbaGestaoDresProps) {
  const [dres, setDres] = useState<DREItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedDres, setExpandedDres] = useState<Set<number>>(new Set());

  const [isDreModalOpen, setIsDreModalOpen] = useState(false);
  const [dreToEdit, setDreToEdit] = useState<DREItem | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [preselectedDreIdForUser, setPreselectedDreIdForUser] = useState<number | null>(null);
  const [userToResetPass, setUserToResetPass] = useState<AdminUserItem | null>(null);
  const [credentialsModal, setCredentialsModal] = useState<CredentialsState | null>(null);
  const [toast, setToast] = useState<AdminToastData | null>(null);

  const [togglingDreId, setTogglingDreId] = useState<number | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  const showToast = useCallback((message: string, type: AdminToastData["type"] = "success") => {
    setToast({ message, type });
  }, []);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [dreData, userData] = await Promise.all([fetchDREs(token), fetchAdminUsers(token)]);
      setDres(dreData);
      setUsers(userData);
    } catch (requestError: unknown) {
      const message = (requestError as Error).message;
      if (message === "UNAUTHORIZED") {
        onUnauth();
        return;
      }
      setError(message || "Erro ao carregar DREs e usuários regionais.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onUnauth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const regionalUsers = useMemo(
    () => users.filter((user) => user.role === "dre" && user.dre_id != null),
    [users],
  );

  const usersByDreMap = useMemo(() => {
    const map = new Map<number, AdminUserItem[]>();
    for (const user of regionalUsers) {
      if (user.dre_id == null) continue;
      const current = map.get(user.dre_id) ?? [];
      current.push(user);
      map.set(user.dre_id, current);
    }
    return map;
  }, [regionalUsers]);

  const stats = useMemo(() => {
    const activeDres = dres.filter((dre) => dre.ativa).length;
    const activeUsers = regionalUsers.filter((user) => user.active).length;
    const dresComUsuarios = dres.filter((dre) => (usersByDreMap.get(dre.id)?.length ?? 0) > 0).length;
    return {
      totalDres: dres.length,
      activeDres,
      inactiveDres: dres.length - activeDres,
      totalUsers: regionalUsers.length,
      activeUsers,
      inactiveUsers: regionalUsers.length - activeUsers,
      dresComUsuarios,
      dresSemUsuarios: dres.length - dresComUsuarios,
    };
  }, [dres, regionalUsers, usersByDreMap]);

  const hasActiveDres = useMemo(() => dres.some((dre) => dre.ativa), [dres]);

  const filteredDres = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dres.filter((dre) => {
      if (statusFilter === "active" && !dre.ativa) return false;
      if (statusFilter === "inactive" && dre.ativa) return false;
      if (!query) return true;

      const ownFields = [dre.nome, dre.sigla, dre.municipio_sede, dre.polo, dre.gestor_nome, dre.email, dre.telefone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
      if (ownFields) return true;
      return (usersByDreMap.get(dre.id) ?? []).some((user) => user.username.toLowerCase().includes(query));
    });
  }, [dres, search, statusFilter, usersByDreMap]);

  function toggleExpand(dreId: number) {
    setExpandedDres((current) => {
      const next = new Set(current);
      if (next.has(dreId)) next.delete(dreId);
      else next.add(dreId);
      return next;
    });
  }

  function handleExpandAll() {
    const allVisibleIds = filteredDres.map((dre) => dre.id);
    const allExpanded = allVisibleIds.length > 0 && allVisibleIds.every((id) => expandedDres.has(id));
    setExpandedDres(allExpanded ? new Set() : new Set(allVisibleIds));
  }

  async function handleToggleDreStatus(dre: DREItem, nextActive: boolean) {
    setTogglingDreId(dre.id);
    setDres((current) => current.map((item) => item.id === dre.id ? { ...item, ativa: nextActive } : item));
    try {
      const updated = await updateDRE(token, dre.id, { ...dre, ativa: nextActive });
      setDres((current) => current.map((item) => item.id === dre.id ? updated : item));
      onDataChanged?.();
      showToast(`${dre.nome} ${nextActive ? "ativada" : "inativada"} com sucesso.`);
    } catch (requestError: unknown) {
      const message = (requestError as Error).message;
      setDres((current) => current.map((item) => item.id === dre.id ? { ...item, ativa: !nextActive } : item));
      if (message === "UNAUTHORIZED") onUnauth();
      else showToast(message || "Erro ao atualizar o status da DRE.", "error");
    } finally {
      setTogglingDreId(null);
    }
  }

  async function handleToggleUserStatus(user: AdminUserItem, nextActive: boolean) {
    setTogglingUserId(user.id);
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, active: nextActive } : item));
    try {
      const updated = await updateAdminUserStatus(token, user.id, nextActive);
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
      onDataChanged?.();
      showToast(`Usuário ${user.username} ${nextActive ? "ativado" : "desativado"} com sucesso.`);
    } catch (requestError: unknown) {
      const message = (requestError as Error).message;
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, active: !nextActive } : item));
      if (message === "UNAUTHORIZED") onUnauth();
      else showToast(message || "Erro ao atualizar o usuário.", "error");
    } finally {
      setTogglingUserId(null);
    }
  }

  function openNewDre() {
    setDreToEdit(null);
    setIsDreModalOpen(true);
  }

  function openEditDre(dre: DREItem, event: React.MouseEvent) {
    event.stopPropagation();
    setDreToEdit(dre);
    setIsDreModalOpen(true);
  }

  function openNewUser(dreId?: number, event?: React.MouseEvent) {
    event?.stopPropagation();
    setPreselectedDreIdForUser(dreId ?? null);
    setIsUserModalOpen(true);
  }

  function handleDreSuccess(savedDre: DREItem) {
    setIsDreModalOpen(false);
    if (dreToEdit && dreToEdit.nome !== savedDre.nome) {
      setUsers((current) => current.map((user) => user.dre_id === savedDre.id ? { ...user, dre: savedDre.nome } : user));
    }
    setDres((current) => {
      const exists = current.some((dre) => dre.id === savedDre.id);
      return exists ? current.map((dre) => dre.id === savedDre.id ? savedDre : dre) : [savedDre, ...current];
    });
    onDataChanged?.();
    showToast(`DRE “${savedDre.nome}” ${dreToEdit ? "atualizada" : "cadastrada"} com sucesso.`);
  }

  function handleUserSuccess(createdUser: AdminUserItem, password: string) {
    setIsUserModalOpen(false);
    setUsers((current) => [createdUser, ...current]);
    if (createdUser.dre_id != null) {
      setExpandedDres((current) => new Set(current).add(createdUser.dre_id!));
    }
    onDataChanged?.();
    setCredentialsModal({
      title: "Novo usuário cadastrado",
      subtitle: `A conta regional de ${createdUser.dre} foi criada com sucesso.`,
      username: createdUser.username,
      password,
      dre: createdUser.dre,
    });
  }

  function handleResetPasswordSuccess(user: AdminUserItem, newPassword: string) {
    setUserToResetPass(null);
    setCredentialsModal({
      title: "Senha redefinida com sucesso",
      subtitle: `A nova senha de ${user.username} já está ativa no sistema.`,
      username: user.username,
      password: newPassword,
      dre: user.dre,
    });
  }

  function formatDate(value?: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const allVisibleExpanded = filteredDres.length > 0 && filteredDres.every((dre) => expandedDres.has(dre.id));

  return (
    <div className="space-y-6">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 size={17} style={{ color: C.primary }} />
            <h2 className="text-sm font-semibold text-slate-800">Administração regional</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Cadastre Diretorias Regionais de Ensino e gerencie as contas de acesso vinculadas a cada regional.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />Atualizar
          </button>
          <button
            type="button"
            onClick={() => openNewUser()}
            disabled={!hasActiveDres}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={!hasActiveDres ? "Cadastre ou ative uma DRE antes de criar usuários" : undefined}
          >
            <UserPlus size={14} />Novo usuário
          </button>
          <button
            type="button"
            onClick={openNewDre}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-white"
            style={{ background: C.primary }}
          >
            <Plus size={15} />Nova DRE
          </button>
        </div>
      </section>

      {!hasActiveDres && !loading && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>Nenhuma DRE está ativa. Ative uma regional antes de criar novos usuários.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-fade-in-up">
        <StatCard label="Total de DREs" value={stats.totalDres} sub={`${stats.activeDres} ativas · ${stats.inactiveDres} inativas`} Icon={Building2} tone="blue" />
        <StatCard label="Usuários Regionais" value={stats.totalUsers} sub={`${stats.activeUsers} ativos · ${stats.inactiveUsers} inativos`} Icon={UsersRound} tone="green" />
        <StatCard label="DREs com Acesso" value={stats.dresComUsuarios} sub={`${Math.round((stats.dresComUsuarios / Math.max(1, stats.totalDres)) * 100)}% de cobertura`} Icon={ShieldCheck} tone="purple" />
        <StatCard label="DREs sem Usuário" value={stats.dresSemUsuarios} sub={stats.dresSemUsuarios > 0 ? "Pendente criação de login" : "Todas possuem login"} Icon={UserX} tone={stats.dresSemUsuarios > 0 ? "amber" : "blue"} />
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-slate-700">Filtros:</span>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">Todas as DREs ({dres.length})</option>
          <option value="active">Ativas ({stats.activeDres})</option>
          <option value="inactive">Inativas ({stats.inactiveDres})</option>
        </select>

        {filteredDres.length > 0 && (
          <button type="button" onClick={handleExpandAll} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
            {allVisibleExpanded ? "Recolher todas" : "Expandir todas"}
          </button>
        )}

        <div className="relative ml-auto w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar DRE, município ou usuário…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</span>
          <button type="button" onClick={() => loadData()} className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-100">Tentar novamente</button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3" style={{ background: C.primaryLight }}>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Diretorias Regionais de Ensino</h2>
            <p className="mt-0.5 text-xs text-slate-500">{filteredDres.length} de {dres.length} regionais no recorte atual</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400"><Loader2 size={22} className="mx-auto mb-2 animate-spin" style={{ color: C.primary }} />Carregando DREs e usuários…</div>
        ) : filteredDres.length === 0 ? (
          <div className="px-6 py-16 text-center"><Building2 size={30} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-medium text-slate-600">Nenhuma DRE encontrada.</p><p className="mt-1 text-xs text-slate-400">Ajuste os filtros ou limpe a busca.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full">
              <thead>
                <tr>
                  <th className="w-12 text-center" aria-label="Expandir" />
                  <th>Diretoria Regional</th>
                  <th>Município / Polo</th>
                  <th>Gestor e Contato</th>
                  <th className="text-center">Acessos</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredDres.map((dre) => {
                  const linkedUsers = usersByDreMap.get(dre.id) ?? [];
                  const activeLinkedUsers = linkedUsers.filter((user) => user.active).length;
                  const isExpanded = expandedDres.has(dre.id);
                  return (
                    <React.Fragment key={dre.id}>
                      <tr onClick={() => toggleExpand(dre.id)} className={`cursor-pointer ${!dre.ativa ? "opacity-70" : ""}`}>
                        <td className="text-center">
                          <button type="button" onClick={(event) => { event.stopPropagation(); toggleExpand(dre.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={isExpanded ? "Recolher usuários" : "Expandir usuários"}>{isExpanded ? <ChevronDown size={16} style={{ color: C.primary }} /> : <ChevronRight size={16} />}</button>
                        </td>
                        <td>
                          <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{dre.nome}</span>{dre.sigla && <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-500">{dre.sigla}</span>}</div>
                        </td>
                        <td>
                          <p className="font-medium text-slate-700">{dre.municipio_sede || "—"}</p>
                          {dre.polo && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{dre.polo}</p>}
                        </td>
                        <td>
                          <div className="max-w-xs space-y-1">
                            {dre.gestor_nome && <p className="flex items-center gap-1.5 font-medium text-slate-700"><User size={13} className="text-slate-400" />{dre.gestor_nome}</p>}
                            {dre.email && <p className="flex items-center gap-1.5 truncate text-xs text-slate-500" title={dre.email}><Mail size={12} className="shrink-0" />{dre.email}</p>}
                            {dre.telefone && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Phone size={12} />{dre.telefone}</p>}
                            {!dre.gestor_nome && !dre.email && !dre.telefone && <span className="text-xs text-slate-400">Sem contato cadastrado</span>}
                          </div>
                        </td>
                        <td className="text-center">
                          {linkedUsers.length > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"><UsersRound size={12} />{linkedUsers.length} {linkedUsers.length === 1 ? "usuário" : "usuários"}{activeLinkedUsers !== linkedUsers.length && <span className="text-slate-400">· {activeLinkedUsers} ativos</span>}</span> : <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">Sem usuário</span>}
                        </td>
                        <td className="text-center"><QuickStatusToggle checked={dre.ativa} loading={togglingDreId === dre.id} onChange={(next) => handleToggleDreStatus(dre, next)} activeLabel="Ativa" inactiveLabel="Inativa" size="sm" /></td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={(event) => openNewUser(dre.id, event)} disabled={!dre.ativa} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" title={dre.ativa ? "Adicionar usuário" : "Ative a DRE para adicionar usuário"}><UserPlus size={14} /></button>
                            <button type="button" onClick={(event) => openEditDre(dre, event)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Editar DRE"><Pencil size={14} /></button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="!p-0">
                            <div className="border-y border-slate-200 bg-slate-50 px-6 py-5">
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-slate-800">Usuários vinculados</h3>
                                  <p className="mt-0.5 text-xs text-slate-500">Contas com acesso restrito à {dre.nome}</p>
                                </div>
                                <button type="button" onClick={(event) => openNewUser(dre.id, event)} disabled={!dre.ativa} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"><UserPlus size={14} />Adicionar usuário</button>
                              </div>

                              {linkedUsers.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center"><UsersRound size={26} className="mx-auto mb-2 text-slate-300" /><p className="text-sm font-medium text-slate-600">Nenhum usuário cadastrado para esta DRE.</p></div>
                              ) : (
                                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                  <table className="w-full min-w-[720px]">
                                    <thead><tr><th>Usuário</th><th>Perfil</th><th>Cadastro</th><th className="text-center">Acesso</th><th className="text-right">Ações</th></tr></thead>
                                    <tbody>
                                      {linkedUsers.map((user) => (
                                        <tr key={user.id} className={!user.active ? "opacity-60" : ""}>
                                          <td>
                                            <div className="flex items-center gap-2"><span className="font-mono font-semibold text-slate-800">{user.username}</span><button type="button" onClick={async () => { if (await copyToClipboard(user.username)) showToast(`Usuário “${user.username}” copiado.`); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copiar usuário"><Copy size={13} /></button></div>
                                          </td>
                                          <td><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600"><ShieldCheck size={11} />DRE</span></td>
                                          <td className="text-xs text-slate-500">{formatDate(user.created_at)}</td>
                                          <td className="text-center"><QuickStatusToggle checked={user.active} loading={togglingUserId === user.id} onChange={(next) => handleToggleUserStatus(user, next)} activeLabel="Ativo" inactiveLabel="Inativo" size="sm" /></td>
                                          <td className="text-right"><button type="button" onClick={(event) => { event.stopPropagation(); setUserToResetPass(user); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><KeyRound size={13} />Redefinir senha</button></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DreFormModal isOpen={isDreModalOpen} onClose={() => setIsDreModalOpen(false)} onSuccess={handleDreSuccess} token={token} dreToEdit={dreToEdit} />
      <UserFormModal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} onSuccess={handleUserSuccess} token={token} dres={dres} preselectedDreId={preselectedDreIdForUser} />
      <ResetPasswordModal isOpen={Boolean(userToResetPass)} onClose={() => setUserToResetPass(null)} onSuccess={handleResetPasswordSuccess} token={token} user={userToResetPass} />
      {credentialsModal && <CredentialsSuccessModal isOpen onClose={() => setCredentialsModal(null)} title={credentialsModal.title} subtitle={credentialsModal.subtitle} username={credentialsModal.username} password={credentialsModal.password} dre={credentialsModal.dre} />}
    </div>
  );
}
