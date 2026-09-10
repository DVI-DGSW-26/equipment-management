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
import { Badge, btnClass, btnPrimaryClass, Section } from '@/components/ui';

/**
 * 이 브라우저로 알림 받기.
 *
 * 메일과 별개로 교정·안전검사·자산 변경 알림이 브라우저 알림으로도 뜬다.
 * 켜고 끄는 것은 기기마다 따로다 — 사무실 PC 에서 켜도 집 PC 에는 켜지지 않는다.
 *
 * 허락을 묻는 것은 사람이 단추를 눌렀을 때만 한다. 화면에 들어오자마자 물으면
 * 무슨 알림인지 모르는 채로 거절하게 되고, 한 번 거절하면 브라우저 설정에서
 * 직접 풀기 전에는 다시 물을 수 없다. iOS 는 아예 사람 동작 없이 물을 수 없다.
 */
export default function BrowserPushSection() {
  const toast = useToast();
  /* 브라우저에 물어보는 값이라 첫 렌더에서 한 번만 읽는다 */
  const [permission, setPermission] = useState<PushPermission>(pushPermission);
  /* 켜고 끄는 것은 이 화면 밖(PushBridge)에서도 본다 — 한 곳을 같이 본다 */
  const registered = useSyncExternalStore(subscribePushToken, getSavedPushToken) !== null;

  const turnOn = useMutation({
    mutationFn: async () => {
      const token = await askPushPermission();
      if (!token) return null;
      await notificationsApi.addPushToken(token);
      return token;
    },
    onSuccess: (token) => {
      setPermission(pushPermission());
      if (token) toast.ok('이 브라우저로 알림을 받습니다. [테스트 알림] 으로 확인해 보세요.');
      else toast.ok('알림을 허용하지 않아 켜지 않았습니다.');
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

  const test = useMutation({
    mutationFn: () => notificationsApi.sendPushTest(),
    onSuccess: () => toast.ok('한 통 보냈습니다. 잠시 뒤 알림이 뜹니다.'),
    /* 등록된 기기가 없으면 400 이다 — 그때는 다시 켜라고 알린다 */
    onError: (e) => {
      forgetPushToken();
      toast.fail(e);
    },
  });

  const busy = turnOn.isPending || turnOff.isPending || test.isPending;

  return (
    <Section
      title="이 브라우저로 알림 받기"
      right={
        registered ? (
          <>
            <Badge tone="accent">켜짐</Badge>
            <button
              type="button"
              className={btnClass}
              disabled={busy}
              onClick={() => test.mutate()}
            >
              {test.isPending ? '보내는 중…' : '테스트 알림'}
            </button>
            <button
              type="button"
              className={btnClass}
              disabled={busy}
              onClick={() => turnOff.mutate()}
            >
              끄기
            </button>
          </>
        ) : (
          permission !== 'unsupported' &&
          permission !== 'denied' && (
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={busy}
              onClick={() => turnOn.mutate()}
            >
              {turnOn.isPending ? '켜는 중…' : '알림 켜기'}
            </button>
          )
        )
      }
    >
      <div className="px-3 py-3 text-[18px] text-fg-sub">
        {permission === 'unsupported' && (
          <p>
            이 브라우저에서는 알림을 받을 수 없습니다. 아이폰·아이패드는{' '}
            <b>사파리에서 홈 화면에 추가</b>한 뒤 그 아이콘으로 열면 받을 수 있습니다.
          </p>
        )}
        {permission === 'denied' && (
          <p>
            이 브라우저에서 알림을 차단해 두었습니다. 주소창 왼쪽 자물쇠(또는 ⓘ)를 눌러 알림을
            허용으로 바꾼 뒤 다시 켜 주세요.
          </p>
        )}
        {permission !== 'unsupported' && permission !== 'denied' && (
          <p>
            교정·안전검사 기한과 자산 등록·수정 알림이 이 브라우저에도 뜹니다. 메일은 그대로
            갑니다. {registered ? '' : '켜면 브라우저가 한 번 허락을 묻습니다.'}
          </p>
        )}
        <p className="mt-1 text-[17px] text-fg-muted">
          기기마다 따로 켭니다. 공용 PC 에서는 로그아웃할 때 이 기기 알림도 함께 꺼집니다.
        </p>
      </div>
    </Section>
  );
}
