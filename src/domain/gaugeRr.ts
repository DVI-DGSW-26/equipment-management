import type { GaugeRrJudgment } from '@/api/gaugeRr';

/**
 * 게이지 R&R 화면 규칙 — 입력 격자 다루기, 표시 형식, 입력 중 미리 계산.
 *
 * 저장된 값은 서버 계산이 기준이다. 여기의 계산(previewGaugeRr)은 입력하는 동안
 * %R&R·ndc 를 바로 보여 주려는 것이고, 서버 GaugeRrCalculator 와 같은 식이다.
 */

/**
 * 측정자 3명 · 반복 3회 · 시료 10개로 고정한다 (품질팀 확정 2026-10-08).
 * 서버는 2~3명·2~3회·2~10개를 받지만 회사 기준은 이 크기 하나다.
 */
export const APPRAISERS = 3;
export const TRIALS = 3;
export const PARTS = 10;

/**
 * %R&R 기준. 이 값을 넘으면 사유를 남겨야 한다 (품질팀 기준 "10 이하").
 * 서버 판정(10 미만 양호)과 경계가 다르다 — 정확히 10 은 여기서는 통과, 서버는 조건부다.
 */
export const GRR_LIMIT = 10;

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

/* ---------- 입력 중 미리 계산 ---------- */

/** K1·K2·K3·D4 — 양식의 상수표(5.15/d2). 서버 GaugeRrCalculator 와 같은 값 */
const K1: Record<number, number> = { 2: 0.8862, 3: 0.5908 };
const K2: Record<number, number> = { 2: 0.7071, 3: 0.5231 };
const K3: Record<number, number> = {
  2: 0.7071,
  3: 0.5231,
  4: 0.4467,
  5: 0.403,
  6: 0.3742,
  7: 0.3534,
  8: 0.3375,
  9: 0.3249,
  10: 0.3146,
};

export interface GaugeRrPreview {
  pctEv: number;
  pctAv: number;
  pctGrr: number;
  pctPv: number;
  ndc: number;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * 평균·범위법 (AIAG MSA, 5.15σ). 서버 GaugeRrCalculator.calculate 를 그대로 옮겼다.
 *   EV = R̄ × K1,  AV = √{(X̄diff × K2)² − EV²/(n·r)} (음수면 0),  R&R = √(EV² + AV²)
 *   PV = Rp × K3,  TV = √(R&R² + PV²),  % = 100 × 값 / TV,  ndc = 1.41 × PV / R&R
 */
export const previewGaugeRr = (values: number[][][]): GaugeRrPreview => {
  const appraisers = values.length;
  const trials = values[0].length;
  const parts = values[0][0].length;

  const blocks = values.map((a) => {
    const partAvg: number[] = [];
    const partRange: number[] = [];
    for (let p = 0; p < parts; p += 1) {
      const col = a.map((t) => t[p]);
      partAvg.push(mean(col));
      partRange.push(Math.max(...col) - Math.min(...col));
    }
    return { partAvg, average: mean(partAvg), averageRange: mean(partRange) };
  });

  const xp = Array.from({ length: parts }, (_, p) => mean(blocks.map((b) => b.partAvg[p])));
  const rp = Math.max(...xp) - Math.min(...xp);
  const rBar = mean(blocks.map((b) => b.averageRange));
  const averages = blocks.map((b) => b.average);
  const xDiff = Math.max(...averages) - Math.min(...averages);

  const ev = rBar * K1[trials];
  const avSq = (xDiff * K2[appraisers]) ** 2 - ev ** 2 / (parts * trials);
  const av = avSq > 0 ? Math.sqrt(avSq) : 0;
  const grr = Math.sqrt(ev * ev + av * av);
  const pv = rp * K3[parts];
  const tv = Math.sqrt(grr * grr + pv * pv);
  const pct = (v: number) => (tv === 0 ? 0 : (100 * v) / tv);

  return {
    pctEv: pct(ev),
    pctAv: pct(av),
    pctGrr: pct(grr),
    pctPv: pct(pv),
    ndc: grr === 0 ? 0 : (1.41 * pv) / grr,
  };
};
