import { format, isAfter, parseISO, subDays } from 'date-fns';
import type { IsoDate } from '@/api/types';
import type { Severity } from '@/api/inspections';
import { getToday } from '@/lib/date';

export type DdayLevel = 'danger' | 'warn' | 'safe';

/** 서버가 내려주는 severity 를 화면 색상 등급으로 바꾼다. 임계값 판정은 서버가 한다 */
export const levelOf = (severity: Severity | null | undefined): DdayLevel =>
  severity === 'RED' ? 'danger' : severity === 'ORANGE' ? 'warn' : 'safe';

/** 요구사항 4-4 — 30일 이하 빨강 / 90일 이하 주황 / 그 외 초록 */
export const DDAY_CLASS: Record<DdayLevel, string> = {
  danger: 'text-danger font-semibold',
  warn: 'text-warn font-medium',
  safe: 'text-ok',
};

/** "D-59" / "D-DAY" / "D+3" (만료 경과) */
export const ddayLabel = (days: number | null | undefined): string =>
  days == null ? '-' : days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;

export interface NotificationSlot {
  offsetDays: number;
  /** 만료일에서 역산한 발송 예정일 */
  scheduledAt: IsoDate;
  /** 오늘 기준으로 지났으면 발송됨 */
  sent: boolean;
}

/** 만료일 - offsetDays. offsets 는 서버 설정(GET /notification/settings)에서 받는다 */
export const notificationSchedule = (
  validUntil: IsoDate,
  offsets: readonly number[],
  today: Date = getToday(),
): NotificationSlot[] =>
  [...offsets]
    .sort((a, b) => b - a)
    .map((offsetDays) => {
      const at = subDays(parseISO(validUntil), offsetDays);
      return {
        offsetDays,
        scheduledAt: format(at, 'yyyy-MM-dd'),
        sent: !isAfter(at, today),
      };
    });

/** 기한 오름차순. 급한 건이 위로. 기한 없는 건은 뒤로 */
export const byDueAsc = <T extends { nextInspectionDue: IsoDate | null }>(a: T, b: T): number =>
  (a.nextInspectionDue ?? '9999-12-31').localeCompare(b.nextInspectionDue ?? '9999-12-31');
