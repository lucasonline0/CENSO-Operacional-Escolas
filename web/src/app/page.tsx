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

  const handleDownloadProof = async () => {
    const doc = new jsPDF();
    const currentDate = new Date();
    
    try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Bras%C3%A3o_do_Par%C3%A1.svg/200px-Bras%C3%A3o_do_Par%C3%A1.svg.png";
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        
        doc.addImage(img, "PNG", 15, 10, 25, 25);
    } catch (e) {
        console.error("Erro ao carregar imagem", e);
        doc.setFontSize(8);
        doc.text("[Brasão Oficial]", 20, 20);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("GOVERNO DO ESTADO DO PARÁ", 50, 18);
    
    doc.setFontSize(12);
    doc.text("SECRETARIA DE ESTADO DE EDUCAÇÃO - SEDUC", 50, 25);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("CENSO OPERACIONAL E ESTRUTURAL DAS ESCOLAS", 50, 32);

    doc.setLineWidth(0.5);
    doc.line(15, 40, 195, 40);
    doc.setLineWidth(0.2);
    doc.line(15, 42, 195, 42);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("COMPROVANTE DE PREENCHIMENTO", 105, 60, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const introText = "A Secretaria de Estado de Educação certifica que os dados referentes ao levantamento estrutural e operacional foram registrados com sucesso no sistema central de monitoramento escolar.";
    const splitIntro = doc.splitTextToSize(introText, 170);
    doc.text(splitIntro, 20, 75);

    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(200, 200, 200);
    doc.rect(20, 90, 170, 45, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text("IDENTIFICADOR DA ESCOLA (ID):", 25, 100);
    
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`${schoolId || "N/A"}`, 25, 108);

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text("DATA DE REGISTRO:", 100, 100);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(currentDate.toLocaleDateString("pt-BR"), 100, 108);

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text("HORÁRIO:", 150, 100);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(currentDate.toLocaleTimeString("pt-BR"), 150, 108);

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text("SITUAÇÃO:", 25, 122);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 128, 0);
    doc.text("DADOS ENVIADOS COM SUCESSO", 25, 129);
    
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DADOS DO RESPONSÁVEL PELO PREENCHIMENTO", 20, 155);
    
    doc.setLineWidth(0.2);
    doc.line(20, 158, 190, 158);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    doc.text("Nome do Responsável:", 20, 170);
    doc.setDrawColor(0, 0, 0);
    doc.line(60, 170, 190, 170);
    
    doc.text("Cargo / Função:", 20, 185);
    doc.line(50, 185, 110, 185);

    doc.text("Matrícula / CPF:", 115, 185);
    doc.line(145, 185, 190, 185);

    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 80, 80);
    const declarationText = "Declaro que as informações prestadas neste formulário são verdadeiras e refletem a realidade da unidade escolar na presente data, estando ciente da responsabilidade administrativa, civil e penal pela veracidade dos dados.";
    const splitDeclaration = doc.splitTextToSize(declarationText, 170);
    doc.text(splitDeclaration, 20, 205);

    doc.setDrawColor(0, 0, 0);
    doc.line(55, 240, 155, 240);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text("Assinatura do Declarante", 105, 245, { align: "center" });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Secretaria de Estado de Educação do Pará - Sistema de Censo Escolar 2026", 105, 280, { align: "center" });
    doc.text(`Hash de Autenticação: ${currentDate.getTime().toString(16).toUpperCase()}-${(schoolId || 0).toString(16)}`, 105, 285, { align: "center" });

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
