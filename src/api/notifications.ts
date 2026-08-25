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
  addEmail: (email: string) =>
    request<NotificationEmail>('POST', '/notification-email', { body: { email } }),
  removeEmail: (id: number) => request<void>('DELETE', `/notification-email/${id}`),
  subscribeRequest: (email: string) =>
    request<VerificationCodeSent>('POST', '/notification-email/subscribe/request', {
      body: { email },
    }),
  subscribeVerify: (email: string, code: string) =>
    request<NotificationEmail>('POST', '/notification-email/subscribe/verify', {
      body: { email, code },
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

  logs: (query: { page?: number; size?: number } = {}) =>
    request<SpringPage<NotificationLog>>('GET', '/notification/log', { query }).then(
      toPage,
    ) as Promise<Page<NotificationLog>>,
};
