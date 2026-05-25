import React from "react";
import { MonitorSmartphone } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

export function AbaTecnologia() {
  return (
    <EmptyStatePlaceholder
      title="Tecnologia e Equipamentos"
      description="Esta seção reunirá indicadores sobre infraestrutura digital, parque tecnológico e uso pedagógico dos equipamentos."
      icon={MonitorSmartphone}
      sections={[
        "Infraestrutura Digital",
        "Parque Tecnológico",
        "Uso Pedagógico",
      ]}
    />
  );
}
