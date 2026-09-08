import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approvalsApi,
  isApplied,
  statusLabel,
  type ApprovalRequest,
  type ApprovalStatus,
} from '@/api/approvals';
import { queryKeys } from '@/api/queryKeys';
import { bodyRows, describeRequest, targetNoOf } from '@/domain/approvalText';
import { useMe, usePerms } from '@/hooks/useMe';
import { fmtDateTime } from '@/lib/date';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Field,
  inputClass,
  QueryState,
  Section,
  Tabs,
  thClass,
} from '@/components/ui';

/**
 * 승인 화면.
 *
 * 팀장이 아닌 계정의 등록·수정·삭제는 곧바로 실행되지 않고 여기 쌓인다. 서버는 원
 * 요청을 통째로 보관해 두었다가 승인하는 순간 승인자 권한으로 다시 실행한다
 * (백엔드 회신 2026-09-08).
 *
 * 팀장만 쓰는 화면이 아니다 — 담당자도 자기가 올린 요청이 어떻게 됐는지, 반려됐다면
 * 왜인지 여기서 본다. 그래서 메뉴는 모두에게 보이고 승인·반려 단추만 팀장에게 나온다.
 */

type TabKey = ApprovalStatus | 'ALL';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING', label: '대기' },
  { key: 'APPROVED', label: '승인' },
  { key: 'REJECTED', label: '반려' },
  { key: 'CANCELED', label: '취소' },
  { key: 'FAILED', label: '실행 실패' },
  { key: 'ALL', label: '전체' },
];

const TONE: Record<ApprovalStatus, 'muted' | 'warn' | 'danger' | 'accent'> = {
  PENDING: 'warn',
  APPROVED: 'accent',
  REJECTED: 'danger',
  CANCELED: 'muted',
  FAILED: 'danger',
};

/**
 * 표와 확인창에 함께 쓰는 한 줄 요약.
 *
 * 주소(POST /asset)를 그대로 적으면 승인하는 사람이 무엇을 하려는 요청인지 알 수 없다
 * (2026-09-09 요청). 주소를 한글 동작 이름으로 옮긴다. 서버가 요약을 주면 그것을 쓴다 —
 * 자산명처럼 어느 건인지까지 적혀 있을 수 있다.
 */
const titleOf = (r: ApprovalRequest): string => describeRequest(r.method, r.path);

export default function ApprovalListPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const { perms } = usePerms();

  const [tab, setTab] = useState<TabKey>('PENDING');
  const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null);
  const [viewing, setViewing] = useState<ApprovalRequest | null>(null);

  const status = tab === 'ALL' ? undefined : tab;
  const list = useQuery({
    queryKey: queryKeys.approvals.list(status),
    queryFn: () => approvalsApi.list(status),
  });

  /* 목록과 헤더 배지가 같이 움직여야 한다 */
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.approvals.all });

  const approve = useMutation({
    mutationFn: (id: number) => approvalsApi.approve(id),
    onSuccess: (r) => {
      /*
       * 승인했다고 반영된 것은 아니다. 보관해 둔 요청을 지금 실행하는 것이라 그 사이
       * 대상이 지워졌으면 FAILED 로 남는다. 원 API 의 결과를 그대로 알린다.
       */
      if (isApplied(r)) toast.ok(r.resultMessage || '승인했습니다. 요청이 반영되었습니다.');
      else toast.fail(new Error(r.resultMessage || '승인했지만 요청 실행에 실패했습니다.'));
      refresh();
    },
    onError: toast.fail,
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => approvalsApi.reject(id, reason),
    onSuccess: () => {
      toast.ok('반려했습니다. 요청자가 사유를 볼 수 있습니다.');
      setRejecting(null);
      refresh();
    },
    onError: toast.fail,
  });

  const cancel = useMutation({
    mutationFn: (id: number) => approvalsApi.cancel(id),
    onSuccess: () => {
      toast.ok('요청을 거둬들였습니다.');
      refresh();
    },
    onError: toast.fail,
  });

  const rows = list.data ?? [];
  /** 내가 올린 요청인가. 본인은 대기 중인 것을 스스로 거둘 수 있다 */
  const isMine = (r: ApprovalRequest) => !!me.data && r.requesterUsername === me.data.username;
  const busy = approve.isPending || reject.isPending || cancel.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-[24px] font-semibold">승인</h1>
        <span className="text-[18px] text-fg-muted">
          {perms.admin
            ? '등록·수정·삭제 요청을 검토합니다. 승인하면 그때 실제로 반영됩니다.'
            : '내가 올린 요청의 처리 결과를 봅니다.'}
        </span>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <Section title={`${TABS.find((t) => t.key === tab)?.label ?? ''} ${rows.length}건`}>
        <QueryState
          isPending={list.isPending}
          error={list.error}
          isEmpty={rows.length === 0}
          emptyText={
            tab === 'PENDING' ? '승인을 기다리는 요청이 없습니다.' : '해당하는 요청이 없습니다.'
          }
        />
        {rows.length > 0 && (
          <table className="w-max min-w-full text-[19px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={thClass}>요청일시</th>
                <th className={thClass}>요청자</th>
                <th className={thClass}>요청 내용</th>
                <th className={thClass}>상태</th>
                <th className={thClass}>처리</th>
                <th className={thClass}>사유 · 결과</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top hover:bg-bg">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.requesterName ?? r.requesterUsername}
                    {isMine(r) && <span className="ml-1 text-[17px] text-fg-muted">(나)</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left text-accent hover:underline"
                      title="무엇을 바꾸려 했는지 봅니다"
                      onClick={() => setViewing(r)}
                    >
                      {titleOf(r)}
                    </button>
                    {/* 서버가 준 요약(자산명 등)과 몇 번 대상인지. 둘 다 없으면 줄을 만들지 않는다 */}
                    {(r.summary || targetNoOf(r.path)) && (
                      <div className="text-[17px] text-fg-muted">
                        {r.summary}
                        {r.summary && targetNoOf(r.path) ? ' · ' : ''}
                        {targetNoOf(r.path) ? `${targetNoOf(r.path)}번 대상` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge tone={TONE[r.status]}>{statusLabel(r)}</Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-fg-sub">
                    {r.reviewedAt ? (
                      <>
                        {r.reviewerName ?? r.reviewerUsername ?? ''}
                        <div className="text-[17px] text-fg-muted">{fmtDateTime(r.reviewedAt)}</div>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="max-w-[280px] px-3 py-2 text-fg-sub">
                    {r.rejectReason || r.resultMessage || '-'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {/* 승인·반려는 팀장만. 서버도 관리자가 아니면 403 이다 */}
                    {perms.admin && (r.status === 'PENDING' || r.status === 'FAILED') && (
                      <button
                        type="button"
                        className={`${btnPrimaryClass} mr-2`}
                        disabled={busy}
                        onClick={() => {
                          const ask =
                            r.status === 'FAILED'
                              ? '실행에 실패했던 요청을 다시 실행합니다.'
                              : `${titleOf(r)}\n\n승인하면 지금 실제로 반영됩니다.`;
                          if (window.confirm(ask)) approve.mutate(r.id);
                        }}
                      >
                        {r.status === 'FAILED' ? '다시 승인' : '승인'}
                      </button>
                    )}
                    {perms.admin && r.status === 'PENDING' && (
                      <button
                        type="button"
                        className={`${btnDangerClass} mr-2`}
                        disabled={busy}
                        onClick={() => setRejecting(r)}
                      >
                        반려
                      </button>
                    )}
                    {r.status === 'PENDING' && (isMine(r) || perms.admin) && (
                      <button
                        type="button"
                        className={btnClass}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('올린 요청을 거둬들입니다.')) cancel.mutate(r.id);
                        }}
                      >
                        취소
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {viewing && <BodyModal request={viewing} onClose={() => setViewing(null)} />}

      {rejecting && (
        <RejectModal
          request={rejecting}
          pending={reject.isPending}
          onClose={() => setRejecting(null)}
          onSubmit={(reason) => reject.mutate({ id: rejecting.id, reason })}
        />
      )}
    </div>
  );
}

/* ---------- 요청 내용 보기 ---------- */

function BodyModal({ request, onClose }: { request: ApprovalRequest; onClose: () => void }) {
  const rows = bodyRows(request.body);
  const target = targetNoOf(request.path);

  return (
    <Modal title="요청 내용" width={720} onClose={onClose}>
      <div className="space-y-3 text-[19px]">
        <div>
          <p className="text-[21px] font-semibold">{describeRequest(request.method, request.path)}</p>
          <p className="text-[18px] text-fg-muted">
            {request.requesterName ?? request.requesterUsername} 요청
            {target ? ` · ${target}번 대상` : ''}
          </p>
        </div>

        {request.summary && <p className="text-fg-sub">{request.summary}</p>}

        {/* 적어 넣은 값. 칸 이름을 한글로 옮겨 표로 보여 준다 */}
        {rows.length > 0 ? (
          <table className="w-full text-[18px]">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-line align-top">
                  <th className="w-48 bg-bg px-3 py-1.5 text-left font-medium text-fg-sub">
                    {row.label}
                    {/* 아직 한글 이름을 붙이지 않은 칸. 값은 그대로 보여 준다 */}
                    {row.unknown && <span className="ml-1 text-[16px] text-fg-muted">(원문)</span>}
                  </th>
                  <td className="px-3 py-1.5">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-fg-muted">
            따로 적어 넣은 값이 없는 요청입니다 (삭제·폐기처럼 대상만 지정하는 경우).
          </p>
        )}

        {request.resultMessage && (
          <p className="text-fg-sub">실행 결과: {request.resultMessage}</p>
        )}

        {/* 문제가 생겼을 때 백엔드에 그대로 옮겨 물어볼 수 있게 원 요청도 남겨 둔다 */}
        <details className="text-[17px] text-fg-muted">
          <summary className="cursor-pointer">기술 정보</summary>
          <div className="code mt-1 break-all">
            {request.method} {request.path}
            {request.queryString ? `?${request.queryString}` : ''}
            {request.resultStatus != null && ` → ${request.resultStatus}`}
          </div>
        </details>
      </div>
    </Modal>
  );
}

/* ---------- 반려 ---------- */

function RejectModal({
  request,
  pending,
  onClose,
  onSubmit,
}: {
  request: ApprovalRequest;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim() !== '';

  return (
    <Modal
      title="반려"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnDangerClass}
            disabled={!valid || pending}
            onClick={() => onSubmit(reason.trim())}
          >
            {pending ? '반려 중…' : '반려'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-[18px] text-fg-sub">{titleOf(request)}</p>
        {/* 사유는 서버가 필수로 받고, 요청자가 목록에서 그대로 본다 */}
        <Field label="반려 사유" hint="요청자에게 그대로 보입니다.">
          <input
            className={inputClass}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 취득가액이 계산서와 다릅니다."
          />
        </Field>
      </div>
    </Modal>
  );
}
