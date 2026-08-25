import { ApiError, type ApiErrorBody, type BaseResponse } from './types';

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
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const buildUrl = (path: string, query?: QueryParams): string => {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries((query ?? {}) as Record<string, unknown>).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)));
    else url.searchParams.set(k, String(v));
  });
  return url.toString();
};

const parseError = async (res: Response): Promise<never> => {
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
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

/**
 * 서버 경계. 컴포넌트에서 fetch 를 직접 부르지 않는다.
 * 응답 봉투 {status, message, data} 에서 data 만 벗겨 돌려준다.
 */
export async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const res = await doFetch(method, path, options);
  if (!res.ok) await parseError(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
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
  const res = await fetch(buildUrl(path), { method: 'POST', body: form });
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
  const res = await doFetch(method, path, options);
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
