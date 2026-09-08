import { request, requestFile, requestUpload, type DownloadResult } from './client';
import type { IsoDateTime } from './types';

/**
 * 첨부파일.
 *
 * 계측기와 고정자산이 같은 저장소를 쓴다 (백엔드 회신 2026-09-08). 계측기 사진이면
 * assetId 가, 자산 사진이면 instrumentId 가 null 이다. 내려받기·삭제는 어느 쪽이든
 * /attachment/{id} 하나로 통한다.
 */
export interface Attachment {
  id: number;
  /** 계측기 사진이면 계측기 ID */
  instrumentId: number | null;
  /** 자산 사진이면 자산 ID */
  assetId: number | null;
  originalName: string;
  contentType: string | null;
  /** byte */
  fileSize: number | null;
  downloadUrl: string;
  createdAt: IsoDateTime;
}

/** 첨부가 달린 대상. 목록·업로드 주소가 이것으로 갈린다 */
export interface AttachmentOwner {
  kind: 'instrument' | 'asset';
  id: number;
}

const ownerPath = (owner: AttachmentOwner): string => `/attachment/${owner.kind}/${owner.id}`;

/** 1.2 MB 처럼 사람이 읽는 크기 */
export const fileSizeText = (bytes: number | null | undefined): string => {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const attachmentsApi = {
  list: (owner: AttachmentOwner) => request<Attachment[]>('GET', ownerPath(owner)),
  upload: (owner: AttachmentOwner, file: File) =>
    requestUpload<Attachment>(ownerPath(owner), file),
  download: (attachment: Attachment): Promise<DownloadResult> =>
    requestFile('GET', `/attachment/${attachment.id}/download`, attachment.originalName),
  remove: (attachmentId: number) => request<void>('DELETE', `/attachment/${attachmentId}`),
};
