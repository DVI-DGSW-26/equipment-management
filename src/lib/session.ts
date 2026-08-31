/**
 * 로그인 세션(브라우저 쪽).
 *
 * DVI 통합 로그인(Keycloak)은 브라우저를 백엔드로 통째로 보내고, 백엔드가
 * 콜백 주소의 fragment 에 토큰을 실어 돌려준다. 여기서는 그 토큰을 보관하고,
 * 로그인 시작·만료 처리만 맡는다. 서버 호출은 api/auth.ts 가 한다.
 *
 * 이 파일은 api/client.ts 가 가져다 쓰므로 client 를 되부르지 않는다(순환 방지).
 */

/**
 * 로그인을 요구할지.
 *
 * 콜백 주소가 운영 도메인(honey-go.vercel.app) 고정이라 localhost 는 토큰을 받을 길이 없다.
 * 그래서 개발 중에는 로그인 화면을 세우지 않는다. 서버는 이미 인증을 요구하므로,
 * 로컬에서 자료까지 보려면 .env 의 VITE_DEV_TOKEN 에 운영에서 받은 토큰을 넣는다.
 * 로그인 화면 자체를 확인하려면 .env 에 VITE_FORCE_LOGIN=true 를 넣는다.
 */
export const isLoginRequired =
  import.meta.env.PROD || import.meta.env.VITE_FORCE_LOGIN === 'true';

/** 로그인 시작. XHR 이 아니라 브라우저를 통째로 옮겨야 한다 */
export const LOGIN_URL = 'https://api.dvi-ind.com/jagigo/oauth2/authorization/keycloak';

const TOKEN_KEY = 'jagigo.token';
/** 되풀이 로그인 방지용 표시. 탭을 닫으면 사라진다 */
const RETRY_KEY = 'jagigo.loginAt';
/** 스스로 로그아웃한 표시. 이게 있으면 자동으로 다시 로그인시키지 않는다 */
const MANUAL_LOGOUT_KEY = 'jagigo.loggedOut';
/** 로그인 전에 보고 있던 화면. 만료로 튕겼을 때 제자리로 돌려보낸다 */
const RETURN_KEY = 'jagigo.returnTo';
/** 이 시간 안에 또 401 이면 다시 보내지 않고 로그인 화면을 보여준다 */
const RETRY_GAP_MS = 30_000;

/* 사생활 보호 모드처럼 저장소가 막힌 브라우저에서도 화면은 떠야 한다 */
const read = (store: Storage, key: string): string | null => {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
};
const write = (store: Storage, key: string, value: string | null): void => {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    /* 저장하지 못해도 이번 세션은 메모리 값으로 돈다 */
  }
};

/** 저장소가 막혔을 때의 대비책. 새로고침하면 사라진다 */
let memoryToken: string | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * 운영에서 로그인해 받은 토큰을 개발 PC 로 가져와 쓰고 싶을 때만 쓴다.
 * .env 의 VITE_DEV_TOKEN 에 붙여 넣는다. 개발 빌드에서만 읽는다.
 */
const devToken = import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? '').trim() : '';

export const getToken = (): string | null =>
  read(localStorage, TOKEN_KEY) ?? memoryToken ?? (devToken || null);

export function setToken(token: string | null): void {
  memoryToken = token;
  write(localStorage, TOKEN_KEY, token);
  listeners.forEach((notify) => notify());
}

/** useSyncExternalStore 용. 토큰이 바뀌면 화면이 따라 바뀐다 */
export function subscribeToken(notify: Listener): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function startLogin(): void {
  write(sessionStorage, MANUAL_LOGOUT_KEY, null);
  write(sessionStorage, RETRY_KEY, String(Date.now()));
  const here = window.location.pathname + window.location.search;
  if (!here.startsWith('/auth/callback')) write(sessionStorage, RETURN_KEY, here);
  window.location.assign(LOGIN_URL);
}

/** 로그인 전에 보던 화면. 한 번 쓰면 지운다 */
export function takeReturnTo(): string {
  const path = read(sessionStorage, RETURN_KEY);
  write(sessionStorage, RETURN_KEY, null);
  return path && path.startsWith('/') ? path : '/';
}

/**
 * 바로 로그인으로 보내도 되는가.
 *
 * 스스로 로그아웃했으면 보내지 않는다 — SSO 세션이 살아 있어서 곧바로 다시 들어와 버린다.
 * 방금 다녀왔는데 또 로그인이 필요해도(권한 없는 계정 등) 무한 왕복이 되니 보내지 않는다.
 * 개발 중에도 보내지 않는다 — 통합 로그인은 운영 도메인으로 돌아가 버려서,
 * 로컬에서는 로그인 화면 자체를 볼 수가 없게 된다.
 * 세 경우 모두 로그인 화면에서 사람이 누를 때까지 세운다.
 */
export const shouldAutoLogin = (): boolean =>
  import.meta.env.PROD &&
  read(sessionStorage, MANUAL_LOGOUT_KEY) === null &&
  Date.now() - Number(read(sessionStorage, RETRY_KEY) ?? 0) >= RETRY_GAP_MS;

/**
 * 401 처리. 토큰 수명이 30분이라 만료는 일상이다.
 * SSO 세션이 살아 있으면 로그인 화면 없이 새 토큰을 들고 돌아오므로 그냥 다시 보낸다.
 * 방금 다녀왔는데 또 401 이면(권한 없음 등) 되풀이가 되니 로그인 화면에서 멈춘다.
 */
export function handleUnauthorized(): void {
  const hadToken = getToken() !== null;
  setToken(null);
  /* 개발 중에는 보내지 않는다. 콜백이 운영 도메인이라 작업하던 localhost 를 떠나게 된다 */
  if (!isLoginRequired) return;
  if (!hadToken || !shouldAutoLogin()) return;
  startLogin();
}

export function logout(): void {
  setToken(null);
  write(sessionStorage, RETRY_KEY, null);
  write(sessionStorage, RETURN_KEY, null);
  write(sessionStorage, MANUAL_LOGOUT_KEY, '1');
}
