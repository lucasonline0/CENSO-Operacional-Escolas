import React from "react";
import { UsersRound } from "lucide-react";
import { EmptyStatePlaceholder } from "./shared/EmptyStatePlaceholder";

export function AbaPessoalGestao() {
  return (
    <EmptyStatePlaceholder
      title="Pessoal e Gestão Escolar"
      description="Esta seção reunirá indicadores sobre estrutura de gestão, coordenação pedagógica e composição do quadro de pessoal das escolas."
      icon={UsersRound}
      sections={[
        "Estrutura de Gestão Escolar",
        "Coordenação Pedagógica",
        "Quadro de Pessoal",
      ]}
    />
  );
}
