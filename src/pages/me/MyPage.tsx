import { useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { notificationsApi } from '@/api/notifications';
import { queryKeys } from '@/api/queryKeys';
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
import { personName } from '@/lib/koreanName';
import { roleLabels } from '@/lib/permissions';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, QueryState } from '@/components/ui';
import { UnsubscribeModal } from '@/pages/notifications/AlertTab';
import HelpLink from '@/components/HelpLink';

/**
 * 마이페이지.
 *
 * 내 계정에 딸린 것만 모은다 — 내가 누구로 들어와 있고 무엇을 할 수 있는지,
 * 이 컴퓨터로 알림을 받을지, 등록·수정 알림과 메일 알림을 받을지.
 *
 * 다른 화면은 표를 빽빽하게 채우는 자리지만 여기는 한 사람의 자리다. 로고의 벌을
 * 크게 세우고 벌집(육각형)을 테두리로 쓴다. 꿀색과 육각형은 이 화면에만 둔다 —
 * 표·단추에까지 번지면 경고색(골드)과 헷갈리고, 아무 데나 있는 장식이 된다
 * (2026-09-10 요청).
 */
export default function MyPage() {
  const me = useMe();
  const { perms } = usePerms();

  /** 벌이 건네는 말. 롤 이름만으로는 무엇을 할 수 있는지 알 수 없다 */
  const canDo = perms.readOnly
    ? '보기만 되는 계정이에요. 등록이나 수정이 필요하면 관리팀에 말씀해 주세요.'
    : [
        perms.asset && !perms.instrument
          ? '자산 쪽 등록·수정은 바로 반영돼요. 계측기는 보기만 됩니다.'
          : perms.instrument && !perms.asset
            ? '계측기 등록·수정은 바로 반영돼요. 자산 쪽은 보기만 됩니다.'
            : '등록·수정은 바로 반영돼요.',
        perms.admin
          ? '삭제·폐기도 바로 되고, 팀에서 올린 승인 요청은 직접 처리해 주셔야 합니다.'
          : '삭제·폐기만 팀장님 승인을 거칩니다.',
      ].join(' ');

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <h1 className="text-[24px] font-semibold">마이페이지 <HelpLink topic="me" /></h1>

      <QueryState isPending={me.isPending} error={me.error} />

      {me.data && (
        <>
          <section className="rounded-sm border border-line bg-surface px-5 py-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              {/*
                벌집에 앉은 벌. 이 화면에서 제일 먼저 보이는 것.
                육각형은 뒤에 깔고 벌은 그 위에 얹는다 — 벌을 육각형으로 오려내면
                더듬이와 날개가 잘린다.
              */}
              <div className="relative h-36 w-36 shrink-0">
                <span aria-hidden className="hex absolute inset-0 bg-honey-soft" />
                <img
                  src="/favicon.svg"
                  alt=""
                  width={96}
                  height={96}
                  className="absolute inset-0 m-auto h-24 w-24 object-contain"
                />
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-[30px] leading-tight font-bold">{personName(me.data.name)}</p>

                <p className="mt-1 text-[18px] text-fg-muted">
                  {me.data.username}
                  {me.data.email && <span className="ml-2">{me.data.email}</span>}
                </p>

                <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {roleLabels(me.data.roles).map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-honey bg-honey-soft px-3 py-0.5 text-[17px]"
                    >
                      {label}
                    </span>
                  ))}
                  {perms.readOnly && (
                    <span className="rounded-full border border-line bg-bg px-3 py-0.5 text-[17px] text-fg-sub">
                      조회 전용
                    </span>
                  )}
                </div>

                {/* 벌이 건네는 말 — 왼쪽 꼬리가 벌을 가리킨다 */}
                <div className="relative mt-4 rounded-sm border border-line bg-bg px-4 py-3 text-[18px] text-fg-sub">
                  <span
                    aria-hidden
                    className="absolute top-4 -left-[7px] hidden h-3 w-3 rotate-45 border-b border-l border-line bg-bg sm:block"
                  />
                  {canDo}
                </div>

                <p className="mt-3 text-[17px]">
                  <Link to="/approvals" className="text-accent hover:underline">
                    내가 올린 승인 요청 보기
                  </Link>
                </p>
              </div>
            </div>
          </section>

          <BrowserPush />
          <ChangeAlerts />
          <MailAlerts email={me.data.email} />
        </>
      )}
    </div>
  );
}

/**
 * 알림 종. 아이콘 묶음을 따로 두지 않는 프로젝트라 쓰는 자리에 그려 둔다.
 * 꺼져 있으면 사선을 그어 종이 울지 않는다는 것을 모양으로 보인다.
 */
function BellIcon({ muted }: { muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
      aria-hidden
    >
      <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4.2 1.6 5.3 2 6.2H4.5c.4-.9 2-2 2-6.2Z" />
      <path d="M10 19.2a2.3 2.3 0 0 0 4 0" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

/**
 * 이 컴퓨터로 알림 받기.
 *
 * 켜고 끄는 것은 기기마다 따로다 — 사무실 PC 에서 켜도 노트북에는 켜지지 않는다.
 * 허락은 사람이 단추를 눌렀을 때만 묻는다. 화면에 들어오자마자 물으면 무슨 알림인지
 * 모르는 채로 거절하게 되고, 한 번 거절하면 브라우저 설정에서 직접 풀어야 한다.
 * 아이폰은 아예 사람 동작 없이 묻지 못한다.
 *
 * 켜면 확인 알림이 한 통 자동으로 간다 — 켜졌는지는 알림이 와 봐야 알기 때문에,
 * 따로 눌러 보는 단추를 두지 않는다.
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
      await notificationsApi.sendPushTest().catch(() => undefined);
      return true;
    },
    onSuccess: (done) => {
      setPermission(pushPermission());
      toast.ok(
        done
          ? '이 컴퓨터로 알림을 받습니다. 확인 알림이 한 통 갑니다.'
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
      toast.ok('이 컴퓨터로는 알림을 보내지 않습니다.');
    },
    onError: toast.fail,
  });

  const busy = turnOn.isPending || turnOff.isPending;
  const usable = permission !== 'unsupported' && permission !== 'denied';

  return (
    <section className="rounded-sm border border-line bg-surface px-5 py-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* 종 하나로 무슨 구역인지 먼저 보인다. 벌집 모양은 위 카드와 짝이다 */}
        <div className="relative h-14 w-14 shrink-0">
          <span
            aria-hidden
            className={`hex absolute inset-0 ${on ? 'bg-honey' : 'bg-bg'}`}
          />
          <span
            className={`absolute inset-0 flex items-center justify-center ${
              on ? 'text-fg' : 'text-fg-muted'
            }`}
          >
            <BellIcon muted={!on} />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-[20px] font-semibold">이 컴퓨터로 알림 받기</h2>
            <span className="text-[17px] text-fg-muted">
              {on ? '받는 중' : usable ? '꺼져 있음' : ''}
            </span>

            <div className="ml-auto">
              {on ? (
                <button
                  type="button"
                  className={btnClass}
                  disabled={busy}
                  onClick={() => turnOff.mutate()}
                >
                  {turnOff.isPending ? '끄는 중…' : '끄기'}
                </button>
              ) : (
                usable && (
                  <button
                    type="button"
                    className={btnPrimaryClass}
                    disabled={busy}
                    onClick={() => turnOn.mutate()}
                  >
                    {turnOn.isPending ? '켜는 중…' : '알림 켜기'}
                  </button>
                )
              )}
            </div>
          </div>

          {usable ? (
            <>
              <p className="mt-2 text-[18px] text-fg-sub">
                메일과 별개로, 아래 세 가지가 이 컴퓨터 화면에도 뜹니다.
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {[
                  '계측기 교정일이 다가올 때',
                  '안전검사 기한이 끝나갈 때',
                  '자산·계측기를 누가 고쳤을 때',
                ].map((text) => (
                  <li key={text} className="flex items-center gap-2 text-[18px] whitespace-nowrap text-fg-sub">
                    <span aria-hidden className="hex h-3 w-3 shrink-0 bg-honey" />
                    {text}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[17px] text-fg-muted">
                컴퓨터마다 따로 켭니다. 여럿이 쓰는 PC 라면 로그아웃할 때 함께 꺼집니다.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[18px] text-fg-sub">
              {permission === 'denied'
                ? '이 브라우저에서 알림을 차단해 두었습니다. 주소창 왼쪽 자물쇠(또는 ⓘ)를 눌러 알림을 허용으로 바꾼 뒤 새로고침해 주세요.'
                : '이 브라우저에서는 알림을 받을 수 없습니다. 아이폰·아이패드는 사파리에서 홈 화면에 추가한 뒤 그 아이콘으로 열면 받을 수 있습니다.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * 등록·수정 알림 받기 (백엔드 2026-10-29).
 *
 * 등록·수정이 승인 없이 바로 반영되는 대신 관리자에게 "누가 고쳤다" 는 알림이 간다.
 * 이 컴퓨터 알림을 꺼도 메일은 계속 와서, 메일·웹푸시를 본인이 따로 끄고 켜게 한다.
 * 관리자가 아니면 애초에 받지 않으므로 칸을 내보이지 않는다.
 *
 * 웹푸시를 켜 둬도 위 "이 컴퓨터로 알림 받기" 로 기기를 등록해야 실제로 온다.
 */
function ChangeAlerts() {
  const qc = useQueryClient();
  const toast = useToast();
  const pref = useQuery({
    queryKey: queryKeys.notifications.changeAlert(),
    queryFn: () => notificationsApi.changeAlert(),
  });

  const save = useMutation({
    mutationFn: (body: { email?: boolean; push?: boolean }) =>
      notificationsApi.updateChangeAlert(body),
    onSuccess: (next, body) => {
      qc.setQueryData(queryKeys.notifications.changeAlert(), next);
      const what = body.email !== undefined ? '메일' : '이 컴퓨터 알림';
      const on = body.email ?? body.push;
      toast.ok(`등록·수정 알림을 ${what}로 ${on ? '받습니다' : '받지 않습니다'}.`);
    },
    onError: toast.fail,
  });

  /* 관리자가 아니면 받을 일이 없다. 불러오지 못했을 때도 칸을 비워 두지 않고 감춘다 */
  const p = pref.data;
  if (!p?.admin) return null;

  const rows: { key: 'email' | 'push'; label: string; on: boolean; note?: string }[] = [
    {
      key: 'email',
      label: '메일로 받기',
      on: p.email,
      note: p.email && !p.receivingEmail ? '계정에 메일 주소가 없어 실제로는 가지 않습니다.' : undefined,
    },
    {
      key: 'push',
      label: '이 컴퓨터 알림으로 받기',
      on: p.push,
      note: p.push ? '위에서 이 컴퓨터 알림을 켜 둔 기기에만 옵니다.' : undefined,
    },
  ];

  return (
    <section className="rounded-sm border border-line bg-surface px-5 py-5">
      <h2 className="text-[20px] font-semibold">등록·수정 알림</h2>
      <p className="mt-2 text-[18px] text-fg-sub">
        누군가 자산·계측기를 등록하거나 고치면 관리자에게 알림이 갑니다. 메일과 컴퓨터 알림을
        따로 끄고 켤 수 있습니다. 꺼도 승인·반려는 그대로 할 수 있습니다.
      </p>
      <ul className="mt-3 divide-y divide-line rounded-sm border border-line">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="text-[19px] font-medium">{r.label}</span>
            <span className={`text-[17px] ${r.on ? 'text-accent' : 'text-fg-muted'}`}>
              {r.on ? '받는 중' : '꺼져 있음'}
            </span>
            {r.note && <span className="w-full text-[17px] text-fg-muted sm:order-last">{r.note}</span>}
            <div className="ml-auto">
              <button
                type="button"
                className={r.on ? btnClass : btnPrimaryClass}
                disabled={save.isPending}
                onClick={() => save.mutate({ [r.key]: !r.on })}
              >
                {r.on ? '끄기' : '켜기'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 교정·안전검사 메일 그만 받기.
 *
 * 이 컴퓨터 알림(위)과 메일은 길이 따로다 — 컴퓨터 알림을 꺼도 메일은 계속 간다.
 * 메일까지 끊고 싶다는 요청이 있어(2026-10-29) 여기서 바로 끊을 수 있게 한다.
 * 교정·안전검사는 수신 명단(notification-email)으로 가서 "내 설정" 자리가 없다.
 * 알림 화면의 본인 해지(인증코드 2단계)를 그대로 쓰고 주소만 미리 채운다.
 *
 * 등록·수정 알림은 위 ChangeAlerts 에서 따로 끈다.
 * 다시 받으려면 관리 담당자가 명단에 넣어 준다 — 본인 등록 경로는 두지 않았다.
 */
function MailAlerts({ email }: { email: string | null | undefined }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-sm border border-line bg-surface px-5 py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[20px] font-semibold">교정·안전검사 메일</h2>
        {email && <span className="text-[17px] text-fg-muted">{email}</span>}
        <div className="ml-auto">
          <button type="button" className={btnClass} onClick={() => setOpen(true)}>
            메일 그만 받기
          </button>
        </div>
      </div>
      <p className="mt-2 text-[18px] text-fg-sub">
        교정일·안전검사 기한 알림 메일을 끊으려면 여기서 해지하세요. 메일로 온 인증코드 6자리를
        넣으면 끊깁니다.
      </p>
      <p className="mt-2 text-[17px] text-fg-muted">
        다시 받으려면 관리 담당자에게 수신 명단에 넣어 달라고 말씀해 주세요.
      </p>
      {open && <UnsubscribeModal initialEmail={email ?? ''} onClose={() => setOpen(false)} />}
    </section>
  );
}
