import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * 뒤로 갔을 때 내려 두었던 자리로 돌려놓는다.
 *
 * 목록을 한참 내려서 한 건을 열었다가 뒤로 오면 맨 위였다. 걸러 놓은 조건과 보던
 * 쪽은 주소에 담아 두어 돌아오는데, 스크롤은 아무도 기억하지 않았다 — 스무 번째
 * 줄을 보다가 돌아와 다시 내려야 했다(2026-09-09 요청).
 *
 * 브라우저가 스스로 하는 복원은 SPA 에서 듣지 않는다. 뒤로 가는 순간에는 목록이
 * 아직 그려지지 않아 페이지가 짧고, 짧은 페이지는 그만큼 내려갈 수가 없다.
 * 그래서 직접 기억해 두고, 페이지가 길어질 때까지 몇 번 더 내려 본다.
 */

/** 방문 자리마다 마지막 스크롤 위치. 화면을 새로 열면 비워진다 */
const positions = new Map<string, number>();

/** 기억할 방문 수. 넘으면 오래된 것부터 버린다 — 뒤로 열 번 넘게 가는 일은 없다 */
const KEEP = 50;

/** 목록이 다 그려질 때까지 기다리며 다시 시도할 횟수 (한 프레임씩) */
const TRIES = 60;

export default function ScrollMemory() {
  const { key } = useLocation();
  const navigationType = useNavigationType();

  /* 브라우저가 제 나름대로 복원하면 우리 복원과 부딪친다 */
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  /* 지금 방문에서 내린 자리를 계속 적어 둔다 */
  useEffect(() => {
    const save = () => {
      positions.set(key, window.scrollY);
      if (positions.size > KEEP) {
        const oldest = positions.keys().next().value;
        if (oldest !== undefined) positions.delete(oldest);
      }
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      /* 화면을 떠나는 순간의 자리까지 남긴다 */
      save();
      window.removeEventListener('scroll', save);
    };
  }, [key]);

  useEffect(() => {
    /*
     * PUSH 는 새 화면이니 맨 위에서 시작한다.
     * REPLACE 는 손대지 않는다 — 조건을 고칠 때마다 주소를 갈아 끼우므로(useUrlState),
     * 여기서 위로 올리면 검색어를 한 글자 칠 때마다 화면이 튄다.
     */
    if (navigationType === 'PUSH') {
      window.scrollTo(0, 0);
      return;
    }
    if (navigationType !== 'POP') return;

    const want = positions.get(key) ?? 0;
    if (want <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    let tries = 0;
    let frame = 0;
    const restore = () => {
      window.scrollTo(0, want);
      tries += 1;
      /* 아직 목록이 안 그려져 그만큼 못 내려갔으면 한 프레임 뒤에 다시 */
      if (Math.abs(window.scrollY - want) > 2 && tries < TRIES) {
        frame = window.requestAnimationFrame(restore);
      }
    };
    frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [key, navigationType]);

  return null;
}
