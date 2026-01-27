"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
}: ConfirmationModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isOpen) {
        document.body.style.overflow = 'hidden';
        timer = setTimeout(() => {
            setIsVisible(true);
        }, 10);
    } else {
        document.body.style.overflow = 'unset';
        timer = setTimeout(() => {
            setIsVisible(false);
        }, 200);
    }

    return () => {
        clearTimeout(timer);
        document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div 
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className={`
        relative z-10 w-full max-w-md transform overflow-hidden 
        rounded-3xl border border-white/40 bg-white/75 p-6 
        shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl 
        transition-all duration-200 
        ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
      `}>
        <h3 className="text-lg font-bold leading-6 text-slate-800">
          {title}
        </h3>
        <div className="mt-2">
          <p className="text-sm text-slate-600 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="hover:bg-slate-200/50 text-slate-600 hover:text-slate-900"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={
                variant === "destructive" 
                ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 border-0" 
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 border-0"
            }
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}