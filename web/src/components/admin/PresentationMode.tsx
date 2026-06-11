"use client";

import React, { useEffect } from "react";
import { MonitorPlay, X } from "lucide-react";

type PresentationModeProps = {
  onClose: () => void;
};

/**
 * Shell inicial do Modo Apresentação.
 *
 * Esta é a primeira versão (PR 1): apenas o overlay base, sem slides reais,
 * âncoras, autoplay, fullscreen ou navegação. A navegação por slides e os
 * recursos avançados serão adicionados em PRs subsequentes.
 *
 * O componente é totalmente autocontido: não importa abas, não faz fetch,
 * não usa token e não toca em filtros/cache/labels.
 */
export default function PresentationMode({ onClose }: PresentationModeProps) {
  // Fecha com a tecla Escape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Trava o scroll do body enquanto o overlay estiver aberto e restaura ao desmontar.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="ca-pres-shell" role="dialog" aria-modal="true" aria-label="Modo Apresentação">
      <div className="ca-pres-backdrop" onClick={onClose} />
      <div className="ca-pres-panel">
        <header className="ca-pres-header">
          <div className="ca-pres-title">
            <MonitorPlay size={18} />
            <div>
              <strong>Modo Apresentação</strong>
              <span>Visualização em tela cheia do painel SEDUC</span>
            </div>
          </div>
          <button
            type="button"
            className="ca-pres-close"
            title="Fechar apresentação"
            aria-label="Fechar apresentação"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="ca-pres-body">
          <div className="ca-pres-card">
            <h2>Estrutura inicial do modo apresentação.</h2>
            <p>A navegação por slides será implementada nos próximos PRs.</p>
          </div>
        </div>

        <div className="ca-pres-actions">
          <button type="button" className="ca-pres-launch-btn" onClick={onClose}>
            Fechar apresentação
          </button>
        </div>
      </div>
    </div>
  );
}
