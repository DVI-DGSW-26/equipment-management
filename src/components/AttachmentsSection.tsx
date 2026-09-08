import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attachmentsApi, fileSizeText, type AttachmentOwner } from '@/api/attachments';
import { saveFile } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { fmtDateTime } from '@/lib/date';
import AuthImage from '@/components/AuthImage';
import { useToast } from '@/components/toastContext';
import { btnPrimaryClass, QueryState, Section, thClass } from '@/components/ui';

/**
 * 사진·첨부 목록.
 *
 * 계측기와 고정자산이 같은 저장소를 쓰므로 화면도 한 벌만 둔다 — 표가 두 벌이면
 * 한쪽만 고쳐 놓고 다른 쪽이 어긋난다.
 *
 * 업로드·삭제는 곧바로 실행된다. 승인 대기 대상이 아니다 (백엔드 회신 2026-09-08).
 */
export default function AttachmentsSection({
  owner,
  title = '첨부파일',
  emptyText,
  canWrite = true,
}: {
  owner: AttachmentOwner;
  title?: string;
  emptyText?: string;
  /** 조회 전용 계정에는 올리기·삭제를 내보이지 않는다 */
  canWrite?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const key = queryKeys.attachments.byOwner(owner);

  const attachments = useQuery({
    queryKey: key,
    queryFn: () => attachmentsApi.list(owner),
    enabled: Number.isFinite(owner.id),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(owner, file),
    onSuccess: () => {
      toast.ok('첨부파일을 올렸습니다.');
      refresh();
    },
    onError: toast.fail,
  });

  const download = useMutation({
    mutationFn: attachmentsApi.download,
    onSuccess: saveFile,
    onError: toast.fail,
  });

  const remove = useMutation({
    mutationFn: (attachmentId: number) => attachmentsApi.remove(attachmentId),
    onSuccess: () => {
      toast.ok('첨부파일을 삭제했습니다.');
      refresh();
    },
    onError: toast.fail,
  });

  const rows = attachments.data ?? [];

  return (
    <Section
      title={title}
      right={
        canWrite && (
          <>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                /* 같은 파일을 다시 고를 수 있도록 비운다 */
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {upload.isPending ? '업로드 중…' : '파일 올리기'}
            </button>
          </>
        )
      }
    >
      <QueryState
        isPending={attachments.isPending}
        error={attachments.error}
        isEmpty={rows.length === 0}
        emptyText={emptyText ?? '첨부파일이 없습니다.'}
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass} />
              <th className={thClass}>파일명</th>
              <th className={thClass}>형식</th>
              <th className={`${thClass} text-right`}>크기</th>
              <th className={thClass}>올린 일시</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-line hover:bg-bg">
                {/* 사진이면 어느 것인지 열어 보지 않아도 알 수 있게 */}
                <td className="px-3 py-2">
                  {f.contentType?.startsWith('image/') ? (
                    <AuthImage
                      path={`/attachment/${f.id}/download`}
                      alt=""
                      className="h-12 w-16 rounded-sm border border-line object-cover"
                    />
                  ) : (
                    <span className="text-fg-muted">-</span>
                  )}
                </td>
                <td className="px-3 py-2">{f.originalName}</td>
                <td className="px-3 py-2 text-fg-sub">{f.contentType ?? '-'}</td>
                <td className="num px-3 py-2">{fileSizeText(f.fileSize)}</td>
                <td className="px-3 py-2">{fmtDateTime(f.createdAt)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-2 whitespace-nowrap text-[18px] text-accent hover:underline"
                    disabled={download.isPending}
                    onClick={() => download.mutate(f)}
                  >
                    내려받기
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      className="whitespace-nowrap text-[18px] text-danger hover:underline"
                      onClick={() => {
                        if (window.confirm(`${f.originalName} 을 삭제합니다.`)) remove.mutate(f.id);
                      }}
                    >
                      삭제
                    </button>
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
