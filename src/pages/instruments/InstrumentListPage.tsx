import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instrumentsApi } from '@/api/instruments';
import { calibrationsApi } from '@/api/calibrations';
import { queryKeys } from '@/api/queryKeys';
import { useInstrumentLocations } from '@/hooks/useMasters';
import { useDebounced } from '@/hooks/useDebounced';
import { currentYear, fmtDate } from '@/lib/date';
import { useToast } from '@/components/toastContext';
import InstrumentModal from './InstrumentModal';
import {
  Badge,
  btnPrimaryClass,
  inputClass,
  Pagination,
  QueryState,
  Section,
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

function ListTab() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [creating, setCreating] = useState(false);

  const locations = useInstrumentLocations();

  /** 조회 버튼 없이 입력하는 대로. 손이 멎은 뒤에 한 번만 보낸다 */
  const settled = useDebounced(keyword);

  const query = useMemo(
    () => ({
      keyword: settled.trim() || undefined,
      locationId: locationId ? Number(locationId) : undefined,
      page,
      size,
    }),
    [settled, locationId, page, size],
  );

  const list = useQuery({
    queryKey: queryKeys.instruments.list(query),
    queryFn: () => instrumentsApi.list(query),
  });

  const rows = list.data?.items ?? [];
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <Section
      title={
        <>
          계측기 목록{' '}
          {overdue > 0 && (
            <span className="ml-1">
              <Badge tone="danger">차기 교정일 경과 {overdue}건</Badge>
            </span>
          )}
        </>
      }
      right={
        <>
          <input
            className={`${inputClass} w-48`}
            placeholder="관리번호·계측기명·S/NO"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(0);
            }}
          />
          <select
            className={`${inputClass} w-32`}
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">전체 위치</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" className={btnPrimaryClass} onClick={() => setCreating(true)}>
            계측기 등록
          </button>
        </>
      }
    >
      <QueryState
        isPending={list.isPending}
        error={list.error}
        isEmpty={rows.length === 0}
        emptyText="조건에 맞는 계측기가 없습니다."
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
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
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
                    {i.overdue && ' 경과'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data?.page ?? 0}
            totalPages={list.data?.totalPages ?? 0}
            total={list.data?.total ?? 0}
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
  );
}

/* ---------- 연간 교정검사 LIST ---------- */

function AnnualTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [planYear, setPlanYear] = useState(currentYear());

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

  const rows = q.data ?? [];
  const done = rows.filter((r) => r.performedDate).length;

  return (
    <Section
      title={
        <>
          {planYear}년 교정검사 LIST{' '}
          <span className="font-normal text-fg-muted">
            실시 {done} / 계획 {rows.length}
          </span>
        </>
      }
      right={
        <>
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
