import { request } from './client';

/** 계측기 사용위치 마스터. 고정자산의 위치 코드 마스터(/asset-master/location)와 별개다 */
export interface InstrumentLocation {
  id: number;
  name: string;
}

export type PartnerType = 'SUPPLIER' | 'CALIBRATION_AGENCY' | 'BOTH';

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  SUPPLIER: '구매처',
  CALIBRATION_AGENCY: '교정 의뢰처',
  BOTH: '구매처 · 교정 의뢰처',
};

export interface Partner {
  id: number;
  name: string;
  partnerType: PartnerType;
  partnerTypeLabel: string;
}

/** 구매처로 쓸 수 있는지 */
export const isSupplier = (p: Partner): boolean =>
  p.partnerType === 'SUPPLIER' || p.partnerType === 'BOTH';

/** 교정 의뢰처로 쓸 수 있는지 */
export const isAgency = (p: Partner): boolean =>
  p.partnerType === 'CALIBRATION_AGENCY' || p.partnerType === 'BOTH';

export const instrumentLocationsApi = {
  list: () => request<InstrumentLocation[]>('GET', '/location'),
  detail: (id: number) => request<InstrumentLocation>('GET', `/location/${id}`),
  create: (name: string) => request<void>('POST', '/location', { body: { name } }),
  update: (id: number, name: string) => request<void>('PATCH', `/location/${id}`, { body: { name } }),
  remove: (id: number) => request<void>('DELETE', `/location/${id}`),
};

export const partnersApi = {
  list: (type?: PartnerType) => request<Partner[]>('GET', '/partner', { query: { type } }),
  detail: (id: number) => request<Partner>('GET', `/partner/${id}`),
  create: (body: { name: string; partnerType: PartnerType }) =>
    request<void>('POST', '/partner', { body }),
  update: (id: number, body: { name?: string; partnerType?: PartnerType }) =>
    request<void>('PATCH', `/partner/${id}`, { body }),
  remove: (id: number) => request<void>('DELETE', `/partner/${id}`),
};
