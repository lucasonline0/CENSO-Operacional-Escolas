"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  title: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <nav className="flex flex-col space-y-1">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onStepClick(index)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left",
              isCurrent
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors",
                isCompleted
                  ? "border-blue-600 bg-blue-600 text-white"
                  : isCurrent
                  ? "border-blue-600 text-blue-600"
                  : "border-slate-300 group-hover:border-slate-400"
              )}
            >
              {isCompleted ? (
                <Check className="h-3 w-3" />
              ) : isCurrent ? (
                <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              ) : (
                <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">•</span>
              )}
            </div>
            <span className={cn("truncate", isCurrent ? "font-semibold" : "")}>
              {step.title}
            </span>
          </button>
        );
      })}
    </nav>
  );
}