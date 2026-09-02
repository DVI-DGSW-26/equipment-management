import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { assetsApi, type Asset, type AssetTaxRecord, type UpdateTaxRecordPayload } from '@/api/assets';
import { rateText, won } from '@/lib/won';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  btnClass,
  btnPrimaryClass,
  Def,
  Field,
  inputClass,
  Section,
} from '@/components/ui';

/**
 * 세무 기록 13종 — 상각 계산에 영향 없는 기록 항목.
 *
 * 항목 이름과 차례는 회계 프로그램 고정자산등록화면의 "추가등록사항" 탭을 그대로 따른다
 * (회계팀 회신 2026-09-01). 보기 화면과 수정 모달이 이 배열 하나를 같이 쓴다 —
 * 항목이 늘면 여기만 고친다.
 */
type TaxFieldKind = 'money' | 'rate' | 'int' | 'text' | 'bool';

interface TaxField {
  key: keyof AssetTaxRecord;
  label: string;
  kind: TaxFieldKind;
  hint?: string;
}

const TAX_FIELDS: TaxField[] = [
  { key: 'priorDisallowedAccumulated', label: '전기말부인누계', kind: 'money' },
  { key: 'priorDeemedAccumulated', label: '전기말의제누계액', kind: 'money' },
  { key: 'currentDeemedDepreciation', label: '당기의제상각액', kind: 'money' },
  { key: 'specialDepreciationRate', label: '특별상각률', kind: 'rate', hint: '0 ~ 1' },
  { key: 'specialDepreciationAmount', label: '특별상각비', kind: 'money' },
  { key: 'minTaxDisallowedAmount', label: '최저한세부인액', kind: 'money' },
  { key: 'sincereBaseAmount', label: '성실기초가액', kind: 'money' },
  { key: 'sincereAccumulated', label: '성실상각누계액', kind: 'money' },
  { key: 'sincereYears', label: '성실경과/차감연수', kind: 'text', hint: '예: 10/2' },
  { key: 'sincereBookValue', label: '성실장부가액', kind: 'money' },
  { key: 'specialCaseApplied', label: '특례적용', kind: 'bool' },
  { key: 'specialCaseYears', label: '특례년수', kind: 'int' },
  { key: 'businessVehicle', label: '업무용승용차여부', kind: 'bool' },
];

const NOTE =
  '상각 계산에 쓰이지 않는 기록 항목입니다. 회계 프로그램의 “추가등록사항”과 같은 항목입니다.';

/** 빈 칸으로 둔 항목은 서버가 건드리지 않는다(부분 수정). 값을 지울 수는 없다 */
const EDIT_NOTE = '빈 칸으로 둔 항목은 기존 값이 그대로 남습니다. 바꿀 항목만 채워 저장하세요.';

const display = (field: TaxField, source: AssetTaxRecord): string => {
  const v = source[field.key];
  if (field.kind === 'bool') return v ? '예' : '아니오';
  if (v == null || v === '') return '-';
  if (field.kind === 'money') return won(v as number);
  if (field.kind === 'rate') return rateText(v as number);
  return String(v);
};

export default function AssetTaxRecordSection({
  asset,
  onDone,
}: {
  asset: Asset;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Section
      title="추가등록사항 (세무 기록)"
      right={
        <button type="button" className={btnPrimaryClass} onClick={() => setEditing(true)}>
          수정
        </button>
      }
    >
      <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">{NOTE}</p>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {TAX_FIELDS.map((f) => (
          <Def key={f.key} label={f.label}>
            <span className={f.kind === 'money' || f.kind === 'rate' ? 'num-left block' : undefined}>
              {display(f, asset)}
            </span>
          </Def>
        ))}
      </div>

      {editing && (
        <EditTaxRecordModal asset={asset} onClose={() => setEditing(false)} onDone={onDone} />
      )}
    </Section>
  );
}

/** 입력 중에는 전부 문자열(체크박스만 boolean)로 다루고, 보낼 때 숫자로 바꾼다 */
type FormState = Record<string, string | boolean>;

const initialForm = (asset: Asset): FormState => {
  const form: FormState = {};
  TAX_FIELDS.forEach((f) => {
    const v = asset[f.key];
    form[f.key] = f.kind === 'bool' ? Boolean(v) : v == null ? '' : String(v);
  });
  return form;
};

const digitsOnly = (kind: TaxFieldKind, raw: string): string =>
  kind === 'int' ? raw.replace(/[^\d]/g, '') : raw.replace(/[^\d.]/g, '');

function EditTaxRecordModal({
  asset,
  onClose,
  onDone,
}: {
  asset: Asset;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialForm(asset));

  const set = (key: string, v: string | boolean) => setForm((prev) => ({ ...prev, [key]: v }));

  const save = useMutation({
    mutationFn: () => {
      // 값 타입이 항목마다 달라 인덱스 대입이 안 된다. 한 번만 좁혀서 넘긴다
      const body: Record<string, string | number | boolean> = {};
      TAX_FIELDS.forEach((f) => {
        const v = form[f.key];
        if (f.kind === 'bool') {
          body[f.key] = Boolean(v);
          return;
        }
        const s = String(v).trim();
        if (s === '') return; // 빈 칸 = 변경하지 않음
        body[f.key] = f.kind === 'text' ? s : Number(s);
      });
      return assetsApi.updateTaxRecord(asset.id, body as unknown as UpdateTaxRecordPayload);
    },
    onSuccess: () => {
      toast.ok('저장했습니다.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title="추가등록사항 수정"
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
      <p className="mb-3 rounded-sm border border-line bg-bg px-3 py-2 text-[18px] text-fg-sub">
        {EDIT_NOTE}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {TAX_FIELDS.map((f) =>
          f.kind === 'bool' ? (
            <label key={f.key} className="flex items-center gap-2 self-end pb-1.5 text-[19px]">
              <input
                type="checkbox"
                checked={Boolean(form[f.key])}
                onChange={(e) => set(f.key, e.target.checked)}
              />
              {f.label}
            </label>
          ) : (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <input
                className={`${inputClass} ${f.kind === 'text' ? '' : 'num'}`}
                inputMode={f.kind === 'text' ? undefined : f.kind === 'int' ? 'numeric' : 'decimal'}
                value={String(form[f.key] ?? '')}
                onChange={(e) =>
                  set(f.key, f.kind === 'text' ? e.target.value : digitsOnly(f.kind, e.target.value))
                }
              />
            </Field>
          ),
        )}
      </div>
    </Modal>
  );
}
