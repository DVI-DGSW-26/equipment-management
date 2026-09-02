import type { Page } from '@/api/types';

/**
 * 화면에서 쪽을 나눈다.
 *
 * 서버가 일부 조건만 걸러 주는 목록(계측기·실물자산)은 전부 받아 화면에서 거른다.
 * 그러면 쪽도 화면에서 나눠야 한다 — 서버가 준 쪽 정보는 거르기 전 기준이라 맞지 않는다.
 *
 * 조건을 좁혀 쪽수가 줄면 보고 있던 장이 사라져 빈 표가 뜨므로 마지막 장으로 되돌린다.
 * 돌아간 장 번호는 page 로 함께 돌려주니, 화면은 그 값을 그대로 Pagination 에 넘기면 된다.
 */
export const slicePage = <T>(rows: T[], page: number, size: number): Page<T> => {
  const totalPages = Math.ceil(rows.length / size);
  const current = Math.min(Math.max(0, page), Math.max(0, totalPages - 1));
  return {
    items: rows.slice(current * size, current * size + size),
    total: rows.length,
    totalPages,
    page: current,
    size,
  };
};
