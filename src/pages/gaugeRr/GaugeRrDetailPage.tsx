import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBackToList } from '@/hooks/useBackToList';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gaugeRrApi } from '@/api/gaugeRr';
import { queryKeys } from '@/api/queryKeys';
import { useCanEdit } from '@/hooks/useMe';
import { fmtDate } from '@/lib/date';
import { printAs } from '@/lib/printTitle';
import { JUDGMENT_TONE } from '@/domain/gaugeRr';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  QueryState,
  ReadOnlyChip,
} from '@/components/ui';
import GaugeRrModal from './GaugeRrModal';
import GaugeRrSheet from './GaugeRrSheet';
import GaugeRrPrintSheet from './GaugeRrPrintSheet';

export default function GaugeRrDetailPage() {
  const { id } = useParams();
  const studyId = Number(id);
  const navigate = useNavigate();
  const backToList = useBackToList('/gauge-rr');
  const qc = useQueryClient();
  const toast = useToast();
  /* 보는 것은 누구나, 고치는 것은 계측기 영역을 맡은 사람과 팀장만 */
  const edit = useCanEdit('instrument');
  const [editing, setEditing] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.gaugeRr.detail(studyId),
    queryFn: () => gaugeRrApi.detail(studyId),
    enabled: Number.isFinite(studyId),
  });

  /* 팀장이 아니면 202 승인 대기로 온다 — toast.fail 이 안내로 띄우고 화면은 그대로 둔다 */
  const remove = useMutation({
    mutationFn: () => gaugeRrApi.remove(studyId),
    onSuccess: () => {
      toast.ok('삭제했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
      backToList();
    },
    onError: toast.fail,
  });

  const d = detail.data;

  return (
    <div className="space-y-3">
      {/* 인쇄하면 종이에는 양식만 나간다 */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onClick={backToList}>
          ← 목록
        </button>
        <h1 className="text-[24px] font-semibold">게이지 R&amp;R</h1>
        {d && (
          <>
            <span className="code text-[19px] text-fg-sub">{d.partNumber}</span>
            <span className="text-[19px] text-fg-sub">{fmtDate(d.performedDate)}</span>
            <Badge tone={JUDGMENT_TONE[d.judgment]}>{d.judgmentLabel}</Badge>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!edit && <ReadOnlyChip />}
          {d?.instrumentId != null && (
            <button
              type="button"
              className={btnClass}
              onClick={() => navigate(`/instruments/${d.instrumentId}`)}
            >
              계측기 보기
            </button>
          )}
          <button
            type="button"
            className={btnClass}
            disabled={!d}
            onClick={() => d && printAs(`GaugeRR_${d.partNumber}_${d.performedDate}`)}
          >
            인쇄 · PDF
          </button>
          {edit && (
            <>
              <button
                type="button"
                className={btnClass}
                disabled={!d}
                onClick={() => setEditing(true)}
              >
                수정
              </button>
              <button
                type="button"
                className={btnDangerClass}
                disabled={!d || remove.isPending}
                onClick={() => {
                  if (window.confirm('이 게이지 R&R 기록을 삭제합니다.')) remove.mutate();
                }}
              >
                삭제
              </button>
            </>
          )}
        </div>
      </div>

      <QueryState isPending={detail.isPending} error={detail.error} />
      {/* 화면은 읽기 좋게 고친 배치, 종이는 엑셀 양식 그대로 */}
      {d && (
        <div className="print:hidden">
          <GaugeRrSheet d={d} />
        </div>
      )}
      {d && <GaugeRrPrintSheet d={d} />}
      {d && editing && <GaugeRrModal study={d} onClose={() => setEditing(false)} />}
    </div>
  );
}
