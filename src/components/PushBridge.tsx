import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '@/api/notifications';
import { useMe } from '@/hooks/useMe';
import {
  currentPushToken,
  getSavedPushToken,
  onPushMessage,
  pushPermission,
  routeOfPush,
  showLocalNotification,
  subscribePushToken,
} from '@/lib/push';
import { useToast } from '@/components/toastContext';

/**
 * 브라우저 푸시를 화면에 이어 준다.
 *
 * 1. 이미 알림을 켜 둔 사람은 로그인할 때마다 조용히 다시 등록한다 — 기기 토큰은
 *    브라우저가 바꿀 수 있고, 같은 기기를 다른 계정이 쓰면 소유자가 넘어간다.
 * 2. 탭이 떠 있는 동안 오는 알림은 브라우저가 스스로 띄우지 않아 여기서 띄운다.
 * 3. 탭이 닫혀 있을 때 온 알림을 누르면 서비스워커가 이 창에 알려 준다. 서버 경로를
 *    화면 주소로 바꿔 옮긴다.
 *
 * 알림을 켜고 끄는 것은 알림 화면에서 한다 — 물어보는 것은 사람이 눌렀을 때만이다.
 * 켠 순간을 지켜보다가 곧바로 수신 처리기를 붙인다. 붙여 두고 기다리면, 켜기 전에
 * 붙은 처리기는 허락이 없어 아무것도 안 하고 끝나 그 뒤 알림이 아무 데도 뜨지 않는다.
 */
export default function PushBridge() {
  const navigate = useNavigate();
  const toast = useToast();
  const me = useMe();
  const signedIn = !!me.data;

  /* 알림을 켜고 끄면 곧바로 바뀐다 */
  const savedToken = useSyncExternalStore(subscribePushToken, getSavedPushToken);
  const on = signedIn && pushPermission() === 'granted';

  /* 이미 켜 둔 사람은 로그인할 때마다 조용히 다시 등록한다 */
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void (async () => {
      try {
        const token = await currentPushToken();
        if (alive && token) await notificationsApi.addPushToken(token);
      } catch {
        /* 알림 등록이 안 돼도 화면은 그대로 쓴다. 메일 알림은 따로 간다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [on]);

  /* 탭이 떠 있는 동안 온 알림 */
  useEffect(() => {
    if (!on) return;
    let off: (() => void) | undefined;
    let alive = true;

    void onPushMessage((message) => {
      /* 창 밖에 뜨는 그 알림이 사람이 기다리는 것이다. 못 띄우면 화면 안에서라도 알린다 */
      void showLocalNotification(message).then((shown) => {
        if (!shown) toast.ok(message.body ? `${message.title} — ${message.body}` : message.title);
      });
    }).then((unsubscribe) => {
      if (alive) off = unsubscribe;
      else unsubscribe();
    });

    return () => {
      alive = false;
      off?.();
    };
    /* savedToken 이 바뀌면(켜짐·꺼짐) 다시 붙인다 */
  }, [on, savedToken, toast]);

  /* 알림을 눌러 창이 살아난 경우. 어디로 갈지는 서비스워커가 아니라 여기서 정한다 */
  useEffect(() => {
    const onMessageFromWorker = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; linkUrl?: string; alertType?: string }
        | undefined;
      if (data?.type !== 'jagigo-push-click') return;
      navigate(routeOfPush(data.linkUrl, data.alertType));
    };
    navigator.serviceWorker?.addEventListener('message', onMessageFromWorker);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessageFromWorker);
  }, [navigate]);

  return null;
}
