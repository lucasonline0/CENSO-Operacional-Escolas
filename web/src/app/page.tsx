"use client";

import { useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { CENSUS_STEPS } from "@/config/steps";
import { IdentificationForm } from "@/components/forms/identification-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function CensusPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [schoolId, setSchoolId] = useState<number | null>(null);

  const handleStepClick = (index: number) => {
    // só permito navegar se tiver schoolId (ou seja, passou da etapa 1)
    if (schoolId) {
      setCurrentStep(index);
    }
  };

  const handleIdentificationSuccess = (id: number) => {
    setSchoolId(id);
    setCurrentStep(1); // avança pro passo 2
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          
          {/* menu lateral */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 space-y-4">
              <div className="px-3 py-2">
                <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                  Censo 2026
                </h2>
                <div className="space-y-1">
                  <Stepper 
                    steps={CENSUS_STEPS} 
                    currentStep={currentStep} 
                    onStepClick={handleStepClick}
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* área principal */}
          <main className="space-y-6">
            
            {/* cabeçalho mobile (só aparece em telas pequenas) */}
            <div className="lg:hidden mb-6">
                <h1 className="text-xl font-bold mb-2">Passo {currentStep + 1} de {CENSUS_STEPS.length}</h1>
                <p className="text-slate-500">{CENSUS_STEPS[currentStep].title}</p>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-white/50 px-6 py-4">
                <CardTitle className="text-xl text-slate-800">
                  {CENSUS_STEPS[currentStep].title}
                </CardTitle>
                <CardDescription>
                  Preencha os dados abaixo com atenção.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                
                {/* RENDERIZAÇÃO CONDICIONAL DOS FORMULÁRIOS */}
                
                {currentStep === 0 && (
                  <IdentificationForm onSuccess={handleIdentificationSuccess} />
                )}

                {currentStep > 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                    <div className="mb-4 rounded-full bg-blue-50 p-3">
                      <span className="text-2xl">🚧</span>
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">Em Desenvolvimento</h3>
                    <p>O formulário para <strong>{CENSUS_STEPS[currentStep].title}</strong> está sendo construído.</p>
                    <p className="mt-2 text-xs font-mono text-slate-400">Escola ID Vinculado: {schoolId}</p>
                    
                    <div className="mt-8 flex gap-4">
                        <button 
                            onClick={() => setCurrentStep(prev => prev - 1)}
                            className="text-sm text-blue-600 hover:underline"
                        >
                            ← Voltar
                        </button>
                        <button 
                            onClick={() => setCurrentStep(prev => Math.min(prev + 1, CENSUS_STEPS.length - 1))}
                            className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                        >
                            Pular (Debug)
                        </button>
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}