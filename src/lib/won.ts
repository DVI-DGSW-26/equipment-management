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

/**
 * 국고보조금 상계 전 무형자산은 원장상 상각누계액이 기초가액보다 커서
 * 장부가액이 음수로 나온다. 계산 오류가 아니라 원장 값 그대로다
 * (백엔드 확인 2026-08-25). 일반 자산은 상각한도 초과 시 당기 상각비를
 * 0으로 건너뛰는 방어 로직이 있어 음수가 되지 않는다.
 *
 * 음수를 그대로 보여주면 오류로 오해하므로 "-" 로 두고,
 * 사유는 "결산 전 기준" 배지로 알린다.
 */
export const bookValue = (value: Won | null | undefined): string =>
  value != null && Number.isFinite(value) && value < 0 ? '-' : won(value);

export const PRE_SETTLEMENT_NOTE =
  '국고보조금 상계 전 기준이라 장부가액을 표시하지 않습니다. 회계팀 결산 후 정상 범위로 들어옵니다.';

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

/**
 * 최소~최대 구간 안에서의 자리(0~1).
 *
 * 달마다 상각비가 거의 같으면 0 부터 그린 막대는 열두 개가 다 같아 보인다.
 * 그 구간만 확대해 그리려고 쓴다. 결과는 좌표에만 쓰고 금액으로 표시하지 않는다
 * (wonRatio 와 같은 예외). 값이 하나로 몰려 있으면 가운데(0.5)로 둔다.
 *
 * 이 자리를 막대 길이에 쓰면 안 된다 — 막대는 0 에서 시작해야 길이가 금액이 된다.
 * 점과 선(위치로 읽는 그림)에만 쓴다.
 */
export const wonSpan = (value: Won, min: Won, max: Won): number => {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0.5;
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
};

/**
 * 그래프 눈금용 금액. 만 단위까지만 줄인다.
 *
 * wonShort 는 1억이 넘으면 "1.2억" 으로 자르는데, 달마다 몇백만원씩 다른 값이
 * 모두 "1.2억" 이 돼 변동이 지워진다. 눈금에서는 만 자리를 남긴다.
 */
export const wonTick = (value: Won | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  const n = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (n < 10_000) return `${sign}${Math.round(n).toLocaleString('ko-KR')}원`;
  return `${sign}${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`;
};

/**
 * 상각기초가액 = 취득가액 + 자본적지출 증가 누계.
 *
 * "화면에서 금액 산술을 하지 않는다" 규칙의 유일한 예외다. 서버가 합계 필드를 따로 주지 않고
 * acquisitionCost + additionTotal 로 표기하라고 정했다(백엔드 회신 2026-09-01).
 * 덧셈이 화면마다 흩어지지 않도록 여기 한 곳에서만 한다.
 */
export const depreciationBase = (
  acquisitionCost: Won | null | undefined,
  additionTotal: Won | null | undefined,
): Won => (acquisitionCost ?? 0) + (additionTotal ?? 0);

/** 상각률 0.451 → "0.451" (표시 전용) */
export const rateText = (rate: number | null | undefined): string =>
  rate == null || !Number.isFinite(rate) ? '-' : rate.toFixed(3);
