import { request } from './client';
import { toPage, type IsoDate, type IsoDateTime, type Page, type SpringPage } from './types';

export type EmailStatus = 'PENDING' | 'VERIFIED';

export interface NotificationEmail {
  id: number;
  email: string;
  status: EmailStatus;
  statusLabel: string;
  verifiedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  /** 이 주소가 받을 알림 유형 */
  alertTypes: AlertType[];
  /** 담당 팀. 빈 배열이면 팀과 무관하게 전부 받는다 */
  teams: string[];
}

/** 등록·수정 때 같이 보내는 수신 조건. 주지 않으면 서버 기본값을 따른다 */
export interface EmailPreferences {
  /** 등록 시 비우면 교정·안전검사 둘 다. 수정 시에는 최소 1개 (빈 배열은 400) */
  alertTypes?: AlertType[];
  /** 비우면 전체 팀 수신 */
  teams?: string[];
}

export interface VerificationCodeSent {
  /** 코드 만료 시각 */
  expiresAt: IsoDateTime;
}

export type AlertType = 'CALIBRATION' | 'SAFETY';

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  CALIBRATION: '교정',
  SAFETY: '안전검사',
};

/** 알림 발송 이력 (30일 보관) */
export interface NotificationLog {
  id: number;
  alertType: AlertType;
  instrumentId: number | null;
  safetyEquipmentId: number | null;
  recipientEmail: string;
  success: boolean;
  sentAt: IsoDateTime;
}

export interface AlertSendResult {
  targetCount: number;
  sentCount: number;
  failedCount: number;
  /** 당일 발송 이력이 있어 서버가 건너뛴 건수 */
  skippedCount: number;
}

/** 알림 발송 시점. 각 값 0~365 */
export interface AlertSettings {
  /** 교정 알림 — 차기 교정일 며칠 전. 0 = 당일 */
  calibrationDaysBefore: number[];
  /** 안전검사 알림 — 검사유효 만료일 며칠 전 */
  safetyDaysBefore: number[];
}

/**
 * 수신 등록·해지는 2단계다.
 * ① request 로 인증코드 메일 발송 → ② verify 로 6자리 코드 확인.
 */
export const notificationsApi = {
  emails: () => request<NotificationEmail[]>('GET', '/notification-email'),
  /** 담당자 직접 등록 — 인증 없이 즉시 VERIFIED. 이미 등록된 주소면 409 */
  addEmail: (email: string, prefs: EmailPreferences = {}) =>
    request<NotificationEmail>('POST', '/notification-email', { body: { email, ...prefs } }),
  /** 알림유형·담당팀 수정. 주지 않은 항목은 서버가 그대로 둔다 */
  updatePreferences: (id: number, body: EmailPreferences) =>
    request<NotificationEmail>('PATCH', `/notification-email/${id}`, { body }),
  removeEmail: (id: number) => request<void>('DELETE', `/notification-email/${id}`),
  subscribeRequest: (email: string) =>
    request<VerificationCodeSent>('POST', '/notification-email/subscribe/request', {
      body: { email },
    }),
  /** alertTypes 를 같이 보내면 이 시점에 받을 유형이 확정된다. 비우면 기존 값 유지 */
  subscribeVerify: (email: string, code: string, alertTypes?: AlertType[]) =>
    request<NotificationEmail>('POST', '/notification-email/subscribe/verify', {
      body: { email, code, alertTypes },
    }),
  unsubscribeRequest: (email: string) =>
    request<VerificationCodeSent>('POST', '/notification-email/unsubscribe/request', {
      body: { email },
    }),
  unsubscribeVerify: (email: string, code: string) =>
    request<void>('POST', '/notification-email/unsubscribe/verify', { body: { email, code } }),

  /** 교정 알림 수동 발송. baseDate 기준으로 대상을 다시 계산한다 */
  sendCalibrationAlert: (baseDate: IsoDate) =>
    request<AlertSendResult>('POST', '/notification/alert/send', { query: { baseDate } }),
  sendSafetyAlert: (baseDate: IsoDate) =>
    request<AlertSendResult>('POST', '/notification/safety-alert/send', { query: { baseDate } }),

  settings: () => request<AlertSettings>('GET', '/notification/settings'),
  updateSettings: (body: Partial<AlertSettings>) =>
    request<AlertSettings>('PATCH', '/notification/settings', { body }),

  /** alertType 으로 유형별, team 으로 안전검사 팀별로 거른다 (서버가 걸러 준다) */
  logs: (query: { page?: number; size?: number; alertType?: AlertType; team?: string } = {}) =>
    request<SpringPage<NotificationLog>>('GET', '/notification/log', { query }).then(
      toPage,
    ) as Promise<Page<NotificationLog>>,
};
