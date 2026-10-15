import { useEffect, type RefObject } from 'react';

/** 고정하는 앞 열 수 (요청 2026-10-15) */
const DEFAULT_COUNT = 3;
/** 고정 열이 상자 너비의 이만큼을 넘으면 열을 줄인다 — 좁은 화면에서 넘길 자리가 없어지지 않게 */
const MAX_SHARE = 0.5;

/**
 * 넓은 표의 앞 열을 가로 스크롤에서 붙잡아 둔다.
 *
 * 노트북처럼 화면이 좁으면 목록을 옆으로 넘겨 봐야 하는데, 그러면 이 줄이 무엇인지(코드·품명)가
 * 사라진다. 앞 몇 열은 그 자리에 두고 나머지만 넘어가게 한다.
 * 표가 상자 안에 다 들어오면 아무것도 하지 않는다.
 *
 * 표마다 열 너비가 달라서 CSS 만으로는 left 값을 줄 수 없다. 첫 열들의 실제 너비를 재서 칸마다 적는다.
 * 합친 칸(rowSpan·colSpan)도 자리를 따져서, 고정 열 안에 다 들어가는 칸만 붙잡는다.
 * 모양(배경·그림자)은 index.css 의 [data-sticky-col] 이 맡는다.
 *
 * @param ref 가로로 넘어가는 상자. 표는 그 바로 아래 자식이어야 한다
 */
export function useStickyColumns(ref: RefObject<HTMLElement | null>, count = DEFAULT_COUNT) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    const apply = () => {
      /* 제 표만 건드린다. 안에 또 다른 상자(TableScroll)가 있으면 그 표는 그 상자의 몫이다 */
      for (const el of box.querySelectorAll<HTMLElement>(':scope > table [data-sticky-col]')) {
        el.removeAttribute('data-sticky-col');
        el.removeAttribute('data-sticky-edge');
        el.style.left = '';
      }
      const table = box.querySelector<HTMLTableElement>(':scope > table');
      if (!table || box.scrollWidth <= box.clientWidth + 1) return;

      /* 칸마다 몇 번째 열에서 시작하는지. 위 줄의 rowSpan 이 차지한 자리는 건너뛴다 */
      const taken = new Map<number, Set<number>>();
      const placed: { cell: HTMLTableCellElement; start: number; span: number }[] = [];
      Array.from(table.rows).forEach((tr, r) => {
        let col = 0;
        for (const cell of Array.from(tr.cells)) {
          while (taken.get(r)?.has(col)) col++;
          const span = cell.colSpan || 1;
          for (let dr = 0; dr < (cell.rowSpan || 1); dr++) {
            const set = taken.get(r + dr) ?? new Set<number>();
            for (let dc = 0; dc < span; dc++) set.add(col + dc);
            taken.set(r + dr, set);
          }
          placed.push({ cell, start: col, span });
          col += span;
        }
      });

      const widths: number[] = [];
      for (let i = 0; i < count; i++) {
        const one = placed.find((p) => p.start === i && p.span === 1);
        if (!one) break;
        widths.push(one.cell.getBoundingClientRect().width);
      }
      let n = widths.length;
      const sum = (k: number) => widths.slice(0, k).reduce((a, b) => a + b, 0);
      while (n > 0 && sum(n) > box.clientWidth * MAX_SHARE) n--;
      if (n === 0) return;

      for (const { cell, start, span } of placed) {
        if (start + span > n) continue;
        cell.setAttribute('data-sticky-col', '');
        if (start + span === n) cell.setAttribute('data-sticky-edge', '');
        cell.style.left = `${sum(start)}px`;
        /* 줄 배경(합계 줄 등)을 고정 칸에도 깐다. 마우스가 올라간 줄은 hover 색이 섞이니 그대로 둔다 */
        const tr = cell.parentElement;
        if (tr && !tr.matches(':hover'))
          cell.style.setProperty('--sc-tint', getComputedStyle(tr).backgroundColor);
      }
    };

    const onScroll = () => box.toggleAttribute('data-sticky-scrolled', box.scrollLeft > 0);

    const resize = new ResizeObserver(schedule);
    resize.observe(box);
    /* 줄이 바뀌거나(조회·페이지) 표가 새로 생기면 다시 잰다. 우리가 바꾸는 data-·style 은 보지 않는다 */
    const mutation = new MutationObserver(() => {
      const table = box.querySelector(':scope > table');
      if (table) resize.observe(table);
      schedule();
    });
    mutation.observe(box, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    const table = box.querySelector(':scope > table');
    if (table) resize.observe(table);
    box.addEventListener('scroll', onScroll, { passive: true });
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      box.removeEventListener('scroll', onScroll);
    };
  }, [ref, count]);
}
