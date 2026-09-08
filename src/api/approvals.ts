import { request } from './client';
import type { IsoDateTime } from './types';

/**
 * 승인 요청.
 *
 * 팀장(admin)이 아닌 계정의 등록·수정·삭제는 곧바로 실행되지 않고 여기 쌓인다
 * (백엔드 회신 2026-09-08). 서버는 원 요청(method·path·body)을 통째로 보관해 두었다가
 * 승인하는 순간 승인자 권한으로 다시 실행한다 — 그래서 자산코드·관리번호 채번도
 * 등록 시점이 아니라 승인 시점에 일어난다.
 */

/**
 * FAILED 는 승인은 했는데 원 API 가 실패한 것이다 (예: 그 사이 대상이 지워짐).
 * 원인을 고친 뒤 다시 승인할 수 있어서 대기와는 다르게 다룬다.
 */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'FAILED';

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
  FAILED: '실행 실패',
};

export interface ApprovalRequest {
  id: number;
  requesterUsername: string;
  requesterName: string | null;
  /** 원 요청. POST 등록도 여기로 온다 */
  method: string;
  path: string;
  queryString: string | null;
  /** 요청 본문(JSON 문자열). 무엇을 바꾸려 했는지 확인용 */
  body: string | null;
  summary: string | null;
  status: ApprovalStatus;
  /** 서버가 준 상태 이름. 없으면 APPROVAL_STATUS_LABEL 로 적는다 */
  statusLabel: string | null;
  reviewerUsername: string | null;
  reviewerName: string | null;
  reviewedAt: IsoDateTime | null;
  rejectReason: string | null;
  /** 승인 실행 시 원 API 의 HTTP 상태. 2xx 면 적용됐다 */
  resultStatus: number | null;
  resultMessage: string | null;
  createdAt: IsoDateTime;
}

export const statusLabel = (r: ApprovalRequest): string =>
  r.statusLabel ?? APPROVAL_STATUS_LABEL[r.status] ?? r.status;

/**
 * 승인이 실제로 반영됐는가.
 *
 * 상태로 가른다 — 서버가 실행에 실패한 건은 APPROVED 가 아니라 FAILED 로 남긴다.
 * resultStatus 로 따지면 서버가 그 값을 안 채운 경우 성공한 것을 실패로 읽고,
 * 그 말을 믿은 사람이 이미 반영된 요청을 한 번 더 승인하게 된다.
 */
export const isApplied = (r: ApprovalRequest): boolean => r.status === 'APPROVED';

export const approvalsApi = {
  /** status 를 비우면 전체 */
  list: (status?: ApprovalStatus) =>
    request<ApprovalRequest[]>('GET', '/approval', { query: { status } }),
  detail: (id: number) => request<ApprovalRequest>('GET', `/approval/${id}`),
  pendingCount: () => request<number>('GET', '/approval/pending-count'),
  /** 관리자만. 보관된 요청을 승인자 권한으로 실행한다 */
  approve: (id: number) => request<ApprovalRequest>('POST', `/approval/${id}/approve`),
  /** 관리자만. 사유는 요청자가 목록에서 본다 */
  reject: (id: number, reason: string) =>
    request<ApprovalRequest>('POST', `/approval/${id}/reject`, { body: { reason } }),
  /** 요청자 본인 또는 관리자가 대기 중인 요청을 거둬들인다 */
  cancel: (id: number) => request<void>('POST', `/approval/${id}/cancel`),
};
