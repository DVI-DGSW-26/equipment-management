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
  lastCalibratedDate: IsoDate | null;
  nextDueDate: IsoDate | null;
}

export interface InstrumentListQuery {
  keyword?: string;
  locationId?: number;
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
  userName?: string;
  purchaseDate?: IsoDate;
  purchasePrice?: number;
  supplierId?: number;
  assetId?: number;
  remark?: string;
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
  remove: (id: number) => request<void>('DELETE', `/instrument/${id}`),
};
