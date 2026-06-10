"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

const DIMENSOES: { nome: string; descricao: string }[] = [
  {
    nome: "Infraestrutura",
    descricao:
      "estrutura física, banheiros, muro/cerca, climatização e tipo de prédio.",
  },
  {
    nome: "Energia",
    descricao:
      "atendimento da rede elétrica, suporte a novos equipamentos e fornecimento.",
  },
  {
    nome: "Merenda",
    descricao: "oferta, qualidade, atendimento, cozinha e equipe.",
  },
  {
    nome: "Segurança",
    descricao:
      "câmeras, guarita, botão de pânico, portão, iluminação e portaria.",
  },
  {
    nome: "Pessoal",
    descricao:
      "atendimento das equipes de merenda, serviços gerais, portaria, direção e coordenação.",
  },
  {
    nome: "Tecnologia",
    descricao: "internet, computadores e projetores.",
  },
];

const PESOS_HABILITADOS: { nome: string; peso: string }[] = [
  { nome: "Infraestrutura", peso: "20%" },
  { nome: "Energia", peso: "10%" },
  { nome: "Merenda", peso: "15%" },
  { nome: "Segurança", peso: "15%" },
  { nome: "Pessoal", peso: "12%" },
  { nome: "Tecnologia", peso: "12%" },
];

const PESOS_PREVISTOS: { nome: string; peso: string }[] = [
  { nome: "Pedagógico", peso: "8%" },
  { nome: "Governança", peso: "8%" },
];

const FAIXAS: { nome: string; intervalo: string }[] = [
  { nome: "Saudável", intervalo: "70 a 100" },
  { nome: "Atenção", intervalo: "50 a 69,9" },
  { nome: "Crítica", intervalo: "abaixo de 50" },
  { nome: "Sem dados", intervalo: "escola sem censo concluído no ano" },
];

export default function SaudeOperacionalMetodologiaInfo() {
  // `open` é controlado pelo hover; `pinned` por clique/toque/teclado.
  // O pop-up fica visível enquanto qualquer um dos dois estiver ativo.
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const visible = open || pinned;

  const closeAll = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  // Fecha ao clicar fora do componente.
  useEffect(() => {
    if (!pinned) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        closeAll();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pinned, closeAll]);

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      // Fecha quando o foco sai completamente do componente.
      if (!wrapperRef.current?.contains(event.relatedTarget as Node)) {
        closeAll();
      }
    },
    [closeAll],
  );

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={handleBlur}
    >
      <button
        type="button"
        aria-label="Abrir explicação da metodologia do Índice de Saúde Operacional"
        aria-expanded={visible}
        aria-controls={panelId}
        onClick={() => setPinned((prev) => !prev)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            closeAll();
            event.currentTarget.blur();
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
      >
        <Info size={14} aria-hidden="true" />
        Metodologia
      </button>

      {visible && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Metodologia do Índice de Saúde Operacional"
          className="absolute right-0 z-50 mt-2 w-[min(calc(100vw-2rem),44rem)] rounded-xl border border-slate-200 bg-white p-5 text-left text-xs leading-relaxed text-slate-600 shadow-xl"
        >
          <h3 className="text-sm font-bold text-slate-900">
            Metodologia do Índice de Saúde Operacional
          </h3>
          <p className="mt-2">
            O índice resume, em uma nota de 0 a 100, a condição operacional de
            cada escola com base nas respostas do censo concluído no ano de
            referência.
          </p>

          <section className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fórmula
            </h4>
            <p className="mt-1 rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
              Saúde = Σ(nota da dimensão × peso) / Σ(pesos das dimensões com
              dados)
            </p>
            <p className="mt-2">A Criticidade é o inverso da Saúde:</p>
            <p className="mt-1 rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
              Criticidade = 100 − Saúde
            </p>
            <p className="mt-2 text-slate-500">
              Dimensões sem dados disponíveis não entram no cálculo daquela
              escola.
            </p>
          </section>

          <section className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dimensões habilitadas no cálculo atual
            </h4>
            <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {DIMENSOES.map((dim) => (
                <li key={dim.nome}>
                  <span className="font-semibold text-slate-700">
                    {dim.nome}
                  </span>{" "}
                  — {dim.descricao}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pesos da metodologia
            </h4>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-slate-50 p-2.5">
                <p className="text-[11px] font-semibold text-slate-700">
                  Habilitadas no cálculo atual
                </p>
                <ul className="mt-1 space-y-1">
                  {PESOS_HABILITADOS.map((item) => (
                    <li key={item.nome} className="flex justify-between gap-2">
                      <span>{item.nome}</span>
                      <span className="font-semibold text-slate-700">
                        {item.peso}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md bg-slate-50 p-2.5">
                <p className="text-[11px] font-semibold text-slate-700">
                  Previstas na metodologia
                </p>
                <ul className="mt-1 space-y-1">
                  {PESOS_PREVISTOS.map((item) => (
                    <li key={item.nome} className="flex justify-between gap-2">
                      <span>{item.nome}</span>
                      <span className="font-semibold text-slate-700">
                        {item.peso}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-2 text-slate-500">
              Os pesos da metodologia somam 100%. Nesta tela, o cálculo atual
              considera apenas as dimensões habilitadas. Pedagógico e Governança
              estão previstos metodologicamente, mas ainda não entram na nota
              exibida.
            </p>
          </section>

          <section className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Faixas de classificação
            </h4>
            <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {FAIXAS.map((faixa) => (
                <li key={faixa.nome}>
                  <span className="font-semibold text-slate-700">
                    {faixa.nome}:
                  </span>{" "}
                  {faixa.intervalo}
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-3 space-y-2 border-t border-slate-100 pt-2 text-slate-500">
            <p>
              Observação: escolas sem censo concluído aparecem como pendentes de
              censo e não recebem nota.
            </p>
            <p>
              Nota metodológica: os pesos totais somam 100%. Nesta tela,
              Pedagógico e Governança aparecem como dimensões previstas, mas
              ainda não estão habilitadas no cálculo exibido.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
