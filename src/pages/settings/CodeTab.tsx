import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  mastersApi,
  CODE_MASTER_EXTRA_LABEL,
  CODE_MASTER_LABEL,
  type CodeMaster,
  type CodeMasterKind,
} from '@/api/masters';
import { queryKeys } from '@/api/queryKeys';
import { useCodes } from '@/hooks/useMasters';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { searchIn } from '@/lib/search';
import { btnClass, btnPrimaryClass, Field, FilterCount, inputClass, QueryState, SearchBox, Section, thClass } from '@/components/ui';

export default function CodeTab({ kind }: { kind: CodeMasterKind }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CodeMaster | null | 'new'>(null);
  const [keyword, setKeyword] = useState('');
  const extraLabel = CODE_MASTER_EXTRA_LABEL[kind];

  const q = useCodes(kind);

  const all = q.data ?? [];
  const hit = searchIn(keyword);
  const rows = all.filter((c) => hit(c.code, c.name, c.extra, c.remark));

  return (
    <Section
      title={CODE_MASTER_LABEL[kind]}
      right={
        <>
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder={extraLabel ? `코드·이름·${extraLabel}·비고` : '코드·이름·비고'}
          />
          <FilterCount shown={rows.length} total={all.length} />
          <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
            추가
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
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>코드</th>
              <th className={thClass}>이름</th>
              {extraLabel && <th className={thClass}>{extraLabel}</th>}
              <th className={thClass}>비고</th>
              <th className={`${thClass} text-right`}>정렬</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line hover:bg-bg">
                <td className="code px-3 py-2">{c.code}</td>
                <td className="px-3 py-2">{c.name}</td>
                {extraLabel && <td className="px-3 py-2">{c.extra ?? '-'}</td>}
                <td className="px-3 py-2 text-fg-sub">{c.remark ?? '-'}</td>
                <td className="num px-3 py-2">{c.sortOrder ?? '-'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="whitespace-nowrap text-[18px] text-accent hover:underline"
                    onClick={() => setEditing(c)}
                  >
                    수정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <CodeModal
          kind={kind}
          code={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={() => void qc.invalidateQueries({ queryKey: queryKeys.masters.codes(kind) })}
        />
      )}
    </Section>
  );
}

function CodeModal({
  kind,
  code,
  onClose,
  onDone,
}: {
  kind: CodeMasterKind;
  code?: CodeMaster;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const extraLabel = CODE_MASTER_EXTRA_LABEL[kind];
  const [form, setForm] = useState({
    code: code?.code ?? '',
    name: code?.name ?? '',
    extra: code?.extra ?? '',
    remark: code?.remark ?? '',
    sortOrder: code?.sortOrder != null ? String(code.sortOrder) : '',
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code || undefined,
        name: form.name,
        extra: form.extra || undefined,
        remark: form.remark || undefined,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
      };
      return code ? mastersApi.updateCode(kind, code.id, body) : mastersApi.createCode(kind, body);
    },
    onSuccess: () => {
      toast.ok('저장했습니다.');
      onDone();
      onClose();
    },
    onError: toast.fail,
  });

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={`${CODE_MASTER_LABEL[kind]} ${code ? '수정' : '추가'}`}
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
            disabled={save.isPending || form.name.trim() === ''}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="코드" hint={code ? '수정 시 반영되지 않습니다.' : undefined}>
          <input
            className={inputClass}
            value={form.code}
            disabled={!!code}
            onChange={(e) => set('code', e.target.value)}
          />
        </Field>
        <Field label="이름" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        {extraLabel && (
          <Field label={extraLabel}>
            <input
              className={inputClass}
              value={form.extra}
              onChange={(e) => set('extra', e.target.value)}
            />
          </Field>
        )}
        <Field label="비고">
          <input
            className={inputClass}
            value={form.remark}
            onChange={(e) => set('remark', e.target.value)}
          />
        </Field>
        <Field label="정렬 순서">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
      </div>
    </Modal>
  );
}
