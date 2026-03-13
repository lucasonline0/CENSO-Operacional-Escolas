import { useEffect, useState, useRef } from "react";
import { UseFormReset, FieldValues } from "react-hook-form";

export function useCensusPersistence<T extends FieldValues>(
  schoolId: number | null | undefined,
  stepKey: string,
  reset: UseFormReset<T>,
  defaultValues: T,
  endpoint: string = "census" 
) {
  const [isLoading, setIsLoading] = useState(true);
  const isClearedRef = useRef(false);

  useEffect(() => {
    if (!schoolId) {
        setIsLoading(false);
        return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        let serverData = {};

        try {
          const baseUrl = process.env.NEXT_PUBLIC_API_URL;
          
          if (!baseUrl) {
             console.warn("API URL não configurada");
          }

          const url = endpoint === "schools" 
            ? `${baseUrl}/v1/schools?id=${schoolId}`
            : `${baseUrl}/v1/census?school_id=${schoolId}`;
            
          const response = await fetch(url, {
              cache: "no-store",
              headers: {
                  "Cache-Control": "no-cache",
                  "Pragma": "no-cache"
              }
          });
          
          if (response.ok) {
            const json = await response.json();
            
            if (json.data) {
                // CORREÇÃO: Se for censo, os campos estão dentro de json.data.data
                if (endpoint === "census") {
                    if (json.data.data) {
                        // Garante que se vier como string JSON do banco, ele faça o parse
                        serverData = typeof json.data.data === 'string' 
                            ? JSON.parse(json.data.data) 
                            : json.data.data;
                    } else {
                        serverData = json.data;
                    }
                } else {
                    serverData = json.data;
                }
            }
          }
        } catch (e) {
          console.warn(`[Persistence] Erro ao buscar do servidor (${stepKey}):`, e);
        }

        let localData = {};
        const localJson = localStorage.getItem(`censo_draft_${schoolId}_${stepKey}_v1`);
        if (localJson) {
          try {
            localData = JSON.parse(localJson);
          } catch (e) {
            console.error("Erro ao parsear localStorage", e);
          }
        }

        // O merge garante que o cache local (se houver) sobrescreva o servidor, 
        // e o servidor sobrescreva os defaultValues vazios.
        const finalData = {
          ...defaultValues,
          ...serverData,
          ...localData,
        };

        reset(finalData);
      } catch (error) {
        console.error(`[Persistence] Erro fatal em ${stepKey}:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [schoolId, stepKey, endpoint, reset]); 

  const saveLocalDraft = (data: T) => {
    if (isClearedRef.current || !schoolId) return;
    localStorage.setItem(`censo_draft_${schoolId}_${stepKey}_v1`, JSON.stringify(data));
  };

  const clearLocalDraft = () => {
    isClearedRef.current = true;
    if (schoolId) {
        localStorage.removeItem(`censo_draft_${schoolId}_${stepKey}_v1`);
    }
  };

  return { isLoading, saveLocalDraft, clearLocalDraft };
}