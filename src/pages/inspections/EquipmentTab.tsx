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
  btnClass,
  btnPrimaryClass,
  FilterCount,
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

/** 등록된 값에서 뽑은 선택지 하나. 라벨을 첫 줄에 넣어 무엇을 고르는지 바로 보이게 한다 */
function Pick({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      className={`${inputClass} w-36`}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label} 전체</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

const matchesDue = (e: SafetyEquipment, f: DueFilter): boolean => {
  if (f === 'all') return true;
  const d = e.daysUntilExpiry;
  if (d == null) return false;
  if (f === 'overdue') return d < 0;
  if (f === 'within30') return d >= 0 && d <= 30;
  return d >= 0 && d <= 90;
};

export default function EquipmentTab() {
  const [keyword, setKeyword] = useState('');
  const [team, setTeam] = useState('');
  const [agency, setAgency] = useState('');
  const [place, setPlace] = useState('');
  const [status, setStatus] = useState<EquipmentStatus | ''>('IN_USE');
  const [history, setHistory] = useState<'' | 'done' | 'never'>('');
  const [due, setDue] = useState<DueFilter>('all');
  const [selected, setSelected] = useState<SafetyEquipment | null>(null);
  const [creating, setCreating] = useState(false);

  /*
   * 대상 전체를 한 번에 받아 화면에서 거른다.
   *
   * 서버 필터(team·status)를 쓰면 고른 값에 맞는 행만 돌아온다. 그런데 드롭다운 선택지를
   * 그 결과에서 뽑고 있어서, 담당반을 한 번 고르면 목록에 그 반만 남고 다른 반이 사라져
   * 곧바로 바꿀 수가 없었다. 조건 없이 받아 두고 거르면 선택지가 늘 온전하다.
   * 조건 없는 조회는 알림 화면의 담당반 목록과 같은 것이라 받아 둔 것을 함께 쓴다.
   */
  const list = useQuery({
    queryKey: queryKeys.inspections.list({}),
    queryFn: () => inspectionsApi.list({}),
  });

  const all = useMemo(() => [...(list.data ?? [])].sort(byDueAsc), [list.data]);

  /** 선택지는 늘 전체 목록에서 뽑는다. 담당반 마스터 API 가 따로 없어 등록된 값을 쓴다 */
  const options = useMemo(() => {
    const uniq = (v: (string | null)[]) =>
      [...new Set(v.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ko'));
    return {
      teams: uniq(all.map((e) => e.team)),
      agencies: uniq(all.map((e) => e.inspectionAgency)),
      places: uniq(all.map((e) => e.installLocation)),
    };
  }, [all]);

  /* 기한 카드만 빼고 거른 것. 카드에 적힌 수와 눌렀을 때 나오는 줄 수가 같아야 한다 */
  const beforeDue = useMemo(() => {
    const hit = searchIn(keyword);
    return all.filter(
      (e) =>
        hit(e.name, e.modelNo, e.installLocation, e.inspectionAgency, e.certificateNo, e.team) &&
        (team === '' || e.team === team) &&
        (agency === '' || e.inspectionAgency === agency) &&
        (place === '' || e.installLocation === place) &&
        (status === '' || e.status === status) &&
        (history === '' || (history === 'never') === e.neverInspected),
    );
  }, [all, keyword, team, agency, place, status, history]);

  const counts = useMemo(() => {
    const c = { overdue: 0, within30: 0, within90: 0 };
    beforeDue.forEach((e) => {
      if (matchesDue(e, 'overdue')) c.overdue += 1;
      if (matchesDue(e, 'within30')) c.within30 += 1;
      if (matchesDue(e, 'within90')) c.within90 += 1;
    });
    return c;
  }, [beforeDue]);

  const rows = useMemo(() => beforeDue.filter((e) => matchesDue(e, due)), [beforeDue, due]);

  const dirty =
    keyword !== '' ||
    team !== '' ||
    agency !== '' ||
    place !== '' ||
    history !== '' ||
    status !== 'IN_USE' ||
    due !== 'all';

  const reset = () => {
    setKeyword('');
    setTeam('');
    setAgency('');
    setPlace('');
    setStatus('IN_USE');
    setHistory('');
    setDue('all');
  };

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
            label: '조회 대상',
            value: `${beforeDue.length}건`,
            active: due === 'all',
            onClick: () => setDue('all'),
          },
          card('기한 경과', 'overdue', counts.overdue, 'danger'),
          card('30일 이내', 'within30', counts.within30, 'danger'),
          card('90일 이내', 'within90', counts.within90, 'warn'),
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
              placeholder="설비명·모델·설치위치·검사기관·합격번호"
              width="w-72"
            />
            <button type="button" className={btnPrimaryClass} onClick={() => setCreating(true)}>
              대상 등록
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <Pick label="담당반" value={team} onChange={setTeam} options={options.teams} />
          <Pick label="검사기관" value={agency} onChange={setAgency} options={options.agencies} />
          <Pick label="설치장소" value={place} onChange={setPlace} options={options.places} />
          <select
            className={`${inputClass} w-36`}
            value={status}
            onChange={(e) => setStatus(e.target.value as EquipmentStatus | '')}
            aria-label="상태"
          >
            <option value="IN_USE">사용중만</option>
            <option value="">매각·폐기 포함</option>
            <option value="SOLD">매각만</option>
            <option value="DISPOSED">폐기만</option>
          </select>
          <select
            className={`${inputClass} w-36`}
            value={history}
            onChange={(e) => setHistory(e.target.value as typeof history)}
            aria-label="검사 이력"
          >
            <option value="">검사 이력 전체</option>
            <option value="done">검사 이력 있음</option>
            <option value="never">최초 검사 전</option>
          </select>
          <FilterCount shown={rows.length} total={all.length} />
          <button
            type="button"
            className={`${btnClass} ml-auto`}
            disabled={!dirty}
            onClick={reset}
          >
            초기화
          </button>
        </div>
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
                {/* 어디서 검사하는지. 등록·상세에는 있었는데 목록에만 빠져 있었다 */}
                <th className={thClass}>검사기관</th>
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
                  <td className="px-3 py-2">{e.inspectionAgency ?? '-'}</td>
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
