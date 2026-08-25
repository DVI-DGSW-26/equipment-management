import { createContext, useContext } from 'react';

export interface ToastApi {
  ok: (message: string) => void;
  fail: (e: unknown) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider 안에서만 사용할 수 있습니다');
  return ctx;
}
