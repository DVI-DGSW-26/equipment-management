import { saveFile } from '@/api/client';

/**
 * 화면에 보이는 표를 엑셀 파일(.xlsx)로 내려받는다.
 *
 * 고정자산 목록표·스티커·PDF 는 서버가 만든다 — 회계에 내는 정해진 양식이라 그쪽이 맞다.
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
}

/** "계측기목록_2026-09-02.xlsx" — 언제 뽑은 것인지 파일명에 남긴다 */
export const stampedFileName = (base: string, today: string): string => `${base}_${today}.xlsx`;

export async function downloadExcel<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  fileName: string,
): Promise<void> {
  /* 이 패키지는 루트 export 가 없다. 브라우저용 진입점을 직접 가리켜야 한다 */
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const blob = await writeXlsxFile(rows, {
    columns: columns.map((c) => ({
      header: { value: c.header, fontWeight: 'bold' as const },
      width: c.width,
      cell: (row: T) => {
        const v = c.value(row);
        if (v == null || v === '') return null;
        return c.numeric
          ? { value: Number(v), type: Number as never }
          : { value: String(v), type: String as never };
      },
    })),
  }).toBlob();

  saveFile({ blob, filename: fileName });
}
