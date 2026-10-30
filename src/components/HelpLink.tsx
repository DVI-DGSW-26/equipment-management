import { MANUAL_PAGES, MANUAL_URL, type ManualTopic } from '@/config/manual';

/**
 * 화면 제목 옆 "?" — 사용 설명서의 그 화면 설명 쪽을 새 창으로 연다.
 *
 * 메뉴에 "사용설명" 탭을 따로 두지 않는다. 막힌 화면에서 바로 그 쪽을 여는 편이
 * 32쪽짜리 설명서를 처음부터 찾는 것보다 빠르고, 위쪽 메뉴는 이미 꽉 찼다 (2026-10-30).
 * 쪽 번호는 브라우저 PDF 보기의 #page= 로 넘긴다. 인쇄할 때는 감춘다.
 */
export default function HelpLink({ topic, className = '' }: { topic: ManualTopic; className?: string }) {
  const page = MANUAL_PAGES[topic];
  return (
    <a
      href={`${MANUAL_URL}#page=${page}`}
      target="_blank"
      rel="noopener"
      title={`사용 설명서 ${page}쪽 — 이 화면 쓰는 법`}
      aria-label={`사용 설명서 ${page}쪽 보기`}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface align-middle text-[16px] font-bold text-fg-sub hover:border-accent hover:text-accent print:hidden ${className}`}
    >
      ?
    </a>
  );
}
