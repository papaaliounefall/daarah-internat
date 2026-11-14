import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ToastItem { id: number; kind: 'success' | 'error'; message: string }
interface ToastApi { success: (m: string) => void; error: (m: string) => void }

const Ctx = createContext<ToastApi>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(Ctx);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, kind, message }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const api: ToastApi = { success: m => push('success', m), error: m => push('error', m) };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2" aria-live="polite">
        {items.map(t => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm ${t.kind === 'error' ? 'border-danger/40' : 'border-brand-200'}`}>
            {t.kind === 'error'
              ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};
