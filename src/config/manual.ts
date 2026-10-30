/**
 * 사용 설명서 (public/manual.pdf) 와 화면별 쪽 번호.
 *
 * 이 파일은 설명서를 만드는 스크립트가 PDF 와 함께 덮어쓴다 — 손으로 고치지 않는다.
 * 설명서 쪽이 바뀌면 PDF 와 이 숫자가 같이 바뀌어야 "?" 가 맞는 쪽을 연다.
 */
export const MANUAL_URL = '/manual.pdf';

export const MANUAL_PAGES = {
  toc: 2,
  approvals: 7,
  me: 6,
  assets: 9,
  assetNew: 11,
  assetDetail: 12,
  physicalAssets: 15,
  equipment: 18,
  depreciation: 19,
  inspections: 21,
  safetyAlerts: 22,
  instruments: 23,
  instrumentDetail: 25,
  instrumentCard: 26,
  gaugeRr: 27,
  gaugeRrDetail: 28,
  calibrationAlerts: 29,
  settings: 31,
} as const;

export type ManualTopic = keyof typeof MANUAL_PAGES;
