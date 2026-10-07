import { useMemo, useState, type ClipboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gaugeRrApi, type GaugeRrDetail, type SaveGaugeRrPayload } from '@/api/gaugeRr';
import { instrumentsApi } from '@/api/instruments';
import { queryKeys } from '@/api/queryKeys';
import { getToday, toIsoDate } from '@/lib/date';
import {
  APPRAISER_COUNTS,
  APPRAISER_LETTERS,
  badCellCount,
  gridFrom,
  isBlockPaste,
  isNumberText,
  PART_MAX,
  PART_MIN,
  pasteInto,
  resizeGrid,
  toMeasurements,
  TRIAL_COUNTS,
  type Grid,
} from '@/domain/gaugeRr';
import Modal from '@/components/Modal';
import SearchSelect from '@/components/SearchSelect';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Field, inputClass } from '@/components/ui';

/** 계측기 고르는 목록. 계측기 목록 화면과 같은 조회라 받아 둔 것을 함께 쓴다 */
const INSTRUMENT_QUERY = { page: 0, size: 500 };

/**
 * 게이지 R&R 등록·수정.
 *
 * 양식의 파란 칸만 받는다. 계산은 서버가 하고 저장 응답에 결과가 같이 온다 —
 * 그래서 입력하는 동안에는 결과가 없고, 저장하면 상세 화면에 양식이 채워진다.
 * 수정도 양식을 통째로 다시 보낸다(PATCH 이지만 부분 수정이 아니다).
 */
export default function GaugeRrModal({
  study,
  onClose,
}: {
  /** 없으면 새로 등록 */
  study?: GaugeRrDetail;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    instrumentId: study?.instrumentId != null ? String(study.instrumentId) : '',
    partNumber: study?.partNumber ?? '',
    partName: study?.partName ?? '',
    characteristic: study?.characteristic ?? '',
    characteristicClass: study?.characteristicClass ?? '일반',
    specLower: study?.specLower != null ? String(study.specLower) : '',
    specUpper: study?.specUpper != null ? String(study.specUpper) : '',
    gageName: study?.gageName ?? '',
    gageNumber: study?.gageNumber ?? '',
    gageType: study?.gageType ?? '',
    performedDate: study?.performedDate ?? toIsoDate(getToday()),
    remark: study?.remark ?? '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const [appraisers, setAppraisers] = useState<string[]>(study?.appraisers ?? ['', '', '']);
  const [trials, setTrials] = useState(study?.trials ?? 3);
  const [parts, setParts] = useState(study?.parts ?? 10);
  const [grid, setGrid] = useState<Grid>(() =>
    study ? gridFrom(study.measurements) : resizeGrid([], 3, 3, 10),
  );
  /* 저장을 눌러 본 뒤에만 빈칸을 빨갛게 칠한다. 처음부터 칠하면 온통 빨갛다 */
  const [tried, setTried] = useState(false);

  /* 측정자·반복·부품 수를 바꿔도 이미 친 값은 남긴다 */
  const resize = (a: number, t: number, p: number) => {
    setAppraisers((prev) => Array.from({ length: a }, (_, i) => prev[i] ?? ''));
    setTrials(t);
    setParts(p);
    setGrid((g) => resizeGrid(g, a, t, p));
  };
  const appraiserCount = appraisers.length;

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
  if (!form.gageName.trim()) errors.push('게이지 이름을 입력하세요.');
  if (!form.performedDate) errors.push('시행일을 입력하세요.');
  if (appraisers.some((n) => !n.trim())) errors.push('측정자 이름을 모두 입력하세요.');
  if (!specText(form.specLower) || !specText(form.specUpper)) errors.push('규격은 숫자로 입력하세요.');
  else if (
    form.specLower.trim() &&
    form.specUpper.trim() &&
    Number(form.specLower) >= Number(form.specUpper)
  )
    errors.push('규격 상한은 하한보다 커야 합니다.');
  const bad = badCellCount(grid);
  if (bad > 0) errors.push(`측정값 ${bad}칸이 비었거나 숫자가 아닙니다.`);

  const save = useMutation({
    mutationFn: () => {
      const measurements = toMeasurements(grid);
      if (!measurements) throw new Error('측정값을 모두 숫자로 채워 주세요.');
      const opt = (s: string) => (s.trim() === '' ? undefined : s.trim());
      const body: SaveGaugeRrPayload = {
        instrumentId: form.instrumentId ? Number(form.instrumentId) : undefined,
        partNumber: form.partNumber.trim(),
        partName: form.partName.trim(),
        characteristic: opt(form.characteristic),
        characteristicClass: opt(form.characteristicClass),
        specLower: opt(form.specLower) != null ? Number(form.specLower) : undefined,
        specUpper: opt(form.specUpper) != null ? Number(form.specUpper) : undefined,
        gageName: form.gageName.trim(),
        gageNumber: opt(form.gageNumber),
        gageType: opt(form.gageType),
        appraisers: appraisers.map((n) => n.trim()),
        trials,
        parts,
        performedDate: form.performedDate,
        remark: opt(form.remark),
        measurements,
      };
      return study ? gaugeRrApi.update(study.id, body) : gaugeRrApi.create(body);
    },
    onSuccess: (saved) => {
      /* 응답에 계산 결과까지 와 있다 — 상세를 다시 묻지 않고 바로 채운다 */
      qc.setQueryData(queryKeys.gaugeRr.detail(saved.id), saved);
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
            {save.isPending ? '계산 중…' : '저장하고 계산'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ---------- 머리 정보 ---------- */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Field label="계측기 연결" hint="고르면 게이지 이름·번호·규격을 채웁니다. 연결하지 않아도 됩니다.">
              <SearchSelect
                value={form.instrumentId}
                onChange={pickInstrument}
                options={instrumentOptions}
                loading={instruments.isPending}
                placeholder="계측기명 · 관리번호로 찾기"
              />
            </Field>
          </div>
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

          <Field label="게이지 이름 (Gage Name)" required>
            <input
              className={inputClass}
              value={form.gageName}
              onChange={(e) => set('gageName', e.target.value)}
              placeholder="Micrometer"
            />
          </Field>
          <Field label="게이지 번호 (Gage Number)">
            <input
              className={`${inputClass} code`}
              value={form.gageNumber}
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
          <div />

          <Field label="품번 (Part Number)" required>
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
          <Field label="측정 특성 (Characteristic)">
            <input
              className={inputClass}
              value={form.characteristic}
              onChange={(e) => set('characteristic', e.target.value)}
              placeholder="외경"
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

        {/* ---------- 측정 조건 ---------- */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 md:grid-cols-6">
          <Field label="측정자 수">
            <select
              className={inputClass}
              value={appraiserCount}
              onChange={(e) => resize(Number(e.target.value), trials, parts)}
            >
              {APPRAISER_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}명
                </option>
              ))}
            </select>
          </Field>
          <Field label="반복 횟수">
            <select
              className={inputClass}
              value={trials}
              onChange={(e) => resize(appraiserCount, Number(e.target.value), parts)}
            >
              {TRIAL_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}회
                </option>
              ))}
            </select>
          </Field>
          <Field label="부품 수">
            <select
              className={inputClass}
              value={parts}
              onChange={(e) => resize(appraiserCount, trials, Number(e.target.value))}
            >
              {Array.from({ length: PART_MAX - PART_MIN + 1 }, (_, i) => i + PART_MIN).map((n) => (
                <option key={n} value={n}>
                  {n}개
                </option>
              ))}
            </select>
          </Field>
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
        </div>

        {/* ---------- 측정값 ---------- */}
        <div className="border-t border-line pt-3">
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
                  {Array.from({ length: parts }, (_, p) => (
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
                          rowSpan={trials}
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
                              aria-label={`측정자 ${APPRAISER_LETTERS[a]} ${t + 1}회 ${p + 1}번 부품`}
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

        <Field label="비고">
          <input
            className={inputClass}
            value={form.remark}
            onChange={(e) => set('remark', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
