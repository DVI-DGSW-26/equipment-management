import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instrumentsApi } from '@/api/instruments';
import { calibrationsApi } from '@/api/calibrations';
import { queryKeys } from '@/api/queryKeys';
import { DDAY_CLASS, ddayLabel, levelOfDays } from '@/domain/dday';
import { currentYear, daysUntil, fmtDate } from '@/lib/date';
import { slicePage } from '@/lib/paging';
import { searchIn } from '@/lib/search';
import { useToast } from '@/components/toastContext';
import InstrumentModal from './InstrumentModal';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  FilterCount,
  inputClass,
  Pagination,
  QueryState,
  SearchBox,
  Section,
  StatCards,
  Tabs,
  thClass,
} from '@/components/ui';

type TabKey = 'list' | 'annual';

export default function InstrumentListPage() {
  const [tab, setTab] = useState<TabKey>('list');

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">계측기</h1>
      <Tabs
        tabs={[
          { key: 'list' as const, label: '계측기 목록' },
          { key: 'annual' as const, label: '연간 교정검사 LIST' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'list' ? <ListTab /> : <AnnualTab />}
    </div>
  );
}

/* ---------- 계측기 목록 ---------- */

/**
 * 기한 필터. 임계값(경과 / 30일 / 90일)은 안전검사 화면과 같다 —
 * 두 화면이 같은 일을 하는데 기준이 다르면 관리하는 사람이 헷갈린다.
 */
type DueFilter = 'all' | 'overdue' | 'within30' | 'within90';

/**
 * 목록을 한 번에 다 받아 온다.
 *
 * 서버가 걸러 주는 것은 keyword 와 locationId 뿐이다. 사용자·교정주기·기한까지
 * 페이지를 나눠 받은 채로 거르면 지금 펼친 장 안에서만 걸러져, 뒷장에 있는 계측기를
 * "없다" 고 보여 준다. 그래서 전부 받아 화면에서 거르고 쪽도 화면에서 나눈다.
 * 이 수를 넘으면 결과가 전체가 아니라고 알린다.
 */
const LOAD_LIMIT = 500;

const matchesDue = (days: number | null, overdue: boolean, f: DueFilter): boolean => {
  if (f === 'all') return true;
  if (f === 'overdue') return overdue || (days != null && days < 0);
  /* 경과분은 30·90일 칸에 겹쳐 세지 않는다. 경과 칸에서 이미 세고 있다 */
  if (days == null || days < 0 || overdue) return false;
  return f === 'within30' ? days <= 30 : days <= 90;
};

function ListTab() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [user, setUser] = useState('');
  const [cycle, setCycle] = useState('');
  const [due, setDue] = useState<DueFilter>('all');
  const [sort, setSort] = useState<'due' | 'mgmtNo'>('due');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [creating, setCreating] = useState(false);

  const query = useMemo(() => ({ page: 0, size: LOAD_LIMIT }), []);
  const list = useQuery({
    queryKey: queryKeys.instruments.list(query),
    queryFn: () => instrumentsApi.list(query),
  });

  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  /** 서버에 더 있는데 못 받아 왔다 */
  const truncated = (list.data?.total ?? 0) > all.length;

  /** 선택지는 실제로 목록에 있는 값에서 뽑는다 — 고르면 반드시 결과가 있다 */
  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko'));
    return {
      locations: uniq(all.map((i) => i.locationName)),
      users: uniq(all.map((i) => i.userName)),
      cycles: [...new Set(all.map((i) => i.calibrationCycleMonths))].sort((a, b) => a - b),
    };
  }, [all]);

  /* 기한 칸만 빼고 거른 것. 카드에 적힌 수와 카드를 눌렀을 때 나오는 줄 수가 같아야 한다 */
  const beforeDue = useMemo(() => {
    const hit = searchIn(keyword);
    return all.filter(
      (i) =>
        hit(i.mgmtNo, i.name, i.serialNo, i.specText, i.accuracy, i.locationName, i.userName) &&
        (location === '' || i.locationName === location) &&
        (user === '' || i.userName === user) &&
        (cycle === '' || String(i.calibrationCycleMonths) === cycle),
    );
  }, [all, keyword, location, user, cycle]);

  const counts = useMemo(() => {
    const c = { overdue: 0, within30: 0, within90: 0 };
    beforeDue.forEach((i) => {
      const d = daysUntil(i.nextDueDate);
      if (matchesDue(d, i.overdue, 'overdue')) c.overdue += 1;
      if (matchesDue(d, i.overdue, 'within30')) c.within30 += 1;
      if (matchesDue(d, i.overdue, 'within90')) c.within90 += 1;
    });
    return c;
  }, [beforeDue]);

  const rows = useMemo(() => {
    const kept = beforeDue.filter((i) => matchesDue(daysUntil(i.nextDueDate), i.overdue, due));
    return kept.sort((a, b) =>
      sort === 'due'
        ? /* 기한 없는 건은 뒤로 */
          (a.nextDueDate ?? '9999-12-31').localeCompare(b.nextDueDate ?? '9999-12-31')
        : a.mgmtNo.localeCompare(b.mgmtNo, 'ko'),
    );
  }, [beforeDue, due, sort]);

  /* 쪽 나누기도 화면에서 한다 */
  const paged = slicePage(rows, page, size);

  const dirty =
    keyword !== '' || location !== '' || user !== '' || cycle !== '' || due !== 'all';

  const reset = () => {
    setKeyword('');
    setLocation('');
    setUser('');
    setCycle('');
    setDue('all');
    setPage(0);
  };

  /** 조건을 건드리면 늘 첫 장부터 다시 본다 */
  const pick = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(0);
  };

  const dueCard = (label: string, key: DueFilter, count: number, tone: 'danger' | 'warn') => ({
    label,
    value: `${count.toLocaleString('ko-KR')}건`,
    tone: count > 0 ? tone : undefined,
    active: due === key,
    onClick: () => {
      setDue(due === key ? 'all' : key);
      setPage(0);
    },
  });

  return (
    <div className="space-y-3">
      {/* 이 화면의 일은 교정 기한 관리다. 급한 건수를 먼저 보이고, 눌러서 그것만 본다 */}
      <StatCards
        cards={[
          {
            label: '전체',
            value: `${beforeDue.length.toLocaleString('ko-KR')}건`,
            active: due === 'all',
            onClick: () => {
              setDue('all');
              setPage(0);
            },
          },
          dueCard('기한 경과', 'overdue', counts.overdue, 'danger'),
          dueCard('30일 이내', 'within30', counts.within30, 'danger'),
          dueCard('90일 이내', 'within90', counts.within90, 'warn'),
        ]}
      />

      <Section
        title="계측기 목록"
        right={
          <>
            <SearchBox
              value={keyword}
              onChange={pick(setKeyword)}
              placeholder="관리번호·계측기명·S/NO·규격·사용자"
              width="w-72"
            />
            <button type="button" className={btnPrimaryClass} onClick={() => setCreating(true)}>
              계측기 등록
            </button>
          </>
        }
      >
        {truncated && (
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[18px] text-warn">
            계측기가 {(list.data?.total ?? 0).toLocaleString('ko-KR')}건이라 앞의{' '}
            {all.length.toLocaleString('ko-KR')}건만 받아 왔습니다. 아래 결과는 그 안에서만
            거른 것입니다 — 서버 필터 추가가 필요합니다.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <select
            className={`${inputClass} w-36`}
            value={location}
            onChange={(e) => pick(setLocation)(e.target.value)}
            aria-label="사용위치"
          >
            <option value="">사용위치 전체</option>
            {options.locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} w-32`}
            value={user}
            onChange={(e) => pick(setUser)(e.target.value)}
            aria-label="사용자"
          >
            <option value="">사용자 전체</option>
            {options.users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} w-32`}
            value={cycle}
            onChange={(e) => pick(setCycle)(e.target.value)}
            aria-label="교정주기"
          >
            <option value="">교정주기 전체</option>
            {options.cycles.map((c) => (
              <option key={c} value={c}>
                {c}개월
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} w-36`}
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="정렬"
          >
            <option value="due">기한 임박순</option>
            <option value="mgmtNo">관리번호순</option>
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
          emptyText={dirty ? '조건에 맞는 계측기가 없습니다.' : '등록된 계측기가 없습니다.'}
        />
        {rows.length > 0 && (
          <>
            <table className="w-max min-w-full text-[19px]">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-fg-sub">
                  <th className={thClass}>관리번호</th>
                  <th className={thClass}>계측기명</th>
                  <th className={thClass}>S/NO</th>
                  <th className={thClass}>규격</th>
                  <th className={thClass}>정도</th>
                  <th className={`${thClass} text-right`}>교정주기</th>
                  <th className={thClass}>사용위치</th>
                  <th className={thClass}>사용자</th>
                  <th className={thClass}>최근 교정일</th>
                  <th className={thClass}>차기 교정일</th>
                  <th className={`${thClass} text-right`}>남은 기한</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((i) => {
                  const days = daysUntil(i.nextDueDate);
                  return (
                    <tr
                      key={i.id}
                      onClick={() => navigate(`/instruments/${i.id}`)}
                      className="cursor-pointer border-b border-line hover:bg-bg"
                    >
                      <td className="code px-3 py-2">{i.mgmtNo}</td>
                      <td className="px-3 py-2">{i.name}</td>
                      <td className="px-3 py-2">{i.serialNo ?? '-'}</td>
                      <td className="px-3 py-2">{i.specText ?? '-'}</td>
                      <td className="px-3 py-2">{i.accuracy ?? '-'}</td>
                      <td className="num px-3 py-2">{i.calibrationCycleMonths}개월</td>
                      <td className="px-3 py-2">{i.locationName ?? '-'}</td>
                      <td className="px-3 py-2">{i.userName ?? '-'}</td>
                      <td className="px-3 py-2">{fmtDate(i.lastCalibratedDate)}</td>
                      <td className={`px-3 py-2 ${i.overdue ? 'font-semibold text-danger' : ''}`}>
                        {fmtDate(i.nextDueDate)}
                      </td>
                      <td className={`num px-3 py-2 ${DDAY_CLASS[levelOfDays(days)]}`}>
                        {ddayLabel(days)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              size={size}
              onChange={setPage}
              onSizeChange={(s) => {
                setSize(s);
                setPage(0);
              }}
            />
          </>
        )}

        {creating && <InstrumentModal onClose={() => setCreating(false)} />}
      </Section>
    </div>
  );
}

/* ---------- 연간 교정검사 LIST ---------- */

function AnnualTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [planYear, setPlanYear] = useState(currentYear());
  const [keyword, setKeyword] = useState('');
  const [state, setState] = useState<'' | 'done' | 'todo'>('');

  const q = useQuery({
    queryKey: queryKeys.calibrations.annual(planYear),
    queryFn: () => calibrationsApi.annual(planYear),
  });

  const generate = useMutation({
    mutationFn: () => calibrationsApi.generateAnnual(planYear),
    onSuccess: (r) => {
      toast.ok(`${r.planYear}년 계획 생성 — 신규 ${r.created}건 / 기존 ${r.skipped}건 건너뜀`);
      void qc.invalidateQueries({ queryKey: queryKeys.calibrations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.instruments.all });
    },
    onError: toast.fail,
  });

  /* 한 해치를 한 번에 받아 오는 목록이라 화면에서 거른다 */
  const all = q.data ?? [];
  const done = all.filter((r) => r.performedDate).length;

  const hit = searchIn(keyword);
  const rows = all.filter(
    (r) =>
      hit(r.mgmtNo, r.name, r.serialNo, r.locationName, r.userName) &&
      (state === '' || (state === 'done') === Boolean(r.performedDate)),
  );

  return (
    <Section
      title={
        <>
          {planYear}년 교정검사 LIST{' '}
          <span className="font-normal text-fg-muted">
            실시 {done} / 계획 {all.length}
          </span>
        </>
      }
      right={
        <>
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder="관리번호·계측기명·S/NO·위치"
            width="w-64"
          />
          <select
            className={`${inputClass} w-32`}
            value={state}
            onChange={(e) => setState(e.target.value as typeof state)}
            aria-label="실시 여부"
          >
            <option value="">실시 여부 전체</option>
            <option value="done">실시</option>
            <option value="todo">미실시</option>
          </select>
          <FilterCount shown={rows.length} total={all.length} />
          <select
            className={`${inputClass} w-28`}
            value={planYear}
            onChange={(e) => setPlanYear(Number(e.target.value))}
          >
            {Array.from({ length: 7 }, (_, i) => currentYear() + 1 - i).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={generate.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `${planYear}년 연간 교정계획을 일괄 생성합니다. 이미 있는 계획은 건너뜁니다.`,
                )
              )
                generate.mutate();
            }}
          >
            {generate.isPending ? '생성 중…' : '연간 계획 생성'}
          </button>
        </>
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={
          <span className="flex flex-wrap items-center gap-2">
            <span>{planYear}년 계획이 없습니다.</span>
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={generate.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `${planYear}년 연간 교정계획을 일괄 생성합니다. 이미 있는 계획은 건너뜁니다.`,
                  )
                )
                  generate.mutate();
              }}
            >
              {generate.isPending ? '생성 중…' : '지금 계획 생성하기'}
            </button>
          </span>
        }
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>관리번호</th>
              <th className={thClass}>계측기명</th>
              <th className={thClass}>S/NO</th>
              <th className={thClass}>규격</th>
              <th className={thClass}>정도</th>
              <th className={`${thClass} text-right`}>주기</th>
              <th className={thClass}>계획</th>
              <th className={thClass}>실시</th>
              <th className={thClass}>결과</th>
              <th className={thClass}>사용위치</th>
              <th className={thClass}>사용자</th>
              <th className={thClass}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.calibrationId}
                onClick={() => navigate(`/instruments/${r.instrumentId}`)}
                className="cursor-pointer border-b border-line hover:bg-bg"
              >
                <td className="code px-3 py-2">{r.mgmtNo}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.serialNo ?? '-'}</td>
                <td className="px-3 py-2">{r.specText ?? '-'}</td>
                <td className="px-3 py-2">{r.accuracy ?? '-'}</td>
                <td className="num px-3 py-2">{r.calibrationCycleMonths}</td>
                <td className="px-3 py-2">{fmtDate(r.planDate)}</td>
                <td className="px-3 py-2">{fmtDate(r.performedDate)}</td>
                <td className="px-3 py-2">
                  {r.performedDate ? (
                    (r.resultMark ?? '-')
                  ) : (
                    <Badge tone="warn">미실시</Badge>
                  )}
                </td>
                <td className="px-3 py-2">{r.locationName ?? '-'}</td>
                <td className="px-3 py-2">{r.userName ?? '-'}</td>
                <td className="px-3 py-2 text-fg-sub">{r.remark ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
