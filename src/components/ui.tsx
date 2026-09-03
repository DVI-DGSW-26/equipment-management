import { useState, type ReactNode } from 'react';
import { ALL_ROWS, PAGE_SIZES } from '@/lib/paging';
import { errorMessage } from '@/api/types';

/* 공통 클래스. 사내 관리 도구 — 정보 밀도 우선, 애니메이션 없음 */

/** 폼 칸. 제 줄을 다 쓴다 (모달·격자 안) */
export const inputClass =
  'w-full shrink-0 rounded-sm border border-line bg-surface px-2 py-1.5 text-[19px] outline-none focus:border-accent disabled:bg-bg disabled:text-fg-muted';

/**
 * 조건줄 칸. 너비를 함께 적어 쓴다 — `${filterClass} w-36`
 *
 * inputClass 와 같되 w-full 만 없다. inputClass 를 쓰고 뒤에 w-36 을 붙여도
 * Tailwind 가 만든 CSS 에서 .w-full 이 더 뒤에 놓여 그쪽이 이긴다(둘 다 클래스 하나라
 * 우선순위가 같다). 그래서 조건줄의 칸들이 저마다 한 줄을 다 먹어 세로로 쌓여
 * 있었다(2026-09-03). 두 값을 한 문자열로 나눠 적어 둔 이유다 —
 * 이어 붙여 만들면 상수 export 가 아니게 돼 fast-refresh 규칙에 걸린다.
 */
export const filterClass =
  'shrink-0 rounded-sm border border-line bg-surface px-2 py-1.5 text-[19px] outline-none focus:border-accent disabled:bg-bg disabled:text-fg-muted';

export const btnClass =
  'shrink-0 whitespace-nowrap rounded-sm border border-line bg-surface px-3 py-1.5 text-[18px] text-fg-sub hover:bg-bg disabled:opacity-50';

export const btnPrimaryClass =
  'shrink-0 whitespace-nowrap rounded-sm bg-accent px-3 py-1.5 text-[18px] text-white hover:opacity-90 disabled:opacity-50';

export const btnDangerClass =
  'shrink-0 whitespace-nowrap rounded-sm border border-danger/40 bg-surface px-3 py-1.5 text-[18px] text-danger hover:bg-danger/5 disabled:opacity-50';

export const thClass = 'px-3 py-2 font-medium';

/** 연번 열은 좁게, 숫자는 오른쪽으로 세운다. 번호 계산은 lib/paging 의 rowNo */
export const seqThClass = `${thClass} w-14 text-right`;

/**
 * 넓은 표를 담는 상자.
 *
 * 표만 감싸면 가로 스크롤바가 표 맨 아래에 붙는다. 행이 많으면 화면을 끝까지
 * 내려야 스크롤바에 닿아서, 오른쪽 열을 보려고 한 번 내렸다 다시 올라와야 한다.
 * 높이를 화면 안으로 묶어 두 방향 스크롤바가 늘 손 닿는 데 있게 한다.
 * 대신 안에서 내릴 때 열 이름이 사라지지 않도록 표 머리를 고정한다(stickyThClass).
 */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="max-h-[70vh] overflow-auto">{children}</div>;
}

/**
 * TableScroll 안에서 스크롤해도 남아 있는 표 머리.
 * 표는 border-collapse 라 고정된 칸의 테두리가 사라진다. 밑줄은 그림자로 그린다.
 */
export const stickyThClass = `${thClass} sticky top-0 z-10 bg-bg shadow-[inset_0_-1px_0_var(--color-line)]`;

/**
 * 목록 위에 놓는 검색칸.
 *
 * 조회 버튼이 없다 — 입력하는 대로 걸러진다. 지우려고 백스페이스를 열 번 누르지 않도록
 * 글자가 있을 때만 지우기 단추를 띄운다. type 은 search 가 아니라 text 다.
 * search 로 두면 브라우저가 제 지우기 단추를 하나 더 그려서 두 개가 겹친다.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  width = 'w-56',
}: {
  value: string;
  onChange: (value: string) => void;
  /** 라벨을 겸한다 — 무엇으로 찾을 수 있는지 여기에 적는다 */
  placeholder: string;
  width?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 items-center ${width}`}>
      <input
        type="text"
        className={`${inputClass} pr-8`}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="검색어 지우기"
          className="absolute right-1 px-1 text-[17px] text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      )}
    </span>
  );
}

/** 걸러낸 건수 표시. 필터가 걸려 있을 때만 전체 건수를 함께 보여 준다 */
export function FilterCount({ shown, total }: { shown: number; total: number }) {
  return (
    <span className="text-[18px] text-fg-muted">
      {shown.toLocaleString('ko-KR')}건
      {shown !== total && ` / 전체 ${total.toLocaleString('ko-KR')}건`}
    </span>
  );
}

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

/**
 * 요약 카드.
 *
 * 라벨을 위에 얹고 값을 큼직하게 두었더니 카드 줄만으로 화면 위쪽을 다 먹어,
 * 정작 목록이 한참 아래로 내려갔다(2026-09-03). 라벨과 값을 한 줄에 눕혀 높이를 반으로
 * 줄인다. 값은 오른쪽으로 몰아 카드끼리 자릿수가 세로로 맞는다.
 */
export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${STAT_COLS[cards.length] ?? 'md:grid-cols-4'}`}>
      {cards.map((c) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[18px] text-fg-sub">{c.label}</span>
              <span className={`num text-[22px] font-semibold ${TONE[c.tone ?? 'default']}`}>
                {c.value}
              </span>
            </div>
            {c.hint && <div className="text-right text-[16px] text-fg-muted">{c.hint}</div>}
          </>
        );

        if (!c.onClick)
          return (
            <div key={c.label} className="rounded-sm border border-line bg-surface px-3 py-1.5">
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
              'rounded-sm border px-3 py-1.5 text-left',
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

/**
 * 여럿을 함께 고르는 칸.
 *
 * 엑셀 필터처럼 "홍길동과 김철수" 를 같이 보고 싶을 때 쓴다. 셀렉트 하나로는 한 사람만
 * 고를 수 있어 두 번 걸러 봐야 했다.
 * 고른 것이 없으면 전체다 — 아무것도 안 고른 상태가 "거르지 않음" 이어야
 * 처음 화면에서 목록이 비지 않는다.
 */
export function MultiPick({
  label,
  selected,
  onChange,
  options,
  width = 'w-40',
}: {
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
  options: string[];
  width?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);

  const text =
    selected.length === 0
      ? `${label} 전체`
      : selected.length === 1
        ? selected[0]
        : `${selected[0]} 외 ${selected.length - 1}`;

  return (
    <span className={`relative inline-block shrink-0 ${width}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${filterClass} w-full truncate text-left ${
          selected.length > 0 ? 'border-accent text-accent' : 'text-fg'
        }`}
        title={selected.length > 0 ? selected.join(', ') : undefined}
      >
        {text}
      </button>
      {open && (
        <>
          {/* 바깥을 누르면 닫힌다 */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-20 mt-0.5 max-h-64 w-56 overflow-auto rounded-sm border border-line bg-surface p-1 shadow-lg">
            {options.length === 0 && (
              <p className="px-2 py-1.5 text-[17px] text-fg-muted">고를 값이 없습니다.</p>
            )}
            {options.map((o) => (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[18px] hover:bg-bg"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => toggle(o)}
                />
                {o}
              </label>
            ))}
            {selected.length > 0 && (
              <button
                type="button"
                className="mt-1 w-full border-t border-line px-2 py-1 text-left text-[17px] text-fg-muted hover:text-fg"
                onClick={() => onChange([])}
              >
                모두 지우기
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
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
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s === ALL_ROWS ? '전체 보기' : `${s}건씩`}
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
  /*
   * 고른 탭이 눈에 잘 안 띈다는 얘기가 있었다(2026-09-02). 흰 카드 위 흰 탭이라
   * 테두리 선 하나로만 갈렸다. 고른 쪽에 액센트 색 윗줄과 글자색·굵기를 주고,
   * 안 고른 쪽은 바탕을 한 톤 눌러 탭처럼 보이게 한다.
   * 윗줄 두께 때문에 높이가 달라지지 않도록 안 고른 쪽도 같은 두께를 투명으로 둔다.
   */
  return (
    <div className="flex items-center gap-1 border-b border-line">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={active ? 'page' : undefined}
            className={[
              'shrink-0 whitespace-nowrap rounded-t-sm border border-t-2 border-b-0 px-4 py-2 text-[19px]',
              active
                ? 'border-line border-t-accent bg-surface font-semibold text-accent'
                : 'border-transparent bg-bg/70 text-fg-sub hover:bg-surface/80 hover:text-fg',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
