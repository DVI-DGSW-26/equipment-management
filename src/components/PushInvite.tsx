import { useState, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import {
  askPushPermission,
  getSavedPushToken,
  pushPermission,
  subscribePushToken,
} from '@/lib/push';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass } from '@/components/ui';

/**
 * 로그인하고 처음 들어왔을 때 한 번 권하는 줄.
 *
 * 브라우저는 사람이 누른 자리에서만 알림 허락을 묻는다 — 로그인만으로 켤 수는 없다.
 * 그래서 켜는 자리를 눈앞에 한 번 내민다. 여기서 [켜기] 를 누르는 것이 그 "사람이
 * 누른 자리" 가 되어, 아이폰에서도 물어볼 수 있다.
 *
 * 한 번 닫으면 다시 내밀지 않는다. 나중에 켜려면 머리줄의 [알림 켜기] 를 쓴다 —
 * 같은 것을 화면마다 다시 권하면 그것이 곧 광고가 된다.
 */
const DISMISSED_KEY = 'jagigo.pushInviteClosed';

const dismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
};

export default function PushInvite() {
  const toast = useToast();
  const [closed, setClosed] = useState(dismissed);
  const registered = useSyncExternalStore(subscribePushToken, getSavedPushToken) !== null;

  const close = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* 저장이 안 되면 이번 방문 동안만 닫힌다 */
    }
    setClosed(true);
  };

  const turnOn = useMutation({
    mutationFn: async () => {
      const token = await askPushPermission();
      if (!token) return false;
      await notificationsApi.addPushToken(token);
      await notificationsApi.sendPushTest().catch(() => undefined);
      return true;
    },
    onSuccess: (done) => {
      close();
      toast.ok(
        done
          ? '이 브라우저로 알림을 받습니다. 확인 알림이 한 통 갑니다.'
          : '알림을 허용하지 않아 켜지 않았습니다. 나중에 머리줄에서 켤 수 있습니다.',
      );
    },
    onError: (e) => {
      close();
      toast.fail(e);
    },
  });

  /* 이미 켰거나, 못 받는 브라우저이거나, 한 번 닫았으면 내밀지 않는다 */
  if (closed || registered || pushPermission() !== 'default') return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg px-3 py-2 sm:px-8">
      <span className="text-[18px] text-fg-sub">
        교정·안전검사 기한과 자산 등록·수정 알림을 <b>이 브라우저로도</b> 받을 수 있습니다.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className={btnPrimaryClass}
          disabled={turnOn.isPending}
          onClick={() => turnOn.mutate()}
        >
          {turnOn.isPending ? '켜는 중…' : '알림 켜기'}
        </button>
        <button type="button" className={btnClass} onClick={close}>
          나중에
        </button>
      </div>
    </div>
  );
}
