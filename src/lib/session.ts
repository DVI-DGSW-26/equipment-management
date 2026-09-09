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
/**
 * 갱신 핸들. 앱 토큰이 만료되면 이것으로 새 토큰을 받는다 (백엔드 회신 2026-09-09).
 *
 * Keycloak 의 진짜 refresh 토큰은 서버가 들고 있고 이것은 그것을 가리키는 값이라,
 * 이 값만으로 인증 서버를 직접 부를 수는 없다.
 *
 * localStorage 에 둔다 — 탭마다 따로 두면 한 탭이 갱신한 뒤 다른 탭이 낡은 핸들을
 * 보내고, 서버는 그것을 탈취로 보아 로그인을 통째로 끊는다(1회용).
 */
const REFRESH_KEY = 'jagigo.refresh';
/** 앱 토큰이 만료되는 시각(ms). 미리 갱신할 때가 됐는지 보는 데 쓴다 */
const EXPIRES_KEY = 'jagigo.expiresAt';
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

export const getRefreshToken = (): string | null => read(localStorage, REFRESH_KEY);

/**
 * 앱 토큰이 언제까지 쓸 수 있는지.
 *
 * 토큰 안(JWT exp)에 적혀 있으니 그것을 읽는다 — 로그인 콜백은 남은 시간을 따로
 * 주지 않고, 갱신 응답의 expiresIn 만 믿으면 첫 로그인 뒤 만료를 알 수 없다.
 * 못 읽으면 null 이고, 그때는 미리 갱신하지 않고 401 을 받은 뒤에 갱신한다.
 */
const expiryOf = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

export const getExpiresAt = (): number | null => {
  const raw = read(localStorage, EXPIRES_KEY);
  const at = Number(raw);
  return raw && Number.isFinite(at) ? at : null;
};

/**
 * 로그인·갱신으로 받은 것을 한 번에 갈아 끼운다.
 *
 * 토큰과 핸들을 따로 저장하면 그 사이에 다른 탭이 낡은 짝을 집어 갈 수 있다.
 */
export function setSession(next: { token: string; refreshToken?: string | null }): void {
  if (next.refreshToken !== undefined) write(localStorage, REFRESH_KEY, next.refreshToken);
  const at = expiryOf(next.token);
  write(localStorage, EXPIRES_KEY, at === null ? null : String(at));
  setToken(next.token);
}

/** 로그인 자체가 끝났을 때. 토큰·핸들·만료를 모두 버린다 */
export function clearSession(): void {
  write(localStorage, REFRESH_KEY, null);
  write(localStorage, EXPIRES_KEY, null);
  setToken(null);
}

/** useSyncExternalStore 용. 토큰이 바뀌면 화면이 따라 바뀐다 */
export function subscribeToken(notify: Listener): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/*
 * 다른 탭이 갱신하거나 로그아웃하면 이 탭도 따라간다.
 * 낡은 토큰을 들고 있다가 401 을 받고, 그 김에 이미 쓴 핸들을 보내는 것을 막는다.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== TOKEN_KEY) return;
    memoryToken = e.newValue;
    listeners.forEach((notify) => notify());
  });
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
  clearSession();
  /* 개발 중에는 보내지 않는다. 콜백이 운영 도메인이라 작업하던 localhost 를 떠나게 된다 */
  if (!isLoginRequired) return;
  if (!hadToken || !shouldAutoLogin()) return;
  startLogin();
}

export function logout(): void {
  clearSession();
  write(sessionStorage, RETRY_KEY, null);
  write(sessionStorage, RETURN_KEY, null);
  write(sessionStorage, MANUAL_LOGOUT_KEY, '1');
}
