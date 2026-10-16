import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsApi, type Asset } from '@/api/assets';
import { queryKeys } from '@/api/queryKeys';
import { codeText } from '@/domain/assetCode';
import { fmtDate } from '@/lib/date';
import { won } from '@/lib/won';
import { Field, filterClass } from '@/components/ui';

/** 가나다 순. 숫자가 섞인 이름(2호기 vs 10호기)도 사람이 읽는 순서로 놓는다 */
const koCollator = new Intl.Collator('ko', { numeric: true });

/** 입력칸과 후보 목록에 같은 형식으로 자산을 적는다 */
const assetLabel = (a: Asset) => `${a.name} — ${codeText(a.assetCode)} · ${a.accountName}`;

/**
 * 부모 고정자산 선택. 비품·사내 설비가 함께 쓴다.
 *
 * 예전에는 자산 ID 를 숫자로 직접 넣게 했는데, 그 번호는 DB 키라서 사용자가 알 길이 없다.
 * 자산명·자산코드로 찾아서 고르고, 고른 자산의 취득일·취득가액을 함께 보여줘 확인하게 한다.
 * 고정자산이 수백 건이라 한 번 받아 화면에서 거른다.
 *
 * 검색칸과 셀렉트를 따로 두면 고른 자산이 옆 칸에 가 있어 눈이 두 번 움직인다.
 * 한 칸으로 합쳐서, 치면 후보가 아래로 펼쳐지고 고르면 그 칸에 그대로 남게 한다.
 */
export default function ParentAssetPicker({
  value,
  error,
  onChange,
  label = '부모 고정자산',
  required = true,
  hint = '이 비품이 딸린 고정자산입니다. 가나다 순으로 놓여 있고, 자산명·자산코드·계정과목으로 찾을 수 있습니다.',
}: {
  value: string;
  error?: string;
  onChange: (assetId: string, parent?: Asset) => void;
  label?: string;
  required?: boolean;
  hint?: string;
}) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);

  const query = { size: 500 };
  const q = useQuery({
    queryKey: queryKeys.assets.list(query),
    queryFn: () => assetsApi.list(query),
    staleTime: 5 * 60_000,
  });

  /* 서버 순서(등록순)는 눈으로 훑기 어렵다. 자산명 가나다 순으로 놓는다 */
  const assets = useMemo(
    () => [...(q.data?.items ?? [])].sort((a, b) => koCollator.compare(a.name, b.name)),
    [q.data],
  );
  const picked = assets.find((a) => String(a.id) === value);

  const k = keyword.trim().toLowerCase();
  const matched = useMemo(() => {
    if (k === '') return assets;
    const has = (text: string | null) => (text ?? '').toLowerCase().includes(k);
    const hit = assets.filter(
      (a) => has(a.name) || has(a.assetCode) || has(a.accountName) || has(a.accountingCode),
    );
    /* 이름 첫머리가 걸린 것을 위로. sort 가 안정적이라 그 안의 가나다 순은 그대로다 */
    const first = (a: Asset) => Number(a.name.toLowerCase().startsWith(k));
    return hit.sort((a, b) => first(b) - first(a));
  }, [assets, k]);

  /* 찾는 중에는 입력한 글자를, 다 고르고 나면 고른 자산을 그대로 보여준다 */
  const text = open ? keyword : picked ? assetLabel(picked) : '';

  const pick = (a: Asset) => {
    setKeyword('');
    setOpen(false);
    onChange(String(a.id), a);
  };

  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <div className="relative">
        <input
          className={`${filterClass} w-full`}
          placeholder="자산명·자산코드로 찾기"
          value={text}
          /* 다시 누르면 곧바로 다른 자산을 찾을 수 있게 검색어를 비우고 목록을 편다 */
          onFocus={() => {
            setKeyword('');
            setOpen(true);
          }}
          onChange={(e) => {
            setKeyword(e.target.value);
            setOpen(true);
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
            {q.isLoading && <li className="px-3 py-2 text-[17px] text-fg-muted">불러오는 중…</li>}
            {!q.isLoading && matched.length === 0 && (
              <li className="px-3 py-2 text-[17px] text-warn">검색 결과가 없습니다.</li>
            )}
            {matched.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-[18px] hover:bg-bg ${
                    String(a.id) === value ? 'bg-bg' : ''
                  }`}
                  /* blur 보다 먼저 잡아야 목록이 닫히기 전에 선택이 먹는다 */
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(a);
                  }}
                >
                  {assetLabel(a)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picked && !open && (
        <p className="mt-1 text-[17px] text-fg-sub">
          취득 {fmtDate(picked.acquisitionDate)} · 취득가액 {won(picked.acquisitionCost)}원 · 수량{' '}
          {picked.quantity}
          {picked.accountingCode && ` · 회계 자산코드 ${picked.accountingCode}`}
        </p>
      )}
    </Field>
  );
}
