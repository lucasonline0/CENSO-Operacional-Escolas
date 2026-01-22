import { IdentificationForm } from "@/components/forms/identification-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Header do Formulário */}
        <div className="bg-white p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">1. Identificação da Escola</h1>
              <p className="text-sm text-gray-500">Preencha os dados cadastrais da unidade escolar.</p>
            </div>
            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
              Seção 1 de 14
            </span>
          </div>
        </div>

        {/* Área do Formulário */}
        <div className="p-6 md:p-8">
          <IdentificationForm />
        </div>

      </div>
      
    </main>
  );
}