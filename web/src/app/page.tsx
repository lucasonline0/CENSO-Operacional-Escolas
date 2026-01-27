"use client";

import { useState, useEffect } from "react";
/* eslint-disable @next/next/no-img-element */ 
import { Stepper } from "@/components/ui/stepper";
import { CENSUS_STEPS } from "@/config/steps";
import { IdentificationForm } from "@/components/forms/identification-form";
import { GeneralDataForm } from "@/components/forms/general-data-form";
import { MerendaForm } from "@/components/forms/merenda-form"; 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

const STORAGE_KEY_SCHOOL_ID = "census_current_school_id";
const STORAGE_KEY_STEP = "census_current_step";

export default function CensusPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (typeof window !== "undefined") {
            const savedId = localStorage.getItem(STORAGE_KEY_SCHOOL_ID);
            const savedStep = localStorage.getItem(STORAGE_KEY_STEP);

            let hasId = false;

            if (savedId && !isNaN(parseInt(savedId))) {
                setSchoolId(parseInt(savedId));
                hasId = true;
            }
            
            if (hasId && savedStep && !isNaN(parseInt(savedStep))) {
                setCurrentStep(parseInt(savedStep));
            }
        }
        setIsInitialized(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isInitialized && schoolId) {
      localStorage.setItem(STORAGE_KEY_SCHOOL_ID, schoolId.toString());
    }
  }, [schoolId, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem(STORAGE_KEY_STEP, currentStep.toString());
    }
  }, [currentStep, isInitialized]);

  const handleStepClick = (index: number) => {
    if (schoolId) setCurrentStep(index);
  };

  const handleIdentificationSuccess = (id: number) => {
    setSchoolId(id);
    setCurrentStep(1); 
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRequestReset = () => {
    setShowResetModal(true);
  };

  const handleConfirmReset = () => {
      localStorage.removeItem(STORAGE_KEY_SCHOOL_ID);
      localStorage.removeItem(STORAGE_KEY_STEP);
      localStorage.removeItem("censo_draft_identification_v1");
      localStorage.removeItem("censo_draft_merenda_v1");
      
      setSchoolId(null);
      setCurrentStep(0);
      window.location.reload();
  };

  if (!isInitialized) return null;

  return (
    <div className="min-h-screen pb-12">
      <ConfirmationModal 
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleConfirmReset}
        title="Iniciar Nova Escola?"
        description="Isso limpará o progresso atual da sessão neste navegador. Os dados que você já salvou (clicou em 'Salvar') permanecem seguros no banco de dados."
        confirmText="Sim, Limpar e Iniciar"
        variant="destructive"
      />

      <header className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/40 backdrop-blur-md shadow-sm mb-8">
        <div className="container mx-auto px-4 h-24 flex items-center gap-6">
            <div className="shrink-0 drop-shadow-md">
                <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/b/bc/Bras%C3%A3o_do_Par%C3%A1.svg" 
                    alt="Brasão do Pará" 
                    className="h-16 w-auto"
                />
            </div>
            <div className="flex flex-col justify-center text-slate-800">
                <h2 className="text-sm font-medium uppercase tracking-wide opacity-80">
                    Secretaria de Estado de Educação
                </h2>
                <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-900 py-0.5">
                    Censo Operacional e Estrutural das Escolas
                </h1>
                <h3 className="text-sm md:text-base font-light text-slate-600">
                    Levantamento Estrutural, Recursos Humanos e Perfil Escolar
                </h3>
            </div>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          
          <aside className="hidden lg:block">
            <div className="sticky top-32 space-y-4">
              <div className="rounded-2xl border border-white/40 bg-white/40 p-4 backdrop-blur-md shadow-lg">
                <h2 className="mb-4 px-2 text-sm font-semibold tracking-wider text-slate-500 uppercase">
                  Navegação
                </h2>
                <div className="space-y-1">
                  <Stepper 
                    steps={CENSUS_STEPS} 
                    currentStep={currentStep} 
                    onStepClick={handleStepClick}
                  />
                </div>
                <div className="mt-6 pt-4 border-t border-white/20">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRequestReset} 
                    className="w-full justify-start text-xs text-slate-500 hover:text-red-600 hover:bg-red-50/50"
                  >
                    Nova Escola / Limpar
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="lg:hidden mb-6 flex justify-between items-center rounded-xl bg-white/40 p-4 backdrop-blur-md border border-white/40">
                <div>
                  <h1 className="text-lg font-bold text-slate-800">Passo {currentStep + 1}</h1>
                  <p className="text-xs text-slate-500">{CENSUS_STEPS[currentStep].title}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleRequestReset}>Recomeçar</Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  {CENSUS_STEPS[currentStep].title}
                </CardTitle>
                <CardDescription>
                  Preencha os dados abaixo com atenção.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                
                {currentStep === 0 && (
                  <IdentificationForm 
                    onSuccess={handleIdentificationSuccess} 
                    initialId={schoolId} 
                  />
                )}

                {currentStep === 1 && schoolId && (
                    <GeneralDataForm 
                        schoolId={schoolId}
                        onSuccess={() => {
                            setCurrentStep(2); 
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        onBack={() => setCurrentStep(0)}
                    />
                )}

                {currentStep === 2 && schoolId && (
                    <MerendaForm 
                        schoolId={schoolId}
                        onSuccess={() => {
                            setCurrentStep(3); 
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        onBack={() => setCurrentStep(1)}
                    />
                )}

                {currentStep > 2 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                    <div className="mb-4 rounded-full bg-blue-50/50 p-4 backdrop-blur-sm">
                      <span className="text-3xl">🚧</span>
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">Em Desenvolvimento</h3>
                    <p>O formulário para <strong>{CENSUS_STEPS[currentStep].title}</strong> está sendo construído.</p>
                    <p className="mt-2 text-xs font-mono text-slate-400">Escola ID Vinculado: {schoolId}</p>
                    <div className="mt-8 flex gap-4">
                        <button onClick={() => setCurrentStep(prev => prev - 1)} className="text-sm text-blue-600 hover:underline">
                            ← Voltar
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