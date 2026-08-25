/**
 * 자산코드 표시 규칙.
 * 채번은 서버가 한다 (GET /asset/code-preview, 저장 시 확정).
 * 여기서는 화면 표시와 입력 가능 여부 판정만 다룬다.
 */

/** 비품. 이 자산구분일 때만 비품구분/품목 코드가 존재한다 */
export const SUPPLIES_CATEGORY = 'P05';

export const isSuppliesItemEnabled = (categoryCode: string | null | undefined): boolean =>
  categoryCode === SUPPLIES_CATEGORY;

/** 목록·상세의 자산코드 셀. 코드가 없으면 "미부여" */
export const codeText = (assetCode: string | null | undefined): string =>
  assetCode && assetCode.trim() !== '' ? assetCode : '미부여';

/** 코드 미부여 사유. 위치가 정해지면 서버가 자동 채번한다 */
export const NO_CODE_REASON =
  '사용위치가 확정되지 않아 자산코드가 부여되지 않았습니다. 위치를 지정하면 저장 시 자동 채번됩니다.';

/** 기존 자료에서 넘어온 7단 코드(일련번호 없음) 안내 */
export const SEQUENCE_MISSING_REASON =
  '기존 자료의 7단 코드입니다. 일련번호가 없어 스티커·목록표에서 구분이 어려울 수 있습니다.';

/** 스티커 출력 대상 여부. 코드 미부여·출력 제외 자산은 서버가 건너뛴다 */
export const isPrintable = (a: {
  assetCode: string | null;
  excludedFromPrint: boolean;
}): boolean => !!a.assetCode && !a.excludedFromPrint;
