import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inspectionsApi, type EquipmentStatus, type SafetyEquipment } from '@/api/inspections';
import { queryKeys } from '@/api/queryKeys';
import { byDueAsc, DDAY_CLASS, ddayLabel, levelOf } from '@/domain/dday';
import { fmtDate } from '@/lib/date';
import { searchIn } from '@/lib/search';
import DetailModal from './DetailModal';
import EquipmentModal from './EquipmentModal';
import { rowNo } from '@/lib/paging';
import {
  Badge,
  btnPrimaryClass,
  inputClass,
  QueryState,
  SearchBox,
  Section,
  seqThClass,
  StatCards,
  thClass,
} from '@/components/ui';

/**
 * 기한 필터. 임계값은 서버 요약(overdueCount / within30Count / within90Count)과
 * 같은 기준이라 카드 숫자와 목록 건수가 어긋나지 않는다.
 * 남은 일수는 서버가 준 daysUntilExpiry 를 그대로 쓴다 (프론트에서 날짜 계산 금지).
 */
type DueFilter = 'all' | 'overdue' | 'within30' | 'within90';

const matchesDue = (e: SafetyEquipment, f: DueFilter): boolean => {
  if (f === 'all') return true;
  const d = e.daysUntilExpiry;
  if (d == null) return false;
  if (f === 'overdue') return d < 0;
  if (f === 'within30') return d >= 0 && d <= 30;
  return d >= 0 && d <= 90;
};

export default function EquipmentTab() {
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<EquipmentStatus | ''>('IN_USE');
  const [due, setDue] = useState<DueFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<SafetyEquipment | null>(null);
  const [creating, setCreating] = useState(false);

  // 담당반은 서버 필터를 그대로 쓴다. 대상이 13건뿐이라 기한 필터만 목록에서 거른다
  const query = useMemo(
    () => ({
      team: team || undefined,
      status: status || undefined,
    }),
    [team, status],
  );

  const summary = useQuery({
    queryKey: queryKeys.inspections.summary(),
    queryFn: () => inspectionsApi.summary(),
  });
  const list = useQuery({
    queryKey: queryKeys.inspections.list(query),
    queryFn: () => inspectionsApi.list(query),
  });

  const all = useMemo(() => [...(list.data ?? [])].sort(byDueAsc), [list.data]);
  /* 담당반·상태는 서버가, 기한과 키워드는 여기서 거른다 (대상이 13건뿐이다) */
  const rows = useMemo(() => {
    const hit = searchIn(keyword);
    return all.filter(
      (e) =>
        matchesDue(e, due) &&
        hit(e.name, e.modelNo, e.installLocation, e.inspectionAgency, e.certificateNo, e.team),
    );
  }, [all, due, keyword]);

  /** 담당반 선택지는 실제 등록된 값에서 뽑는다. 마스터 API 가 따로 없다 */
  const teams = useMemo(
    () => [...new Set((list.data ?? []).map((e) => e.team).filter((t): t is string => !!t))].sort(),
    [list.data],
  );

  const card = (label: string, key: DueFilter, count: number, tone?: 'danger' | 'warn') => ({
    label,
    value: `${count}건`,
    tone: count > 0 ? tone : undefined,
    active: due === key,
    onClick: () => setDue(due === key ? 'all' : key),
  });

  return (
    <div className="space-y-3">
      {/* 요구사항 4-4 — 30일·90일 이내 건수 상시 표시. 눌러서 그 대상만 볼 수 있다 */}
      <StatCards
        cards={[
          {
            label: '사용중 대상',
            value: `${summary.data?.totalActive ?? 0}건`,
            active: due === 'all',
            onClick: () => setDue('all'),
          },
          card('기한 경과', 'overdue', summary.data?.overdueCount ?? 0, 'danger'),
          card('30일 이내', 'within30', summary.data?.within30Count ?? 0, 'danger'),
          card('90일 이내', 'within90', summary.data?.within90Count ?? 0, 'warn'),
        ]}
      />

      <Section
        title={
          <>
            안전검사 대상{' '}
            <span className="font-normal text-fg-muted">
              {rows.length}건{rows.length !== all.length && ` / 전체 ${all.length}건`}
              {due !== 'all' && ' · 기한 필터 적용 중'}
            </span>
          </>
        }
        right={
          <>
            <SearchBox
              value={keyword}
              onChange={setKeyword}
              placeholder="설비명·모델·설치위치·검사기관"
              width="w-64"
            />
            <select
              className={`${inputClass} w-32`}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">담당반 전체</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className={`${inputClass} w-32`}
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipmentStatus | '')}
            >
              <option value="IN_USE">사용중만</option>
              <option value="">매각·폐기 포함</option>
            </select>
            <button type="button" className={btnPrimaryClass} onClick={() => setCreating(true)}>
              대상 등록
            </button>
          </>
        }
      >
        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText={
            due === 'all'
              ? '조건에 맞는 대상이 없습니다.'
              : '해당 기한에 걸리는 대상이 없습니다. 위 카드를 다시 눌러 전체를 봅니다.'
          }
        />
        {rows.length > 0 && (
          <table className="w-max min-w-full text-[19px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={seqThClass}>No.</th>
                <th className={thClass}>기한</th>
                <th className={thClass}>D-day</th>
                <th className={thClass}>대상품명</th>
                <th className={thClass}>형식번호</th>
                <th className={thClass}>설치장소</th>
                <th className={thClass}>용량</th>
                <th className={thClass}>담당반</th>
                <th className={thClass}>최근 검사일</th>
                <th className={thClass}>합격번호</th>
                <th className={thClass}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="cursor-pointer border-b border-line hover:bg-bg"
                >
                  <td className="num px-3 py-2 text-fg-muted">{rowNo(i)}</td>
                  <td className="px-3 py-2">{fmtDate(e.nextInspectionDue)}</td>
                  <td className={`px-3 py-2 ${DDAY_CLASS[levelOf(e.severity)]}`}>
                    {ddayLabel(e.daysUntilExpiry)}
                    {e.neverInspected && (
                      <span className="ml-1">
                        <Badge tone="warn">최초 검사 전</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{e.name}</td>
                  <td className="px-3 py-2">{e.modelNo ?? '-'}</td>
                  <td className="px-3 py-2">{e.installLocation ?? '-'}</td>
                  <td className="px-3 py-2">{e.capacity ?? '-'}</td>
                  <td className="px-3 py-2">{e.team ?? '-'}</td>
                  <td className="px-3 py-2">{fmtDate(e.lastInspectedAt)}</td>
                  <td className="px-3 py-2">{e.certificateNo ?? '-'}</td>
                  <td className="px-3 py-2">{e.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {selected && <DetailModal equipment={selected} onClose={() => setSelected(null)} />}
      {creating && <EquipmentModal onClose={() => setCreating(false)} />}
    </div>
  );
}
