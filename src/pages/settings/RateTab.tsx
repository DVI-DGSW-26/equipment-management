import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mastersApi, type DepreciationRate } from '@/api/masters';
import { queryKeys } from '@/api/queryKeys';
import { useRates } from '@/hooks/useMasters';
import { hasUnverifiedRate } from '@/domain/depreciationMethod';
import { rateText } from '@/lib/won';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { Badge, btnClass, btnPrimaryClass, Field, inputClass, QueryState, Section, thClass } from '@/components/ui';

export default function RateTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DepreciationRate | null | 'new'>(null);

  const q = useRates();

  return (
    <Section
      title="내용연수 × 상각방법 상각률"
      right={
        <>
          {hasUnverifiedRate(q.data ?? []) && (
            <Badge tone="warn" title="회계 담당자 확인 전 문서 초안값">
              미확인 값 포함
            </Badge>
          )}
          <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
            상각률 추가
          </button>
        </>
      }
    >
      <QueryState isPending={q.isPending} error={q.error} isEmpty={(q.data ?? []).length === 0} />
      {(q.data ?? []).length > 0 && (
        <table className="w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={`${thClass} text-right`}>내용연수</th>
              <th className={`${thClass} text-right`}>정액법</th>
              <th className={`${thClass} text-right`}>정률법</th>
              <th className={thClass}>확인</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg">
                <td className="num px-3 py-2">{r.usefulLifeYears}년</td>
                <td className="num px-3 py-2">{rateText(r.straightLineRate)}</td>
                <td className="num px-3 py-2">{rateText(r.decliningBalanceRate)}</td>
                <td className="px-3 py-2">
                  {r.verified ? (
                    <Badge tone="accent">확인</Badge>
                  ) : (
                    <Badge tone="warn">초안</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="whitespace-nowrap text-[18px] text-accent hover:underline"
                    onClick={() => setEditing(r)}
                  >
                    수정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <RateModal
          rate={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={() => void qc.invalidateQueries({ queryKey: queryKeys.masters.rates() })}
        />
      )}
    </Section>
  );
}

function RateModal({
  rate,
  onClose,
  onDone,
}: {
  rate?: DepreciationRate;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    usefulLifeYears: rate ? String(rate.usefulLifeYears) : '',
    straightLineRate: rate ? String(rate.straightLineRate) : '',
    decliningBalanceRate: rate ? String(rate.decliningBalanceRate) : '',
    verified: rate?.verified ?? false,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        usefulLifeYears: form.usefulLifeYears ? Number(form.usefulLifeYears) : undefined,
        straightLineRate: form.straightLineRate ? Number(form.straightLineRate) : undefined,
        decliningBalanceRate: form.decliningBalanceRate
          ? Number(form.decliningBalanceRate)
          : undefined,
        verified: form.verified,
      };
      return rate ? mastersApi.updateRate(rate.id, body) : mastersApi.createRate(body);
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
      title={rate ? '상각률 수정' : '상각률 추가'}
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
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="내용연수(년)" required hint={rate ? '수정 시 반영되지 않습니다.' : undefined}>
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            disabled={!!rate}
            value={form.usefulLifeYears}
            onChange={(e) =>
              setForm((p) => ({ ...p, usefulLifeYears: e.target.value.replace(/[^\d]/g, '') }))
            }
          />
        </Field>
        <Field label="정액법 상각률">
          <input
            className={`${inputClass} num`}
            inputMode="decimal"
            value={form.straightLineRate}
            onChange={(e) =>
              setForm((p) => ({ ...p, straightLineRate: e.target.value.replace(/[^\d.]/g, '') }))
            }
          />
        </Field>
        <Field label="정률법 상각률">
          <input
            className={`${inputClass} num`}
            inputMode="decimal"
            value={form.decliningBalanceRate}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                decliningBalanceRate: e.target.value.replace(/[^\d.]/g, ''),
              }))
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-[19px]">
          <input
            type="checkbox"
            checked={form.verified}
            onChange={(e) => setForm((p) => ({ ...p, verified: e.target.checked }))}
          />
          회계 담당자 확인 완료
        </label>
      </div>
    </Modal>
  );
}
