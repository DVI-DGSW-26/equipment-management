import { useState } from 'react';
import { CODE_MASTER_LABEL, type CodeMasterKind } from '@/api/masters';
import { usePerms } from '@/hooks/useMe';
import { TabGroups } from '@/components/ui';
import AccountTab from './AccountTab';
import CodeTab from './CodeTab';
import ItemTab from './ItemTab';
import RateTab from './RateTab';
import InstrumentLocationTab from './InstrumentLocationTab';
import PartnerTab from './PartnerTab';

type TabKey =
  | 'account'
  | CodeMasterKind
  | 'item'
  | 'rate'
  | 'instrument-location'
  | 'partner';

const CODE_KINDS: CodeMasterKind[] = ['category', 'item-type', 'location', 'department'];

/**
 * 마스터를 담당별로 묶는다.
 *
 * 계정과목·자산코드·상각률은 자산(회계) 쪽이고, 계측기 사용위치·거래처는 계측기 쪽이다.
 * 한 줄에 섞어 두면 어느 것이 누구 몫인지 알 수 없다. 탭은 누구에게나 다 보이게 두고
 * 묶음으로만 가른다 (2026-09-14 요청). 고치는 권한은 서버가 따로 막는다.
 */
export default function MasterPage() {
  const { perms } = usePerms();
  /* 두 담당을 다 가진 사람(팀장·IT)에게 "내 담당" 이 양쪽에 붙으면 뜻이 없다 */
  const both = perms.asset && perms.instrument;

  /* 계측기만 맡은 사람은 들어오자마자 자기 것부터 본다 */
  const [tab, setTab] = useState<TabKey>(() =>
    perms.instrument && !perms.asset ? 'instrument-location' : 'account',
  );

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">기본설정</h1>

      <TabGroups
        groups={[
          {
            label: '자산',
            mine: perms.asset && !both,
            tabs: [
              { key: 'account' as TabKey, label: '계정과목' },
              ...CODE_KINDS.map((k) => ({ key: k as TabKey, label: CODE_MASTER_LABEL[k] })),
              { key: 'item' as TabKey, label: '품목' },
              { key: 'rate' as TabKey, label: '상각률' },
            ],
          },
          {
            label: '계측기',
            mine: perms.instrument && !both,
            tabs: [
              { key: 'instrument-location' as TabKey, label: '계측기 사용위치' },
              { key: 'partner' as TabKey, label: '거래처' },
            ],
          },
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
    </div>
  );
}
