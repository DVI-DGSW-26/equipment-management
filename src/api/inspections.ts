import { request } from './client';
import type { IsoDate } from './types';

export type EquipmentStatus = 'IN_USE' | 'SOLD' | 'DISPOSED';
/** 만료 잔여일 색상: 30일 이하 RED / 90일 이하 ORANGE / 그 외 GREEN */
export type Severity = 'RED' | 'ORANGE' | 'GREEN';

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  IN_USE: '사용중',
  SOLD: '매각',
  DISPOSED: '폐기',
};

/** 안전검사 대상 + 최신 검사 요약 */
export interface SafetyEquipment {
  id: number;
  name: string;
  modelNo: string | null;
  installLocation: string | null;
  capacity: string | null;
  /** 최초 설치일. 첫 검사 기한 = 설치 + 3년 (산안법: 설치 후 3년 이내 최초 검사) */
  installedAt: IsoDate | null;
  /** 검사 주기(개월). 지정하지 않은 대상은 서버가 24를 준다 — 늘 값이 있다 */
  inspectionCycleMonths: number;
  inspectionAgency: string | null;
  team: string | null;
  status: EquipmentStatus;
  statusLabel: string;
  remark: string | null;

  lastInspectedAt: IsoDate | null;
  validFrom: IsoDate | null;
  validUntil: IsoDate | null;
  certificateNo: string | null;
  /**
   * 다음 검사 기한 = 최근 검사일 + 검사 주기.
   * 검사 이력이 없으면 설치일 + 3년(법정 최초 검사 기한)이다.
   * 합격증 유효 만료일(validUntil)과는 다르다 — 발급이 늦거나 유효 시작일을 이전 만료
   * 다음 날로 잡으면 둘이 벌어진다. 기한 관리는 실제 검사일 기준으로 한다.
   */
  nextInspectionDue: IsoDate | null;
  neverInspected: boolean;
  /** 기한까지 남은 일수. 지났으면 음수 */
  daysUntilExpiry: number | null;
  severity: Severity | null;
}

export interface SafetyInspection {
  id: number;
  equipmentId: number;
  inspectedAt: IsoDate;
  validFrom: IsoDate;
  validUntil: IsoDate;
  certificateNo: string | null;
  remark: string | null;
}

export interface SafetySummary {
  totalActive: number;
  overdueCount: number;
  /** 30일 이내 만료 (지난 것 제외) */
  within30Count: number;
  /** 90일 이내 만료 (30일 이내 포함, 지난 것 제외) */
  within90Count: number;
}

export interface SafetyEquipmentQuery {
  status?: EquipmentStatus;
  name?: string;
  team?: string;
}

export interface SaveEquipmentPayload {
  name: string;
  modelNo?: string;
  installLocation?: string;
  capacity?: string;
  installedAt?: IsoDate;
  /** 검사 주기(개월) 1~120. 비우면 서버 기본값 24 */
  inspectionCycleMonths?: number;
  inspectionAgency?: string;
  team?: string;
  status?: EquipmentStatus;
  remark?: string;
}

/** 검사 완료 입력. 만료일을 비우면 서버가 시작일 + 검사 주기 - 1일로 계산한다 */
export interface SaveInspectionPayload {
  inspectedAt: IsoDate;
  validFrom?: IsoDate;
  validUntil?: IsoDate;
  certificateNo?: string;
  remark?: string;
}

export const inspectionsApi = {
  list: (query: SafetyEquipmentQuery = {}) =>
    request<SafetyEquipment[]>('GET', '/safety-equipment', { query }),
  upcoming: (query: { days?: number; includeOverdue?: boolean } = {}) =>
    request<SafetyEquipment[]>('GET', '/safety-equipment/upcoming', { query }),
  summary: () => request<SafetySummary>('GET', '/safety-equipment/summary'),
  detail: (id: number) => request<SafetyEquipment>('GET', `/safety-equipment/${id}`),
  create: (body: SaveEquipmentPayload) =>
    request<SafetyEquipment>('POST', '/safety-equipment', { body }),
  update: (id: number, body: Partial<SaveEquipmentPayload>) =>
    request<void>('PATCH', `/safety-equipment/${id}`, { body }),
  remove: (id: number) => request<void>('DELETE', `/safety-equipment/${id}`),

  inspections: (equipmentId: number) =>
    request<SafetyInspection[]>('GET', `/safety-equipment/${equipmentId}/inspections`),
  addInspection: (equipmentId: number, body: SaveInspectionPayload) =>
    request<SafetyInspection>('POST', `/safety-equipment/${equipmentId}/inspections`, { body }),
  updateInspection: (
    equipmentId: number,
    inspectionId: number,
    body: Partial<SaveInspectionPayload>,
  ) =>
    request<void>('PATCH', `/safety-equipment/${equipmentId}/inspections/${inspectionId}`, { body }),
  removeInspection: (equipmentId: number, inspectionId: number) =>
    request<void>('DELETE', `/safety-equipment/${equipmentId}/inspections/${inspectionId}`),
};
