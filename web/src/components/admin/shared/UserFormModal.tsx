"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Mail, Shield, Sparkles, User, UserPlus } from "lucide-react";
import { createAdminUser } from "./api";
import { AdminModalShell } from "./AdminModalShell";
import { C } from "./constants";
import { copyToClipboard, generateSecurePassword } from "./credentialsUtils";
import type { AdminPermission, AdminProfile, AdminUserItem, DREItem } from "./types";

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AdminUserItem, passwordGenerated: string) => void;
  token: string;
  dres: DREItem[];
  preselectedDreId?: number | null;
  creator?: AdminProfile | null;
}

type Preset = "dre" | "global" | "custom";
type DataScope = "all" | "selected";

const INPUT_CLASS = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400";
const LABEL_CLASS = "mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700";

const READ_PERMISSIONS: AdminPermission[] = ["census.read", "analytics.read", "reports.read"];
const PERMISSION_OPTIONS: Array<{ id: AdminPermission; label: string; help: string }> = [
  { id: "census.read", label: "Visualizar Censo", help: "Registros e detalhes do Censo." },
  { id: "analytics.read", label: "Visualizar Analytics", help: "Dashboards e indicadores analíticos." },
  { id: "reports.read", label: "Visualizar Relatórios", help: "Relatórios e exportações autorizadas." },
  { id: "users.read", label: "Visualizar contas", help: "Lista contas existentes dentro da gestão." },
  { id: "users.create", label: "Criar contas", help: "Pode provisionar novas contas sem ultrapassar o próprio acesso." },
  { id: "users.manage", label: "Gerenciar contas", help: "Ativar/desativar contas subordinadas." },
  { id: "users.reset_password", label: "Redefinir senhas", help: "Gera nova credencial temporária para contas subordinadas." },
  { id: "dres.manage", label: "Gerenciar DREs", help: "Criar e editar DREs autorizadas." },
  { id: "schools.manage_dre", label: "Gerenciar vínculo de escolas", help: "Alterar vínculo escola ↔ DRE." },
  { id: "sync.execute", label: "Executar sincronização", help: "Pode disparar sincronização de dados." },
];

function suggestedUsername(dre?: DREItem) {
  if (!dre) return "";
  const clean = dre.nome
    .toLowerCase()
    .replace(/^dre\s*[-_]?\s*/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return clean ? `dre.${clean}` : "";
}

export function UserFormModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  dres,
  preselectedDreId,
  creator,
}: UserFormModalProps) {
  const [preset, setPreset] = useState<Preset>("dre");
  const [dataScope, setDataScope] = useState<DataScope>("selected");
  const [selectedDreIds, setSelectedDreIds] = useState<number[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>(READ_PERMISSIONS);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const activeDres = useMemo(() => dres.filter((d) => d.ativa), [dres]);
  const creatorIsAdmin = creator?.role === "admin" || !creator;
  const creatorPermissions = useMemo(
    () => new Set<AdminPermission>(creatorIsAdmin ? PERMISSION_OPTIONS.map((p) => p.id) : (creator?.permissions ?? [])),
    [creator, creatorIsAdmin],
  );
  const canGrantAllScope = creatorIsAdmin || creator?.data_scope?.type === "all";
  const canGrantReadPreset = READ_PERMISSIONS.every((permission) => creatorPermissions.has(permission));
  const canGrantDrePreset = canGrantReadPreset && activeDres.length > 0;
  const canGrantGlobalPreset = canGrantReadPreset && canGrantAllScope;
  const grantableOptions = useMemo(
    () => PERMISSION_OPTIONS.filter((option) => creatorPermissions.has(option.id)),
    [creatorPermissions],
  );

  // Compute which DREs the creator can delegate based on their data_scope.
  // Admin can delegate all; custom with "selected" scope can only delegate DREs
  // present in their own dre_ids list.
  const creatorDelegableDres = useMemo(() => {
    if (creatorIsAdmin) return new Set(activeDres.map((d) => d.id));
    const creatorDres = new Set<number>();
    if (creator?.data_scope?.type === "selected" && creator?.data_scope?.dre_ids) {
      creator?.data_scope.dre_ids.forEach((id) => creatorDres.add(id));
    }
    return creatorDres;
  }, [creator, activeDres, creatorIsAdmin]);

  useEffect(() => {
    if (!isOpen) return;
    const preselectedValid = preselectedDreId != null && activeDres.some((d) => d.id === preselectedDreId);
    const firstId = preselectedValid ? preselectedDreId! : (activeDres[0]?.id ?? null);
    const firstDre = firstId == null ? undefined : activeDres.find((d) => d.id === firstId);
    const defaultReads = READ_PERMISSIONS.filter((permission) => creatorPermissions.has(permission));

    const initialPreset: Preset = canGrantDrePreset ? "dre" : "custom";
    setPreset(initialPreset);
    setDataScope("selected");
    setSelectedDreIds(firstId == null ? [] : [firstId]);
    setPermissions(defaultReads);
    setUsername(initialPreset === "dre" ? suggestedUsername(firstDre) : "");
    setEmail("");
    setPassword(generateSecurePassword(12));
    setShowPassword(true);
    setLoading(false);
    setCopied(false);
    setError(preselectedDreId != null && !preselectedValid ? "A DRE selecionada não está disponível no seu escopo." : "");
  }, [isOpen, preselectedDreId, activeDres, creatorPermissions, canGrantDrePreset]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  function applyPreset(next: Preset) {
    setPreset(next);
    setError("");
    const readSubset = READ_PERMISSIONS.filter((permission) => creatorPermissions.has(permission));

    if (next === "dre") {
      if (!canGrantDrePreset) {
        setError("Seu perfil não pode delegar o pacote completo de leitura de uma conta DRE.");
        setPreset("custom");
        return;
      }
      const id = selectedDreIds[0] ?? activeDres[0]?.id;
      setDataScope("selected");
      setSelectedDreIds(id ? [id] : []);
      setPermissions(readSubset);
      setUsername(suggestedUsername(activeDres.find((d) => d.id === id)));
      return;
    }

    if (next === "global") {
      if (!canGrantGlobalPreset) {
        setError("Seu perfil não pode delegar o pacote completo de consulta global.");
        setPreset("custom");
        return;
      }
      setDataScope("all");
      setSelectedDreIds([]);
      setPermissions(readSubset);
      setUsername("");
      return;
    }

    setUsername("");
  }

  function toggleDre(id: number) {
    setSelectedDreIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function togglePermission(permission: AdminPermission) {
    if (!creatorPermissions.has(permission)) return;
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  async function handleCopyPassword() {
    if (password && await copyToClipboard(password)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername) return setError("Informe o nome de usuário.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Informe um e-mail válido.");
    if (cleanPassword.length < 12) return setError("A senha deve ter no mínimo 12 caracteres.");
    if (dataScope === "selected" && selectedDreIds.length === 0) return setError("Selecione pelo menos uma DRE.");
    if (dataScope === "all" && !canGrantAllScope) return setError("Seu perfil não pode delegar acesso global.");
    if (permissions.some((permission) => !creatorPermissions.has(permission))) {
      return setError("O formulário contém uma permissão que seu perfil não pode delegar.");
    }

    setLoading(true);
    setError("");
    try {
      let created: AdminUserItem;
      if (preset === "dre") {
        if (selectedDreIds.length !== 1) {
          setError("O preset DRE exige exatamente uma DRE.");
          return;
        }
        created = await createAdminUser(token, {
          username: cleanUsername,
          email: cleanEmail,
          password: cleanPassword,
          role: "dre",
          dre_id: selectedDreIds[0],
        });
      } else {
        created = await createAdminUser(token, {
          username: cleanUsername,
          email: cleanEmail,
          password: cleanPassword,
          role: "custom",
          permissions,
          data_scope: dataScope,
          dre_ids: dataScope === "selected" ? selectedDreIds : [],
        });
      }
      onSuccess(created, cleanPassword);
    } catch (requestError: unknown) {
      setError((requestError as Error).message || "Erro ao criar usuário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModalShell
      title="Criar conta de acesso"
      subtitle="Defina o escopo de dados e exatamente quais ações esta conta poderá executar."
      Icon={UserPlus}
      onClose={onClose}
      closeDisabled={loading}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div>
          <label className={LABEL_CLASS}><Shield size={13} className="text-slate-400" />Modelo de acesso</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["dre", "Acesso DRE"],
              ["global", "Consulta global"],
              ["custom", "Personalizado"],
            ] as Array<[Preset, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={(id === "dre" && !canGrantDrePreset) || (id === "global" && !canGrantGlobalPreset)}
                onClick={() => applyPreset(id)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${preset === id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <div>
            <label className={LABEL_CLASS}><Building2 size={13} className="text-slate-400" />Escopo dos dados</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDataScope("selected")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${dataScope === "selected" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200"}`}>DREs selecionadas</button>
              <button type="button" disabled={!canGrantAllScope} onClick={() => { setDataScope("all"); setSelectedDreIds([]); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${dataScope === "all" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200"} disabled:opacity-40`}>Todas as DREs</button>
            </div>
          </div>
        )}

        {dataScope === "selected" && (
          <div>
            <label className={LABEL_CLASS}><Building2 size={13} className="text-slate-400" />DREs autorizadas <span className="text-rose-500">*</span></label>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {activeDres.length === 0 && <p className="p-2 text-xs text-slate-500">Nenhuma DRE disponível no seu escopo.</p>}
              {activeDres.map((dre) => {
                const checked = selectedDreIds.includes(dre.id);
                const dreDelegable = creatorDelegableDres.has(dre.id);
                const disabled = preset === "dre" && checked && selectedDreIds.length === 1 || !dreDelegable;
                return (
                  <label key={dre.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50">
                    <input
                      type={preset === "dre" ? "radio" : "checkbox"}
                      name={preset === "dre" ? "dre" : undefined}
                      checked={checked}
                      disabled={disabled && preset !== "dre"}
                      onChange={() => {
                        if (preset === "dre") {
                          setSelectedDreIds([dre.id]);
                          setUsername(suggestedUsername(dre));
                        } else toggleDre(dre.id);
                      }}
                    />
                    <span className="text-sm text-slate-700">{dre.nome}{dre.sigla ? ` (${dre.sigla})` : ""}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {preset === "custom" && (
          <div>
            <label className={LABEL_CLASS}><Shield size={13} className="text-slate-400" />Permissões</label>
            <div className="grid gap-2 md:grid-cols-2">
              {grantableOptions.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3">
                  <input type="checkbox" className="mt-0.5" checked={permissions.includes(option.id)} onChange={() => togglePermission(option.id)} />
                  <span>
                    <span className="block text-xs font-semibold text-slate-700">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{option.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}><Mail size={13} className="text-slate-400" />E-mail institucional <span className="text-rose-500">*</span></label>
          <input type="email" autoComplete="email" maxLength={254} className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="responsavel@seduc.pa.gov.br" required />
        </div>

        <div>
          <label className={LABEL_CLASS}><User size={13} className="text-slate-400" />Nome de usuário <span className="text-rose-500">*</span></label>
          <input className={`${INPUT_CLASS} font-mono`} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))} placeholder="usuario.seduc" required />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className={LABEL_CLASS}><KeyRound size={13} className="text-slate-400" />Senha temporária <span className="text-rose-500">*</span></label>
            <button type="button" onClick={() => { setPassword(generateSecurePassword(12)); setShowPassword(true); }} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.primary }}><Sparkles size={13} />Gerar senha</button>
          </div>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className={`${INPUT_CLASS} pr-20 font-mono`} value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required />
            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              <button type="button" onClick={handleCopyPassword} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Copiar senha">{copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}</button>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">No primeiro login, essa senha deverá ser substituída antes do acesso ao Censo.</p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-900"><Shield size={15} />Primeiro acesso</span>
          <span className="text-xs font-semibold text-amber-700">Troca de senha obrigatória</span>
        </div>

        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={loading || !username.trim() || !email.trim() || !password.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: C.primary }}>{loading ? <><Loader2 size={15} className="animate-spin" />Criando…</> : "Criar conta"}</button>
        </div>
      </form>
    </AdminModalShell>
  );
}
