import { useState } from 'react';
import { Tabs } from '@/components/ui';
import CalendarTab from './CalendarTab';
import EquipmentTab from './EquipmentTab';

/**
 * 안전검사 화면. 현황과 일정을 한 화면에서 본다.
 * 알림 설정은 교정과 함께 상단 "알림" 메뉴에 있다 (수신자 목록이 공용이라 한 자리에 모았다).
 */
type TabKey = 'list' | 'calendar';

export default function InspectionListPage() {
  const [tab, setTab] = useState<TabKey>('list');

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">안전검사</h1>
      <Tabs
        tabs={[
          { key: 'list' as const, label: '검사 현황' },
          { key: 'calendar' as const, label: '달력' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'list' && <EquipmentTab />}
      {tab === 'calendar' && <CalendarTab />}
    </div>
  );
}
