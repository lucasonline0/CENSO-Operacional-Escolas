"use client";

import React from "react";
import { UserCog } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

const SECOES_PREVISTAS = [
  "Listagem de acessos DRE",
  "Criação de novo acesso DRE",
  "Redefinição de senha",
  "Ativação e desativação de acessos",
];

export function AbaGestaoDres() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <EmptyStatePlaceholder
        title="Gestão de DREs e Acessos"
        icon={UserCog}
        description="Espaço reservado para a administração dos acessos das Diretorias Regionais de Educação. Quando integrada ao backend, esta aba permitirá criar, consultar e manter os usuários DRE do painel, substituindo o fluxo atual via linha de comando (cmd/admin-user)."
        sections={SECOES_PREVISTAS}
      />
    </div>
  );
}
