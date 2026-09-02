/**
 * 목록 화면의 키워드 검색.
 *
 * 화면에서 거르는 것은 **한 번에 다 받아 오는 목록**뿐이다 — 마스터, 감가상각 표,
 * 안전검사 대상, 연간 교정계획처럼 서버가 전체를 한 번에 주는 것들.
 *
 * 페이지를 나눠 받는 목록(고정자산·실물자산·계측기)은 서버 필터를 쓴다.
 * 그런 목록에 화면 필터를 걸면 지금 펼친 페이지 안에서만 걸러져서, 뒷장에 있는 자료를
 * "없다" 고 보여 준다. 그게 제일 잡기 어려운 종류의 오답이다.
 */
export type Matcher = (...fields: (string | number | null | undefined)[]) => boolean;

/**
 * 키워드 하나로 여러 칸을 함께 본다. 대소문자를 가리지 않고 부분일치.
 * 키워드가 비면 전부 통과시킨다.
 *
 *   const hit = searchIn(keyword);
 *   rows.filter((r) => hit(r.code, r.name, r.remark));
 */
export const searchIn = (keyword: string): Matcher => {
  const k = keyword.trim().toLowerCase();
  if (k === '') return () => true;
  return (...fields) => fields.some((f) => f != null && String(f).toLowerCase().includes(k));
};
