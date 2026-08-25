import type { Won } from '@/api/types';

/**
 * 금액 표시 전용 포맷터.
 * 합계·상각비·장부가액은 전부 서버 계산값을 그대로 출력한다. 화면에서 금액 산술을 하지 않는다.
 * (막대 차트 길이 비율만 예외 — wonRatio)
 */
export const won = (value: Won | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('ko-KR');
};

/** 1397960000 → "1,397,960,000원" */
export const wonUnit = (value: Won | null | undefined): string => {
  const v = won(value);
  return v === '-' ? v : `${v}원`;
};

/** 큰 금액을 표 헤더·차트 축에 짧게: 12.3억 / 4,560만 */
export const wonShort = (value: Won | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  const n = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (n >= 100_000_000) return `${sign}${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${sign}${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(n).toLocaleString('ko-KR')}`;
};

/**
 * 막대 차트 길이 비율(0~1)만 계산한다.
 * 결과는 CSS width 에만 쓰고, 화면에 금액으로 표시하지 않는다.
 */
export const wonRatio = (value: Won, max: Won): number => {
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / max);
};

/** 상각률 0.451 → "0.451" (표시 전용) */
export const rateText = (rate: number | null | undefined): string =>
  rate == null || !Number.isFinite(rate) ? '-' : rate.toFixed(3);
