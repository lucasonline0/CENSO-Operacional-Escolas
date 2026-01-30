"use client";

import { useState } from "react";
import { IdentificationForm } from "@/components/forms/identification-form";
import { GeneralDataForm } from "@/components/forms/general-data-form";
import { GestaoForm } from "@/components/forms/gestao-form";
import { AlunosForm } from "@/components/forms/alunos-form";
import { ServidoresForm } from "@/components/forms/servidores-form";
import { TecnologiaForm } from "@/components/forms/tecnologia-form";
import { PortariaForm } from "@/components/forms/portaria-form";
import { ServicosGeraisForm } from "@/components/forms/servicos-gerais-form";
import { MerendaForm } from "@/components/forms/merenda-form";
import { ObservacoesForm } from "@/components/forms/observacoes-form";
import { AvaliacaoForm } from "@/components/forms/avaliacao-form"; 
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Card } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { STEPS } from "@/config/steps";

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  // Avança para o próximo passo
  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    window.scrollTo(0, 0);
  };

  // Volta para o passo anterior
  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo(0, 0);
  };

  // Sucesso na identificação (Passo 0)
  const handleIdentificationSuccess = (id: number) => {
    setSchoolId(id);
    handleNext();
  };

  // Reiniciar formulário
  const handleReset = () => {
    setShowResetModal(true);
  };

  const confirmReset = () => {
    setSchoolId(null);
    setCurrentStep(0);
    setShowResetModal(false);
    // Limpar storage local se necessário
    localStorage.clear(); 
    window.location.reload();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <IdentificationForm onSuccess={handleIdentificationSuccess} initialId={schoolId} />;
      case 1:
        return schoolId ? <GeneralDataForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 2:
        return schoolId ? <GestaoForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 3:
        return schoolId ? <AlunosForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 4:
        return schoolId ? <ServidoresForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 5:
        return schoolId ? <TecnologiaForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 6:
        return schoolId ? <PortariaForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 7:
        return schoolId ? <ServicosGeraisForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 8:
        return schoolId ? <MerendaForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 9:
        return schoolId ? <AvaliacaoForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      case 10:
        return schoolId ? <ObservacoesForm schoolId={schoolId} onSuccess={handleNext} onBack={handleBack} /> : null;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen pb-12">
      
      <ConfirmationModal 
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          onConfirm={confirmReset}
          title="Reiniciar Censo"
          description="Tem certeza? Todos os dados não salvos deste computador serão perdidos. O que já foi enviado para o servidor será mantido."
      />

      {/* Header Fixo */}
      <header className="bg-blue-900 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-900 font-bold">
              PA
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Censo Escolar 2026</h1>
              <p className="text-xs text-blue-200">SEDUC - Secretaria de Estado de Educação</p>
            </div>
          </div>
          
          {schoolId && (
             <button 
                onClick={handleReset}
                className="text-xs bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded transition-colors"
             >
                Nova Escola
             </button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
            <Stepper 
                steps={STEPS} 
                currentStep={currentStep} 
            />
        </div>

        <Card className="p-6 md:p-8 shadow-lg border-t-4 border-t-blue-600 bg-white">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">{STEPS[currentStep].title}</h2>
                <p className="text-gray-500">{STEPS[currentStep].description}</p>
            </div>
            
            {renderStep()}
        </Card>
      </main>

      <footer className="text-center text-gray-400 text-sm mt-12 mb-4">
        <p>© 2026 SEDUC/PA - Todos os direitos reservados.</p>
        <p className="text-xs mt-1">Desenvolvido pela Equipe de Tecnologia</p>
      </footer>
    </div>
  );
}