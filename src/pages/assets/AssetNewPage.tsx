import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useAccounts, useCategories, useDepartments, useItemTypes, useItems, useRates } from '@/hooks/useMasters';
import { isSuppliesItemEnabled, SUPPLIES_CATEGORY } from '@/domain/assetCode';
import { allowedMethods, defaultMethod, lookupRate } from '@/domain/depreciationMethod';
import { rateText } from '@/lib/won';
import { toIsoDate } from '@/lib/date';
import { useToast } from '@/components/toastContext';
import { emptyTaxForm, hasTaxInput, TAX_NOTE, taxBody, type TaxFormState } from '@/domain/taxRecord';
import TaxRecordFields from '@/components/TaxRecordFields';
import { btnClass, btnPrimaryClass, Field, inputClass, Section } from '@/components/ui';
import AmountInput from '@/components/AmountInput';
import HelpLink from '@/components/HelpLink';

interface FormState {
  name: string;
  categoryCode: string;
  itemTypeCode: string;
  itemCode: string;
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
  /** 수량만큼 비품도 함께 만들지 */
  createPhysicals: boolean;
  supplier: string;
  assignee: string;
  modelName: string;
  spec: string;
  accountingCode: string;
  instrumentMgmtNo: string;
  remark: string;
}

const initialForm = (): FormState => ({
  name: '',
  categoryCode: '',
  itemTypeCode: '',
  itemCode: '',
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
  createPhysicals: false,
  supplier: '',
  assignee: '',
  modelName: '',
  spec: '',
  accountingCode: '',
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
  const rates = useRates();
  const items = useItems(form.itemTypeCode || undefined, { enabled: isSuppliesItemEnabled(form.categoryCode) });

  const suppliesMode = isSuppliesItemEnabled(form.categoryCode);
  /** 함께 만들어질 비품 수. 수량을 비우면 서버가 1건으로 본다 */
  const physicalCount = Math.max(1, Number(form.quantity) || 1);
  const accountId = form.accountId ? Number(form.accountId) : null;
  const methods = allowedMethods(accounts.data ?? [], accountId);
  const method = (form.depreciationMethod || defaultMethod(accounts.data ?? [], accountId)) as DepreciationMethod;
  const usefulLife = form.usefulLifeYears ? Number(form.usefulLifeYears) : null;
  const rate = lookupRate(rates.data ?? [], usefulLife, method);

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
        usingDeptCode: form.usingDeptCode || undefined,
        managingDeptCode: form.managingDeptCode || undefined,
        accountId: Number(form.accountId),
        acquisitionDate: form.acquisitionDate,
        /* 회계 대장에 금액이 아직 없으면 비워 보낸다. 나중에 회계 정정으로 넣는다 */
        acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
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
        /* 비품 계정만 비품 대장으로 쪼갠다. 기계장치는 1건이 곧 1대라 만들 것이 없다 */
        createPhysicals: suppliesMode && form.createPhysicals ? true : undefined,
        supplier: form.supplier || undefined,
        assignee: form.assignee || undefined,
        modelName: form.modelName || undefined,
        spec: form.spec || undefined,
        accountingCode: form.accountingCode.trim() || undefined,
        instrumentMgmtNo: form.instrumentMgmtNo || undefined,
        remark: form.remark || undefined,
      };
      return assetsApi.create(body).then(async (asset) => {
        if (hasTaxInput(tax)) await assetsApi.updateTaxRecord(asset.id, taxBody(tax));
        return asset;
      });
    },
    onSuccess: (asset) => {
      toast.ok(
        suppliesMode && form.createPhysicals
          ? `자산을 등록하고 비품 ${physicalCount}건을 함께 만들었습니다.`
          : '자산을 등록했습니다.',
      );
      void qc.invalidateQueries({ queryKey: queryKeys.assets.all });
      /* 함께 만들어진 비품이 비품 목록에 바로 보이게 */
      void qc.invalidateQueries({ queryKey: queryKeys.physicalAssets.all });
      navigate(`/assets/${asset.id}`);
    },
    onError: toast.fail,
  });

  const valid =
    form.name.trim() !== '' &&
    form.categoryCode !== '' &&
    form.accountId !== '' &&
    form.acquisitionDate !== '';

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
        <h1 className="text-[24px] font-semibold">자산 등록 <HelpLink topic="assetNew" /></h1>
      </div>


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
            <Field
              label="취득가액"
              hint="회계 대장에 금액이 아직 없으면 비워 둡니다. 금액이 들어올 때까지 감가상각·합계에서 빠집니다."
            >
              <AmountInput
                className={inputClass}
                value={form.acquisitionCost}
                onChange={(v) => set('acquisitionCost', v)}
              />
            </Field>
            <Field label="수량">
              <AmountInput
                className={inputClass}
                value={form.quantity}
                onChange={(v) => set('quantity', v)}
              />
            </Field>

            {/*
              비품만 낸다. 여러 개를 한 건으로 산 비품은 고정자산 1건에 비품 여러 건이고,
              기계장치·시설장치는 1건이 곧 1대라 쪼갤 것이 없다.
            */}
            {suppliesMode && (
              <label className="flex w-fit items-start gap-2 text-[19px]">
                <input
                  type="checkbox"
                  className="mt-1.5"
                  checked={form.createPhysicals}
                  onChange={(e) => set('createPhysicals', e.target.checked)}
                />
                <span>
                  수량만큼 비품도 함께 만들기
                  <span className="block text-[17px] text-fg-muted">
                    비품 {physicalCount}건이 위치·자산코드 없이 만들어집니다. 비품 화면에서 위치를
                    넣으면 그때 자산코드가 붙습니다. 개당 구입금액도 비워 둡니다.
                  </span>
                </span>
              </label>
            )}
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
                  ? '기본설정에 등록되지 않은 조합입니다. 저장 시 서버 기본값이 적용됩니다.'
                  : '내용연수 × 상각방법으로 기본설정에서 조회한 값 (읽기 전용)'
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
              <AmountInput
                className={inputClass}
                value={form.openingAccumulatedDepreciation}
                onChange={(v) => set('openingAccumulatedDepreciation', v)}
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
          {/*
            고정자산의 자산코드는 회계 프로그램의 것 하나다. 8단 자산코드는 비품·사내 설비가 맡는다
            (백엔드 2026-10-29). 설비코드는 사내 설비 화면에서 이 자산에 설비를 연결해 붙인다.
          */}
          <Field label="회계 자산코드" hint="회계 프로그램의 자산코드(계정별 6자리). 선택 항목입니다">
            <input
              className={`${inputClass} code`}
              placeholder="예: 000001"
              maxLength={10}
              value={form.accountingCode}
              onChange={(e) => set('accountingCode', e.target.value.trim())}
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
            목록표 출력에서 제외 (금형 등)
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
