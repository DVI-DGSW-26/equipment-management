import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assetsApi,
  ASSET_STATUS_LABEL,
  DEPRECIATION_METHOD_LABEL,
  EXPENSE_TYPE_LABEL,
  type AssetStatus,
  type CreateAssetPayload,
  type DepreciationMethod,
  type ExpenseType,
} from '@/api/assets';
import { queryKeys } from '@/api/queryKeys';
import { useAccounts, useCategories, useDepartments, useItemTypes, useItems, useLocations, useRates } from '@/hooks/useMasters';
import { isSuppliesItemEnabled, SUPPLIES_CATEGORY } from '@/domain/assetCode';
import { allowedMethods, defaultMethod, lookupRate } from '@/domain/depreciationMethod';
import { rateText } from '@/lib/won';
import { toIsoDate } from '@/lib/date';
import { useToast } from '@/components/toastContext';
import { emptyTaxForm, hasTaxInput, TAX_NOTE, taxBody, type TaxFormState } from '@/domain/taxRecord';
import TaxRecordFields from '@/components/TaxRecordFields';
import { Badge, btnClass, btnPrimaryClass, Field, inputClass, Section } from '@/components/ui';

interface FormState {
  name: string;
  categoryCode: string;
  itemTypeCode: string;
  itemCode: string;
  locationCode: string;
  usingDeptCode: string;
  managingDeptCode: string;
  accountId: string;
  acquisitionDate: string;
  acquisitionCost: string;
  quantity: string;
  expenseType: ExpenseType | '';
  depreciationMethod: DepreciationMethod | '';
  usefulLifeYears: string;
  openingFiscalYear: string;
  openingAccumulatedDepreciation: string;
  status: AssetStatus;
  excludedFromPrint: boolean;
  supplier: string;
  assignee: string;
  modelName: string;
  spec: string;
  equipmentCode: string;
  instrumentMgmtNo: string;
  remark: string;
}

const initialForm = (): FormState => ({
  name: '',
  categoryCode: '',
  itemTypeCode: '',
  itemCode: '',
  locationCode: '',
  usingDeptCode: '',
  managingDeptCode: '',
  accountId: '',
  acquisitionDate: toIsoDate(new Date()),
  acquisitionCost: '',
  quantity: '1',
  expenseType: '',
  depreciationMethod: '',
  usefulLifeYears: '',
  openingFiscalYear: '',
  openingAccumulatedDepreciation: '',
  status: 'IN_USE',
  excludedFromPrint: false,
  supplier: '',
  assignee: '',
  modelName: '',
  spec: '',
  equipmentCode: '',
  instrumentMgmtNo: '',
  remark: '',
});

export default function AssetNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(initialForm);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const accounts = useAccounts();
  const categories = useCategories();
  const itemTypes = useItemTypes();
  const departments = useDepartments();
  const locations = useLocations();
  const rates = useRates();
  const items = useItems(form.itemTypeCode || undefined, { enabled: isSuppliesItemEnabled(form.categoryCode) });

  const suppliesMode = isSuppliesItemEnabled(form.categoryCode);
  const accountId = form.accountId ? Number(form.accountId) : null;
  const methods = allowedMethods(accounts.data ?? [], accountId);
  const method = (form.depreciationMethod || defaultMethod(accounts.data ?? [], accountId)) as DepreciationMethod;
  const usefulLife = form.usefulLifeYears ? Number(form.usefulLifeYears) : null;
  const rate = lookupRate(rates.data ?? [], usefulLife, method);

  /** 서버 채번 규칙 그대로 미리보기. 필수값이 모두 있을 때만 호출한다 */
  const previewQuery = useMemo(
    () => ({
      categoryCode: form.categoryCode,
      itemTypeCode: suppliesMode ? form.itemTypeCode : undefined,
      itemCode: suppliesMode ? form.itemCode : undefined,
      locationCode: form.locationCode,
      deptCode: form.usingDeptCode,
      acquisitionDate: form.acquisitionDate,
    }),
    [
      form.categoryCode,
      form.itemTypeCode,
      form.itemCode,
      form.locationCode,
      form.usingDeptCode,
      form.acquisitionDate,
      suppliesMode,
    ],
  );
  const canPreview =
    !!form.categoryCode &&
    !!form.locationCode &&
    !!form.usingDeptCode &&
    !!form.acquisitionDate &&
    (!suppliesMode || (!!form.itemTypeCode && !!form.itemCode));

  const preview = useQuery({
    queryKey: queryKeys.assets.codePreview(previewQuery),
    queryFn: () => assetsApi.codePreview(previewQuery),
    enabled: canPreview,
    retry: false,
  });

  /*
   * 추가등록사항(세무 기록 13종).
   *
   * 회계 프로그램 고정자산등록화면에는 이 칸이 등록할 때부터 있다. 등록을 마치고
   * 상세에 들어가 다시 적게 하면 회계에서 하던 일이 두 번으로 갈린다
   * (한미화 책임 회신 2026-09-01). 등록에 필요한 항목은 아니라 비워 둬도 된다.
   *
   * 자산 만들기 요청에는 이 항목이 없어, 저장한 뒤 적힌 것이 있을 때만 한 번 더 보낸다.
   */
  const [tax, setTax] = useState<TaxFormState>(emptyTaxForm);
  const setTaxField = (key: string, v: string | boolean) =>
    setTax((prev) => ({ ...prev, [key]: v }));

  const create = useMutation({
    mutationFn: () => {
      const body: CreateAssetPayload = {
        name: form.name.trim(),
        categoryCode: form.categoryCode,
        itemTypeCode: suppliesMode ? form.itemTypeCode || undefined : undefined,
        itemCode: suppliesMode ? form.itemCode || undefined : undefined,
        locationCode: form.locationCode || undefined,
        usingDeptCode: form.usingDeptCode || undefined,
        managingDeptCode: form.managingDeptCode || undefined,
        accountId: Number(form.accountId),
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: Number(form.acquisitionCost),
        quantity: form.quantity ? Number(form.quantity) : undefined,
        expenseType: form.expenseType || undefined,
        depreciationMethod: method,
        usefulLifeYears: usefulLife ?? undefined,
        openingFiscalYear: form.openingFiscalYear ? Number(form.openingFiscalYear) : undefined,
        openingAccumulatedDepreciation: form.openingAccumulatedDepreciation
          ? Number(form.openingAccumulatedDepreciation)
          : undefined,
        status: form.status,
        excludedFromPrint: form.excludedFromPrint || undefined,
        supplier: form.supplier || undefined,
        assignee: form.assignee || undefined,
        modelName: form.modelName || undefined,
        spec: form.spec || undefined,
        equipmentCode: form.equipmentCode || undefined,
        instrumentMgmtNo: form.instrumentMgmtNo || undefined,
        remark: form.remark || undefined,
      };
      return assetsApi.create(body).then(async (asset) => {
        if (hasTaxInput(tax)) await assetsApi.updateTaxRecord(asset.id, taxBody(tax));
        return asset;
      });
    },
    onSuccess: (asset) => {
      toast.ok('자산을 등록했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
      navigate(`/assets/${asset.id}`);
    },
    onError: toast.fail,
  });

  const valid =
    form.name.trim() !== '' &&
    form.categoryCode !== '' &&
    form.accountId !== '' &&
    form.acquisitionDate !== '' &&
    form.acquisitionCost !== '';

  /** 계정과목을 고르면 기본 내용연수·허용 상각방법을 따라간다 */
  const onAccountChange = (value: string) => {
    const acc = (accounts.data ?? []).find((a) => a.id === Number(value));
    setForm((prev) => ({
      ...prev,
      accountId: value,
      usefulLifeYears:
        prev.usefulLifeYears ||
        (acc?.defaultUsefulLifeYears != null ? String(acc.defaultUsefulLifeYears) : ''),
      depreciationMethod: defaultMethod(accounts.data ?? [], Number(value)),
    }));
  };

  return (
    /* form-lg: 회계에서 보던 등록화면만큼 칸과 글자를 키운다 */
    <div className="form-lg space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onClick={() => navigate('/assets')}>
          ← 목록
        </button>
        <h1 className="text-[24px] font-semibold">자산 등록</h1>
      </div>

      <Section
        title="자산코드"
        right={
          <span className="text-[18px] text-fg-muted">
            일련번호는 저장 시 서버가 채번합니다
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-3 py-3">
          <span className="code text-[26px] font-semibold">
            {preview.data?.nextCode ?? (canPreview ? '조회 중…' : 'DV-··-···-·-··-···-··-··')}
          </span>
          {!canPreview && (
            <Badge tone="muted">자산구분·사용위치·사용부서·취득일자를 입력하면 미리보기</Badge>
          )}
          {preview.isError && <Badge tone="danger">코드 미리보기 실패</Badge>}
          {preview.data && <span className="text-[18px] text-fg-muted">앞 7단 {preview.data.prefix}</span>}
        </div>
      </Section>

      {/* 묶음 이름과 차례를 회계 프로그램 고정자산등록화면에 맞춘다 */}
      <h2 className="px-1 pt-1 text-[21px] font-semibold">주요등록사항</h2>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="분류">
          <div className="space-y-3 px-3 py-3">
            <Field label="자산구분" required>
              <select
                className={inputClass}
                value={form.categoryCode}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    categoryCode: v,
                    itemTypeCode: v === SUPPLIES_CATEGORY ? prev.itemTypeCode : '',
                    itemCode: v === SUPPLIES_CATEGORY ? prev.itemCode : '',
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
            <Field
              label="비품구분"
              hint={suppliesMode ? undefined : '비품(P05)일 때만 입력합니다.'}
            >
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
            <Field label="사용위치" hint="비우면 자산코드가 부여되지 않습니다.">
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
            <Field label="사용부서">
              <select
                className={inputClass}
                value={form.usingDeptCode}
                onChange={(e) => set('usingDeptCode', e.target.value)}
              >
                <option value="">선택</option>
                {(departments.data ?? []).map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.code} {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="관리부서" hint="비우면 사용부서와 동일하게 저장됩니다.">
              <select
                className={inputClass}
                value={form.managingDeptCode}
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
          </div>
        </Section>

        <Section title="회계">
          <div className="space-y-3 px-3 py-3">
            <Field label="자산명" required>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <Field label="계정과목" required>
              <select
                className={inputClass}
                value={form.accountId}
                onChange={(e) => onAccountChange(e.target.value)}
              >
                <option value="">선택</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="취득일자" required>
              <input
                type="date"
                className={inputClass}
                value={form.acquisitionDate}
                onChange={(e) => set('acquisitionDate', e.target.value)}
              />
            </Field>
            <Field label="취득가액" required>
              <input
                className={`${inputClass} num`}
                inputMode="numeric"
                value={form.acquisitionCost}
                onChange={(e) => set('acquisitionCost', e.target.value.replace(/[^\d]/g, ''))}
              />
            </Field>
            <Field label="수량">
              <input
                className={`${inputClass} num`}
                inputMode="numeric"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value.replace(/[^\d]/g, ''))}
              />
            </Field>
            <Field label="경비구분">
              <select
                className={inputClass}
                value={form.expenseType}
                onChange={(e) => set('expenseType', e.target.value as ExpenseType | '')}
              >
                <option value="">선택</option>
                {(Object.keys(EXPENSE_TYPE_LABEL) as ExpenseType[]).map((t) => (
                  <option key={t} value={t}>
                    {EXPENSE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="상각·관리">
          <div className="space-y-3 px-3 py-3">
            <Field label="상각방법" hint="계정과목이 허용하는 방법만 나옵니다.">
              <select
                className={inputClass}
                value={method}
                onChange={(e) => set('depreciationMethod', e.target.value as DepreciationMethod)}
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
            <Field
              label="상각률"
              hint={
                rate == null
                  ? '마스터에 등록되지 않은 조합입니다. 저장 시 서버 기본값이 적용됩니다.'
                  : '내용연수 × 상각방법으로 마스터에서 조회한 값 (읽기 전용)'
              }
            >
              <input className={`${inputClass} num`} value={rateText(rate)} readOnly disabled />
            </Field>
            <Field label="개시 기준연도" hint="ERP 이관 자산만 입력합니다.">
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
                  set('openingAccumulatedDepreciation', e.target.value.replace(/[^\d]/g, ''))
                }
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
          </div>
        </Section>
      </div>

      <Section title="관리 정보">
        <div className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="매입처">
            <input
              className={inputClass}
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
            />
          </Field>
          <Field label="담당자">
            <input
              className={inputClass}
              value={form.assignee}
              onChange={(e) => set('assignee', e.target.value)}
            />
          </Field>
          <Field label="모델명">
            <input
              className={inputClass}
              value={form.modelName}
              onChange={(e) => set('modelName', e.target.value)}
            />
          </Field>
          <Field label="규격">
            <input
              className={inputClass}
              value={form.spec}
              onChange={(e) => set('spec', e.target.value)}
            />
          </Field>
          <Field label="설비코드">
            <input
              className={inputClass}
              value={form.equipmentCode}
              onChange={(e) => set('equipmentCode', e.target.value)}
            />
          </Field>
          <Field label="계측기 관리번호">
            <input
              className={inputClass}
              value={form.instrumentMgmtNo}
              onChange={(e) => set('instrumentMgmtNo', e.target.value)}
            />
          </Field>
          <div className="col-span-2">
            <Field label="비고">
              <input
                className={inputClass}
                value={form.remark}
                onChange={(e) => set('remark', e.target.value)}
              />
            </Field>
          </div>
          <label className="sm:col-span-2 xl:col-span-3 flex w-fit items-center gap-2 text-[19px]">
            <input
              type="checkbox"
              checked={form.excludedFromPrint}
              onChange={(e) => set('excludedFromPrint', e.target.checked)}
            />
            목록표·스티커 출력에서 제외 (금형 등)
          </label>
        </div>
      </Section>

      <h2 className="px-1 pt-1 text-[21px] font-semibold">추가등록사항</h2>

      <Section title="세무 기록 13종">
        <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">
          {TAX_NOTE} 지금 비워 두고 나중에 자산 상세에서 적어도 됩니다.
        </p>
        <div className="px-3 py-3">
          <TaxRecordFields form={tax} onChange={setTaxField} />
        </div>
      </Section>

      {/* 저장줄은 맨 아래 한 자리에 둔다 — 어느 묶음에 딸린 단추인지 헷갈리지 않게 */}
      <div className="flex items-center justify-end gap-2 rounded-sm border border-line bg-surface px-3 py-2">
        <button
          type="button"
          className={btnClass}
          onClick={() => {
            setForm(initialForm());
            setTax(emptyTaxForm());
          }}
        >
          초기화
        </button>
        <button
          type="button"
          className={btnPrimaryClass}
          disabled={!valid || create.isPending}
          onClick={() => create.mutate()}
        >
          등록
        </button>
      </div>
    </div>
  );
}
