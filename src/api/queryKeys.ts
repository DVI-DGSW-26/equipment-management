import type { AssetFilter, AssetListQuery } from './assets';
import type { ForecastQuery } from './depreciation';
import type { CodeMasterKind } from './masters';
import type { SafetyEquipmentQuery } from './inspections';
import type { InstrumentListQuery } from './instruments';
import type { PhysicalAssetListQuery } from './physicalAssets';
import type { PartnerType } from './instrumentMasters';

/** TanStack Query 키 팩토리. 무효화 범위를 한 곳에서 관리 */
export const queryKeys = {
  assets: {
    all: ['assets'] as const,
    list: (q: AssetListQuery) => ['assets', 'list', q] as const,
    summary: (q: AssetFilter) => ['assets', 'summary', q] as const,
    detail: (id: number) => ['assets', 'detail', id] as const,
    history: (id: number) => ['assets', 'history', id] as const,
    codePreview: (q: object) => ['assets', 'code-preview', q] as const,
  },
  physicalAssets: {
    all: ['physical-assets'] as const,
    list: (q: PhysicalAssetListQuery) => ['physical-assets', 'list', q] as const,
    detail: (id: number) => ['physical-assets', 'detail', id] as const,
  },
  depreciation: {
    all: ['depreciation'] as const,
    yearly: (from: number, to: number, assetId?: number) =>
      ['depreciation', 'yearly', from, to, assetId ?? null] as const,
    schedule: (year: number) => ['depreciation', 'schedule', year] as const,
    ledger: (year: number) => ['depreciation', 'ledger', year] as const,
    forecast: (q: ForecastQuery) => ['depreciation', 'forecast', q] as const,
  },
  inspections: {
    all: ['inspections'] as const,
    list: (q: SafetyEquipmentQuery) => ['inspections', 'list', q] as const,
    summary: () => ['inspections', 'summary'] as const,
    history: (id: number) => ['inspections', 'history', id] as const,
  },
  instruments: {
    all: ['instruments'] as const,
    list: (q: InstrumentListQuery) => ['instruments', 'list', q] as const,
    detail: (id: number) => ['instruments', 'detail', id] as const,
    attachments: (id: number) => ['instruments', 'attachments', id] as const,
  },
  calibrations: {
    all: ['calibrations'] as const,
    byInstrument: (instrumentId: number) => ['calibrations', 'instrument', instrumentId] as const,
    annual: (planYear: number) => ['calibrations', 'annual', planYear] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    emails: () => ['notifications', 'emails'] as const,
    settings: () => ['notifications', 'settings'] as const,
    logs: (q: object) => ['notifications', 'logs', q] as const,
  },
  masters: {
    all: ['masters'] as const,
    accounts: () => ['masters', 'accounts'] as const,
    codes: (kind: CodeMasterKind) => ['masters', 'codes', kind] as const,
    items: (itemTypeCode?: string) => ['masters', 'items', itemTypeCode ?? null] as const,
    rates: () => ['masters', 'rates'] as const,
    instrumentLocations: () => ['masters', 'instrument-locations'] as const,
    partners: (type?: PartnerType) => ['masters', 'partners', type ?? null] as const,
  },
} as const;
