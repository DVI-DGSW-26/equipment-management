import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inspectionsApi,
  type SafetyEquipment,
  type SaveInspectionPayload,
} from '@/api/inspections';
import { notificationsApi } from '@/api/notifications';
import { queryKeys } from '@/api/queryKeys';
import { DDAY_CLASS, ddayLabel, levelOf, notificationSchedule } from '@/domain/dday';
import { fmtDate, toIsoDate } from '@/lib/date';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Def,
  Field,
  inputClass,
  QueryState,
  thClass,
} from '@/components/ui';
import EquipmentModal from './EquipmentModal';

/* ---------- 상세: 검사 이력 + 결과 등록 + 알림 예정일 ---------- */

export default function DetailModal({
  equipment,
  onClose,
}: {
  equipment: SafetyEquipment;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SaveInspectionPayload>({
    inspectedAt: toIsoDate(new Date()),
    validFrom: '',
    validUntil: '',
    certificateNo: '',
    remark: '',
  });

  // 알림 예정일은 서버 설정을 그대로 따른다 (알림 화면에서 변경 가능)
  const settings = useQuery({
    queryKey: queryKeys.notifications.settings(),
    queryFn: () => notificationsApi.settings(),
    staleTime: 5 * 60_000,
  });

  const history = useQuery({
    queryKey: queryKeys.inspections.history(equipment.id),
    queryFn: () => inspectionsApi.inspections(equipment.id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.inspections.all });
  };

  const add = useMutation({
    mutationFn: () =>
      inspectionsApi.addInspection(equipment.id, {
        inspectedAt: form.inspectedAt,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || undefined,
        certificateNo: form.certificateNo || undefined,
        remark: form.remark || undefined,
      }),
    onSuccess: () => {
      toast.ok('검사 이력을 등록했습니다.');
      invalidate();
      onClose();
    },
    onError: toast.fail,
  });

  const removeInspection = useMutation({
    mutationFn: (inspectionId: number) =>
      inspectionsApi.removeInspection(equipment.id, inspectionId),
    onSuccess: () => {
      toast.ok('검사 이력을 삭제했습니다.');
      invalidate();
      void qc.invalidateQueries({ queryKey: queryKeys.inspections.history(equipment.id) });
    },
    onError: toast.fail,
  });

  const removeEquipment = useMutation({
    mutationFn: () => inspectionsApi.remove(equipment.id),
    onSuccess: () => {
      toast.ok('대상을 삭제했습니다.');
      invalidate();
      onClose();
    },
    onError: toast.fail,
  });

  const offsets = settings.data?.safetyDaysBefore ?? [];
  const slots =
    equipment.validUntil && offsets.length > 0
      ? notificationSchedule(equipment.validUntil, offsets)
      : [];

  if (editing) {
    return <EquipmentModal equipment={equipment} onClose={() => setEditing(false)} />;
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          {equipment.name}
          <span className={DDAY_CLASS[levelOf(equipment.severity)]}>
            {ddayLabel(equipment.daysUntilExpiry)}
          </span>
        </span>
      }
      width={940}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={btnDangerClass}
            disabled={removeEquipment.isPending}
            onClick={() => {
              if (window.confirm('이 대상을 삭제합니다. 검사 이력도 함께 사라집니다.'))
                removeEquipment.mutate();
            }}
          >
            대상 삭제
          </button>
          <button type="button" className={btnClass} onClick={() => setEditing(true)}>
            대상 수정
          </button>
          <button type="button" className={btnClass} onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={add.isPending || !form.inspectedAt}
            onClick={() => add.mutate()}
          >
            검사 완료 등록
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-sm border border-line">
          <Def label="형식번호">{equipment.modelNo ?? '-'}</Def>
          <Def label="설치장소">{equipment.installLocation ?? '-'}</Def>
          <Def label="용량">{equipment.capacity ?? '-'}</Def>
          <Def label="담당반">{equipment.team ?? '-'}</Def>
          <Def label="검사기관">{equipment.inspectionAgency ?? '-'}</Def>
          <Def label="최초 설치일">{fmtDate(equipment.installedAt)}</Def>
          <Def label="검사 주기">{equipment.inspectionCycleMonths}개월</Def>
          {/* 합격증에 찍힌 유효기간. 아래 "다음 검사 기한" 과 다를 수 있다 */}
          <Def label="검사 유효기간">
            {equipment.validFrom || equipment.validUntil
              ? `${fmtDate(equipment.validFrom)} ~ ${fmtDate(equipment.validUntil)}`
              : '-'}
          </Def>
          <Def label="다음 검사 기한">
            {fmtDate(equipment.nextInspectionDue)}
            <span className="mt-0.5 block text-[17px] text-fg-muted">
              {equipment.neverInspected
                ? '검사 이력이 없어 설치일 + 3년으로 잡힙니다.'
                : `최근 검사일 + ${equipment.inspectionCycleMonths}개월`}
            </span>
          </Def>
          <Def label="비고">{equipment.remark ?? '-'}</Def>
        </div>

        <div className="space-y-3">
          <div className="rounded-sm border border-line px-3 py-2">
            <div className="mb-1 text-[18px] font-medium">알림 예정일</div>
            {slots.length === 0 ? (
              <p className="text-[18px] text-fg-muted">
                {!equipment.validUntil
                  ? '검사 이력이 없어 알림 일정이 없습니다.'
                  : '발송 시점이 지정되지 않았습니다. 알림 화면에서 설정하세요.'}
              </p>
            ) : (
              <ul className="text-[18px]">
                {slots.map((s) => (
                  <li key={s.offsetDays} className="flex justify-between py-0.5">
                    <span className="text-fg-sub">만료 {s.offsetDays}일 전</span>
                    <span>
                      {s.scheduledAt}{' '}
                      <span className={s.sent ? 'text-fg-muted' : 'text-accent'}>
                        {s.sent ? '발송됨' : '예정'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-sm border border-line px-3 py-2">
            <div className="mb-2 text-[18px] font-medium">검사 완료 입력</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="검사일" required>
                <input
                  type="date"
                  className={inputClass}
                  value={form.inspectedAt}
                  onChange={(e) => setForm((p) => ({ ...p, inspectedAt: e.target.value }))}
                />
              </Field>
              <Field label="합격번호">
                <input
                  className={inputClass}
                  value={form.certificateNo ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, certificateNo: e.target.value }))}
                />
              </Field>
              <Field label="유효 시작일" hint="비우면 검사일">
                <input
                  type="date"
                  className={inputClass}
                  value={form.validFrom ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))}
                />
              </Field>
              <Field label="유효 만료일" hint="비우면 시작일 + 2년 - 1일">
                <input
                  type="date"
                  className={inputClass}
                  value={form.validUntil ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
                />
              </Field>
              <div className="col-span-2">
                <Field label="비고">
                  <input
                    className={inputClass}
                    value={form.remark ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-line">
        <div className="border-b border-line px-3 py-2 text-[18px] font-medium">검사 이력</div>
        <QueryState
          isPending={history.isPending}
          error={history.error}
          isEmpty={(history.data ?? []).length === 0}
          emptyText="검사 이력이 없습니다."
        />
        {(history.data ?? []).length > 0 && (
          <table className="w-max min-w-full text-[18px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={thClass}>검사일</th>
                <th className={thClass}>유효기간</th>
                <th className={thClass}>합격번호</th>
                <th className={thClass}>비고</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((h) => (
                <tr key={h.id} className="border-b border-line">
                  <td className="px-3 py-1.5">{fmtDate(h.inspectedAt)}</td>
                  <td className="px-3 py-1.5">
                    {fmtDate(h.validFrom)} ~ {fmtDate(h.validUntil)}
                  </td>
                  <td className="px-3 py-1.5">{h.certificateNo ?? '-'}</td>
                  <td className="px-3 py-1.5 text-fg-sub">{h.remark ?? '-'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      className="text-[17px] text-danger hover:underline"
                      onClick={() => {
                        if (window.confirm('이 검사 이력을 삭제합니다.'))
                          removeInspection.mutate(h.id);
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
