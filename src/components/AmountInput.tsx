import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

/** "1234567.5" → "1,234,567.5". 소수 부분은 건드리지 않는다 */
const withCommas = (raw: string): string => {
  const [int, frac] = raw.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
};

/** 친 글자에서 숫자(와 첫 소수점)만 남긴다 */
const clean = (text: string, decimal: boolean): string => {
  if (!decimal) return text.replace(/[^\d]/g, '');
  const s = text.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  return dot < 0 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
};

/** 쉼표를 빼고 센 숫자 want 개 뒤에 커서를 둔다 */
const placeCaret = (el: HTMLInputElement, want: number) => {
  let pos = 0;
  for (let seen = 0; pos < el.value.length && seen < want; pos++) {
    if (el.value[pos] !== ',') seen++;
  }
  el.setSelectionRange(pos, pos);
};

/**
 * 금액·수량 칸. 치는 대로 세 자리마다 쉼표가 붙는다 (요청 2026-10-16).
 *
 * 값(value·onChange)은 쉼표 없는 숫자 글자 그대로다 — 부르는 쪽은 예전처럼 Number(value) 로 보낸다.
 * 쉼표가 끼고 빠지면서 커서가 끝으로 튀지 않도록, 커서 앞의 숫자 개수를 세어 같은 자리에 다시 둔다.
 * 연도·코드·순번처럼 쉼표가 붙으면 안 되는 숫자에는 쓰지 않는다.
 */
export default function AmountInput({
  value,
  onChange,
  decimal = false,
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** 쉼표 없는 숫자 글자 */
  value: string;
  onChange: (raw: string) => void;
  /** 소수점을 받는다 */
  decimal?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  /** 다음 그리기 뒤 커서를 둘 자리 — 커서 앞에 있어야 할 숫자 개수 */
  const caretDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const want = caretDigits.current;
    if (!el || want == null) return;
    caretDigits.current = null;
    placeCaret(el, want);
  });

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={`${className} num`}
      value={withCommas(value)}
      onChange={(e) => {
        const el = e.target;
        const before = el.value.slice(0, el.selectionStart ?? el.value.length);
        const digits = clean(before, decimal).length;
        const next = clean(el.value, decimal);
        if (next === value) {
          /* 글자나 쉼표만 지웠다 — 값이 그대로라 다시 그려지지 않는다. 여기서 되돌린다 */
          el.value = withCommas(value);
          placeCaret(el, digits);
          return;
        }
        caretDigits.current = digits;
        onChange(next);
      }}
    />
  );
}
