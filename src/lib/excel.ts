import { saveFile } from '@/api/client';

/**
 * 화면에 보이는 표를 엑셀 파일(.xlsx)로 내려받는다.
 *
 * 고정자산 목록표 PDF·비품 스티커는 서버가 만든다 — 회계에 내는 정해진 양식이라 그쪽이 맞다.
 * 계측기에는 그런 엔드포인트가 없어 여기서 만든다. 대신 **화면이 지금 보고 있는 것**을
 * 그대로 옮기므로, 걸러 놓은 조건과 정렬이 파일에도 그대로 반영된다.
 *
 * 만드는 라이브러리는 단추를 누를 때 받아 온다(동적 import). 파일 한 번 뽑자고
 * 첫 화면 로딩을 무겁게 하지 않는다.
 * 내려받기는 서버가 만든 파일과 같은 길(saveFile)로 보내 동작을 하나로 맞춘다.
 */

export interface ExcelColumn<T> {
  /** 첫 줄에 들어갈 열 이름 */
  header: string;
  /** 셀 값. null 이면 빈 칸으로 둔다 */
  value: (row: T) => string | number | null;
  /**
   * 숫자로 넣을지. 숫자로 넣어야 엑셀에서 합계·정렬이 제대로 된다.
   * 관리번호처럼 앞자리 0 이 사라지면 안 되는 값은 글자로 둔다(기본).
   */
  numeric?: boolean;
  /** 열 너비(글자 수). 비우면 라이브러리 기본값 */
  width?: number;
  /** 소계·총계 행에서 이 열을 더할지. 금액 열만 켠다 — 연번·내용연수·상각률을 더하면 뜻이 없다 */
  sum?: boolean;
}

/**
 * 같은 key 가 이어진 행끼리 묶어 묶음마다 소계 행을, 맨 끝에 총계 행을 단다.
 * 행은 미리 key 순으로 모여 있어야 한다 — 떨어져 있으면 소계가 그만큼 쪼개진다.
 */
export interface ExcelGroup<T> {
  key: (row: T) => string;
  /** 소계 행 첫 칸에 적을 글 */
  label: (row: T) => string;
}

/** 0 → A, 25 → Z, 26 → AA */
const colLetter = (i: number): string =>
  (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

type Line<T> =
  | { kind: 'row'; row: T }
  | { kind: 'sub'; label: string; from: number; to: number }
  | { kind: 'total'; from: number; to: number };

/**
 * 소계·총계는 엑셀 수식(SUBTOTAL)으로 넣는다. 화면은 금액 산술을 하지 않는다는 원칙
 * (lib/won)을 지키면서, 걸러 낸 표를 내려받아도 합계가 그 행들과 맞는다.
 * SUBTOTAL 은 범위 안의 다른 SUBTOTAL 을 건너뛰므로 총계가 소계를 두 번 더하지 않는다.
 */
const withSubtotals = <T>(rows: T[], group: ExcelGroup<T>): Line<T>[] => {
  const lines: Line<T>[] = [];
  /* 엑셀 행 번호. 1행은 머리글 */
  let at = 2;
  let start = at;
  rows.forEach((row, i) => {
    lines.push({ kind: 'row', row });
    at += 1;
    const next = rows[i + 1];
    if (next === undefined || group.key(next) !== group.key(row)) {
      lines.push({ kind: 'sub', label: group.label(row), from: start, to: at - 1 });
      at += 1;
      start = at;
    }
  });
  lines.push({ kind: 'total', from: 2, to: at - 1 });
  return lines;
};

/** "계측기목록_2026-09-02.xlsx" — 언제 뽑은 것인지 파일명에 남긴다 */
export const stampedFileName = (base: string, today: string): string => `${base}_${today}.xlsx`;

export async function downloadExcel<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  fileName: string,
  group?: ExcelGroup<T>,
): Promise<void> {
  /* 이 패키지는 루트 export 가 없다. 브라우저용 진입점을 직접 가리켜야 한다 */
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const lines: Line<T>[] = group
    ? withSubtotals(rows, group)
    : rows.map((row) => ({ kind: 'row' as const, row }));

  const blob = await writeXlsxFile(lines, {
    columns: columns.map((c, ci) => ({
      header: { value: c.header, fontWeight: 'bold' as const },
      width: c.width,
      cell: (line: Line<T>) => {
        if (line.kind !== 'row') {
          if (ci === 0)
            return {
              value: line.kind === 'sub' ? line.label : '총계',
              type: String as never,
              fontWeight: 'bold' as const,
            };
          if (!c.sum) return null;
          const col = colLetter(ci);
          /* OOXML 수식에는 앞의 '=' 를 붙이지 않는다. 이 패키지는 글자를 그대로 쓴다 */
          return {
            value: `SUBTOTAL(9,${col}${line.from}:${col}${line.to})`,
            type: 'Formula' as never,
            fontWeight: 'bold' as const,
          };
        }
        const v = c.value(line.row);
        if (v == null || v === '') return null;
        return c.numeric
          ? { value: Number(v), type: Number as never }
          : { value: String(v), type: String as never };
      },
    })),
  }).toBlob();

  saveFile({ blob, filename: fileName });
}
