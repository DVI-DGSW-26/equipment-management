import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  depreciationApi,
  type ForecastGranularity,
  type ForecastGroupBy,
  type YearlyRow,
} from '@/api/depreciation';
import { queryKeys } from '@/api/queryKeys';
import type { Won } from '@/api/types';
import { codeText } from '@/domain/assetCode';
import { currentYear, fmtDate, getToday, toIsoDate } from '@/lib/date';
import { searchIn } from '@/lib/search';
import { downloadExcel, stampedFileName, type ExcelColumn } from '@/lib/excel';
import { bookValue, chartUnit, chartValue, won, wonRatio, wonShort, wonSpan } from '@/lib/won';
import { useToast } from '@/components/toastContext';
import { rowNo } from '@/lib/paging';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  filterClass,
  FilterCount,
  QueryState,
  SearchBox,
  Section,
  StatCards,
  stickyThClass,
  TableScroll,
  Tabs,
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

  /** 상단 버튼과 "계산 결과 없음" 안내에서 같이 쓴다 */
  const runCalculate = () => {
    if (
      window.confirm(
        `${fiscalYear}년 감가상각을 다시 계산합니다. 기존 계산 결과는 대체됩니다. 진행할까요?`,
      )
    )
      calculate.mutate();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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
            onClick={runCalculate}
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
        결산 시 회계팀이 별도 처리한다. 어느 탭에서 보든 이 기준을 알아야 하므로 늘 띄우되,
        세 줄을 먹어 표가 밀리던 것을 한 줄로 줄이고 자세한 사유는 마우스를 올렸을 때 보인다.
      */}
      <p
        className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-1.5 text-[18px] text-warn"
        title="국고보조금분을 상계하지 않은 총 취득가액으로 계산하며, 상계는 결산 시 회계팀이 별도 처리합니다. 해당 자산은 목록·상세에 “결산 전 기준” 표시가 붙습니다."
      >
        무형자산 11건(소프트웨어 10 · 특허권 1)은 <b>결산 전 기준</b>입니다 — 국고보조금 상계
        전 금액입니다.
      </p>

      {tab === 'schedule' && (
        <ScheduleTab
          fiscalYear={fiscalYear}
          onCalculate={runCalculate}
          calculating={calculate.isPending}
        />
      )}
      {tab === 'yearly' && (
        <YearlyTab
          fiscalYear={fiscalYear}
          onCalculate={runCalculate}
          calculating={calculate.isPending}
          /* 연도를 누르면 그 해 월별 명세로 넘어간다 (회계팀 회신 2026-09-01) */
          onOpenMonthly={(y) => {
            setFiscalYear(y);
            setTab('schedule');
          }}
        />
      )}
      {tab === 'ledger' && <LedgerTab fiscalYear={fiscalYear} />}
      {tab === 'forecast' && <ForecastTab />}
    </div>
  );
}

/**
 * 계정과목 선택지를 표에 실제로 있는 행에서 뽑는다.
 * 마스터를 따로 부르면 그 해에 상각 대상이 아닌 계정까지 목록에 뜬다.
 */
const accountOptions = (rows: { accountCode: string; accountName: string }[]) =>
  [...new Map(rows.map((r) => [r.accountCode, r.accountName])).entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

/**
 * 소계·총계는 서버가 전체 행을 기준으로 계산해 보내 준다.
 * 화면에서 행을 걸러내면 그 합계와 표가 맞지 않으므로, 필터가 걸린 동안에는 감추고
 * 왜 안 보이는지 적어 준다 — 남겨 두면 더한 값이 틀린 것처럼 읽힌다.
 */
function FilteredTotalsNote({ colSpan }: { colSpan: number }) {
  return (
    <tr className="bg-bg">
      <td className="px-3 py-2 text-[17px] text-fg-muted" colSpan={colSpan}>
        필터를 적용하는 동안에는 소계·총계를 감춥니다. 서버가 보내 준 합계는 전체 기준이라 걸러낸
        표와 맞지 않습니다.
      </td>
    </tr>
  );
}

/** 계정과목 고르기. 표마다 같은 모양으로 쓴다 */
function AccountPicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      className={`${filterClass} w-44`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="계정과목"
    >
      <option value="">계정과목 전체</option>
      {options.map(([code, name]) => (
        <option key={code} value={code}>
          {code} {name}
        </option>
      ))}
    </select>
  );
}

/**
 * 표를 화면에 보이는 열 그대로 엑셀로 내려받는 단추.
 * 네 탭이 같은 자리에 같은 모양으로 둔다 — 어느 표를 보든 같은 곳을 누르면 된다.
 * 소계·총계는 넣지 않는다. 엑셀에서 직접 더해 쓰는 편이 낫고, 걸러낸 표에서는 맞지도 않는다.
 */
function ExcelButton<T>({
  rows,
  columns,
  name,
}: {
  rows: T[];
  columns: ExcelColumn<T>[];
  name: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await downloadExcel(rows, columns, stampedFileName(name, toIsoDate(getToday())));
      toast.ok(`${rows.length.toLocaleString('ko-KR')}건을 내려받았습니다.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={btnClass}
      disabled={rows.length === 0 || busy}
      title={`화면에 보이는 그대로 ${rows.length.toLocaleString('ko-KR')}건을 내려받습니다.`}
      onClick={() => void run()}
    >
      {busy ? '만드는 중…' : 'Excel'}
    </button>
  );
}

/* ---------- 감가상각비명세: 자산별 월별 ---------- */

/** 계산 결과가 없을 때 상단까지 올라가지 않고 그 자리에서 실행할 수 있게 하는 버튼 */
function CalculateHere({
  label,
  onCalculate,
  calculating,
}: {
  label: string;
  onCalculate: () => void;
  calculating: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{label}</span>
      <button type="button" className={btnPrimaryClass} disabled={calculating} onClick={onCalculate}>
        {calculating ? '계산 중…' : '지금 계산하기'}
      </button>
    </span>
  );
}

function ScheduleTab({
  fiscalYear,
  onCalculate,
  calculating,
}: {
  fiscalYear: number;
  onCalculate: () => void;
  calculating: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const [account, setAccount] = useState('');

  const q = useQuery({
    queryKey: queryKeys.depreciation.schedule(fiscalYear),
    queryFn: () => depreciationApi.schedule(fiscalYear),
  });
  const d = q.data;
  const estFrom = d?.estimatedFromMonth ?? null;

  const all = d?.rows ?? [];
  const hit = searchIn(keyword);
  const rows = all.filter(
    (r) => (account === '' || r.accountCode === account) && hit(r.assetCode, r.assetName),
  );
  const filtering = keyword.trim() !== '' || account !== '';

  return (
    <Section
      title={`${fiscalYear}년 감가상각비명세`}
      right={
        <>
          <SearchBox value={keyword} onChange={setKeyword} placeholder="자산코드·자산명" />
          <AccountPicker value={account} onChange={setAccount} options={accountOptions(all)} />
          <FilterCount shown={rows.length} total={all.length} />
          <ExcelButton
            rows={rows.map((r, i) => ({ ...r, no: rowNo(i) }))}
            columns={[
              { header: 'No.', value: (r) => r.no, numeric: true, width: 6 },
              { header: '계정과목', value: (r) => r.accountName, width: 16 },
              { header: '자산코드', value: (r) => r.assetCode, width: 18 },
              { header: '자산명', value: (r) => r.assetName, width: 26 },
              { header: '취득일', value: (r) => r.acquisitionDate, width: 14 },
              ...MONTHS.map((m, mi) => ({
                header: `${m}월`,
                value: (r: (typeof rows)[number]) => r.monthlyAmounts[mi] ?? null,
                numeric: true,
                width: 14,
              })),
              { header: '합계', value: (r) => r.total, numeric: true, width: 16 },
            ]}
            name={`${fiscalYear}년_감가상각비명세`}
          />
          {estFrom ? (
            <Badge tone="warn">{estFrom}월부터 마감 전 예상치</Badge>
          ) : (
            d && <Badge tone="muted">전 기간 확정</Badge>
          )}
        </>
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={
          filtering ? (
            '검색 결과가 없습니다.'
          ) : (
            <CalculateHere
              label={`${fiscalYear}년 계산 결과가 없습니다.`}
              onCalculate={onCalculate}
              calculating={calculating}
            />
          )
        }
      />
      {d && rows.length > 0 && (
        <TableScroll>
          <table className="w-max text-[18px]">
            <thead>
              <tr className="text-left text-fg-sub">
                <th className={`${stickyThClass} w-14 text-right`}>No.</th>
                <th className={stickyThClass}>계정과목</th>
                <th className={stickyThClass}>자산코드</th>
                <th className={stickyThClass}>자산명</th>
                <th className={stickyThClass}>취득일</th>
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    className={`${stickyThClass} text-right ${estFrom && m >= estFrom ? 'text-fg-muted' : ''}`}
                  >
                    {m}월
                  </th>
                ))}
                <th className={`${stickyThClass} text-right`}>합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.assetId} className="border-b border-line hover:bg-bg">
                  <td className="num px-3 py-1.5 text-fg-muted">{rowNo(i)}</td>
                  <td className="px-3 py-1.5">{r.accountName}</td>
                  <td className="code px-3 py-1.5">{codeText(r.assetCode)}</td>
                  <td className="px-3 py-1.5">{r.assetName}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.acquisitionDate)}</td>
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
              {filtering ? (
                <FilteredTotalsNote colSpan={18} />
              ) : (
                <>
                  {d.subtotals.map((s) => (
                    <tr key={s.accountCode} className="border-b border-line bg-bg/60 font-medium">
                      <td className="px-3 py-1.5" colSpan={5}>
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
                    <td className="px-3 py-2" colSpan={18}>
                      총계 <span className="num float-right">{won(d.grandTotal)}</span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}

/* ---------- 연도별: 자산 × 연도 피벗 ---------- */

interface PivotRow {
  assetId: number;
  assetCode: string | null;
  assetName: string;
  accountCode: string;
  accountName: string;
  methodLabel: string | null;
  byYear: Record<number, YearlyRow>;
}

function YearlyTab({
  fiscalYear,
  onCalculate,
  calculating,
  onOpenMonthly,
}: {
  fiscalYear: number;
  onCalculate: () => void;
  calculating: boolean;
  /** 그 해 월별 명세(감가상각비명세 탭)로 넘긴다 */
  onOpenMonthly: (year: number) => void;
}) {
  const [fromYear, setFromYear] = useState(fiscalYear - 2);
  const [toYear, setToYear] = useState(fiscalYear);
  const [keyword, setKeyword] = useState('');
  const [account, setAccount] = useState('');

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
          accountCode: r.accountCode,
          accountName: r.accountName,
          methodLabel: r.depreciationMethodLabel,
          byYear: {},
        } satisfies PivotRow);
      row.byYear[r.fiscalYear] = r;
      map.set(r.assetId, row);
    });
    return [...map.values()];
  }, [q.data]);

  /* 자산별 표만 거른다. 위의 연도별 합계는 서버가 준 전체 기준 값이라 건드리지 않는다 */
  const hit = searchIn(keyword);
  const shown = pivot.filter(
    (r) => (account === '' || r.accountCode === account) && hit(r.assetCode, r.assetName),
  );

  const totals = q.data?.totalsByYear ?? {};
  const maxTotal = Math.max(0, ...years.map((y) => totals[String(y)] ?? 0));

  return (
    <div className="space-y-3">
      {/* 조건은 한 줄로. 라벨을 칸 위에 얹으면 높이가 두 배가 되고 표가 그만큼 밀린다 */}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2">
        <span className="text-[18px] text-fg-sub">조회 기간</span>
        <input
          type="number"
          className={`${filterClass} num w-24`}
          aria-label="시작 연도"
          value={fromYear}
          onChange={(e) => setFromYear(Number(e.target.value))}
        />
        <span className="text-[18px] text-fg-muted">~</span>
        <input
          type="number"
          className={`${filterClass} num w-24`}
          aria-label="종료 연도"
          value={toYear}
          onChange={(e) => setToYear(Number(e.target.value))}
        />
        {fromYear > toYear && (
          <span className="text-[18px] text-danger">시작 연도가 종료 연도보다 큽니다.</span>
        )}
      </div>

      <Section
        title="연도별 상각비 합계"
        right={<span className="text-[18px] text-fg-muted">연도를 누르면 월별 명세로 갑니다.</span>}
      >
        <div className="space-y-1 px-3 py-3">
          {years.map((y) => {
            const v = totals[String(y)] ?? 0;
            return (
              <button
                key={y}
                type="button"
                onClick={() => onOpenMonthly(y)}
                title={`${y}년 월별 명세 보기`}
                className="flex w-full items-center gap-2 rounded-sm px-1 text-left text-[18px] hover:bg-bg"
              >
                <span className="w-20 shrink-0 whitespace-nowrap text-fg-sub">{y}년</span>
                <span className="h-3 flex-1 bg-bg">
                  <span
                    className="block h-3 bg-accent"
                    style={{ width: `${wonRatio(v, maxTotal) * 100}%` }}
                  />
                </span>
                <span className="num w-32">{won(v)}</span>
                <span className="w-16 shrink-0 text-right text-fg-muted">월별 →</span>
              </button>
            );
          })}
          {maxTotal === 0 && (
            <div className="text-[18px] text-fg-muted">
              <CalculateHere
                label={`해당 기간에 계산된 상각비가 없습니다. (상단에서 고른 ${fiscalYear}년 기준)`}
                onCalculate={onCalculate}
                calculating={calculating}
              />
            </div>
          )}
        </div>
      </Section>

      <Section
        title="자산별"
        right={
          <>
            <SearchBox value={keyword} onChange={setKeyword} placeholder="자산코드·자산명" />
            <AccountPicker value={account} onChange={setAccount} options={accountOptions(pivot)} />
            <FilterCount shown={shown.length} total={pivot.length} />
            <ExcelButton
              rows={shown.map((r, i) => ({ ...r, no: rowNo(i) }))}
              columns={[
                { header: 'No.', value: (r) => r.no, numeric: true, width: 6 },
                { header: '자산코드', value: (r) => r.assetCode, width: 18 },
                { header: '자산명', value: (r) => r.assetName, width: 26 },
                { header: '계정과목', value: (r) => r.accountName, width: 16 },
                { header: '상각방법', value: (r) => r.methodLabel, width: 12 },
                ...years.map((y) => ({
                  header: `${y} 상각비`,
                  value: (r: (typeof shown)[number]) => r.byYear[y]?.depreciation ?? null,
                  numeric: true,
                  width: 16,
                })),
                {
                  header: `${toYear} 상각누계액`,
                  value: (r) => r.byYear[toYear]?.accumulated ?? null,
                  numeric: true,
                  width: 18,
                },
                {
                  header: `${toYear} 장부가액`,
                  value: (r) => r.byYear[toYear]?.bookValue ?? null,
                  numeric: true,
                  width: 18,
                },
              ]}
              name={`${fromYear}-${toYear}년_연도별상각`}
            />
          </>
        }
      >
        <QueryState
          isPending={q.isPending}
          error={q.error}
          isEmpty={shown.length === 0}
          emptyText={pivot.length > 0 ? '검색 결과가 없습니다.' : '조회 결과가 없습니다.'}
        />
        {shown.length > 0 && (
          <TableScroll>
            <table className="w-max text-[18px]">
              <thead>
                <tr className="text-left text-fg-sub">
                  <th className={`${stickyThClass} w-14 text-right`}>No.</th>
                  <th className={stickyThClass}>자산코드</th>
                  <th className={stickyThClass}>자산명</th>
                  <th className={stickyThClass}>계정과목</th>
                  <th className={stickyThClass}>상각방법</th>
                  {years.map((y) => (
                    <th key={y} className={`${stickyThClass} text-right`}>
                      {y} 상각비
                    </th>
                  ))}
                  <th className={`${stickyThClass} text-right`}>{toYear} 상각누계액</th>
                  <th className={`${stickyThClass} text-right`}>{toYear} 장부가액</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.assetId} className="border-b border-line hover:bg-bg">
                    <td className="num px-3 py-1.5 text-fg-muted">{rowNo(i)}</td>
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
          </TableScroll>
        )}
      </Section>
    </div>
  );
}

/* ---------- 고정자산관리대장 ---------- */

function LedgerTab({ fiscalYear }: { fiscalYear: number }) {
  const [keyword, setKeyword] = useState('');
  const [account, setAccount] = useState('');

  const q = useQuery({
    queryKey: queryKeys.depreciation.ledger(fiscalYear),
    queryFn: () => depreciationApi.ledger(fiscalYear),
  });
  const d = q.data;
  const g = d?.grandTotal;

  const all = d?.rows ?? [];
  const hit = searchIn(keyword);
  const rows = all.filter(
    (r) => (account === '' || r.accountCode === account) && hit(r.assetCode, r.assetName),
  );
  const filtering = keyword.trim() !== '' || account !== '';

  return (
    <div className="space-y-3">
      {g && (
        <StatCards
          cards={[
            { label: '자산 건수', value: `${g.assetCount.toLocaleString('ko-KR')}건` },
            { label: '기초가액', value: won(g.beginningValue), hint: '전년말까지의 기준가액' },
            {
              label: '신규취득및증가',
              value: won(g.additionAmount),
              hint: '당기 자본적지출',
            },
            { label: '당기 상각비', value: won(g.currentDepreciation) },
            { label: '당기말장부가액', value: bookValue(g.endingBookValue) },
          ]}
        />
      )}

      <Section
        title={`${fiscalYear}년 고정자산관리대장`}
        right={
          <>
            <SearchBox value={keyword} onChange={setKeyword} placeholder="자산코드·자산명" />
            <AccountPicker value={account} onChange={setAccount} options={accountOptions(all)} />
            <FilterCount shown={rows.length} total={all.length} />
            <ExcelButton
              rows={rows.map((r, i) => ({ ...r, no: rowNo(i) }))}
              columns={[
                { header: 'No.', value: (r) => r.no, numeric: true, width: 6 },
                { header: '계정과목', value: (r) => r.accountName, width: 16 },
                { header: '자산코드', value: (r) => r.assetCode, width: 18 },
                { header: '자산명', value: (r) => r.assetName, width: 26 },
                { header: '취득일', value: (r) => r.acquisitionDate, width: 14 },
                { header: '수량', value: (r) => r.quantity, numeric: true, width: 8 },
                { header: '기초가액', value: (r) => r.beginningValue, numeric: true, width: 16 },
                { header: '신규취득및증가', value: (r) => r.additionAmount, numeric: true, width: 16 },
                { header: '전기말누계', value: (r) => r.priorAccumulated, numeric: true, width: 16 },
                { header: '전기말장부', value: (r) => r.priorBookValue, numeric: true, width: 16 },
                { header: '내용연수', value: (r) => r.usefulLifeYears, numeric: true, width: 10 },
                { header: '상각률', value: (r) => r.depreciationRate, numeric: true, width: 10 },
                { header: '상각방법', value: (r) => r.depreciationMethodLabel, width: 12 },
                { header: '범위액', value: (r) => r.annualRangeAmount, numeric: true, width: 16 },
                { header: '회사계상', value: (r) => r.currentDepreciation, numeric: true, width: 16 },
                { header: '당기말누계', value: (r) => r.endingAccumulated, numeric: true, width: 16 },
                { header: '당기말장부', value: (r) => r.endingBookValue, numeric: true, width: 16 },
              ]}
              name={`${fiscalYear}년_고정자산관리대장`}
            />
          </>
        }
      >
        <QueryState
          isPending={q.isPending}
          error={q.error}
          isEmpty={rows.length === 0}
          emptyText={filtering ? '검색 결과가 없습니다.' : '대장 데이터가 없습니다.'}
        />
        {d && rows.length > 0 && (
          <TableScroll>
            <table className="w-max text-[18px]">
              <thead>
                <tr className="text-left text-fg-sub">
                  <th className={`${stickyThClass} w-14 text-right`}>No.</th>
                  <th className={stickyThClass}>계정과목</th>
                  <th className={stickyThClass}>자산코드</th>
                  <th className={stickyThClass}>자산명</th>
                  <th className={stickyThClass}>취득일</th>
                  <th className={`${stickyThClass} text-right`}>수량</th>
                  {/* 기초가액은 전년말까지의 기준가액이고, 당기 증가분은 옆 열로 갈라 놓는다 */}
                  <th className={`${stickyThClass} text-right`} title="전년말까지의 기준가액">
                    기초가액
                  </th>
                  <th
                    className={`${stickyThClass} text-right`}
                    title="당기 자본적지출 — 발생 연도부터 상각 기준가액에 더해진다"
                  >
                    신규취득및증가
                  </th>
                  <th className={`${stickyThClass} text-right`}>전기말누계</th>
                  <th className={`${stickyThClass} text-right`}>전기말장부</th>
                  <th className={`${stickyThClass} text-right`}>내용연수</th>
                  <th className={`${stickyThClass} text-right`}>상각률</th>
                  <th className={stickyThClass}>상각방법</th>
                  <th className={`${stickyThClass} text-right`}>범위액</th>
                  <th className={`${stickyThClass} text-right`}>회사계상</th>
                  <th className={`${stickyThClass} text-right`}>당기말누계</th>
                  <th className={`${stickyThClass} text-right`}>당기말장부</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.assetId} className="border-b border-line hover:bg-bg">
                    <td className="num px-3 py-1.5 text-fg-muted">{rowNo(i)}</td>
                    <td className="px-3 py-1.5">{r.accountName}</td>
                    <td className="code px-3 py-1.5">{codeText(r.assetCode)}</td>
                    <td className="px-3 py-1.5">{r.assetName}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.acquisitionDate)}</td>
                    <td className="num px-3 py-1.5">{r.quantity?.toLocaleString('ko-KR')}</td>
                    <td className="num px-3 py-1.5">{won(r.beginningValue)}</td>
                    <td className="num px-3 py-1.5">{won(r.additionAmount)}</td>
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
                {filtering ? (
                  <FilteredTotalsNote colSpan={17} />
                ) : (
                  d.subtotals.map((s) => (
                    <tr
                      key={s.accountCode ?? 'sub'}
                      className="border-b border-line bg-bg/60 font-medium"
                    >
                      <td className="px-3 py-1.5" colSpan={5}>
                        소계 · {s.accountName} ({s.assetCount}건)
                      </td>
                      <td className="num px-3 py-1.5">{s.quantity?.toLocaleString('ko-KR')}</td>
                      <td className="num px-3 py-1.5">{won(s.beginningValue)}</td>
                      <td className="num px-3 py-1.5">{won(s.additionAmount)}</td>
                      <td className="num px-3 py-1.5">{won(s.priorAccumulated)}</td>
                      <td className="num px-3 py-1.5">{bookValue(s.priorBookValue)}</td>
                      <td colSpan={3} />
                      <td className="num px-3 py-1.5">{won(s.annualRangeAmount)}</td>
                      <td className="num px-3 py-1.5">{won(s.currentDepreciation)}</td>
                      <td className="num px-3 py-1.5">{won(s.endingAccumulated)}</td>
                      <td className="num px-3 py-1.5">{bookValue(s.endingBookValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
    </div>
  );
}

/* ---------- 향후 N개년 예상 ---------- */


function ForecastTab() {
  const [years, setYears] = useState(5);
  const [groupBy, setGroupBy] = useState<ForecastGroupBy>('account');
  const [granularity, setGranularity] = useState<ForecastGranularity>('year');
  // fromYear 를 비우면 서버가 내년부터 잡는다. 당기를 포함해 보여준다
  const [includeCurrent, setIncludeCurrent] = useState(true);
  /** 월 단위로 볼 때 표에 펼칠 연도. 12개월 × N개년을 한 표에 늘어놓으면 읽을 수 없다 */
  const [monthYear, setMonthYear] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');

  const query = {
    fromYear: includeCurrent ? currentYear() : undefined,
    years,
    groupBy,
    granularity,
  };

  const q = useQuery({
    queryKey: queryKeys.depreciation.forecast(query),
    queryFn: () => depreciationApi.forecast(query),
  });
  const d = q.data;
  const maxTotal = Math.max(0, ...(d?.yearlyTotals ?? []));

  /* 조건을 바꿔 고른 연도가 사라지면 첫 연도로 되돌린다 */
  const shownYear =
    d && d.years.length > 0
      ? monthYear != null && d.years.includes(monthYear)
        ? monthYear
        : d.years[0]
      : null;
  const yearIndex = d && shownYear != null ? d.years.indexOf(shownYear) : -1;
  /* 서버가 월별 값을 실제로 실어 보냈을 때만 월 표로 바꾼다 */
  const byMonth = granularity === 'month' && yearIndex >= 0 && d?.monthlyTotals != null;

  /* 표만 거른다. 위의 합계·추이 그래프는 서버가 준 전체 기준 값이라 건드리지 않는다 */
  const hit = searchIn(keyword);
  const shownRows = (d?.rows ?? []).filter((r) => hit(r.key, r.label));

  return (
    <div className="space-y-3">
      {/* 조건은 한 줄로. 라벨을 칸 위에 얹으면 높이가 두 배가 되고 표가 그만큼 밀린다 */}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2">
        <select
          className={`${filterClass} w-28`}
          value={years}
          aria-label="기간"
          onChange={(e) => setYears(Number(e.target.value))}
        >
          {[3, 5, 10].map((y) => (
            <option key={y} value={y}>
              {y}개년
            </option>
          ))}
        </select>
        <select
          className={`${filterClass} w-28`}
          value={granularity}
          aria-label="단위"
          onChange={(e) => setGranularity(e.target.value as ForecastGranularity)}
        >
          <option value="year">연 단위</option>
          <option value="month">월 단위</option>
        </select>
        {granularity === 'month' && (
          <select
            className={`${filterClass} w-28`}
            value={shownYear ?? ''}
            aria-label="표시 연도"
            onChange={(e) => setMonthYear(Number(e.target.value))}
          >
            {(d?.years ?? []).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        )}
        <select
          className={`${filterClass} w-44`}
          value={groupBy}
          aria-label="묶는 기준"
          onChange={(e) => setGroupBy(e.target.value as ForecastGroupBy)}
        >
          <option value="account">계정과목별</option>
          <option value="dept">부서별 (압출·가공·ST)</option>
          <option value="asset">자산별</option>
          <option value="total">전체 합계</option>
        </select>
        <label className="flex items-center gap-2 text-[18px]">
          <input
            type="checkbox"
            checked={includeCurrent}
            onChange={(e) => setIncludeCurrent(e.target.checked)}
          />
          당기({currentYear()}년) 포함
        </label>
        <span className="text-[18px] text-fg-muted">저장하지 않고 계산만 하는 추정치입니다.</span>
      </div>

      {d && (
        <Section
          title="연도별 예상 합계"
          right={
            granularity === 'month' ? (
              <span className="text-[18px] text-fg-muted">
                연도를 누르면 그 해 월별로 펼칩니다.
              </span>
            ) : undefined
          }
        >
          <div className="space-y-1 px-3 py-3">
            {d.years.map((y, i) => {
              const bar = (
                <>
                  <span
                    className={`w-20 shrink-0 whitespace-nowrap ${
                      y === shownYear && granularity === 'month'
                        ? 'font-semibold text-fg'
                        : 'text-fg-sub'
                    }`}
                  >
                    {y}년
                  </span>
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
                </>
              );

              return granularity === 'month' ? (
                <button
                  key={y}
                  type="button"
                  onClick={() => setMonthYear(y)}
                  className="flex w-full items-center gap-2 rounded-sm px-1 text-left text-[18px] hover:bg-bg"
                >
                  {bar}
                </button>
              ) : (
                <div key={y} className="flex items-center gap-2 px-1 text-[18px]">
                  {bar}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {byMonth && shownYear != null && (
        <Section title={`${shownYear}년 월별 추이`}>
          <MonthlyTrend year={shownYear} amounts={d?.monthlyTotals?.[yearIndex] ?? []} />
        </Section>
      )}

      <Section
        title={byMonth ? `${shownYear}년 월별 예상` : '상세'}
        right={
          <>
            <SearchBox
              value={keyword}
              onChange={setKeyword}
              placeholder={groupBy === 'asset' ? '자산코드·자산명' : '코드·이름'}
            />
            <FilterCount shown={shownRows.length} total={(d?.rows ?? []).length} />
            <ExcelButton
              rows={shownRows.map((r, i) => ({ ...r, no: rowNo(i) }))}
              columns={[
                { header: 'No.', value: (r) => r.no, numeric: true, width: 6 },
                { header: '구분', value: (r) => `${r.key} ${r.label}`.trim(), width: 28 },
                ...(byMonth
                  ? MONTHS.map((m, mi) => ({
                      header: `${m}월`,
                      value: (r: (typeof shownRows)[number]) =>
                        r.monthlyAmounts?.[yearIndex]?.[mi] ?? null,
                      numeric: true,
                      width: 14,
                    }))
                  : (d?.years ?? []).map((y, yi) => ({
                      header: `${y}`,
                      value: (r: (typeof shownRows)[number]) => r.yearlyAmounts[yi] ?? null,
                      numeric: true,
                      width: 16,
                    }))),
                {
                  header: byMonth ? `${shownYear} 합계` : '기간 합계',
                  value: (r) => (byMonth ? (r.yearlyAmounts[yearIndex] ?? null) : r.total),
                  numeric: true,
                  width: 18,
                },
              ]}
              name={byMonth ? `${shownYear}년_월별예상` : '향후상각예상'}
            />
          </>
        }
      >
        <QueryState
          isPending={q.isPending}
          error={q.error}
          isEmpty={shownRows.length === 0}
          emptyText={
            (d?.rows ?? []).length > 0 ? '검색 결과가 없습니다.' : '예상 데이터가 없습니다.'
          }
        />
        {d && shownRows.length > 0 && (
          <TableScroll>
            <table className="w-max text-[18px]">
              <thead>
                <tr className="text-left text-fg-sub">
                  <th className={`${stickyThClass} w-14 text-right`}>No.</th>
                  <th className={stickyThClass}>
                    {groupBy === 'asset' ? '자산' : groupBy === 'dept' ? '부서' : '구분'}
                  </th>
                  {groupBy === 'asset' && <th className={stickyThClass}>상각방법</th>}
                  {byMonth
                    ? MONTHS.map((m) => (
                        <th key={m} className={`${stickyThClass} text-right`}>
                          {m}월
                        </th>
                      ))
                    : d.years.map((y) => (
                        <th key={y} className={`${stickyThClass} text-right`}>
                          {y}
                        </th>
                      ))}
                  <th className={`${stickyThClass} text-right`}>
                    {byMonth ? `${shownYear} 합계` : '기간 합계'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, i) => (
                  <tr key={r.key} className="border-b border-line hover:bg-bg">
                    <td className="num px-3 py-1.5 text-fg-muted">{rowNo(i)}</td>
                    <td className="px-3 py-1.5">
                      <span className={groupBy === 'asset' ? 'code' : ''}>{r.key}</span>{' '}
                      <span className="text-fg-sub">{r.label}</span>
                    </td>
                    {groupBy === 'asset' && (
                      <td className="px-3 py-1.5">{r.depreciationMethodLabel ?? '-'}</td>
                    )}
                    {/* 칸 수가 열 머리와 어긋나지 않도록 월 표는 늘 12칸을 찍는다 */}
                    {byMonth
                      ? MONTHS.map((m, i) => (
                          <td key={m} className="num px-3 py-1.5">
                            {won(r.monthlyAmounts?.[yearIndex]?.[i])}
                          </td>
                        ))
                      : r.yearlyAmounts.map((v, i) => (
                          <td key={i} className="num px-3 py-1.5">
                            {won(v)}
                          </td>
                        ))}
                    <td className="num px-3 py-1.5 font-medium">
                      {won(byMonth ? r.yearlyAmounts[yearIndex] : r.total)}
                    </td>
                  </tr>
                ))}
                {keyword.trim() !== '' ? (
                  <FilteredTotalsNote
                    /* 연번 + 구분(+상각방법) + 값 칸들 + 합계 */
                    colSpan={
                      1 +
                      (groupBy === 'asset' ? 2 : 1) +
                      (byMonth ? MONTHS.length : d.years.length) +
                      1
                    }
                  />
                ) : (
                  <tr className="bg-bg font-semibold">
                    <td className="px-3 py-2" colSpan={groupBy === 'asset' ? 3 : 2}>
                      총계
                    </td>
                    {byMonth
                      ? MONTHS.map((m, i) => (
                          <td key={m} className="num px-3 py-2">
                            {won(d.monthlyTotals?.[yearIndex]?.[i])}
                          </td>
                        ))
                      : d.yearlyTotals.map((v, i) => (
                          <td key={i} className="num px-3 py-2">
                            {won(v)}
                          </td>
                        ))}
                    <td className="num px-3 py-2">
                      {won(byMonth ? d.yearlyTotals[yearIndex] : d.grandTotal)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
    </div>
  );
}

/**
 * 한 해 열두 달 예상 상각비의 추이.
 *
 * 막대가 아니라 점과 선으로 그린다. 상각비는 달마다 거의 같아서(정액법이라 자산이
 * 새로 들어오거나 다 상각될 때만 계단처럼 바뀐다) 0 부터 그린 막대는 열두 개가 모두
 * 같은 높이로 보인다 — 어느 달이 오르내리는지 읽을 수가 없었다(2026-09-03 피드백).
 *
 * 그래서 세로축을 그 해 최소~최대 구간으로 확대한다. 막대는 이렇게 자르면 안 된다.
 * 막대는 길이가 곧 금액이라 밑을 자르는 순간 두 배 차이처럼 보이는 거짓말이 된다.
 * 점과 선은 길이가 아니라 자리로 읽으니 구간을 확대해도 괜찮다.
 *
 * 대신 확대했다는 사실과 위아래 눈금 금액을 그림 안에 적는다. 정확한 열두 달 금액은
 * 바로 아래 표에 다 있고, 점에 마우스를 올리면 그 달 금액이 뜬다.
 *
 * 계열이 하나뿐이라 색은 앱 액센트 하나만 쓴다(위 연도별 막대와 같은 색이라야
 * 같은 자료로 읽힌다). 금액 산술은 하지 않는다 — wonSpan 은 좌표에만 쓴다.
 */
function MonthlyTrend({ year, amounts }: { year: number; amounts: Won[] }) {
  const values = MONTHS.map((_, i) => {
    const v = amounts[i];
    return Number.isFinite(v) ? v : 0;
  });
  const max = Math.max(...values);
  const min = Math.min(...values);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const trough = max > 0 ? values.indexOf(min) : -1;
  /** 열두 달이 모두 같으면 오르내림이 없다 — 확대해도 보여줄 것이 없다 */
  const flat = max === min;

  if (max <= 0) {
    return (
      <p className="px-3 py-4 text-[18px] text-fg-muted">이 해에는 예상 상각비가 없습니다.</p>
    );
  }

  /*
   * 점 자리. 위쪽은 금액 라벨이 앉을 만큼 비워 둔다 —
   * 가장 높은 점의 라벨이 그림 밖으로 넘어가면 잘린다.
   */
  const posOf = (i: number) => (flat ? 42 : 12 + wonSpan(values[i], min, max) * 62);
  const unit = chartUnit(max);
  /* 달마다 한 칸씩 나눠 가운데에 점을 찍는다. 아래 달 이름과 같은 자리 */
  const xOf = (i: number) => ((i + 0.5) / MONTHS.length) * 100;

  return (
    <div className="px-3 py-4">
      {/* 가장 많은 달과 가장 적은 달은 그림에서 찾게 하지 말고 글로 먼저 적는다 */}
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[18px]">
        <span>
          <span className="text-fg-muted">가장 많은 달</span>{' '}
          <b className="font-semibold">
            {peak + 1}월 · {won(max)}원
          </b>
        </span>
        <span>
          <span className="text-fg-muted">가장 적은 달</span>{' '}
          <b className="font-semibold">
            {trough + 1}월 · {won(min)}원
          </b>
        </span>
        <span className="ml-auto text-fg-muted">그래프 단위 : {unit}</span>
      </div>

      <div>
        <div className="min-w-0">
          <div className="relative h-52 border-y border-line">

        {/*
          선만 SVG 로 그린다. 폭에 맞춰 늘어나도 굵기가 변하지 않게 non-scaling-stroke 를 준다.
          점은 HTML 로 찍는다 — SVG 를 가로로 늘리면 동그라미가 타원이 된다.
        */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={MONTHS.map((_, i) => `${xOf(i)},${100 - posOf(i)}`).join(' ')}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {MONTHS.map((m, i) => {
              const mark = i === peak || i === trough;
              return (
                <span key={m}>
                  {/* 금액은 점 바로 위에. 단위는 그림에 한 번만 적혀 있다 */}
                  <span
                    className={`absolute mb-2.5 block translate-x-[-50%] bg-surface px-1 text-[15px] whitespace-nowrap tabular-nums ${
                      mark ? 'font-semibold text-fg' : 'text-fg-sub'
                    }`}
                    style={{ left: `${xOf(i)}%`, bottom: `${posOf(i)}%` }}
                  >
                    {chartValue(values[i], unit)}
                  </span>
                  <span
                    className={`absolute block translate-x-[-50%] translate-y-1/2 rounded-full bg-accent ${
                      mark ? 'h-3 w-3 ring-2 ring-surface' : 'h-2 w-2'
                    }`}
                    style={{ left: `${xOf(i)}%`, bottom: `${posOf(i)}%` }}
                  />
                </span>
              );
            })}

            {/* 마우스를 올리면 그 달 금액이 뜨는 칸. 점보다 넓어야 잡힌다 */}
            <div className="absolute inset-0 flex">
              {MONTHS.map((m) => (
                <span
                  key={m}
                  className="flex-1"
                  title={`${year}년 ${m}월 · ${won(values[m - 1])}원`}
                />
              ))}
            </div>
          </div>

          <div className="flex pt-1">
            {MONTHS.map((m, i) => (
              <span
                key={m}
                className={`flex-1 text-center text-[17px] ${
                  i === peak || i === trough ? 'font-semibold text-fg' : 'text-fg-muted'
                }`}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[17px] text-fg-muted">
        {flat
          ? '열두 달이 모두 같은 금액입니다.'
          : `오르내림이 보이도록 세로축을 0원이 아니라 그 해 최소~최대 구간으로 확대해 그렸습니다. 점 위 숫자는 ${unit} 단위이고, 점에 마우스를 올리면 원 단위 금액이 뜹니다.`}
      </p>
    </div>
  );
}
