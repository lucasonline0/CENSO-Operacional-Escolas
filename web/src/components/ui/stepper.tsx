import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  steps: { id: string; title: string }[];
  currentStep: number;
  furthestStep?: number; // Propriedade que mantém o rastro de onde o usuário já foi
  onStepClick: (index: number) => void;
}

export function Stepper({ steps, currentStep, furthestStep = 0, onStepClick }: StepperProps) {
  return (
    <div className="flex flex-col gap-4">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        // Se o índice for menor ou igual ao mais distante alcançado E não for o atual, está concluído.
        const isCompleted = index <= furthestStep && index !== currentStep;
        // Bloqueia apenas os passos que o usuário ainda não alcançou
        const isLocked = index > furthestStep;

        return (
          <button
            key={step.id}
            onClick={() => !isLocked && onStepClick(index)}
            disabled={isLocked}
            className={cn(
              "flex items-center gap-3 text-left w-full group transition-all",
              isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            <div
              className={cn(
                // MUDANÇA AQUI: Trocamos rounded-sm por rounded-full
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors", 
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : isCompleted
                  ? "border-green-600 bg-green-50 text-green-700" // Verde para passos verificados
                  : "border-slate-200 bg-slate-50 text-slate-400 group-hover:border-slate-300"
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
            </div>
            <span
              className={cn(
                "text-sm font-medium transition-colors",
                isActive
                  ? "text-primary font-bold"
                  : isCompleted
                  ? "text-slate-700"
                  : "text-slate-400"
              )}
            >
              {step.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
