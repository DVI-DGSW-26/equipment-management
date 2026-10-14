import type { GaugeRrPlan } from '@/api/gaugeRr';
import { getToday } from '@/lib/date';

/**
 * 인쇄 전용 — 품질팀 엑셀 "게이지 R&R 계획표" 의 "년간" 시트를 그대로 옮긴다 (요청 2026-10-14).
 *
 * 엑셀 인쇄 설정(A4 가로, 너비 한 장)에 맞춘다. 열 너비는 엑셀 A~AG 의 비율 그대로다.
 * 한 계획이 두 줄이다 — 위는 계획, 아래는 실적.
 *   계획 줄  계획월 칸에 ○. 실적이 이어졌으면 ● (엑셀에서 실시한 계획을 칠해 두던 것)
 *   실적 줄  실시한 달 칸에 실시일 "1/15"
 * 머리 두 줄은 장마다 다시 찍힌다(엑셀 인쇄 제목 6:7행). 한 계획의 두 줄은 장을 넘겨 갈리지 않는다.
 *
 * 결재란은 엑셀에 그림으로 붙어 있던 것을 칸으로 그렸다. 서명·날짜는 종이에 손으로 적는다.
 */

/** 엑셀 열 너비(문자 수). A NO · B 품명 · C PART NO. · D GAGE 명 · E S/NO. · F 항목 · G 계획월 · H 구분 · I~AF 월(2칸씩) · AG 확인 */
const HEAD_W = [3.42, 19.08, 17.83, 18.83, 10.08, 9.17, 6.17, 5.08];
const MONTH_W = 2.67 * 2;
const CHECK_W = 6.42;
const TOTAL_W = HEAD_W.reduce((a, b) => a + b, 0) + MONTH_W * 12 + CHECK_W;
const pct = (w: number) => `${(w / TOTAL_W) * 100}%`;

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 엑셀 머리 칸의 회색 (#D9D9D9) */
const HEAD = 'bg-[#d9d9d9]';

/** 상반기·하반기 사이 굵은 선. 6월 칸 오른쪽 */
const halfLine = (m: number) => (m === 6 ? 'border-r-2' : '');

/** 계획 줄과 실적 줄 사이는 점선이다. 세로선은 실선 그대로 둔다 */
const DOTTED_BOTTOM = 'border-b [border-bottom-style:dotted]';

/** "2026-01-15" → "1/15" */
const monthDay = (iso: string | null): string => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export default function GaugeRrPlanPrintSheet({
  year,
  plans,
}: {
  year: number;
  plans: GaugeRrPlan[];
}) {
  const today = getToday();
  const written = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;

  return (
    <div
      className="hidden text-[9pt] text-black [print-color-adjust:exact] print:block [&_td]:border-black [&_th]:border-black"
      aria-hidden
    >
      {/* ---------- 제목 · 범례 · 결재 (엑셀 1~5행) ---------- */}
      <div className="flex items-end gap-[8pt]">
        <h1 className="flex-1 pb-[4pt] text-center text-[22pt] font-bold tracking-[0.05em]">
          {year}년 게이지 R&amp;R 계획 및 관리 대장
        </h1>
        <table className="mb-[2pt] border-collapse text-[8pt] [&_td]:border [&_td]:px-[4pt] [&_td]:text-center">
          <tbody>
            <tr>
              <td>○</td>
              <td>계획</td>
            </tr>
            <tr>
              <td>일자</td>
              <td>실적</td>
            </tr>
          </tbody>
        </table>
        <table className="border-collapse text-[9pt] [&_td]:border [&_td]:text-center">
          <tbody>
            <tr>
              <td rowSpan={3} className="w-[16pt] px-[2pt] leading-[1.2]">
                결<br />재
              </td>
              <td className="w-[44pt]">작 성</td>
              <td className="w-[44pt]">검 토</td>
              <td className="w-[44pt]">승 인</td>
            </tr>
            <tr>
              <td className="h-[24pt]" />
              <td />
              <td />
            </tr>
            <tr>
              <td>/</td>
              <td>/</td>
              <td>/</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="pb-[2pt] text-[10pt]">작성일: {written}</p>

      {/* ---------- 계획표 (엑셀 6~19행) ---------- */}
      <table className="w-full table-fixed border-collapse border-2 border-black">
        <colgroup>
          {HEAD_W.map((w, i) => (
            <col key={i} style={{ width: pct(w) }} />
          ))}
          {MONTHS.map((m) => (
            <col key={m} style={{ width: pct(MONTH_W) }} />
          ))}
          <col style={{ width: pct(CHECK_W) }} />
        </colgroup>
        <thead className={`${HEAD} text-[9.5pt] [&_th]:border [&_th]:font-normal`}>
          <tr>
            <th rowSpan={2}>NO</th>
            {/* 엑셀 양식은 "품 명" 이지만 제품으로 적는다 (요청 2026-10-14) */}
            <th rowSpan={2}>제 품</th>
            <th rowSpan={2}>PART NO.</th>
            <th rowSpan={2}>GAGE 명</th>
            <th rowSpan={2}>S/NO.</th>
            <th rowSpan={2}>항 목</th>
            <th rowSpan={2}>계획월</th>
            <th rowSpan={2}>구분</th>
            <th colSpan={6} className="border-r-2">
              상반기
            </th>
            <th colSpan={6}>하반기</th>
            <th rowSpan={2}>확인</th>
          </tr>
          <tr>
            {MONTHS.map((m) => (
              <th key={m} className={halfLine(m)}>
                {m}월
              </th>
            ))}
          </tr>
        </thead>
        {plans.map((p) => (
          /* 한 계획의 계획·실적 두 줄은 장을 넘겨 갈리지 않게 묶는다 */
          <tbody
            key={p.id}
            className="break-inside-avoid border-b border-black [&_td]:h-[19pt] [&_td]:px-[2pt] [&_td]:align-middle"
          >
            <tr>
              <td rowSpan={2} className="border text-center">
                {p.seq}
              </td>
              <td className={`border-x ${DOTTED_BOTTOM}`}>{p.product}</td>
              <td rowSpan={2} className="border whitespace-nowrap">
                {p.partNo}
              </td>
              <td rowSpan={2} className="border text-center">
                {p.gageName}
              </td>
              <td rowSpan={2} className="border text-center text-[8.5pt] whitespace-nowrap">
                {p.gageSerial ?? ''}
              </td>
              <td rowSpan={2} className="border text-center">
                {p.item ?? ''}
              </td>
              <td rowSpan={2} className="border text-center">
                {String(p.plannedMonth).padStart(2, '0')}월
              </td>
              <td className={`border-x ${DOTTED_BOTTOM} text-center`}>계획</td>
              {MONTHS.map((m) => (
                <td
                  key={m}
                  className={`border-l ${DOTTED_BOTTOM} text-center ${halfLine(m)}`}
                >
                  {p.plannedMonth === m ? (p.done ? '●' : '○') : ''}
                </td>
              ))}
              <td rowSpan={2} className="border" />
            </tr>
            <tr>
              <td className="border-x">{p.productSpec ?? ''}</td>
              <td className="border-x text-center">실적</td>
              {MONTHS.map((m) => (
                <td key={m} className={`border-l text-center whitespace-nowrap ${halfLine(m)}`}>
                  {p.done && p.performedMonth === m ? monthDay(p.performedDate) : ''}
                </td>
              ))}
            </tr>
          </tbody>
        ))}
      </table>
      <p className="pt-[3pt] text-[10pt]">
        ※측정 대상물 선정 방법은 중점관리 제품 및 품질문제 발생소지가 있는 제품에 대하여
        품질관리팀장이 변경 할수 있음
      </p>
    </div>
  );
}
