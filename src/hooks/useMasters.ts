import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { mastersApi, type AssetAccount, type AssetItem, type CodeMaster, type CodeMasterKind } from '@/api/masters';
import {
  instrumentLocationsApi,
  partnersApi,
  type InstrumentLocation,
  type Partner,
} from '@/api/instrumentMasters';
import { queryKeys } from '@/api/queryKeys';
import type { DepreciationRate } from '@/api/masters';

/**
 * 마스터 조회 훅.
 *
 * 코드·계정과목·품목·상각률은 여러 화면이 드롭다운 채우려고 같은 걸 부른다.
 * 호출부마다 useQuery 를 적으면 staleTime 이 갈려서, 같은 캐시를 두고
 * 화면마다 신선/만료 판정이 달라진다. 정책을 여기 한 곳에만 둔다.
 */
const STALE = 10 * 60_000;

export const useAccounts = (): UseQueryResult<AssetAccount[]> =>
  useQuery({
    queryKey: queryKeys.masters.accounts(),
    queryFn: () => mastersApi.accounts(),
    staleTime: STALE,
  });

/** kind 를 런타임에 고르는 곳(마스터 화면 탭)용 */
export const useCodes = (kind: CodeMasterKind): UseQueryResult<CodeMaster[]> =>
  useQuery({
    queryKey: queryKeys.masters.codes(kind),
    queryFn: () => mastersApi.codes(kind),
    staleTime: STALE,
  });

export const useCategories = (): UseQueryResult<CodeMaster[]> =>
  useQuery({
    queryKey: queryKeys.masters.codes('category'),
    queryFn: () => mastersApi.codes('category'),
    staleTime: STALE,
  });

export const useItemTypes = (): UseQueryResult<CodeMaster[]> =>
  useQuery({
    queryKey: queryKeys.masters.codes('item-type'),
    queryFn: () => mastersApi.codes('item-type'),
    staleTime: STALE,
  });

export const useLocations = (): UseQueryResult<CodeMaster[]> =>
  useQuery({
    queryKey: queryKeys.masters.codes('location'),
    queryFn: () => mastersApi.codes('location'),
    staleTime: STALE,
  });

export const useDepartments = (): UseQueryResult<CodeMaster[]> =>
  useQuery({
    queryKey: queryKeys.masters.codes('department'),
    queryFn: () => mastersApi.codes('department'),
    staleTime: STALE,
  });

/**
 * 품목. 코드가 비품구분 안에서만 유일해서 itemTypeCode 로 걸러야 한다.
 * enabled 로 조회 시점을 미룰 수 있다 (비품이 아닐 때는 부르지 않는다).
 */
export const useItems = (
  itemTypeCode?: string,
  options: { enabled?: boolean } = {},
): UseQueryResult<AssetItem[]> =>
  useQuery({
    queryKey: queryKeys.masters.items(itemTypeCode || undefined),
    queryFn: () => mastersApi.items(itemTypeCode || undefined),
    enabled: options.enabled ?? true,
    staleTime: STALE,
  });

export const useRates = (): UseQueryResult<DepreciationRate[]> =>
  useQuery({
    queryKey: queryKeys.masters.rates(),
    queryFn: () => mastersApi.rates(),
    staleTime: STALE,
  });

/** 계측기 사용위치. 고정자산의 위치 코드 마스터와는 별개 목록이다 */
export const useInstrumentLocations = (): UseQueryResult<InstrumentLocation[]> =>
  useQuery({
    queryKey: queryKeys.masters.instrumentLocations(),
    queryFn: () => instrumentLocationsApi.list(),
    staleTime: STALE,
  });

export const usePartners = (): UseQueryResult<Partner[]> =>
  useQuery({
    queryKey: queryKeys.masters.partners(),
    queryFn: () => partnersApi.list(),
    staleTime: STALE,
  });
