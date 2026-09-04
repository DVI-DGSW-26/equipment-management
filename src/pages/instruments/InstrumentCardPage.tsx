import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { instrumentsApi } from '@/api/instruments';
import { queryKeys } from '@/api/queryKeys';
import { printAs } from '@/lib/printTitle';
import InstrumentCard from './InstrumentCard';
import { btnClass, btnPrimaryClass } from '@/components/ui';

/**
 * 이력카드만 크게 펼쳐 놓는 화면. 인쇄와 링크 공유용이다.
 *
 * 카드 자체는 상세 화면 첫 탭에도 그대로 나온다 — 카드를 보려고 상세를 거쳐 한 번 더
 * 눌러야 했던 것이 불편하다는 회신이 있었다(2026-09-02). 이 주소는 남겨 두어
 * 상세의 다른 것 없이 종이 한 장만 필요할 때 쓴다.
 *
 * 인쇄를 전제로 한 화면이라 상단 버튼은 인쇄에서 빠진다(no-print).
 */
export default function InstrumentCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const instrumentId = Number(id);

  /* 파일 이름에 쓸 이름·관리번호. 카드가 부르는 것과 같은 조회라 다시 받지 않는다 */
  const detail = useQuery({
    queryKey: queryKeys.instruments.detail(instrumentId),
    queryFn: () => instrumentsApi.detail(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });
  const d = detail.data;

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnClass}
          onClick={() => navigate(`/instruments/${instrumentId}`)}
        >
          ← 상세
        </button>
        <h1 className="text-[24px] font-semibold">계측기 이력카드</h1>
        <button
          type="button"
          className={`${btnPrimaryClass} ml-auto`}
          disabled={!d}
          onClick={() => d && printAs(`${d.name}(${d.mgmtNo})`)}
        >
          인쇄 · PDF
        </button>
      </div>

      <InstrumentCard instrumentId={instrumentId} />
    </div>
  );
}
