import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assetsApi,
  ASSET_STATUS_LABEL,
  DEPRECIATION_METHOD_LABEL,
  EXPENSE_TYPE_LABEL,
  type Asset,
  type AssetStatus,
  type CorrectAssetPayload,
  type DepreciationMethod,
  type ExpenseType,
  type UpdateAssetPayload,
} from '@/api/assets';
import { depreciationApi } from '@/api/depreciation';
import { queryKeys } from '@/api/queryKeys';
import { useAccounts, useDepartments, useLocations } from '@/hooks/useMasters';
import { codeText, NO_CODE_REASON, SEQUENCE_MISSING_REASON } from '@/domain/assetCode';
import { allowedMethods } from '@/domain/depreciationMethod';
import { LOCKED_NOTICE } from '@/domain/editability';
import { currentYear, fmtDate, fmtDateTime } from '@/lib/date';
import { bookValue, PRE_SETTLEMENT_NOTE, rateText, won, wonUnit } from '@/lib/won';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Def,
  Field,
  inputClass,
  QueryState,
  Section,
  thClass,
} from '@/components/ui';

export default function AssetDetailPage() {
  const { id } = useParams();
  const assetId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'none' | 'edit' | 'correct'>('none');

  const detail = useQuery({
    queryKey: queryKeys.assets.detail(assetId),
    queryFn: () => assetsApi.detail(assetId),
    enabled: Number.isFinite(assetId),
  });
  const history = useQuery({
    queryKey: queryKeys.assets.history(assetId),
    queryFn: () => assetsApi.history(assetId),
    enabled: Number.isFinite(assetId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
    void qc.invalidateQueries({ queryKey: queryKeys.depreciation.all });
  };

  const remove = useMutation({
    mutationFn: () => assetsApi.remove(assetId),
    onSuccess: () => {
      toast.ok('자산을 삭제했습니다.');
      invalidate();
      navigate('/assets');
    },
    onError: toast.fail,
  });

  const a = detail.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onClick={() => navigate('/assets')}>
          ← 목록
        </button>
        <h1 className="text-[24px] font-semibold">{a?.name ?? '자산 상세'}</h1>
        {a?.assetCode ? (
          <span className="code text-[19px] text-fg-sub">{codeText(a.assetCode)}</span>
        ) : (
          a && <Badge tone="warn" title={NO_CODE_REASON}>자산코드 미부여</Badge>
        )}
        {a?.sequenceMissing && (
          <Badge tone="muted" title={SEQUENCE_MISSING_REASON}>
            7단 코드
          </Badge>
        )}
        {a?.preSettlementBasis && (
          <Badge tone="warn" title="무형자산 국고보조금 미반영 — 결산 전 기준">
            결산 전 기준
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className={btnClass}
            disabled={!a}
            onClick={() => setMode('edit')}
          >
            수정
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={!a}
            onClick={() => setMode('correct')}
          >
            회계 정정
          </button>
          <button
            type="button"
            className={btnDangerClass}
            disabled={!a || remove.isPending}
            onClick={() => {
              if (window.confirm('이 자산을 삭제합니다. 되돌릴 수 없습니다.')) remove.mutate();
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <QueryState isPending={detail.isPending} error={detail.error} />

      {a && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Section title="기본 정보">
              <Def label="자산코드">
                <span className="code">{codeText(a.assetCode)}</span>
              </Def>
              <Def label="자산명">{a.name}</Def>
              <Def label="계정과목">
                {a.accountCode} {a.accountName}
              </Def>
              <Def label="자산구분">
                {a.categoryCode ? `${a.categoryCode} ${a.categoryName ?? ''}` : '-'}
              </Def>
              <Def label="비품구분 / 품목">
                {a.itemTypeCode || a.itemCode ? `${a.itemTypeCode ?? '-'} / ${a.itemCode ?? '-'}` : '-'}
              </Def>
              <Def label="취득일자">{fmtDate(a.acquisitionDate)}</Def>
              <Def label="수량">{a.quantity?.toLocaleString('ko-KR')}</Def>
              <Def label="상태">{a.statusLabel}</Def>
              <Def label="양도/폐기일">{fmtDate(a.disposalDate)}</Def>
            </Section>

            <Section title="회계 정보">
              <Def label="취득가액">
                <span className="num block">{wonUnit(a.acquisitionCost)}</span>
              </Def>
              <Def label="상각방법 / 내용연수">
                {a.depreciationMethodLabel ?? '-'} / {a.usefulLifeYears ?? '-'}년
              </Def>
              <Def label="상각률">
                {a.depreciationRate == null ? (
                  <span className="text-fg-muted">마스터 값 적용</span>
                ) : (
                  rateText(a.depreciationRate)
                )}
              </Def>
              <Def label="경비구분">
                {a.expenseType
                  ? (EXPENSE_TYPE_LABEL[a.expenseType as ExpenseType] ?? a.expenseType)
                  : '-'}
              </Def>
              <Def label="전기말상각누계액">
                <span className="num block">{won(a.priorAccumulated)}</span>
              </Def>
              <Def label="당기상각비">
                <span className="num block">{won(a.currentYearDepreciation)}</span>
              </Def>
              <Def label="당기말상각누계액">
                <span className="num block">{won(a.accumulatedDepreciation)}</span>
              </Def>
              <Def label="당기말장부가액">
                <span
                  className="num block font-semibold"
                  title={a.bookValue < 0 ? PRE_SETTLEMENT_NOTE : undefined}
                >
                  {bookValue(a.bookValue)}
                </span>
              </Def>
              <Def label="개시 기준연도 / 개시 누계액">
                {a.openingFiscalYear ?? '-'} / {won(a.openingAccumulatedDepreciation)}
              </Def>
            </Section>

            <Section title="관리 정보">
              <Def label="사용부서">{a.usingDeptName ?? a.usingDeptCode ?? '-'}</Def>
              <Def label="관리부서">{a.managingDeptName ?? a.managingDeptCode ?? '-'}</Def>
              <Def label="사용위치">
                {a.locationCode ? `${a.locationCode} ${a.locationName ?? ''}` : '-'}
              </Def>
              <Def label="담당자">{a.assignee ?? '-'}</Def>
              <Def label="매입처">{a.supplier ?? '-'}</Def>
              <Def label="모델명">{a.modelName ?? '-'}</Def>
              <Def label="규격">{a.spec ?? '-'}</Def>
              <Def label="설비코드 / 계측기 관리번호">
                {a.equipmentCode ?? '-'} / {a.instrumentMgmtNo ?? '-'}
              </Def>
              <Def label="출력 제외">{a.excludedFromPrint ? '예' : '아니오'}</Def>
              <Def label="비고">{a.remark ?? '-'}</Def>
            </Section>
          </div>

          <DepreciationHistory assetId={a.id} />

          <Section title="변경 이력">
            <QueryState
              isPending={history.isPending}
              error={history.error}
              isEmpty={(history.data ?? []).length === 0}
              emptyText="변경 이력이 없습니다."
            />
            {(history.data ?? []).length > 0 && (
              <table className="w-max min-w-full text-[19px]">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-fg-sub">
                    <th className={thClass}>일시</th>
                    <th className={thClass}>구분</th>
                    <th className={thClass}>항목</th>
                    <th className={thClass}>변경 전</th>
                    <th className={thClass}>변경 후</th>
                    <th className={thClass}>변경자</th>
                  </tr>
                </thead>
                <tbody>
                  {(history.data ?? []).map((h) => (
                    <tr key={h.id} className="border-b border-line">
                      <td className="px-3 py-2">{fmtDateTime(h.changedAt)}</td>
                      <td className="px-3 py-2">{h.changeTypeLabel}</td>
                      <td className="px-3 py-2">{h.fieldName}</td>
                      <td className="px-3 py-2 text-fg-sub">{h.beforeValue ?? '-'}</td>
                      <td className="px-3 py-2">{h.afterValue ?? '-'}</td>
                      <td className="px-3 py-2 text-fg-sub">{h.changedBy ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}

      {a && mode === 'edit' && (
        <EditModal asset={a} onClose={() => setMode('none')} onDone={invalidate} />
      )}
      {a && mode === 'correct' && (
        <CorrectModal asset={a} onClose={() => setMode('none')} onDone={invalidate} />
      )}
    </div>
  );
}

/* ---------- 감가상각 이력 ---------- */

/**
 * 자산 1건의 연도별 상각 이력.
 * 서버가 assetId 필터를 지원하므로 그 자산 행만 받는다.
 */
function DepreciationHistory({ assetId }: { assetId: number }) {
  const thisYear = currentYear();
  const fromYear = thisYear - 4;

  const q = useQuery({
    queryKey: queryKeys.depreciation.yearly(fromYear, thisYear, assetId),
    queryFn: () => depreciationApi.yearly(fromYear, thisYear, assetId),
  });

  const rows = [...(q.data?.rows ?? [])].sort((a, b) => a.fiscalYear - b.fiscalYear);

  return (
    <Section
      title="감가상각 이력"
      right={
        <span className="text-[18px] text-fg-muted">
          {fromYear}–{thisYear}년
        </span>
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText="계산된 상각 이력이 없습니다. 감가상각 화면에서 해당 연도를 먼저 계산하세요."
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>연도</th>
              <th className={thClass}>상각방법</th>
              <th className={`${thClass} text-right`}>상각비</th>
              <th className={`${thClass} text-right`}>연도말 상각누계액</th>
              <th className={`${thClass} text-right`}>연도말 장부가액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fiscalYear} className="border-b border-line">
                <td className="px-3 py-2 tabular-nums">{r.fiscalYear}</td>
                <td className="px-3 py-2">{r.depreciationMethodLabel ?? '-'}</td>
                <td className="num px-3 py-2">{won(r.depreciation)}</td>
                <td className="num px-3 py-2">{won(r.accumulated)}</td>
                <td className="num px-3 py-2">{bookValue(r.bookValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/* ---------- 일반 수정: 회계에 영향 없는 항목만 ---------- */

function EditModal({
  asset,
  onClose,
  onDone,
}: {
  asset: Asset;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<UpdateAssetPayload>({
    name: asset.name,
    status: asset.status,
    supplier: asset.supplier ?? '',
    usingDeptCode: asset.usingDeptCode ?? '',
    managingDeptCode: asset.managingDeptCode ?? '',
    locationCode: asset.locationCode ?? '',
    assignee: asset.assignee ?? '',
    modelName: asset.modelName ?? '',
    spec: asset.spec ?? '',
    equipmentCode: asset.equipmentCode ?? '',
    instrumentMgmtNo: asset.instrumentMgmtNo ?? '',
    excludedFromPrint: asset.excludedFromPrint,
    disposalDate: asset.disposalDate ?? '',
    remark: asset.remark ?? '',
  });

  const departments = useDepartments();
  const locations = useLocations();

  const set = <K extends keyof UpdateAssetPayload>(k: K, v: UpdateAssetPayload[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      assetsApi.update(asset.id, {
        ...form,
        disposalDate: form.disposalDate ? form.disposalDate : null,
      }),
    onSuccess: () => {
      toast.ok('저장했습니다.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title="자산 수정"
      width={860}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="자산명">
          <input
            className={inputClass}
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="상태">
          <select
            className={inputClass}
            value={form.status ?? 'IN_USE'}
            onChange={(e) => set('status', e.target.value as AssetStatus)}
          >
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="사용부서">
          <select
            className={inputClass}
            value={form.usingDeptCode ?? ''}
            onChange={(e) => set('usingDeptCode', e.target.value)}
          >
            <option value="">미지정</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.code}>
                {d.code} {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="관리부서">
          <select
            className={inputClass}
            value={form.managingDeptCode ?? ''}
            onChange={(e) => set('managingDeptCode', e.target.value)}
          >
            <option value="">사용부서와 동일</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.code}>
                {d.code} {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="사용위치"
          hint={!asset.assetCode ? '위치를 지정하면 저장 시 자산코드가 채번됩니다.' : undefined}
        >
          <select
            className={inputClass}
            value={form.locationCode ?? ''}
            onChange={(e) => set('locationCode', e.target.value)}
          >
            <option value="">미지정</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.code}>
                {l.code} {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="담당자">
          <input
            className={inputClass}
            value={form.assignee ?? ''}
            onChange={(e) => set('assignee', e.target.value)}
          />
        </Field>
        <Field label="매입처">
          <input
            className={inputClass}
            value={form.supplier ?? ''}
            onChange={(e) => set('supplier', e.target.value)}
          />
        </Field>
        <Field label="모델명">
          <input
            className={inputClass}
            value={form.modelName ?? ''}
            onChange={(e) => set('modelName', e.target.value)}
          />
        </Field>
        <Field label="규격">
          <input
            className={inputClass}
            value={form.spec ?? ''}
            onChange={(e) => set('spec', e.target.value)}
          />
        </Field>
        <Field label="설비코드">
          <input
            className={inputClass}
            value={form.equipmentCode ?? ''}
            onChange={(e) => set('equipmentCode', e.target.value)}
          />
        </Field>
        <Field label="계측기 관리번호">
          <input
            className={inputClass}
            value={form.instrumentMgmtNo ?? ''}
            onChange={(e) => set('instrumentMgmtNo', e.target.value)}
          />
        </Field>
        <Field label="양도/폐기일">
          <input
            type="date"
            className={inputClass}
            value={form.disposalDate ?? ''}
            onChange={(e) => set('disposalDate', e.target.value)}
          />
        </Field>
        <div className="col-span-2">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark ?? ''}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
        <label className="col-span-2 flex w-fit items-center gap-2 text-[19px]">
          <input
            type="checkbox"
            checked={form.excludedFromPrint ?? false}
            onChange={(e) => set('excludedFromPrint', e.target.checked)}
          />
          목록표·스티커 출력에서 제외 (금형 등)
        </label>
      </div>
    </Modal>
  );
}

/* ---------- 회계 정정: 감가상각 재계산 유발 ---------- */

function CorrectModal({
  asset,
  onClose,
  onDone,
}: {
  asset: Asset;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const accounts = useAccounts();
  const currentAccountId =
    (accounts.data ?? []).find((x) => x.code === asset.accountCode)?.id ?? null;

  const [form, setForm] = useState({
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: String(asset.acquisitionCost ?? ''),
    accountId: '',
    usefulLifeYears: String(asset.usefulLifeYears ?? ''),
    depreciationRate: asset.depreciationRate == null ? '' : String(asset.depreciationRate),
    depreciationMethod: (asset.depreciationMethod ?? 'STRAIGHT_LINE') as DepreciationMethod,
    openingFiscalYear: String(asset.openingFiscalYear ?? ''),
    openingAccumulatedDepreciation:
      asset.openingAccumulatedDepreciation == null
        ? ''
        : String(asset.openingAccumulatedDepreciation),
    reason: '',
  });

  const accountId = form.accountId ? Number(form.accountId) : currentAccountId;
  const methods = allowedMethods(accounts.data ?? [], accountId);

  const save = useMutation({
    mutationFn: () => {
      const body: CorrectAssetPayload = {
        reason: form.reason.trim(),
        acquisitionDate: form.acquisitionDate || undefined,
        acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
        accountId: form.accountId ? Number(form.accountId) : undefined,
        usefulLifeYears: form.usefulLifeYears ? Number(form.usefulLifeYears) : undefined,
        depreciationRate: form.depreciationRate ? Number(form.depreciationRate) : undefined,
        depreciationMethod: form.depreciationMethod,
        openingFiscalYear: form.openingFiscalYear ? Number(form.openingFiscalYear) : undefined,
        openingAccumulatedDepreciation: form.openingAccumulatedDepreciation
          ? Number(form.openingAccumulatedDepreciation)
          : undefined,
      };
      return assetsApi.correct(asset.id, body);
    },
    onSuccess: () => {
      toast.ok('정정했습니다. 감가상각을 다시 계산하세요.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  const set = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Modal
      title="회계 정정"
      width={860}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || form.reason.trim() === ''}
            onClick={() => save.mutate()}
          >
            정정 저장
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-[18px] text-warn">
        {LOCKED_NOTICE}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="취득일자">
          <input
            type="date"
            className={inputClass}
            value={form.acquisitionDate}
            onChange={(e) => set('acquisitionDate', e.target.value)}
          />
        </Field>
        <Field label="취득가액">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.acquisitionCost}
            onChange={(e) => set('acquisitionCost', e.target.value.replace(/[^\d.]/g, ''))}
          />
        </Field>
        <Field label="계정과목">
          <select
            className={inputClass}
            value={form.accountId || String(currentAccountId ?? '')}
            onChange={(e) => set('accountId', e.target.value)}
          >
            {(accounts.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="상각방법" hint="계정과목이 허용하는 방법만 선택할 수 있습니다.">
          <select
            className={inputClass}
            value={form.depreciationMethod}
            onChange={(e) => set('depreciationMethod', e.target.value)}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {DEPRECIATION_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="내용연수(년)">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.usefulLifeYears}
            onChange={(e) => set('usefulLifeYears', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="상각률" hint="비우면 마스터의 내용연수 × 상각방법 값을 쓴다">
          <input
            className={`${inputClass} num`}
            inputMode="decimal"
            value={form.depreciationRate}
            onChange={(e) => set('depreciationRate', e.target.value.replace(/[^\d.]/g, ''))}
          />
        </Field>
        <Field label="개시 기준연도">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.openingFiscalYear}
            onChange={(e) => set('openingFiscalYear', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="전기말상각누계액">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.openingAccumulatedDepreciation}
            onChange={(e) =>
              set('openingAccumulatedDepreciation', e.target.value.replace(/[^\d.]/g, ''))
            }
          />
        </Field>
        <div className="col-span-2">
          <Field label="정정 사유" required>
            <input
              className={inputClass}
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              placeholder="예: 취득가액 오기입 정정 (전표 2026-0312)"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
