"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export function AutoFiller() {
  const [isRunning, setIsRunning] = useState(false);

  // Helper para disparar eventos nativos garantindo que o React perceba
  const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter?.call(element, value);
    } else {
      valueSetter?.call(element, value);
    }

    // Dispara múltiplos eventos para garantir compatibilidade com diferentes bibliotecas
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const fillCurrentStep = async () => {
    console.log("🤖 AutoFiller: Executando preenchimento inteligente...");

    // 1. TRATAR RADIOS (Prioridade: "Sim" e Positivos para abrir condicionais)
    const radioButtons = Array.from(document.querySelectorAll('button[role="radio"]'));
    const positiveValues = [
        "Sim", "Próprio", "Adequada", "Boa", "Sim, totalmente", 
        "Completo", "Concessionária", "Sim, formalizada", "Sim, com falhas"
    ];

    for (const btn of radioButtons) {
        const el = btn as HTMLButtonElement;
        // Verifica se o valor é positivo
        const isPositive = positiveValues.some(v => el.value && el.value.includes(v));
        
        // Se for positivo e não estiver marcado, clica
        if (isPositive && el.dataset.state === "unchecked") {
             el.click();
             await new Promise(r => setTimeout(r, 50)); 
        }
    }

    // 2. TRATAR O RESTO DOS RADIOS (Que não têm opção "Sim", ex: Zona)
    const remainingRadios = document.querySelectorAll('button[role="radio"]');
    for (const btn of Array.from(remainingRadios)) {
        const el = btn as HTMLButtonElement;
        const parent = el.parentElement;
        // Se nenhum irmão está marcado, marca este
        if (parent && !parent.querySelector('[data-state="checked"]')) {
             el.click();
        }
    }

    // 3. TRATAR CHECKBOXES (Garantir seleção múltipla)
    const checkboxes = document.querySelectorAll('button[role="checkbox"]');
    checkboxes.forEach((c) => {
        const el = c as HTMLButtonElement;
        if (el.dataset.state === "unchecked") {
            el.click();
        }
    });

    // 4. TRATAR SELECTS (Combobox)
    const selectTriggers = document.querySelectorAll('button[role="combobox"]');
    for (const trigger of Array.from(selectTriggers)) {
        const t = trigger as HTMLButtonElement;
        t.click(); 
        await new Promise(r => setTimeout(r, 100));

        const options = document.querySelectorAll('[role="option"]');
        if (options.length > 0) {
            const optToClick = options[options.length > 1 ? 1 : 0] as HTMLElement;
            optToClick.click();
        }
        await new Promise(r => setTimeout(r, 50));
    }

    // 5. ESPERA CRÍTICA: Aguardar campos condicionais aparecerem após clicar no "Sim"
    await new Promise(r => setTimeout(r, 800));

    // 6. TRATAR INPUTS (Texto e Número) - Lógica Reforçada
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"])');
    
    inputs.forEach((input) => {
      const el = input as HTMLInputElement;
      if (el.value) return; // Se já tem valor, pula

      const nameLower = (el.name || "").toLowerCase();
      const type = el.type;

      // DETECÇÃO DE CAMPO NUMÉRICO (Por tipo OU por nome)
      const isNumericField = 
          type === "number" || 
          nameLower.includes("qtd") || 
          nameLower.includes("total") || 
          nameLower.includes("num") || 
          nameLower.includes("alunos") || 
          nameLower.includes("turmas") || 
          nameLower.includes("capacidade") || 
          nameLower.includes("valor") ||
          nameLower.includes("quantitativo");

      if (isNumericField) {
          // REGRA DE OURO: Valor entre 1 e 10
          const randomVal = Math.floor(Math.random() * 10) + 1;
          setNativeValue(el, randomVal.toString());
      } else {
          // Lógica para Textos Gerais
          let val = "Auto Teste";

          if (nameLower.includes("inep")) val = "12345678";
          if (nameLower.includes("email")) val = `teste.${Math.floor(Math.random() * 99)}@escola.com`;
          if (nameLower.includes("telefone") || nameLower.includes("celular") || nameLower.includes("contato")) val = "91999999999";
          if (nameLower.includes("cpf")) val = "000.000.000-00";
          if (nameLower.includes("data")) val = "01/01/2024";
          if (nameLower.includes("cep")) val = "66000000";
          
          setNativeValue(el, val);
      }
    });

    // 7. TRATAR TEXTAREAS
    document.querySelectorAll('textarea').forEach(el => {
        const area = el as HTMLTextAreaElement;
        if (!area.value) setNativeValue(area, "Observação preenchida automaticamente pelo robô.");
    });
  };

  const runFullTest = async () => {
    setIsRunning(true);
    
    // Tenta navegar por até 20 passos (margem de segurança)
    for (let i = 0; i < 20; i++) {
        await fillCurrentStep();
        
        // Tempo para validação do Zod
        await new Promise(r => setTimeout(r, 1000));

        // Procura botão de avançar/salvar/finalizar
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find(b => 
            (b.innerText.includes("Continuar") || 
             b.innerText.includes("Salvar") ||
             b.innerText.includes("Finalizar") ||
             b.innerText.includes("Concluir")) &&
            !b.disabled &&
            !b.innerText.includes("Voltar") && 
            !b.innerText.includes("Testar")
        );

        if (nextBtn) {
            console.log("➡️ Avançando para o próximo passo...");
            nextBtn.click();
            
            await new Promise(r => setTimeout(r, 2500)); // Espera a transição de página
            
            if (nextBtn.innerText.includes("Finalizar") || nextBtn.innerText.includes("Concluir")) {
                console.log("✅ Fluxo finalizado com sucesso!");
                break; 
            }
        } else {
            console.log("⚠️ Botão de avançar não encontrado. Tentando preencher novamente...");
            // Tenta mais uma vez caso o delay tenha sido curto
            await fillCurrentStep(); 
            await new Promise(r => setTimeout(r, 1000));
            
            // Se falhar de novo, tenta forçar busca do botão novamente
            const retryBtn = Array.from(document.querySelectorAll('button')).find(b => 
                (b.innerText.includes("Continuar") || b.innerText.includes("Salvar")) && !b.disabled
            );
            
            if (retryBtn) {
                retryBtn.click();
                await new Promise(r => setTimeout(r, 2500));
            } else {
                console.log("❌ O robô parou. Verifique se há erros de validação na tela.");
                break;
            }
        }
    }
    setIsRunning(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-2">
      <Button 
        variant="destructive" 
        onClick={runFullTest} 
        disabled={isRunning}
        className="shadow-xl border-2 border-white font-bold animate-in slide-in-from-bottom-5"
      >
        {isRunning ? "⏳ Preenchendo (1-10)..." : "🧪 TESTAR TUDO"}
      </Button>
    </div>
  );
}