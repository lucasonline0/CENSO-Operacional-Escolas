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

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { jsPDF } from "jspdf";
import { FileText } from "lucide-react";

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

  const handleDownloadProof = () => {
    const doc = new jsPDF();
    const currentDate = new Date();
    
    doc.setFontSize(22);
    doc.text("Comprovante de Preenchimento", 105, 30, { align: "center" });
    
    doc.setFontSize(14);
    doc.text("Censo Operacional e Estrutural das Escolas", 105, 40, { align: "center" });
    doc.text("Secretaria de Estado de Educação", 105, 48, { align: "center" });

    doc.setLineWidth(0.5);
    doc.line(20, 55, 190, 55);

    doc.setFontSize(12);
    doc.text(`ID da Escola: ${schoolId || "N/A"}`, 20, 70);
    doc.text(`Data de Finalização: ${currentDate.toLocaleDateString()}`, 20, 80);
    doc.text(`Horário: ${currentDate.toLocaleTimeString()}`, 20, 90);
    
    doc.setFontSize(16);
    doc.setTextColor(0, 128, 0); 
    doc.text("STATUS: FINALIZADO COM SUCESSO", 105, 110, { align: "center" });
    doc.setTextColor(0, 0, 0); 

    doc.setFontSize(11);
    doc.text("Certificamos que todos os formulários e dados solicitados pelo Censo", 20, 130);
    doc.text("Operacional foram preenchidos e salvos corretamente no sistema.", 20, 136);
    
    doc.text("Este documento serve como comprovante temporário de que a escola", 20, 150);
    doc.text("realizou o procedimento de atualização cadastral exigido.", 20, 156);

    doc.setLineWidth(0.5);
    doc.line(20, 250, 190, 250);
    doc.setFontSize(10);
    doc.text("Sistema de Censo Escolar - SEDUC", 105, 260, { align: "center" });
    
    doc.save(`comprovante-censo-${schoolId}-${currentDate.getTime()}.pdf`);
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
                  
                  <div className="space-y-3 w-full">
                    <Button onClick={handleDownloadProof} variant="outline" className="w-full border-blue-200 hover:bg-blue-50 text-blue-700">
                        <FileText className="mr-2 h-4 w-4" />
                        Baixar Comprovante PDF
                    </Button>
                    
                    <Button onClick={handleConfirmReset} className="w-full bg-blue-600 hover:bg-blue-700">
                        Iniciar Novo Censo
                    </Button>
                  </div>
              </Card>
          </div>
      )
  }

  return (
    <div className="min-h-screen pb-12">
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
