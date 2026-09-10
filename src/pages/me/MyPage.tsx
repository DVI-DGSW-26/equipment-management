import { useState, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import { useMe, usePerms } from '@/hooks/useMe';
import {
  askPushPermission,
  currentPushToken,
  forgetPushToken,
  getSavedPushToken,
  pushPermission,
  subscribePushToken,
  type PushPermission,
} from '@/lib/push';
import { roleLabels } from '@/lib/permissions';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  Def,
  QueryState,
  Section,
} from '@/components/ui';

/**
 * 마이페이지.
 *
 * 내 계정에 딸린 것만 모은다 — 내가 누구로 들어와 있고 무엇을 할 수 있는지,
 * 이 기기로 알림을 받을지. 알림 화면은 안전검사·교정 수신자 명단을 다루는 자리라
 * 성격이 다르고, 머리줄에 두기에는 설명할 것이 많다(2026-09-10 요청).
 */
export default function MyPage() {
  const me = useMe();
  const { perms } = usePerms();

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">마이페이지</h1>

      <QueryState isPending={me.isPending} error={me.error} />

      {me.data && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section title="내 계정">
            <Def label="이름">{me.data.name}</Def>
            <Def label="아이디">{me.data.username}</Def>
            <Def label="이메일">{me.data.email || '-'}</Def>
            <Def label="권한">
              <span className="flex flex-wrap items-center gap-1">
                {roleLabels(me.data.roles).map((label) => (
                  <Badge key={label}>{label}</Badge>
                ))}
                {roleLabels(me.data.roles).length === 0 && '-'}
                {perms.readOnly && <Badge tone="muted">조회 전용</Badge>}
              </span>
            </Def>
            <Def label="할 수 있는 일">
              {perms.readOnly
                ? '보기만 됩니다. 등록·수정·삭제는 담당자 계정으로 해야 합니다.'
                : perms.admin
                  ? '등록·수정은 바로 반영되고, 남이 올린 삭제·폐기를 승인합니다.'
                  : '등록·수정은 바로 반영됩니다. 삭제·폐기는 팀장 승인을 거칩니다.'}
            </Def>
          </Section>

          <BrowserPush />
        </div>
      )}
    </div>
  );
}

/**
 * 이 브라우저로 알림 받기.
 *
 * 켜고 끄는 것은 기기마다 따로다 — 사무실 PC 에서 켜도 노트북에는 켜지지 않는다.
 * 허락은 사람이 단추를 눌렀을 때만 묻는다. 화면에 들어오자마자 물으면 무슨 알림인지
 * 모르는 채로 거절하게 되고, 한 번 거절하면 브라우저 설정에서 직접 풀어야 한다.
 * 아이폰은 아예 사람 동작 없이 묻지 못한다.
 */
function BrowserPush() {
  const toast = useToast();
  const [permission, setPermission] = useState<PushPermission>(pushPermission);
  const on = useSyncExternalStore(subscribePushToken, getSavedPushToken) !== null;

  const turnOn = useMutation({
    mutationFn: async () => {
      const token = await askPushPermission();
      if (!token) return false;
      await notificationsApi.addPushToken(token);
      /* 켠 자리에서 한 통 보내 본다 — 켜졌는지는 알림이 와 봐야 안다 */
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

  const test = useMutation({
    mutationFn: () => notificationsApi.sendPushTest(),
    onSuccess: () => toast.ok('한 통 보냈습니다. 잠시 뒤 알림이 뜹니다.'),
    /* 등록된 기기가 없으면 400 이다. 켜진 것처럼 보이는데 서버에는 없는 상태로 두지 않는다 */
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
        on ? (
          <>
            <Badge tone="accent">켜짐</Badge>
            <button type="button" className={btnClass} disabled={busy} onClick={() => test.mutate()}>
              {test.isPending ? '보내는 중…' : '테스트'}
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
          permission === 'default' && (
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
      <div className="space-y-1 px-3 py-3 text-[18px] text-fg-sub">
        {permission === 'unsupported' && (
          <p>
            이 브라우저에서는 알림을 받을 수 없습니다. 아이폰·아이패드는{' '}
            <b>사파리에서 홈 화면에 추가</b>한 뒤 그 아이콘으로 열면 받을 수 있습니다.
          </p>
        )}
        {permission === 'denied' && (
          <p>
            이 브라우저에서 알림을 차단해 두었습니다. 주소창 왼쪽 자물쇠(또는 ⓘ)를 눌러 알림을
            허용으로 바꾼 뒤 이 화면을 새로고침해 주세요.
          </p>
        )}
        {permission !== 'unsupported' && permission !== 'denied' && (
          <>
            <p>메일과 별개로 아래 세 가지가 이 브라우저 알림으로도 뜹니다.</p>
            <ul className="ml-1 space-y-0.5 text-[17px]">
              <li>· 계측기 차기 교정일이 다가올 때</li>
              <li>· 안전검사 유효기간이 끝나갈 때</li>
              <li>· 자산·계측기를 누가 등록하거나 고쳤을 때 (팀장 계정)</li>
            </ul>
          </>
        )}
        <p className="text-[17px] text-fg-muted">
          기기마다 따로 켭니다. 공용 PC 라면 로그아웃할 때 이 기기 알림도 함께 꺼집니다.
        </p>
      </div>
    </Section>
  );
}
