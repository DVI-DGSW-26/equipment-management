import { useMemo, useState, type ClipboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  gaugeRrApi,
  type GaugeRrDetail,
  type GaugeRrPlan,
  type SaveGaugeRrPayload,
} from '@/api/gaugeRr';
import { instrumentsApi } from '@/api/instruments';
import { queryKeys } from '@/api/queryKeys';
import { useDebounced } from '@/hooks/useDebounced';
import { getToday, toIsoDate } from '@/lib/date';
import {
  APPRAISER_LETTERS,
  APPRAISERS,
  badCellCount,
  blankGrid,
  EXCEED_LIMIT,
  fmtNum,
  gridFrom,
  isBlockPaste,
  estimateGrr,
  isNumberText,
  JUDGMENT_TONE,
  PARTS,
  pasteInto,
  toMeasurements,
  TRIALS,
  type Grid,
} from '@/domain/gaugeRr';
import Modal from '@/components/Modal';
import SearchSelect from '@/components/SearchSelect';
import { useToast } from '@/components/toastContext';
import { Badge, btnClass, btnPrimaryClass, Field, inputClass } from '@/components/ui';

/** 계측기 고르는 목록. 계측기 목록 화면과 같은 조회라 받아 둔 것을 함께 쓴다 */
const INSTRUMENT_QUERY = { page: 0, size: 500 };

/** 계획 고르는 칸의 한 줄 */
const planLabel = (p: GaugeRrPlan): string =>
  `NO.${p.seq} · ${p.partNo} ${p.product}${p.item ? ` (${p.item})` : ''} · ${p.plannedMonth}월 계획`;

/**
 * 게이지 R&R 등록·수정.
 *
 * 양식의 파란 칸만 받는다. 양식은 측정자 3명 × 반복 3회 × 시료 10개로 고정이다.
 * 측정값을 칠 때마다 찬 칸만으로 낸 임시 %R&R·ndc 를 보여 주고(화면 계산),
 * 90칸이 다 차면 서버의 미리보기(저장 안 함) 값으로 바꾼다. 머리 정보는 계산에 들지 않아 비어 있어도 된다.
 * %R&R 이 10 을 넘으면 사유 칸을 띄운다 — 사유 없이는 서버가 저장을 막는다.
 * 사유 요구·판정은 서버 값으로만 한다. 임시 값은 보기용이다.
 * 수정도 양식을 통째로 다시 보낸다(PATCH 이지만 부분 수정이 아니다).
 */
export default function GaugeRrModal({
  study,
  plan,
  onClose,
}: {
  /** 없으면 새로 등록 */
  study?: GaugeRrDetail;
  /** 계획표에서 [실적 등록] 으로 열었을 때. 그 계획에 잇고 머리 정보를 채워 둔다 */
  plan?: GaugeRrPlan;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    instrumentId:
      study != null
        ? study.instrumentId != null
          ? String(study.instrumentId)
          : ''
        : plan?.instrumentId != null
          ? String(plan.instrumentId)
          : '',
    planId: study?.planId != null ? String(study.planId) : plan ? String(plan.id) : '',
    partNumber: study?.partNumber ?? plan?.partNo ?? '',
    partName: study?.partName ?? plan?.product ?? '',
    characteristicClass: study?.characteristicClass ?? '일반',
    specLower: study?.specLower != null ? String(study.specLower) : '',
    specUpper: study?.specUpper != null ? String(study.specUpper) : '',
    gageName: study?.gageName ?? plan?.gageName ?? '',
    gageNumber: study?.gageNumber ?? plan?.gageSerial ?? '',
    gageType: study?.gageType ?? '',
    performedDate: study?.performedDate ?? toIsoDate(getToday()),
    remark: study?.remark ?? '',
    exceedReason: study?.exceedReason ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  /* 예전 기록은 2명·5개처럼 작을 수 있다. 3·3·10 으로 늘려 두고 빈칸을 채우게 한다 */
  const [appraisers, setAppraisers] = useState<string[]>(() =>
    Array.from({ length: APPRAISERS }, (_, i) => study?.appraisers[i] ?? ''),
  );
  const [grid, setGrid] = useState<Grid>(() =>
    blankGrid(study ? gridFrom(study.measurements) : []),
  );
  const oldShape =
    study != null &&
    (study.appraisers.length !== APPRAISERS || study.trials !== TRIALS || study.parts !== PARTS);
  /* 저장을 눌러 본 뒤에만 빈칸을 빨갛게 칠한다. 처음부터 칠하면 온통 빨갛다 */
  const [tried, setTried] = useState(false);

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

  /* 계측기를 고르면 게이지 칸을 그 계측기 정보로 채운다. 채운 뒤에 고쳐 쓸 수 있다 */
  const pickInstrument = (value: string) => {
    set('instrumentId', value);
    const i = instruments.data?.items.find((x) => String(x.id) === value);
    if (!i) return;
    setForm((p) => ({
      ...p,
      instrumentId: value,
      gageName: i.name,
      gageNumber: i.serialNo ?? '',
      gageType: i.specText ?? '',
    }));
  };

  /* 해제하면 계측기에서 채운 칸도 비운다 — 남겨 두면 대장 값이 손으로 적은 것처럼 남는다 */
  const unlinkInstrument = () =>
    setForm((p) => ({ ...p, instrumentId: '', gageName: '', gageNumber: '', gageType: '' }));

  /* ---------- 계획 연결 ---------- */

  /* 시행일의 해 계획표에서 고른다. 다른 기록이 이미 이어진 줄은 고를 수 없다(409) */
  const planYear = Number(form.performedDate.slice(0, 4)) || getToday().getFullYear();
  const plans = useQuery({
    queryKey: queryKeys.gaugeRr.plans(planYear),
    queryFn: () => gaugeRrApi.plans(planYear),
  });
  const planOptions = (plans.data ?? []).filter(
    (p) => !p.done || p.studyId === study?.id || String(p.id) === form.planId,
  );
  /* 지금 이어진 계획이 고른 해 목록에 없을 수 있다(시행일을 다른 해로 고친 경우) */
  const planMissing =
    form.planId !== '' && plans.data != null && !plans.data.some((p) => String(p.id) === form.planId);

  /*
   * 계획을 고르면 품번·품명·게이지를 그 계획으로 채운다. 채운 뒤에 고쳐 쓸 수 있다.
   * 계획에 계측기가 이어져 있으면 그 계측기를 고른다 — R&R 은 그 계측기의 이력이 된다.
   */
  const pickPlan = (value: string) => {
    const p = plans.data?.find((x) => String(x.id) === value);
    const i =
      p?.instrumentId != null
        ? instruments.data?.items.find((x) => x.id === p.instrumentId)
        : undefined;
    setForm((prev) =>
      p
        ? {
            ...prev,
            planId: value,
            partNumber: p.partNo,
            partName: p.product,
            instrumentId: p.instrumentId != null ? String(p.instrumentId) : prev.instrumentId,
            gageName: p.gageName,
            gageNumber: p.gageSerial ?? prev.gageNumber,
            gageType: i?.specText ?? prev.gageType,
          }
        : { ...prev, planId: value },
    );
  };

  /* ---------- 측정값 ---------- */

  const setCell = (a: number, t: number, p: number, v: string) =>
    setGrid((g) => {
      const next = g.map((x) => x.map((y) => [...y]));
      next[a][t][p] = v;
      return next;
    });

  const onPaste = (a: number, t: number, p: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!isBlockPaste(text)) return;
    e.preventDefault();
    setGrid((g) => pasteInto(g, { a, t, p }, text));
  };

  /* ---------- 검사 ---------- */

  const specText = (s: string) => s.trim() === '' || isNumberText(s);
  const errors: string[] = [];
  if (!form.partNumber.trim()) errors.push('품번(Part Number)을 입력하세요.');
  if (!form.partName.trim()) errors.push('품명(Part Name)을 입력하세요.');
  /* 계측기를 이으면 게이지 이름은 서버가 대장 값으로 채운다 */
  if (!form.instrumentId && !form.gageName.trim())
    errors.push('계측기를 고르거나 게이지 이름을 입력하세요.');
  if (!form.performedDate) errors.push('시행일을 입력하세요.');
  if (appraisers.some((n) => !n.trim())) errors.push('측정자 이름 3명을 모두 입력하세요.');
  if (!specText(form.specLower) || !specText(form.specUpper)) errors.push('규격은 숫자로 입력하세요.');
  else if (
    form.specLower.trim() &&
    form.specUpper.trim() &&
    Number(form.specLower) >= Number(form.specUpper)
  )
    errors.push('규격 상한은 하한보다 커야 합니다.');
  const bad = badCellCount(grid);
  if (bad > 0) errors.push(`측정값 ${bad}칸이 비었거나 숫자가 아닙니다.`);

  /** 서버로 보낼 본문. 검사를 다 통과했을 때만 만든다 */
  const body = ((): SaveGaugeRrPayload | null => {
    const measurements = errors.length === 0 ? toMeasurements(grid) : null;
    if (!measurements) return null;
    const opt = (s: string) => (s.trim() === '' ? undefined : s.trim());
    return {
      instrumentId: form.instrumentId ? Number(form.instrumentId) : undefined,
      planId: form.planId ? Number(form.planId) : undefined,
      partNumber: form.partNumber.trim(),
      partName: form.partName.trim(),
      characteristicClass: opt(form.characteristicClass),
      specLower: opt(form.specLower) != null ? Number(form.specLower) : undefined,
      specUpper: opt(form.specUpper) != null ? Number(form.specUpper) : undefined,
      gageName: opt(form.gageName),
      gageNumber: opt(form.gageNumber),
      gageType: opt(form.gageType),
      appraisers: appraisers.map((n) => n.trim()),
      performedDate: form.performedDate,
      remark: opt(form.remark),
      exceedReason: opt(form.exceedReason),
      measurements,
    };
  })();

  /* ---------- 미리보기 ---------- */

  /*
   * 계산에 드는 것은 측정값·규격·측정자 수뿐이다. 품번·게이지 같은 머리 정보를 다 채울 때까지
   * 기다리지 않도록, 미리보기에는 계산에 드는 것만 담고 나머지는 자리 값으로 채워 보낸다
   * (서버가 등록과 같은 검사를 하므로 빈 값은 못 보낸다).
   * 계산에 들지 않는 칸은 키에서 빠지니 그 칸을 칠 때마다 다시 묻지 않는다. 손이 멎은 뒤에 한 번만 보낸다.
   */
  const filledCells = APPRAISERS * TRIALS * PARTS - bad;
  /* 90칸이 차기 전, 또는 서버 값이 오기 전까지 보여 줄 임시 값 */
  const estimate = useMemo(() => estimateGrr(grid), [grid]);
  const calcMeasurements = toMeasurements(grid);
  const calcKey = ((): string | null => {
    if (!calcMeasurements) return null;
    const num = (s: string) => (s.trim() !== '' && isNumberText(s) ? Number(s) : undefined);
    let specLower = num(form.specLower);
    let specUpper = num(form.specUpper);
    if (specLower != null && specUpper != null && specLower >= specUpper)
      specLower = specUpper = undefined;
    const calcBody: SaveGaugeRrPayload = {
      partNumber: '-',
      partName: '-',
      gageName: '-',
      specLower,
      specUpper,
      appraisers: appraisers.map((n, i) => n.trim() || `측정자 ${APPRAISER_LETTERS[i]}`),
      performedDate: toIsoDate(getToday()),
      measurements: calcMeasurements,
    };
    return JSON.stringify(calcBody);
  })();
  const settledKey = useDebounced(calcKey, 400);
  const preview = useQuery({
    queryKey: ['gauge-rr', 'preview', settledKey],
    queryFn: () => gaugeRrApi.preview(JSON.parse(settledKey as string) as SaveGaugeRrPayload),
    enabled: settledKey != null,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  });
  /* 입력이 바뀌어 아직 다시 계산하지 않았으면 예전 결과는 흐리게 */
  const stale = calcKey !== settledKey || preview.isFetching;
  const result = calcKey != null ? preview.data : undefined;

  const exceeded =
    result?.exceeded ?? (result != null && result.results.pctGrr > EXCEED_LIMIT);
  const needReason = exceeded && form.exceedReason.trim() === '';
  if (needReason) errors.push(`%R&R 이 ${EXCEED_LIMIT}% 를 넘었습니다. 사유를 입력하세요.`);

  const save = useMutation({
    mutationFn: () => {
      if (!body) throw new Error('입력값을 확인해 주세요.');
      return study ? gaugeRrApi.update(study.id, body) : gaugeRrApi.create(body);
    },
    onSuccess: (saved) => {
      /* 응답에 계산 결과까지 와 있다 — 상세를 다시 묻지 않고 바로 채운다 */
      qc.setQueryData(queryKeys.gaugeRr.detail(saved.id), saved);
      /* 계획표의 실적 칸도 같은 키 아래라 함께 다시 받는다 */
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
      toast.ok(study ? '수정했습니다.' : '등록했습니다.');
      onClose();
      if (!study) navigate(`/gauge-rr/${saved.id}`);
    },
    onError: toast.fail,
  });

  const submit = () => {
    setTried(true);
    if (errors.length === 0) save.mutate();
  };

  return (
    <Modal
      title={study ? '게이지 R&R 수정' : '게이지 R&R 등록'}
      width={1180}
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
      <div className="space-y-4">
        {/* ---------- 계획 연결 ---------- */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Field
              label={`연간 계획 연결 (${planYear}년)`}
              hint="고르면 이 기록이 그 계획의 실적이 되고, 품번·품명·게이지를 계획으로 채웁니다."
            >
              <select
                className={inputClass}
                value={form.planId}
                onChange={(e) => pickPlan(e.target.value)}
              >
                <option value="">연결하지 않음</option>
                {planMissing && <option value={form.planId}>다른 해 계획 (지금 연결됨)</option>}
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {planLabel(p)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field
              label="계측기 연결"
              hint="고르면 이 R&R 이 그 계측기의 이력으로 남고, 게이지 이름·번호는 대장 값을 씁니다. 대장에 없는 게이지면 비워 두고 직접 적습니다."
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
                {form.instrumentId !== '' && (
                  <button type="button" className={btnClass} onClick={unlinkInstrument}>
                    연결 해제
                  </button>
                )}
              </div>
            </Field>
          </div>
        </div>

        {/* ---------- 머리 정보 ---------- */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 md:grid-cols-4">
          <Field label="품번 (Part Number)" required hint="도면·고객사 부품 번호. 계획을 고르면 채워집니다.">
            <input
              className={`${inputClass} code`}
              value={form.partNumber}
              onChange={(e) => set('partNumber', e.target.value)}
            />
          </Field>
          <Field label="품명 (Part Name)" required>
            <input
              className={inputClass}
              value={form.partName}
              onChange={(e) => set('partName', e.target.value)}
            />
          </Field>
          <Field label="시행일 (Date Performed)" required>
            <input
              type="date"
              className={inputClass}
              value={form.performedDate}
              onChange={(e) => set('performedDate', e.target.value)}
            />
          </Field>
          <Field label="특성 분류">
            <input
              className={inputClass}
              value={form.characteristicClass}
              onChange={(e) => set('characteristicClass', e.target.value)}
              placeholder="일반"
            />
          </Field>

          {/* 계측기를 이으면 이름·번호는 서버가 대장 값으로 채운다 — 적어도 무시되므로 잠근다 */}
          <Field label="게이지 이름 (Gage Name)" required={!form.instrumentId}>
            <input
              className={inputClass}
              value={form.gageName}
              disabled={form.instrumentId !== ''}
              onChange={(e) => set('gageName', e.target.value)}
              placeholder="Micrometer"
            />
          </Field>
          <Field label="게이지 번호 (Gage Number)">
            <input
              className={`${inputClass} code`}
              value={form.gageNumber}
              disabled={form.instrumentId !== ''}
              onChange={(e) => set('gageNumber', e.target.value)}
            />
          </Field>
          <Field label="게이지 규격 (Gage Type)">
            <input
              className={inputClass}
              value={form.gageType}
              onChange={(e) => set('gageType', e.target.value)}
              placeholder="0~25mm"
            />
          </Field>
          <Field label="규격 (하한 ~ 상한)" hint="넣으면 공차 대비 %R&R 도 계산합니다.">
            <div className="flex items-center gap-1">
              <input
                className={`${inputClass} num`}
                inputMode="decimal"
                value={form.specLower}
                onChange={(e) => set('specLower', e.target.value)}
                placeholder="하한"
              />
              <span className="text-fg-muted">~</span>
              <input
                className={`${inputClass} num`}
                inputMode="decimal"
                value={form.specUpper}
                onChange={(e) => set('specUpper', e.target.value)}
                placeholder="상한"
              />
            </div>
          </Field>
        </div>

        {/* ---------- 측정자 ---------- */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 md:grid-cols-4">
          {appraisers.map((name, i) => (
            <Field key={i} label={`측정자 ${APPRAISER_LETTERS[i]}`} required>
              <input
                className={inputClass}
                value={name}
                onChange={(e) =>
                  setAppraisers((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                }
              />
            </Field>
          ))}
          <p className="self-end pb-1.5 text-[17px] text-fg-muted">
            측정자 {APPRAISERS}명 · 반복 {TRIALS}회 · 시료 {PARTS}개 고정
          </p>
        </div>

        {/* ---------- 측정값 ---------- */}
        <div className="border-t border-line pt-3">
          {oldShape && (
            <p className="mb-2 rounded-sm border border-warn/40 bg-warn/10 px-3 py-1.5 text-[17px] text-warn">
              예전 양식({study?.appraisers.length}명·{study?.trials}회·{study?.parts}개)으로 적은
              기록입니다. 지금 양식은 {APPRAISERS}명·{TRIALS}회·{PARTS}개라 빈칸을 채워야 저장됩니다.
            </p>
          )}
          <p className="mb-1 text-[17px] text-fg-muted">
            엑셀에서 측정값을 복사해 첫 칸에 붙여넣으면 한꺼번에 채워집니다. 양식의 C18:L32 처럼
            AVE·R 줄이 섞여 있어도 걸러 냅니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-[17px]">
              <thead>
                <tr className="bg-bg text-fg-sub">
                  <th className="border border-line px-2 py-1">측정자</th>
                  <th className="border border-line px-2 py-1">회</th>
                  {Array.from({ length: PARTS }, (_, p) => (
                    <th key={p} className="border border-line px-2 py-1">
                      {p + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((rows, a) =>
                  rows.map((cells, t) => (
                    <tr key={`${a}-${t}`} className={t === 0 && a > 0 ? 'border-t-2 border-fg-muted' : ''}>
                      {t === 0 && (
                        <th
                          rowSpan={TRIALS}
                          className="border border-line bg-bg px-2 py-1 font-medium"
                        >
                          {APPRAISER_LETTERS[a]}
                          <div className="text-[15px] font-normal text-fg-muted">
                            {appraisers[a] || '-'}
                          </div>
                        </th>
                      )}
                      <td className="border border-line px-2 py-1 text-center text-fg-muted">
                        {t + 1}
                      </td>
                      {cells.map((v, p) => {
                        const wrong = (tried && v.trim() === '') || (v.trim() !== '' && !isNumberText(v));
                        return (
                          <td key={p} className="border border-line p-0">
                            <input
                              className={`num w-20 bg-transparent px-1.5 py-1 text-right outline-none focus:bg-accent/5 ${
                                wrong ? 'bg-danger/10 text-danger' : ''
                              }`}
                              inputMode="decimal"
                              value={v}
                              aria-label={`측정자 ${APPRAISER_LETTERS[a]} ${t + 1}회 ${p + 1}번 시료`}
                              onChange={(e) => setCell(a, t, p, e.target.value)}
                              onPaste={onPaste(a, t, p)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- 계산 결과 (미리보기) ---------- */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-sm border border-line bg-bg px-3 py-2 text-[18px]">
          <span className="font-medium text-fg-sub">계산 결과</span>
          {calcKey != null && preview.isError && !stale ? (
            <span className="text-danger">
              계산하지 못했습니다 — {preview.error instanceof Error ? preview.error.message : ''}
            </span>
          ) : calcKey == null || result == null ? (
            estimate ? (
              <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span>
                  %R&amp;R{' '}
                  <b className={`num ${estimate.pctGrr > EXCEED_LIMIT ? 'text-danger' : ''}`}>
                    {fmtNum(estimate.pctGrr, 2)}%
                  </b>
                </span>
                <span>
                  ndc <b className="num">{fmtNum(estimate.ndc, 2)}</b>
                </span>
                <span className="text-fg-sub">
                  EV {fmtNum(estimate.ev, 4)} · AV {fmtNum(estimate.av, 4)} · PV{' '}
                  {fmtNum(estimate.pv, 4)}
                </span>
                <Badge tone="muted">임시</Badge>
                <span className="text-fg-muted">
                  {calcKey == null
                    ? `측정값 ${filledCells} / ${APPRAISERS * TRIALS * PARTS}칸 — 다 채우면 확정됩니다`
                    : '확정 값 계산 중…'}
                </span>
              </span>
            ) : (
              <span className="text-fg-muted">
                측정값 {filledCells} / {APPRAISERS * TRIALS * PARTS}칸 — 같은 시료를 2회 이상, 시료
                2개 이상 넣으면 값이 보이기 시작합니다.
              </span>
            )
          ) : (
            <span className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${stale ? 'opacity-50' : ''}`}>
              <span>
                %R&amp;R{' '}
                <b className={`num ${exceeded ? 'text-danger' : ''}`}>
                  {fmtNum(result.results.pctGrr, 2)}%
                </b>
              </span>
              <span>
                ndc <b className="num">{fmtNum(result.results.ndc, 2)}</b>
              </span>
              <span className="text-fg-sub">
                EV {fmtNum(result.results.ev, 4)} · AV {fmtNum(result.results.av, 4)} · PV{' '}
                {fmtNum(result.results.pv, 4)}
              </span>
              <Badge tone={JUDGMENT_TONE[result.judgment]}>{result.judgmentLabel}</Badge>
              {stale && <span className="text-fg-muted">다시 계산 중…</span>}
            </span>
          )}
        </div>

        {(exceeded || form.exceedReason !== '') && (
          <Field
            label={`%R&R ${EXCEED_LIMIT}% 초과 사유`}
            required={exceeded}
            error={tried && needReason ? '사유를 입력해야 저장됩니다.' : undefined}
            hint={
              exceeded
                ? `%R&R 이 ${EXCEED_LIMIT}% 를 넘었습니다. 사유를 적어야 저장됩니다.`
                : `지금 값은 ${EXCEED_LIMIT}% 이하라 사유가 없어도 됩니다.`
            }
          >
            <input
              className={`${inputClass} ${exceeded ? 'border-danger/60' : ''}`}
              value={form.exceedReason}
              onChange={(e) => set('exceedReason', e.target.value)}
              maxLength={500}
            />
          </Field>
        )}

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
