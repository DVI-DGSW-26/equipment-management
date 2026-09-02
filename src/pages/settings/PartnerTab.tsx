import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  partnersApi,
  PARTNER_TYPE_LABEL,
  type Partner,
  type PartnerType,
} from '@/api/instrumentMasters';
import { queryKeys } from '@/api/queryKeys';
import { usePartners } from '@/hooks/useMasters';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { searchIn } from '@/lib/search';
import { rowNo } from '@/lib/paging';
import { btnClass, btnPrimaryClass, Field, FilterCount, inputClass, QueryState, SearchBox, Section, seqThClass, thClass } from '@/components/ui';

export default function PartnerTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Partner | 'new' | null>(null);
  const [keyword, setKeyword] = useState('');
  /* 거르는 기준은 두 갈래뿐이다. BOTH 는 골라야 할 값이 아니라 양쪽 다 하는 거래처다 */
  const [type, setType] = useState<'' | 'SUPPLIER' | 'CALIBRATION_AGENCY'>('');

  const q = usePartners();

  const all = q.data ?? [];
  const hit = searchIn(keyword);
  const rows = all.filter(
    (p) => hit(p.name) && (type === '' || p.partnerType === type || p.partnerType === 'BOTH'),
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.masters.partners() });

  const remove = useMutation({
    mutationFn: (id: number) => partnersApi.remove(id),
    onSuccess: () => {
      toast.ok('거래처를 삭제했습니다.');
      invalidate();
    },
    onError: toast.fail,
  });

  return (
    <Section
      title="거래처"
      right={
        <>
          <SearchBox value={keyword} onChange={setKeyword} placeholder="거래처명" />
          <select
            className={`${inputClass} w-36`}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            aria-label="구분"
          >
            <option value="">구분 전체</option>
            <option value="SUPPLIER">{PARTNER_TYPE_LABEL.SUPPLIER}</option>
            <option value="CALIBRATION_AGENCY">{PARTNER_TYPE_LABEL.CALIBRATION_AGENCY}</option>
          </select>
          <FilterCount shown={rows.length} total={all.length} />
          <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
            거래처 추가
          </button>
        </>
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={keyword || type ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={seqThClass}>No.</th>
              <th className={thClass}>거래처명</th>
              <th className={thClass}>구분</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, idx) => (
              <tr key={p.id} className="border-b border-line hover:bg-bg">
                <td className="num px-3 py-2 text-fg-muted">{rowNo(idx)}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.partnerTypeLabel}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-2 whitespace-nowrap text-[18px] text-accent hover:underline"
                    onClick={() => setEditing(p)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="whitespace-nowrap text-[18px] text-danger hover:underline"
                    onClick={() => {
                      if (window.confirm(`${p.name} 을 삭제합니다.`)) remove.mutate(p.id);
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <PartnerModal
          partner={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={invalidate}
        />
      )}
    </Section>
  );
}

function PartnerModal({
  partner,
  onClose,
  onDone,
}: {
  partner?: Partner;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(partner?.name ?? '');
  const [partnerType, setPartnerType] = useState<PartnerType>(partner?.partnerType ?? 'SUPPLIER');

  const save = useMutation({
    mutationFn: () =>
      partner
        ? partnersApi.update(partner.id, { name, partnerType })
        : partnersApi.create({ name, partnerType }),
    onSuccess: () => {
      toast.ok('저장했습니다.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={partner ? '거래처 수정' : '거래처 추가'}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || name.trim() === ''}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="거래처명" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="구분" required>
          <select
            className={inputClass}
            value={partnerType}
            onChange={(e) => setPartnerType(e.target.value as PartnerType)}
          >
            {(Object.keys(PARTNER_TYPE_LABEL) as PartnerType[]).map((t) => (
              <option key={t} value={t}>
                {PARTNER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
