import { useState } from 'react';

/** 스티커 대상이 되려면 코드가 있어야 하고 출력 제외가 아니어야 한다 */
interface Printable {
  id: number;
  assetCode: string | null;
  excludedFromPrint: boolean;
}

export interface StickerSelection<T> {
  /** 선택된 원본. 미리보기가 페이지를 넘어간 선택분까지 그려야 해서 id 가 아니라 값을 들고 있는다 */
  selected: Map<number, T>;
  /** 현재 페이지에서 선택 가능한 행 */
  printableRows: T[];
  /** 선택 열을 보여줄지. 이 페이지에 찍을 수 있는 행이 하나도 없으면 감춘다 */
  showSelectColumn: boolean;
  isSelected: (id: number) => boolean;
  /** 현재 페이지의 선택 가능한 행이 전부 선택됐는지 */
  allOnPageSelected: boolean;
  toggle: (row: T) => void;
  /** 현재 페이지의 선택 가능한 행만 일괄 선택·해제 */
  toggleAll: () => void;
  clear: () => void;
  /** 서버로 보낼 id 목록 */
  ids: () => number[];
  /** 미리보기로 넘길 원본 목록 */
  items: () => T[];
}

/**
 * 고정자산·실물자산 목록의 스티커 선택 상태.
 *
 * 두 화면이 같은 규칙을 쓴다 — 찍을 수 없는 행은 아예 못 고르게 하고,
 * 고를 수 있는 행이 없는 페이지에서는 선택 열 자체를 숨긴다.
 * 선택은 페이지를 넘겨도 유지되며, 선택 가능한 행만 담기므로
 * 그대로 서버에 보내면 된다.
 */
export function useStickerSelection<T extends Printable>(rows: T[]): StickerSelection<T> {
  const [selected, setSelected] = useState<Map<number, T>>(new Map());

  const printableRows = rows.filter((r) => !!r.assetCode && !r.excludedFromPrint);
  const allOnPageSelected =
    printableRows.length > 0 && printableRows.every((r) => selected.has(r.id));

  return {
    selected,
    printableRows,
    showSelectColumn: printableRows.length > 0,
    isSelected: (id) => selected.has(id),
    allOnPageSelected,
    toggle: (row) =>
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.set(row.id, row);
        return next;
      }),
    toggleAll: () =>
      setSelected((prev) => {
        const all = printableRows.every((r) => prev.has(r.id));
        const next = new Map(prev);
        printableRows.forEach((r) => (all ? next.delete(r.id) : next.set(r.id, r)));
        return next;
      }),
    clear: () => setSelected(new Map()),
    ids: () => [...selected.keys()],
    items: () => [...selected.values()],
  };
}
