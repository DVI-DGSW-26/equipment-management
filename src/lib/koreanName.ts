/**
 * 사람 이름 표기.
 *
 * 통합 로그인(Keycloak)은 이름을 이름·성 두 칸으로 나눠 들고 있고, 합칠 때 서양식
 * 차례로 붙여 "유진 이" 로 내려온다. 한국 이름은 성이 앞이고 띄우지 않는다
 * (2026-09-10 요청).
 *
 *   유진 이   → 이유진
 *   지훈 남궁 → 남궁지훈
 *   이유진    → 이유진      (이미 붙어 있으면 그대로)
 *   John Smith → John Smith (한글이 아니면 손대지 않는다)
 *
 * 뒤 조각이 성인지 아닌지는 글자 수로 가른다 — 한국 성은 거의 한 글자고, 두 글자
 * 성은 손에 꼽는다. "이 유진" 처럼 이미 성이 앞인 경우는 뒤 조각이 두 글자라
 * 그대로 두는데, 붙이기만 하면 되므로 결과는 같다.
 */

/** 두 글자 성. 한 글자 성은 글자 수로 걸러지고 이것만 따로 안다 */
const TWO_LETTER_SURNAMES = [
  '남궁',
  '황보',
  '제갈',
  '사공',
  '선우',
  '서문',
  '독고',
  '동방',
  '망절',
  '어금',
];

const HANGUL_ONLY = /^[가-힣]+$/;

export function personName(raw: string | null | undefined): string {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (name === '') return '';

  const parts = name.split(' ');
  if (parts.length !== 2) return name;
  if (!parts.every((part) => HANGUL_ONLY.test(part))) return name;

  const [first, last] = parts;
  /* 뒤가 성이면 앞으로 돌린다 */
  if (last.length === 1 || TWO_LETTER_SURNAMES.includes(last)) return `${last}${first}`;
  /* 앞이 성인 경우(이 유진). 띄어쓰기만 없앤다 */
  return `${first}${last}`;
}
