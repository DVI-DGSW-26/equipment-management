/*
 * FCM 웹 푸시 서비스워커. 파일 이름과 자리가 고정이다 — 사이트 루트에서 그대로 나가야 한다.
 *
 * 탭이 닫혀 있거나 다른 화면을 보고 있을 때 오는 알림을 여기서 받는다.
 * 탭이 떠 있는 동안 오는 것은 페이지 쪽(lib/push.ts 의 onMessage)이 맡는다 —
 * 그때는 브라우저가 스스로 띄우지 않는다.
 *
 * 서비스워커는 번들 밖 파일이라 import.meta.env 를 읽지 못한다.
 * Firebase 설정은 등록할 때 주소 뒤에 붙여 보내고 여기서 꺼내 쓴다.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

/* 백그라운드 알림은 FCM 이 payload 의 notification(title/body)으로 알아서 띄운다.
   이 호출은 SDK 가 그 처리기를 붙이게 하는 용도다 */
firebase.messaging();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/*
 * 알림을 누르면 그 화면으로 옮긴다.
 *
 * 어디로 보낼지는 서버 경로(/asset/12)를 화면 주소(/assets/12)로 바꾸는 규칙이라
 * 앱 안에 있고 여기서는 부를 수 없다. 그래서
 *   열려 있는 창이 있으면  그 창에 넘겨 앱이 규칙대로 옮긴다
 *   창이 하나도 없으면     알림 화면으로 연다 — 서버 경로를 그대로 열면 없는 주소다
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data?.FCM_MSG?.data || event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'jagigo-push-click',
            linkUrl: data.linkUrl,
            alertType: data.type,
          });
          return client.focus();
        }
      }
      return self.clients.openWindow('/notifications');
    }),
  );
});
