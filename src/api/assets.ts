import { request, requestFile, type DownloadResult } from './client';
import { toPage, type IsoDate, type IsoDateTime, type Page, type SpringPage, type Won } from './types';

export type AssetStatus = 'IN_USE' | 'DISPOSED' | 'SOLD';
export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'NONE';
export type ExpenseType = 'MANUFACTURING' | 'SGA';

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  IN_USE: '사용중',
  DISPOSED: '폐기',
  SOLD: '매각',
};

export const DEPRECIATION_METHOD_LABEL: Record<DepreciationMethod, string> = {
  STRAIGHT_LINE: '정액법',
  DECLINING_BALANCE: '정률법',
  NONE: '상각안함',
};

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  MANUFACTURING: '제조',
  SGA: '판관',
};

/**
 * 고정자산 1건. 목록·상세가 같은 스키마(AssetResponse)다.
 * 필드명은 서버 스키마를 그대로 쓴다 — Swagger 와 대조하기 쉽게.
 */
export interface Asset {
  id: number;
  /** 8단 자산코드. 위치 미확정이면 null */
  assetCode: string | null;
  /** 기존 자료의 7단 코드(일련번호 없음) 여부 */
  sequenceMissing: boolean;
  equipmentCode: string | null;
  /** 계측기 관리번호 (병행 관리) */
  instrumentMgmtNo: string | null;

  accountCode: string;
  accountName: string;
  name: string;
  acquisitionDate: IsoDate;
  quantity: number;
  /** 기초가액(취득가액) */
  acquisitionCost: Won;
  status: AssetStatus;
  statusLabel: string;
  /** 목록표·스티커 출력 제외 (금형 등) */
  excludedFromPrint: boolean;
  /** 자산등록 여부 — 스티커의 '자산등록 O/X'. 고정자산은 대장 등재분이라 항상 true */
  registered: boolean;

  /** 전기말상각누계액 */
  priorAccumulated: Won;
  /** 당기상각비범위액 = 회사계상상각비 */
  currentYearDepreciation: Won;
  /** 당기말상각누계액 */
  accumulatedDepreciation: Won;
  /** 당기말장부가액 */
  bookValue: Won;
  /** 무형자산 국고보조금 미반영 — 결산 전 기준 표시 */
  preSettlementBasis: boolean;

  categoryCode: string | null;
  categoryName: string | null;
  itemTypeCode: string | null;
  itemCode: string | null;
  locationCode: string | null;
  locationName: string | null;
  usingDeptCode: string | null;
  usingDeptName: string | null;
  managingDeptCode: string | null;
  managingDeptName: string | null;

  expenseType: string | null;
  expenseTypeCode: string | null;
  depreciationMethod: DepreciationMethod | null;
  depreciationMethodLabel: string | null;
  usefulLifeYears: number | null;
  /** 자산 지정 상각률. null 이면 마스터 적용 */
  depreciationRate: number | null;
  openingFiscalYear: number | null;
  openingAccumulatedDepreciation: Won | null;

  supplier: string | null;
  assignee: string | null;
  modelName: string | null;
  spec: string | null;
  disposalDate: IsoDate | null;
  remark: string | null;
}

/** 목록·요약·내보내기가 같은 필터를 쓴다 */
export interface AssetFilter {
  accountId?: number;
  usingDeptId?: number;
  locationId?: number;
  acquiredFrom?: IsoDate;
  acquiredTo?: IsoDate;
  assetCode?: string;
  /** 자산명 부분일치 */
  name?: string;
  status?: AssetStatus;
  costFrom?: number;
  costTo?: number;
}

export interface AssetListQuery extends AssetFilter {
  /** 0-base */
  page?: number;
  size?: number;
  sort?: string[];
}

export interface AssetSummary {
  totalCount: number;
  totalAcquisitionCost: Won;
  totalAccumulatedDepreciation: Won;
  totalBookValue: Won;
}

/** 회계 영향 없는 수정 */
export interface UpdateAssetPayload {
  name?: string;
  status?: AssetStatus;
  supplier?: string;
  managingDeptCode?: string;
  usingDeptCode?: string;
  /** 미부여 자산에 위치가 확정되면 자산코드가 자동 채번된다 */
  locationCode?: string;
  assignee?: string;
  modelName?: string;
  spec?: string;
  equipmentCode?: string;
  instrumentMgmtNo?: string;
  excludedFromPrint?: boolean;
  disposalDate?: IsoDate | null;
  remark?: string;
}

/** 감가상각 재계산을 유발하는 정정. 사유 필수 */
export interface CorrectAssetPayload {
  acquisitionDate?: IsoDate;
  acquisitionCost?: number;
  accountId?: number;
  usefulLifeYears?: number;
  depreciationRate?: number;
  depreciationMethod?: DepreciationMethod;
  openingFiscalYear?: number;
  openingAccumulatedDepreciation?: number;
  reason: string;
}

export interface CreateAssetPayload {
  /** 비우면 서버가 8단 규칙으로 채번 */
  assetCode?: string;
  name: string;
  equipmentCode?: string;
  instrumentMgmtNo?: string;
  categoryCode: string;
  /** P05(비품)일 때 필수 */
  itemTypeCode?: string;
  itemCode?: string;
  locationCode?: string;
  usingDeptCode?: string;
  /** 비우면 사용부서와 동일 */
  managingDeptCode?: string;
  accountId: number;
  acquisitionDate: IsoDate;
  acquisitionCost: number;
  quantity?: number;
  expenseType?: ExpenseType;
  depreciationMethod?: DepreciationMethod;
  usefulLifeYears?: number;
  depreciationRate?: number;
  openingFiscalYear?: number;
  openingAccumulatedDepreciation?: number;
  status?: AssetStatus;
  excludedFromPrint?: boolean;
  supplier?: string;
  assignee?: string;
  modelName?: string;
  spec?: string;
  disposalDate?: IsoDate;
  remark?: string;
}

export interface AssetChangeLog {
  id: number;
  changeType: string;
  changeTypeLabel: string;
  fieldName: string;
  beforeValue: string | null;
  afterValue: string | null;
  changedBy: string | null;
  changedAt: IsoDateTime;
}

export interface AssetCodePreview {
  /** 앞 7단 */
  prefix: string;
  /** 저장 시 부여될 완성 코드 (현재 시점 기준) */
  nextCode: string;
}

export interface CodePreviewQuery {
  categoryCode: string;
  itemTypeCode?: string;
  itemCode?: string;
  locationCode: string;
  deptCode: string;
  acquisitionDate: IsoDate;
}

export interface StickerPrintPayload {
  ids: number[];
  /** 라벨지 시작 위치 1~10 */
  startPosition?: number;
}

export const assetsApi = {
  list: (query: AssetListQuery = {}) =>
    request<SpringPage<Asset>>('GET', '/asset', { query }).then(toPage) as Promise<Page<Asset>>,
  summary: (query: AssetFilter = {}) => request<AssetSummary>('GET', '/asset/summary', { query }),
  detail: (id: number) => request<Asset>('GET', `/asset/${id}`),
  create: (body: CreateAssetPayload) => request<Asset>('POST', '/asset', { body }),
  update: (id: number, body: UpdateAssetPayload) =>
    request<void>('PATCH', `/asset/${id}`, { body }),
  /** 잠금 항목 변경. 일반 수정과 엔드포인트가 다르다 */
  correct: (id: number, body: CorrectAssetPayload) =>
    request<void>('PATCH', `/asset/${id}/correction`, { body }),
  remove: (id: number) => request<void>('DELETE', `/asset/${id}`),
  history: (id: number) => request<AssetChangeLog[]>('GET', `/asset/${id}/history`),
  codePreview: (query: CodePreviewQuery) =>
    request<AssetCodePreview>('GET', '/asset/code-preview', { query }),

  sticker: (body: StickerPrintPayload): Promise<DownloadResult> =>
    requestFile('POST', '/asset/sticker', '자산스티커.pdf', { body }),
  exportPdf: (query: AssetFilter = {}): Promise<DownloadResult> =>
    requestFile('GET', '/asset/export/pdf', '고정자산목록표.pdf', { query }),
  exportExcel: (query: AssetFilter = {}): Promise<DownloadResult> =>
    requestFile('GET', '/asset/export/excel', '고정자산목록표.xlsx', { query }),
};
