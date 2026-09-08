import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { authApi, type Me } from '@/api/auth';
import { queryKeys } from '@/api/queryKeys';
import { permsOf, type Perms } from '@/lib/permissions';

/**
 * 로그인한 사람과 그 권한.
 *
 * 헤더·메뉴·라우트 가드·쓰기 단추가 다 같은 답을 봐야 해서 캐시를 한 벌만 쓴다.
 * 토큰 수명이 30분이라 그 안에는 다시 묻지 않는다.
 */
const STALE = 30 * 60_000;

export const useMe = (): UseQueryResult<Me> =>
  useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => authApi.me(),
    staleTime: STALE,
  });

export interface PermsState {
  perms: Perms;
  /** /auth/me 를 기다리는 중. 이때는 "권한 없음" 을 띄우지 않는다 */
  isPending: boolean;
}

export function usePerms(): PermsState {
  const me = useMe();

  /*
   * 아직 모르는 동안은 닫지 않고 연다.
   *
   * 닫아 두면 차림표가 잠깐 비었다가 채워지고, 개발 PC 에서는 아예 빈 채로 남는다 —
   * 로컬은 토큰이 없어 /auth/me 가 401 이라 영영 답이 안 온다. 어차피 서버가 403 으로
   * 막으므로, 모르는 상태를 "권한 없음" 으로 읽지 않는 편이 안전하다.
   * permsOf(undefined) 가 그 "알 수 없음 = 열어 둠" 을 만든다.
   */
  return { perms: permsOf(me.data?.roles), isPending: me.isPending };
}
