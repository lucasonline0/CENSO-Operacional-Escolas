import React from "react";
import { Utensils } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

export function AbaMerenda() {
  return (
    <EmptyStatePlaceholder
      title="Merenda Escolar"
      description="Esta seção reunirá indicadores sobre oferta da merenda, estrutura física, equipamentos e recursos humanos da alimentação escolar."
      icon={Utensils}
      sections={[
        "Oferta e Adequação da Merenda",
        "Estrutura Física",
        "Equipamentos",
        "Recursos Humanos",
      ]}
    />
  );
}
