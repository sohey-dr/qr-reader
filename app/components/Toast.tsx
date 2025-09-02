"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastItem = {
  id: number;
  message: string;
  duration: number;
};

type ToastContextValue = {
  show: (message: string, opts?: { duration?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No provider found; provide a no-op to avoid hard crashes in edge cases.
    return { show: () => {} };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, opts?: { duration?: number }) => {
    const duration = Math.max(1000, opts?.duration ?? 2000);
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, duration }]);
    window.setTimeout(() => remove(id), duration);
  }, [remove]);

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast viewport */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex items-end justify-center px-2"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        <div className="flex w-full max-w-md flex-col items-stretch gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto rounded-md border border-black/10 bg-foreground px-3 py-2 text-sm text-background shadow-lg dark:border-white/15"
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

