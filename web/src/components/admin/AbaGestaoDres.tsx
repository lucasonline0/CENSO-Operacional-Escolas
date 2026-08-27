"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Building2,
  UsersRound,
  UserPlus,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Pencil,
  KeyRound,
  Mail,
  Phone,
  User,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  UserX,
  MapPin,
} from "lucide-react";
import {
  fetchDREs,
  fetchAdminUsers,
  updateDRE,
  updateAdminUserStatus,
} from "./shared/api";
import { StatCard } from "./shared/StatCard";
import { QuickStatusToggle } from "./shared/QuickStatusToggle";
import { DreFormModal } from "./shared/DreFormModal";
import { UserFormModal } from "./shared/UserFormModal";
import { ResetPasswordModal } from "./shared/ResetPasswordModal";
import { CredentialsSuccessModal } from "./shared/CredentialsSuccessModal";
import { copyToClipboard } from "./shared/credentialsUtils";
import type { DREItem, AdminUserItem } from "./shared/types";

interface AbaGestaoDresProps {
  token: string;
  onUnauth: () => void;
  onDataChanged?: () => void;
}

export function AbaGestaoDres({ token, onUnauth, onDataChanged }: AbaGestaoDresProps) {
  const [dres, setDres] = useState<DREItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Filtros locais
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Linhas expandidas (Set com id das DREs)
  const [expandedDres, setExpandedDres] = useState<Set<number>>(new Set());

  // Modais
  const [isDreModalOpen, setIsDreModalOpen] = useState(false);
  const [dreToEdit, setDreToEdit] = useState<DREItem | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [preselectedDreForUser, setPreselectedDreForUser] = useState<string | null>(null);

  const [userToResetPass, setUserToResetPass] = useState<AdminUserItem | null>(null);

  // Modal de credenciais geradas
  const [credentialsModal, setCredentialsModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    username: string;
    password?: string;
    dre: string;
  } | null>(null);

  // Toast temporário de feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Estados de loading específicos para toggles inline
  const [togglingDreId, setTogglingDreId] = useState<number | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Carregar dados
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [dresData, usersData] = await Promise.all([
        fetchDREs(token),
        fetchAdminUsers(token),
      ]);
      setDres(dresData);
      setUsers(usersData);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg === "UNAUTHORIZED") {
        onUnauth();
        return;
      }
      setError(msg || "Erro ao carregar dados das DREs e usuários.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onUnauth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mapeamento de usuários por nome de DRE (normalizado)
  const usersByDreMap = useMemo(() => {
    const map = new Map<string, AdminUserItem[]>();
    for (const u of users) {
      const key = (u.dre || "").trim().toLowerCase();
      const list = map.get(key) || [];
      list.push(u);
      map.set(key, list);
    }
    return map;
  }, [users]);

  // Estatísticas de Resumo (KPIs)
  const stats = useMemo(() => {
    const totalDres = dres.length;
    const activeDres = dres.filter((d) => d.ativa).length;
    const inactiveDres = totalDres - activeDres;

    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.active).length;
    const inactiveUsers = totalUsers - activeUsers;

    let dresComUsuarios = 0;
    let dresSemUsuarios = 0;

    for (const d of dres) {
      const uList = usersByDreMap.get((d.nome || "").trim().toLowerCase()) || [];
      if (uList.length > 0) dresComUsuarios++;
      else dresSemUsuarios++;
    }

    return {
      totalDres,
      activeDres,
      inactiveDres,
      totalUsers,
      activeUsers,
      inactiveUsers,
      dresComUsuarios,
      dresSemUsuarios,
    };
  }, [dres, users, usersByDreMap]);

  // Filtragem das DREs
  const filteredDres = useMemo(() => {
    const query = search.trim().toLowerCase();

    return dres.filter((dre) => {
      // Filtro de status da DRE
      if (statusFilter === "active" && !dre.ativa) return false;
      if (statusFilter === "inactive" && dre.ativa) return false;

      // Filtro de texto
      if (!query) return true;

      const dreNome = (dre.nome || "").toLowerCase();
      const dreSigla = (dre.sigla || "").toLowerCase();
      const dreMunicipio = (dre.municipio_sede || "").toLowerCase();
      const drePolo = (dre.polo || "").toLowerCase();
      const dreGestor = (dre.gestor_nome || "").toLowerCase();
      const dreEmail = (dre.email || "").toLowerCase();

      // Verificar se casa com os dados da DRE
      if (
        dreNome.includes(query) ||
        dreSigla.includes(query) ||
        dreMunicipio.includes(query) ||
        drePolo.includes(query) ||
        dreGestor.includes(query) ||
        dreEmail.includes(query)
      ) {
        return true;
      }

      // Verificar se casa com algum usuário vinculado a esta DRE
      const uList = usersByDreMap.get((dre.nome || "").trim().toLowerCase()) || [];
      return uList.some((u) => (u.username || "").toLowerCase().includes(query));
    });
  }, [dres, search, statusFilter, usersByDreMap]);

  // Toggle expansão de uma DRE
  const toggleExpand = (dreId: number) => {
    setExpandedDres((prev) => {
      const next = new Set(prev);
      if (next.has(dreId)) next.delete(dreId);
      else next.add(dreId);
      return next;
    });
  };

  // Expandir / Recolher todas
  const handleExpandAll = () => {
    if (expandedDres.size === filteredDres.length) {
      setExpandedDres(new Set());
    } else {
      setExpandedDres(new Set(filteredDres.map((d) => d.id)));
    }
  };

  // Toggle status de uma DRE
  const handleToggleDreStatus = async (dre: DREItem, nextActive: boolean) => {
    setTogglingDreId(dre.id);
    // Atualização otimista
    setDres((prev) =>
      prev.map((item) => (item.id === dre.id ? { ...item, ativa: nextActive } : item))
    );

    try {
      await updateDRE(token, dre.id, {
        ...dre,
        ativa: nextActive,
      });
      onDataChanged?.();
      showToast(`Status da ${dre.nome} atualizado para ${nextActive ? "Ativa" : "Inativa"}.`);
    } catch (err: unknown) {
      // Reverter
      setDres((prev) =>
        prev.map((item) => (item.id === dre.id ? { ...item, ativa: !nextActive } : item))
      );
      showToast((err as Error).message || "Erro ao atualizar status da DRE.", "error");
    } finally {
      setTogglingDreId(null);
    }
  };

  // Toggle status de um usuário
  const handleToggleUserStatus = async (user: AdminUserItem, nextActive: boolean) => {
    setTogglingUserId(user.id);
    // Atualização otimista
    setUsers((prev) =>
      prev.map((item) => (item.id === user.id ? { ...item, active: nextActive } : item))
    );

    try {
      await updateAdminUserStatus(token, user.id, nextActive);
      onDataChanged?.();
      showToast(`Usuário ${user.username} ${nextActive ? "ativado" : "desativado"} com sucesso.`);
    } catch (err: unknown) {
      // Reverter
      setUsers((prev) =>
        prev.map((item) => (item.id === user.id ? { ...item, active: !nextActive } : item))
      );
      showToast((err as Error).message || "Erro ao alterar status do usuário.", "error");
    } finally {
      setTogglingUserId(null);
    }
  };

  // Abertura de modais
  const handleOpenNewDre = () => {
    setDreToEdit(null);
    setIsDreModalOpen(true);
  };

  const handleOpenEditDre = (dre: DREItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDreToEdit(dre);
    setIsDreModalOpen(true);
  };

  const handleOpenNewUser = (dreNome?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPreselectedDreForUser(dreNome || null);
    setIsUserModalOpen(true);
  };

  const handleOpenResetPassword = (user: AdminUserItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setUserToResetPass(user);
  };

  // Callbacks de Sucesso
  const handleDreSuccess = (savedDre: DREItem) => {
    setIsDreModalOpen(false);
    setDres((prev) => {
      const idx = prev.findIndex((d) => d.id === savedDre.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = savedDre;
        return copy;
      }
      return [savedDre, ...prev];
    });
    onDataChanged?.();
    showToast(`DRE "${savedDre.nome}" ${dreToEdit ? "atualizada" : "cadastrada"} com sucesso.`);
  };

  const handleUserSuccess = (createdUser: AdminUserItem, pass: string) => {
    setIsUserModalOpen(false);
    setUsers((prev) => [createdUser, ...prev]);
    const targetDre = dres.find((d) => d.nome.trim().toLowerCase() === createdUser.dre.trim().toLowerCase());
    if (targetDre) {
      setExpandedDres((prev) => new Set(prev).add(targetDre.id));
    }
    onDataChanged?.();
    setCredentialsModal({
      isOpen: true,
      title: "Novo Usuário Cadastrado!",
      subtitle: `A conta para ${createdUser.dre} foi provisionada com sucesso.`,
      username: createdUser.username,
      password: pass,
      dre: createdUser.dre,
    });
  };

  const handleResetPasswordSuccess = (user: AdminUserItem, newPass: string) => {
    setUserToResetPass(null);
    setCredentialsModal({
      isOpen: true,
      title: "Senha Redefinida com Sucesso!",
      subtitle: `A nova senha de acesso para ${user.username} foi atualizada no sistema.`,
      username: user.username,
      password: newPass,
      dre: user.dre,
    });
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`
            fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium animate-slide-up
            ${
              toast.type === "success"
                ? "bg-emerald-900/90 text-white border-emerald-700/60 backdrop-blur-md"
                : "bg-rose-900/90 text-white border-rose-700/60 backdrop-blur-md"
            }
          `}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={18} className="text-emerald-400" />
          ) : (
            <AlertCircle size={18} className="text-rose-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header da Aba */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Building2 size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Gestão de DREs e Acessos
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Gerenciamento cadastral de Diretorias Regionais de Ensino e controle de credenciais vinculadas.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Atualizar listagens"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span>Atualizar</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenNewUser()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <UserPlus size={15} />
              <span>Novo Usuário</span>
            </button>

            <button
              type="button"
              onClick={handleOpenNewDre}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Plus size={16} />
              <span>Nova DRE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Resumo (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
        <StatCard
          label="Total de DREs"
          value={stats.totalDres}
          sub={`${stats.activeDres} ativas · ${stats.inactiveDres} inativas`}
          Icon={Building2}
          tone="blue"
        />
        <StatCard
          label="Usuários Regionais"
          value={stats.totalUsers}
          sub={`${stats.activeUsers} ativos · ${stats.inactiveUsers} inativos`}
          Icon={UsersRound}
          tone="green"
        />
        <StatCard
          label="DREs c/ Acesso Criado"
          value={stats.dresComUsuarios}
          sub={`${Math.round((stats.dresComUsuarios / Math.max(1, stats.totalDres)) * 100)}% de cobertura`}
          Icon={ShieldCheck}
          tone="purple"
        />
        <StatCard
          label="DREs sem Usuário"
          value={stats.dresSemUsuarios}
          sub={stats.dresSemUsuarios > 0 ? "Pendente criação de login" : "Todas possuem login"}
          Icon={UserX}
          tone={stats.dresSemUsuarios > 0 ? "amber" : "blue"}
        />
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Status:</span>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Todas ({dres.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === "active"
                  ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Ativas ({stats.activeDres})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === "inactive"
                  ? "bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 shadow-xs font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Inativas ({stats.inactiveDres})
            </button>
          </div>

          {filteredDres.length > 0 && (
            <button
              type="button"
              onClick={handleExpandAll}
              className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline px-2 py-1"
            >
              {expandedDres.size === filteredDres.length ? "Recolher todas" : "Expandir todas"}
            </button>
          )}
        </div>

        {/* Input de Busca */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar por DRE, município, gestor ou usuário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Erro Geral */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={17} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela de DREs com Acordeão */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <Loader2 className="animate-spin mx-auto mb-2 text-sky-600" size={24} />
            <span>Carregando Diretorias Regionais e usuários…</span>
          </div>
        ) : filteredDres.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 space-y-3">
            <Building2 size={36} className="mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nenhuma DRE encontrada para os filtros selecionados.
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
              >
                Limpar busca
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 pl-4 pr-1 w-10 text-center"></th>
                  <th className="py-3.5 px-3">Diretoria Regional (DRE)</th>
                  <th className="py-3.5 px-3">Município Sede / Polo</th>
                  <th className="py-3.5 px-3">Gestor & Contato</th>
                  <th className="py-3.5 px-3 text-center">Acessos Criados</th>
                  <th className="py-3.5 px-3 text-center">Status DRE</th>
                  <th className="py-3.5 pr-4 pl-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredDres.map((dre) => {
                  const isExpanded = expandedDres.has(dre.id);
                  const linkedUsers = usersByDreMap.get((dre.nome || "").trim().toLowerCase()) || [];
                  const activeLinkedUsers = linkedUsers.filter((u) => u.active).length;

                  return (
                    <React.Fragment key={dre.id}>
                      {/* Linha Principal da DRE */}
                      <tr
                        onClick={() => toggleExpand(dre.id)}
                        className={`
                          cursor-pointer transition-colors duration-150
                          ${
                            isExpanded
                              ? "bg-sky-50/40 dark:bg-slate-800/50"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }
                          ${!dre.ativa ? "opacity-75" : ""}
                        `}
                      >
                        {/* Chevron Expandir */}
                        <td className="py-3.5 pl-4 pr-1 text-center">
                          <button
                            type="button"
                            aria-label={isExpanded ? "Recolher detalhes" : "Expandir detalhes"}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-sky-600 dark:text-sky-400" />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </button>
                        </td>

                        {/* Nome & Sigla */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {dre.nome}
                            </span>
                            {dre.sigla && (
                              <span className="font-mono text-[10px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {dre.sigla}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Município Sede & Polo */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-0.5">
                            <span className="text-slate-800 dark:text-slate-200 font-medium block">
                              {dre.municipio_sede || "—"}
                            </span>
                            {dre.polo && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <MapPin size={11} className="text-slate-400" />
                                {dre.polo}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Gestor & Contato */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-0.5 max-w-xs">
                            {dre.gestor_nome && (
                              <span className="text-slate-800 dark:text-slate-200 font-medium flex items-center gap-1.5 truncate">
                                <User size={12} className="text-slate-400 flex-shrink-0" />
                                {dre.gestor_nome}
                              </span>
                            )}
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                              {dre.email && (
                                <span className="flex items-center gap-1 truncate" title={dre.email}>
                                  <Mail size={11} className="text-slate-400 flex-shrink-0" />
                                  {dre.email}
                                </span>
                              )}
                              {dre.telefone && (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  <Phone size={11} className="text-slate-400" />
                                  {dre.telefone}
                                </span>
                              )}
                            </div>
                            {!dre.gestor_nome && !dre.email && !dre.telefone && (
                              <span className="text-slate-400 italic">Sem contato cadastrado</span>
                            )}
                          </div>
                        </td>

                        {/* Usuários Vinculados */}
                        <td className="py-3.5 px-3 text-center">
                          {linkedUsers.length > 0 ? (
                            <span
                              className={`
                                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                                ${
                                  activeLinkedUsers > 0
                                    ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                }
                              `}
                            >
                              <UsersRound size={12} />
                              {linkedUsers.length} {linkedUsers.length === 1 ? "usuário" : "usuários"}
                              {activeLinkedUsers !== linkedUsers.length && (
                                <span className="text-[10px] opacity-80">({activeLinkedUsers} at.)</span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              Nenhum usuário
                            </span>
                          )}
                        </td>

                        {/* Toggle Status DRE */}
                        <td className="py-3.5 px-3 text-center">
                          <QuickStatusToggle
                            checked={dre.ativa}
                            loading={togglingDreId === dre.id}
                            onChange={(next) => handleToggleDreStatus(dre, next)}
                            activeLabel="Ativa"
                            inactiveLabel="Inativa"
                            size="sm"
                          />
                        </td>

                        {/* Ações da DRE */}
                        <td className="py-3.5 pr-4 pl-3 text-right">
                          <div
                            className="inline-flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              title="Adicionar usuário para esta DRE"
                              onClick={(e) => handleOpenNewUser(dre.nome, e)}
                              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                            >
                              <UserPlus size={15} />
                            </button>

                            <button
                              type="button"
                              title="Editar dados da DRE"
                              onClick={(e) => handleOpenEditDre(dre, e)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Pencil size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Acordeão: Usuários Vinculados à DRE */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <div className="bg-slate-50/80 dark:bg-slate-950/60 border-y border-slate-200/80 dark:border-slate-800 px-6 py-4 pl-12 space-y-3">
                              {/* Header do Acordeão */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                                    Usuários com Acesso à {dre.nome}
                                  </h3>
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                    {linkedUsers.length} {linkedUsers.length === 1 ? "conta" : "contas"}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => handleOpenNewUser(dre.nome, e)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs self-start sm:self-auto"
                                >
                                  <UserPlus size={13} />
                                  <span>+ Adicionar Usuário para esta DRE</span>
                                </button>
                              </div>

                              {/* Conteúdo: Lista ou Vazio */}
                              {linkedUsers.length === 0 ? (
                                <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-5 text-center space-y-2">
                                  <UsersRound size={28} className="mx-auto text-slate-300 dark:text-slate-700" />
                                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                    Nenhum usuário foi cadastrado para a {dre.nome} até o momento.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={(e) => handleOpenNewUser(dre.nome, e)}
                                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    Clique aqui para cadastrar o primeiro usuário desta regional
                                  </button>
                                </div>
                              ) : (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
                                        <th className="py-2.5 px-3.5">Usuário (Login)</th>
                                        <th className="py-2.5 px-3">Perfil</th>
                                        <th className="py-2.5 px-3">Data de Cadastro</th>
                                        <th className="py-2.5 px-3 text-center">Acesso Ativo</th>
                                        <th className="py-2.5 pr-3.5 pl-3 text-right">Ações</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                      {linkedUsers.map((user) => (
                                        <tr
                                          key={user.id}
                                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors ${
                                            !user.active ? "opacity-60" : ""
                                          }`}
                                        >
                                          {/* Login + Copiar */}
                                          <td className="py-2.5 px-3.5">
                                            <div className="flex items-center gap-2">
                                              <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center font-mono font-bold text-xs flex-shrink-0">
                                                {user.username.slice(0, 2).toUpperCase()}
                                              </div>
                                              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                                {user.username}
                                              </span>
                                              <button
                                                type="button"
                                                title="Copiar nome de usuário"
                                                onClick={async () => {
                                                  const ok = await copyToClipboard(user.username);
                                                  if (ok) showToast(`Usuário "${user.username}" copiado!`);
                                                }}
                                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                              >
                                                <Copy size={13} />
                                              </button>
                                            </div>
                                          </td>

                                          {/* Perfil */}
                                          <td className="py-2.5 px-3">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300">
                                              <ShieldCheck size={11} />
                                              DRE
                                            </span>
                                          </td>

                                          {/* Criado em */}
                                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                                            {fmtDate(user.created_at)}
                                          </td>

                                          {/* Toggle Status Usuário */}
                                          <td className="py-2.5 px-3 text-center">
                                            <QuickStatusToggle
                                              checked={user.active}
                                              loading={togglingUserId === user.id}
                                              onChange={(next) => handleToggleUserStatus(user, next)}
                                              activeLabel="Ativo"
                                              inactiveLabel="Inativo"
                                              size="sm"
                                            />
                                          </td>

                                          {/* Ações do Usuário */}
                                          <td className="py-2.5 pr-3.5 pl-3 text-right">
                                            <button
                                              type="button"
                                              onClick={(e) => handleOpenResetPassword(user, e)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-[11px] font-semibold transition-colors"
                                            >
                                              <KeyRound size={12} />
                                              <span>Redefinir Senha</span>
                                            </button>
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
      </div>

      {/* Modal: Nova / Editar DRE */}
      <DreFormModal
        isOpen={isDreModalOpen}
        onClose={() => setIsDreModalOpen(false)}
        onSuccess={handleDreSuccess}
        token={token}
        dreToEdit={dreToEdit}
      />

      {/* Modal: Novo Usuário */}
      <UserFormModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onSuccess={handleUserSuccess}
        token={token}
        dres={dres}
        preselectedDre={preselectedDreForUser}
      />

      {/* Modal: Redefinir Senha */}
      <ResetPasswordModal
        isOpen={Boolean(userToResetPass)}
        onClose={() => setUserToResetPass(null)}
        onSuccess={handleResetPasswordSuccess}
        token={token}
        user={userToResetPass}
      />

      {/* Modal: Sucesso e Cópia Segura de Credenciais */}
      {credentialsModal && (
        <CredentialsSuccessModal
          isOpen={credentialsModal.isOpen}
          onClose={() => setCredentialsModal(null)}
          title={credentialsModal.title}
          subtitle={credentialsModal.subtitle}
          username={credentialsModal.username}
          password={credentialsModal.password}
          dre={credentialsModal.dre}
        />
      )}
    </div>
  );
}
