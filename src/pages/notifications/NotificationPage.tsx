import { useState } from 'react';
import type { AlertType } from '@/api/notifications';
import { Tabs } from '@/components/ui';
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
  const [tab, setTab] = useState<TabKey>('SAFETY');

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">알림</h1>
      <Tabs
        tabs={[
          { key: 'SAFETY' as const, label: '안전검사' },
          { key: 'CALIBRATION' as const, label: '교정' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <AlertTab type={tab} />
    </div>
  );
}
