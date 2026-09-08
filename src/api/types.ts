/**
 * 금액. 서버가 JSON number 로 내려준다 (소수 2자리, 원 단위).
 * 화면에서 금액 산술을 하지 않는다. 합계·상각비·장부가액은 전부 서버 계산값을 그대로 표시한다.
 * 포맷은 src/lib/won.ts 한 곳에서만 한다.
 */
export type Won = number;

/** "YYYY-MM-DD" */
export type IsoDate = string;
/** "YYYY-MM-DDTHH:mm:ss" */
export type IsoDateTime = string;

/** 모든 응답의 공통 봉투. request() 가 data 만 벗겨서 돌려준다 */
export interface BaseResponse<T> {
  status: number;
  message: string;
  data: T;
}

/** Spring Data 페이지 원형 */
export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  /** 0-base */
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

/** 화면에서 쓰는 페이지. page 는 서버와 동일하게 0-base */
export interface Page<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  size: number;
}

export const toPage = <T>(p: SpringPage<T>): Page<T> => ({
  items: p?.content ?? [],
  total: p?.totalElements ?? 0,
  totalPages: p?.totalPages ?? 0,
  page: p?.number ?? 0,
  size: p?.size ?? 0,
});

/** 서버 에러 본문: {"code":"STICKER_NO_PRINTABLE","status":400,"message":"..."} */
export interface ApiErrorBody {
  code?: string;
  message: string;
  fieldErrors?: { field: string; message: string }[];
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get code(): string {
    return this.body.code ?? 'UNKNOWN';
  }
}

/** 화면 공통 에러 메시지 추출 */
export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류';

/**
 * 승인 대기(HTTP 202). 요청은 접수됐지만 아직 아무것도 만들어지지 않았다.
 *
 * 팀장(admin)이 아닌 계정의 자산·실물자산·계측기·안전검사 등록은 곧바로 생기지 않고
 * 승인 요청으로 접수된다 (백엔드 회신 2026-09-08). 자산코드·관리번호 채번도 승인
 * 시점에 일어난다.
 *
 * 202 도 res.ok 라 그냥 두면 성공으로 흘러가 "등록되었습니다" 를 띄우고 목록으로
 * 보내는데, 정작 목록에는 아무것도 없다. 그래서 성공 경로에서 끊어 낸다 —
 * 실패라서가 아니라, 호출한 쪽이 onSuccess 를 타면 안 되기 때문이다.
 * 화면에서는 isApprovalPending 으로 갈라 실패가 아닌 안내로 보여준다.
 */
export class ApprovalPendingError extends ApiError {
  /** 승인 화면에서 이 건을 가리키는 번호 */
  approvalRequestId: number | null;

  constructor(body: ApiErrorBody, approvalRequestId: number | null) {
    super(202, body);
    this.name = 'ApprovalPendingError';
    this.approvalRequestId = approvalRequestId;
  }
}

export const isApprovalPending = (e: unknown): e is ApprovalPendingError =>
  e instanceof ApprovalPendingError;

/** 권한 밖. 서버가 도메인 롤과 쓰기 권한을 같이 본다 */
export const isForbidden = (e: unknown): boolean => e instanceof ApiError && e.status === 403;

/** 서버가 사유를 안 적어 보냈을 때 쓸 안내 */
export const FORBIDDEN_TEXT = '권한이 없는 항목입니다. 관리팀에 문의하세요.';

/** 403 안내. 서버 문구가 있으면 그것을 쓴다 */
export const forbiddenMessage = (e: unknown): string => {
  const message = e instanceof ApiError ? e.body.message?.trim() : '';
  return message ? message : FORBIDDEN_TEXT;
};
