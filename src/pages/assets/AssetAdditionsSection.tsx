import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assetsApi, type AssetAddition, type CreateAdditionPayload } from '@/api/assets';
import { queryKeys } from '@/api/queryKeys';
import { fmtDate, toIsoDate, getToday } from '@/lib/date';
import { won, wonUnit } from '@/lib/won';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Field,
  inputClass,
  QueryState,
  Section,
  thClass,
} from '@/components/ui';

/**
 * 발생일의 **연도부터** 상각 기준가액이 (취득가액 + 증가누계)로 커진다.
 * 증가분은 월할 없이 그 해 전액을 상각한다 — 회계 프로그램과 같은 방식이다.
 * 등록·삭제 즉시 서버가 감가상각을 다시 계산한다.
 */
const RULE_NOTE =
  '발생일이 속한 연도부터 상각 기준가액이 (취득가액 + 증가 누계)로 커집니다. 증가분은 월할 없이 그 해 전액을 상각합니다. 등록·삭제하면 감가상각이 곧바로 다시 계산됩니다.';

const NOTE_MAX = 200;

export default function AssetAdditionsSection({
  assetId,
  additionTotal,
  onChanged,
}: {
  assetId: number;
  /** 서버가 준 증가 누계(AssetResponse.additionTotal) */
  additionTotal: number;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: queryKeys.assets.additions(assetId),
    queryFn: () => assetsApi.additions(assetId),
    enabled: Number.isFinite(assetId),
  });
  const rows = q.data ?? [];

  return (
    <Section
      title="자본적지출 (신규취득및증가)"
      right={
        <>
          <span className="text-[18px] text-fg-sub">
            증가 누계 <span className="num">{wonUnit(additionTotal)}</span>
          </span>
          <button type="button" className={btnPrimaryClass} onClick={() => setAdding(true)}>
            등록
          </button>
        </>
      }
    >
      <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">{RULE_NOTE}</p>

      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText="등록된 자본적지출이 없습니다."
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>발생일</th>
              <th className={`${thClass} text-right`}>금액</th>
              <th className={thClass}>메모</th>
              <th className={`${thClass} w-24`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <AdditionRow key={r.id} assetId={assetId} row={r} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <AddModal assetId={assetId} onClose={() => setAdding(false)} onChanged={onChanged} />
      )}
    </Section>
  );
}

function AdditionRow({
  assetId,
  row,
  onChanged,
}: {
  assetId: number;
  row: AssetAddition;
  onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: () => assetsApi.removeAddition(assetId, row.id),
    onSuccess: () => {
      toast.ok('삭제했습니다. 감가상각을 다시 계산했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.assets.additions(assetId) });
      onChanged();
    },
    onError: toast.fail,
  });

  return (
    <tr className="border-b border-line">
      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.addedOn)}</td>
      <td className="num px-3 py-2">{won(row.amount)}</td>
      <td className="px-3 py-2 text-fg-sub">{row.note ?? '-'}</td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          className={btnDangerClass}
          disabled={remove.isPending}
          onClick={() => {
            if (
              window.confirm(
                `${fmtDate(row.addedOn)} 자본적지출 ${won(row.amount)}원을 삭제합니다. 감가상각이 다시 계산됩니다.`,
              )
            )
              remove.mutate();
          }}
        >
          삭제
        </button>
      </td>
    </tr>
  );
}

function AddModal({
  assetId,
  onClose,
  onChanged,
}: {
  assetId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [addedOn, setAddedOn] = useState(toIsoDate(getToday()));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const amountNumber = Number(amount);
  const amountValid = amount !== '' && Number.isFinite(amountNumber) && amountNumber > 0;
  const canSave = addedOn !== '' && amountValid;

  const save = useMutation({
    mutationFn: () => {
      const body: CreateAdditionPayload = {
        addedOn,
        amount: amountNumber,
        note: note.trim() || undefined,
      };
      return assetsApi.addAddition(assetId, body);
    },
    onSuccess: () => {
      toast.ok('등록했습니다. 감가상각을 다시 계산했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.assets.additions(assetId) });
      onChanged();
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title="자본적지출 등록"
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
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            등록
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-sm border border-line bg-bg px-3 py-2 text-[18px] text-fg-sub">
        {RULE_NOTE}
      </p>
      <div className="grid grid-cols-1 gap-3">
        <Field label="발생일" required>
          <input
            type="date"
            className={inputClass}
            value={addedOn}
            onChange={(e) => setAddedOn(e.target.value)}
          />
        </Field>
        <Field
          label="금액"
          required
          error={amount !== '' && !amountValid ? '0보다 큰 금액을 입력하세요.' : undefined}
          hint={amountValid ? wonUnit(amountNumber) : undefined}
        >
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            placeholder="15800000"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </Field>
        <Field label="메모" hint={`${note.length}/${NOTE_MAX}자`}>
          <input
            className={inputClass}
            maxLength={NOTE_MAX}
            placeholder="예: 메인 실린더 교체"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
