import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { errorMessage } from '@/api/types';
import { ToastContext, type ToastApi } from './toastContext';

type Tone = 'ok' | 'error';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

/** 저장·삭제 결과를 화면 전환 없이 알려준다 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: Tone, message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      ok: (message) => push('ok', message),
      fail: (e) => push('error', errorMessage(e)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed right-4 bottom-4 z-[60] flex w-[360px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              'rounded-sm border px-3 py-2 text-[18px] shadow-sm',
              t.tone === 'ok'
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-danger/40 bg-danger/10 text-danger',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
