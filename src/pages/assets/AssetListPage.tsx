import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  assetsApi,
  ASSET_STATUS_LABEL,
  type Asset,
  type AssetFilter,
  type AssetStatus,
} from '@/api/assets';
import { saveFile } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { useAccounts, useDepartments, useLocations } from '@/hooks/useMasters';
import { useDebounced } from '@/hooks/useDebounced';
import { appConfig } from '@/config/appConfig';
import { codeText, isPrintable } from '@/domain/assetCode';
import { useStickerSelection } from '@/hooks/useStickerSelection';
import { bookValue, depreciationBase, PRE_SETTLEMENT_NOTE, won } from '@/lib/won';
import { fmtDate, getToday, toIsoDate } from '@/lib/date';
import { downloadExcel, stampedFileName, type ExcelColumn } from '@/lib/excel';
import StickerPreviewModal from '@/components/StickerPreviewModal';
import { useToast } from '@/components/toastContext';
import { ALL_ROWS, rowNo, slicePage } from '@/lib/paging';
import { useUrlState } from '@/hooks/useUrlState';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  filterClass,
  Pagination,
  QueryState,
  Section,
  StatCards,
  stickyThClass,
  TableScroll,
} from '@/components/ui';

/** 화면 입력값. select 는 전부 문자열로 다루고 요청 직전에 숫자로 바꾼다 */
interface FormState {
  name: string;
  assetCode: string;
  accountId: string;
  usingDeptId: string;
  locationId: string;
  status: string;
  acquiredFrom: string;
  acquiredTo: string;
  costFrom: string;
  costTo: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  assetCode: '',
  accountId: '',
  usingDeptId: '',
  locationId: '',
  /* 폐기·매각한 자산은 기본으로 감춘다. 목록은 지금 쓰고 있는 것을 보는 자리다 */
  status: 'IN_USE',
  acquiredFrom: '',
  acquiredTo: '',
  costFrom: '',
  costTo: '',
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
  { header: '자산코드', value: (a) => a.assetCode, width: 18 },
  { header: '계정과목', value: (a) => a.accountName, width: 16 },
  { header: '자산명', value: (a) => a.name, width: 26 },
  { header: '취득일자', value: (a) => a.acquisitionDate, width: 14 },
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
  { header: '사용위치', value: (a) => a.locationName, width: 14 },
  { header: '상태', value: (a) => a.statusLabel, width: 10 },
];

/** 주소창에 담는 값. 조건에 쪽 정보를 더한 것 */
const URL_DEFAULTS = { ...EMPTY_FORM, page: '0', size: String(ALL_ROWS) };

const toFilter = (f: FormState): AssetFilter => ({
  name: f.name.trim() || undefined,
  assetCode: f.assetCode.trim() || undefined,
  accountId: f.accountId ? Number(f.accountId) : undefined,
  usingDeptId: f.usingDeptId ? Number(f.usingDeptId) : undefined,
  locationId: f.locationId ? Number(f.locationId) : undefined,
  status: (f.status || undefined) as AssetStatus | undefined,
  acquiredFrom: f.acquiredFrom || undefined,
  acquiredTo: f.acquiredTo || undefined,
  costFrom: f.costFrom ? Number(f.costFrom) : undefined,
  costTo: f.costTo ? Number(f.costTo) : undefined,
});

export default function AssetListPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* 조건은 주소창에 담는다. 자산을 열었다 뒤로 와도 보던 그대로 돌아온다 */
  const [q, setQ] = useUrlState(URL_DEFAULTS);
  const form: FormState = q;
  const page = Number(q.page) || 0;
  const size = Number(q.size) || ALL_ROWS;

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

  const reset = () => {
    setQ({ ...EMPTY_FORM, page: '0' });
    sel.clear();
  };

  const accounts = useAccounts();
  const departments = useDepartments();
  const locations = useLocations();

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

  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  const paged = slicePage(all, page, size);
  /** 지금 펼친 장에 보이는 것 */
  const rows = paged.items;

  /**
   * 스티커 선택.
   *
   * 기계장치·시설장치는 고정자산 1건이 곧 실물 1대라 실물자산으로 복제하지 않는다.
   * 이런 자산의 스티커는 이 화면에서 /asset/sticker 로 뽑는다 — 실물자산 화면과
   * 역할이 갈리는 영구 구조다. (여러 개를 한 건으로 산 비품만 실물자산으로 쪼개
   * /physical-asset/sticker 를 쓴다)
   *
   * 사용위치가 입력되면 서버가 자산코드를 채번하고, 그 시점부터 해당 행의
   * 체크박스가 나타나 스티커를 뽑을 수 있다. 코드가 없는 동안만 열을 감춘다.
   */
  const sel = useStickerSelection(rows);

  /** 체크박스가 잠긴 이유. null 이면 선택 가능 */
  const rowBlockedReason = (a: Asset): string | null => {
    // 소프트웨어·특허권은 위치를 넣어도 붙일 실물이 없다
    if (appConfig.asset.intangibleAccountCodes.includes(a.accountCode))
      return `${a.accountName}은 실물이 없는 자산이라 스티커 대상이 아닙니다.`;
    if (!a.assetCode) return '자산코드 미부여 — 사용위치를 지정하면 저장 시 채번됩니다.';
    if (a.excludedFromPrint) return '출력 제외로 지정된 자산입니다.';
    return null;
  };

  /* 지금 걸러 놓은 것 전부를 화면에 보이는 열 그대로 내려받는다 */
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

  const download = useMutation({
    mutationFn: ({
      kind,
      startPosition = 1,
    }: {
      /* 엑셀은 화면 표 그대로 여기서 만든다(exportScreen). 서버 목록표 양식은 PDF 만 쓴다 */
      kind: 'pdf' | 'sticker';
      startPosition?: number;
    }) => {
      if (kind === 'pdf') return assetsApi.exportPdf(filter);
      return assetsApi.sticker({ ids: sel.ids(), startPosition });
    },
    onSuccess: (file) => {
      saveFile(file);
      toast.ok(`${file.filename} 내려받기 시작`);
      setPreviewing(false);
    },
    onError: toast.fail,
  });

  return (
    <div className="space-y-3">
      {/*
        등록은 이 화면에서 제일 자주 누르는 단추다. 목록 머리에 두면 검색 조건 아래까지
        내려가 있어 눈에 늦게 들어온다. 다른 화면과 같이 제목 줄 오른쪽으로 올린다.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[24px] font-semibold">고정자산</h1>
        <button
          type="button"
          className={`${btnPrimaryClass} ml-auto`}
          onClick={() => navigate('/assets/new')}
        >
          자산 등록
        </button>
      </div>

      <StatCards
        cards={[
          {
            label: '자산 건수',
            value: summary.data ? `${summary.data.totalCount.toLocaleString('ko-KR')}건` : '-',
          },
          { label: '취득가액', value: won(summary.data?.totalAcquisitionCost) },
          { label: '상각누계액', value: won(summary.data?.totalAccumulatedDepreciation) },
          { label: '장부가액', value: won(summary.data?.totalBookValue) },
        ]}
      />

      {/*
        조건을 한 줄로 눕힌다. 라벨을 칸 위에 얹어 격자로 쌓으니 화면 절반이 조건칸이라
        정작 목록이 아래로 밀렸다(2026-09-03). 무엇을 고르는 칸인지는 첫 항목 이름과
        placeholder 로 알린다. 날짜·금액처럼 두 칸이 한 쌍인 것만 앞에 짧은 말을 붙인다.
      */}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2">
          <input
            className={`${filterClass} w-40`}
            placeholder="자산명"
            aria-label="자산명"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <input
            className={`${filterClass} w-36`}
            placeholder="자산코드"
            aria-label="자산코드"
            value={form.assetCode}
            onChange={(e) => set('assetCode', e.target.value)}
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
            className={`${filterClass} w-36`}
            value={form.locationId}
            aria-label="사용위치"
            onChange={(e) => set('locationId', e.target.value)}
          >
            <option value="">사용위치 전체</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.name}
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

          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[18px] text-fg-sub">
            취득일
            <input
              type="date"
              className={`${filterClass} w-36`}
              aria-label="취득일 시작"
              value={form.acquiredFrom}
              onChange={(e) => set('acquiredFrom', e.target.value)}
            />
            ~
            <input
              type="date"
              className={`${filterClass} w-36`}
              aria-label="취득일 종료"
              value={form.acquiredTo}
              onChange={(e) => set('acquiredTo', e.target.value)}
            />
          </span>

          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[18px] text-fg-sub">
            취득가액
            <input
              className={`${filterClass} num w-32`}
              inputMode="numeric"
              aria-label="취득가액 이상"
              value={form.costFrom}
              onChange={(e) => set('costFrom', e.target.value.replace(/[^\d]/g, ''))}
            />
            ~
            <input
              className={`${filterClass} num w-32`}
              inputMode="numeric"
              aria-label="취득가액 이하"
              value={form.costTo}
              onChange={(e) => set('costTo', e.target.value.replace(/[^\d]/g, ''))}
            />
          </span>

        {/* 안내 문구는 자리만 먹고 알려 주는 것이 없다. 조회 중 표시만 남긴다 */}
        {list.isFetching && <span className="shrink-0 text-[18px] text-accent">조회 중…</span>}
        <button type="button" className={`${btnClass} ml-auto`} onClick={reset}>
          초기화
        </button>
      </div>

      <Section
        title={
          <>
            고정자산 목록{' '}
            {sel.showSelectColumn && (
              <span className="font-normal text-fg-muted">
                선택 {sel.selected.size}건 · 이 페이지 스티커 가능 {sel.printableRows.length}건
              </span>
            )}
          </>
        }
        right={
          <>
            <button
              type="button"
              className={btnClass}
              disabled={all.length === 0 || exporting}
              title={`걸러 놓은 ${all.length.toLocaleString('ko-KR')}건을 화면에 보이는 열 그대로 내려받습니다.`}
              onClick={() => void exportScreen()}
            >
              {exporting ? '만드는 중…' : 'Excel'}
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={download.isPending}
              onClick={() => download.mutate({ kind: 'pdf' })}
            >
              목록표 PDF
            </button>
            {sel.showSelectColumn && (
              <button
                type="button"
                className={btnClass}
                title={
                  sel.selected.size === 0
                    ? '스티커를 출력할 행을 먼저 선택하세요.'
                    : `선택한 ${sel.selected.size}건 스티커 출력`
                }
                disabled={download.isPending || sel.selected.size === 0}
                onClick={() => setPreviewing(true)}
              >
                스티커 출력
              </button>
            )}
          </>
        }
      >
        {/* 선택 열을 숨긴 이유를 알린다 */}
        {all.length > 0 && !sel.showSelectColumn && (
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[17px] text-warn">
            이 페이지에는 스티커를 출력할 수 있는 자산이 없어 선택 열을 숨겼습니다. 자산코드가
            없거나(사용위치 미확정), 출력 제외로 지정됐거나, 실물이 없는 무형자산은 라벨 대상이
            아닙니다. 상세에서 사용위치를 지정하면 자산코드가 채번되어 선택할 수 있게 됩니다.
          </p>
        )}

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={all.length === 0}
          emptyText="조건에 맞는 자산이 없습니다."
        />

        {all.length > 0 && (
          <>
            <TableScroll>
              <table className="w-max text-[19px]">
                <thead>
                  <tr className="text-left text-fg-sub">
                    {sel.showSelectColumn && (
                      /* 무엇을 위한 선택인지 열 제목으로 알린다 */
                      <th className={`${stickyThClass} w-24`}>
                        <label className="flex w-fit items-center gap-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={sel.allOnPageSelected}
                            onChange={sel.toggleAll}
                            title={`출력 가능한 ${sel.printableRows.length}건 전체 선택`}
                            aria-label="스티커 출력 대상 전체 선택"
                          />
                          스티커
                        </label>
                      </th>
                    )}
                    <th className={`${stickyThClass} w-14 text-right`}>No.</th>
                    <th className={stickyThClass}>자산코드</th>
                    <th className={stickyThClass}>계정과목</th>
                    <th className={stickyThClass}>자산명</th>
                    <th className={stickyThClass}>취득일자</th>
                    <th className={`${stickyThClass} text-right`}>취득가액</th>
                    <th className={`${stickyThClass} text-right`}>상각누계액</th>
                    <th className={`${stickyThClass} text-right`}>장부가액</th>
                    <th className={stickyThClass}>사용부서</th>
                    <th className={stickyThClass}>사용위치</th>
                    <th className={stickyThClass}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, i) => (
                    <tr
                      key={a.id}
                      onClick={() => navigate(`/assets/${a.id}`)}
                      className="cursor-pointer border-b border-line hover:bg-bg"
                    >
                      {sel.showSelectColumn && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={sel.isSelected(a.id)}
                            disabled={!isPrintable(a)}
                            onChange={() => sel.toggle(a)}
                            title={rowBlockedReason(a) ?? `${a.name} 선택`}
                            aria-label={`${a.name} 선택`}
                          />
                        </td>
                      )}
                      <td className="num px-3 py-2 text-fg-muted">{rowNo(i, paged.page, size)}</td>
                      <td className="code px-3 py-2">
                        {a.assetCode ? (
                          codeText(a.assetCode)
                        ) : (
                          <Badge tone="warn">미부여</Badge>
                        )}
                        {a.sequenceMissing && (
                          <span className="ml-1">
                            <Badge tone="muted" title="기존 자료의 7단 코드">
                              7단
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{a.accountName}</td>
                      <td className="px-3 py-2">
                        {a.name}
                        {a.excludedFromPrint && (
                          <span className="ml-1">
                            <Badge tone="muted" title="목록표·스티커 출력 제외">
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
                        {won(a.acquisitionCost)}
                        {/* 자본적지출이 있는 자산만 상각기초가액을 덧붙인다 — 없으면 취득가액과 같다 */}
                        {a.additionTotal > 0 && (
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
                      <td className="px-3 py-2">{a.locationName ?? '-'}</td>
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

      {previewing && (
        <StickerPreviewModal
          source="asset"
          items={sel.items()}
          isDownloading={download.isPending}
          onClose={() => setPreviewing(false)}
          onDownload={(startPosition) => download.mutate({ kind: 'sticker', startPosition })}
        />
      )}
    </div>
  );
}
