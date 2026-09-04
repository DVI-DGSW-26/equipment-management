import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { instrumentLocationsApi, type InstrumentLocation } from '@/api/instrumentMasters';
import { queryKeys } from '@/api/queryKeys';
import { useInstrumentLocations } from '@/hooks/useMasters';
import { useToast } from '@/components/toastContext';
import { searchIn } from '@/lib/search';
import { rowNo } from '@/lib/paging';
import { btnPrimaryClass, FilterCount, filterClass, QueryState, SearchBox, Section, seqThClass, thClass } from '@/components/ui';

export default function InstrumentLocationTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<InstrumentLocation | null>(null);
  const [editName, setEditName] = useState('');
  const [keyword, setKeyword] = useState('');

  const q = useInstrumentLocations();

  const all = q.data ?? [];
  const rows = all.filter((l) => searchIn(keyword)(l.name));

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: queryKeys.masters.instrumentLocations() });

  const create = useMutation({
    mutationFn: () => instrumentLocationsApi.create(draft.trim()),
    onSuccess: () => {
      toast.ok('사용위치를 추가했습니다.');
      setDraft('');
      invalidate();
    },
    onError: toast.fail,
  });

  const update = useMutation({
    mutationFn: () => instrumentLocationsApi.update(editing!.id, editName.trim()),
    onSuccess: () => {
      toast.ok('수정했습니다.');
      setEditing(null);
      invalidate();
    },
    onError: toast.fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => instrumentLocationsApi.remove(id),
    onSuccess: () => {
      toast.ok('삭제했습니다.');
      invalidate();
    },
    onError: toast.fail,
  });

  return (
    <Section
      title="계측기 사용위치"
      right={
        <>
          <SearchBox value={keyword} onChange={setKeyword} placeholder="위치 검색" width="w-40" />
          <FilterCount shown={rows.length} total={all.length} />
          <input
            className={`${filterClass} w-40`}
            placeholder="추가할 사용위치명"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && draft.trim() && create.mutate()}
          />
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={create.isPending || draft.trim() === ''}
            onClick={() => create.mutate()}
          >
            추가
          </button>
        </>
      }
    >
      <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">
        고정자산의 위치 코드 마스터(A01 · 압출동 …)와는 별개 목록입니다.
      </p>
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={keyword ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={seqThClass}>No.</th>
              <th className={thClass}>사용위치</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((l, idx) => (
              <tr key={l.id} className="border-b border-line hover:bg-bg">
                <td className="num px-3 py-2 text-fg-muted">{rowNo(idx)}</td>
                <td className="px-3 py-2">
                  {editing?.id === l.id ? (
                    <input
                      className={`${filterClass} w-60`}
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && editName.trim() && update.mutate()}
                    />
                  ) : (
                    l.name
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {editing?.id === l.id ? (
                    <>
                      <button
                        type="button"
                        className="mr-2 whitespace-nowrap text-[18px] text-accent hover:underline"
                        disabled={update.isPending || editName.trim() === ''}
                        onClick={() => update.mutate()}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        className="whitespace-nowrap text-[18px] text-fg-sub hover:underline"
                        onClick={() => setEditing(null)}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="mr-2 whitespace-nowrap text-[18px] text-accent hover:underline"
                        onClick={() => {
                          setEditing(l);
                          setEditName(l.name);
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="whitespace-nowrap text-[18px] text-danger hover:underline"
                        onClick={() => {
                          if (window.confirm(`${l.name} 을 삭제합니다.`)) remove.mutate(l.id);
                        }}
                      >
                        삭제
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
