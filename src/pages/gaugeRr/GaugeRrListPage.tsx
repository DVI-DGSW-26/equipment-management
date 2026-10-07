import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gaugeRrApi, type GaugeRrJudgment, type GaugeRrSummary } from '@/api/gaugeRr';
import { queryKeys } from '@/api/queryKeys';
import { useCanEdit } from '@/hooks/useMe';
import { useUrlState } from '@/hooks/useUrlState';
import { FROM_LIST } from '@/hooks/useBackToList';
import { fmtDate, getToday, toIsoDate } from '@/lib/date';
import { downloadExcel, stampedFileName, type ExcelColumn } from '@/lib/excel';
import { rowNo } from '@/lib/paging';
import { searchIn } from '@/lib/search';
import { fmtNum, JUDGMENT_TONE } from '@/domain/gaugeRr';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  FilterCount,
  filterClass,
  QueryState,
  ReadOnlyChip,
  SearchBox,
  SearchHint,
  Section,
  seqThClass,
  StatCards,
  thClass,
} from '@/components/ui';
import GaugeRrModal from './GaugeRrModal';

/** 주소창에 담는 조건. 기간만 서버가 거르고 나머지는 화면에서 거른다 */
const DEFAULTS = {
  from: '',
  to: '',
  keyword: '',
  judgment: '',
};

type Row = GaugeRrSummary & { no: number };

const COLUMNS: ExcelColumn<Row>[] = [
  { header: 'No.', value: (r) => r.no, numeric: true, width: 6 },
  { header: '시행일', value: (r) => r.performedDate, width: 12 },
  { header: '품번', value: (r) => r.partNumber, width: 16 },
  { header: '품명', value: (r) => r.partName, width: 24 },
  { header: '특성', value: (r) => r.characteristic, width: 12 },
  { header: '게이지', value: (r) => r.gageName, width: 18 },
  { header: '게이지 번호', value: (r) => r.gageNumber, width: 14 },
  { header: '계측기 관리번호', value: (r) => r.instrumentMgmtNo, width: 14 },
  { header: '측정자', value: (r) => r.appraisers.join(', '), width: 22 },
  { header: '%R&R', value: (r) => (r.pctGrr == null ? null : fmtNum(r.pctGrr, 2)), numeric: true, width: 10 },
  { header: 'ndc', value: (r) => (r.ndc == null ? null : fmtNum(r.ndc, 2)), numeric: true, width: 8 },
  { header: '판정', value: (r) => r.judgmentLabel, width: 12 },
];

export default function GaugeRrListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const edit = useCanEdit('instrument');
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [q, setQ] = useUrlState(DEFAULTS);
  const serverQuery = useMemo(
    () => ({ from: q.from || undefined, to: q.to || undefined }),
    [q.from, q.to],
  );

  const list = useQuery({
    queryKey: queryKeys.gaugeRr.list(serverQuery),
    queryFn: () => gaugeRrApi.list(serverQuery),
  });
  const all = useMemo(() => list.data ?? [], [list.data]);

  /* 판정 칸만 빼고 거른 것. 카드의 수와 눌렀을 때 나오는 줄 수가 같아야 한다 */
  const beforeJudgment = useMemo(() => {
    const hit = searchIn(q.keyword);
    return all.filter((r) =>
      hit(r.partNumber, r.partName, r.characteristic, r.gageName, r.gageNumber, r.instrumentMgmtNo, ...r.appraisers),
    );
  }, [all, q.keyword]);

  const rows = useMemo(
    () =>
      beforeJudgment
        .filter((r) => q.judgment === '' || r.judgment === q.judgment)
        .sort((a, b) => b.performedDate.localeCompare(a.performedDate) || b.id - a.id),
    [beforeJudgment, q.judgment],
  );

  const count = (j: GaugeRrJudgment) => beforeJudgment.filter((r) => r.judgment === j).length;
  const card = (label: string, j: GaugeRrJudgment, tone?: 'danger' | 'warn') => {
    const n = count(j);
    return {
      label,
      value: `${n.toLocaleString('ko-KR')}건`,
      tone: n > 0 ? tone : undefined,
      active: q.judgment === j,
      onClick: () => setQ({ judgment: q.judgment === j ? '' : j }),
    };
  };

  const dirty = q.from !== '' || q.to !== '' || q.keyword !== '' || q.judgment !== '';

  const download = async () => {
    setExporting(true);
    try {
      const data: Row[] = rows.map((r, n) => ({ ...r, no: rowNo(n) }));
      await downloadExcel(data, COLUMNS, stampedFileName('게이지RR목록', toIsoDate(getToday())));
      toast.ok(`${rows.length.toLocaleString('ko-KR')}건을 내려받았습니다.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">게이지 R&amp;R</h1>

      <StatCards
        cards={[
          {
            label: '전체',
            value: `${beforeJudgment.length.toLocaleString('ko-KR')}건`,
            active: q.judgment === '',
            onClick: () => setQ({ judgment: '' }),
          },
          card('양호', 'OK'),
          card('조건부 사용', 'CONDITIONAL', 'warn'),
          card('부적합', 'NG', 'danger'),
        ]}
      />

      <Section
        title="게이지 R&R 목록"
        right={
          <>
            <SearchHint fields="품번 · 품명 · 게이지 · 측정자" />
            <SearchBox
              value={q.keyword}
              onChange={(v) => setQ({ keyword: v })}
              placeholder="통합 검색"
              width="w-72"
            />
            <button
              type="button"
              className={btnClass}
              disabled={rows.length === 0 || exporting}
              onClick={() => void download()}
            >
              {exporting ? '만드는 중…' : '엑셀 다운로드'}
            </button>
            {edit ? (
              <button type="button" className={btnPrimaryClass} onClick={() => setCreating(true)}>
                게이지 R&amp;R 등록
              </button>
            ) : (
              <ReadOnlyChip />
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[18px] text-fg-sub">시행일</span>
          <input
            type="date"
            className={`${filterClass} w-44`}
            value={q.from}
            onChange={(e) => setQ({ from: e.target.value })}
            aria-label="시행일 시작"
          />
          <span className="text-fg-muted">~</span>
          <input
            type="date"
            className={`${filterClass} w-44`}
            value={q.to}
            onChange={(e) => setQ({ to: e.target.value })}
            aria-label="시행일 끝"
          />
          <FilterCount shown={rows.length} total={all.length} />
          <button
            type="button"
            className={`${btnClass} ml-auto`}
            disabled={!dirty}
            onClick={() => setQ({ ...DEFAULTS })}
          >
            초기화
          </button>
        </div>

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText={dirty ? '조건에 맞는 기록이 없습니다.' : '등록된 게이지 R&R 이 없습니다.'}
        />
        {rows.length > 0 && (
          <table className="w-max min-w-full text-[19px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={seqThClass}>No.</th>
                <th className={thClass}>시행일</th>
                <th className={thClass}>품번</th>
                <th className={thClass}>품명</th>
                <th className={thClass}>특성</th>
                <th className={thClass}>게이지</th>
                <th className={thClass}>게이지 번호</th>
                <th className={thClass}>측정자</th>
                <th className={`${thClass} text-right`}>%R&amp;R</th>
                <th className={`${thClass} text-right`}>ndc</th>
                <th className={`${thClass} text-center`}>판정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/gauge-rr/${r.id}`, { state: FROM_LIST })}
                  className="cursor-pointer border-b border-line hover:bg-bg"
                >
                  <td className="num px-3 py-2 text-fg-muted">{rowNo(i)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.performedDate)}</td>
                  <td className="code px-3 py-2">{r.partNumber}</td>
                  <td className="px-3 py-2">{r.partName}</td>
                  <td className="px-3 py-2">{r.characteristic ?? '-'}</td>
                  <td className="px-3 py-2">{r.gageName}</td>
                  <td className="code px-3 py-2">
                    {r.gageNumber ?? '-'}
                    {r.instrumentMgmtNo && (
                      <span className="ml-1 text-fg-muted">({r.instrumentMgmtNo})</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.appraisers.join(', ')}</td>
                  <td className="num px-3 py-2">{fmtNum(r.pctGrr, 2)}</td>
                  <td className="num px-3 py-2">{fmtNum(r.ndc, 2)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.judgment ? (
                      <Badge tone={JUDGMENT_TONE[r.judgment]}>{r.judgmentLabel}</Badge>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {creating && <GaugeRrModal onClose={() => setCreating(false)} />}
      </Section>
    </div>
  );
}
