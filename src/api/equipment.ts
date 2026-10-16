import { request } from './client';

/**
 * 사내 설비 — 설비 한 대가 한 줄 (백엔드 2026-10-16).
 *
 * 자산 분류는 고정자산 · 비품 · 사내 설비 셋이다. 설비코드는 여기서만 관리하고,
 * 고정자산 화면은 연결된 설비의 코드를 보여 주기만 한다.
 *
 * 설비코드 = 대분류(S·A) + 직간접(1·2) + 종류(A~H) + 일련번호 3자리. 예: S1A001
 * 등록할 때 앞 3자리만 보내면 서버가 다음 번호를 붙인다.
 */
export type EquipmentStatus = 'IN_USE' | 'IDLE' | 'DISPOSED';

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  IN_USE: '사용중',
  IDLE: '유휴',
  DISPOSED: '폐기',
};

/** 설비코드 1번째 자리 */
export const MAJOR_CLASSES = [
  { code: 'S', label: 'ST' },
  { code: 'A', label: 'AL' },
] as const;

/** 설비코드 2번째 자리 */
export const DIRECTNESS = [
  { code: '1', label: '직접' },
  { code: '2', label: '간접' },
] as const;

/** 설비코드 3번째 자리. 서버 EquipmentResponse 의 KIND_LABELS 와 같은 차례다 */
export const EQUIPMENT_KINDS = [
  { code: 'A', label: '기계장치' },
  { code: 'B', label: '시설장치' },
  { code: 'C', label: '공구와기구' },
  { code: 'D', label: '차량운반구' },
  { code: 'E', label: '비품' },
  { code: 'F', label: '소프트웨어' },
  { code: 'G', label: '특허권' },
  { code: 'H', label: '건물' },
] as const;

export interface Equipment {
  id: number;
  /** S1A002 */
  equipmentCode: string;
  /** S · A */
  majorClass: string;
  /** 1 직접 · 2 간접 */
  directness: string;
  /** A~H */
  kind: string;
  /** 기계장치 등 */
  kindLabel: string;
  equipmentGroup: string | null;
  name: string;
  modelName: string | null;
  serialNo: string | null;
  maker: string | null;
  storageLocation: string | null;
  /** 회계상 속한 고정자산. 연결은 선택이다 */
  parentAssetId: number | null;
  parentAssetName: string | null;
  /** 그 고정자산의 회계 프로그램 자산코드 */
  parentAccountingCode: string | null;
  status: EquipmentStatus;
  statusLabel: string;
  remark: string | null;
}

export interface EquipmentListQuery {
  /** 설비코드 앞자리. S1A 처럼 */
  codePrefix?: string;
  /** 설비명·설비코드·모델명 */
  keyword?: string;
  parentAssetId?: number;
  /** true = 고정자산에 연결 안 된 설비만 */
  unlinked?: boolean;
  status?: EquipmentStatus;
}

export interface CreateEquipmentPayload {
  /** 앞 3자리(S1A)만 보내면 다음 번호가 붙는다. 완성형(S1A001)이면 그대로 */
  equipmentCode: string;
  equipmentGroup?: string;
  name: string;
  modelName?: string;
  serialNo?: string;
  maker?: string;
  storageLocation?: string;
  parentAssetId?: number;
  /** 비우면 사용중 */
  status?: EquipmentStatus;
  remark?: string;
}

/** 빠진 키는 바꾸지 않는다 */
export interface UpdateEquipmentPayload extends Partial<CreateEquipmentPayload> {
  /** true 면 고정자산 연결을 끊는다 (parentAssetId 보다 우선) */
  unlinkParent?: boolean;
}

export const equipmentApi = {
  /** 페이지 없이 전부 온다 */
  list: (query: EquipmentListQuery = {}) =>
    request<Equipment[]>('GET', '/equipment', { query }),
  detail: (id: number) => request<Equipment>('GET', `/equipment/${id}`),
  /** 앞 3자리를 주면 저장될 설비코드(다음 번호)를 돌려준다 */
  codePreview: (prefix: string) =>
    request<string>('GET', '/equipment/code-preview', { query: { prefix } }),
  create: (body: CreateEquipmentPayload) => request<Equipment>('POST', '/equipment', { body }),
  update: (id: number, body: UpdateEquipmentPayload) =>
    request<Equipment>('PATCH', `/equipment/${id}`, { body }),
  /** 승인 대기(202)를 거친다 */
  remove: (id: number) => request<void>('DELETE', `/equipment/${id}`),
};
