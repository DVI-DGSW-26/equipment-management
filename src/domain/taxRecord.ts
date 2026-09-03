import type { AssetTaxRecord, UpdateTaxRecordPayload } from '@/api/assets';
import { rateText, won } from '@/lib/won';

/**
 * 세무 기록 13종 — 상각 계산에 영향 없는 기록 항목.
 *
 * 항목 이름과 차례는 회계 프로그램 고정자산등록화면의 "추가등록사항" 탭을 그대로 따른다
 * (회계팀 회신 2026-09-01). 등록 화면·상세 보기·수정 창이 이 배열 하나를 같이 쓴다 —
 * 항목이 늘면 여기만 고친다.
 */
export type TaxFieldKind = 'money' | 'rate' | 'int' | 'text' | 'bool';

export interface TaxField {
  key: keyof AssetTaxRecord;
  label: string;
  kind: TaxFieldKind;
  hint?: string;
}

export const TAX_FIELDS: TaxField[] = [
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

export const TAX_NOTE =
  '상각 계산에 쓰이지 않는 기록 항목입니다. 회계 프로그램의 “추가등록사항”과 같은 항목입니다.';

/** 입력 중에는 전부 문자열(체크박스만 boolean)로 다루고, 보낼 때 숫자로 바꾼다 */
export type TaxFormState = Record<string, string | boolean>;

/** 새로 등록하는 자산 — 전부 빈 칸에서 시작한다 */
export const emptyTaxForm = (): TaxFormState => {
  const form: TaxFormState = {};
  TAX_FIELDS.forEach((f) => {
    form[f.key] = f.kind === 'bool' ? false : '';
  });
  return form;
};

/** 이미 있는 자산의 값을 입력칸으로 옮긴다 */
export const taxFormOf = (asset: AssetTaxRecord): TaxFormState => {
  const form: TaxFormState = {};
  TAX_FIELDS.forEach((f) => {
    const v = asset[f.key];
    form[f.key] = f.kind === 'bool' ? Boolean(v) : v == null ? '' : String(v);
  });
  return form;
};

export const taxDigitsOnly = (kind: TaxFieldKind, raw: string): string =>
  kind === 'int' ? raw.replace(/[^\d]/g, '') : raw.replace(/[^\d.]/g, '');

/** 보기 화면용 표시값 */
export const taxDisplay = (field: TaxField, source: AssetTaxRecord): string => {
  const v = source[field.key];
  if (field.kind === 'bool') return v ? '예' : '아니오';
  if (v == null || v === '') return '-';
  if (field.kind === 'money') return won(v as number);
  if (field.kind === 'rate') return rateText(v as number);
  return String(v);
};

/** 손댄 칸이 하나라도 있는가. 등록 화면에서 저장 요청을 더 보낼지 가른다 */
export const hasTaxInput = (form: TaxFormState): boolean =>
  TAX_FIELDS.some((f) =>
    f.kind === 'bool' ? Boolean(form[f.key]) : String(form[f.key] ?? '').trim() !== '',
  );

/** 빈 칸은 빼고 보낸다 — 서버는 받지 않은 항목을 건드리지 않는다 */
export const taxBody = (form: TaxFormState): UpdateTaxRecordPayload => {
  // 값 타입이 항목마다 달라 인덱스 대입이 안 된다. 한 번만 좁혀서 넘긴다
  const body: Record<string, string | number | boolean> = {};
  TAX_FIELDS.forEach((f) => {
    const v = form[f.key];
    if (f.kind === 'bool') {
      body[f.key] = Boolean(v);
      return;
    }
    const s = String(v).trim();
    if (s === '') return;
    body[f.key] = f.kind === 'text' ? s : Number(s);
  });
  return body as unknown as UpdateTaxRecordPayload;
};
