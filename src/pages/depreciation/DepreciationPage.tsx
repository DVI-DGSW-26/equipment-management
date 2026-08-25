import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { depreciationApi, type ForecastGroupBy, type YearlyRow } from '@/api/depreciation';
import { queryKeys } from '@/api/queryKeys';
import { codeText } from '@/domain/assetCode';
import { currentYear, fmtDate } from '@/lib/date';
import { bookValue, won, wonRatio, wonShort } from '@/lib/won';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnPrimaryClass,
  inputClass,
  QueryState,
  Section,
  StatCards,
  Tabs,
  thClass,
} from '@/components/ui';

type TabKey = 'schedule' | 'yearly' | 'ledger' | 'forecast';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 연도 선택 목록. 과거 5년 ~ 내년 */
const yearOptions = (): number[] => {
  const y = currentYear();
  return Array.from({ length: 7 }, (_, i) => y + 1 - i);
};

export default function DepreciationPage() {
  const [tab, setTab] = useState<TabKey>('schedule');
  const [fiscalYear, setFiscalYear] = useState(currentYear());
  const qc = useQueryClient();
  const toast = useToast();

  const calculate = useMutation({
    mutationFn: () => depreciationApi.calculate(fiscalYear),
    onSuccess: (r) => {
      toast.ok(
        `${r.fiscalYear}년 상각 계산 완료 — 자산 ${r.assetCount.toLocaleString('ko-KR')}건 / 총 ${won(r.totalAmount)}원`,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.depreciation.all });
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
    },
    onError: toast.fail,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-[24px] font-semibold">감가상각</h1>
        <select
          className="w-28 rounded-sm border border-line bg-surface px-2 py-1.5 text-[19px]"
          value={fiscalYear}
          onChange={(e) => setFiscalYear(Number(e.target.value))}
        >
          {yearOptions().map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={calculate.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `${fiscalYear}년 감가상각을 다시 계산합니다. 기존 계산 결과는 대체됩니다. 진행할까요?`,
                )
              )
                calculate.mutate();
            }}
          >
            {calculate.isPending ? '계산 중…' : `${fiscalYear}년 상각 계산`}
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'schedule' as const, label: '감가상각비명세' },
          { key: 'yearly' as const, label: '연도별' },
          { key: 'ledger' as const, label: '고정자산관리대장' },
          { key: 'forecast' as const, label: '향후 예상' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/*
        요구사항 3-1 — 국고보조금 무형자산은 총 취득가액 기준으로 계산하고 상계는
        결산 시 회계팀이 별도 처리한다. 시스템 값과 결산 후 장부값이 달라지므로
        어느 탭에서 보든 이 기준을 알 수 있게 상시 표시한다.
      */}
      <p className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-[18px] text-warn">
        무형자산 11건(소프트웨어 10 · 특허권 1)은 <b>결산 전 기준</b>입니다. 국고보조금분을
        상계하지 않은 총 취득가액으로 계산하며, 상계는 결산 시 회계팀이 별도 처리합니다. 해당
        자산은 목록·상세에 “결산 전 기준” 표시가 붙습니다.
      </p>

      {tab === 'schedule' && <ScheduleTab fiscalYear={fiscalYear} />}
      {tab === 'yearly' && <YearlyTab fiscalYear={fiscalYear} />}
      {tab === 'ledger' && <LedgerTab fiscalYear={fiscalYear} />}
      {tab === 'forecast' && <ForecastTab />}
    </div>
  );
}

/* ---------- 감가상각비명세: 자산별 월별 ---------- */

function ScheduleTab({ fiscalYear }: { fiscalYear: number }) {
  const q = useQuery({
    queryKey: queryKeys.depreciation.schedule(fiscalYear),
    queryFn: () => depreciationApi.schedule(fiscalYear),
  });
  const d = q.data;
  const estFrom = d?.estimatedFromMonth ?? null;

  return (
    <Section
      title={`${fiscalYear}년 감가상각비명세`}
      right={
        estFrom ? (
          <Badge tone="warn">{estFrom}월부터 마감 전 예상치</Badge>
        ) : (
          d && <Badge tone="muted">전 기간 확정</Badge>
        )
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={(d?.rows ?? []).length === 0}
        emptyText={`${fiscalYear}년 계산 결과가 없습니다. 상단의 "${fiscalYear}년 상각 계산" 을 먼저 실행하세요.`}
      />
      {d && d.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[18px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={thClass}>계정과목</th>
                <th className={thClass}>자산코드</th>
                <th className={thClass}>자산명</th>
                <th className={thClass}>취득일</th>
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    className={`${thClass} text-right ${estFrom && m >= estFrom ? 'text-fg-muted' : ''}`}
                  >
                    {m}월
                  </th>
                ))}
                <th className={`${thClass} text-right`}>합계</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.assetId} className="border-b border-line hover:bg-bg">
                  <td className="px-3 py-1.5">{r.accountName}</td>
                  <td className="code px-3 py-1.5">{codeText(r.assetCode)}</td>
                  <td className="px-3 py-1.5">{r.assetName}</td>
                  <td className="px-3 py-1.5">{fmtDate(r.acquisitionDate)}</td>
                  {r.monthlyAmounts.map((v, i) => (
                    <td
                      key={i}
                      className={`num px-2 py-1.5 ${estFrom && i + 1 >= estFrom ? 'text-fg-muted' : ''}`}
                    >
                      {won(v)}
                    </td>
                  ))}
                  <td className="num px-3 py-1.5 font-medium">{won(r.total)}</td>
                </tr>
              ))}
              {d.subtotals.map((s) => (
                <tr key={s.accountCode} className="border-b border-line bg-bg/60 font-medium">
                  <td className="px-3 py-1.5" colSpan={4}>
                    소계 · {s.accountName}
                  </td>
                  {s.monthlyAmounts.map((v, i) => (
                    <td key={i} className="num px-2 py-1.5">
                      {won(v)}
                    </td>
                  ))}
                  <td className="num px-3 py-1.5">{won(s.total)}</td>
                </tr>
              ))}
              <tr className="bg-bg font-semibold">
                <td className="px-3 py-2" colSpan={16}>
                  총계 <span className="num float-right">{won(d.grandTotal)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------- 연도별: 자산 × 연도 피벗 ---------- */

interface PivotRow {
  assetId: number;
  assetCode: string | null;
  assetName: string;
  accountName: string;
  methodLabel: string | null;
  byYear: Record<number, YearlyRow>;
}

function YearlyTab({ fiscalYear }: { fiscalYear: number }) {
  const [fromYear, setFromYear] = useState(fiscalYear - 2);
  const [toYear, setToYear] = useState(fiscalYear);

  const q = useQuery({
    queryKey: queryKeys.depreciation.yearly(fromYear, toYear),
    queryFn: () => depreciationApi.yearly(fromYear, toYear),
    enabled: fromYear <= toYear,
  });

  const years = useMemo(
    () => Array.from({ length: Math.max(0, toYear - fromYear + 1) }, (_, i) => fromYear + i),
    [fromYear, toYear],
  );

  const pivot = useMemo<PivotRow[]>(() => {
    const map = new Map<number, PivotRow>();
    (q.data?.rows ?? []).forEach((r) => {
      const row =
        map.get(r.assetId) ??
        ({
          assetId: r.assetId,
          assetCode: r.assetCode,
          assetName: r.assetName,
          accountName: r.accountName,
          methodLabel: r.depreciationMethodLabel,
          byYear: {},
        } satisfies PivotRow);
      row.byYear[r.fiscalYear] = r;
      map.set(r.assetId, row);
    });
    return [...map.values()];
  }, [q.data]);

  const totals = q.data?.totalsByYear ?? {};
  const maxTotal = Math.max(0, ...years.map((y) => totals[String(y)] ?? 0));

  return (
    <div className="space-y-3">
      <Section title="조회 기간">
        <div className="flex items-end gap-3 px-3 py-3">
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">시작 연도</span>
            <input
              type="number"
              className={`${inputClass} num w-28`}
              value={fromYear}
              onChange={(e) => setFromYear(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">종료 연도</span>
            <input
              type="number"
              className={`${inputClass} num w-28`}
              value={toYear}
              onChange={(e) => setToYear(Number(e.target.value))}
            />
          </label>
          {fromYear > toYear && (
            <span className="pb-1 text-[18px] text-danger">시작 연도가 종료 연도보다 큽니다.</span>
          )}
        </div>
      </Section>

      <Section title="연도별 상각비 합계">
        <div className="space-y-1 px-3 py-3">
          {years.map((y) => {
            const v = totals[String(y)] ?? 0;
            return (
              <div key={y} className="flex items-center gap-2 text-[18px]">
                <span className="w-14 text-fg-sub">{y}년</span>
                <span className="h-3 flex-1 bg-bg">
                  <span
                    className="block h-3 bg-accent"
                    style={{ width: `${wonRatio(v, maxTotal) * 100}%` }}
                  />
                </span>
                <span className="num w-32">{won(v)}</span>
              </div>
            );
          })}
          {maxTotal === 0 && (
            <p className="text-[18px] text-fg-muted">
              해당 기간에 계산된 상각비가 없습니다. 연도별 상각 계산을 먼저 실행하세요.
            </p>
          )}
        </div>
      </Section>

      <Section title="자산별">
        <QueryState
          isPending={q.isPending}
          error={q.error}
          isEmpty={pivot.length === 0}
          emptyText="조회 결과가 없습니다."
        />
        {pivot.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[18px]">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-fg-sub">
                  <th className={thClass}>자산코드</th>
                  <th className={thClass}>자산명</th>
                  <th className={thClass}>계정과목</th>
                  <th className={thClass}>상각방법</th>
                  {years.map((y) => (
                    <th key={y} className={`${thClass} text-right`}>
                      {y} 상각비
                    </th>
                  ))}
                  <th className={`${thClass} text-right`}>{toYear} 상각누계액</th>
                  <th className={`${thClass} text-right`}>{toYear} 장부가액</th>
                </tr>
              </thead>
              <tbody>
                {pivot.map((r) => (
                  <tr key={r.assetId} className="border-b border-line hover:bg-bg">
                    <td className="code px-3 py-1.5">{codeText(r.assetCode)}</td>
                    <td className="px-3 py-1.5">{r.assetName}</td>
                    <td className="px-3 py-1.5">{r.accountName}</td>
                    <td className="px-3 py-1.5">{r.methodLabel ?? '-'}</td>
                    {years.map((y) => (
                      <td key={y} className="num px-3 py-1.5">
                        {won(r.byYear[y]?.depreciation)}
                      </td>
                    ))}
                    <td className="num px-3 py-1.5">{won(r.byYear[toYear]?.accumulated)}</td>
                    <td className="num px-3 py-1.5">{bookValue(r.byYear[toYear]?.bookValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------- 고정자산관리대장 ---------- */

function LedgerTab({ fiscalYear }: { fiscalYear: number }) {
  const q = useQuery({
    queryKey: queryKeys.depreciation.ledger(fiscalYear),
    queryFn: () => depreciationApi.ledger(fiscalYear),
  });
  const d = q.data;
  const g = d?.grandTotal;

  return (
    <div className="space-y-3">
      {g && (
        <StatCards
          cards={[
            { label: '자산 건수', value: `${g.assetCount.toLocaleString('ko-KR')}건` },
            { label: '기초가액', value: won(g.beginningValue) },
            { label: '당기 상각비', value: won(g.currentDepreciation) },
            { label: '당기말장부가액', value: bookValue(g.endingBookValue) },
          ]}
        />
      )}

      <Section title={`${fiscalYear}년 고정자산관리대장`}>
        <QueryState
          isPending={q.isPending}
          error={q.error}
          isEmpty={(d?.rows ?? []).length === 0}
          emptyText="대장 데이터가 없습니다."
        />
        {d && d.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[18px]">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-fg-sub">
                  <th className={thClass}>계정과목</th>
                  <th className={thClass}>자산코드</th>
                  <th className={thClass}>자산명</th>
                  <th className={thClass}>취득일</th>
                  <th className={`${thClass} text-right`}>수량</th>
                  <th className={`${thClass} text-right`}>기초가액</th>
                  <th className={`${thClass} text-right`}>전기말누계</th>
                  <th className={`${thClass} text-right`}>전기말장부</th>
                  <th className={`${thClass} text-right`}>내용연수</th>
                  <th className={`${thClass} text-right`}>상각률</th>
                  <th className={thClass}>상각방법</th>
                  <th className={`${thClass} text-right`}>범위액</th>
                  <th className={`${thClass} text-right`}>회사계상</th>
                  <th className={`${thClass} text-right`}>당기말누계</th>
                  <th className={`${thClass} text-right`}>당기말장부</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.assetId} className="border-b border-line hover:bg-bg">
                    <td className="px-3 py-1.5">{r.accountName}</td>
                    <td className="code px-3 py-1.5">{codeText(r.assetCode)}</td>
                    <td className="px-3 py-1.5">{r.assetName}</td>
                    <td className="px-3 py-1.5">{fmtDate(r.acquisitionDate)}</td>
                    <td className="num px-3 py-1.5">{r.quantity?.toLocaleString('ko-KR')}</td>
                    <td className="num px-3 py-1.5">{won(r.beginningValue)}</td>
                    <td className="num px-3 py-1.5">{won(r.priorAccumulated)}</td>
                    <td className="num px-3 py-1.5">{bookValue(r.priorBookValue)}</td>
                    <td className="num px-3 py-1.5">{r.usefulLifeYears ?? '-'}</td>
                    <td className="num px-3 py-1.5">{r.depreciationRate ?? '-'}</td>
                    <td className="px-3 py-1.5">{r.depreciationMethodLabel ?? '-'}</td>
                    <td className="num px-3 py-1.5">{won(r.annualRangeAmount)}</td>
                    <td className="num px-3 py-1.5">{won(r.currentDepreciation)}</td>
                    <td className="num px-3 py-1.5">{won(r.endingAccumulated)}</td>
                    <td className="num px-3 py-1.5">{bookValue(r.endingBookValue)}</td>
                  </tr>
                ))}
                {d.subtotals.map((s) => (
                  <tr key={s.accountCode ?? 'sub'} className="border-b border-line bg-bg/60 font-medium">
                    <td className="px-3 py-1.5" colSpan={4}>
                      소계 · {s.accountName} ({s.assetCount}건)
                    </td>
                    <td className="num px-3 py-1.5">{s.quantity?.toLocaleString('ko-KR')}</td>
                    <td className="num px-3 py-1.5">{won(s.beginningValue)}</td>
                    <td className="num px-3 py-1.5">{won(s.priorAccumulated)}</td>
                    <td className="num px-3 py-1.5">{bookValue(s.priorBookValue)}</td>
                    <td colSpan={3} />
                    <td className="num px-3 py-1.5">{won(s.annualRangeAmount)}</td>
                    <td className="num px-3 py-1.5">{won(s.currentDepreciation)}</td>
                    <td className="num px-3 py-1.5">{won(s.endingAccumulated)}</td>
                    <td className="num px-3 py-1.5">{bookValue(s.endingBookValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------- 향후 N개년 예상 ---------- */

function ForecastTab() {
  const [years, setYears] = useState(5);
  const [groupBy, setGroupBy] = useState<ForecastGroupBy>('account');
  // fromYear 를 비우면 서버가 내년부터 잡는다. 당기를 포함해 보여준다
  const [includeCurrent, setIncludeCurrent] = useState(true);
  const query = {
    fromYear: includeCurrent ? currentYear() : undefined,
    years,
    groupBy,
    granularity: 'year' as const,
  };

  const q = useQuery({
    queryKey: queryKeys.depreciation.forecast(query),
    queryFn: () => depreciationApi.forecast(query),
  });
  const d = q.data;
  const maxTotal = Math.max(0, ...(d?.yearlyTotals ?? []));

  return (
    <div className="space-y-3">
      <Section title="조회 조건">
        <div className="flex items-end gap-3 px-3 py-3">
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">기간</span>
            <select
              className={`${inputClass} w-28`}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
            >
              {[3, 5, 10].map((y) => (
                <option key={y} value={y}>
                  {y}개년
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">그룹</span>
            <select
              className={`${inputClass} w-32`}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as ForecastGroupBy)}
            >
              <option value="account">계정과목별</option>
              <option value="dept">부서별 (압출·가공·ST)</option>
              <option value="asset">자산별</option>
              <option value="total">전체 합계</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-1 text-[18px]">
            <input
              type="checkbox"
              checked={includeCurrent}
              onChange={(e) => setIncludeCurrent(e.target.checked)}
            />
            당기({currentYear()}년) 포함
          </label>
          <span className="pb-1 text-[18px] text-fg-muted">
            저장하지 않고 계산만 하는 추정치입니다.
          </span>
        </div>
      </Section>

      {d && (
        <Section title="연도별 예상 합계">
          <div className="space-y-1 px-3 py-3">
            {d.years.map((y, i) => (
              <div key={y} className="flex items-center gap-2 text-[18px]">
                <span className="w-14 text-fg-sub">{y}년</span>
                <span className="h-3 flex-1 bg-bg">
                  <span
                    className="block h-3 bg-accent"
                    style={{ width: `${wonRatio(d.yearlyTotals[i] ?? 0, maxTotal) * 100}%` }}
                  />
                </span>
                <span className="num w-32">{won(d.yearlyTotals[i])}</span>
                <span className="w-16 text-right text-fg-muted">
                  {wonShort(d.yearlyTotals[i])}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="상세">
        <QueryState
          isPending={q.isPending}
          error={q.error}
          isEmpty={(d?.rows ?? []).length === 0}
          emptyText="예상 데이터가 없습니다."
        />
        {d && d.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[18px]">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-fg-sub">
                  <th className={thClass}>
                    {groupBy === 'asset' ? '자산' : groupBy === 'dept' ? '부서' : '구분'}
                  </th>
                  {groupBy === 'asset' && <th className={thClass}>상각방법</th>}
                  {d.years.map((y) => (
                    <th key={y} className={`${thClass} text-right`}>
                      {y}
                    </th>
                  ))}
                  <th className={`${thClass} text-right`}>기간 합계</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.key} className="border-b border-line hover:bg-bg">
                    <td className="px-3 py-1.5">
                      <span className={groupBy === 'asset' ? 'code' : ''}>{r.key}</span>{' '}
                      <span className="text-fg-sub">{r.label}</span>
                    </td>
                    {groupBy === 'asset' && (
                      <td className="px-3 py-1.5">{r.depreciationMethodLabel ?? '-'}</td>
                    )}
                    {r.yearlyAmounts.map((v, i) => (
                      <td key={i} className="num px-3 py-1.5">
                        {won(v)}
                      </td>
                    ))}
                    <td className="num px-3 py-1.5 font-medium">{won(r.total)}</td>
                  </tr>
                ))}
                <tr className="bg-bg font-semibold">
                  <td className="px-3 py-2" colSpan={groupBy === 'asset' ? 2 : 1}>
                    총계
                  </td>
                  {d.yearlyTotals.map((v, i) => (
                    <td key={i} className="num px-3 py-2">
                      {won(v)}
                    </td>
                  ))}
                  <td className="num px-3 py-2">{won(d.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
