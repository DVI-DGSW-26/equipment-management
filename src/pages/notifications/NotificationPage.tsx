import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, ALERT_TYPE_LABEL, type AlertType } from '@/api/notifications';
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

export default function NotificationPage() {
  const [mode, setMode] = useState<'subscribe' | 'unsubscribe' | null>(null);

  return (
    <div className="space-y-3">
      <h1 className="text-[24px] font-semibold">알림</h1>
      <SettingsSection />
      <EmailSection
        onSubscribe={() => setMode('subscribe')}
        onUnsubscribe={() => setMode('unsubscribe')}
      />
      <SendSection />
      <LogSection />
      {mode && <VerifyModal mode={mode} onClose={() => setMode(null)} />}
    </div>
  );
}

/* ---------- 발송 시점 설정 ---------- */

/** "60, 30, 7" 처럼 입력받아 정수 배열로. 0~365 범위 밖은 서버가 거른다 */
const parseDays = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);

const formatDays = (days: number[] | undefined): string => (days ?? []).join(', ');

function SettingsSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<{ calibration: string; safety: string } | null>(null);

  const q = useQuery({
    queryKey: queryKeys.notifications.settings(),
    queryFn: () => notificationsApi.settings(),
  });

  const save = useMutation({
    mutationFn: () =>
      notificationsApi.updateSettings({
        calibrationDaysBefore: parseDays(draft!.calibration),
        safetyDaysBefore: parseDays(draft!.safety),
      }),
    onSuccess: (r) => {
      toast.ok('발송 시점을 저장했습니다.');
      qc.setQueryData(queryKeys.notifications.settings(), r);
      setDraft(null);
    },
    onError: toast.fail,
  });

  const startEdit = () =>
    setDraft({
      calibration: formatDays(q.data?.calibrationDaysBefore),
      safety: formatDays(q.data?.safetyDaysBefore),
    });

  return (
    <Section
      title="발송 시점"
      right={
        draft ? (
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
          <button type="button" className={btnClass} disabled={!q.data} onClick={startEdit}>
            수정
          </button>
        )
      }
    >
      <QueryState isPending={q.isPending} error={q.error} />
      {q.data && (
        <div className="grid grid-cols-2 gap-3 px-3 py-3">
          <Field
            label="교정 알림"
            hint="차기 교정일 며칠 전에 보낼지. 0 = 당일. 쉼표로 구분"
          >
            {draft ? (
              <input
                className={inputClass}
                value={draft.calibration}
                onChange={(e) => setDraft({ ...draft, calibration: e.target.value })}
                placeholder="예: 30, 7, 0"
              />
            ) : (
              <div className="flex flex-wrap gap-1 py-1.5">
                {q.data.calibrationDaysBefore.length === 0 ? (
                  <Badge tone="warn">발송 안 함</Badge>
                ) : (
                  q.data.calibrationDaysBefore.map((d) => (
                    <Badge key={d} tone="accent">
                      {d === 0 ? '당일' : `${d}일 전`}
                    </Badge>
                  ))
                )}
              </div>
            )}
          </Field>
          <Field label="안전검사 알림" hint="검사유효 만료일 며칠 전에 보낼지. 쉼표로 구분">
            {draft ? (
              <input
                className={inputClass}
                value={draft.safety}
                onChange={(e) => setDraft({ ...draft, safety: e.target.value })}
                placeholder="예: 60, 30, 7"
              />
            ) : (
              <div className="flex flex-wrap gap-1 py-1.5">
                {q.data.safetyDaysBefore.length === 0 ? (
                  <Badge tone="warn">발송 안 함</Badge>
                ) : (
                  q.data.safetyDaysBefore.map((d) => (
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
      <p className="border-t border-line px-3 py-2 text-[18px] text-fg-muted">
        매일 배치가 이 시점에 맞춰 자동 발송합니다 (교정 09:00, 안전검사 09:05). 0~365 범위의
        정수만 저장됩니다.
      </p>
    </Section>
  );
}

/* ---------- 수신 이메일 ---------- */

function EmailSection({
  onSubscribe,
  onUnsubscribe,
}: {
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

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: queryKeys.notifications.emails() });

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
        <table className="w-full text-[19px]">
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
                      if (window.confirm(`${e.email} 을 수신 목록에서 제거합니다.`))
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

function SendSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const [baseDate, setBaseDate] = useState(toIsoDate(new Date()));

  const send = useMutation({
    mutationFn: (type: AlertType) =>
      type === 'CALIBRATION'
        ? notificationsApi.sendCalibrationAlert(baseDate)
        : notificationsApi.sendSafetyAlert(baseDate),
    onSuccess: (r, type) => {
      const skipped = r.skippedCount > 0 ? ` / 당일 중복 ${r.skippedCount} 건너뜀` : '';
      toast.ok(
        `${ALERT_TYPE_LABEL[type]} 알림 — 대상 ${r.targetCount} / 성공 ${r.sentCount} / 실패 ${r.failedCount}${skipped}`,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: toast.fail,
  });

  const confirmSend = (type: AlertType) => {
    if (
      window.confirm(
        `${baseDate} 기준으로 ${ALERT_TYPE_LABEL[type]} 알림 메일을 실제로 발송합니다.
같은 대상에 오늘 이미 발송됐다면 서버가 건너뜁니다. 진행할까요?`,
      )
    )
      send.mutate(type);
  };

  return (
    <Section title="수동 발송">
      <div className="flex items-end gap-3 px-3 py-3">
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
          onClick={() => confirmSend('CALIBRATION')}
        >
          교정 알림 발송
        </button>
        <button
          type="button"
          className={btnPrimaryClass}
          disabled={send.isPending}
          onClick={() => confirmSend('SAFETY')}
        >
          안전검사 알림 발송
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

function LogSection() {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const query = useMemo(() => ({ page, size }), [page, size]);

  const q = useQuery({
    queryKey: queryKeys.notifications.logs(query),
    queryFn: () => notificationsApi.logs(query),
  });

  const rows = q.data?.items ?? [];

  return (
    <Section title="발송 이력" right={<span className="text-[18px] text-fg-muted">30일 보관</span>}>
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText="발송 이력이 없습니다."
      />
      {rows.length > 0 && (
        <>
          <table className="w-full text-[19px]">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-fg-sub">
                <th className={thClass}>발송 일시</th>
                <th className={thClass}>구분</th>
                <th className={thClass}>대상</th>
                <th className={thClass}>수신자</th>
                <th className={thClass}>결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="px-3 py-2">{fmtDateTime(l.sentAt)}</td>
                  <td className="px-3 py-2">{ALERT_TYPE_LABEL[l.alertType]}</td>
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
            page={q.data?.page ?? 0}
            totalPages={q.data?.totalPages ?? 0}
            total={q.data?.total ?? 0}
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
