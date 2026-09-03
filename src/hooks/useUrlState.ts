import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 걸러 놓은 조건을 주소창에 담아 둔다.
 *
 * 목록에서 한 건을 열었다가 뒤로 가면 처음 화면으로 돌아갔다 — 조건과 보던 쪽이
 * 컴포넌트 안에만 있어서, 화면이 다시 만들어질 때 함께 사라졌기 때문이다.
 * 주소에 담아 두면 뒤로 가기가 그 주소로 돌아오면서 보던 그대로가 된다.
 * 덤으로 그 화면을 링크로 그대로 넘길 수 있고, 새로고침해도 남는다.
 *
 * 기본값과 같은 값은 주소에서 뺀다 — 아무것도 안 고른 상태의 주소가 깔끔해야
 * 목록 주소를 그냥 눌렀을 때와 같아진다.
 *
 * 조건을 바꿀 때는 방문 기록을 쌓지 않고 지금 자리를 갈아 끼운다(replace).
 * 그러지 않으면 글자 하나 칠 때마다 기록이 쌓여 뒤로 가기를 스무 번 눌러야 한다.
 *
 * defaults 는 컴포넌트 밖에 두고 넘긴다 — 안에서 만들면 매번 새 객체라 set 이
 * 계속 바뀐다.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();

  /*
   * 주소가 그대로면 같은 객체를 돌려준다.
   * 렌더마다 새 객체를 만들면 이 값을 지켜보는 useEffect·useMemo 가 매번 다시 돌고,
   * 손이 멎기를 기다리는 쪽(useDebounced)은 타이머가 끝없이 새로 잡혀 멈추지 않는다.
   */
  const search = params.toString();
  const state = useMemo(() => {
    const next = { ...defaults };
    const q = new URLSearchParams(search);
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const v = q.get(key);
      if (v !== null) next[key] = v as T[keyof T & string];
    }
    return next;
  }, [search, defaults]);

  const set = useCallback(
    (next: Partial<Record<keyof T & string, string>>) => {
      setParams(
        (prev) => {
          const q = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (value === undefined || value === '' || value === defaults[key]) q.delete(key);
            else q.set(key, value);
          }
          return q;
        },
        { replace: true },
      );
    },
    [setParams, defaults],
  );

  return [state, set] as const;
}
