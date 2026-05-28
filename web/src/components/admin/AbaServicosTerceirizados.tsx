import React from "react";
import { ClipboardCheck } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

export function AbaServicosTerceirizados() {
  return (
    <EmptyStatePlaceholder
      title="Serviços Terceirizados"
      description="Esta seção reunirá indicadores sobre serviços gerais, portaria, supervisão, atendimento da demanda e execução contratual."
      icon={ClipboardCheck}
      sections={[
        "Visão Geral",
        "Serviços Gerais",
        "Portaria",
      ]}
    />
  );
}
