import {
  getExpiresAt,
  getRefreshToken,
  getToken,
  handleUnauthorized,
  setSession,
} from '@/lib/session';
import { ApiError, ApprovalPendingError, type ApiErrorBody, type BaseResponse } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** 쿼리 파라미터. 각 API 모듈의 Query 타입을 그대로 넘길 수 있도록 object 로 받는다 */
export type QueryParams = object;

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * 개발 중에는 vite 프록시(/api → 백엔드)를 탄다. 백엔드에 CORS 헤더가 없어 직접 호출은 실패한다.
 * 배포 시 같은 오리진에 얹거나 .env 의 VITE_API_BASE_URL 을 절대 주소로 바꾼다.
 */
/*
 * 값이 비어 있으면 기본값으로 돌린다.
 * ?? 를 쓰면 빈 문자열을 "설정된 값"으로 받아들여서, 배포 환경에
 * VITE_API_BASE_URL 이 빈 값으로 들어가면 /api 접두어가 통째로 사라진다.
 * 그러면 /instrument 같은 화면 주소를 호출하게 되고 index.html 이 돌아온다.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api';

const buildUrl = (path: string, query?: QueryParams): string => {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries((query ?? {}) as Record<string, unknown>).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)));
    else url.searchParams.set(k, String(v));
  });
  return url.toString();
};

/** 로그인 토큰. 서버 인증이 켜지면 이게 없는 요청은 전부 401 이다 */
const authHeaders = (extra?: Record<string, string>): Record<string, string> | undefined => {
  const token = getToken();
  const headers = { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return Object.keys(headers).length > 0 ? headers : undefined;
};

const parseError = async (res: Response): Promise<never> => {
  /* 갱신까지 해 봤는데도 401 이면 로그인이 끝난 것이다 */
  if (res.status === 401) handleUnauthorized();

  let body: ApiErrorBody = { message: `요청 실패 (${res.status})` };
  try {
    const json = (await res.json()) as ApiErrorBody;
    if (json?.message) body = json;
  } catch {
    /* JSON 이 아닌 응답(프록시 오류 등)은 기본 메시지 사용 */
  }
  throw new ApiError(res.status, body);
};

const doFetch = (method: HttpMethod, path: string, options: RequestOptions): Promise<Response> =>
  fetch(buildUrl(path, options.query), {
    method,
    headers: authHeaders(
      options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

/**
 * 앱 토큰 갱신.
 *
 * 토큰 수명이 30분이라 그때마다 로그인 화면으로 튕기고 작업하던 화면이 날아갔다.
 * 보관해 둔 갱신 핸들로 새 토큰을 받아 이어 쓴다 (백엔드 회신 2026-09-09).
 *
 * ## 핸들은 1회용이다
 *
 * 응답으로 온 새 핸들로 반드시 덮어써야 한다. 이미 쓴 핸들을 다시 보내면 서버가
 * 탈취로 보아 그 로그인을 통째로 끊는다(401 REFRESH_TOKEN_REUSED). 인증 서버 정책이라
 * 완화할 수 없다. 그래서 갱신은 한 번에 하나만 나가야 한다.
 *
 *   같은 탭   진행 중인 약속을 함께 기다린다(single-flight).
 *   다른 탭   localStorage 에 표시를 걸고, 남이 걸어 두었으면 새 토큰이 올 때까지 기다린다.
 *
 * ## 갱신 시점
 *
 * 요청을 보내기 전에 만료가 가까우면(1분 남았거나 이미 지났으면) 먼저 갱신한다.
 * 타이머를 걸지 않아도 되고, 오래 손을 놓았다가 다시 눌러도 첫 요청에서 걸린다.
 * 그래도 401 이 오면(시계 차이 등) 한 번 갱신하고 원래 요청을 다시 보낸다.
 */

/** 만료까지 이만큼 남았으면 미리 갱신한다 */
const RENEW_BEFORE_MS = 60_000;

/** 다른 탭이 갱신 중임을 알리는 표시 */
const LOCK_KEY = 'jagigo.refreshing';
/** 표시가 이보다 오래됐으면 그 탭이 죽은 것으로 보고 우리가 한다 */
const LOCK_STALE_MS = 15_000;
/** 다른 탭의 갱신을 기다리는 최대 시간 */
const WAIT_MS = 12_000;
const WAIT_STEP_MS = 150;

interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

/** 지금 이 탭에서 진행 중인 갱신 */
let inFlight: Promise<string | null> | null = null;

const lockAt = (): number => {
  try {
    return Number(localStorage.getItem(LOCK_KEY)) || 0;
  } catch {
    return 0;
  }
};
const setLock = (value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(LOCK_KEY);
    else localStorage.setItem(LOCK_KEY, value);
  } catch {
    /* 저장소가 막힌 브라우저에서는 탭 사이 조율을 포기하고 그냥 갱신한다 */
  }
};

const sleep = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

/** 다른 탭이 갱신을 마치고 새 토큰을 넣어 줄 때까지 기다린다 */
async function waitForOtherTab(before: string | null): Promise<string | null> {
  for (let waited = 0; waited < WAIT_MS; waited += WAIT_STEP_MS) {
    await sleep(WAIT_STEP_MS);
    const now = getToken();
    if (now && now !== before) return now;
    /* 남이 손을 놓았으면 우리가 한다 */
    if (Date.now() - lockAt() > LOCK_STALE_MS) return null;
  }
  return null;
}

/**
 * 갱신을 한 번만 보낸다. 여러 요청이 동시에 불러도 약속 하나를 함께 기다린다.
 * 돌려주는 값은 새 앱 토큰이고, 더 이상 갱신할 수 없으면 null 이다.
 */
function refreshOnce(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = runRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRefresh(): Promise<string | null> {
  const before = getToken();

  /* 다른 탭이 하고 있으면 그 결과를 쓴다 — 낡은 핸들을 두 번 보내면 로그인이 끊긴다 */
  if (Date.now() - lockAt() <= LOCK_STALE_MS) {
    const fromOther = await waitForOtherTab(before);
    if (fromOther) return fromOther;
  }

  const handle = getRefreshToken();
  if (!handle) return null;

  setLock(String(Date.now()));
  try {
    /* 만료된 뒤에 부르는 자리라 토큰을 붙이지 않는다 — 공개 경로다 */
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: handle }),
    });

    if (!res.ok) {
      await failRefresh(res);
      return null;
    }

    const text = await res.text();
    const json = unwrap<RefreshResult>(text, '/auth/refresh');
    const data = (json && typeof json === 'object' && 'data' in json ? json.data : null) as
      | RefreshResult
      | null;
    if (!data?.accessToken) {
      throw new ApiError(502, {
        code: 'INVALID_RESPONSE',
        message: '토큰 갱신 응답을 해석할 수 없습니다.',
      });
    }

    setSession({ token: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } finally {
    setLock(null);
  }
}

/**
 * 갱신이 실패했을 때. 어떻게 실패했는지에 따라 다르게 다뤄야 한다.
 *
 *   401  핸들이 못 쓰게 됐다(무효·재사용·SSO 세션 만료) → 저장한 것을 버리고 재로그인
 *   403  권한이 회수됐다 → 재로그인해도 소용없다. 안내만 하고 세션은 건드리지 않는다
 *   502  인증 서버가 잠깐 흔들린다 → 로그아웃시키지 않는다. 잠시 뒤 다시 하면 된다
 *
 * 502 를 401 처럼 다루면 인증 서버가 한 번 삐끗할 때 쓰는 사람 전원이 로그아웃된다.
 */
async function failRefresh(res: Response): Promise<void> {
  let body: ApiErrorBody = { message: `토큰 갱신 실패 (${res.status})` };
  try {
    const json = (await res.json()) as ApiErrorBody;
    if (json?.message) body = json;
  } catch {
    /* 본문이 없거나 JSON 이 아니면 상태 코드로만 가른다 */
  }

  if (res.status === 401) {
    handleUnauthorized();
    return;
  }
  throw new ApiError(res.status, body);
}

/** 요청을 보내기 전에, 만료가 가까우면 먼저 갱신해 둔다 */
async function ensureFreshToken(path: string): Promise<void> {
  if (!renewable(path)) return;
  if (!getToken() || !getRefreshToken()) return;
  const at = getExpiresAt();
  if (at === null || at - Date.now() > RENEW_BEFORE_MS) return;
  await refreshOnce().catch(() => null);
}

/**
 * 갱신을 시도해도 되는 경로인가.
 * 갱신·로그아웃 자체는 갱신으로 되살릴 수 없다 — 부르면 서로를 되부른다.
 * /auth/me 는 보통 요청이라 여기 들어가지 않는다.
 */
const renewable = (path: string): boolean =>
  path !== '/auth/refresh' && path !== '/auth/logout';


/**
 * 202 를 승인 대기로 바꾼다.
 *
 * 봉투는 { status: 202, message, data: { approvalRequestId } } 로 온다.
 * 본문을 못 읽어도 성공으로 흘려보내지 않는다 — 만들어진 것이 없다는 사실은
 * 본문 모양이 아니라 상태 코드가 말해 준다.
 *
 * 이제 202 는 지우는 일에만 온다 — 삭제 전부와 계측기 폐기
 * (PATCH /instrument/{id}/discard). 등록·수정은 하위권한도 곧바로 200 이다
 * (백엔드 회신 2026-09-09). 분기는 그대로 둔다 — 응답 형태가 같고, 어느 경로가
 * 승인을 거치는지는 서버가 정한다. 화면이 짐작해 갈라 두면 규칙이 바뀔 때 틀린다.
 */
function approvalPending(text: string): ApprovalPendingError {
  let message = '승인 요청이 접수되었습니다. 팀장 승인 후 처리됩니다.';
  let approvalRequestId: number | null = null;

  try {
    const json = JSON.parse(text) as BaseResponse<{ approvalRequestId?: number } | null>;
    if (json?.message) message = json.message;
    if (typeof json?.data?.approvalRequestId === 'number') {
      approvalRequestId = json.data.approvalRequestId;
    }
  } catch {
    /* 본문이 비었거나 JSON 이 아니어도 기본 안내로 알린다 */
  }

  return new ApprovalPendingError({ code: 'APPROVAL_PENDING', message }, approvalRequestId);
}

/**
 * 서버 경계. 컴포넌트에서 fetch 를 직접 부르지 않는다.
 * 응답 봉투 {status, message, data} 에서 data 만 벗겨 돌려준다.
 */
export async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  await ensureFreshToken(path);
  let res = await doFetch(method, path, options);

  /* 시계 차이 등으로 미리 갱신을 놓쳤을 때. 한 번만 갱신하고 그 요청을 다시 보낸다 */
  if (res.status === 401 && renewable(path) && getRefreshToken()) {
    const renewed = await refreshOnce().catch(() => null);
    if (renewed) res = await doFetch(method, path, options);
  }

  if (!res.ok) await parseError(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  /* 승인 대기. 아직 만들어진 것이 없으므로 성공 경로로 내보내지 않는다 */
  if (res.status === 202) throw approvalPending(text);
  if (!text) return undefined as T;
  const json = unwrap<T>(text, path);
  // 봉투가 아닌 응답(혹시 모를 예외)은 본문을 그대로 돌려준다
  return json && typeof json === 'object' && 'data' in json ? json.data : (json as T);
}

/**
 * 본문을 JSON 으로 읽는다.
 *
 * 프록시가 빠지면 /api 요청이 SPA fallback 에 걸려 index.html 이 돌아온다.
 * 그대로 JSON.parse 하면 "Unexpected token '<'" 만 떠서 원인을 알 수 없으므로,
 * HTML 이 온 경우를 따로 잡아 설정 문제라고 알려준다.
 */
function unwrap<T>(text: string, path: string): BaseResponse<T> {
  const head = text.trimStart().slice(0, 20).toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    throw new ApiError(502, {
      code: 'PROXY_NOT_CONFIGURED',
      message:
        `${path} 요청에 API 응답 대신 HTML 페이지가 돌아왔습니다. ` +
        `/api 요청이 백엔드로 전달되지 않고 있습니다 — 배포 환경의 프록시 설정을 확인하세요.`,
    });
  }
  try {
    return JSON.parse(text) as BaseResponse<T>;
  } catch {
    throw new ApiError(502, {
      code: 'INVALID_RESPONSE',
      message: `${path} 응답을 해석할 수 없습니다: ${text.slice(0, 80)}`,
    });
  }
}

/** multipart 업로드. Content-Type 은 브라우저가 boundary 와 함께 붙인다 */
export async function requestUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  await ensureFreshToken(path);
  const send = () =>
    fetch(buildUrl(path), { method: 'POST', headers: authHeaders(), body: form });
  let res = await send();
  if (res.status === 401 && renewable(path) && getRefreshToken()) {
    const renewed = await refreshOnce().catch(() => null);
    if (renewed) res = await send();
  }
  if (!res.ok) await parseError(res);

  const text = await res.text();
  if (!text) return undefined as T;
  const json = JSON.parse(text) as BaseResponse<T>;
  return json && typeof json === 'object' && 'data' in json ? json.data : (json as T);
}

export interface DownloadResult {
  blob: Blob;
  filename: string;
}

const FILENAME_UTF8 = /filename\*=UTF-8''([^;]+)/i;
const FILENAME_PLAIN = /filename="?([^";]+)"?/i;

const parseFilename = (disposition: string | null, fallback: string): string => {
  if (!disposition) return fallback;
  const utf8 = FILENAME_UTF8.exec(disposition);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = FILENAME_PLAIN.exec(disposition);
  // 서버가 ASCII 로 떨어뜨린 이름(한글이 _ 로 바뀐 경우)은 쓰지 않는다
  return plain && !/^_+\./.test(plain[1]) ? plain[1] : fallback;
};

/** PDF·Excel·스티커처럼 파일로 내려오는 응답 */
export async function requestFile(
  method: HttpMethod,
  path: string,
  fallbackName: string,
  options: RequestOptions = {},
): Promise<DownloadResult> {
  await ensureFreshToken(path);
  let res = await doFetch(method, path, options);
  if (res.status === 401 && renewable(path) && getRefreshToken()) {
    const renewed = await refreshOnce().catch(() => null);
    if (renewed) res = await doFetch(method, path, options);
  }
  if (!res.ok) await parseError(res);
  return {
    blob: await res.blob(),
    filename: parseFilename(res.headers.get('Content-Disposition'), fallbackName),
  };
}

/** 받은 파일을 브라우저 다운로드로 넘긴다 */

export const saveFile = ({ blob, filename }: DownloadResult): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
