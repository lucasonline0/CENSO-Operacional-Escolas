"use client";

import { cn } from "@/lib/utils";
import { Check, Circle, Dot } from "lucide-react";

interface StepperProps {
  steps: { title: string; id: string }[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav aria-label="Progresso do Censo" className="w-full">
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;

          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!isCompleted && !isActive} // só deixo clicar pra voltar
                onClick={() => onStepClick?.(index)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50",
                  isCompleted ? "text-slate-900" : "text-slate-500"
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    isActive
                      ? "border-blue-600 bg-blue-600 text-white"
                      : isCompleted
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-slate-300 bg-transparent"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3 w-3" />
                  ) : isActive ? (
                    <Dot className="h-4 w-4 scale-150" />
                  ) : (
                    <Circle className="h-3 w-3 opacity-0" />
                  )}
                </div>
                <span className="truncate">{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}