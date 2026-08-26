import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** 목록에 없는 반을 새로 만들 때 고르는 값. 서버로 나가지 않는다 */
const NEW_TEAM = '__new__';

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

  /**
   * 담당반은 자유 입력이라 "압출" 과 "압출반" 이 서로 다른 반이 된다.
   * 오타 하나로 알림이 조용히 끊기므로 이미 쓰이는 값에서 고르게 한다.
   * 담당반 마스터 API 가 없어 등록된 대상에서 값을 모으는 수밖에 없다.
   */
  const teamQuery = useQuery({
    queryKey: queryKeys.inspections.list({}),
    queryFn: () => inspectionsApi.list({}),
    staleTime: 10 * 60_000,
  });
  const currentTeam = equipment?.team ?? null;
  const teamOptions = useMemo(() => {
    const found = new Set(
      (teamQuery.data ?? []).map((e) => e.team).filter((t): t is string => !!t),
    );
    // 수정 중인 대상만 쓰던 이름이면 목록에 없을 수 있다. 고른 값이 사라지지 않게 넣어 준다
    if (currentTeam) found.add(currentTeam);
    return [...found].sort();
  }, [teamQuery.data, currentTeam]);

  const [addingTeam, setAddingTeam] = useState(false);

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
        <Field
          label="담당반"
          hint={
            addingTeam
              ? '목록에 없는 반을 새로 적습니다. 다음부터는 목록에 나옵니다.'
              : '비워 두면 담당반을 지정하지 않은 수신자에게만 알림이 갑니다.'
          }
        >
          {addingTeam ? (
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={form.team ?? ''}
                placeholder="예: 조립"
                autoFocus
                onChange={(e) => set('team', e.target.value)}
              />
              <button
                type="button"
                className={btnClass}
                onClick={() => {
                  setAddingTeam(false);
                  set('team', currentTeam ?? '');
                }}
              >
                목록에서 고르기
              </button>
            </div>
          ) : (
            <select
              className={inputClass}
              value={form.team ?? ''}
              onChange={(e) => {
                if (e.target.value === NEW_TEAM) {
                  setAddingTeam(true);
                  set('team', '');
                } else {
                  set('team', e.target.value);
                }
              }}
            >
              <option value="">지정 안 함</option>
              {teamOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={NEW_TEAM}>+ 새 반 직접 입력</option>
            </select>
          )}
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
