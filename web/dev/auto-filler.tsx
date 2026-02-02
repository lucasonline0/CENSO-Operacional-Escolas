"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Wand2 } from "lucide-react";

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

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const fillCurrentStep = async () => {
    if (isRunning) return;
    setIsRunning(true);
    console.log("🤖 AutoFiller: Preenchendo APENAS a tela atual...");

    try {
        // 1. TRATAR RADIOS (Prioridade: "Sim" e Positivos)
        const radioButtons = Array.from(document.querySelectorAll('button[role="radio"]'));
        const positiveValues = [
            "Sim", "Próprio", "Adequada", "Boa", "Excelente", "Sim, totalmente", 
            "Completo", "Concessionária", "Sim, formalizada", "Sim, com falhas",
            "Urbana", "Eventuais"
        ];

        for (const btn of radioButtons) {
            const el = btn as HTMLButtonElement;
            const isPositive = positiveValues.some(v => el.value && el.value.includes(v));
            
            if (isPositive && el.dataset.state === "unchecked") {
                el.click();
                await new Promise(r => setTimeout(r, 20)); 
            }
        }

        // 2. TRATAR O RESTO DOS RADIOS
        const remainingRadios = document.querySelectorAll('button[role="radio"]');
        for (const btn of Array.from(remainingRadios)) {
            const el = btn as HTMLButtonElement;
            const parent = el.parentElement;
            if (parent && !parent.querySelector('[data-state="checked"]')) {
                el.click();
                await new Promise(r => setTimeout(r, 10));
            }
        }

        // 3. TRATAR CHECKBOXES
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
                const optToClick = options.length > 1 ? options[1] : options[0];
                (optToClick as HTMLElement).click();
            }
            await new Promise(r => setTimeout(r, 50));
        }

        // 5. ESPERA CONDICIONAIS
        await new Promise(r => setTimeout(r, 500));

        // 6. TRATAR INPUTS E TEXTAREAS
        const inputsAndTextareas = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]), textarea');
        
        inputsAndTextareas.forEach((element) => {
            const el = element as HTMLInputElement | HTMLTextAreaElement;
            if (el.value) return;

            const nameLower = (el.name || "").toLowerCase();
            const type = el.type;
            const tagName = el.tagName.toLowerCase();

            const isNumericField = 
                type === "number" || 
                nameLower.includes("qtd") || 
                nameLower.includes("total") || 
                nameLower.includes("num") || 
                nameLower.includes("alunos") || 
                nameLower.includes("turmas") || 
                nameLower.includes("capacidade") || 
                nameLower.includes("valor") ||
                nameLower.includes("quantitativo") ||
                nameLower.includes("banheiros") ||
                nameLower.includes("salas");

            const isCodeOrId = nameLower.includes("inep") || nameLower.includes("cpf") || nameLower.includes("telefone") || nameLower.includes("cep");

            if (isNumericField && !isCodeOrId) {
                // REGRA DE OURO: 1 a 10
                const randomVal = Math.floor(Math.random() * 10) + 1;
                setNativeValue(el, randomVal.toString());
            } else {
                let val = "Dado Automático";
                if (nameLower.includes("inep")) val = "12345678";
                if (nameLower.includes("cep")) val = "66000-000";
                if (nameLower.includes("email")) val = `teste.${Math.floor(Math.random() * 999)}@escola.com`;
                if (nameLower.includes("telefone") || nameLower.includes("celular") || nameLower.includes("contato")) val = "(91) 99999-9999";
                if (nameLower.includes("cpf")) val = "000.000.000-00";
                if (nameLower.includes("data")) val = "2024-01-01";
                if (tagName === "textarea") val = "Observação gerada automaticamente para testes.";

                setNativeValue(el, val);
            }
        });
        
        console.log("✅ AutoFiller: Passo concluído! Avance manualmente para o próximo.");

    } catch (error) {
        console.error("Erro no AutoFiller:", error);
    } finally {
        setIsRunning(false);
    }
  };

  return (
    <Button 
        type="button"
        variant="outline" 
        size="sm" 
        onClick={fillCurrentStep} 
        disabled={isRunning}
        className="fixed bottom-4 right-4 z-50 gap-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border-yellow-300 shadow-lg transition-all active:scale-95"
        title="Preencher campos desta tela"
    >
        <Wand2 className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
        {isRunning ? "Preenchendo..." : "Auto Fill (Esta Tela)"}
    </Button>
  );
}