import { useEffect, type ReactNode } from 'react';

/** 화면 전환 없이 처리하는 등록·수정용 모달. 배경 클릭·ESC 로 닫는다 */
export default function Modal({
  title,
  width = 560,
  onClose,
  footer,
  children,
}: {
  title: ReactNode;
  width?: number;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-fg/30 p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-sm border border-line bg-surface shadow-lg"
        style={{ width, maxWidth: '100%' }}
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-[19px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-[19px] text-fg-muted hover:text-fg"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="px-3 py-3">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
