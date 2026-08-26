import { useState } from 'react';
import AlertTab from '@/pages/notifications/AlertTab';
import { Tabs } from '@/components/ui';
import CalendarTab from './CalendarTab';
import EquipmentTab from './EquipmentTab';

/**
 * 안전검사 화면. 담당자가 한 화면에서 현황·일정·알림을 다 보도록 탭으로 묶었다.
 * 교정 알림은 같은 이유로 계측기 화면에 있다.
 */
type TabKey = 'list' | 'calendar' | 'alert';

export default function InspectionListPage() {
  const [tab, setTab] = useState<TabKey>('list');

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">안전검사</h1>
      <Tabs
        tabs={[
          { key: 'list' as const, label: '검사 현황' },
          { key: 'calendar' as const, label: '달력' },
          { key: 'alert' as const, label: '알림' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'list' && <EquipmentTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'alert' && <AlertTab type="SAFETY" />}
    </div>
  );
}
