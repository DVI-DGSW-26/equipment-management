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
import { currentYear, fmtDate, getToday, toIsoDate } from '@/lib/date';
import { bookValue, depreciationBase, PRE_SETTLEMENT_NOTE, rateText, won, wonUnit } from '@/lib/won';
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
  Tabs,
  thClass,
} from '@/components/ui';
import AssetAdditionsSection from './AssetAdditionsSection';
import AssetHistorySection from './AssetHistorySection';
import AssetTaxRecordSection from './AssetTaxRecordSection';

/**
 * 탭 구성은 회계 프로그램 고정자산등록화면을 그대로 따른다 —
 * 주요등록사항 / 추가등록사항 / 자산변동사항 (회계팀 회신 2026-09-01).
 */
type DetailTab = 'main' | 'extra' | 'changes';

const DETAIL_TABS = [
  { key: 'main' as const, label: '주요등록사항' },
  { key: 'extra' as const, label: '추가등록사항' },
  { key: 'changes' as const, label: '자산변동사항' },
];

export default function AssetDetailPage() {
  const { id } = useParams();
  const assetId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'none' | 'edit' | 'correct'>('none');
  const [disposing, setDisposing] = useState(false);
  const [tab, setTab] = useState<DetailTab>('main');

  const detail = useQuery({
    queryKey: queryKeys.assets.detail(assetId),
    queryFn: () => assetsApi.detail(assetId),
    enabled: Number.isFinite(assetId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
    void qc.invalidateQueries({ queryKey: queryKeys.depreciation.all });
  };

  /*
   * 폐기는 삭제와 다르다. 삭제는 감가상각 내역과 변경 이력까지 지워 되돌릴 수 없다.
   * 쓰지 않게 된 자산은 폐기로 넘겨야 상각 내역이 남고, 목록에서는 상태로 갈라 본다.
   * (계측기와 같은 구성. 다만 고정자산은 양도/폐기일과 금액을 함께 적는다)
   */
  const restore = useMutation({
    mutationFn: () =>
      assetsApi.update(assetId, {
        status: 'IN_USE',
        disposalDate: null,
        disposalAmount: null,
        partialDisposalAmount: null,
      }),
    onSuccess: () => {
      toast.ok('사용중으로 되돌렸습니다.');
      invalidate();
      void qc.invalidateQueries({ queryKey: queryKeys.assets.detail(assetId) });
    },
    onError: toast.fail,
  });

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
  /** 사용중이 아닌 것 (폐기·매각) */
  const gone = a != null && a.status !== 'IN_USE';

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
        {gone && a && (
          <Badge tone="muted">
            {a.statusLabel}{a.disposalDate ? ` · ${fmtDate(a.disposalDate)}` : ''}
          </Badge>
        )}
        {a?.preSettlementBasis && (
          <Badge tone="warn" title="무형자산 국고보조금 미반영 — 결산 전 기준">
            결산 전 기준
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={btnClass} disabled={!a} onClick={() => setMode('edit')}>
            수정
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={!a}
            onClick={() => setMode('correct')}
            title="취득가액·취득일자·내용연수 등 잠금 항목을 고칩니다. 저장하면 감가상각이 다시 계산됩니다."
          >
            회계 정정
          </button>
          {gone ? (
            <button
              type="button"
              className={btnClass}
              disabled={restore.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    '사용중으로 되돌립니다. 적어 둔 양도/폐기일과 금액은 지워집니다.',
                  )
                )
                  restore.mutate();
              }}
            >
              폐기 취소
            </button>
          ) : (
            <button
              type="button"
              className={btnClass}
              disabled={!a}
              onClick={() => setDisposing(true)}
            >
              폐기 · 매각
            </button>
          )}
          <button
            type="button"
            className={btnDangerClass}
            disabled={!a || remove.isPending}
            title="감가상각 내역과 변경 이력까지 함께 지웁니다. 실제 폐기는 [폐기 · 매각] 을 쓰세요."
            onClick={() => {
              if (
                window.confirm(
                  '이 자산을 완전히 삭제합니다. 감가상각 내역과 변경 이력도 함께 사라지고 되돌릴 수 없습니다. 실제로 폐기·매각한 자산이라면 [취소] 를 누르고 [폐기 · 매각] 을 쓰세요.',
                )
              )
                remove.mutate();
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <QueryState isPending={detail.isPending} error={detail.error} />

      {a && (
        <>
          <Tabs tabs={DETAIL_TABS} value={tab} onChange={setTab} />

          {tab === 'main' && (
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
                    {a.itemTypeCode || a.itemCode
                      ? `${a.itemTypeCode ?? '-'} / ${a.itemCode ?? '-'}`
                      : '-'}
                  </Def>
                  <Def label="취득일자">{fmtDate(a.acquisitionDate)}</Def>
                  <Def label="수량">{a.quantity?.toLocaleString('ko-KR')}</Def>
                  <Def label="상태">{a.statusLabel}</Def>
                  <Def label="양도/폐기일">{fmtDate(a.disposalDate)}</Def>
                  <Def label="양도폐기금액">
                    <span className="num-left block">{won(a.disposalAmount)}</span>
                  </Def>
                  <Def label="부분매각및폐기">
                    <span className="num-left block">{won(a.partialDisposalAmount)}</span>
                  </Def>
                </Section>

                <Section title="회계 정보">
                  <Def label="취득가액">
                    <span className="num-left block">{wonUnit(a.acquisitionCost)}</span>
                  </Def>
                  <Def label="신규취득및증가">
                    <span className="num-left block">{won(a.additionTotal)}</span>
                  </Def>
                  <Def label="상각기초가액">
                    <span className="num-left block font-semibold" title="취득가액 + 자본적지출 증가 누계">
                      {wonUnit(depreciationBase(a.acquisitionCost, a.additionTotal))}
                    </span>
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
                    <span className="num-left block">{won(a.priorAccumulated)}</span>
                  </Def>
                  <Def label="당기상각비">
                    <span className="num-left block">{won(a.currentYearDepreciation)}</span>
                  </Def>
                  <Def label="당기말상각누계액">
                    <span className="num-left block">{won(a.accumulatedDepreciation)}</span>
                  </Def>
                  <Def label="당기말장부가액">
                    <span
                      className="num-left block font-semibold"
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
            </>
          )}

          {tab === 'extra' && <AssetTaxRecordSection asset={a} onDone={invalidate} />}

          {tab === 'changes' && (
            <div className="space-y-3">
              <AssetAdditionsSection
                assetId={a.id}
                additionTotal={a.additionTotal}
                onChanged={invalidate}
              />
              <AssetHistorySection assetId={a.id} />
            </div>
          )}
        </>
      )}

      {a && mode === 'edit' && (
        <EditModal asset={a} onClose={() => setMode('none')} onDone={invalidate} />
      )}
      {a && mode === 'correct' && (
        <CorrectModal asset={a} onClose={() => setMode('none')} onDone={invalidate} />
      )}
      {a && disposing && (
        <DisposeModal asset={a} onClose={() => setDisposing(false)} onDone={invalidate} />
      )}
    </div>
  );
}

/* ---------- 폐기 · 매각 ---------- */

/**
 * 자산을 사용중에서 내린다.
 *
 * 계측기 폐기와 하는 일은 같지만 고정자산은 금액이 따라붙는다 — 양도폐기금액과
 * 부분매각및폐기는 상각 계산에 쓰이지 않는 기록 항목이라, 여기서 함께 적어 두지
 * 않으면 나중에 결산할 때 다시 찾아 넣어야 한다 (회계팀 회신 2026-09-01).
 */
function DisposeModal({
  asset,
  onClose,
  onDone,
}: {
  asset: Asset;
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<Exclude<AssetStatus, 'IN_USE'>>('DISPOSED');
  const [disposalDate, setDisposalDate] = useState(asset.disposalDate ?? toIsoDate(getToday()));
  const [disposalAmount, setDisposalAmount] = useState(
    asset.disposalAmount != null ? String(asset.disposalAmount) : '',
  );
  const [partialAmount, setPartialAmount] = useState(
    asset.partialDisposalAmount != null ? String(asset.partialDisposalAmount) : '',
  );

  const save = useMutation({
    mutationFn: () =>
      assetsApi.update(asset.id, {
        status,
        disposalDate: disposalDate || null,
        disposalAmount: disposalAmount === '' ? null : Number(disposalAmount),
        partialDisposalAmount: partialAmount === '' ? null : Number(partialAmount),
      }),
    onSuccess: () => {
      toast.ok(`${ASSET_STATUS_LABEL[status]} 처리했습니다. 감가상각 내역은 그대로 남습니다.`);
      onDone();
      void qc.invalidateQueries({ queryKey: queryKeys.assets.detail(asset.id) });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title="자산 폐기 · 매각"
      width={560}
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
            {ASSET_STATUS_LABEL[status]} 처리
          </button>
        </>
      }
    >
      <p className="mb-3 text-[18px] text-fg-sub">
        감가상각 내역과 변경 이력은 그대로 남고, 목록에서 상태로 갈라 보게 됩니다. 잘못했으면
        상세 화면에서 [폐기 취소] 로 되돌립니다.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="구분" required>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as Exclude<AssetStatus, 'IN_USE'>)}
          >
            <option value="DISPOSED">{ASSET_STATUS_LABEL.DISPOSED}</option>
            <option value="SOLD">{ASSET_STATUS_LABEL.SOLD}</option>
          </select>
        </Field>
        <Field label="양도/폐기일">
          <input
            type="date"
            className={inputClass}
            value={disposalDate}
            onChange={(e) => setDisposalDate(e.target.value)}
          />
        </Field>
        <Field
          label="양도폐기금액 (원)"
          hint={disposalAmount ? wonUnit(Number(disposalAmount)) : '감가상각 계산에 쓰이지 않는 기록 항목'}
        >
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            placeholder="0"
            value={disposalAmount}
            onChange={(e) => setDisposalAmount(e.target.value.replace(/[^d]/g, ''))}
          />
        </Field>
        <Field
          label="부분매각및폐기 (원)"
          hint={partialAmount ? wonUnit(Number(partialAmount)) : '일부만 처분한 경우에 적습니다.'}
        >
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            placeholder="0"
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value.replace(/[^d]/g, ''))}
          />
        </Field>
      </div>
    </Modal>
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

/** 빈 칸은 null 로 보내 값을 지운다 */
const toAmount = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

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
  /* 금액은 입력 중에는 문자열로 다루고 보낼 때만 숫자로 바꾼다 */
  const [disposalAmount, setDisposalAmount] = useState(
    asset.disposalAmount == null ? '' : String(asset.disposalAmount),
  );
  const [partialDisposalAmount, setPartialDisposalAmount] = useState(
    asset.partialDisposalAmount == null ? '' : String(asset.partialDisposalAmount),
  );

  const departments = useDepartments();
  const locations = useLocations();

  const set = <K extends keyof UpdateAssetPayload>(k: K, v: UpdateAssetPayload[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      assetsApi.update(asset.id, {
        ...form,
        disposalDate: form.disposalDate ? form.disposalDate : null,
        disposalAmount: toAmount(disposalAmount),
        partialDisposalAmount: toAmount(partialDisposalAmount),
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
      <p className="mb-3 text-[18px] text-fg-muted">
        취득가액·취득일자·내용연수처럼 감가상각에 영향을 주는 항목은 “회계 정정”에서 사유와 함께
        고칩니다.
      </p>
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

        {/* 양도·폐기는 날짜 바로 아래에서 금액까지 함께 적는다 (회계팀 회신 2026-09-01) */}
        <div className="col-span-full grid grid-cols-1 gap-3 rounded-sm border border-line bg-bg/40 p-3 md:grid-cols-3">
          <Field label="양도/폐기일">
            <input
              type="date"
              className={inputClass}
              value={form.disposalDate ?? ''}
              onChange={(e) => set('disposalDate', e.target.value)}
            />
          </Field>
          <Field label="양도폐기금액" hint="감가상각 계산에 쓰이지 않는 기록 항목">
            <input
              className={`${inputClass} num`}
              inputMode="numeric"
              value={disposalAmount}
              onChange={(e) => setDisposalAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </Field>
          <Field label="부분매각및폐기" hint="감가상각 계산에 쓰이지 않는 기록 항목">
            <input
              className={`${inputClass} num`}
              inputMode="numeric"
              value={partialDisposalAmount}
              onChange={(e) => setPartialDisposalAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </Field>
        </div>

        <div className="col-span-full">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark ?? ''}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
        <label className="col-span-full flex w-fit items-center gap-2 text-[19px]">
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
      toast.ok('정정했습니다. 감가상각을 다시 계산했습니다.');
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
      <p className="mb-3 text-[18px] text-fg-muted">
        기존 자산에 수리비가 들어 가액이 늘어난 경우는 정정이 아니라 “자산변동사항 → 자본적지출”에
        등록하세요.
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
        <div className="col-span-full">
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
