import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { errorMessage, isApprovalPending, isForbidden, forbiddenMessage } from '@/api/types';
import { ToastContext, type ToastApi } from './toastContext';

/** notice = 실패는 아니지만 성공도 아닌 것. 승인 대기·권한 안내 */
type Tone = 'ok' | 'error' | 'notice';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

const TONE_CLASS: Record<Tone, string> = {
  ok: 'border-accent/40 bg-accent/10 text-accent',
  error: 'border-danger/40 bg-danger/10 text-danger',
  notice: 'border-line bg-bg text-fg-sub',
};

/**
 * 던져진 것을 알림 한 줄로 바꾼다.
 *
 * 승인 대기(202)와 권한 없음(403)은 호출한 쪽에서 보면 똑같이 "성공하지 못함" 이라
 * onError 로 들어오지만, 사람에게는 오류가 아니다. 빨간 상자로 띄우면 뭔가
 * 잘못된 줄 알고 다시 누르게 된다.
 */
const toneOf = (e: unknown): Tone => (isApprovalPending(e) || isForbidden(e) ? 'notice' : 'error');

const textOf = (e: unknown): string => {
  if (isApprovalPending(e)) {
    /* 승인 화면에서 이 건을 찾을 수 있도록 번호를 같이 적는다 */
    return e.approvalRequestId == null ? e.message : `${e.message} (요청번호 ${e.approvalRequestId})`;
  }
  return isForbidden(e) ? forbiddenMessage(e) : errorMessage(e);
};

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
      fail: (e) => push(toneOf(e), textOf(e)),
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
            className={`rounded-sm border px-3 py-2 text-[18px] shadow-sm ${TONE_CLASS[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
