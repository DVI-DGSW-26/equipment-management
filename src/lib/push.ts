import type { FirebaseApp } from 'firebase/app';
import type { Messaging } from 'firebase/messaging';

/**
 * 브라우저 푸시 알림(FCM).
 *
 * 메일과 별개로 교정·안전검사·자산 변경 알림이 브라우저에도 뜬다. 서버가 기기 토큰을
 * 들고 있다가 보내는 구조라, 화면이 할 일은 허락을 받아 토큰을 넘기고 로그아웃할 때
 * 거둬들이는 것뿐이다 (백엔드 회신 2026-09-10).
 *
 * ## 설정값을 코드에 둔 이유
 *
 * Firebase 웹 설정은 감출 수 있는 값이 아니다 — 어차피 브라우저 번들에 실려 나간다.
 * .env 에 두면 배포처(Vercel)에도 같은 값을 넣어 두어야 하고, 빠뜨리면 아무 말 없이
 * 알림만 안 온다. 그래서 기본값을 여기 두고, 필요하면 환경변수로 덮어쓴다.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCxGC7jJ8aQVuU1UukaD2pQ9FJzpobqBiY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'qacflow-37ace.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'qacflow-37ace',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'qacflow-37ace.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '218621654106',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:218621654106:web:36ea843a658a9d90841463',
};

const VAPID_KEY =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BHyPWQhIJiSmXEwBcCedbMU3Y_VE2w3YTez0VlTX9Olu-uA1lSP58SvJMNMuKtno5VzRd-p24vosl45shJMCAFg';

/**
 * 서비스워커 등록 주소.
 *
 * 워커는 번들 밖 파일이라 설정을 읽지 못한다. 주소 뒤에 붙여 넘긴다.
 * 값이 바뀌면 주소도 바뀌어 브라우저가 새 워커로 갈아 끼운다.
 */
const SW_URL = `/firebase-messaging-sw.js?${new URLSearchParams({
  apiKey: config.apiKey,
  projectId: config.projectId,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
}).toString()}`;

/** 마지막으로 서버에 넘긴 토큰. 로그아웃할 때 이 값을 지워 달라고 보낸다 */
const TOKEN_KEY = 'jagigo.pushToken';

export const getSavedPushToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const savePushToken = (token: string | null): void => {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 저장소가 막혀 있어도 이번 세션의 알림은 받는다 */
  }
};

/**
 * 이 브라우저가 푸시를 받을 수 있는가.
 *
 * iOS 사파리는 홈 화면에 추가한 PWA 에서만 된다. 일반 탭에는 Notification 자체가
 * 없으므로, 없는 것을 보고 "이 브라우저로는 못 받는다" 고 알린다.
 */
export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export const pushPermission = (): PushPermission =>
  pushSupported() ? Notification.permission : 'unsupported';

type FcmModule = typeof import('firebase/messaging');

let app: FirebaseApp | null = null;
let loaded: { messaging: Messaging; fcm: FcmModule } | null = null;

/**
 * Firebase SDK 는 알림을 실제로 쓸 때 받아 온다.
 *
 * 위에서 그냥 import 하면 알림을 켜지 않은 사람의 첫 화면에도 실려 나간다.
 * 여기서 부르면 따로 묶여 알림을 켠 사람만 내려받는다.
 */
async function load(): Promise<{ messaging: Messaging; fcm: FcmModule } | null> {
  if (loaded) return loaded;
  if (!pushSupported()) return null;
  const [{ initializeApp }, fcm] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await fcm.isSupported())) return null;
  app = app ?? initializeApp(config);
  loaded = { messaging: fcm.getMessaging(app), fcm };
  return loaded;
}

/**
 * 이 기기의 알림 토큰을 받아 온다.
 *
 * 허락을 아직 안 받았으면 null 이다 — 물어보는 것은 사람이 단추를 눌렀을 때만 한다
 * (iOS 는 사람 동작 없이는 물어볼 수조차 없다).
 */
export async function currentPushToken(): Promise<string | null> {
  if (pushPermission() !== 'granted') return null;
  const ready = await load();
  if (!ready) return null;

  const registration = await navigator.serviceWorker.register(SW_URL);
  const token = await ready.fcm.getToken(ready.messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  savePushToken(token || null);
  return token || null;
}

/**
 * 알림 켜기. 사람이 단추를 눌렀을 때만 부른다.
 * 허락을 받으면 토큰을, 거절하면 null 을 돌려준다.
 */
export async function askPushPermission(): Promise<string | null> {
  if (!pushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  return currentPushToken();
}

/** 서버에서 지웠으면 이쪽 기억도 지운다 */
export const forgetPushToken = (): void => savePushToken(null);

/** 탭이 떠 있는 동안 오는 알림. 브라우저가 스스로 띄우지 않아 화면이 직접 보여 준다 */
export async function onPushMessage(
  handler: (message: { title: string; body: string; linkUrl?: string; type?: string }) => void,
): Promise<() => void> {
  const ready = await load();
  if (!ready) return () => undefined;
  return ready.fcm.onMessage(ready.messaging, (payload) => {
    handler({
      title: payload.notification?.title ?? '알림',
      body: payload.notification?.body ?? '',
      linkUrl: payload.data?.linkUrl,
      type: payload.data?.type,
    });
  });
}

/**
 * 알림을 눌렀을 때 갈 화면.
 *
 * linkUrl 은 화면 주소가 아니라 서버 API 경로(/asset/12)라 그대로 열면 없는 주소다.
 * 앞부분을 보고 우리 화면으로 옮긴다 (백엔드 회신 2026-09-10).
 * 실물자산·안전검사는 한 건만 여는 화면이 없어 목록으로 보낸다.
 */
export function routeOfPush(linkUrl?: string, type?: string): string {
  const path = (linkUrl ?? '').split('?')[0];
  const id = path.match(/\/(\d+)(?:\/|$)/)?.[1];

  if (path.startsWith('/asset/') && id) return `/assets/${id}`;
  if (path.startsWith('/instrument/') && id) return `/instruments/${id}`;
  if (path.startsWith('/physical-asset')) return '/physical-assets';
  if (path.startsWith('/safety-equipment')) return '/inspections';

  if (type === 'CALIBRATION') return '/instruments';
  if (type === 'SAFETY') return '/inspections';
  return '/notifications';
}
