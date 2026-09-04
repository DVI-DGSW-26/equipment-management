import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mastersApi, type AssetAccount } from '@/api/masters';
import { queryKeys } from '@/api/queryKeys';
import { useAccounts } from '@/hooks/useMasters';
import { DEPRECIATION_METHOD_LABEL } from '@/api/assets';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { searchIn } from '@/lib/search';
import { rowNo } from '@/lib/paging';
import { btnClass, btnPrimaryClass, Field, FilterCount, inputClass, QueryState, SearchBox, Section, seqThClass, thClass } from '@/components/ui';

export default function AccountTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AssetAccount | null | 'new'>(null);
  const [keyword, setKeyword] = useState('');

  const q = useAccounts();

  /* 한 번에 다 받아 오는 목록이라 화면에서 거른다 */
  const all = q.data ?? [];
  const hit = searchIn(keyword);
  const rows = all.filter((a) => hit(a.code, a.name));

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.masters.all });

  const remove = useMutation({
    mutationFn: (id: number) => mastersApi.removeAccount(id),
    onSuccess: () => {
      toast.ok('계정과목을 삭제했습니다.');
      invalidate();
    },
    onError: toast.fail,
  });

  return (
    <Section
      title="계정과목"
      right={
        <>
          <SearchBox value={keyword} onChange={setKeyword} placeholder="코드·계정과목명" />
          <FilterCount shown={rows.length} total={all.length} />
          <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
            계정과목 추가
          </button>
        </>
      }
    >
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={keyword ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
      />
      {rows.length > 0 && (
        <table className="w-max text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={seqThClass}>No.</th>
              <th className={thClass}>코드</th>
              <th className={thClass}>계정과목명</th>
              <th className={`${thClass} text-right`}>기본 내용연수</th>
              <th className={thClass}>허용 상각방법</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((a, idx) => (
              <tr key={a.id} className="border-b border-line hover:bg-bg">
                <td className="num px-3 py-2 text-fg-muted">{rowNo(idx)}</td>
                <td className="code px-3 py-2">{a.code}</td>
                <td className="px-3 py-2">{a.name}</td>
                <td className="num px-3 py-2">{a.defaultUsefulLifeYears ?? '-'}</td>
                <td className="px-3 py-2">
                  {(a.allowedMethods ?? [])
                    .map((m) => DEPRECIATION_METHOD_LABEL[m] ?? m)
                    .join(' · ') || '-'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="mr-2 whitespace-nowrap text-[18px] text-accent hover:underline"
                    onClick={() => setEditing(a)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="whitespace-nowrap text-[18px] text-danger hover:underline"
                    onClick={() => {
                      if (window.confirm(`${a.name} 계정과목을 삭제합니다.`)) remove.mutate(a.id);
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
        <AccountModal
          account={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={invalidate}
        />
      )}
    </Section>
  );
}

function AccountModal({
  account,
  onClose,
  onDone,
}: {
  account?: AssetAccount;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [life, setLife] = useState(
    account?.defaultUsefulLifeYears != null ? String(account.defaultUsefulLifeYears) : '',
  );

  const save = useMutation({
    mutationFn: () =>
      account
        ? mastersApi.updateAccount(account.id, {
            name,
            defaultUsefulLifeYears: life ? Number(life) : undefined,
          })
        : mastersApi.createAccount({
            code,
            name,
            defaultUsefulLifeYears: life ? Number(life) : undefined,
          }),
    onSuccess: () => {
      toast.ok('저장했습니다.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={account ? '계정과목 수정' : '계정과목 추가'}
      width={580}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || name.trim() === '' || (!account && code.trim() === '')}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="계정코드" required hint={account ? '수정할 수 없습니다.' : undefined}>
          <input
            className={inputClass}
            value={code}
            disabled={!!account}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label="계정과목명" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="기본 내용연수(년)">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={life}
            onChange={(e) => setLife(e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
      </div>
    </Modal>
  );
}
