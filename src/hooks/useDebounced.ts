import { useEffect, useState } from 'react';

/**
 * 입력이 멎고 나서의 값.
 *
 * 검색을 타자와 동시에 돌리면 글자 하나마다 서버를 부른다.
 * "자산" 을 치면 ㅈ·자·잔·자ㅅ·자산 으로 다섯 번 나가는 식이다.
 * 손이 멈춘 뒤에 한 번만 나가도록 늦춘다.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}
