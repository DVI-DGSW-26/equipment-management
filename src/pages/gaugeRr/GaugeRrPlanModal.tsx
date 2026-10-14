import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gaugeRrApi, type GaugeRrPlan, type SaveGaugeRrPlanPayload } from '@/api/gaugeRr';
import { instrumentsApi } from '@/api/instruments';
import { queryKeys } from '@/api/queryKeys';
import Modal from '@/components/Modal';
import SearchSelect from '@/components/SearchSelect';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Field, inputClass } from '@/components/ui';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 계측기 고르는 목록. 계측기 목록 화면·R&R 등록 창과 같은 조회라 받아 둔 것을 함께 쓴다 */
const INSTRUMENT_QUERY = { page: 0, size: 500 };

/**
 * 점검 횟수 빠른 선택. 횟수는 회사 사정에 따라 달라 사람이 정한다 (요청 2026-10-14) —
 * 과장님 기준 예시는 두 달에 한 번, 연 6회다. 고른 뒤 달을 하나씩 더하거나 뺄 수 있다.
 */
const PRESETS: { label: string; months: number[] }[] = [
  { label: '연 1회', months: [1] },
  { label: '반기 (연 2회)', months: [1, 7] },
  { label: '분기 (연 4회)', months: [1, 4, 7, 10] },
  { label: '2개월마다 (연 6회)', months: [1, 3, 5, 7, 9, 11] },
  { label: '매월 (연 12회)', months: MONTHS },
];

/**
 * 연간 계획표 줄 추가·수정.
 *
 * 계획만 다룬다. 실적은 R&R 기록을 등록할 때 이 줄을 골라 잇는다 — 여기서는 바꾸지 못한다.
 * NO 를 비우면 서버가 그 해의 다음 번호를 붙인다. 같은 해에 NO 가 겹치면 409 로 막힌다.
 * 수정에서는 연도를 바꿀 수 없다 (서버 규칙).
 *
 * 서버의 계획 줄은 계획월이 하나다. 한 품목을 한 해에 여러 번 점검하면 고른 달마다 줄을
 * 하나씩 만든다 — 실적도 회차마다 따로 잇는다. 수정은 그 줄 하나의 달만 바꾼다.
 *
 * 게이지는 계측기 대장에서 고른다. R&R 은 계측기를 평가하는 일이라 결과가 대장과 이어져야
 * 한다. 고르면 GAGE 명·S/NO 는 서버가 대장 값으로 채우므로 칸을 잠근다. 대장에 없는
 * 게이지는 고르지 않고 손으로 적는다 (필수 여부는 품질팀 확인 전이라 선택으로 둔다).
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
    instrumentId: plan?.instrumentId != null ? String(plan.instrumentId) : '',
    seq: plan ? String(plan.seq) : '',
    product: plan?.product ?? '',
    productSpec: plan?.productSpec ?? '',
    partNo: plan?.partNo ?? '',
    gageName: plan?.gageName ?? '',
    gageSerial: plan?.gageSerial ?? '',
    item: plan?.item ?? '',
    remark: plan?.remark ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  /** 점검할 달. 수정은 그 줄 하나라 한 달만 */
  const [months, setMonths] = useState<number[]>(plan ? [plan.plannedMonth] : []);
  const toggleMonth = (m: number) =>
    setMonths((prev) =>
      plan
        ? [m]
        : prev.includes(m)
          ? prev.filter((x) => x !== m)
          : [...prev, m].sort((a, b) => a - b),
    );
  const [tried, setTried] = useState(false);

  const planYear = plan?.planYear ?? year;

  const instruments = useQuery({
    queryKey: queryKeys.instruments.list(INSTRUMENT_QUERY),
    queryFn: () => instrumentsApi.list(INSTRUMENT_QUERY),
    staleTime: 5 * 60_000,
  });
  const instrumentOptions = useMemo(
    () =>
      (instruments.data?.items ?? []).map((i) => ({
        value: String(i.id),
        label: `${i.name} (${i.mgmtNo})`,
        hint: [i.serialNo, i.specText].filter(Boolean).join(' · '),
      })),
    [instruments.data],
  );

  /* 고르면 대장 값을 보여 준다. 저장할 때는 서버가 같은 값으로 채운다 */
  const pickInstrument = (value: string) => {
    const i = instruments.data?.items.find((x) => String(x.id) === value);
    setForm((p) => ({
      ...p,
      instrumentId: value,
      gageName: i ? i.name : p.gageName,
      gageSerial: i ? (i.serialNo ?? '') : p.gageSerial,
    }));
  };
  const linked = form.instrumentId !== '';

  const errors: string[] = [];
  if (!form.product.trim()) errors.push('제품을 입력하세요.');
  if (!form.partNo.trim()) errors.push('PART NO. 를 입력하세요.');
  if (!linked && !form.gageName.trim())
    errors.push('게이지(계측기)를 고르거나 GAGE 명을 입력하세요.');
  if (months.length === 0) errors.push('점검할 달을 고르세요.');
  if (form.seq.trim() && !/^[1-9]\d*$/.test(form.seq.trim()))
    errors.push('NO 는 1 이상의 정수로 입력하세요.');
  /* 여러 줄을 한꺼번에 만들 때 NO 를 하나로 정하면 둘째 줄부터 409 다 */
  if (!plan && months.length > 1 && form.seq.trim())
    errors.push('여러 달을 고르면 NO 는 비워 두세요. 차례로 붙습니다.');

  const save = useMutation({
    mutationFn: async (): Promise<GaugeRrPlan[]> => {
      const opt = (s: string) => (s.trim() === '' ? undefined : s.trim());
      const body = (plannedMonth: number): SaveGaugeRrPlanPayload => ({
        planYear,
        seq: opt(form.seq) != null ? Number(form.seq) : undefined,
        product: form.product.trim(),
        productSpec: opt(form.productSpec),
        partNo: form.partNo.trim(),
        instrumentId: linked ? Number(form.instrumentId) : undefined,
        gageName: opt(form.gageName),
        gageSerial: opt(form.gageSerial),
        item: opt(form.item),
        plannedMonth,
        remark: opt(form.remark),
      });
      if (plan) return [await gaugeRrApi.updatePlan(plan.id, body(months[0]))];
      /* 차례로 보낸다 — 한꺼번에 보내면 자동 번호가 엉킬 수 있다 */
      const saved: GaugeRrPlan[] = [];
      for (const m of months) saved.push(await gaugeRrApi.createPlan(body(m)));
      return saved;
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
      toast.ok(
        plan
          ? '계획을 수정했습니다.'
          : saved.length === 1
            ? `NO.${saved[0].seq} 계획을 추가했습니다.`
            : `계획 ${saved.length}줄을 추가했습니다 (NO.${saved[0].seq}~${saved[saved.length - 1].seq}).`,
      );
      onClose();
    },
    onError: (e) => {
      /* 여러 줄 중 일부만 들어갔을 수 있다. 들어간 것은 목록에 보이게 다시 받는다 */
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
      toast.fail(e);
    },
  });

  const submit = () => {
    setTried(true);
    if (errors.length === 0) save.mutate();
  };

  return (
    <Modal
      title={plan ? `${planYear}년 계획 수정 (NO.${plan.seq})` : `${planYear}년 계획 추가`}
      width={820}
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
        <Field label="제품" required>
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
        <div className="md:col-span-2">
          <Field
            label="게이지 (계측기)"
            hint={
              linked
                ? 'GAGE 명·S/NO. 는 계측기 대장 값을 씁니다. 대장에서 고치면 다음 복사 때 따라옵니다.'
                : '계측기 대장에서 고릅니다. 대장에 없는 게이지면 비워 두고 아래에 직접 적습니다.'
            }
          >
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchSelect
                  value={form.instrumentId}
                  onChange={pickInstrument}
                  options={instrumentOptions}
                  loading={instruments.isPending}
                  placeholder="계측기명 · 관리번호 · S/NO 로 찾기"
                />
              </div>
              {linked && (
                <button
                  type="button"
                  className={btnClass}
                  onClick={() => set('instrumentId', '')}
                >
                  연결 해제
                </button>
              )}
            </div>
          </Field>
        </div>
        <Field label="GAGE 명" required={!linked}>
          <input
            className={inputClass}
            value={form.gageName}
            disabled={linked}
            onChange={(e) => set('gageName', e.target.value)}
            placeholder="Micrometer"
          />
        </Field>
        <Field label="S/NO.">
          <input
            className={`${inputClass} code`}
            value={form.gageSerial}
            disabled={linked}
            onChange={(e) => set('gageSerial', e.target.value)}
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label={plan ? '계획월' : `점검할 달 (연 ${months.length}회)`}
            required
            hint={
              plan
                ? '이 줄 하나의 달을 바꿉니다.'
                : '고른 달마다 계획 줄이 하나씩 생깁니다. 실적도 회차마다 따로 잇습니다.'
            }
          >
            {!plan && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={btnClass}
                    onClick={() => setMonths(p.months)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-6 gap-1 md:grid-cols-12">
              {MONTHS.map((m) => {
                const on = months.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleMonth(m)}
                    className={`rounded-sm border py-1.5 text-[18px] ${
                      on
                        ? 'border-accent bg-accent text-white'
                        : 'border-line bg-surface text-fg-sub hover:bg-bg'
                    }`}
                  >
                    {m}월
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <Field
          label="NO"
          hint={plan ? undefined : '비우면 다음 번호가 붙습니다. 여러 달이면 차례로 붙습니다.'}
        >
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.seq}
            onChange={(e) => set('seq', e.target.value)}
            placeholder={plan ? undefined : '자동'}
          />
        </Field>
        <Field label="비고">
          <input
            className={inputClass}
            value={form.remark}
            onChange={(e) => set('remark', e.target.value)}
            maxLength={500}
          />
        </Field>
      </div>
    </Modal>
  );
}
