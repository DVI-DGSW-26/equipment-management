import type { DepreciationMethod } from '@/api/assets';
import type { AssetAccount, DepreciationRate } from '@/api/masters';

/**
 * 계정과목별 허용 상각방법.
 * 값 자체는 마스터(API)에서 오고, 여기서는 조회만 한다.
 * 세법 제약이라 위반하면 서버가 400 을 반환한다.
 * 마스터 응답이 비어 있을 때만 정액법으로 안전하게 떨어진다.
 */
export const allowedMethods = (
  accounts: AssetAccount[],
  accountId: number | null,
): DepreciationMethod[] => {
  const found = accounts.find((a) => a.id === accountId);
  return found?.allowedMethods?.length ? found.allowedMethods : ['STRAIGHT_LINE'];
};

/**
 * 계정과목을 골랐을 때 기본으로 잡을 상각방법.
 *
 * 마스터의 allowedMethods 는 정률법이 앞에 오는 경우가 많은데(기계장치·비품 등 6개 계정),
 * 실무는 전 자산이 정액법이다(요구사항 3-2 "현재 정률법 적용 대상은 없습니다").
 * 그래서 허용 목록에 정액법이 있으면 그것을 먼저 고른다.
 */
export const defaultMethod = (
  accounts: AssetAccount[],
  accountId: number | null,
): DepreciationMethod => {
  const allowed = allowedMethods(accounts, accountId);
  return allowed.includes('STRAIGHT_LINE') ? 'STRAIGHT_LINE' : allowed[0];
};

/**
 * 상각률 조회. 내용연수 × 상각방법 조합으로 마스터에서 찾는다.
 * 사용자가 입력하지 않으며, 코드에 상수로 두지 않는다.
 * 조합이 없으면 null → 화면에 "마스터에 등록되지 않은 조합" 표시.
 */
export const lookupRate = (
  rates: DepreciationRate[],
  usefulLifeYears: number | null,
  method: DepreciationMethod | null,
): number | null => {
  if (usefulLifeYears == null || method == null || method === 'NONE') return null;
  const row = rates.find((r) => r.usefulLifeYears === usefulLifeYears);
  if (!row) return null;
  return method === 'STRAIGHT_LINE' ? row.straightLineRate : row.decliningBalanceRate;
};

/** 회계 담당자 미확인 상각률이 하나라도 있으면 화면에 초안 배지를 띄운다 */
export const hasUnverifiedRate = (rates: DepreciationRate[]): boolean =>
  rates.some((r) => !r.verified);
