/**
 * 비품 자산코드 표시 규칙.
 * 채번은 서버가 한다 (비품에 위치를 넣고 저장할 때 확정).
 * 여기서는 화면 표시와 입력 가능 여부 판정만 다룬다.
 *
 * 고정자산은 8단 자산코드를 쓰지 않는다 — 회계 자산코드(accountingCode)만 있다 (백엔드 2026-10-29).
 */

/** 비품. 이 자산구분일 때만 비품구분/품목 코드가 존재한다 */
export const SUPPLIES_CATEGORY = 'P05';

export const isSuppliesItemEnabled = (categoryCode: string | null | undefined): boolean =>
  categoryCode === SUPPLIES_CATEGORY;

/** 목록·상세의 자산코드 셀. 코드가 없으면 "미부여" */
export const codeText = (assetCode: string | null | undefined): string =>
  assetCode && assetCode.trim() !== '' ? assetCode : '미부여';

/** 고정자산의 회계 자산코드 칸. 없으면 "-" */
export const accountingCodeText = (code: string | null | undefined): string =>
  code && code.trim() !== '' ? code : '-';
