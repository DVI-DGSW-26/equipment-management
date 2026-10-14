import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gaugeRrApi } from '@/api/gaugeRr';
import { queryKeys } from '@/api/queryKeys';
import { FROM_LIST } from '@/hooks/useBackToList';
import { fmtDate } from '@/lib/date';
import { fmtNum, JUDGMENT_TONE } from '@/domain/gaugeRr';
import { Badge, QueryState, Section, thClass } from '@/components/ui';

/**
 * 이 계측기로 한 게이지 R&R 이력.
 *
 * R&R 은 계측기를 평가하는 일이라 결과가 그 계측기 자리에서 보여야 한다 — 교정 이력과
 * 나란히 두어 "이 계측기 R&R 언제 했지?" 를 계측기 화면에서 바로 본다.
 * R&R 등록·수정 창에서 이 계측기를 고른 기록만 나온다. 줄을 누르면 그 기록을 연다.
 */
export default function InstrumentGaugeRrSection({ instrumentId }: { instrumentId: number }) {
  const navigate = useNavigate();
  const query = { instrumentId };
  const list = useQuery({
    queryKey: queryKeys.gaugeRr.list(query),
    queryFn: () => gaugeRrApi.list(query),
  });
  const rows = list.data ?? [];

  return (
    <Section title={`게이지 R&R 이력 ${rows.length}건`}>
      <QueryState
        isPending={list.isPending}
        error={list.error}
        isEmpty={rows.length === 0}
        emptyText="이 계측기로 한 게이지 R&R 기록이 없습니다. R&R 등록 창에서 계측기를 고르면 여기에 쌓입니다."
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>시행일</th>
              <th className={thClass}>품번</th>
              <th className={thClass}>품명</th>
              <th className={thClass}>측정자</th>
              <th className={`${thClass} text-right`}>%R&amp;R</th>
              <th className={`${thClass} text-right`}>ndc</th>
              <th className={`${thClass} text-center`}>판정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/gauge-rr/${r.id}`, { state: FROM_LIST })}
                className="cursor-pointer border-b border-line hover:bg-bg"
              >
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.performedDate)}</td>
                <td className="code px-3 py-2">{r.partNumber}</td>
                <td className="px-3 py-2">{r.partName}</td>
                <td className="px-3 py-2">{r.appraisers.join(', ')}</td>
                <td className="num px-3 py-2">{fmtNum(r.pctGrr, 2)}</td>
                <td className="num px-3 py-2">{fmtNum(r.ndc, 2)}</td>
                <td className="px-3 py-2 text-center">
                  {r.judgment ? (
                    <Badge
                      tone={JUDGMENT_TONE[r.judgment]}
                      title={r.exceedReason ? `10% 초과 사유: ${r.exceedReason}` : undefined}
                    >
                      {r.judgmentLabel}
                      {r.exceedReason && ' *'}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
