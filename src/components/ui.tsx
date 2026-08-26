import type { ReactNode } from 'react';
import { errorMessage } from '@/api/types';

/* 공통 클래스. 사내 관리 도구 — 정보 밀도 우선, 애니메이션 없음 */

export const inputClass =
  'w-full shrink-0 rounded-sm border border-line bg-surface px-2 py-1.5 text-[19px] outline-none focus:border-accent disabled:bg-bg disabled:text-fg-muted';

export const btnClass =
  'shrink-0 whitespace-nowrap rounded-sm border border-line bg-surface px-3 py-1.5 text-[18px] text-fg-sub hover:bg-bg disabled:opacity-50';

export const btnPrimaryClass =
  'shrink-0 whitespace-nowrap rounded-sm bg-accent px-3 py-1.5 text-[18px] text-white hover:opacity-90 disabled:opacity-50';

export const btnDangerClass =
  'shrink-0 whitespace-nowrap rounded-sm border border-danger/40 bg-surface px-3 py-1.5 text-[18px] text-danger hover:bg-danger/5 disabled:opacity-50';

export const thClass = 'px-3 py-2 font-medium';

export function Section({
  title,
  right,
  children,
  className = '',
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-sm border border-line bg-surface ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-3 py-2">
          <h2 className="text-[19px] font-semibold">{title}</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">{right}</div>
        </div>
      )}
      {/* 좁은 화면에서 표가 넘칠 때 본문만 옆으로 밀린다. 화면 전체는 밀리지 않는다 */}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export interface StatCard {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'danger' | 'warn';
  /** 주면 카드가 필터 버튼이 된다 (안전검사 기한 필터) */
  onClick?: () => void;
  /** onClick 이 있을 때 선택 상태 */
  active?: boolean;
}

const TONE: Record<NonNullable<StatCard['tone']>, string> = {
  default: '',
  danger: 'text-danger',
  warn: 'text-warn',
};

/** 좁은 화면에서는 2칸으로 접고, 넓어지면 카드 수만큼 펼친다 */
const STAT_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
};

export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${STAT_COLS[cards.length] ?? 'md:grid-cols-4'}`}>
      {cards.map((c) => {
        const body = (
          <>
            <div className="text-[18px] text-fg-sub">{c.label}</div>
            <div className={`num mt-1 text-[30px] font-semibold ${TONE[c.tone ?? 'default']}`}>
              {c.value}
            </div>
            {c.hint && <div className="mt-0.5 text-[17px] text-fg-muted">{c.hint}</div>}
          </>
        );

        if (!c.onClick)
          return (
            <div key={c.label} className="rounded-sm border border-line bg-surface px-4 py-3">
              {body}
            </div>
          );

        return (
          <button
            key={c.label}
            type="button"
            onClick={c.onClick}
            aria-pressed={c.active}
            className={[
              'rounded-sm border px-4 py-3 text-left',
              c.active
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-line bg-surface hover:border-fg-muted',
            ].join(' ')}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({
  tone = 'muted',
  children,
  title,
}: {
  tone?: 'muted' | 'warn' | 'danger' | 'accent';
  children: ReactNode;
  title?: string;
}) {
  const cls = {
    muted: 'border-line text-fg-muted',
    warn: 'border-warn/40 bg-warn/10 text-warn',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    accent: 'border-accent/40 bg-accent/10 text-accent',
  }[tone];
  return (
    <span title={title} className={`rounded-sm border px-1.5 py-0.5 text-[17px] ${cls}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[18px] text-fg-sub">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-0.5 block text-[17px] text-fg-muted">{hint}</span>}
      {error && <span className="mt-0.5 block text-[17px] text-danger">{error}</span>}
    </label>
  );
}

/** 읽기 전용 정의 목록 한 칸 */
export function Def({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-2">
      <div className="text-[17px] text-fg-muted">{label}</div>
      <div className="text-[19px]">{children ?? '-'}</div>
    </div>
  );
}

/** 로딩·에러·빈 상태를 표에서 동일하게 처리 */
export function QueryState({
  isPending,
  error,
  isEmpty,
  emptyText = '데이터가 없습니다.',
}: {
  isPending: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyText?: ReactNode;
}) {
  if (isPending) return <p className="px-3 py-6 text-[19px] text-fg-sub">불러오는 중…</p>;
  if (error) return <p className="px-3 py-6 text-[19px] text-danger">{errorMessage(error)}</p>;
  if (isEmpty) return <p className="px-3 py-6 text-[19px] text-fg-muted">{emptyText}</p>;
  return null;
}

export function Pagination({
  page,
  totalPages,
  total,
  size,
  onChange,
  onSizeChange,
}: {
  /** 0-base */
  page: number;
  totalPages: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
  onSizeChange?: (size: number) => void;
}) {
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line px-3 py-2 text-[18px] text-fg-sub">
      <span>
        {from.toLocaleString('ko-KR')}–{to.toLocaleString('ko-KR')} / 총{' '}
        {total.toLocaleString('ko-KR')}건
      </span>
      <div className="flex items-center gap-2">
        {onSizeChange && (
          <select
            className="rounded-sm border border-line bg-surface px-1 py-0.5"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          >
            {[20, 50, 100, 200].map((s) => (
              <option key={s} value={s}>
                {s}건씩
              </option>
            ))}
          </select>
        )}
        <button type="button" className={btnClass} disabled={page <= 0} onClick={() => onChange(0)}>
          처음
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={page <= 0}
          onClick={() => onChange(page - 1)}
        >
          이전
        </button>
        <span>
          {totalPages === 0 ? 0 : page + 1} / {totalPages}
        </span>
        <button
          type="button"
          className={btnClass}
          disabled={page + 1 >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          다음
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={page + 1 >= totalPages}
          onClick={() => onChange(totalPages - 1)}
        >
          마지막
        </button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={[
            'shrink-0 whitespace-nowrap px-3 py-2 text-[19px] rounded-t-sm border border-b-0',
            value === t.key
              ? 'border-line bg-surface font-medium'
              : 'border-transparent text-fg-sub hover:bg-surface/60',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
