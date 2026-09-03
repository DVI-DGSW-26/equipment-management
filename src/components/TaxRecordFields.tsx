import {
  TAX_FIELDS,
  taxDigitsOnly,
  type TaxFormState,
} from '@/domain/taxRecord';
import { Field, inputClass } from '@/components/ui';

/**
 * 세무 기록 13종 입력칸.
 *
 * 자산 등록 화면과 상세의 수정 창이 같은 칸을 쓴다 — 두 곳에서 항목이 어긋나면
 * 회계 프로그램과 대조할 때 어느 쪽이 맞는지 알 수 없다.
 */
export default function TaxRecordFields({
  form,
  onChange,
}: {
  form: TaxFormState;
  onChange: (key: string, value: string | boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {TAX_FIELDS.map((f) =>
        f.kind === 'bool' ? (
          <label key={f.key} className="flex items-center gap-2 self-end pb-1.5 text-[19px]">
            <input
              type="checkbox"
              checked={Boolean(form[f.key])}
              onChange={(e) => onChange(f.key, e.target.checked)}
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
                onChange(
                  f.key,
                  f.kind === 'text' ? e.target.value : taxDigitsOnly(f.kind, e.target.value),
                )
              }
            />
          </Field>
        ),
      )}
    </div>
  );
}
