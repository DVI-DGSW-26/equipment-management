import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  inspectionsApi,
  EQUIPMENT_STATUS_LABEL,
  type EquipmentStatus,
  type SafetyEquipment,
  type SaveEquipmentPayload,
} from '@/api/inspections';
import { queryKeys } from '@/api/queryKeys';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Field, inputClass } from '@/components/ui';

/* ---------- 대상 등록·수정 ---------- */

export default function EquipmentModal({
  equipment,
  onClose,
}: {
  equipment?: SafetyEquipment;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<SaveEquipmentPayload>({
    name: equipment?.name ?? '',
    modelNo: equipment?.modelNo ?? '',
    installLocation: equipment?.installLocation ?? '',
    capacity: equipment?.capacity ?? '',
    installedAt: equipment?.installedAt ?? '',
    inspectionAgency: equipment?.inspectionAgency ?? '',
    team: equipment?.team ?? '',
    status: equipment?.status ?? 'IN_USE',
    remark: equipment?.remark ?? '',
  });

  const set = <K extends keyof SaveEquipmentPayload>(k: K, v: SaveEquipmentPayload[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, installedAt: form.installedAt || undefined };
      return equipment
        ? inspectionsApi.update(equipment.id, body)
        : inspectionsApi.create(body).then(() => undefined);
    },
    onSuccess: () => {
      toast.ok(equipment ? '수정했습니다.' : '대상을 등록했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.inspections.all });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={equipment ? '안전검사 대상 수정' : '안전검사 대상 등록'}
      width={740}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || form.name.trim() === ''}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="대상품명" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="형식번호">
          <input
            className={inputClass}
            value={form.modelNo ?? ''}
            onChange={(e) => set('modelNo', e.target.value)}
          />
        </Field>
        <Field label="설치장소">
          <input
            className={inputClass}
            value={form.installLocation ?? ''}
            onChange={(e) => set('installLocation', e.target.value)}
          />
        </Field>
        <Field label="용량">
          <input
            className={inputClass}
            value={form.capacity ?? ''}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </Field>
        <Field label="최초 설치일" hint="첫 검사 기한 = 설치 + 3년">
          <input
            type="date"
            className={inputClass}
            value={form.installedAt ?? ''}
            onChange={(e) => set('installedAt', e.target.value)}
          />
        </Field>
        <Field label="검사기관">
          <input
            className={inputClass}
            value={form.inspectionAgency ?? ''}
            onChange={(e) => set('inspectionAgency', e.target.value)}
          />
        </Field>
        <Field label="담당반">
          <input
            className={inputClass}
            value={form.team ?? ''}
            onChange={(e) => set('team', e.target.value)}
          />
        </Field>
        <Field label="상태">
          <select
            className={inputClass}
            value={form.status ?? 'IN_USE'}
            onChange={(e) => set('status', e.target.value as EquipmentStatus)}
          >
            {(Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[]).map((s) => (
              <option key={s} value={s}>
                {EQUIPMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark ?? ''}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
