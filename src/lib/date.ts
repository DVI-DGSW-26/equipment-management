import { format, parseISO } from 'date-fns';
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

/** "2026-08-19 14:03" */
export const fmtDateTime = (v: string | null | undefined): string => {
  if (!v) return '-';
  try {
    return format(parseISO(v), 'yyyy-MM-dd HH:mm');
  } catch {
    return v;
  }
};
