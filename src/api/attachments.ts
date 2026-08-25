import { request, requestFile, requestUpload, type DownloadResult } from './client';
import type { IsoDateTime } from './types';

export interface Attachment {
  id: number;
  instrumentId: number;
  originalName: string;
  contentType: string | null;
  /** byte */
  fileSize: number | null;
  downloadUrl: string;
  createdAt: IsoDateTime;
}

/** 1.2 MB 처럼 사람이 읽는 크기 */
export const fileSizeText = (bytes: number | null | undefined): string => {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const attachmentsApi = {
  byInstrument: (instrumentId: number) =>
    request<Attachment[]>('GET', `/attachment/instrument/${instrumentId}`),
  upload: (instrumentId: number, file: File) =>
    requestUpload<Attachment>(`/attachment/instrument/${instrumentId}`, file),
  download: (attachment: Attachment): Promise<DownloadResult> =>
    requestFile('GET', `/attachment/${attachment.id}/download`, attachment.originalName),
  remove: (attachmentId: number) => request<void>('DELETE', `/attachment/${attachmentId}`),
};
