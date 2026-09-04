import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  physicalAssetsApi,
  type PhysicalAsset,
  type SavePhysicalAssetPayload,
} from '@/api/physicalAssets';
import { assetsApi, ASSET_STATUS_LABEL, type Asset, type AssetStatus } from '@/api/assets';
import { queryKeys } from '@/api/queryKeys';
import { useCategories, useDepartments, useItemTypes, useItems, useLocations } from '@/hooks/useMasters';
import { saveFile } from '@/api/client';
import { codeText, isSuppliesItemEnabled } from '@/domain/assetCode';
import { useStickerSelection } from '@/hooks/useStickerSelection';
import { fmtDate, getToday, toIsoDate } from '@/lib/date';
import { downloadExcel, stampedFileName, type ExcelColumn } from '@/lib/excel';
import { ALL_ROWS, rowNo, slicePage } from '@/lib/paging';
import { searchIn } from '@/lib/search';
import { won } from '@/lib/won';
import Modal from '@/components/Modal';
import StickerPreviewModal from '@/components/StickerPreviewModal';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Field,
  filterClass,
  FilterCount,
  inputClass,
  Pagination,
  QueryState,
  SearchBox,
  Section,
  stickyThClass,
  TableScroll,
} from '@/components/ui';

/**
 * 목록을 한 번에 다 받아 온다.
 *
 * 서버가 걸러 주는 것은 품명·자산코드·상태·자산등록 넷뿐이다. 표에 함께 보이는
 * 자산구분·위치·부서·제조업체까지 페이지를 나눠 받은 채로 거르면 지금 펼친 장
 * 안에서만 걸러져, 뒷장에 있는 비품을 "없다" 고 보여 준다.
 * 전부 받아 화면에서 거르고 쪽도 화면에서 나눈다. 이 수를 넘으면 결과가 전체가
 * 아니라고 알린다.
 */
const LOAD_LIMIT = 1000;

/**
 * 스티커를 찍을 수 있는지로 거른다.
 * 못 찍는 이유(코드 미부여·출력 제외)를 골라 그 자리에서 손볼 수 있게 한다 —
 * 지금까지는 "이 페이지에는 찍을 게 없습니다" 라는 안내만 있어 어디 있는지 찾을 수 없었다.
 */
type StickerFilter = '' | 'printable' | 'nocode' | 'excluded';

const matchesSticker = (r: PhysicalAsset, f: StickerFilter): boolean => {
  if (f === '') return true;
  if (f === 'nocode') return !r.assetCode;
  if (f === 'excluded') return r.excludedFromPrint;
  return !!r.assetCode && !r.excludedFromPrint;
};

const EMPTY = {
  keyword: '',
  category: '',
  location: '',
  dept: '',
  maker: '',
  status: '' as AssetStatus | '',
  registered: '' as '' | 'true' | 'false',
  sticker: '' as StickerFilter,
  rentalOnly: false,
};

type FormState = typeof EMPTY;

/** 화면 표와 같은 차례로 내려받는다 */
type PhysicalRow = PhysicalAsset & { no: number };

const SCREEN_COLUMNS: ExcelColumn<PhysicalRow>[] = [
  { header: 'No.', value: (r) => r.no, numeric: true, width: 6 },
  { header: '자산등록', value: (r) => (r.registered ? 'O' : 'X'), width: 10 },
  { header: '자산코드', value: (r) => r.assetCode, width: 18 },
  { header: '품명', value: (r) => r.name, width: 26 },
  { header: '자산구분', value: (r) => r.categoryName, width: 14 },
  { header: '위치', value: (r) => r.locationName, width: 14 },
  { header: '부서', value: (r) => r.deptName, width: 14 },
  { header: '구입일', value: (r) => r.acquisitionDate, width: 14 },
  { header: '모델명', value: (r) => r.modelName, width: 20 },
  { header: '제조업체', value: (r) => r.maker, width: 16 },
  { header: '구입금액', value: (r) => r.purchasePrice, numeric: true, width: 16 },
  { header: '상태', value: (r) => r.statusLabel, width: 10 },
  { header: '렌탈', value: (r) => (r.rental ? 'O' : ''), width: 8 },
  { header: '비고', value: (r) => r.remark, width: 24 },
];

/**
 * 목록에서 뽑은 값으로 만드는 고르기 칸.
 * 라벨을 칸 위에 얹지 않고 첫 항목 이름으로 알린다 — 한 줄에 늘어놓아야 해서
 * 라벨 줄이 붙으면 높이가 두 배가 된다.
 */
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
      className={`${filterClass} w-40`}
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

export default function PhysicalAssetListPage() {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(ALL_ROWS);
  const [editing, setEditing] = useState<PhysicalAsset | 'new' | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** 조건을 건드리면 늘 첫 장부터 다시 본다 */
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setPage(0);
  };

  const query = useMemo(() => ({ page: 0, size: LOAD_LIMIT }), []);
  const list = useQuery({
    queryKey: queryKeys.physicalAssets.list(query),
    queryFn: () => physicalAssetsApi.list(query),
  });

  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  /** 서버에 더 있는데 못 받아 왔다 */
  const truncated = (list.data?.total ?? 0) > all.length;

  /** 선택지는 실제로 목록에 있는 값에서 뽑는다 — 고르면 반드시 결과가 있다 */
  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko'));
    return {
      categories: uniq(all.map((r) => r.categoryName)),
      locations: uniq(all.map((r) => r.locationName)),
      depts: uniq(all.map((r) => r.deptName)),
      makers: uniq(all.map((r) => r.maker)),
    };
  }, [all]);

  const filtered = useMemo(() => {
    const hit = searchIn(form.keyword);
    return all.filter(
      (r) =>
        hit(r.name, r.assetCode, r.modelName, r.spec, r.maker, r.supplier, r.remark) &&
        (form.category === '' || r.categoryName === form.category) &&
        (form.location === '' || r.locationName === form.location) &&
        (form.dept === '' || r.deptName === form.dept) &&
        (form.maker === '' || r.maker === form.maker) &&
        (form.status === '' || r.status === form.status) &&
        (form.registered === '' || r.registered === (form.registered === 'true')) &&
        (!form.rentalOnly || r.rental) &&
        matchesSticker(r, form.sticker),
    );
  }, [all, form]);

  /* 쪽 나누기도 화면에서 한다 */
  const paged = slicePage(filtered, page, size);
  const rows = paged.items;
  const sel = useStickerSelection(rows);

  const dirty = (Object.keys(EMPTY) as (keyof FormState)[]).some((k) => form[k] !== EMPTY[k]);
  const reset = () => {
    setForm(EMPTY);
    setPage(0);
    sel.clear();
  };

  /** 체크박스가 잠긴 이유. null 이면 선택 가능 */
  const rowBlockedReason = (r: PhysicalAsset): string | null =>
    !r.assetCode
      ? '자산코드 미부여 — 위치·부서를 지정하면 저장 시 채번됩니다.'
      : r.excludedFromPrint
        ? '출력 제외로 지정된 자산입니다.'
        : null;

  /* 지금 걸러 놓은 것 전부를 화면에 보이는 열 그대로 내려받는다 */
  const exportScreen = async () => {
    setExporting(true);
    try {
      const data: PhysicalRow[] = filtered.map((r, i) => ({ ...r, no: rowNo(i) }));
      await downloadExcel(data, SCREEN_COLUMNS, stampedFileName('실물자산목록', toIsoDate(getToday())));
      toast.ok(`실물자산 ${filtered.length.toLocaleString('ko-KR')}건을 내려받았습니다.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setExporting(false);
    }
  };

  const sticker = useMutation({
    mutationFn: (startPosition: number) =>
      physicalAssetsApi.sticker({ ids: sel.ids(), startPosition }),
    onSuccess: (file) => {
      saveFile(file);
      toast.ok(`${file.filename} 내려받기 시작`);
      setPreviewing(false);
    },
    onError: toast.fail,
  });

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">
        실물자산 <span className="text-[19px] font-normal text-fg-sub">비품관리대장</span>
      </h1>

      {/*
        조건을 한 줄로 눕힌다. 격자로 쌓으면 화면 절반이 조건칸이라 목록이 밀린다.
        "조회 조건" 제목줄도 걷어냈다 — 무엇을 하는 줄인지는 칸만 봐도 안다.
      */}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2">
          <SearchBox
            value={form.keyword}
            onChange={(v) => set('keyword', v)}
            placeholder="품명·자산코드·모델명·규격·제조업체"
            width="w-72"
          />
          <Pick
            label="자산구분"
            value={form.category}
            onChange={(v) => set('category', v)}
            options={options.categories}
          />
          <Pick
            label="위치"
            value={form.location}
            onChange={(v) => set('location', v)}
            options={options.locations}
          />
          <Pick
            label="부서"
            value={form.dept}
            onChange={(v) => set('dept', v)}
            options={options.depts}
          />
          <Pick
            label="제조업체"
            value={form.maker}
            onChange={(v) => set('maker', v)}
            options={options.makers}
          />
          <select
            className={`${filterClass} w-36`}
            value={form.registered}
            aria-label="자산등록"
            onChange={(e) => set('registered', e.target.value as FormState['registered'])}
          >
            <option value="">자산등록 전체</option>
            <option value="true">자산등록 O</option>
            <option value="false">소액 비품</option>
          </select>
          <select
            className={`${filterClass} w-28`}
            value={form.status}
            aria-label="상태"
            onChange={(e) => set('status', e.target.value as AssetStatus | '')}
          >
            <option value="">상태 전체</option>
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-40`}
            value={form.sticker}
            aria-label="스티커"
            onChange={(e) => set('sticker', e.target.value as StickerFilter)}
          >
            <option value="">스티커 전체</option>
            <option value="printable">출력 가능</option>
            <option value="nocode">자산코드 미부여</option>
            <option value="excluded">출력 제외</option>
          </select>
          <label className="flex items-center gap-2 text-[19px]">
            <input
              type="checkbox"
              checked={form.rentalOnly}
              onChange={(e) => set('rentalOnly', e.target.checked)}
            />
            렌탈만
          </label>
          <FilterCount shown={filtered.length} total={all.length} />
        <button type="button" className={`${btnClass} ml-auto`} disabled={!dirty} onClick={reset}>
          초기화
        </button>
      </div>

      <Section
        title={
          <>
            실물자산 목록{' '}
            <span className="font-normal text-fg-muted">
              선택 {sel.selected.size}건
              {rows.length > 0 && ` · 이 페이지 스티커 가능 ${sel.printableRows.length}건`}
            </span>
          </>
        }
        right={
          <>
            <button
              type="button"
              className={btnClass}
              disabled={filtered.length === 0 || exporting}
              title={`화면에 보이는 그대로 ${filtered.length.toLocaleString('ko-KR')}건을 내려받습니다.`}
              onClick={() => void exportScreen()}
            >
              {exporting ? '만드는 중…' : 'Excel'}
            </button>
            <button
              type="button"
              className={btnClass}
              title={
                sel.selected.size === 0
                  ? '스티커를 출력할 행을 먼저 선택하세요.'
                  : `선택한 ${sel.selected.size}건 스티커 출력`
              }
              disabled={sticker.isPending || sel.selected.size === 0}
              onClick={() => setPreviewing(true)}
            >
              스티커 출력
            </button>
            <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
              실물자산 등록
            </button>
          </>
        }
      >
        {truncated && (
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[18px] text-warn">
            실물자산이 {(list.data?.total ?? 0).toLocaleString('ko-KR')}건이라 앞의{' '}
            {all.length.toLocaleString('ko-KR')}건만 받아 왔습니다. 아래 결과는 그 안에서만 거른
            것입니다 — 서버 필터 추가가 필요합니다.
          </p>
        )}

        {/* 체크박스가 전부 잠겨 보이는 이유를 미리 알려준다 */}
        {rows.length > 0 && !sel.showSelectColumn && (
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[17px] text-warn">
            이 페이지에는 스티커를 출력할 수 있는 실물자산이 없습니다. 자산코드가 없거나 출력
            제외로 지정된 자산은 선택할 수 없습니다. 위 “스티커” 조건으로 그 대상만 모아 볼 수
            있습니다.
          </p>
        )}

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText={dirty ? '조건에 맞는 실물자산이 없습니다.' : '등록된 실물자산이 없습니다.'}
        />
        {rows.length > 0 && (
          <>
            <TableScroll>
              <table className="w-max min-w-full text-[19px]">
                <thead>
                  <tr className="text-left whitespace-nowrap text-fg-sub">
                    {/* 무엇을 위한 선택인지 열 제목으로 알린다 */}
                    <th className={`${stickyThClass} w-24`}>
                      <label className="flex w-fit items-center gap-2 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={sel.allOnPageSelected}
                          disabled={!sel.showSelectColumn}
                          onChange={sel.toggleAll}
                          title={
                            sel.showSelectColumn
                              ? `출력 가능한 ${sel.printableRows.length}건 전체 선택`
                              : '이 페이지에는 스티커 출력 가능한 자산이 없습니다.'
                          }
                          aria-label="스티커 출력 대상 전체 선택"
                        />
                        스티커
                      </label>
                    </th>
                    <th className={`${stickyThClass} num w-14`}>No.</th>
                    <th className={stickyThClass}>자산등록</th>
                    <th className={stickyThClass}>자산코드</th>
                    <th className={stickyThClass}>품명</th>
                    <th className={stickyThClass}>자산구분</th>
                    <th className={stickyThClass}>위치</th>
                    <th className={stickyThClass}>부서</th>
                    <th className={stickyThClass}>구입일</th>
                    <th className={stickyThClass}>모델명</th>
                    <th className={stickyThClass}>제조업체</th>
                    <th className={`${stickyThClass} num`}>구입금액</th>
                    <th className={stickyThClass}>상태</th>
                    {/*
                      남는 폭을 이 마지막 칸이 다 가져간다. 그러지 않으면 브라우저가
                      열마다 제 내용 길이에 비례해 나눠 주어 어떤 칸은 넓고 어떤 칸은
                      붙어 보인다. 여기서 받아 두면 가운데 칸들의 여백이 모두 같아진다.
                    */}
                    <th className={`${stickyThClass} w-full`} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-b border-line whitespace-nowrap hover:bg-bg">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={sel.isSelected(r.id)}
                          disabled={!!rowBlockedReason(r)}
                          onChange={() => sel.toggle(r)}
                          title={rowBlockedReason(r) ?? `${r.name} 선택`}
                          aria-label={`${r.name} 선택`}
                        />
                      </td>
                      <td className="num px-3 py-2 text-fg-muted">
                        {rowNo(i, paged.page, size)}
                      </td>
                      <td className="px-3 py-2">
                        {r.registered ? (
                          <Badge tone="accent" title={r.assetName ?? undefined}>
                            O
                          </Badge>
                        ) : (
                          <Badge tone="muted" title="고정자산 미등록 소액 비품">
                            X
                          </Badge>
                        )}
                      </td>
                      <td className="code px-3 py-2">
                        {r.assetCode ? codeText(r.assetCode) : <Badge tone="warn">미부여</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        {r.name}
                        {r.rental && (
                          <span className="ml-1">
                            <Badge tone="muted">렌탈</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.categoryName ?? '-'}</td>
                      <td className="px-3 py-2">{r.locationName ?? '-'}</td>
                      <td className="px-3 py-2">{r.deptName ?? '-'}</td>
                      <td className="px-3 py-2">{fmtDate(r.acquisitionDate)}</td>
                      <td className="px-3 py-2">{r.modelName ?? '-'}</td>
                      <td className="px-3 py-2">{r.maker ?? '-'}</td>
                      <td className="num px-3 py-2">{won(r.purchasePrice)}</td>
                      <td className="px-3 py-2">{r.statusLabel}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="whitespace-nowrap text-[18px] text-accent hover:underline"
                          onClick={() => setEditing(r)}
                        >
                          수정
                        </button>
                      </td>
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
          source="physical"
          items={sel.items()}
          isDownloading={sticker.isPending}
          onClose={() => setPreviewing(false)}
          onDownload={(startPosition) => sticker.mutate(startPosition)}
        />
      )}

      {editing && (
        <PhysicalAssetModal
          item={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ---------- 부모 고정자산 고르기 ---------- */

/** 가나다 순. 숫자가 섞인 이름(2호기 vs 10호기)도 사람이 읽는 순서로 놓는다 */
const koCollator = new Intl.Collator('ko', { numeric: true });

/** 입력칸과 후보 목록에 같은 형식으로 자산을 적는다 */
const assetLabel = (a: Asset) => `${a.name} — ${codeText(a.assetCode)} · ${a.accountName}`;

/**
 * 부모 고정자산 선택.
 *
 * 예전에는 자산 ID 를 숫자로 직접 넣게 했는데, 그 번호는 DB 키라서 사용자가 알 길이 없다.
 * 자산명·자산코드로 찾아서 고르고, 고른 자산의 취득일·취득가액을 함께 보여줘 확인하게 한다.
 * 고정자산 196건이라 한 번 받아 화면에서 거른다.
 *
 * 검색칸과 셀렉트를 따로 두면 고른 자산이 옆 칸에 가 있어 눈이 두 번 움직인다.
 * 한 칸으로 합쳐서, 치면 후보가 아래로 펼쳐지고 고르면 그 칸에 그대로 남게 한다.
 */
function ParentAssetPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (assetId: string, parent?: Asset) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);

  const query = { size: 500 };
  const q = useQuery({
    queryKey: queryKeys.assets.list(query),
    queryFn: () => assetsApi.list(query),
    staleTime: 5 * 60_000,
  });

  /* 서버 순서(등록순)는 눈으로 훑기 어렵다. 자산명 가나다 순으로 놓는다 */
  const assets = useMemo(
    () => [...(q.data?.items ?? [])].sort((a, b) => koCollator.compare(a.name, b.name)),
    [q.data],
  );
  const picked = assets.find((a) => String(a.id) === value);

  const k = keyword.trim().toLowerCase();
  const matched = useMemo(() => {
    if (k === '') return assets;
    const has = (text: string | null) => (text ?? '').toLowerCase().includes(k);
    const hit = assets.filter((a) => has(a.name) || has(a.assetCode) || has(a.accountName));
    /* 이름 첫머리가 걸린 것을 위로. sort 가 안정적이라 그 안의 가나다 순은 그대로다 */
    const first = (a: Asset) => Number(a.name.toLowerCase().startsWith(k));
    return hit.sort((a, b) => first(b) - first(a));
  }, [assets, k]);

  /* 찾는 중에는 입력한 글자를, 다 고르고 나면 고른 자산을 그대로 보여준다 */
  const text = open ? keyword : picked ? assetLabel(picked) : '';

  const pick = (a: Asset) => {
    setKeyword('');
    setOpen(false);
    onChange(String(a.id), a);
  };

  return (
    <Field
      label="부모 고정자산"
      required
      error={error}
      hint="이 비품이 딸린 고정자산입니다. 가나다 순으로 놓여 있고, 자산명·자산코드·계정과목으로 찾을 수 있습니다."
    >
      <div className="relative">
        <input
          className={`${filterClass} w-full`}
          placeholder="자산명·자산코드로 찾기"
          value={text}
          /* 다시 누르면 곧바로 다른 자산을 찾을 수 있게 검색어를 비우고 목록을 편다 */
          onFocus={() => {
            setKeyword('');
            setOpen(true);
          }}
          onChange={(e) => {
            setKeyword(e.target.value);
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && open && matched.length > 0) {
              e.preventDefault();
              pick(matched[0]);
            }
          }}
        />
        {open && (
          <ul className="absolute z-20 mt-0.5 max-h-64 w-full overflow-auto rounded-sm border border-line bg-surface shadow-lg">
            {q.isLoading && <li className="px-3 py-2 text-[17px] text-fg-muted">불러오는 중…</li>}
            {!q.isLoading && matched.length === 0 && (
              <li className="px-3 py-2 text-[17px] text-warn">검색 결과가 없습니다.</li>
            )}
            {matched.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-[18px] hover:bg-bg ${
                    String(a.id) === value ? 'bg-bg' : ''
                  }`}
                  /* blur 보다 먼저 잡아야 목록이 닫히기 전에 선택이 먹는다 */
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(a);
                  }}
                >
                  {assetLabel(a)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picked && !open && (
        <p className="mt-1 text-[17px] text-fg-sub">
          취득 {fmtDate(picked.acquisitionDate)} · 취득가액 {won(picked.acquisitionCost)}원 · 수량{' '}
          {picked.quantity}
        </p>
      )}
    </Field>
  );
}
/* ---------- 등록·수정 ---------- */

function PhysicalAssetModal({
  item,
  onClose,
}: {
  item?: PhysicalAsset;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    /* 자산등록 O/X. 서버는 이 값을 따로 받지 않고 부모 고정자산 연결 여부로 정하지만,
       담당자는 목록의 O/X 를 그대로 고치고 싶어 하므로 화면에서는 독립된 칸으로 둔다 */
    registered: item?.registered ?? false,
    assetId: item?.assetId != null ? String(item.assetId) : '',
    name: item?.name ?? '',
    categoryCode: item?.categoryCode ?? '',
    itemTypeCode: item?.itemTypeCode ?? '',
    itemCode: item?.itemCode ?? '',
    locationCode: item?.locationCode ?? '',
    deptCode: item?.deptCode ?? '',
    acquisitionDate: item?.acquisitionDate ?? '',
    modelName: item?.modelName ?? '',
    spec: item?.spec ?? '',
    maker: item?.maker ?? '',
    supplier: item?.supplier ?? '',
    purchasePrice: item?.purchasePrice != null ? String(item.purchasePrice) : '',
    rental: item?.rental ?? false,
    status: (item?.status ?? 'IN_USE') as AssetStatus,
    excludedFromPrint: item?.excludedFromPrint ?? false,
    remark: item?.remark ?? '',
  });

  const suppliesMode = isSuppliesItemEnabled(form.categoryCode);
  /* O 는 "어느 고정자산에 딸렸는지" 가 있어야 성립한다 */
  const parentMissing = form.registered && form.assetId === '';

  const categories = useCategories();
  const itemTypes = useItemTypes();
  const locations = useLocations();
  const departments = useDepartments();
  const items = useItems(form.itemTypeCode || undefined, { enabled: suppliesMode });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: queryKeys.physicalAssets.all });

  const save = useMutation({
    mutationFn: () => {
      const body: SavePhysicalAssetPayload = {
        // 자산등록 X 로 내릴 때는 null 을 보내야 서버가 연결을 지운다.
        // undefined 로 두면 JSON 에서 키가 통째로 빠져 PATCH 가 예전 연결을 그대로 남긴다
        assetId: form.registered && form.assetId ? Number(form.assetId) : null,
        name: form.name.trim(),
        categoryCode: form.categoryCode || undefined,
        itemTypeCode: suppliesMode ? form.itemTypeCode || undefined : undefined,
        itemCode: suppliesMode ? form.itemCode || undefined : undefined,
        locationCode: form.locationCode || undefined,
        deptCode: form.deptCode || undefined,
        acquisitionDate: form.acquisitionDate || undefined,
        modelName: form.modelName || undefined,
        spec: form.spec || undefined,
        maker: form.maker || undefined,
        supplier: form.supplier || undefined,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        rental: form.rental,
        status: form.status,
        excludedFromPrint: form.excludedFromPrint,
        remark: form.remark || undefined,
      };
      return item
        ? physicalAssetsApi.update(item.id, body)
        : physicalAssetsApi.create(body).then(() => undefined);
    },
    onSuccess: () => {
      toast.ok(item ? '수정했습니다.' : '실물자산을 등록했습니다.');
      invalidate();
      onClose();
    },
    onError: toast.fail,
  });

  const remove = useMutation({
    mutationFn: () => physicalAssetsApi.remove(item!.id),
    onSuccess: () => {
      toast.ok('삭제했습니다.');
      invalidate();
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={item ? '실물자산 수정' : '실물자산 등록'}
      width={900}
      onClose={onClose}
      footer={
        <>
          {item && (
            <button
              type="button"
              className={btnDangerClass}
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`${item.name} 을 삭제합니다.`)) remove.mutate();
              }}
            >
              삭제
            </button>
          )}
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || form.name.trim() === '' || parentMissing}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Field label="품명" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field
          label="자산등록"
          hint={
            form.registered
              ? '목록의 자산등록 칸이 O 가 됩니다. 스티커 출력 대상입니다.'
              : '목록의 자산등록 칸이 X 가 됩니다. 스티커 출력 대상에서 빠집니다.'
          }
        >
          <div className="flex gap-4 py-1.5">
            {([true, false] as const).map((v) => (
              <label key={String(v)} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="registered"
                  checked={form.registered === v}
                  /* X 로 내리면 골라 둔 고정자산도 같이 비운다. 남겨 두면 저장할 때 되살아난다 */
                  onChange={() =>
                    setForm((p) => ({ ...p, registered: v, assetId: v ? p.assetId : '' }))
                  }
                />
                <Badge tone={v ? 'accent' : 'muted'}>{v ? 'O' : 'X'}</Badge>
                <span className="text-[18px]">{v ? '고정자산 등록' : '소액 비품'}</span>
              </label>
            ))}
          </div>
        </Field>
        {/* O 일 때만 어느 고정자산인지 묻는다. X 면 물어볼 것이 없다 */}
        {form.registered && (
          <div className="col-span-3">
            <ParentAssetPicker
              value={form.assetId}
              error={parentMissing ? '부모 고정자산을 골라야 자산등록 O 로 저장됩니다.' : undefined}
              onChange={(assetId, parent) =>
                setForm((p) => ({
                  ...p,
                  assetId,
                  // 부모에게 있는 값으로 빈 칸만 채운다. 이미 입력한 건 건드리지 않는다
                  categoryCode: p.categoryCode || parent?.categoryCode || '',
                  itemTypeCode: p.itemTypeCode || parent?.itemTypeCode || '',
                  itemCode: p.itemCode || parent?.itemCode || '',
                  locationCode: p.locationCode || parent?.locationCode || '',
                  deptCode: p.deptCode || parent?.usingDeptCode || '',
                  acquisitionDate: p.acquisitionDate || parent?.acquisitionDate || '',
                  modelName: p.modelName || parent?.modelName || '',
                  spec: p.spec || parent?.spec || '',
                  supplier: p.supplier || parent?.supplier || '',
                }))
              }
            />
          </div>
        )}
        <Field label="자산구분">
          <select
            className={inputClass}
            value={form.categoryCode}
            onChange={(e) => {
              const v = e.target.value;
              setForm((p) => ({
                ...p,
                categoryCode: v,
                itemTypeCode: isSuppliesItemEnabled(v) ? p.itemTypeCode : '',
                itemCode: isSuppliesItemEnabled(v) ? p.itemCode : '',
              }));
            }}
          >
            <option value="">선택</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="비품구분" hint={suppliesMode ? undefined : '비품(P05)일 때만'}>
          <select
            className={inputClass}
            disabled={!suppliesMode}
            value={form.itemTypeCode}
            onChange={(e) => setForm((p) => ({ ...p, itemTypeCode: e.target.value, itemCode: '' }))}
          >
            <option value="">선택</option>
            {(itemTypes.data ?? []).map((t) => (
              <option key={t.id} value={t.code}>
                {t.code} {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="품목">
          <select
            className={inputClass}
            disabled={!suppliesMode || !form.itemTypeCode}
            value={form.itemCode}
            onChange={(e) => set('itemCode', e.target.value)}
          >
            <option value="">선택</option>
            {(items.data ?? []).map((i) => (
              <option key={i.id} value={i.code}>
                {i.code} {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="위치" hint="비우면 자산코드 미부여">
          <select
            className={inputClass}
            value={form.locationCode}
            onChange={(e) => set('locationCode', e.target.value)}
          >
            <option value="">미확정</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.code}>
                {l.code} {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="부서">
          <select
            className={inputClass}
            value={form.deptCode}
            onChange={(e) => set('deptCode', e.target.value)}
          >
            <option value="">선택</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.code}>
                {d.code} {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="구입일자">
          <input
            type="date"
            className={inputClass}
            value={form.acquisitionDate}
            onChange={(e) => set('acquisitionDate', e.target.value)}
          />
        </Field>
        <Field label="구입금액">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.purchasePrice}
            onChange={(e) => set('purchasePrice', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="모델명" hint="제품 본체나 명판에 찍힌 모델명. 없으면 비워 둡니다">
          <input
            className={inputClass}
            placeholder="예: HFC-218"
            value={form.modelName}
            onChange={(e) => set('modelName', e.target.value)}
          />
        </Field>
        <Field label="규격" hint="치수·용량 등 사양. 거래명세서나 제품 사양서 표기를 그대로 적습니다. 선택 항목입니다">
          <input
            className={inputClass}
            placeholder="예: 1200×600×720mm / 1.0㎥"
            value={form.spec}
            onChange={(e) => set('spec', e.target.value)}
          />
        </Field>
        <Field label="제조업체" hint="물건을 만든 회사">
          <input
            className={inputClass}
            value={form.maker}
            onChange={(e) => set('maker', e.target.value)}
          />
        </Field>
        <Field label="구매업체" hint="실제로 구입한 거래처">
          <input
            className={inputClass}
            value={form.supplier}
            onChange={(e) => set('supplier', e.target.value)}
          />
        </Field>
        <Field label="상태">
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => set('status', e.target.value as AssetStatus)}
          >
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-3">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[19px]">
          <input
            type="checkbox"
            checked={form.rental}
            onChange={(e) => set('rental', e.target.checked)}
          />
          렌탈
        </label>
        <label className="col-span-2 flex w-fit items-center gap-2 text-[19px]">
          <input
            type="checkbox"
            checked={form.excludedFromPrint}
            onChange={(e) => set('excludedFromPrint', e.target.checked)}
          />
          스티커·목록표 출력 제외
        </label>
      </div>
    </Modal>
  );
}
