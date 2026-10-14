import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gaugeRrApi, type GaugeRrPlan, type SaveGaugeRrPlanPayload } from '@/api/gaugeRr';
import { queryKeys } from '@/api/queryKeys';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Field, inputClass } from '@/components/ui';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 연간 계획표 한 줄 추가·수정.
 *
 * 계획만 다룬다. 실적은 R&R 기록을 등록할 때 이 줄을 골라 잇는다 — 여기서는 바꾸지 못한다.
 * NO 를 비우면 서버가 그 해의 다음 번호를 붙인다. 같은 해에 NO 가 겹치면 409 로 막힌다.
 * 수정에서는 연도를 바꿀 수 없다 (서버 규칙).
 */
export default function GaugeRrPlanModal({
  plan,
  year,
  onClose,
}: {
  /** 없으면 새로 추가 */
  plan?: GaugeRrPlan;
  /** 새로 추가할 때의 연도 — 계획표에서 보고 있던 해 */
  year: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    seq: plan ? String(plan.seq) : '',
    product: plan?.product ?? '',
    productSpec: plan?.productSpec ?? '',
    partNo: plan?.partNo ?? '',
    gageName: plan?.gageName ?? '',
    gageSerial: plan?.gageSerial ?? '',
    item: plan?.item ?? '',
    plannedMonth: plan ? String(plan.plannedMonth) : '',
    remark: plan?.remark ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const [tried, setTried] = useState(false);

  const planYear = plan?.planYear ?? year;

  const errors: string[] = [];
  if (!form.product.trim()) errors.push('제품(품명)을 입력하세요.');
  if (!form.partNo.trim()) errors.push('PART NO. 를 입력하세요.');
  if (!form.gageName.trim()) errors.push('GAGE 명을 입력하세요.');
  if (!form.plannedMonth) errors.push('계획월을 고르세요.');
  if (form.seq.trim() && !/^[1-9]\d*$/.test(form.seq.trim()))
    errors.push('NO 는 1 이상의 정수로 입력하세요.');

  const save = useMutation({
    mutationFn: () => {
      const opt = (s: string) => (s.trim() === '' ? undefined : s.trim());
      const body: SaveGaugeRrPlanPayload = {
        planYear,
        seq: opt(form.seq) != null ? Number(form.seq) : undefined,
        product: form.product.trim(),
        productSpec: opt(form.productSpec),
        partNo: form.partNo.trim(),
        gageName: form.gageName.trim(),
        gageSerial: opt(form.gageSerial),
        item: opt(form.item),
        plannedMonth: Number(form.plannedMonth),
        remark: opt(form.remark),
      };
      return plan ? gaugeRrApi.updatePlan(plan.id, body) : gaugeRrApi.createPlan(body);
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
      toast.ok(plan ? '계획을 수정했습니다.' : `NO.${saved.seq} 계획을 추가했습니다.`);
      onClose();
    },
    onError: toast.fail,
  });

  const submit = () => {
    setTried(true);
    if (errors.length === 0) save.mutate();
  };

  return (
    <Modal
      title={plan ? `${planYear}년 계획 수정 (NO.${plan.seq})` : `${planYear}년 계획 추가`}
      width={760}
      onClose={onClose}
      footer={
        <>
          {tried && errors.length > 0 && (
            <span className="mr-auto text-[17px] text-danger">{errors[0]}</span>
          )}
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending}
            onClick={submit}
          >
            {save.isPending ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="NO" hint={plan ? undefined : '비우면 다음 번호가 붙습니다.'}>
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.seq}
            onChange={(e) => set('seq', e.target.value)}
            placeholder={plan ? undefined : '자동'}
          />
        </Field>
        <Field label="계획월" required>
          <select
            className={inputClass}
            value={form.plannedMonth}
            onChange={(e) => set('plannedMonth', e.target.value)}
          >
            <option value="">고르세요</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </Field>
        <Field label="제품 (품명)" required>
          <input
            className={inputClass}
            value={form.product}
            onChange={(e) => set('product', e.target.value)}
            placeholder="INNER TUBE"
          />
        </Field>
        <Field label="제품 규격">
          <input
            className={inputClass}
            value={form.productSpec}
            onChange={(e) => set('productSpec', e.target.value)}
            placeholder="Ø20.5*Ø14.2*40"
          />
        </Field>
        <Field label="PART NO." required>
          <input
            className={`${inputClass} code`}
            value={form.partNo}
            onChange={(e) => set('partNo', e.target.value)}
          />
        </Field>
        <Field label="항목">
          <input
            className={inputClass}
            value={form.item}
            onChange={(e) => set('item', e.target.value)}
            placeholder="외경"
          />
        </Field>
        <Field label="GAGE 명" required>
          <input
            className={inputClass}
            value={form.gageName}
            onChange={(e) => set('gageName', e.target.value)}
            placeholder="Micrometer"
          />
        </Field>
        <Field label="S/NO.">
          <input
            className={`${inputClass} code`}
            value={form.gageSerial}
            onChange={(e) => set('gageSerial', e.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark}
              onChange={(e) => set('remark', e.target.value)}
              maxLength={500}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
