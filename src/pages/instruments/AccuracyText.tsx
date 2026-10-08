/**
 * 표의 '정도' 칸.
 *
 * 숫자만 적힌 값(0.1 · 0.01 · 0.001 · 1)이 대부분인데, 글자 수가 달라 왼쪽에 붙여 두면
 * 소수점이 들쭉날쭉해 어느 것이 더 정밀한지 한눈에 비교되지 않았다(2026-10-08 요청).
 * 정수부와 소수부를 고정 폭으로 나눠 소수점이 세로로 맞게 그린다.
 *
 * 값 자체는 바꾸지 않는다. 단위를 붙이지 않는 것도 그래서다 — 같은 0.1 이라도
 * 전자저울은 g, 경도기는 HR 이라 숫자만 보고 단위를 정하면 틀린 값이 찍힌다.
 * "0.01kg", "±0.2 % Brix" 처럼 글자가 섞인 값은 적힌 그대로 둔다.
 *
 * 긴 글("±2.5℃ / ±2% of reading ±2℃ …")은 한 칸이 표 폭을 다 먹어 노트북에서 목록이
 * 잘리고 옆으로 밀어야 했다(2026-10-08 요청). 일정 폭에서 … 으로 자르고, 마우스를 올리면
 * 전체가 보인다. 엑셀 내려받기에는 전체가 그대로 들어간다.
 */
const PLAIN_NUMBER = /^(\d+)(?:\.(\d+))?$/;

export default function AccuracyText({ value }: { value: string | null }) {
  const v = value?.trim() ?? '';
  if (v === '') return <>-</>;

  const m = PLAIN_NUMBER.exec(v);
  if (!m)
    return (
      <span className="inline-block max-w-[11em] truncate align-bottom" title={v}>
        {v}
      </span>
    );

  return (
    <span className="inline-flex tabular-nums" title={v}>
      <span className="inline-block min-w-[2ch] text-right">{m[1]}</span>
      <span className="inline-block min-w-[4ch] text-left">{m[2] ? `.${m[2]}` : ''}</span>
    </span>
  );
}
