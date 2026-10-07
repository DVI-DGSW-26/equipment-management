import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * 목록에서 상세로 들어갈 때 넘기는 표시. 상세의 [← 목록] 이 이걸 보고 되돌아간다.
 *
 *   navigate(`/instruments/${id}`, { state: FROM_LIST })
 */
export const FROM_LIST = { fromList: true } as const;

/**
 * 상세 화면의 [← 목록].
 *
 * 걸러 놓은 조건은 주소에 담겨 있는데(useUrlState), 단추가 '/instruments' 처럼 맨 주소로
 * 보내면 조건이 다 지워진 목록이 뜬다 — 검색해서 들어갔다 나오면 처음부터 다시
 * 찾아야 했다. 목록에서 들어왔으면 뒤로 가기와 똑같이 한 칸 되돌린다. 조건도,
 * 내려 두었던 자리(ScrollMemory)도 그대로 돌아온다.
 *
 * 주소를 직접 쳤거나 다른 화면(달력·게이지 R&R)에서 왔으면 되돌아갈 목록이 없으니
 * fallback 으로 보낸다.
 */
export function useBackToList(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const fromList = (location.state as { fromList?: boolean } | null)?.fromList === true;

  return useCallback(() => {
    if (fromList) void navigate(-1);
    else void navigate(fallback);
  }, [fromList, navigate, fallback]);
}
