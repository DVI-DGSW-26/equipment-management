import { useState } from 'react';
import { CODE_MASTER_LABEL, type CodeMasterKind } from '@/api/masters';
import { Tabs } from '@/components/ui';
import AccountTab from './AccountTab';
import CodeTab from './CodeTab';
import ItemTab from './ItemTab';
import RateTab from './RateTab';
import InstrumentLocationTab from './InstrumentLocationTab';
import PartnerTab from './PartnerTab';
import ConfigTab from './ConfigTab';

type TabKey =
  | 'account'
  | CodeMasterKind
  | 'item'
  | 'rate'
  | 'instrument-location'
  | 'partner'
  | 'config';

const CODE_KINDS: CodeMasterKind[] = ['category', 'item-type', 'location', 'department'];

export default function MasterPage() {
  const [tab, setTab] = useState<TabKey>('account');

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">코드·상각률 마스터</h1>

      <Tabs
        tabs={[
          { key: 'account' as TabKey, label: '계정과목' },
          ...CODE_KINDS.map((k) => ({ key: k as TabKey, label: CODE_MASTER_LABEL[k] })),
          { key: 'item' as TabKey, label: '품목' },
          { key: 'rate' as TabKey, label: '상각률' },
          { key: 'instrument-location' as TabKey, label: '계측기 사용위치' },
          { key: 'partner' as TabKey, label: '거래처' },
          { key: 'config' as TabKey, label: '미확정 설정' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'account' && <AccountTab />}
      {CODE_KINDS.includes(tab as CodeMasterKind) && <CodeTab kind={tab as CodeMasterKind} />}
      {tab === 'item' && <ItemTab />}
      {tab === 'rate' && <RateTab />}
      {tab === 'instrument-location' && <InstrumentLocationTab />}
      {tab === 'partner' && <PartnerTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}
