import { useEffect, useState } from "react";
import { UseFormReset, FieldValues } from "react-hook-form";

// CORREÇÃO: Adicionado 'extends FieldValues' ao genérico T
export function useCensusPersistence<T extends FieldValues>(
  schoolId: number | null | undefined,
  stepKey: string,
  reset: UseFormReset<T>,
  defaultValues: T,
  endpoint: string = "census" 
) {
  const [isLoading, setIsLoading] = useState(true);

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
          const url = endpoint === "schools" 
            ? `http://localhost:8000/v1/schools?id=${schoolId}`
            : `http://localhost:8000/v1/census?school_id=${schoolId}`;
            
          const response = await fetch(url);
          if (response.ok) {
            const json = await response.json();
            if (json.data) {
                serverData = json.data;
            }
          }
        } catch (e) {
          console.warn(`[Persistence] Erro ao buscar do servidor (${stepKey}):`, e);
        }

        let localData = {};
        const localJson = localStorage.getItem(`censo_draft_${stepKey}_v1`);
        if (localJson) {
          try {
            localData = JSON.parse(localJson);
          } catch (e) {
            console.error("Erro ao parsear localStorage", e);
          }
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, stepKey, endpoint, reset]); 

  const saveLocalDraft = (data: T) => {
    localStorage.setItem(`censo_draft_${stepKey}_v1`, JSON.stringify(data));
  };

  const clearLocalDraft = () => {
    localStorage.removeItem(`censo_draft_${stepKey}_v1`);
  };

  return { isLoading, saveLocalDraft, clearLocalDraft };
}