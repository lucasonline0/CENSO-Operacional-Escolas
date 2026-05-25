import React from "react";
import { ShieldCheck } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

export function AbaInfraestruturaSeguranca() {
  return (
    <EmptyStatePlaceholder
      title="Infraestrutura e Segurança"
      description="Esta seção reunirá indicadores sobre condições estruturais, energia, climatização e segurança física das escolas."
      icon={ShieldCheck}
      sections={[
        "Condições Estruturais e Ambientes",
        "Energia, Climatização e Capacidade Elétrica",
        "Segurança Física e Patrimonial",
      ]}
    />
  );
}
