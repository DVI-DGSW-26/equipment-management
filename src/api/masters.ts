import { request } from './client';
import type { DepreciationMethod } from './assets';

/** 자산구분·비품구분·위치·부서 공통 코드 마스터 */
export interface CodeMaster {
  id: number;
  code: string;
  name: string;
  /** 위치=건물, 부서=영문명 */
  extra: string | null;
  remark: string | null;
  sortOrder: number | null;
}

export interface SaveCodeMasterPayload {
  /** 수정 시 무시된다 */
  code?: string;
  name: string;
  extra?: string;
  remark?: string;
  sortOrder?: number;
}

export interface AssetItem {
  id: number;
  itemTypeCode: string;
  code: string;
  name: string;
  remark: string | null;
}

export interface SaveAssetItemPayload {
  itemTypeCode: string;
  /** 미입력 시 자동 채번 */
  code?: string;
  name: string;
  remark?: string;
}

export interface AssetAccount {
  id: number;
  code: string;
  name: string;
  defaultUsefulLifeYears: number | null;
  /** 세법상 허용 상각방법. 상수로 박지 않고 마스터에서 받는다 */
  allowedMethods: DepreciationMethod[];
}

export interface CreateAccountPayload {
  code: string;
  name: string;
  defaultUsefulLifeYears?: number;
}

export interface UpdateAccountPayload {
  name?: string;
  defaultUsefulLifeYears?: number;
}

export interface DepreciationRate {
  id: number;
  usefulLifeYears: number;
  straightLineRate: number;
  decliningBalanceRate: number;
  /** 회계 담당자 확인 여부. false 면 문서 초안값 */
  verified: boolean;
}

export interface SaveDepreciationRatePayload {
  /** 수정 시 무시된다 */
  usefulLifeYears?: number;
  straightLineRate?: number;
  decliningBalanceRate?: number;
  verified?: boolean;
}

/** 코드 마스터 5종. 화면에서 탭으로 돌려쓴다 */
export type CodeMasterKind = 'category' | 'item-type' | 'location' | 'department';

export const CODE_MASTER_LABEL: Record<CodeMasterKind, string> = {
  category: '자산구분',
  'item-type': '비품구분',
  location: '위치',
  department: '부서',
};

/** kind 별 extra 열 제목. null 이면 열을 숨긴다 */
export const CODE_MASTER_EXTRA_LABEL: Record<CodeMasterKind, string | null> = {
  category: null,
  'item-type': null,
  location: '건물',
  department: '영문명',
};

export const mastersApi = {
  accounts: () => request<AssetAccount[]>('GET', '/asset/account'),
  createAccount: (body: CreateAccountPayload) =>
    request<void>('POST', '/asset/account', { body }),
  updateAccount: (id: number, body: UpdateAccountPayload) =>
    request<void>('PATCH', `/asset/account/${id}`, { body }),
  removeAccount: (id: number) => request<void>('DELETE', `/asset/account/${id}`),

  codes: (kind: CodeMasterKind) => request<CodeMaster[]>('GET', `/asset-master/${kind}`),
  createCode: (kind: CodeMasterKind, body: SaveCodeMasterPayload) =>
    request<void>('POST', `/asset-master/${kind}`, { body }),
  updateCode: (kind: CodeMasterKind, id: number, body: SaveCodeMasterPayload) =>
    request<void>('PATCH', `/asset-master/${kind}/${id}`, { body }),

  items: (itemTypeCode?: string) =>
    request<AssetItem[]>('GET', '/asset-master/item', { query: { itemTypeCode } }),
  createItem: (body: SaveAssetItemPayload) => request<void>('POST', '/asset-master/item', { body }),
  updateItem: (id: number, body: SaveAssetItemPayload) =>
    request<void>('PATCH', `/asset-master/item/${id}`, { body }),

  rates: () => request<DepreciationRate[]>('GET', '/depreciation/rate'),
  createRate: (body: SaveDepreciationRatePayload) =>
    request<void>('POST', '/depreciation/rate', { body }),
  updateRate: (id: number, body: SaveDepreciationRatePayload) =>
    request<void>('PATCH', `/depreciation/rate/${id}`, { body }),
};
