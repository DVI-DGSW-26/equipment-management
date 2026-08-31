import { request, requestFile, type DownloadResult } from './client';
import type { AssetStatus, StickerPrintPayload } from './assets';
import { toPage, type IsoDate, type Page, type SpringPage, type Won } from './types';

/**
 * 실물자산 = 비품관리대장.
 * 고정자산에 연결되면 registered=true (스티커 O), 연결이 없으면 소액 비품이다.
 */
export interface PhysicalAsset {
  id: number;
  /** 부모 고정자산 ID. null 이면 소액 비품 */
  assetId: number | null;
  assetName: string | null;
  /** 자산등록 여부 (스티커 O/X) */
  registered: boolean;
  assetCode: string | null;
  name: string;
  categoryCode: string | null;
  categoryName: string | null;
  itemTypeCode: string | null;
  itemCode: string | null;
  locationCode: string | null;
  locationName: string | null;
  deptCode: string | null;
  deptName: string | null;
  acquisitionDate: IsoDate | null;
  modelName: string | null;
  spec: string | null;
  maker: string | null;
  supplier: string | null;
  purchasePrice: Won | null;
  rental: boolean;
  status: AssetStatus;
  statusLabel: string;
  excludedFromPrint: boolean;
  remark: string | null;
}

export interface PhysicalAssetListQuery {
  assetId?: number;
  status?: AssetStatus;
  name?: string;
  assetCode?: string;
  /** true = 고정자산 연결분만, false = 소액 비품만 */
  registered?: boolean;
  /** 0-base */
  page?: number;
  size?: number;
  sort?: string[];
}

export interface SavePhysicalAssetPayload {
  /**
   * 비우면 고정자산 미등록 소액 비품.
   * 수정에서 연결을 끊을 때(자산등록 O→X)는 undefined 가 아니라 null 을 보낸다.
   * undefined 는 JSON 에서 키째 빠져 서버가 예전 연결을 그대로 둔다.
   */
  assetId?: number | null;
  assetCode?: string;
  name: string;
  categoryCode?: string;
  itemTypeCode?: string;
  itemCode?: string;
  locationCode?: string;
  deptCode?: string;
  acquisitionDate?: IsoDate;
  modelName?: string;
  spec?: string;
  maker?: string;
  supplier?: string;
  purchasePrice?: number;
  rental?: boolean;
  status?: AssetStatus;
  excludedFromPrint?: boolean;
  remark?: string;
}

export const physicalAssetsApi = {
  list: (query: PhysicalAssetListQuery = {}) =>
    request<SpringPage<PhysicalAsset>>('GET', '/physical-asset', { query }).then(
      toPage,
    ) as Promise<Page<PhysicalAsset>>,
  detail: (id: number) => request<PhysicalAsset>('GET', `/physical-asset/${id}`),
  create: (body: SavePhysicalAssetPayload) =>
    request<PhysicalAsset>('POST', '/physical-asset', { body }),
  update: (id: number, body: Partial<SavePhysicalAssetPayload>) =>
    request<void>('PATCH', `/physical-asset/${id}`, { body }),
  remove: (id: number) => request<void>('DELETE', `/physical-asset/${id}`),
  sticker: (body: StickerPrintPayload): Promise<DownloadResult> =>
    requestFile('POST', '/physical-asset/sticker', '실물자산스티커.pdf', { body }),
};
