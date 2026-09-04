import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsApi } from '@/api/assets';
import { queryKeys } from '@/api/queryKeys';
import { fmtDateTime } from '@/lib/date';
import { searchIn } from '@/lib/search';
import { FilterCount, filterClass, QueryState, SearchBox, Section, thClass } from '@/components/ui';

/**
 * 변경 이력.
 *
 * 구분 라벨은 서버가 changeTypeLabel 로 내려준다 — ADDITION("자본적지출")처럼 종류가
 * 늘어도 화면을 고칠 필요가 없도록, 필터 목록도 받은 이력에서 그대로 뽑아 쓴다.
 * 세무 기록·양도폐기금액 수정도 필드별 UPDATE 로 남는다.
 */
export default function AssetHistorySection({ assetId }: { assetId: number }) {
  const [type, setType] = useState('');
  const [keyword, setKeyword] = useState('');

  const q = useQuery({
    queryKey: queryKeys.assets.history(assetId),
    queryFn: () => assetsApi.history(assetId),
    enabled: Number.isFinite(assetId),
  });
  const all = useMemo(() => q.data ?? [], [q.data]);

  /** 실제로 이력에 있는 구분만 고를 수 있게 한다 */
  const types = useMemo(
    () => [...new Map(all.map((h) => [h.changeType, h.changeTypeLabel || h.changeType])).entries()],
    [all],
  );

  const hit = searchIn(keyword);
  const rows = all.filter(
    (h) =>
      (type === '' || h.changeType === type) &&
      hit(h.fieldName, h.beforeValue, h.afterValue, h.changedBy),
  );
  const filtering = type !== '' || keyword.trim() !== '';

  return (
    <Section
      title="변경 이력"
      right={
        <>
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder="항목·값·변경자"
            width="w-48"
          />
          <select
            className={`${filterClass} w-40`}
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="구분 필터"
          >
            <option value="">전체 구분</option>
            {types.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <FilterCount shown={rows.length} total={all.length} />
        </>
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={filtering ? '해당 조건의 이력이 없습니다.' : '변경 이력이 없습니다.'}
      />
      {rows.length > 0 && (
        <table className="w-max text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>일시</th>
              <th className={thClass}>구분</th>
              <th className={thClass}>항목</th>
              <th className={thClass}>변경 전</th>
              <th className={thClass}>변경 후</th>
              <th className={thClass}>변경자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-b border-line">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(h.changedAt)}</td>
                <td className="px-3 py-2">{h.changeTypeLabel || h.changeType}</td>
                <td className="px-3 py-2">{h.fieldName}</td>
                <td className="px-3 py-2 text-fg-sub">{h.beforeValue ?? '-'}</td>
                <td className="px-3 py-2">{h.afterValue ?? '-'}</td>
                <td className="px-3 py-2 text-fg-sub">{h.changedBy ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
