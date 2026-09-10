import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '@/api/notifications';
import { useMe } from '@/hooks/useMe';
import { currentPushToken, onPushMessage, pushPermission, routeOfPush } from '@/lib/push';
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
 */
export default function PushBridge() {
  const navigate = useNavigate();
  const toast = useToast();
  const me = useMe();
  const signedIn = !!me.data;

  /* 이미 켜 둔 사람은 로그인할 때마다 조용히 다시 등록한다 */
  useEffect(() => {
    if (!signedIn || pushPermission() !== 'granted') return;
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
  }, [signedIn]);

  /* 탭이 떠 있는 동안 온 알림 */
  useEffect(() => {
    if (!signedIn || pushPermission() !== 'granted') return;
    let off: (() => void) | undefined;
    let alive = true;
    void onPushMessage(({ title, body }) => {
      toast.ok(body ? `${title} — ${body}` : title);
    }).then((unsubscribe) => {
      if (alive) off = unsubscribe;
      else unsubscribe();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [signedIn, toast]);

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
