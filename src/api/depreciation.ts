import { request } from './client';
import type { IsoDate, Won } from './types';

export interface DepreciationCalculation {
  fiscalYear: number;
  assetCount: number;
  monthlyRowCount: number;
  totalAmount: Won;
}

/** 연도별 조회 — 자산 1건의 특정 연도 */
export interface YearlyRow {
  assetId: number;
  assetCode: string | null;
  assetName: string;
  accountCode: string;
  accountName: string;
  depreciationMethodLabel: string | null;
  fiscalYear: number;
  depreciation: Won;
  accumulated: Won;
  bookValue: Won;
}

export interface YearlyResponse {
  fromYear: number;
  toYear: number;
  rows: YearlyRow[];
  /** 연도 → 상각비 합계 */
  totalsByYear: Record<string, Won>;
}

/** 감가상각비명세 행 — 자산별 월별 상각비 */
export interface ScheduleRow {
  seq: number;
  assetId: number;
  expenseTypeCode: string | null;
  accountCode: string;
  accountName: string;
  assetCode: string | null;
  assetName: string;
  acquisitionDate: IsoDate;
  /** 1~12월 */
  monthlyAmounts: Won[];
  total: Won;
}

export interface ScheduleSubtotal {
  accountCode: string;
  accountName: string;
  depreciationMethodLabel: string | null;
  monthlyAmounts: Won[];
  total: Won;
}

export interface ScheduleResponse {
  fiscalYear: number;
  /** 이 월부터 12월까지는 마감 전 예상치. null 이면 전부 확정 */
  estimatedFromMonth: number | null;
  rows: ScheduleRow[];
  subtotals: ScheduleSubtotal[];
  grandTotal: Won;
}

/** 고정자산관리대장 행 */
export interface LedgerRow {
  assetId: number;
  accountCode: string;
  accountName: string;
  assetCode: string | null;
  assetName: string;
  acquisitionDate: IsoDate;
  expenseTypeCode: string | null;
  quantity: number;
  beginningValue: Won;
  priorAccumulated: Won;
  priorBookValue: Won;
  usefulLifeYears: number | null;
  depreciationRate: number | null;
  depreciationMethodLabel: string | null;
  annualRangeAmount: Won;
  currentDepreciation: Won;
  endingAccumulated: Won;
  endingBookValue: Won;
}

export interface LedgerSubtotal {
  accountCode: string | null;
  accountName: string | null;
  assetCount: number;
  quantity: number;
  beginningValue: Won;
  priorAccumulated: Won;
  priorBookValue: Won;
  annualRangeAmount: Won;
  currentDepreciation: Won;
  endingAccumulated: Won;
  endingBookValue: Won;
}

export interface LedgerResponse {
  fiscalYear: number;
  rows: LedgerRow[];
  subtotals: LedgerSubtotal[];
  grandTotal: LedgerSubtotal;
}

export type ForecastGroupBy = 'asset' | 'account' | 'dept' | 'total';
export type ForecastGranularity = 'year' | 'month';

export interface ForecastRow {
  /** asset=자산코드, account=계정코드, total="TOTAL" */
  key: string;
  label: string;
  depreciationMethodLabel: string | null;
  /** years 배열과 같은 길이 */
  yearlyAmounts: Won[];
  /** granularity=month 일 때만. 바깥=연도, 안쪽=1~12월 */
  monthlyAmounts: Won[][] | null;
  total: Won;
}

export interface ForecastResponse {
  years: number[];
  groupBy: ForecastGroupBy;
  granularity: ForecastGranularity;
  rows: ForecastRow[];
  yearlyTotals: Won[];
  monthlyTotals: Won[][] | null;
  grandTotal: Won;
}

export interface ForecastQuery {
  /** 시작 연도. 비우면 내년부터 — 당기를 포함하려면 올해를 넘긴다 */
  fromYear?: number;
  years?: number;
  groupBy?: ForecastGroupBy;
  granularity?: ForecastGranularity;
}

export const depreciationApi = {
  /** 해당 연도 상각비를 다시 계산해 저장한다. 되돌릴 수 없으므로 확인 후 호출 */
  calculate: (fiscalYear: number) =>
    request<DepreciationCalculation>('POST', '/depreciation/calculate', { query: { fiscalYear } }),
  /** assetId 를 주면 그 자산의 이력만 (자산 상세용) */
  yearly: (fromYear: number, toYear: number, assetId?: number) =>
    request<YearlyResponse>('GET', '/depreciation/yearly', { query: { fromYear, toYear, assetId } }),
  schedule: (fiscalYear: number) =>
    request<ScheduleResponse>('GET', '/depreciation/schedule', { query: { fiscalYear } }),
  ledger: (fiscalYear: number) =>
    request<LedgerResponse>('GET', '/depreciation/ledger', { query: { fiscalYear } }),
  forecast: (query: ForecastQuery = {}) =>
    request<ForecastResponse>('GET', '/depreciation/forecast', { query }),
};
