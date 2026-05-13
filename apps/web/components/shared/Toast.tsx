"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { Check, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "info" | "warning" | "error";

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-slide-up transition-all ${
              t.type === "success" ? "bg-surface border-success/30 text-text-1" :
              t.type === "error" ? "bg-surface border-p0/30 text-text-1" :
              t.type === "warning" ? "bg-surface border-amber-500/30 text-text-1" :
              "bg-surface border-border text-text-1"
            }`}
          >
            {t.type === "success" && <Check size={16} className="text-success" />}
            {t.type === "info" && <Info size={16} className="text-accent" />}
            {t.type === "warning" && <AlertTriangle size={16} className="text-amber-500" />}
            {t.type === "error" && <AlertTriangle size={16} className="text-p0" />}
            
            <p className="text-sm font-medium">{t.message}</p>
            
            <button 
              onClick={() => removeToast(t.id)} 
              className="ml-4 text-text-3 hover:text-text-2 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
