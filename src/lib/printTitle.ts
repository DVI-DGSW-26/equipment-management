/**
 * 인쇄·PDF 저장 파일 이름.
 *
 * 브라우저는 "PDF 로 저장" 할 때 문서 제목(document.title)을 파일 이름으로 쓴다.
 * 그대로 두면 앱 이름이 찍혀 여러 장을 받아 놓으면 어느 계측기 것인지 알 수 없다
 * (요청 2026-09-04). 인쇄하는 동안만 제목을 바꿔 두었다가 되돌린다.
 *
 * 되돌리는 시점은 afterprint 다 — window.print() 는 브라우저마다 언제 돌아오는지가
 * 달라, 바로 되돌리면 저장되기 전에 원래 제목으로 바뀌는 수가 있다.
 */

/** 파일 이름에 쓸 수 없는 글자를 뺀다. 브라우저가 알아서 바꾸기도 하지만 제각각이다 */
const safe = (s: string): string => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

/** 계측기 이력카드 → "전자저울(ALP-B07)" */
export const printAs = (title: string): void => {
  const previous = document.title;
  document.title = safe(title) || previous;

  const restore = () => {
    document.title = previous;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);

  window.print();
};
