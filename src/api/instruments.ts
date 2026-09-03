import { request } from './client';
import { toPage, type IsoDate, type Page, type SpringPage } from './types';

/** 사용부서. ETC 면 departmentEtc 에 직접 입력한다 */
export type InstrumentDepartment = 'PRODUCTION' | 'RND' | 'QC' | 'ETC';

export const INSTRUMENT_DEPARTMENT_LABEL: Record<InstrumentDepartment, string> = {
  PRODUCTION: '생산',
  RND: '연구소',
  QC: 'QC',
  ETC: '기타',
};

/**
 * 계측기 상태.
 *
 * 삭제(DELETE)는 교정 이력과 사진까지 지워 되돌릴 수 없다. 현장에서 못 쓰게 된 것은
 * 폐기로 넘겨야 이력이 남고, 기본 목록·교정계획·알림 대상에서만 빠진다.
 */
export type InstrumentStatus = 'IN_USE' | 'DISCARDED';

/** 목록 행 */
export interface Instrument {
  id: number;
  mgmtNo: string;
  name: string;
  serialNo: string | null;
  specText: string | null;
  accuracy: string | null;
  calibrationCycleMonths: number;
  locationName: string | null;
  userName: string | null;
  lastCalibratedDate: IsoDate | null;
  nextDueDate: IsoDate | null;
  /** 차기 교정일 경과 여부 */
  overdue: boolean;
  status: InstrumentStatus;
  /** 서버가 준 상태 이름 (사용중 / 폐기) */
  statusLabel: string;
  /** 폐기일. 폐기 상태일 때만 */
  discardedAt: IsoDate | null;
  discardReason: string | null;
}

/** 상세 = 측정기 이력카드 헤더 */
export interface InstrumentDetail {
  id: number;
  mgmtNo: string;
  name: string;
  serialNo: string | null;
  maker: string | null;
  specText: string | null;
  accuracy: string | null;
  calibrationCycleMonths: number;
  department: InstrumentDepartment | null;
  departmentDisplay: string | null;
  departmentEtc: string | null;
  locationId: number | null;
  locationName: string | null;
  userName: string | null;
  purchaseDate: IsoDate | null;
  purchasePrice: number | null;
  supplierId: number | null;
  supplierName: string | null;
  /** 연결된 고정자산 */
  assetId: number | null;
  assetName: string | null;
  remark: string | null;
  status: InstrumentStatus;
  statusLabel: string;
  discardedAt: IsoDate | null;
  discardReason: string | null;
  lastCalibratedDate: IsoDate | null;
  nextDueDate: IsoDate | null;
}

export interface InstrumentListQuery {
  keyword?: string;
  locationId?: number;
  /** 비우면 사용중만. DISCARDED 를 주면 폐기내역만 */
  status?: InstrumentStatus;
  /** 0-base */
  page?: number;
  size?: number;
  sort?: string[];
}

export interface CreateInstrumentPayload {
  /** 미입력 시 DVIG-001 형식으로 자동 채번 */
  mgmtNo?: string;
  name: string;
  serialNo?: string;
  maker?: string;
  specText?: string;
  accuracy?: string;
  /** 교정주기(개월). 1년=12, 2년=24 */
  calibrationCycleMonths: number;
  department?: InstrumentDepartment;
  departmentEtc?: string;
  locationId?: number;
  /**
   * 사용위치·구매처를 이름으로 그대로 보낸다.
   *
   * 이름을 주면 서버가 ID 보다 먼저 보고, 마스터에 없는 이름이면 새로 만들어 이어 준다.
   * 손으로 치는 칸이라 마스터에 미리 등록해 두지 않아도 된다 (백엔드 회신 2026-09-03).
   * 기존 ID 방식도 그대로 살아 있다.
   */
  locationName?: string;
  userName?: string;
  purchaseDate?: IsoDate;
  purchasePrice?: number;
  supplierId?: number;
  supplierName?: string;
  assetId?: number;
  remark?: string;
}

export interface DiscardInstrumentPayload {
  /** 폐기일. 비우면 서버가 오늘로 적는다 */
  discardedAt?: IsoDate;
  reason?: string;
}

export type UpdateInstrumentPayload = Partial<Omit<CreateInstrumentPayload, 'mgmtNo'>>;

export const instrumentsApi = {
  list: (query: InstrumentListQuery = {}) =>
    request<SpringPage<Instrument>>('GET', '/instrument', { query }).then(toPage) as Promise<
      Page<Instrument>
    >,
  detail: (id: number) => request<InstrumentDetail>('GET', `/instrument/${id}`),
  create: (body: CreateInstrumentPayload) => request<void>('POST', '/instrument', { body }),
  update: (id: number, body: UpdateInstrumentPayload) =>
    request<void>('PATCH', `/instrument/${id}`, { body }),
  /** 현장 폐기. 이력은 남고 기본 목록에서만 빠진다 */
  discard: (id: number, body: DiscardInstrumentPayload = {}) =>
    request<void>('PATCH', `/instrument/${id}/discard`, { body }),
  /** 오폐기 정정 */
  restore: (id: number) => request<void>('PATCH', `/instrument/${id}/restore`),
  /** 오입력 정리용 완전 삭제. 교정 이력·첨부까지 사라진다 */
  remove: (id: number) => request<void>('DELETE', `/instrument/${id}`),
};
