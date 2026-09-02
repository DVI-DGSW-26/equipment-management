import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { IsoDate } from '@/api/types';

export const getToday = (): Date => new Date();

export const toIsoDate = (d: Date): IsoDate => format(d, 'yyyy-MM-dd');

export const currentYear = (): number => new Date().getFullYear();

/** "2026-08-19" 표시. 값이 없으면 "-", 파싱 실패면 원문 */
export const fmtDate = (v: IsoDate | null | undefined): string => {
  if (!v) return '-';
  try {
    return format(parseISO(v), 'yyyy-MM-dd');
  } catch {
    return v;
  }
};

/**
 * 오늘부터 그날까지 남은 일수. 이미 지났으면 음수, 날짜가 없으면 null.
 * 서버가 남은 일수를 주는 목록(안전검사)은 그 값을 쓰고, 안 주는 목록(계측기)에서만 쓴다.
 */
export const daysUntil = (v: IsoDate | null | undefined): number | null => {
  if (!v) return null;
  try {
    return differenceInCalendarDays(parseISO(v), getToday());
  } catch {
    return null;
  }
};

/** "2026-08-19 14:03" */
export const fmtDateTime = (v: string | null | undefined): string => {
  if (!v) return '-';
  try {
    return format(parseISO(v), 'yyyy-MM-dd HH:mm');
  } catch {
    return v;
  }
};
