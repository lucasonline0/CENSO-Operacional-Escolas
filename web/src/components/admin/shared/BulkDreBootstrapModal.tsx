"use client";

import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, UsersRound } from "lucide-react";
import { AdminModalShell } from "./AdminModalShell";
import { executeDREBootstrap, type DREBootstrapPreview } from "./api";
import { C } from "./constants";

interface Props {
  token: string;
  preview: DREBootstrapPreview;
  onClose: () => void;
  onCompleted: (preview: DREBootstrapPreview) => void;
}

function downloadCredentials(credentials: Array<{ dre: string; email: string; username: string; temporary_password: string }>) {
  const text = ["CENSO OPERACIONAL — ACESSOS INICIAIS", "", ...credentials.flatMap((item) => [
    `DRE: ${item.dre}`, `E-mail: ${item.email || "não informado"}`, `Usuário: ${item.username}`,
    `Senha temporária: ${item.temporary_password}`, "Troca obrigatória no primeiro acesso: SIM", "", "----------------------------------------", "",
  ])].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `acessos-dres-${new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "")}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function BulkDreBootstrapModal({ token, preview, onClose, onCompleted }: Props) {
  const [emails, setEmails] = useState<Record<number, string>>(() => Object.fromEntries(preview.items.map((item) => [item.dre_id, item.email])));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(0);
  const editableIDs = useMemo(() => new Set(preview.items.filter((item) => item.status === "invalid_email" || item.status === "pending" && !item.email).map((item) => item.dre_id)), [preview]);
  const invalidEditable = [...editableIDs].some((id) => {
    const email = (emails[id] ?? "").trim();
    return email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });
  const nonEmailErrors = preview.items.some((item) => item.status === "error");

  async function provision() {
    if (loading || completed > 0 || invalidEditable || nonEmailErrors || preview.pending + editableIDs.size === 0) return;
    setLoading(true); setError("");
    try {
      const overrides = Object.fromEntries([...editableIDs].map((id) => [String(id), emails[id]?.trim() ?? ""]));
      const result = await executeDREBootstrap(token, overrides);
      downloadCredentials(result.credentials);
      setCompleted(result.credentials.length);
      onCompleted(result.preview);
    } catch (requestError: unknown) {
      setError((requestError as Error).message || "Não foi possível provisionar os acessos.");
    } finally { setLoading(false); }
  }

  return <AdminModalShell title="Provisionar acessos das DREs" subtitle="Revise as identidades; o e-mail é opcional." Icon={UsersRound} onClose={onClose} closeDisabled={loading} maxWidth="xl">
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[["DREs ativas", preview.active], ["Já provisionadas", preview.provisioned], ["Pendentes", preview.pending], ["Ignoradas E2E", preview.ignored_e2e], ["Com erro", preview.errors]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center"><div className="text-lg font-bold text-slate-800">{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-sm"><thead><tr><th>DRE</th><th>E-mail</th><th>Usuário</th><th>Status</th></tr></thead><tbody>
          {preview.items.map((item) => <tr key={item.dre_id}><td className="font-semibold text-slate-700">{item.dre}</td><td>{editableIDs.has(item.dre_id) ? <input aria-label={`E-mail ${item.dre}`} type="email" value={emails[item.dre_id] ?? ""} onChange={(event) => setEmails((current) => ({ ...current, [item.dre_id]: event.target.value }))} placeholder="email@seduc.pa.gov.br" className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" /> : <span className="text-slate-600">{item.email || "—"}</span>}</td><td className="font-mono text-xs text-slate-600">{item.username}</td><td><span className={item.status === "pending" ? "font-semibold text-emerald-700" : item.status === "error" || editableIDs.has(item.dre_id) ? "font-semibold text-rose-700" : "text-slate-600"}>{item.message}</span></td></tr>)}
        </tbody></table>
      </div>
      {completed > 0 && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} /><div><strong>{completed} contas criadas.</strong><p>Salve o arquivo agora. As senhas temporárias não poderão ser exibidas novamente.</p></div></div>}
      {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} />{error}</div>}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={onClose} disabled={loading} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium">{completed > 0 ? "Fechar" : "Cancelar"}</button><button type="button" onClick={provision} disabled={loading || completed > 0 || invalidEditable || nonEmailErrors || preview.pending + editableIDs.size === 0} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-40" style={{ background: C.primary }}>{loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{loading ? "Provisionando…" : "Provisionar e baixar TXT"}</button></div>
    </div>
  </AdminModalShell>;
}
