"use client";

import React, { useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";
import { NovaDreModal } from "./shared/NovaDreModal";
import { AdminToast, type AdminToastData } from "./shared/AdminToast";
import { clearApiCache } from "./shared/api";
import { C } from "./shared/constants";

const SECOES_PREVISTAS = [
  "Listagem de acessos DRE",
  "Criação de novo acesso DRE",
  "Redefinição de senha",
  "Ativação e desativação de acessos",
];

interface AbaGestaoDresProps {
  token: string;
  onUnauth: () => void;
}

export function AbaGestaoDres({ token, onUnauth }: AbaGestaoDresProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<AdminToastData | null>(null);

  // Após criar: limpa o cache de GETs para filtros/opções refletirem a nova DRE.
  const handleCreated = () => {
    setModalOpen(false);
    clearApiCache();
    setToast({ type: "success", message: "DRE cadastrada com sucesso." });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2" style={{ background: C.primaryLight }}>
          <UserCog size={16} className="shrink-0" strokeWidth={2} />
          <h2 className="font-semibold text-slate-800 text-sm">Gestão de DREs e Acessos</h2>
        </div>
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-slate-600 max-w-xl">
            Cadastre novas Diretorias Regionais de Educação e gerencie os acessos dos usuários DRE do painel.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shrink-0 self-start sm:self-auto"
            style={{ background: C.primary }}
          >
            <Plus size={16} />
            Nova DRE
          </button>
        </div>
      </div>

      <EmptyStatePlaceholder
        title="Demais funcionalidades"
        icon={UserCog}
        description="Espaço reservado para a administração dos acessos das Diretorias Regionais de Educação. Quando integrada ao backend, esta aba permitirá consultar e manter os usuários DRE do painel, substituindo o fluxo atual via linha de comando (cmd/admin-user)."
        sections={SECOES_PREVISTAS}
      />

      {modalOpen && (
        <NovaDreModal
          token={token}
          onClose={() => setModalOpen(false)}
          onSuccess={handleCreated}
          onUnauth={onUnauth}
        />
      )}

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
