import { useState, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import {
  askPushPermission,
  currentPushToken,
  forgetPushToken,
  getSavedPushToken,
  pushPermission,
  subscribePushToken,
  type PushPermission,
} from '@/lib/push';
import { useToast } from '@/components/toastContext';

/**
 * 머리줄의 알림 켜기/끄기.
 *
 * 알림 화면은 안전검사·교정 수신자 명단을 다루는 자리라, 브라우저 알림 설정을 거기
 * 두면 성격이 다른 것이 섞인다(2026-09-10 요청). 기기마다 켜는 것이고 어느 화면에서든
 * 켤 수 있어야 해서 머리줄에 둔다.
 *
 * 브라우저는 사람이 누른 자리에서만 허락을 묻는다 — 로그인했다고 자동으로 켤 수는 없다.
 * 대신 한 번 누르면 등록까지 끝나고, 잘 되는지 확인할 알림이 한 통 온다.
 */
export default function PushToggle() {
  const toast = useToast();
  const [permission, setPermission] = useState<PushPermission>(pushPermission);
  const on = useSyncExternalStore(subscribePushToken, getSavedPushToken) !== null;

  const turnOn = useMutation({
    mutationFn: async () => {
      const token = await askPushPermission();
      if (!token) return false;
      await notificationsApi.addPushToken(token);
      /* 켠 자리에서 한 통 보내 본다 — 켰는지 안 켰는지는 알림이 와 봐야 안다 */
      await notificationsApi.sendPushTest().catch(() => undefined);
      return true;
    },
    onSuccess: (done) => {
      setPermission(pushPermission());
      toast.ok(
        done
          ? '이 브라우저로 알림을 받습니다. 확인 알림이 한 통 갑니다.'
          : '알림을 허용하지 않아 켜지 않았습니다.',
      );
    },
    onError: toast.fail,
  });

  const turnOff = useMutation({
    mutationFn: async () => {
      const token = getSavedPushToken() ?? (await currentPushToken());
      if (token) await notificationsApi.removePushToken(token);
    },
    onSuccess: () => {
      forgetPushToken();
      toast.ok('이 브라우저로는 알림을 보내지 않습니다.');
    },
    onError: toast.fail,
  });

  /* 이 브라우저가 못 받으면 단추를 내지 않는다 — 눌러도 아무 일이 없다 */
  if (permission === 'unsupported') return null;

  if (permission === 'denied') {
    return (
      <span
        className="whitespace-nowrap text-fg-muted"
        title="주소창 왼쪽 자물쇠(또는 ⓘ)를 눌러 알림을 허용으로 바꾼 뒤 다시 켜 주세요."
      >
        알림 차단됨
      </span>
    );
  }

  const busy = turnOn.isPending || turnOff.isPending;

  return (
    <button
      type="button"
      className="whitespace-nowrap text-accent hover:underline disabled:text-fg-muted"
      disabled={busy}
      title={
        on
          ? '교정·안전검사 기한과 자산 등록·수정 알림을 이 브라우저로 받고 있습니다. 눌러서 끕니다.'
          : '교정·안전검사 기한과 자산 등록·수정 알림을 이 브라우저로도 받습니다. 기기마다 따로 켭니다.'
      }
      onClick={() => (on ? turnOff.mutate() : turnOn.mutate())}
    >
      {busy ? '…' : on ? '알림 끄기' : '알림 켜기'}
    </button>
  );
}
