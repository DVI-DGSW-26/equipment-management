import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DIRECTNESS,
  EQUIPMENT_KINDS,
  EQUIPMENT_STATUS_LABEL,
  MAJOR_CLASSES,
  equipmentApi,
  type CreateEquipmentPayload,
  type Equipment,
  type EquipmentStatus,
  type UpdateEquipmentPayload,
} from '@/api/equipment';
import { queryKeys } from '@/api/queryKeys';
import { usePerms } from '@/hooks/useMe';
import { useDebounced } from '@/hooks/useDebounced';
import { canEdit } from '@/lib/permissions';
import { ALL_ROWS, rowNo, slicePage } from '@/lib/paging';
import { searchIn } from '@/lib/search';
import Modal from '@/components/Modal';
import ParentAssetPicker from '@/components/ParentAssetPicker';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Field,
  FilterBar,
  filterClass,
  inputClass,
  Pagination,
  QueryState,
  ReadOnlyChip,
  Section,
  stickyThClass,
  TableScroll,
} from '@/components/ui';
import HelpLink from '@/components/HelpLink';

/**
 * 사내 설비 — 설비 한 대가 한 줄 (백엔드 2026-10-16).
 *
 * 자산 분류는 고정자산 · 비품 · 사내 설비 셋이다. 설비코드는 여기서만 관리하고,
 * 고정자산에는 "어느 고정자산에 속하는지" 로 잇는다(선택). 고정자산 상세는 이어진 설비의 코드를 보여 준다.
 * 100여 대라 한 번에 받아 화면에서 거른다.
 */

const STATUS_TONE: Record<EquipmentStatus, 'accent' | 'muted' | 'danger'> = {
  IN_USE: 'accent',
  IDLE: 'muted',
  DISPOSED: 'danger',
};

const EMPTY = {
  keyword: '',
  majorClass: '',
  directness: '',
  kind: '',
  status: '' as EquipmentStatus | '',
  linked: '' as '' | 'linked' | 'unlinked',
};
type FilterState = typeof EMPTY;

const labelOf = (list: readonly { code: string; label: string }[], code: string) =>
  list.find((x) => x.code === code)?.label ?? code;

export default function EquipmentListPage() {
  const { perms } = usePerms();
  /* 보는 것은 누구나, 고치는 것은 자산 영역(관리팀)과 팀장만 */
  const edit = canEdit(perms, 'asset');
  const [form, setForm] = useState<FilterState>(EMPTY);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(ALL_ROWS);
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);

  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setPage(0);
  };

  const list = useQuery({
    queryKey: queryKeys.equipment.list({}),
    queryFn: () => equipmentApi.list(),
  });
  const all = useMemo(() => list.data ?? [], [list.data]);

  const filtered = useMemo(() => {
    const hit = searchIn(form.keyword);
    return all.filter(
      (r) =>
        hit(
          r.equipmentCode,
          r.name,
          r.modelName,
          r.serialNo,
          r.maker,
          r.equipmentGroup,
          r.storageLocation,
          r.parentAssetName,
          r.parentAccountingCode,
        ) &&
        (form.majorClass === '' || r.majorClass === form.majorClass) &&
        (form.directness === '' || r.directness === form.directness) &&
        (form.kind === '' || r.kind === form.kind) &&
        (form.status === '' || r.status === form.status) &&
        (form.linked === '' || (r.parentAssetId != null) === (form.linked === 'linked')),
    );
  }, [all, form]);

  const paged = slicePage(filtered, page, size);
  const rows = paged.items;
  const dirty = (Object.keys(EMPTY) as (keyof FilterState)[]).some((k) => form[k] !== EMPTY[k]);

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">
        사내 설비{' '}
        <span className="text-[19px] font-normal text-fg-sub">설비 한 대가 한 줄 · 설비코드 관리</span>{' '}
        <HelpLink topic="equipment" />
      </h1>

      <Section
        title={`설비 목록 ${all.length.toLocaleString('ko-KR')}대`}
        right={
          edit ? (
            <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
              설비 등록
            </button>
          ) : (
            <ReadOnlyChip />
          )
        }
      >
        <FilterBar
          search={{
            value: form.keyword,
            onChange: (v) => set('keyword', v),
            fields: '설비코드 · 설비명 · 모델명 · 제작사 · 보관장소 · 고정자산',
          }}
          count={{ shown: filtered.length, total: all.length, unit: '대' }}
          onReset={() => {
            setForm(EMPTY);
            setPage(0);
          }}
          resetDisabled={!dirty}
        >
          <select
            className={`${filterClass} w-32`}
            aria-label="대분류"
            value={form.majorClass}
            onChange={(e) => set('majorClass', e.target.value)}
          >
            <option value="">대분류 전체</option>
            {MAJOR_CLASSES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.code} {m.label}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-32`}
            aria-label="직간접"
            value={form.directness}
            onChange={(e) => set('directness', e.target.value)}
          >
            <option value="">직간접 전체</option>
            {DIRECTNESS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} {d.label}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-40`}
            aria-label="종류"
            value={form.kind}
            onChange={(e) => set('kind', e.target.value)}
          >
            <option value="">종류 전체</option>
            {EQUIPMENT_KINDS.map((k) => (
              <option key={k.code} value={k.code}>
                {k.code} {k.label}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-28`}
            aria-label="상태"
            value={form.status}
            onChange={(e) => set('status', e.target.value as EquipmentStatus | '')}
          >
            <option value="">상태 전체</option>
            {(Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[]).map((s) => (
              <option key={s} value={s}>
                {EQUIPMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-44`}
            aria-label="고정자산 연결"
            value={form.linked}
            onChange={(e) => set('linked', e.target.value as FilterState['linked'])}
          >
            <option value="">고정자산 연결 전체</option>
            <option value="linked">연결됨</option>
            <option value="unlinked">연결 안 됨</option>
          </select>
        </FilterBar>

        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText={dirty ? '조건에 맞는 설비가 없습니다.' : '등록된 설비가 없습니다.'}
        />
        {rows.length > 0 && (
          <>
            <TableScroll>
              <table className="w-max min-w-full text-[19px]">
                <thead>
                  <tr className="text-left whitespace-nowrap text-fg-sub">
                    <th className={`${stickyThClass} num w-14`}>No.</th>
                    <th className={stickyThClass}>설비코드</th>
                    <th className={stickyThClass}>설비명</th>
                    <th className={stickyThClass}>종류</th>
                    <th className={stickyThClass}>직간접</th>
                    <th className={stickyThClass}>설비군</th>
                    <th className={stickyThClass}>모델명</th>
                    <th className={stickyThClass}>시리얼 번호</th>
                    <th className={stickyThClass}>제작사</th>
                    <th className={stickyThClass}>보관장소</th>
                    <th className={stickyThClass}>고정자산</th>
                    <th className={stickyThClass}>상태</th>
                    <th className={stickyThClass}>비고</th>
                    <th className={stickyThClass} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-b border-line whitespace-nowrap hover:bg-bg">
                      <td className="num px-3 py-2 text-fg-muted">{rowNo(i, paged.page, size)}</td>
                      <td className="code px-3 py-2">{r.equipmentCode}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{r.kindLabel}</td>
                      <td className="px-3 py-2">{labelOf(DIRECTNESS, r.directness)}</td>
                      <td className="px-3 py-2">{r.equipmentGroup ?? '-'}</td>
                      <td className="px-3 py-2">{r.modelName ?? '-'}</td>
                      <td className="px-3 py-2">{r.serialNo ?? '-'}</td>
                      <td className="px-3 py-2">{r.maker ?? '-'}</td>
                      <td className="px-3 py-2">{r.storageLocation ?? '-'}</td>
                      <td className="px-3 py-2">
                        {r.parentAssetId != null ? (
                          <Link
                            to={`/assets/${r.parentAssetId}`}
                            className="text-accent hover:underline"
                            title="고정자산 상세 열기"
                          >
                            {r.parentAssetName}
                            {r.parentAccountingCode && (
                              <span className="code ml-1 text-fg-sub">({r.parentAccountingCode})</span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-fg-muted">연결 안 됨</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONE[r.status]}>{r.statusLabel}</Badge>
                      </td>
                      <td className="max-w-[24rem] truncate px-3 py-2" title={r.remark ?? undefined}>
                        {r.remark ?? ''}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {edit && (
                          <button
                            type="button"
                            className="whitespace-nowrap text-[18px] text-accent hover:underline"
                            onClick={() => setEditing(r)}
                          >
                            수정
                          </button>
                        )}
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

      {editing && (
        <EquipmentModal
          item={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ---------- 등록·수정 ---------- */

/**
 * 설비코드는 대분류·직간접·종류 세 칸을 고르면 앞 3자리가 정해지고, 일련번호는 서버가 붙인다.
 * 고를 때마다 code-preview 로 저장될 번호를 미리 보여 준다.
 * 수정에서 세 칸을 바꾸지 않으면 코드는 그대로 둔다. 바꾸면 새 분류의 다음 번호로 바뀐다.
 */
function EquipmentModal({ item, onClose }: { item?: Equipment; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    majorClass: item?.majorClass ?? '',
    directness: item?.directness ?? '',
    kind: item?.kind ?? '',
    name: item?.name ?? '',
    equipmentGroup: item?.equipmentGroup ?? '',
    modelName: item?.modelName ?? '',
    serialNo: item?.serialNo ?? '',
    maker: item?.maker ?? '',
    storageLocation: item?.storageLocation ?? '',
    parentAssetId: item?.parentAssetId != null ? String(item.parentAssetId) : '',
    status: (item?.status ?? 'IN_USE') as EquipmentStatus,
    remark: item?.remark ?? '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const prefix =
    form.majorClass && form.directness && form.kind
      ? `${form.majorClass}${form.directness}${form.kind}`
      : '';
  const originalPrefix = item ? item.equipmentCode.slice(0, 3) : '';
  /** 등록이거나, 수정에서 분류를 바꿨다 — 새 번호를 받는다 */
  const renumber = prefix !== '' && prefix !== originalPrefix;

  const settledPrefix = useDebounced(renumber ? prefix : '', 200);
  const preview = useQuery({
    queryKey: queryKeys.equipment.codePreview(settledPrefix),
    queryFn: () => equipmentApi.codePreview(settledPrefix),
    enabled: settledPrefix !== '',
    /* 남이 그새 등록하면 번호가 밀린다. 창을 열 때마다 다시 묻는다 */
    staleTime: 0,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => {
      const text = (s: string) => s.trim();
      if (!item) {
        const body: CreateEquipmentPayload = {
          equipmentCode: prefix,
          name: text(form.name),
          equipmentGroup: text(form.equipmentGroup) || undefined,
          modelName: text(form.modelName) || undefined,
          serialNo: text(form.serialNo) || undefined,
          maker: text(form.maker) || undefined,
          storageLocation: text(form.storageLocation) || undefined,
          parentAssetId: form.parentAssetId ? Number(form.parentAssetId) : undefined,
          status: form.status,
          remark: text(form.remark) || undefined,
        };
        return equipmentApi.create(body);
      }
      /* 빈 칸도 보낸다 — 지운 값이 지워지도록. 고정자산 연결만 따로 다룬다 */
      const body: UpdateEquipmentPayload = {
        equipmentCode: renumber ? prefix : undefined,
        name: text(form.name),
        equipmentGroup: text(form.equipmentGroup),
        modelName: text(form.modelName),
        serialNo: text(form.serialNo),
        maker: text(form.maker),
        storageLocation: text(form.storageLocation),
        status: form.status,
        remark: text(form.remark),
      };
      if (form.parentAssetId) body.parentAssetId = Number(form.parentAssetId);
      else if (item.parentAssetId != null) body.unlinkParent = true;
      return equipmentApi.update(item.id, body);
    },
    onSuccess: (saved) => {
      toast.ok(
        item
          ? `${saved.equipmentCode} 을 저장했습니다.`
          : `설비 ${saved.equipmentCode} 을 등록했습니다.`,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.all });
      /* 고정자산 상세의 설비코드 표시가 바뀐다 */
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
      onClose();
    },
    onError: toast.fail,
  });

  const remove = useMutation({
    mutationFn: () => equipmentApi.remove(item!.id),
    onSuccess: () => {
      toast.ok('삭제했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.equipment.all });
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
      onClose();
    },
    onError: toast.fail,
  });

  const canSave = form.name.trim() !== '' && prefix !== '' && !save.isPending;

  return (
    <Modal
      title={item ? `사내 설비 수정 — ${item.equipmentCode}` : '사내 설비 등록'}
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
                if (window.confirm(`${item.equipmentCode} ${item.name} 을 삭제합니다. 팀장 승인 뒤 지워집니다.`))
                  remove.mutate();
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
            disabled={!canSave}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* ---------- 설비코드 ---------- */}
        <Field label="대분류" required>
          <select
            className={inputClass}
            value={form.majorClass}
            onChange={(e) => set('majorClass', e.target.value)}
          >
            <option value="">선택</option>
            {MAJOR_CLASSES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.code} {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="직간접" required>
          <select
            className={inputClass}
            value={form.directness}
            onChange={(e) => set('directness', e.target.value)}
          >
            <option value="">선택</option>
            {DIRECTNESS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="종류" required>
          <select className={inputClass} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="">선택</option>
            {EQUIPMENT_KINDS.map((k) => (
              <option key={k.code} value={k.code}>
                {k.code} {k.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-full -mt-1 rounded-sm border border-line bg-bg px-3 py-2 text-[18px]">
          <span className="text-fg-sub">설비코드 </span>
          {prefix === '' ? (
            <span className="text-fg-muted">대분류·직간접·종류를 고르면 번호가 정해집니다.</span>
          ) : !renumber ? (
            <>
              <b className="code">{item?.equipmentCode}</b>
              <span className="ml-2 text-fg-muted">그대로 둡니다.</span>
            </>
          ) : preview.isError ? (
            <span className="text-danger">
              번호를 미리 보지 못했습니다 —{' '}
              {preview.error instanceof Error ? preview.error.message : ''}
            </span>
          ) : preview.data && settledPrefix === prefix ? (
            <>
              <b className="code">{preview.data}</b>
              <span className="ml-2 text-fg-muted">
                {item ? `으로 바뀝니다 (지금 ${item.equipmentCode}).` : '으로 저장됩니다.'} 그사이
                다른 사람이 같은 분류로 등록하면 다음 번호가 붙습니다.
              </span>
            </>
          ) : (
            <span className="text-fg-muted">{prefix}··· 번호 확인 중…</span>
          )}
        </div>

        {/* ---------- 설비 정보 ---------- */}
        <Field label="설비명" required>
          <input
            className={inputClass}
            value={form.name}
            maxLength={200}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="설비군" hint="예: 절단기">
          <input
            className={inputClass}
            value={form.equipmentGroup}
            maxLength={50}
            onChange={(e) => set('equipmentGroup', e.target.value)}
          />
        </Field>
        <Field label="상태">
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => set('status', e.target.value as EquipmentStatus)}
          >
            {(Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[]).map((s) => (
              <option key={s} value={s}>
                {EQUIPMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="모델명">
          <input
            className={inputClass}
            value={form.modelName}
            maxLength={100}
            onChange={(e) => set('modelName', e.target.value)}
          />
        </Field>
        <Field label="시리얼 번호">
          <input
            className={inputClass}
            value={form.serialNo}
            maxLength={100}
            onChange={(e) => set('serialNo', e.target.value)}
          />
        </Field>
        <Field label="제작사">
          <input
            className={inputClass}
            value={form.maker}
            maxLength={100}
            onChange={(e) => set('maker', e.target.value)}
          />
        </Field>
        <Field label="보관장소" hint="예: B동_가공라인">
          <input
            className={inputClass}
            value={form.storageLocation}
            maxLength={100}
            onChange={(e) => set('storageLocation', e.target.value)}
          />
        </Field>

        {/* ---------- 고정자산 연결 (선택) ---------- */}
        <div className="col-span-full">
          <ParentAssetPicker
            label="연결할 고정자산"
            required={false}
            hint="이 설비가 회계상 속한 고정자산입니다. 연결은 선택이고, 연결하면 고정자산 상세에 이 설비코드가 보입니다."
            value={form.parentAssetId}
            onChange={(assetId) => set('parentAssetId', assetId)}
          />
          {form.parentAssetId && (
            <button
              type="button"
              className="mt-1 text-[17px] text-accent hover:underline"
              onClick={() => set('parentAssetId', '')}
            >
              고정자산 연결 해제
            </button>
          )}
        </div>

        <div className="col-span-full">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark}
              maxLength={500}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
