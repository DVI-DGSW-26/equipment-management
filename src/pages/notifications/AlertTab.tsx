import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  notificationsApi,
  ALERT_TYPE_LABEL,
  type AlertSettings,
  type AlertType,
} from '@/api/notifications';
import { queryKeys } from '@/api/queryKeys';
import { fmtDateTime, toIsoDate } from '@/lib/date';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  Field,
  inputClass,
  Pagination,
  QueryState,
  Section,
  thClass,
} from '@/components/ui';

/**
 * 교정·안전검사 알림 화면. 유형만 다르고 구성이 같아 한 컴포넌트로 두고,
 * 계측기 화면과 안전검사 화면이 각자 자기 유형으로 불러 쓴다.
 *
 * 수신 이메일 목록은 서버가 유형을 구분하지 않아 두 화면이 같은 목록을 본다.
 * 팀·유형별 분리 발송은 백엔드 추가 개발 건이다.
 */
export default function AlertTab({ type }: { type: AlertType }) {
  const [mode, setMode] = useState<'subscribe' | 'unsubscribe' | null>(null);

  return (
    <div className="space-y-3">
      <SettingsSection type={type} />
      <EmailSection
        type={type}
        onSubscribe={() => setMode('subscribe')}
        onUnsubscribe={() => setMode('unsubscribe')}
      />
      <SendSection type={type} />
      <LogSection type={type} />
      {mode && <VerifyModal mode={mode} onClose={() => setMode(null)} />}
    </div>
  );
}

/** 유형별로 손대는 설정 키가 다르다 */
const settingsKey = (type: AlertType): keyof AlertSettings =>
  type === 'CALIBRATION' ? 'calibrationDaysBefore' : 'safetyDaysBefore';

/* ---------- 발송 시점 ---------- */

/** "60, 30, 7" 처럼 입력받아 정수 배열로. 0~365 범위 밖은 서버가 거른다 */
const parseDays = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);

const formatDays = (days: number[] | undefined): string => (days ?? []).join(', ');

function SettingsSection({ type }: { type: AlertType }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const key = settingsKey(type);

  const q = useQuery({
    queryKey: queryKeys.notifications.settings(),
    queryFn: () => notificationsApi.settings(),
  });

  // 자기 유형의 키만 보낸다. 다른 유형 설정은 건드리지 않는다
  const save = useMutation({
    mutationFn: () => notificationsApi.updateSettings({ [key]: parseDays(draft!) }),
    onSuccess: (r) => {
      toast.ok('발송 시점을 저장했습니다.');
      qc.setQueryData(queryKeys.notifications.settings(), r);
      setDraft(null);
    },
    onError: toast.fail,
  });

  const days = q.data?.[key];

  return (
    <Section
      title={`${ALERT_TYPE_LABEL[type]} 알림 발송 시점`}
      right={
        draft !== null ? (
          <>
            <button type="button" className={btnClass} onClick={() => setDraft(null)}>
              취소
            </button>
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              저장
            </button>
          </>
        ) : (
          <button
            type="button"
            className={btnClass}
            disabled={!q.data}
            onClick={() => setDraft(formatDays(days))}
          >
            수정
          </button>
        )
      }
    >
      <QueryState isPending={q.isPending} error={q.error} />
      {q.data && (
        <div className="px-3 py-3">
          <Field
            label={
              type === 'CALIBRATION'
                ? '차기 교정일 며칠 전에 보낼지'
                : '검사유효 만료일 며칠 전에 보낼지'
            }
            hint="0 = 당일. 여러 번 보내려면 쉼표로 구분 (예: 60, 30, 7)"
          >
            {draft !== null ? (
              <input
                className={`${inputClass} max-w-md`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="예: 60, 30, 7"
              />
            ) : (
              <div className="flex flex-wrap gap-1 py-1.5">
                {(days ?? []).length === 0 ? (
                  <Badge tone="warn">발송 안 함</Badge>
                ) : (
                  (days ?? []).map((d) => (
                    <Badge key={d} tone="accent">
                      {d === 0 ? '당일' : `${d}일 전`}
                    </Badge>
                  ))
                )}
              </div>
            )}
          </Field>
        </div>
      )}
    </Section>
  );
}

/* ---------- 수신 이메일 (교정·안전검사 공용) ---------- */

function EmailSection({
  type,
  onSubscribe,
  onUnsubscribe,
}: {
  type: AlertType;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');

  const q = useQuery({
    queryKey: queryKeys.notifications.emails(),
    queryFn: () => notificationsApi.emails(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.notifications.emails() });

  /** 등록 담당자가 관리팀 주소를 대신 넣는 경로. 인증 없이 바로 수신 상태가 된다 */
  const add = useMutation({
    mutationFn: () => notificationsApi.addEmail(draft.trim()),
    onSuccess: (e) => {
      toast.ok(`${e.email} 등록했습니다.`);
      setDraft('');
      invalidate();
    },
    onError: toast.fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => notificationsApi.removeEmail(id),
    onSuccess: () => {
      toast.ok('수신 목록에서 제거했습니다.');
      invalidate();
    },
    onError: toast.fail,
  });

  const other = type === 'CALIBRATION' ? '안전검사' : '교정';

  return (
    <Section
      title="알림 수신 이메일"
      right={
        <>
          <input
            type="email"
            className={`${inputClass} w-56`}
            placeholder="name@dvi-ind.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && draft.trim() && add.mutate()}
          />
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={add.isPending || draft.trim() === ''}
            onClick={() => add.mutate()}
          >
            바로 등록
          </button>
          <button type="button" className={btnClass} onClick={onSubscribe}>
            본인 인증 등록
          </button>
          <button type="button" className={btnClass} onClick={onUnsubscribe}>
            본인 인증 해지
          </button>
        </>
      }
    >
      <p className="border-b border-line bg-warn/10 px-3 py-2 text-[18px] text-warn">
        이 목록은 <b>{other} 알림과 함께 쓰는 공용 목록</b>입니다. 여기 등록된 주소는 {other} 알림도
        같이 받습니다. 팀별·유형별로 나눠 보내는 기능은 아직 서버에 없습니다.
      </p>
      <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">
        <b className="text-fg-sub">바로 등록</b>은 등록 담당자가 관리팀 주소를 대신 넣는 경로로,
        인증 없이 즉시 수신 상태가 됩니다. <b className="text-fg-sub">본인 인증 등록</b>은 주소
        소유자가 직접 하는 방식이며 6자리 코드가 메일로 갑니다(10분 유효·1회용, 5회 오답 시 폐기,
        같은 주소 60초 내 재요청 거절). 인증을 마친 주소에만 알림이 발송됩니다.
      </p>
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={(q.data ?? []).length === 0}
        emptyText="등록된 수신 이메일이 없습니다. 지금은 알림이 아무에게도 가지 않습니다."
      />
      {(q.data ?? []).length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>이메일</th>
              <th className={thClass}>상태</th>
              <th className={thClass}>인증 완료</th>
              <th className={thClass}>등록일</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((e) => (
              <tr key={e.id} className="border-b border-line">
                <td className="px-3 py-2">{e.email}</td>
                <td className="px-3 py-2">
                  {e.status === 'VERIFIED' ? (
                    <Badge tone="accent">{e.statusLabel}</Badge>
                  ) : (
                    <Badge tone="warn">{e.statusLabel}</Badge>
                  )}
                </td>
                <td className="px-3 py-2">{fmtDateTime(e.verifiedAt)}</td>
                <td className="px-3 py-2">{fmtDateTime(e.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="whitespace-nowrap text-[18px] text-danger hover:underline"
                    onClick={() => {
                      if (
                        window.confirm(
                          `${e.email} 을 수신 목록에서 제거합니다. 교정·안전검사 알림이 모두 끊깁니다.`,
                        )
                      )
                        remove.mutate(e.id);
                    }}
                  >
                    제거
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/** 등록·해지 공용 2단계 모달 */
function VerifyModal({
  mode,
  onClose,
}: {
  mode: 'subscribe' | 'unsubscribe';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const subscribing = mode === 'subscribe';

  const sendCode = useMutation({
    mutationFn: () =>
      subscribing
        ? notificationsApi.subscribeRequest(email.trim())
        : notificationsApi.unsubscribeRequest(email.trim()),
    onSuccess: (r) => {
      setExpiresAt(r.expiresAt);
      toast.ok('인증코드를 보냈습니다. 메일함을 확인하세요.');
    },
    onError: toast.fail,
  });

  const verify = useMutation({
    mutationFn: () =>
      subscribing
        ? notificationsApi.subscribeVerify(email.trim(), code.trim()).then(() => undefined)
        : notificationsApi.unsubscribeVerify(email.trim(), code.trim()),
    onSuccess: () => {
      toast.ok(subscribing ? '수신 등록을 마쳤습니다.' : '수신을 해지했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={subscribing ? '알림 수신 등록' : '알림 수신 해지'}
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
            disabled={verify.isPending || !expiresAt || code.trim().length < 6}
            onClick={() => verify.mutate()}
          >
            {subscribing ? '등록 확정' : '해지 확정'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="이메일" required>
          <div className="flex gap-2">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@dvi-ind.com"
            />
            <button
              type="button"
              className={btnClass}
              style={{ whiteSpace: 'nowrap' }}
              disabled={sendCode.isPending || email.trim() === ''}
              onClick={() => sendCode.mutate()}
            >
              {expiresAt ? '재발송' : '코드 발송'}
            </button>
          </div>
        </Field>
        <Field
          label="인증코드 (6자리)"
          required
          hint={expiresAt ? `만료 ${fmtDateTime(expiresAt)}` : '먼저 코드를 발송하세요.'}
        >
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            maxLength={6}
            disabled={!expiresAt}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------- 수동 발송 ---------- */

function SendSection({ type }: { type: AlertType }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [baseDate, setBaseDate] = useState(toIsoDate(new Date()));
  const label = ALERT_TYPE_LABEL[type];

  const send = useMutation({
    mutationFn: () =>
      type === 'CALIBRATION'
        ? notificationsApi.sendCalibrationAlert(baseDate)
        : notificationsApi.sendSafetyAlert(baseDate),
    onSuccess: (r) => {
      const skipped = r.skippedCount > 0 ? ` / 당일 중복 ${r.skippedCount} 건너뜀` : '';
      toast.ok(
        `${label} 알림 — 대상 ${r.targetCount} / 성공 ${r.sentCount} / 실패 ${r.failedCount}${skipped}`,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: toast.fail,
  });

  return (
    <Section title="수동 발송">
      <div className="flex flex-wrap items-end gap-3 px-3 py-3">
        <label className="block">
          <span className="mb-0.5 block text-[18px] text-fg-sub">기준일</span>
          <input
            type="date"
            className={`${inputClass} w-40`}
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={btnPrimaryClass}
          disabled={send.isPending}
          onClick={() => {
            if (
              window.confirm(
                `${baseDate} 기준으로 ${label} 알림 메일을 실제로 발송합니다. 같은 대상에 오늘 이미 발송됐다면 서버가 건너뜁니다. 진행할까요?`,
              )
            )
              send.mutate();
          }}
        >
          {label} 알림 발송
        </button>
        <span className="pb-1 text-[18px] text-fg-muted">
          기준일에서 역산해 대상을 다시 계산하고, 인증 완료된 수신자에게 메일을 보냅니다. 같은
          대상에 당일 발송 이력이 있으면 서버가 건너뜁니다.
        </span>
      </div>
    </Section>
  );
}

/* ---------- 발송 이력 ---------- */

/**
 * 서버 /notification/log 에 유형 필터가 없어 한 번에 받아 화면에서 거른다.
 * 보관 기간이 30일이라 넘칠 일이 거의 없고, 넘치면 위에 경고를 띄운다.
 */
const LOG_FETCH = 500;

function LogSection({ type }: { type: AlertType }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  const q = useQuery({
    queryKey: queryKeys.notifications.logs({ page: 0, size: LOG_FETCH }),
    queryFn: () => notificationsApi.logs({ page: 0, size: LOG_FETCH }),
  });

  const rows = useMemo(
    () => (q.data?.items ?? []).filter((l) => l.alertType === type),
    [q.data, type],
  );
  const totalPages = Math.ceil(rows.length / size);
  const pageRows = rows.slice(page * size, (page + 1) * size);
  const truncated = (q.data?.total ?? 0) > LOG_FETCH;

  return (
    <Section
      title={`${ALERT_TYPE_LABEL[type]} 발송 이력`}
      right={<span className="text-[18px] text-fg-muted">30일 보관</span>}
    >
      {truncated && (
        <p className="border-b border-line bg-warn/10 px-3 py-2 text-[18px] text-warn">
          이력이 {LOG_FETCH}건을 넘어 최근 {LOG_FETCH}건만 보고 있습니다.
        </p>
      )}
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText="발송 이력이 없습니다."
      />
      {rows.length > 0 && (
        <>
          <table className="w-max min-w-full text-[19px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={thClass}>발송 일시</th>
                <th className={thClass}>대상</th>
                <th className={thClass}>수신자</th>
                <th className={thClass}>결과</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="px-3 py-2">{fmtDateTime(l.sentAt)}</td>
                  <td className="px-3 py-2 text-fg-sub">
                    {l.instrumentId
                      ? `계측기 #${l.instrumentId}`
                      : l.safetyEquipmentId
                        ? `안전검사 대상 #${l.safetyEquipmentId}`
                        : '-'}
                  </td>
                  <td className="px-3 py-2">{l.recipientEmail}</td>
                  <td className="px-3 py-2">
                    {l.success ? <Badge tone="accent">성공</Badge> : <Badge tone="danger">실패</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={rows.length}
            size={size}
            onChange={setPage}
            onSizeChange={(s) => {
              setSize(s);
              setPage(0);
            }}
          />
        </>
      )}
    </Section>
  );
}
