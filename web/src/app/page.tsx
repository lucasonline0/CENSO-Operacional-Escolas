"use client";

import { useState, useEffect } from "react";
/* eslint-disable @next/next/no-img-element */ 
import { Stepper } from "@/components/ui/stepper";
import { CENSUS_STEPS } from "@/config/steps";
import { IdentificationForm } from "@/components/forms/identification-form";
import { GeneralDataForm } from "@/components/forms/general-data-form";
import { MerendaForm } from "@/components/forms/merenda-form"; 
import { ServicosGeraisForm } from "@/components/forms/servicos-gerais-form";
import { PortariaForm } from "@/components/forms/portaria-form";
import { TecnologiaForm } from "@/components/forms/tecnologia-form";
import { ServidoresForm } from "@/components/forms/servidores-form";
import { AlunosForm } from "@/components/forms/alunos-form";
import { GestaoForm } from "@/components/forms/gestao-form";
import { AvaliacaoForm } from "@/components/forms/avaliacao-form";
import { ObservacoesForm } from "@/components/forms/observacoes-form";
import { AutoFiller } from "@/dev/auto-filler"; 

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
  const [isCompleted, setIsCompleted] = useState(false);

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
                const step = parseInt(savedStep);
                if (step >= 12) setIsCompleted(true);
                setCurrentStep(step);
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
    if (schoolId && !isCompleted) setCurrentStep(index);
  };

  const handleIdentificationSuccess = (id: number) => {
    setSchoolId(id);
    setCurrentStep(1); 
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCompletion = () => {
    setIsCompleted(true);
    setCurrentStep(12);
    localStorage.removeItem(STORAGE_KEY_SCHOOL_ID); 
  };

  const handleRequestReset = () => {
    setShowResetModal(true);
  };

  const handleConfirmReset = () => {
      localStorage.clear(); 
      setSchoolId(null);
      setCurrentStep(0);
      setIsCompleted(false);
      window.location.reload();
  };

  if (!isInitialized) return null;

  if (isCompleted) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
              <Card className="w-full max-w-md text-center p-8 shadow-xl border-green-200 bg-white">
                  <div className="mb-6 flex justify-center">
                      <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-5xl">✅</span>
                      </div>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">Censo Finalizado com Sucesso!</h1>
                  <p className="text-slate-600 mb-8">
                      Todas as informações foram salvas no sistema da SEDUC. Obrigado pela sua colaboração.
                  </p>
                  <Button onClick={handleConfirmReset} className="w-full bg-blue-600 hover:bg-blue-700">
                      Iniciar Novo Censo
                  </Button>
              </Card>
          </div>
      )
  }

  return (
    <div className="min-h-screen pb-12">
      <AutoFiller />

      <ConfirmationModal 
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleConfirmReset}
        title="Iniciar Nova Escola?"
        description="Isso limpará o progresso atual. Dados já salvos permanecem no banco."
        confirmText="Sim, Limpar"
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
            </div>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          
          <aside className="hidden lg:block">
            <div className="sticky top-32 space-y-4">
              <div className="rounded-2xl border border-white/40 bg-white/40 p-4 backdrop-blur-md shadow-lg">
                <Stepper 
                  steps={CENSUS_STEPS} 
                  currentStep={currentStep} 
                  onStepClick={handleStepClick}
                />
                <div className="mt-6 pt-4 border-t border-white/20">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRequestReset} 
                    className="w-full justify-start text-xs text-red-500 hover:bg-red-50"
                  >
                    Nova Escola / Limpar
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{CENSUS_STEPS[currentStep]?.title || "Finalização"}</CardTitle>
                <CardDescription>Preencha os dados abaixo com atenção.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                
                {currentStep === 0 && <IdentificationForm onSuccess={handleIdentificationSuccess} initialId={schoolId} />}

                {currentStep === 1 && schoolId && <GeneralDataForm schoolId={schoolId} onSuccess={() => { setCurrentStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(0)} />}

                {currentStep === 2 && schoolId && <MerendaForm schoolId={schoolId} onSuccess={() => { setCurrentStep(3); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(1)} />}

                {currentStep === 3 && schoolId && <ServicosGeraisForm schoolId={schoolId} onSuccess={() => { setCurrentStep(4); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(2)} />}

                {currentStep === 4 && schoolId && <PortariaForm schoolId={schoolId} onSuccess={() => { setCurrentStep(5); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(3)} />}

                {currentStep === 5 && schoolId && <TecnologiaForm schoolId={schoolId} onSuccess={() => { setCurrentStep(6); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(4)} />}

                {currentStep === 6 && schoolId && <ServidoresForm schoolId={schoolId} onSuccess={() => { setCurrentStep(7); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(5)} />}

                {currentStep === 7 && schoolId && <AlunosForm schoolId={schoolId} onSuccess={() => { setCurrentStep(8); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(6)} />}

                {currentStep === 8 && schoolId && <GestaoForm schoolId={schoolId} onSuccess={() => { setCurrentStep(9); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(7)} />}

                {currentStep === 9 && schoolId && <AvaliacaoForm schoolId={schoolId} onSuccess={() => { setCurrentStep(10); window.scrollTo({ top: 0, behavior: "smooth" }); }} onBack={() => setCurrentStep(8)} />}

                {currentStep === 10 && schoolId && <ObservacoesForm schoolId={schoolId} onSuccess={handleCompletion} onBack={() => setCurrentStep(9)} />}

              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}