import { request } from './client';
import type { IsoDate } from './types';

export type CalibrationResult = 'PASS' | 'FAIL';

export const CALIBRATION_RESULT_LABEL: Record<CalibrationResult, string> = {
  PASS: '합격',
  FAIL: '불합격',
};

/** 교정 이력 = 측정기 이력카드 HISTORY 행 */
export interface Calibration {
  id: number;
  instrumentId: number;
  instrumentMgmtNo: string;
  instrumentName: string;
  planYear: number;
  planDate: IsoDate | null;
  performedDate: IsoDate | null;
  nextDueDate: IsoDate | null;
  result: CalibrationResult | null;
  /** 결과 표기 (O / X) */
  resultMark: string | null;
  /** 수리여부. 이력카드의 "수리여부" 칸 */
  repaired: boolean | null;
  agencyId: number | null;
  agencyName: string | null;
  certificateNo: string | null;
  cost: number | null;
  actionNote: string | null;
  confirmedBy: string | null;
  remark: string | null;
  performed: boolean;
}

/** 연간 교정검사 LIST 행 */
export interface AnnualCalibration {
  calibrationId: number;
  instrumentId: number;
  mgmtNo: string;
  name: string;
  serialNo: string | null;
  specText: string | null;
  accuracy: string | null;
  calibrationCycleMonths: number;
  planDate: IsoDate | null;
  performedDate: IsoDate | null;
  resultMark: string | null;
  locationName: string | null;
  userName: string | null;
  remark: string | null;
}

export interface AnnualPlanGeneration {
  planYear: number;
  created: number;
  /** 이미 존재해 건너뛴 건수 */
  skipped: number;
}

export interface SaveCalibrationPayload {
  planYear: number;
  /** 계획 없이 실시한 경우 비운다 */
  planDate?: IsoDate;
  /** 미실시면 비운다 */
  performedDate?: IsoDate;
  result?: CalibrationResult;
  agencyId?: number;
  certificateNo?: string;
  cost?: number;
  repaired?: boolean;
  actionNote?: string;
  confirmedBy?: string;
  remark?: string;
}

export const calibrationsApi = {
  byInstrument: (instrumentId: number) =>
    request<Calibration[]>('GET', `/calibration/instrument/${instrumentId}`),
  create: (instrumentId: number, body: SaveCalibrationPayload) =>
    request<void>('POST', `/calibration/instrument/${instrumentId}`, { body }),
  detail: (id: number) => request<Calibration>('GET', `/calibration/${id}`),
  update: (id: number, body: Partial<SaveCalibrationPayload>) =>
    request<void>('PATCH', `/calibration/${id}`, { body }),
  remove: (id: number) => request<void>('DELETE', `/calibration/${id}`),

  annual: (planYear: number) =>
    request<AnnualCalibration[]>('GET', '/calibration/annual', { query: { planYear } }),
  /** 연간 교정계획 일괄 생성. 이미 있는 건은 건너뛴다 */
  generateAnnual: (planYear: number) =>
    request<AnnualPlanGeneration>('POST', '/calibration/annual', { query: { planYear } }),
};
