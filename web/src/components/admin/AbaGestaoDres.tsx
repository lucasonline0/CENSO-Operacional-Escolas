"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
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
import type { AdminProfile, AdminUserItem, DREItem } from "./shared/types";

interface AbaGestaoDresProps {
  token: string;
  profile: AdminProfile;
  onUnauth: () => void;
  onDataChanged?: () => void;
}

type StatusFilter = "all" | "active" | "inactive";

type CredentialsState = {
  title: string;
  subtitle: string;
  username: string;
  email?: string;
  password?: string;
  dre: string;
};

export function AbaGestaoDres({ token, profile, onUnauth, onDataChanged }: AbaGestaoDresProps) {
  const hasCapability = (permission: string) =>
    profile.role === "admin" || profile.permissions?.includes(permission as never) === true;
  const canReadUsers = hasCapability("users.read");
  const canCreateUsers = hasCapability("users.create");
  const canManageUsers = hasCapability("users.manage");
  const canResetPasswords = hasCapability("users.reset_password");
  const canManageDres = hasCapability("dres.manage");
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
  const [userToViewAccess, setUserToViewAccess] = useState<AdminUserItem | null>(null);
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
      const [dreData, userData] = await Promise.all([
        (canManageDres || canCreateUsers || canReadUsers) ? fetchDREs(token) : Promise.resolve([] as DREItem[]),
        canReadUsers ? fetchAdminUsers(token) : Promise.resolve([] as AdminUserItem[]),
      ]);
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
  }, [token, onUnauth, canManageDres, canCreateUsers, canReadUsers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const regionalUsers = useMemo(
    () => users.filter((user) => user.role === "dre" && user.dre_id != null),
    [users],
  );

  const customUsers = useMemo(
    () => users.filter((user) => user.role === "custom"),
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
      return (usersByDreMap.get(dre.id) ?? []).some((user) => user.username.toLowerCase().includes(query) || user.email.toLowerCase().includes(query));
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
    if (!canManageDres) return;
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
    if (!canManageUsers) return;
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
    if (!canManageDres) return;
    setDreToEdit(null);
    setIsDreModalOpen(true);
  }

  function openEditDre(dre: DREItem, event: React.MouseEvent) {
    event.stopPropagation();
    if (!canManageDres) return;
    setDreToEdit(dre);
    setIsDreModalOpen(true);
  }

  function openNewUser(dreId?: number, event?: React.MouseEvent) {
    event?.stopPropagation();
    if (!canCreateUsers) return;
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
      subtitle: createdUser.role === "custom"
        ? "A conta personalizada foi criada com as permissões e o escopo selecionados."
        : `A conta regional de ${createdUser.dre} foi criada com sucesso.`,
      username: createdUser.username,
      email: createdUser.email,
      password,
      dre: createdUser.dre,
    });
  }

  function handleResetPasswordSuccess(user: AdminUserItem, newPassword: string) {
    setUserToResetPass(null);
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, must_change_password: true } : item));
    onDataChanged?.();
    setCredentialsModal({
      title: "Credencial temporária gerada",
      subtitle: `${user.email || user.username} deverá criar uma nova senha no próximo acesso.`,
      username: user.username,
      email: user.email,
      password: newPassword,
      dre: user.dre,
    });
  }

  function handleResetFromAccessViewer() {
    if (!userToViewAccess || !canResetPasswords) return;
    const selectedUser = userToViewAccess;
    setUserToViewAccess(null);
    setUserToResetPass(selectedUser);
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
          {canCreateUsers && (
            <button
              type="button"
              onClick={() => openNewUser()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <UserPlus size={14} />Nova conta
            </button>
          )}
          {canManageDres && (
            <button
              type="button"
              onClick={openNewDre}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-white"
              style={{ background: C.primary }}
            >
              <Plus size={15} />Nova DRE
            </button>
          )}
        </div>
      </section>

      {!hasActiveDres && !loading && canCreateUsers && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>Nenhuma DRE está disponível no seu escopo. Contas globais ainda podem ser criadas se sua conta puder delegar escopo global.</span>
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


      {canReadUsers && customUsers.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3" style={{ background: C.primaryLight }}>
            <h2 className="text-sm font-semibold text-slate-800">Acessos personalizados</h2>
            <p className="mt-0.5 text-xs text-slate-500">Contas globais ou com múltiplas DREs e permissões configuráveis.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr><th>Conta</th><th>Escopo</th><th>Cadastro</th><th className="text-center">Situação</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {customUsers.map((user) => (
                  <tr key={user.id}>
                    <td><p className="font-semibold text-slate-800">{user.email || user.username}</p><p className="font-mono text-xs text-slate-500">{user.username}</p></td>
                    <td><span className="text-xs font-semibold text-slate-600">{user.data_scope === "all" ? "Todas as DREs" : "DREs selecionadas"}</span></td>
                    <td className="text-xs text-slate-500">{formatDate(user.created_at)}</td>
                    <td className="text-center">
                      {canManageUsers ? (
                        <QuickStatusToggle checked={user.active} loading={togglingUserId === user.id} onChange={(next) => handleToggleUserStatus(user, next)} activeLabel="Ativo" inactiveLabel="Inativo" size="sm" />
                      ) : (
                        <span className="text-xs text-slate-500">{user.active ? "Ativo" : "Inativo"}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {canResetPasswords && <button type="button" onClick={() => setUserToResetPass(user)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><KeyRound size={13} />Redefinir senha</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
                        <td className="text-center">{canManageDres ? <QuickStatusToggle checked={dre.ativa} loading={togglingDreId === dre.id} onChange={(next) => handleToggleDreStatus(dre, next)} activeLabel="Ativa" inactiveLabel="Inativa" size="sm" /> : <span className="text-xs font-medium text-slate-500">{dre.ativa ? "Ativa" : "Inativa"}</span>}</td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                            {canCreateUsers && <button type="button" onClick={(event) => openNewUser(dre.id, event)} disabled={!dre.ativa} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" title={dre.ativa ? "Adicionar conta" : "DRE inativa"}><UserPlus size={14} /></button>}
                            {canManageDres && <button type="button" onClick={(event) => openEditDre(dre, event)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Editar DRE"><Pencil size={14} /></button>}
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
                                  <table className="w-full min-w-[760px]">
                                    <thead><tr><th>Conta</th><th>Perfil</th><th>Cadastro</th><th className="text-center">Situação</th><th className="text-right">Ações</th></tr></thead>
                                    <tbody>
                                      {linkedUsers.map((user) => (
                                        <tr key={user.id} className={!user.active ? "opacity-60" : ""}>
                                          <td>
                                            <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{user.email || "Sem e-mail (legado)"}</span>{user.email && <button type="button" onClick={async () => { if (await copyToClipboard(user.email)) showToast(`E-mail “${user.email}” copiado.`); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Copiar e-mail"><Copy size={13} /></button>}</div>
                                            <p className="mt-0.5 font-mono text-xs text-slate-500">Usuário legado: {user.username}</p>
                                          </td>
                                          <td><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600"><ShieldCheck size={11} />DRE</span></td>
                                          <td className="text-xs text-slate-500">{formatDate(user.created_at)}</td>
                                          <td className="text-center">
                                            <div className="flex flex-col items-center gap-1.5">
                                              {canManageUsers ? <QuickStatusToggle checked={user.active} loading={togglingUserId === user.id} onChange={(next) => handleToggleUserStatus(user, next)} activeLabel="Ativo" inactiveLabel="Inativo" size="sm" /> : <span className="text-xs text-slate-500">{user.active ? "Ativo" : "Inativo"}</span>}
                                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${!user.active ? "border-slate-200 bg-slate-100 text-slate-500" : user.must_change_password ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                                                {!user.active ? "Usuário inativo" : user.must_change_password ? "Primeiro acesso pendente" : "Acesso ativo"}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="text-right">
                                            <div className="inline-flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={(event) => { event.stopPropagation(); setUserToViewAccess(user); }}
                                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                              >
                                                <Eye size={13} />Ver acesso
                                              </button>
                                              {canResetPasswords && (<button
                                                type="button"
                                                onClick={(event) => { event.stopPropagation(); setUserToResetPass(user); }}
                                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                              >
                                                <KeyRound size={13} />Redefinir senha
                                              </button>)}
                                            </div>
                                          </td>
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

      {canManageDres && <DreFormModal isOpen={isDreModalOpen} onClose={() => setIsDreModalOpen(false)} onSuccess={handleDreSuccess} token={token} dreToEdit={dreToEdit} />}
      <UserFormModal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} onSuccess={handleUserSuccess} token={token} dres={dres} preselectedDreId={preselectedDreIdForUser} creator={profile} />

      {userToViewAccess && (
        <CredentialsSuccessModal
          isOpen
          onClose={() => setUserToViewAccess(null)}
          title="Acesso do usuário"
          subtitle="Consulte o login desta conta regional e redefina a senha quando necessário."
          username={userToViewAccess.username}
          email={userToViewAccess.email}
          dre={userToViewAccess.dre}
          onResetPassword={canResetPasswords ? handleResetFromAccessViewer : undefined}
        />
      )}

      <ResetPasswordModal isOpen={Boolean(userToResetPass)} onClose={() => setUserToResetPass(null)} onSuccess={handleResetPasswordSuccess} token={token} user={userToResetPass} />
      {credentialsModal && <CredentialsSuccessModal isOpen onClose={() => setCredentialsModal(null)} title={credentialsModal.title} subtitle={credentialsModal.subtitle} username={credentialsModal.username} email={credentialsModal.email} password={credentialsModal.password} dre={credentialsModal.dre} />}
    </div>
  );
}
