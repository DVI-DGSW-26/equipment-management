import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { inspectionsApi, type SafetyEquipment } from '@/api/inspections';
import { calibrationsApi } from '@/api/calibrations';
import { queryKeys } from '@/api/queryKeys';
import type { IsoDate } from '@/api/types';
import { levelOf } from '@/domain/dday';
import { toIsoDate } from '@/lib/date';
import { useToast } from '@/components/toastContext';
import Modal from '@/components/Modal';
import { btnClass, btnPrimaryClass, Field, inputClass, Section } from '@/components/ui';
import DetailModal from './DetailModal';

/**
 * 교정·안전검사 일정을 한 달력에 모아 본다.
 *
 * 날짜는 전부 서버가 준 값을 그대로 쓴다 (기한 계산을 프론트에서 하지 않는다).
 * 칸을 누르면 그 날짜로 안전검사 결과를 바로 등록할 수 있다.
 */
type EventKind = 'safetyDue' | 'safetyDone' | 'calPlan' | 'calDone';

const KIND_LABEL: Record<EventKind, string> = {
  safetyDue: '안전검사 기한',
  safetyDone: '안전검사 실시',
  calPlan: '교정 계획',
  calDone: '교정 실시',
};

/** 실시 이력은 지나간 일이라 눈에 덜 띄게, 기한은 남은 일수에 따라 색이 바뀐다 */
const KIND_CLASS: Record<EventKind, string> = {
  safetyDue: 'border-line bg-surface',
  safetyDone: 'border-line bg-bg text-fg-muted',
  calPlan: 'border-accent/40 bg-accent/10 text-accent',
  calDone: 'border-line bg-bg text-fg-muted',
};

/** 안전검사 기한만 잔여일 색을 따로 입힌다 */
const DUE_CLASS: Record<'danger' | 'warn' | 'safe', string> = {
  danger: 'border-danger/40 bg-danger/10 text-danger font-medium',
  warn: 'border-warn/40 bg-warn/10 text-warn font-medium',
  safe: 'border-ok/40 bg-ok/10 text-ok',
};

interface CalEvent {
  kind: EventKind;
  date: IsoDate;
  title: string;
  sub: string | null;
  equipment?: SafetyEquipment;
  instrumentId?: number;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarTab() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [shown, setShown] = useState<Record<EventKind, boolean>>({
    safetyDue: true,
    safetyDone: true,
    calPlan: true,
    calDone: true,
  });
  const [selected, setSelected] = useState<SafetyEquipment | null>(null);
  const [addOn, setAddOn] = useState<IsoDate | null>(null);

  const today = toIsoDate(new Date());

  // 달력 격자는 앞뒤 달 며칠씩을 물고 있어 해가 걸칠 수 있다
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );
  const years = useMemo(
    () => [...new Set([gridStart.getFullYear(), gridEnd.getFullYear()])],
    [gridStart, gridEnd],
  );

  const equipment = useQuery({
    queryKey: queryKeys.inspections.list({}),
    queryFn: () => inspectionsApi.list({}),
  });
  const equipmentList = useMemo(() => equipment.data ?? [], [equipment.data]);

  // 실시 이력은 대상별로만 조회할 수 있다. 대상이 십여 건이라 이대로도 부담이 없다
  const histories = useQueries({
    queries: equipmentList.map((e) => ({
      queryKey: queryKeys.inspections.history(e.id),
      queryFn: () => inspectionsApi.inspections(e.id),
      staleTime: 10 * 60_000,
    })),
  });

  const calibrations = useQueries({
    queries: years.map((y) => ({
      queryKey: queryKeys.calibrations.annual(y),
      queryFn: () => calibrationsApi.annual(y),
      staleTime: 10 * 60_000,
    })),
  });

  const events = useMemo(() => {
    const out: CalEvent[] = [];

    equipmentList.forEach((e, i) => {
      if (e.nextInspectionDue) {
        out.push({
          kind: 'safetyDue',
          date: e.nextInspectionDue,
          title: e.name,
          sub: e.team ?? e.installLocation,
          equipment: e,
        });
      }
      (histories[i]?.data ?? []).forEach((h) => {
        out.push({
          kind: 'safetyDone',
          date: h.inspectedAt,
          title: e.name,
          sub: h.certificateNo,
          equipment: e,
        });
      });
    });

    calibrations.forEach((q) => {
      (q.data ?? []).forEach((c) => {
        if (c.planDate) {
          out.push({
            kind: 'calPlan',
            date: c.planDate,
            title: c.name,
            sub: c.mgmtNo,
            instrumentId: c.instrumentId,
          });
        }
        if (c.performedDate) {
          out.push({
            kind: 'calDone',
            date: c.performedDate,
            title: c.name,
            sub: c.mgmtNo,
            instrumentId: c.instrumentId,
          });
        }
      });
    });

    return out;
  }, [equipmentList, histories, calibrations]);

  const byDate = useMemo(() => {
    const map = new Map<IsoDate, CalEvent[]>();
    events
      .filter((e) => shown[e.kind])
      .forEach((e) => {
        const list = map.get(e.date);
        if (list) list.push(e);
        else map.set(e.date, [e]);
      });
    return map;
  }, [events, shown]);

  const counts = useMemo(() => {
    const c = { safetyDue: 0, safetyDone: 0, calPlan: 0, calDone: 0 } as Record<EventKind, number>;
    events.forEach((e) => {
      if (isSameMonth(parseISO(e.date), cursor)) c[e.kind] += 1;
    });
    return c;
  }, [events, cursor]);

  const loading =
    equipment.isPending ||
    histories.some((h) => h.isPending) ||
    calibrations.some((c) => c.isPending);

  const openEvent = (e: CalEvent) => {
    if (e.equipment) setSelected(e.equipment);
    else if (e.instrumentId) void navigate(`/instruments/${e.instrumentId}`);
  };

  return (
    <div className="space-y-3">
      <Section
        title={format(cursor, 'yyyy년 M월')}
        right={
          <>
            <button
              type="button"
              className={btnClass}
              onClick={() => setCursor(addMonths(cursor, -1))}
            >
              ← 이전 달
            </button>
            <button
              type="button"
              className={btnClass}
              onClick={() => setCursor(startOfMonth(new Date()))}
            >
              이번 달
            </button>
            <button
              type="button"
              className={btnClass}
              onClick={() => setCursor(addMonths(cursor, 1))}
            >
              다음 달 →
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2">
          {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
            <label key={k} className="flex items-center gap-2 whitespace-nowrap text-[18px]">
              <input
                type="checkbox"
                checked={shown[k]}
                onChange={() => setShown({ ...shown, [k]: !shown[k] })}
              />
              <span className={`rounded-sm border px-1.5 py-0.5 text-[17px] ${KIND_CLASS[k]}`}>
                {KIND_LABEL[k]}
              </span>
              <span className="text-fg-muted">이번 달 {counts[k]}건</span>
            </label>
          ))}
          <span className="ml-auto text-[18px] text-fg-muted">
            {loading ? '불러오는 중…' : '날짜 오른쪽 + 를 누르면 그 날짜로 검사 결과를 등록합니다'}
          </span>
        </div>

        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-line bg-bg text-[18px] text-fg-sub">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`px-2 py-1.5 text-center ${i === 0 ? 'text-danger' : i === 6 ? 'text-accent' : ''}`}
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const iso = toIsoDate(d);
              const inMonth = isSameMonth(d, cursor);
              const list = byDate.get(iso) ?? [];
              return (
                <div
                  key={iso}
                  className={`min-h-28 border-r border-b border-line p-1 last:border-r-0 ${
                    inMonth ? '' : 'bg-bg/60'
                  } ${iso === today ? 'bg-accent/5 ring-1 ring-accent ring-inset' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-1 text-[18px] ${
                        inMonth ? 'text-fg' : 'text-fg-muted'
                      } ${iso === today ? 'font-semibold text-accent' : ''}`}
                    >
                      {d.getDate()}
                    </span>
                    <button
                      type="button"
                      className="px-1 text-[18px] leading-none text-fg-muted hover:text-accent"
                      title={`${iso} 로 안전검사 결과 등록`}
                      aria-label={`${iso} 로 안전검사 결과 등록`}
                      onClick={() => setAddOn(iso)}
                    >
                      +
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {list.map((e, i) => (
                      <button
                        key={`${e.kind}-${e.title}-${i}`}
                        type="button"
                        onClick={() => openEvent(e)}
                        title={`${KIND_LABEL[e.kind]} — ${e.title}${e.sub ? ` (${e.sub})` : ''}`}
                        className={`block w-full truncate rounded-sm border px-1 py-0.5 text-left text-[17px] hover:opacity-80 ${
                          e.kind === 'safetyDue' && e.equipment
                            ? DUE_CLASS[levelOf(e.equipment.severity)]
                            : KIND_CLASS[e.kind]
                        }`}
                      >
                        {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {selected && <DetailModal equipment={selected} onClose={() => setSelected(null)} />}
      {addOn && (
        <QuickInspectionModal
          date={addOn}
          equipment={equipmentList}
          onClose={() => setAddOn(null)}
        />
      )}
    </div>
  );
}

/** 달력에서 바로 검사 결과를 넣는 간이 입력. 상세 화면의 등록과 같은 API 를 쓴다 */
function QuickInspectionModal({
  date,
  equipment,
  onClose,
}: {
  date: IsoDate;
  equipment: SafetyEquipment[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [equipmentId, setEquipmentId] = useState<number | ''>('');
  const [inspectedAt, setInspectedAt] = useState(date);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [certificateNo, setCertificateNo] = useState('');
  const [remark, setRemark] = useState('');

  const add = useMutation({
    mutationFn: () =>
      inspectionsApi.addInspection(Number(equipmentId), {
        inspectedAt,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
        certificateNo: certificateNo || undefined,
        remark: remark || undefined,
      }),
    onSuccess: () => {
      toast.ok('검사 이력을 등록했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.inspections.all });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={`${date} 안전검사 결과 등록`}
      width={620}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={add.isPending || equipmentId === ''}
            onClick={() => add.mutate()}
          >
            등록
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="검사 대상" required>
          <select
            className={inputClass}
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">선택하세요</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.installLocation ? ` — ${e.installLocation}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="검사일" required>
            <input
              type="date"
              className={inputClass}
              value={inspectedAt}
              onChange={(e) => setInspectedAt(e.target.value)}
            />
          </Field>
          <Field label="유효 시작">
            <input
              type="date"
              className={inputClass}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </Field>
          <Field label="유효 만료" hint="비우면 시작일 + 2년 - 1일">
            <input
              type="date"
              className={inputClass}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </Field>
        </div>
        <Field label="성적서 번호">
          <input
            className={inputClass}
            value={certificateNo}
            onChange={(e) => setCertificateNo(e.target.value)}
          />
        </Field>
        <Field label="비고">
          <input className={inputClass} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
