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
