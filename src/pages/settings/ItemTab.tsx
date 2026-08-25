import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mastersApi, type AssetItem, type CodeMaster } from '@/api/masters';
import { queryKeys } from '@/api/queryKeys';
import { useItems, useItemTypes } from '@/hooks/useMasters';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Field, inputClass, QueryState, Section, thClass } from '@/components/ui';

export default function ItemTab() {
  const qc = useQueryClient();
  const [itemTypeCode, setItemTypeCode] = useState('');
  const [editing, setEditing] = useState<AssetItem | null | 'new'>(null);

  const types = useItemTypes();
  const q = useItems(itemTypeCode || undefined);

  return (
    <Section
      title="품목"
      right={
        <>
          <select
            className={`${inputClass} w-32`}
            value={itemTypeCode}
            onChange={(e) => setItemTypeCode(e.target.value)}
          >
            <option value="">전체 비품구분</option>
            {(types.data ?? []).map((t) => (
              <option key={t.id} value={t.code}>
                {t.code} {t.name}
              </option>
            ))}
          </select>
          <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
            품목 추가
          </button>
        </>
      }
    >
      <QueryState isPending={q.isPending} error={q.error} isEmpty={(q.data ?? []).length === 0} />
      {(q.data ?? []).length > 0 && (
        <table className="w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>비품구분</th>
              <th className={thClass}>품목코드</th>
              <th className={thClass}>품목명</th>
              <th className={thClass}>비고</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((i) => (
              <tr key={i.id} className="border-b border-line hover:bg-bg">
                <td className="code px-3 py-2">{i.itemTypeCode}</td>
                <td className="code px-3 py-2">{i.code}</td>
                <td className="px-3 py-2">{i.name}</td>
                <td className="px-3 py-2 text-fg-sub">{i.remark ?? '-'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="whitespace-nowrap text-[18px] text-accent hover:underline"
                    onClick={() => setEditing(i)}
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
        <ItemModal
          item={editing === 'new' ? undefined : editing}
          types={types.data ?? []}
          defaultTypeCode={itemTypeCode}
          onClose={() => setEditing(null)}
          onDone={() => void qc.invalidateQueries({ queryKey: queryKeys.masters.all })}
        />
      )}
    </Section>
  );
}

function ItemModal({
  item,
  types,
  defaultTypeCode,
  onClose,
  onDone,
}: {
  item?: AssetItem;
  types: CodeMaster[];
  defaultTypeCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    itemTypeCode: item?.itemTypeCode ?? defaultTypeCode,
    code: item?.code ?? '',
    name: item?.name ?? '',
    remark: item?.remark ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        itemTypeCode: form.itemTypeCode,
        code: form.code || undefined,
        name: form.name,
        remark: form.remark || undefined,
      };
      return item ? mastersApi.updateItem(item.id, body) : mastersApi.createItem(body);
    },
    onSuccess: () => {
      toast.ok('저장했습니다.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={item ? '품목 수정' : '품목 추가'}
      width={580}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || form.name.trim() === '' || form.itemTypeCode === ''}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="비품구분" required>
          <select
            className={inputClass}
            value={form.itemTypeCode}
            onChange={(e) => set('itemTypeCode', e.target.value)}
          >
            <option value="">선택</option>
            {types.map((t) => (
              <option key={t.id} value={t.code}>
                {t.code} {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="품목코드" hint="비우면 서버가 채번합니다.">
          <input
            className={inputClass}
            value={form.code}
            disabled={!!item}
            onChange={(e) => set('code', e.target.value)}
          />
        </Field>
        <Field label="품목명" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="비고 (규격 등)">
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
