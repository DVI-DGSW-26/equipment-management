import { useMemo, useState } from 'react';
import { inputClass } from './ui';

/**
 * 쳐서 찾고 골라 넣는 칸.
 *
 * 고르는 값이 많으면 셀렉트는 훑기가 어렵다. 한 칸에서 치면 후보가 아래로 펼쳐지고
 * 고르면 그 칸에 그대로 남는다 — 검색칸과 셀렉트를 따로 두면 고른 값이 옆 칸에 가 있어
 * 눈이 두 번 움직인다.
 *
 * allowFree 를 주면 목록에 없는 값을 친 그대로 값으로 쓴다. 계측기명처럼 새 이름이
 * 늘 생기는 칸에 쓴다 — 목록은 이미 쓰던 이름을 다시 치지 않게 거들 뿐이다.
 */
export interface SearchOption {
  value: string;
  label: string;
  /** 뒤에 흐리게 붙는 부가 설명 */
  hint?: string;
}

export default function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  allowFree = false,
  loading = false,
  emptyText = '찾는 값이 없습니다.',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder: string;
  allowFree?: boolean;
  loading?: boolean;
  emptyText?: string;
}) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);

  const picked = options.find((o) => o.value === value);

  const k = keyword.trim().toLowerCase();
  const matched = useMemo(() => {
    if (k === '') return options;
    const hit = options.filter(
      (o) =>
        o.label.toLowerCase().includes(k) || (o.hint ?? '').toLowerCase().includes(k),
    );
    /* 첫머리가 걸린 것을 위로. sort 가 안정적이라 그 안의 차례는 그대로다 */
    const first = (o: SearchOption) => Number(o.label.toLowerCase().startsWith(k));
    return hit.sort((a, b) => first(b) - first(a));
  }, [options, k]);

  /* 찾는 중에는 친 글자를, 고르고 나면 고른 값을 보여준다 */
  const text = open ? keyword : (picked?.label ?? (allowFree ? value : ''));

  const pick = (o: SearchOption) => {
    setKeyword('');
    setOpen(false);
    onChange(o.value);
  };

  return (
    <div className="relative">
      <input
        className={`${inputClass} w-full`}
        placeholder={placeholder}
        aria-label={placeholder}
        value={text}
        /* 다시 누르면 곧바로 다른 값을 찾을 수 있게 검색어를 비우고 목록을 편다 */
        onFocus={() => {
          setKeyword(allowFree ? value : '');
          setOpen(true);
        }}
        onChange={(e) => {
          setKeyword(e.target.value);
          setOpen(true);
          /* 목록에 없는 값을 쓰는 칸이면 친 글자가 곧 값이다 */
          if (allowFree) onChange(e.target.value);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && open && matched.length > 0) {
            e.preventDefault();
            pick(matched[0]);
          }
        }}
      />
      {open && (
        <ul className="absolute z-20 mt-0.5 max-h-64 w-full overflow-auto rounded-sm border border-line bg-surface shadow-lg">
          {loading && <li className="px-3 py-2 text-[17px] text-fg-muted">불러오는 중…</li>}
          {!loading && matched.length === 0 && (
            <li className="px-3 py-2 text-[17px] text-fg-muted">
              {allowFree ? '친 이름을 그대로 씁니다.' : emptyText}
            </li>
          )}
          {matched.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-[18px] hover:bg-bg ${
                  o.value === value ? 'bg-bg' : ''
                }`}
                /* blur 보다 먼저 잡아야 목록이 닫히기 전에 선택이 먹는다 */
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {o.label}
                {o.hint && <span className="ml-2 text-fg-muted">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
