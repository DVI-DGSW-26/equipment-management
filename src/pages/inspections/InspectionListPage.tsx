import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inspectionsApi,
  EQUIPMENT_STATUS_LABEL,
  type EquipmentStatus,
  type SafetyEquipment,
  type SaveEquipmentPayload,
  type SaveInspectionPayload,
} from '@/api/inspections';
import { queryKeys } from '@/api/queryKeys';
import { byDueAsc, DDAY_CLASS, ddayLabel, levelOf, notificationSchedule } from '@/domain/dday';
import { notificationsApi } from '@/api/notifications';
import { fmtDate, toIsoDate } from '@/lib/date';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Def,
  Field,
  inputClass,
  QueryState,
  Section,
  StatCards,
  thClass,
} from '@/components/ui';

/**
 * 기한 필터. 임계값은 서버 요약(overdueCount / within30Count / within90Count)과
 * 같은 기준이라 카드 숫자와 목록 건수가 어긋나지 않는다.
 * 남은 일수는 서버가 준 daysUntilExpiry 를 그대로 쓴다 (프론트에서 날짜 계산 금지).
 */
type DueFilter = 'all' | 'overdue' | 'within30' | 'within90';

const matchesDue = (e: SafetyEquipment, f: DueFilter): boolean => {
  if (f === 'all') return true;
  const d = e.daysUntilExpiry;
  if (d == null) return false;
  if (f === 'overdue') return d < 0;
  if (f === 'within30') return d >= 0 && d <= 30;
  return d >= 0 && d <= 90;
};

export default function InspectionListPage() {
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<EquipmentStatus | ''>('IN_USE');
  const [due, setDue] = useState<DueFilter>('all');
  const [selected, setSelected] = useState<SafetyEquipment | null>(null);
  const [creating, setCreating] = useState(false);

  // 담당반은 서버 필터를 그대로 쓴다. 대상이 13건뿐이라 기한 필터만 목록에서 거른다
  const query = useMemo(
    () => ({
      team: team || undefined,
      status: status || undefined,
    }),
    [team, status],
  );

  const summary = useQuery({
    queryKey: queryKeys.inspections.summary(),
    queryFn: () => inspectionsApi.summary(),
  });
  const list = useQuery({
    queryKey: queryKeys.inspections.list(query),
    queryFn: () => inspectionsApi.list(query),
  });

  const all = useMemo(() => [...(list.data ?? [])].sort(byDueAsc), [list.data]);
  const rows = useMemo(() => all.filter((e) => matchesDue(e, due)), [all, due]);

  /** 담당반 선택지는 실제 등록된 값에서 뽑는다. 마스터 API 가 따로 없다 */
  const teams = useMemo(
    () => [...new Set((list.data ?? []).map((e) => e.team).filter((t): t is string => !!t))].sort(),
    [list.data],
  );

  const card = (label: string, key: DueFilter, count: number, tone?: 'danger' | 'warn') => ({
    label,
    value: `${count}건`,
    tone: count > 0 ? tone : undefined,
    active: due === key,
    onClick: () => setDue(due === key ? 'all' : key),
  });

  return (
    <div className="space-y-3">
      {/* 요구사항 4-4 — 30일·90일 이내 건수 상시 표시. 눌러서 그 대상만 볼 수 있다 */}
      <StatCards
        cards={[
          {
            label: '사용중 대상',
            value: `${summary.data?.totalActive ?? 0}건`,
            active: due === 'all',
            onClick: () => setDue('all'),
          },
          card('기한 경과', 'overdue', summary.data?.overdueCount ?? 0, 'danger'),
          card('30일 이내', 'within30', summary.data?.within30Count ?? 0, 'danger'),
          card('90일 이내', 'within90', summary.data?.within90Count ?? 0, 'warn'),
        ]}
      />

      <Section
        title={
          <>
            안전검사 대상{' '}
            <span className="font-normal text-fg-muted">
              {rows.length}건{due !== 'all' && ' · 기한 필터 적용 중'}
            </span>
          </>
        }
        right={
          <>
            <select
              className={`${inputClass} w-32`}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">담당반 전체</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className={`${inputClass} w-32`}
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipmentStatus | '')}
            >
              <option value="IN_USE">사용중만</option>
              <option value="">매각·폐기 포함</option>
            </select>
            <button type="button" className={btnPrimaryClass} onClick={() => setCreating(true)}>
              대상 등록
            </button>
          </>
        }
      >
        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText={
            due === 'all'
              ? '조건에 맞는 대상이 없습니다.'
              : '해당 기한에 걸리는 대상이 없습니다. 위 카드를 다시 눌러 전체를 봅니다.'
          }
        />
        {rows.length > 0 && (
          <table className="w-full text-[19px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={thClass}>기한</th>
                <th className={thClass}>D-day</th>
                <th className={thClass}>대상품명</th>
                <th className={thClass}>형식번호</th>
                <th className={thClass}>설치장소</th>
                <th className={thClass}>용량</th>
                <th className={thClass}>담당반</th>
                <th className={thClass}>최근 검사일</th>
                <th className={thClass}>합격번호</th>
                <th className={thClass}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="cursor-pointer border-b border-line hover:bg-bg"
                >
                  <td className="px-3 py-2">{fmtDate(e.nextInspectionDue)}</td>
                  <td className={`px-3 py-2 ${DDAY_CLASS[levelOf(e.severity)]}`}>
                    {ddayLabel(e.daysUntilExpiry)}
                    {e.neverInspected && (
                      <span className="ml-1">
                        <Badge tone="warn">최초 검사 전</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{e.name}</td>
                  <td className="px-3 py-2">{e.modelNo ?? '-'}</td>
                  <td className="px-3 py-2">{e.installLocation ?? '-'}</td>
                  <td className="px-3 py-2">{e.capacity ?? '-'}</td>
                  <td className="px-3 py-2">{e.team ?? '-'}</td>
                  <td className="px-3 py-2">{fmtDate(e.lastInspectedAt)}</td>
                  <td className="px-3 py-2">{e.certificateNo ?? '-'}</td>
                  <td className="px-3 py-2">{e.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {selected && <DetailModal equipment={selected} onClose={() => setSelected(null)} />}
      {creating && <EquipmentModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ---------- 상세: 검사 이력 + 결과 등록 + 알림 예정일 ---------- */

function DetailModal({
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
      width={720}
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
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-sm border border-line">
          <Def label="형식번호">{equipment.modelNo ?? '-'}</Def>
          <Def label="설치장소">{equipment.installLocation ?? '-'}</Def>
          <Def label="용량">{equipment.capacity ?? '-'}</Def>
          <Def label="담당반">{equipment.team ?? '-'}</Def>
          <Def label="검사기관">{equipment.inspectionAgency ?? '-'}</Def>
          <Def label="최초 설치일">{fmtDate(equipment.installedAt)}</Def>
          <Def label="검사 유효기간">
            {equipment.validFrom || equipment.validUntil
              ? `${fmtDate(equipment.validFrom)} ~ ${fmtDate(equipment.validUntil)}`
              : '-'}
          </Def>
          <Def label="다음 검사 기한">{fmtDate(equipment.nextInspectionDue)}</Def>
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
            <div className="grid grid-cols-2 gap-2">
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
          <table className="w-full text-[18px]">
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

/* ---------- 대상 등록·수정 ---------- */

function EquipmentModal({
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
            disabled={save.isPending || form.name.trim() === ''}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
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
