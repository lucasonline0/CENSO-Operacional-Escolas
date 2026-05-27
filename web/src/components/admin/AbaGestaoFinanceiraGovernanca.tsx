import React from "react";
import { Landmark } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

export function AbaGestaoFinanceiraGovernanca() {
  return (
    <EmptyStatePlaceholder
      title="Gestão Financeira e Governança"
      description="Esta seção reunirá futuramente indicadores sobre regularização institucional, conselhos escolares, execução de recursos, prestação de contas e participação comunitária, a partir de bases próprias validadas pelas coordenações responsáveis."
      icon={Landmark}
      sections={[
        "Governança Institucional e Regularização",
        "Execução Financeira e Prestação de Contas",
        "Participação Comunitária e Risco de Governança",
      ]}
    />
  );
}
