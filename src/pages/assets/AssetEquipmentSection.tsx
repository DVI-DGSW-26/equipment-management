import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { equipmentApi } from '@/api/equipment';
import { queryKeys } from '@/api/queryKeys';
import { QueryState, Section, thClass } from '@/components/ui';

/**
 * 이 고정자산에 연결된 사내 설비.
 *
 * 설비코드는 사내 설비 화면에서만 관리한다 (백엔드 2026-10-16). 고정자산에서는 어떤 설비가
 * 딸려 있는지 보고, 잇거나 끊는 일은 사내 설비 화면에서 한다.
 */
export default function AssetEquipmentSection({ assetId }: { assetId: number }) {
  const query = { parentAssetId: assetId };
  const list = useQuery({
    queryKey: queryKeys.equipment.list(query),
    queryFn: () => equipmentApi.list(query),
  });
  const rows = list.data ?? [];

  return (
    <Section
      title={`연결된 사내 설비 ${rows.length}대`}
      right={
        <Link to="/equipment" className="text-[18px] text-accent hover:underline">
          사내 설비 화면에서 연결
        </Link>
      }
    >
      <QueryState
        isPending={list.isPending}
        error={list.error}
        isEmpty={rows.length === 0}
        emptyText="연결된 설비가 없습니다. 사내 설비 화면에서 설비를 고르고 이 고정자산을 연결하면 여기에 보입니다."
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>설비코드</th>
              <th className={thClass}>설비명</th>
              <th className={thClass}>종류</th>
              <th className={thClass}>모델명</th>
              <th className={thClass}>보관장소</th>
              <th className={thClass}>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line">
                <td className="code px-3 py-2">{r.equipmentCode}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.kindLabel}</td>
                <td className="px-3 py-2">{r.modelName ?? '-'}</td>
                <td className="px-3 py-2">{r.storageLocation ?? '-'}</td>
                <td className="px-3 py-2">{r.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
