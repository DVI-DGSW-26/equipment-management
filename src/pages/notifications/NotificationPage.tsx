import { useState } from 'react';
import type { AlertType } from '@/api/notifications';
import { usePerms } from '@/hooks/useMe';
import { TabGroups } from '@/components/ui';
import AlertTab from './AlertTab';

/**
 * 알림 화면.
 *
 * 수신 이메일 목록이 서버에 하나뿐이라, 알림을 안전검사·계측기 화면으로 흩어 놓으면
 * 한 화면에서 남의 유형까지 만지게 된다. 그래서 알림은 한 자리에 모으고,
 * 탭으로 유형만 갈라 각 탭이 자기 유형만 책임지게 한다.
 */
type TabKey = AlertType;

export default function NotificationPage() {
  const { perms } = usePerms();
  /* 두 담당을 다 가진 사람(팀장·IT)에게 "내 담당" 이 양쪽에 붙으면 뜻이 없다 */
  const both = perms.asset && perms.instrument;

  /*
   * 탭은 누구에게나 다 보이고 담당으로만 가른다 — 안전검사는 자산 담당, 교정은
   * 계측기 담당 몫이다 (2026-09-14 요청). 계측기만 맡은 사람은 교정부터 본다.
   */
  const [tab, setTab] = useState<TabKey>(() =>
    perms.instrument && !perms.asset ? 'CALIBRATION' : 'SAFETY',
  );

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">알림</h1>

      <TabGroups
        groups={[
          {
            label: '자산',
            mine: perms.asset && !both,
            tabs: [{ key: 'SAFETY' as const, label: '안전검사' }],
          },
          {
            label: '계측기',
            mine: perms.instrument && !both,
            tabs: [{ key: 'CALIBRATION' as const, label: '교정' }],
          },
        ]}
        value={tab}
        onChange={setTab}
      />
      <AlertTab type={tab} />
    </div>
  );
}
