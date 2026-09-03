import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { assetsApi, type Asset } from '@/api/assets';
import {
  TAX_FIELDS,
  TAX_NOTE,
  taxBody,
  taxDisplay,
  taxFormOf,
  type TaxFormState,
} from '@/domain/taxRecord';
import Modal from '@/components/Modal';
import TaxRecordFields from '@/components/TaxRecordFields';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Def, Section } from '@/components/ui';

/** 빈 칸으로 둔 항목은 서버가 건드리지 않는다(부분 수정). 값을 지울 수는 없다 */
const EDIT_NOTE = '빈 칸으로 둔 항목은 기존 값이 그대로 남습니다. 바꿀 항목만 채워 저장하세요.';

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
      <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">{TAX_NOTE}</p>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {TAX_FIELDS.map((f) => (
          <Def key={f.key} label={f.label}>
            <span className={f.kind === 'money' || f.kind === 'rate' ? 'num-left block' : undefined}>
              {taxDisplay(f, asset)}
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
  const [form, setForm] = useState<TaxFormState>(() => taxFormOf(asset));

  const set = (key: string, v: string | boolean) => setForm((prev) => ({ ...prev, [key]: v }));

  const save = useMutation({
    mutationFn: () => assetsApi.updateTaxRecord(asset.id, taxBody(form)),
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
      {/* 회계에서 보던 화면만큼 칸을 키운다 */}
      <div className="form-lg">
        <TaxRecordFields form={form} onChange={set} />
      </div>
    </Modal>
  );
}
