import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FROM_LIST } from '@/hooks/useBackToList';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import {
  assetsApi,
  ASSET_STATUS_LABEL,
  type Asset,
  type AssetFilter,
  type AssetStatus,
  type AssetSummary,
} from '@/api/assets';
import { saveFile } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { usePerms } from '@/hooks/useMe';
import { canEdit } from '@/lib/permissions';
import { useAccounts, useDepartments } from '@/hooks/useMasters';
import { useDebounced } from '@/hooks/useDebounced';
import { accountingCodeText } from '@/domain/assetCode';
import {
  bookValue,
  COST_PENDING,
  COST_PENDING_NOTE,
  depreciationBase,
  PRE_SETTLEMENT_NOTE,
  won,
} from '@/lib/won';
import { fmtDate, getToday, toIsoDate } from '@/lib/date';
import { downloadExcel, stampedFileName, type ExcelColumn } from '@/lib/excel';
import { useToast } from '@/components/toastContext';
import { ALL_ROWS, rowNo, slicePage } from '@/lib/paging';
import { useUrlState } from '@/hooks/useUrlState';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  DateRange,
  FilterBar,
  filterClass,
  FilterInput,
  Pagination,
  QueryState,
  Section,
  StatCards,
  stickyThClass,
  TableScroll,
  thClass,
  ReadOnlyChip,
} from '@/components/ui';
import AmountInput from '@/components/AmountInput';
import HelpLink from '@/components/HelpLink';

/**
 * 목록 순서.
 *
 * 기본은 회계 대장과 같은 계정과목 → 회계 자산코드 순이다. 언제 들어온 자산인지 훑어보려면
 * 취득일 순으로 바꿔 본다 (요청 2026-10-29). 정렬은 화면에서 한다 — 서버가 걸러 낸 전건을
 * 한 번에 주기 때문이다.
 */
type SortKey = 'account' | 'acquiredAsc' | 'acquiredDesc';

const SORT_LABEL: Record<SortKey, string> = {
  account: '계정·자산코드순',
  acquiredAsc: '취득일 오래된순',
  acquiredDesc: '취득일 최근순',
};

const byAccount = (a: Asset, b: Asset) =>
  a.accountCode.localeCompare(b.accountCode) ||
  (a.accountingCode ?? '￿').localeCompare(b.accountingCode ?? '￿') ||
  a.name.localeCompare(b.name, 'ko');

const SORTERS: Record<SortKey, (a: Asset, b: Asset) => number> = {
  account: byAccount,
  acquiredAsc: (a, b) => a.acquisitionDate.localeCompare(b.acquisitionDate) || byAccount(a, b),
  acquiredDesc: (a, b) => b.acquisitionDate.localeCompare(a.acquisitionDate) || byAccount(a, b),
};

/** 화면 입력값. select 는 전부 문자열로 다루고 요청 직전에 숫자로 바꾼다 */
interface FormState {
  name: string;
  accountingCode: string;
  accountId: string;
  usingDeptId: string;
  status: string;
  acquiredFrom: string;
  acquiredTo: string;
  costFrom: string;
  costTo: string;
  /** 거르는 조건이 아니라 보는 순서. 서버에는 보내지 않는다 */
  sort: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  accountingCode: '',
  accountId: '',
  usingDeptId: '',
  /* 폐기·매각한 자산은 기본으로 감춘다. 목록은 지금 쓰고 있는 것을 보는 자리다 */
  status: 'IN_USE',
  acquiredFrom: '',
  acquiredTo: '',
  costFrom: '',
  costTo: '',
  sort: 'account',
};

/**
 * 화면 그대로 내려받을 열.
 *
 * "Excel" 단추는 서버가 만든 고정자산목록표를 받는다 — 회계에 내는 정해진 양식이라
 * 화면 표와 열이 다르고 연번도 없다. 화면에 보이는 그대로가 필요하다는 얘기가 있어
 * (2026-09-03) 별도로 둔다. 두 가지는 쓰임이 달라 하나로 합칠 수 없다.
 */
type AssetRow = Asset & { no: number };

const SCREEN_COLUMNS: ExcelColumn<AssetRow>[] = [
  { header: 'No.', value: (a) => a.no, numeric: true, width: 6 },
  { header: '계정과목', value: (a) => a.accountName, width: 16 },
  { header: '자산코드', value: (a) => a.accountingCode, width: 12 },
  { header: '자산명', value: (a) => a.name, width: 26 },
  { header: '취득일자', value: (a) => a.acquisitionDate, width: 14 },
  /* 미정은 빈칸으로 남긴다. 0 을 넣으면 엑셀 합계가 맞아 보여 금액이 없다는 것이 가려진다 */
  { header: '취득가액', value: (a) => a.acquisitionCost, numeric: true, width: 16 },
  {
    header: '상각기초가액',
    value: (a) => depreciationBase(a.acquisitionCost, a.additionTotal),
    numeric: true,
    width: 16,
  },
  { header: '상각누계액', value: (a) => a.accumulatedDepreciation, numeric: true, width: 16 },
  { header: '장부가액', value: (a) => a.bookValue, numeric: true, width: 16 },
  { header: '사용부서', value: (a) => a.usingDeptName, width: 14 },
  { header: '상태', value: (a) => a.statusLabel, width: 10 },
];

/** 주소창에 담는 값. 조건에 쪽 정보를 더한 것 */
const URL_DEFAULTS = { ...EMPTY_FORM, page: '0', size: String(ALL_ROWS) };

const toFilter = (f: FormState): AssetFilter => ({
  name: f.name.trim() || undefined,
  accountingCode: f.accountingCode.trim() || undefined,
  accountId: f.accountId ? Number(f.accountId) : undefined,
  usingDeptId: f.usingDeptId ? Number(f.usingDeptId) : undefined,
  status: (f.status || undefined) as AssetStatus | undefined,
  acquiredFrom: f.acquiredFrom || undefined,
  acquiredTo: f.acquiredTo || undefined,
  costFrom: f.costFrom ? Number(f.costFrom) : undefined,
  costTo: f.costTo ? Number(f.costTo) : undefined,
});

export default function AssetListPage() {
  const { perms } = usePerms();
  /* 보는 것은 누구나, 고치는 것은 자산 영역을 맡은 사람과 팀장만 (2026-09-14) */
  const edit = canEdit(perms, 'asset');
  const navigate = useNavigate();
  const toast = useToast();

  const [exporting, setExporting] = useState(false);

  /* 조건은 주소창에 담는다. 자산을 열었다 뒤로 와도 보던 그대로 돌아온다 */
  const [q, setQ] = useUrlState(URL_DEFAULTS);
  const form: FormState = q;
  const page = Number(q.page) || 0;
  const size = Number(q.size) || ALL_ROWS;
  const sort: SortKey = q.sort in SORTERS ? (q.sort as SortKey) : 'account';

  const setPage = (n: number) => setQ({ page: String(n) });
  const setSize = (n: number) => setQ({ size: String(n), page: '0' });
  // 조건을 건드리면 늘 첫 페이지부터 다시 본다
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setQ({ [key]: value, page: '0' });

  /**
   * 조회 버튼 없이 입력하는 대로 결과가 바뀐다.
   * 글자마다 서버를 부르지 않도록 손이 멎은 뒤에 한 번만 보낸다.
   */
  const settled = useDebounced(form);
  const filter = useMemo(() => toFilter(settled), [settled]);

  const reset = () => setQ({ ...EMPTY_FORM, page: '0' });
  /** 조건을 하나라도 건드렸는가. 처음 그대로면 초기화를 막는다 */
  const dirty = (Object.keys(EMPTY_FORM) as (keyof FormState)[]).some(
    (k) => form[k] !== EMPTY_FORM[k],
  );

  const accounts = useAccounts();
  const departments = useDepartments();

  /*
   * 서버가 page/size 를 무시하고 걸러 낸 전건을 한 번에 준다 (백엔드 회신 2026-09-03).
   * 그래서 쪽은 화면에서 나눈다 — 장을 넘길 때마다 다시 물을 것도 없다.
   */
  const list = useQuery({
    queryKey: queryKeys.assets.list(filter),
    queryFn: () => assetsApi.list(filter),
  });
  const summary = useQuery({
    queryKey: queryKeys.assets.summary(filter),
    queryFn: () => assetsApi.summary(filter),
  });

  const all = useMemo(
    () => [...(list.data?.items ?? [])].sort(SORTERS[sort]),
    [list.data, sort],
  );
  const paged = slicePage(all, page, size);
  /** 지금 펼친 장에 보이는 것 */
  const rows = paged.items;

  /* 지금 걸러 놓은 것 전부를 화면에 보이는 열·순서 그대로 내려받는다 */
  const exportScreen = async () => {
    setExporting(true);
    try {
      const data: AssetRow[] = all.map((a, i) => ({ ...a, no: rowNo(i) }));
      await downloadExcel(data, SCREEN_COLUMNS, stampedFileName('고정자산목록', toIsoDate(getToday())));
      toast.ok(`고정자산 ${all.length.toLocaleString('ko-KR')}건을 내려받았습니다.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setExporting(false);
    }
  };

  /* 엑셀은 화면 표 그대로 여기서 만든다(exportScreen). 서버 목록표 양식은 PDF 만 쓴다 */
  const exportPdf = useMutation({
    mutationFn: () => assetsApi.exportPdf(filter),
    onSuccess: (file) => {
      saveFile(file);
      toast.ok(`${file.filename} 내려받기 시작`);
    },
    onError: toast.fail,
  });

  /** 취득가액이 비어 있어 합계에서 빠진 건 */
  const pendingCount = all.filter((a) => a.acquisitionCost == null).length;

  return (
    <div className="space-y-3">
      {/*
        등록은 이 화면에서 제일 자주 누르는 단추다. 목록 머리에 두면 검색 조건 아래까지
        내려가 있어 눈에 늦게 들어온다. 다른 화면과 같이 제목 줄 오른쪽으로 올린다.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[24px] font-semibold">고정자산 <HelpLink topic="assets" /></h1>
        {/* 조회 전용 계정(IT)에는 내보이지 않는다. 눌러도 서버가 403 으로 막는다 */}
        {edit ? (
          <button
            type="button"
            className={`${btnPrimaryClass} ml-auto`}
            onClick={() => navigate('/assets/new')}
          >
            자산 등록
          </button>
        ) : (
          <span className="ml-auto"><ReadOnlyChip /></span>
        )}
      </div>

      <StatCards
        cards={[
          {
            label: '자산 건수',
            value: summary.data ? `${summary.data.totalCount.toLocaleString('ko-KR')}건` : '-',
            hint:
              pendingCount > 0 ? (
                <span title={COST_PENDING_NOTE}>
                  취득가액 {COST_PENDING} {pendingCount.toLocaleString('ko-KR')}건 포함
                </span>
              ) : undefined,
          },
          { label: '취득가액', value: won(summary.data?.totalAcquisitionCost) },
          { label: '상각누계액', value: won(summary.data?.totalAccumulatedDepreciation) },
          { label: '장부가액', value: won(summary.data?.totalBookValue) },
        ]}
      />

      <AccountTotals
        filter={filter}
        assets={list.data?.items ?? []}
        grandTotal={summary.data}
        selectedAccountId={form.accountId}
        onSelectAccount={(id) => set('accountId', form.accountId === id ? '' : id)}
      />

      <Section
        title="고정자산 목록"
        right={
          <>
            <button
              type="button"
              className={btnClass}
              disabled={all.length === 0 || exporting}
              title={`걸러 놓은 ${all.length.toLocaleString('ko-KR')}건을 화면에 보이는 열·순서 그대로 내려받습니다.`}
              onClick={() => void exportScreen()}
            >
              {exporting ? '만드는 중…' : 'Excel'}
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={exportPdf.isPending}
              onClick={() => exportPdf.mutate()}
            >
              목록표 PDF
            </button>
          </>
        }
      >
        <FilterBar
          count={{ shown: all.length, total: all.length }}
          onReset={reset}
          resetDisabled={!dirty}
        >
          <FilterInput
            placeholder="자산명"
            value={form.name}
            onChange={(v) => set('name', v)}
          />
          <FilterInput
            placeholder="자산코드"
            width="w-32"
            value={form.accountingCode}
            onChange={(v) => set('accountingCode', v)}
          />
          <select
            className={`${filterClass} w-40`}
            value={form.accountId}
            aria-label="계정과목"
            onChange={(e) => set('accountId', e.target.value)}
          >
            <option value="">계정과목 전체</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-40`}
            value={form.usingDeptId}
            aria-label="사용부서"
            onChange={(e) => set('usingDeptId', e.target.value)}
          >
            <option value="">사용부서 전체</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-28`}
            value={form.status}
            aria-label="상태"
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">상태 전체 (폐기·매각 포함)</option>
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <DateRange
            label="취득일"
            from={form.acquiredFrom}
            to={form.acquiredTo}
            onFromChange={(v) => set('acquiredFrom', v)}
            onToChange={(v) => set('acquiredTo', v)}
          />

          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[18px] text-fg-sub">
            취득가액
            <AmountInput
              className={`${filterClass} num w-32`}
              aria-label="취득가액 이상"
              value={form.costFrom}
              onChange={(v) => set('costFrom', v)}
            />
            ~
            <AmountInput
              className={`${filterClass} num w-32`}
              aria-label="취득가액 이하"
              value={form.costTo}
              onChange={(v) => set('costTo', v)}
            />
          </span>

          <select
            className={`${filterClass} w-44`}
            value={sort}
            aria-label="정렬"
            onChange={(e) => set('sort', e.target.value)}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>

          {/* 안내 문구는 자리만 먹고 알려 주는 것이 없다. 조회 중 표시만 남긴다 */}
          {list.isFetching && <span className="shrink-0 text-[18px] text-accent">조회 중…</span>}
        </FilterBar>

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={all.length === 0}
          emptyText="조건에 맞는 자산이 없습니다."
        />

        {all.length > 0 && (
          <>
            {/* No. · 계정과목 · 자산코드까지 남긴다 — 회계 자산코드는 계정별로 매겨 계정과 함께 읽는다 */}
            <TableScroll stickyColumns={3}>
              <table className="w-max min-w-full text-[19px]">
                <thead>
                  <tr className="text-left text-fg-sub">
                    <th className={`${stickyThClass} w-14 text-right`}>No.</th>
                    <th className={stickyThClass}>계정과목</th>
                    <th className={stickyThClass} title="회계 프로그램의 자산코드 (계정별 6자리)">
                      자산코드
                    </th>
                    <th className={stickyThClass}>자산명</th>
                    <th className={stickyThClass}>
                      {/* 머리를 눌러도 취득일 순으로 바뀐다. 한 번 더 누르면 반대로 */}
                      <button
                        type="button"
                        className="font-medium hover:text-fg"
                        title="취득일 순으로 정렬"
                        onClick={() =>
                          set('sort', sort === 'acquiredAsc' ? 'acquiredDesc' : 'acquiredAsc')
                        }
                      >
                        취득일자
                        {sort === 'acquiredAsc' ? ' ▲' : sort === 'acquiredDesc' ? ' ▼' : ' ↕'}
                      </button>
                    </th>
                    <th className={`${stickyThClass} text-right`}>취득가액</th>
                    <th className={`${stickyThClass} text-right`}>상각누계액</th>
                    <th className={`${stickyThClass} text-right`}>장부가액</th>
                    <th className={stickyThClass}>사용부서</th>
                    <th className={stickyThClass}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, i) => (
                    <tr
                      key={a.id}
                      onClick={() => navigate(`/assets/${a.id}`, { state: FROM_LIST })}
                      className="cursor-pointer border-b border-line hover:bg-bg"
                    >
                      <td className="num px-3 py-2 text-fg-muted">{rowNo(i, paged.page, size)}</td>
                      <td className="px-3 py-2">{a.accountName}</td>
                      <td className="code px-3 py-2">{accountingCodeText(a.accountingCode)}</td>
                      <td className="px-3 py-2">
                        {a.name}
                        {a.excludedFromPrint && (
                          <span className="ml-1">
                            <Badge tone="muted" title="목록표 출력 제외">
                              출력제외
                            </Badge>
                          </span>
                        )}
                        {a.preSettlementBasis && (
                          <span className="ml-1">
                            <Badge
                              tone="warn"
                              title="국고보조금 무형자산. 총 취득가액 기준으로 계산하며 상계는 결산 시 회계팀이 별도 처리합니다"
                            >
                              결산 전 기준
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{fmtDate(a.acquisitionDate)}</td>
                      <td className="num px-3 py-2">
                        {a.acquisitionCost == null ? (
                          <span title={COST_PENDING_NOTE}>
                            <Badge tone="warn">{COST_PENDING}</Badge>
                          </span>
                        ) : (
                          won(a.acquisitionCost)
                        )}
                        {/* 자본적지출이 있는 자산만 상각기초가액을 덧붙인다 — 없으면 취득가액과 같다 */}
                        {a.acquisitionCost != null && a.additionTotal > 0 && (
                          <span
                            className="block text-[16px] text-fg-muted"
                            title="취득가액 + 자본적지출 증가 누계"
                          >
                            기초 {won(depreciationBase(a.acquisitionCost, a.additionTotal))}
                          </span>
                        )}
                      </td>
                      <td className="num px-3 py-2">{won(a.accumulatedDepreciation)}</td>
                      <td className="num px-3 py-2" title={a.bookValue < 0 ? PRE_SETTLEMENT_NOTE : undefined}>
                        {bookValue(a.bookValue)}
                      </td>
                      <td className="px-3 py-2">{a.usingDeptName ?? '-'}</td>
                      <td className="px-3 py-2">{a.statusLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>

            <Pagination
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              size={size}
              onChange={setPage}
              onSizeChange={setSize}
            />
          </>
        )}
      </Section>
    </div>
  );
}

/* ---------- 계정별 합계 ---------- */

/**
 * 계정과목마다 건수와 금액 합계 (요청 2026-10-29).
 *
 * 금액은 화면에서 더하지 않는다 — 계정마다 요약(/asset/summary)을 지금 조건에 계정만 바꿔
 * 다시 묻는다. 그래야 위 요약 카드와 같은 규칙(취득가액 미정 제외 등)으로 맞아떨어진다.
 * 묻는 계정은 지금 목록에 나온 계정뿐이라 많아야 계정과목 수만큼이다.
 *
 * 줄을 누르면 그 계정만 목록에 남기고, 한 번 더 누르면 풀린다.
 */
function AccountTotals({
  filter,
  assets,
  grandTotal,
  selectedAccountId,
  onSelectAccount,
}: {
  filter: AssetFilter;
  /** 지금 조건으로 받은 목록. 어느 계정이 나왔는지와 미정 건수만 본다 */
  assets: Asset[];
  grandTotal: AssetSummary | undefined;
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
}) {
  const accounts = useAccounts();

  /** 목록에 나온 계정 — 계정코드 순 */
  const shown = useMemo(() => {
    const codes = new Set(assets.map((a) => a.accountCode));
    return (accounts.data ?? [])
      .filter((acc) => codes.has(acc.code))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts.data, assets]);

  const sums = useQueries({
    queries: shown.map((acc) => {
      const f: AssetFilter = { ...filter, accountId: acc.id };
      return {
        queryKey: queryKeys.assets.summary(f),
        queryFn: () => assetsApi.summary(f),
      };
    }),
  });

  if (shown.length === 0) return null;

  const pendingOf = (code: string) =>
    assets.filter((a) => a.accountCode === code && a.acquisitionCost == null).length;

  return (
    <Section
      title="계정별 합계"
      right={
        <span className="text-[18px] text-fg-muted">
          지금 조건 기준 · 줄을 누르면 그 계정만 봅니다
        </span>
      }
    >
      <table className="w-max min-w-full text-[19px]">
        <thead>
          <tr className="border-b border-line bg-bg text-left text-fg-sub">
            <th className={thClass}>계정과목</th>
            <th className={`${thClass} text-right`}>건수</th>
            <th className={`${thClass} text-right`}>취득가액</th>
            <th className={`${thClass} text-right`}>상각누계액</th>
            <th className={`${thClass} text-right`}>장부가액</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((acc, i) => {
            const s = sums[i]?.data;
            const pending = pendingOf(acc.code);
            const active = selectedAccountId === String(acc.id);
            return (
              <tr
                key={acc.id}
                onClick={() => onSelectAccount(String(acc.id))}
                aria-selected={active}
                className={`cursor-pointer border-b border-line hover:bg-bg ${active ? 'bg-accent/5' : ''}`}
              >
                <td className="px-3 py-2">
                  {acc.code} {acc.name}
                </td>
                <td className="num px-3 py-2">
                  {s ? `${s.totalCount.toLocaleString('ko-KR')}건` : '-'}
                  {pending > 0 && (
                    <span className="block text-[16px] text-warn" title={COST_PENDING_NOTE}>
                      {COST_PENDING} {pending}건
                    </span>
                  )}
                </td>
                <td className="num px-3 py-2">{won(s?.totalAcquisitionCost)}</td>
                <td className="num px-3 py-2">{won(s?.totalAccumulatedDepreciation)}</td>
                <td className="num px-3 py-2">{won(s?.totalBookValue)}</td>
              </tr>
            );
          })}
        </tbody>
        {grandTotal && (
          <tfoot>
            <tr className="bg-bg font-semibold">
              <td className="px-3 py-2">합계</td>
              <td className="num px-3 py-2">{grandTotal.totalCount.toLocaleString('ko-KR')}건</td>
              <td className="num px-3 py-2">{won(grandTotal.totalAcquisitionCost)}</td>
              <td className="num px-3 py-2">{won(grandTotal.totalAccumulatedDepreciation)}</td>
              <td className="num px-3 py-2">{won(grandTotal.totalBookValue)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </Section>
  );
}
