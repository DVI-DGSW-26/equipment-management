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
import { fmtDate } from '@/lib/date';
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
  inputClass,
  Pagination,
  QueryState,
  Section,
  thClass,
} from '@/components/ui';

export default function PhysicalAssetListPage() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [registered, setRegistered] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [editing, setEditing] = useState<PhysicalAsset | 'new' | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const query = useMemo(
    () => ({
      name: name.trim() || undefined,
      assetCode: assetCode.trim() || undefined,
      status: status || undefined,
      registered: registered === '' ? undefined : registered === 'true',
      page,
      size,
    }),
    [name, assetCode, status, registered, page, size],
  );

  const list = useQuery({
    queryKey: queryKeys.physicalAssets.list(query),
    queryFn: () => physicalAssetsApi.list(query),
  });

  const rows = list.data?.items ?? [];
  const sel = useStickerSelection(rows);

  /** 체크박스가 잠긴 이유. null 이면 선택 가능 */
  const rowBlockedReason = (r: PhysicalAsset): string | null =>
    !r.assetCode
      ? '자산코드 미부여 — 위치·부서를 지정하면 저장 시 채번됩니다.'
      : r.excludedFromPrint
        ? '출력 제외로 지정된 자산입니다.'
        : null;

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
            <input
              className={`${inputClass} w-36`}
              placeholder="품명"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPage(0);
              }}
            />
            <input
              className={`${inputClass} w-40`}
              placeholder="자산코드"
              value={assetCode}
              onChange={(e) => {
                setAssetCode(e.target.value);
                setPage(0);
              }}
            />
            <select
              className={`${inputClass} w-28`}
              value={registered}
              onChange={(e) => {
                setRegistered(e.target.value as '' | 'true' | 'false');
                setPage(0);
              }}
            >
              <option value="">전체</option>
              <option value="true">자산등록 O</option>
              <option value="false">소액 비품</option>
            </select>
            <select
              className={`${inputClass} w-24`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as AssetStatus | '');
                setPage(0);
              }}
            >
              <option value="">전체 상태</option>
              {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ASSET_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
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
        {/* 체크박스가 전부 잠겨 보이는 이유를 미리 알려준다 */}
        {rows.length > 0 && !sel.showSelectColumn && (
          <p className="border-b border-line bg-warn/10 px-3 py-2 text-[17px] text-warn">
            이 페이지에는 스티커를 출력할 수 있는 실물자산이 없습니다. 자산코드가 없거나 출력
            제외로 지정된 자산은 선택할 수 없습니다.
          </p>
        )}

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText="조건에 맞는 실물자산이 없습니다."
        />
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[19px]">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-fg-sub">
                    <th className="w-8 px-2 py-2">
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
                        aria-label="전체 선택"
                      />
                    </th>
                    <th className={thClass}>자산등록</th>
                    <th className={thClass}>자산코드</th>
                    <th className={thClass}>품명</th>
                    <th className={thClass}>자산구분</th>
                    <th className={thClass}>위치</th>
                    <th className={thClass}>부서</th>
                    <th className={thClass}>구입일</th>
                    <th className={thClass}>모델명</th>
                    <th className={thClass}>제조업체</th>
                    <th className={`${thClass} text-right`}>구입금액</th>
                    <th className={thClass}>상태</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line hover:bg-bg">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={sel.isSelected(r.id)}
                          disabled={!!rowBlockedReason(r)}
                          onChange={() => sel.toggle(r)}
                          title={rowBlockedReason(r) ?? `${r.name} 선택`}
                          aria-label={`${r.name} 선택`}
                        />
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

/**
 * 부모 고정자산 선택.
 *
 * 예전에는 자산 ID 를 숫자로 직접 넣게 했는데, 그 번호는 DB 키라서 사용자가 알 길이 없다.
 * 자산명·자산코드로 찾아서 고르고, 고른 자산의 취득일·취득가액을 함께 보여줘 확인하게 한다.
 * 고정자산 196건이라 한 번 받아 화면에서 거른다.
 */
function ParentAssetPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (assetId: string, parent?: Asset) => void;
}) {
  const [keyword, setKeyword] = useState('');

  const query = { size: 500 };
  const q = useQuery({
    queryKey: queryKeys.assets.list(query),
    queryFn: () => assetsApi.list(query),
    staleTime: 5 * 60_000,
  });

  const assets = q.data?.items ?? [];
  const picked = assets.find((a) => String(a.id) === value);

  const k = keyword.trim().toLowerCase();
  const matched = k
    ? assets.filter(
        (a) =>
          a.name.toLowerCase().includes(k) || (a.assetCode ?? '').toLowerCase().includes(k),
      )
    : assets;

  return (
    <Field
      label="부모 고정자산"
      hint="여러 개를 한 건으로 산 비품이면 그 고정자산을 고릅니다. 고정자산으로 등록하지 않은 소액 비품이면 비워 둡니다(스티커 출력 대상에서 빠집니다)."
    >
      <div className="flex gap-2">
        <input
          className={`${inputClass} w-48`}
          placeholder="자산명·자산코드로 찾기"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          className={inputClass}
          value={value}
          onChange={(e) => {
            const id = e.target.value;
            onChange(
              id,
              assets.find((a) => String(a.id) === id),
            );
          }}
        >
          <option value="">고정자산 없음 (소액 비품)</option>
          {matched.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {codeText(a.assetCode)} · {a.accountName}
            </option>
          ))}
        </select>
      </div>
      {picked && (
        <p className="mt-1 text-[17px] text-fg-sub">
          취득 {fmtDate(picked.acquisitionDate)} · 취득가액 {won(picked.acquisitionCost)}원 · 수량{' '}
          {picked.quantity}
        </p>
      )}
      {k !== '' && matched.length === 0 && (
        <p className="mt-1 text-[17px] text-warn">검색 결과가 없습니다.</p>
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
        assetId: form.assetId ? Number(form.assetId) : undefined,
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
            disabled={save.isPending || form.name.trim() === ''}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="품명" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <div className="col-span-2">
          <ParentAssetPicker
            value={form.assetId}
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
