/**
 * 정책·미확정 값 모음.
 * 관리팀 회신이 오면 이 파일만 고친다. 화면에 하드코딩 금지.
 * confirmed: false 인 항목은 UI에 "회신 대기" 배지가 붙는다.
 */

/** 라벨 인쇄 항목. 스티커 미리보기의 2열 표가 이 순서를 그대로 따른다 */
export type StickerFieldKey =
  | 'assetCode'
  | 'registered'
  | 'category'
  | 'acquisitionDate'
  | 'item'
  | 'modelName'
  | 'supplier'
  | 'department';

export interface StickerFieldOption {
  key: StickerFieldKey;
  label: string;
  confirmed: boolean;
}

export const appConfig = {
  asset: {
    /**
     * 실물이 없어 스티커·라벨 대상이 아닌 계정과목.
     * 서버 스키마에 유형/무형 구분 플래그가 없어 여기서 관리한다.
     * 240 소프트웨어 / 232 특허권 — 현재 11건.
     */
    intangibleAccountCodes: ['240', '232'] as string[],
  },

  sticker: {
    /** 라벨 규격 — A4 라벨지 2열 × 5행 = 10칸 */
    label: {
      widthMm: 80,
      heightMm: 50,
      columns: 2,
      rows: 5,
      confirmed: true,
    },

    /** 인쇄 항목 8개 (2열 표). QR 없음 */
    fields: [
      { key: 'assetCode', label: '자산번호', confirmed: true },
      { key: 'registered', label: '자산등록', confirmed: true },
      { key: 'category', label: '자산구분', confirmed: true },
      { key: 'acquisitionDate', label: '구입일자', confirmed: true },
      { key: 'item', label: '품목', confirmed: true },
      { key: 'modelName', label: '모델명', confirmed: true },
      { key: 'supplier', label: '구매업체', confirmed: true },
      { key: 'department', label: '사용부서', confirmed: true },
    ] as StickerFieldOption[],

    /** QR 미포함으로 확정 */
    includeQr: { value: false, confirmed: true },
  },

  notification: {
    /** [회신 필요] 알림 수신자 */
    recipients: { value: [] as string[], confirmed: false },
    /** [회신 필요] 발송 방식 */
    channel: { value: 'EMAIL' as 'PUSH' | 'EMAIL' | 'SMS', confirmed: false },
  },

  depreciation: {
    /**
     * 무형자산 11건(소프트웨어 10 · 특허권 1)의 상각 기준.
     * 요구사항 3-1 확정 — 국고보조금 자산도 총 취득가액 기준으로 계산하고,
     * 상계는 결산 시 회계팀이 별도 처리한다. 그래서 시스템 값과 결산 후
     * 장부값이 다르며, 서버가 preSettlementBasis: true 로 구분해 준다.
     * (백엔드 회신 2026-08-24 — 당기말 누계 차이 219,004,676원은 전액 이 11건)
     */
    intangibleBasisConfirmed: true,
    /** 과거 연도 분해 데이터 없음. 이 연도부터 실적 누적 */
    yearlyDataAvailableFrom: 2026,
  },
} as const;

/** 라벨지 한 장에 들어가는 칸 수 */
export const labelsPerSheet = (): number =>
  appConfig.sticker.label.columns * appConfig.sticker.label.rows;

/** 미확정 항목 개수 — 헤더 배지용 */
export const unconfirmedCount = (): number =>
  [
    !appConfig.sticker.label.confirmed,
    appConfig.sticker.fields.some((f) => !f.confirmed),
    !appConfig.sticker.includeQr.confirmed,
    !appConfig.notification.recipients.confirmed,
    !appConfig.notification.channel.confirmed,
    !appConfig.depreciation.intangibleBasisConfirmed,
  ].filter(Boolean).length;
