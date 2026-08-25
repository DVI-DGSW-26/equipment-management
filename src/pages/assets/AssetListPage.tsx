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
import { appConfig } from '@/config/appConfig';
import { codeText, isPrintable } from '@/domain/assetCode';
import { useStickerSelection } from '@/hooks/useStickerSelection';
import { bookValue, PRE_SETTLEMENT_NOTE, won } from '@/lib/won';
import { fmtDate } from '@/lib/date';
import StickerPreviewModal from '@/components/StickerPreviewModal';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  inputClass,
  Pagination,
  QueryState,
  Section,
  StatCards,
  thClass,
} from '@/components/ui';

const EMPTY: AssetFilter = {};

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
  status: '',
  acquiredFrom: '',
  acquiredTo: '',
  costFrom: '',
  costTo: '',
};

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

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [filter, setFilter] = useState<AssetFilter>(EMPTY);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [previewing, setPreviewing] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const apply = () => {
    setFilter(toFilter(form));
    setPage(0);
    sel.clear();
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setFilter(EMPTY);
    setPage(0);
    sel.clear();
  };

  const accounts = useAccounts();
  const departments = useDepartments();
  const locations = useLocations();

  const listQuery = useMemo(() => ({ ...filter, page, size }), [filter, page, size]);
  const list = useQuery({
    queryKey: queryKeys.assets.list(listQuery),
    queryFn: () => assetsApi.list(listQuery),
  });
  const summary = useQuery({
    queryKey: queryKeys.assets.summary(filter),
    queryFn: () => assetsApi.summary(filter),
  });

  const rows = list.data?.items ?? [];

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

  const download = useMutation({
    mutationFn: ({
      kind,
      startPosition = 1,
    }: {
      kind: 'pdf' | 'excel' | 'sticker';
      startPosition?: number;
    }) => {
      if (kind === 'pdf') return assetsApi.exportPdf(filter);
      if (kind === 'excel') return assetsApi.exportExcel(filter);
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

      <Section title="검색 조건">
        <div className="grid grid-cols-5 gap-2 px-3 py-3">
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">자산명</span>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder="부분일치"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">자산코드</span>
            <input
              className={inputClass}
              value={form.assetCode}
              onChange={(e) => set('assetCode', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">계정과목</span>
            <select
              className={inputClass}
              value={form.accountId}
              onChange={(e) => set('accountId', e.target.value)}
            >
              <option value="">전체</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">사용부서</span>
            <select
              className={inputClass}
              value={form.usingDeptId}
              onChange={(e) => set('usingDeptId', e.target.value)}
            >
              <option value="">전체</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">사용위치</span>
            <select
              className={inputClass}
              value={form.locationId}
              onChange={(e) => set('locationId', e.target.value)}
            >
              <option value="">전체</option>
              {(locations.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">상태</span>
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              <option value="">전체</option>
              {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ASSET_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">취득일 (부터)</span>
            <input
              type="date"
              className={inputClass}
              value={form.acquiredFrom}
              onChange={(e) => set('acquiredFrom', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">취득일 (까지)</span>
            <input
              type="date"
              className={inputClass}
              value={form.acquiredTo}
              onChange={(e) => set('acquiredTo', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">취득가액 (이상)</span>
            <input
              className={`${inputClass} num`}
              inputMode="numeric"
              value={form.costFrom}
              onChange={(e) => set('costFrom', e.target.value.replace(/[^\d]/g, ''))}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[18px] text-fg-sub">취득가액 (이하)</span>
            <input
              className={`${inputClass} num`}
              inputMode="numeric"
              value={form.costTo}
              onChange={(e) => set('costTo', e.target.value.replace(/[^\d]/g, ''))}
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
          <button type="button" className={btnClass} onClick={reset}>
            초기화
          </button>
          <button type="button" className={btnPrimaryClass} onClick={apply}>
            조회
          </button>
        </div>
      </Section>

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
              disabled={download.isPending}
              onClick={() => download.mutate({ kind: 'excel' })}
            >
              Excel
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
            <button
              type="button"
              className={btnPrimaryClass}
              onClick={() => navigate('/assets/new')}
            >
              자산 등록
            </button>
          </>
        }
      >
        {/* 선택 열을 숨긴 이유를 알린다 */}
        {rows.length > 0 && !sel.showSelectColumn && (
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[17px] text-warn">
            이 페이지에는 스티커를 출력할 수 있는 자산이 없어 선택 열을 숨겼습니다. 자산코드가
            없거나(사용위치 미확정), 출력 제외로 지정됐거나, 실물이 없는 무형자산은 라벨 대상이
            아닙니다. 상세에서 사용위치를 지정하면 자산코드가 채번되어 선택할 수 있게 됩니다.
          </p>
        )}

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText="조건에 맞는 자산이 없습니다."
        />

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[19px]">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-fg-sub">
                    {sel.showSelectColumn && (
                      <th className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={sel.allOnPageSelected}
                          onChange={sel.toggleAll}
                          title={`출력 가능한 ${sel.printableRows.length}건 전체 선택`}
                          aria-label="전체 선택"
                        />
                      </th>
                    )}
                    <th className={thClass}>자산코드</th>
                    <th className={thClass}>계정과목</th>
                    <th className={thClass}>자산명</th>
                    <th className={thClass}>취득일자</th>
                    <th className={`${thClass} text-right`}>취득가액</th>
                    <th className={`${thClass} text-right`}>상각누계액</th>
                    <th className={`${thClass} text-right`}>장부가액</th>
                    <th className={thClass}>사용부서</th>
                    <th className={thClass}>사용위치</th>
                    <th className={thClass}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => navigate(`/assets/${a.id}`)}
                      className="cursor-pointer border-b border-line hover:bg-bg"
                    >
                      {sel.showSelectColumn && (
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
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
                      <td className="num px-3 py-2">{won(a.acquisitionCost)}</td>
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
            </div>

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
