import type { GaugeRrJudgment } from '@/api/gaugeRr';

/**
 * 게이지 R&R 화면 규칙. 계산은 서버가 한다 — 여기는 입력 격자 다루기와 표시 형식뿐이다.
 */

/** 양식이 받는 범위 (서버 검증과 같다) */
export const APPRAISER_COUNTS = [2, 3] as const;
export const TRIAL_COUNTS = [2, 3] as const;
export const PART_MIN = 2;
export const PART_MAX = 10;

/** 양식의 측정자 이름표 */
export const APPRAISER_LETTERS = ['A', 'B', 'C'] as const;

export const JUDGMENT_TONE: Record<GaugeRrJudgment, 'accent' | 'warn' | 'danger'> = {
  OK: 'accent',
  CONDITIONAL: 'warn',
  NG: 'danger',
};

/**
 * 서버 숫자는 반올림 없이 온다. 양식이 쓰던 자릿수로 맞춘다.
 *   측정값·평균·범위   3자리
 *   xa·ra·R̄·EV 등      4자리
 *   %·ndc              2자리
 */
export const fmtNum = (v: number | null | undefined, digits: number): string =>
  v == null || !Number.isFinite(v) ? '-' : v.toFixed(digits);

/** 입력 격자. 칸마다 친 글자 그대로 둔다 — 숫자로 바꾸면 "20." 을 치는 도중에 점이 사라진다 */
export type Grid = string[][][];

export const resizeGrid = (grid: Grid, appraisers: number, trials: number, parts: number): Grid =>
  Array.from({ length: appraisers }, (_, a) =>
    Array.from({ length: trials }, (_, t) =>
      Array.from({ length: parts }, (_, p) => grid[a]?.[t]?.[p] ?? ''),
    ),
  );

export const gridFrom = (measurements: number[][][]): Grid =>
  measurements.map((a) => a.map((t) => t.map((v) => String(v))));

const NUMBER = /^-?\d+(\.\d+)?$/;

/** 칸 하나가 숫자로 읽히는가. 빈칸은 따로 센다 */
export const isNumberText = (s: string): boolean => NUMBER.test(s.trim());

/** 다 채워졌고 전부 숫자면 서버로 보낼 배열, 아니면 null */
export const toMeasurements = (grid: Grid): number[][][] | null => {
  const ok = grid.every((a) => a.every((t) => t.every(isNumberText)));
  return ok ? grid.map((a) => a.map((t) => t.map((s) => Number(s.trim())))) : null;
};

/** 비었거나 숫자가 아닌 칸 수 */
export const badCellCount = (grid: Grid): number =>
  grid.flat(2).filter((s) => !isNumberText(s)).length;

/**
 * 엑셀에서 복사한 덩어리를 붙인다.
 *
 * 격자의 줄은 양식과 같은 차례다 — A 1·2·3회, B 1·2·3회, C … 그래서 고른 칸에서부터
 * 아래·오른쪽으로 채운다. 넘치는 것은 버린다.
 *
 * 양식에서 측정값 칸(C18:L32)을 통째로 긁으면 측정자마다 AVE·R 두 줄이 끼어 온다.
 * 맨 첫 칸에 붙였고 줄 수가 측정자 × (반복 + 2) 와 맞으면 그 두 줄을 걸러 낸다.
 */
export const pasteInto = (
  grid: Grid,
  start: { a: number; t: number; p: number },
  text: string,
): Grid => {
  const appraisers = grid.length;
  const trials = grid[0]?.length ?? 0;
  const parts = grid[0]?.[0]?.length ?? 0;

  let lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l, i, all) => !(l === '' && i === all.length - 1))
    .map((l) => l.split('\t').map((c) => c.trim()));

  const atTop = start.a === 0 && start.t === 0;
  if (atTop && lines.length === appraisers * (trials + 2)) {
    lines = lines.filter((_, i) => i % (trials + 2) < trials);
  }

  const next = grid.map((a) => a.map((t) => [...t]));
  const firstRow = start.a * trials + start.t;
  lines.forEach((cells, i) => {
    const row = firstRow + i;
    const a = Math.floor(row / trials);
    const t = row % trials;
    if (a >= appraisers) return;
    cells.forEach((c, j) => {
      const p = start.p + j;
      if (p < parts) next[a][t][p] = c;
    });
  });
  return next;
};

/** 붙여넣은 글이 칸 하나짜리가 아닌가 — 하나짜리는 브라우저 기본 붙여넣기에 맡긴다 */
export const isBlockPaste = (text: string): boolean => /[\t\n]/.test(text.trim());
