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
        const localJson = localStorage.getItem(`censo_draft_${schoolId}_${stepKey}_v1`);
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