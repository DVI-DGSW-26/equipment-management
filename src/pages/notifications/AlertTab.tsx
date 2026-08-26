import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  notificationsApi,
  ALERT_TYPE_LABEL,
  type AlertSettings,
  type AlertType,
  type EmailPreferences,
  type NotificationEmail,
} from '@/api/notifications';
import { inspectionsApi } from '@/api/inspections';
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
 * 수신 이메일은 주소 하나가 alertTypes 로 받을 유형을, teams 로 담당반을 가진다.
 * 목록 자체는 하나라서 두 화면이 같은 목록을 보되, 기본은 자기 유형 수신자만 보여준다.
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
      {mode && <VerifyModal mode={mode} type={type} onClose={() => setMode(null)} />}
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
            hint="0 = 당일. 여러 번 보내려면 쉼표로 구분 (예: 60, 30, 7). 같은 날 여러 시점이 겹쳐도 메일은 한 통으로 합쳐집니다"
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

/* ---------- 수신 이메일 ---------- */

/** 담당반 선택지는 안전검사 대상에 실제로 등록된 값에서 뽑는다. 담당반 마스터 API 는 아직 없다 */
function useTeamOptions(): string[] {
  const q = useQuery({
    queryKey: queryKeys.inspections.list({}),
    queryFn: () => inspectionsApi.list({}),
    staleTime: 10 * 60_000,
  });
  return useMemo(
    () => [...new Set((q.data ?? []).map((e) => e.team).filter((t): t is string => !!t))].sort(),
    [q.data],
  );
}

const typeText = (types: AlertType[]): string =>
  types.length === 0 ? '-' : types.map((t) => ALERT_TYPE_LABEL[t]).join(' · ');

/**
 * 담당반을 지정하면 교정 알림을 한 통도 못 받는다.
 *
 * 계측기에는 담당반 항목이 없어 서버가 모든 계측기를 "담당반 없음" 으로 본다.
 * 발송 규칙상 담당반이 없는 대상은 teams 가 빈 수신자에게만 가므로,
 * 담당반을 지정한 주소는 교정 대상 매칭에서 통째로 빠진다.
 * 계측기에 담당반 필드가 생기면(백엔드 03) 저절로 풀린다.
 */
const calibrationBlocked = (e: { alertTypes: AlertType[]; teams: string[] }): boolean =>
  e.alertTypes.includes('CALIBRATION') && e.teams.length > 0;

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
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<NotificationEmail | null>(null);
  const teamOptions = useTeamOptions();

  const q = useQuery({
    queryKey: queryKeys.notifications.emails(),
    queryFn: () => notificationsApi.emails(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.notifications.emails() });

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = useMemo(
    () => (showAll ? all : all.filter((e) => e.alertTypes.includes(type))),
    [all, showAll, type],
  );
  const hidden = all.length - rows.length;

  /**
   * 등록 담당자가 관리팀 주소를 대신 넣는 경로. 인증 없이 바로 수신 상태가 된다.
   * 이 화면에서 넣었으면 이 화면의 알림을 받으라는 뜻이라, 자기 유형으로 등록한다.
   */
  const add = useMutation({
    mutationFn: () => notificationsApi.addEmail(draft.trim(), { alertTypes: [type] }),
    onSuccess: (e) => {
      toast.ok(`${e.email} 등록했습니다. ${ALERT_TYPE_LABEL[type]} 알림을 받습니다.`);
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
      title={
        <>
          {ALERT_TYPE_LABEL[type]} 알림 수신자{' '}
          <span className="font-normal text-fg-muted">{rows.length}명</span>
        </>
      }
      right={
        <>
          <label className="flex items-center gap-2 whitespace-nowrap text-[18px] text-fg-sub">
            <input type="checkbox" checked={showAll} onChange={() => setShowAll(!showAll)} />
            다른 유형까지 보기
            {hidden > 0 && !showAll && <span className="text-fg-muted">({hidden}명 숨김)</span>}
          </label>
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
      {type === 'CALIBRATION' && (
        <p className="border-b border-line bg-danger/10 px-3 py-2 text-[18px] text-danger">
          <b>담당반을 지정한 주소는 교정 알림을 받지 못합니다.</b> 계측기에는 담당반 항목이
          아직 없어서, 서버가 모든 계측기를 &ldquo;담당반 없음&rdquo;으로 봅니다. 담당반이 비어
          있는 대상은 담당반을 비워 둔 사람에게만 발송되므로, 담당반을 지정하면 교정 알림
          대상에서 통째로 빠집니다.
          교정 알림을 받아야 하는 사람은 <b>담당반을 비워 두세요.</b>
        </p>
      )}
      <p className="border-b border-line px-3 py-2 text-[18px] text-fg-muted">
        <b className="text-fg-sub">바로 등록</b>은 등록 담당자가 관리팀 주소를 대신 넣는 경로로,
        인증 없이 즉시 수신 상태가 됩니다. <b className="text-fg-sub">본인 인증 등록</b>은 주소
        소유자가 직접 하는 방식이며 6자리 코드가 메일로 갑니다(10분 유효·1회용, 5회 오답 시 폐기,
        같은 주소 60초 내 재요청 거절). 인증을 마친 주소에만 알림이 발송됩니다. 이 화면에서 넣은
        주소는 <b className="text-fg-sub">{ALERT_TYPE_LABEL[type]} 알림</b>을 받도록 등록되며,
        받을 알림과 담당반은 등록 뒤 <b className="text-fg-sub">수정</b>에서 바꿀 수 있습니다.
      </p>
      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={
          all.length > 0
            ? `${ALERT_TYPE_LABEL[type]} 알림을 받는 사람이 없습니다. "다른 유형까지 보기" 로 ${all.length}명을 확인하거나 새로 등록하세요.`
            : '등록된 수신 이메일이 없습니다. 지금은 알림이 아무에게도 가지 않습니다.'
        }
      />
      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={thClass}>이메일</th>
              <th className={thClass}>받는 알림</th>
              <th className={thClass}>담당반</th>
              <th className={thClass}>상태</th>
              <th className={thClass}>인증 완료</th>
              <th className={thClass}>등록일</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-line">
                <td className="px-3 py-2">{e.email}</td>
                <td className="whitespace-nowrap px-3 py-2 text-fg-sub">
                  {typeText(e.alertTypes)}
                </td>
                <td className="px-3 py-2 text-fg-sub">
                  {e.teams.length === 0 ? (
                    <span className="text-fg-muted">전체</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      {e.teams.join(', ')}
                      {calibrationBlocked(e) && (
                        <Badge
                          tone="danger"
                          title="계측기에 담당반 항목이 없어, 담당반을 지정한 주소는 교정 알림 대상에서 빠집니다"
                        >
                          교정 미수신
                        </Badge>
                      )}
                    </span>
                  )}
                </td>
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
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="whitespace-nowrap text-[18px] text-accent hover:underline"
                      onClick={() => setEditing(e)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="whitespace-nowrap text-[18px] text-danger hover:underline"
                      onClick={() => {
                        if (
                          window.confirm(
                            `${e.email} 을 수신 목록에서 제거합니다. 받고 있던 알림이 모두 끊깁니다.`,
                          )
                        )
                          remove.mutate(e.id);
                      }}
                    >
                      제거
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <PreferencesModal
          email={editing}
          teamOptions={teamOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

/** 주소 하나의 받을 알림 유형·담당반을 고친다 */
function PreferencesModal({
  email,
  teamOptions,
  onClose,
}: {
  email: NotificationEmail;
  teamOptions: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [alertTypes, setAlertTypes] = useState<AlertType[]>(email.alertTypes);
  const [teams, setTeams] = useState<string[]>(email.teams);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const save = useMutation({
    mutationFn: (): Promise<NotificationEmail> =>
      notificationsApi.updatePreferences(email.id, { alertTypes, teams } satisfies EmailPreferences),
    onSuccess: () => {
      toast.ok('수신 조건을 저장했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.emails() });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={`${email.email} 수신 조건`}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || alertTypes.length === 0}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label="받을 알림"
          required
          error={alertTypes.length === 0 ? '최소 한 가지는 골라야 합니다.' : undefined}
        >
          <div className="flex flex-wrap gap-4 py-1.5">
            {(['CALIBRATION', 'SAFETY'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-[19px]">
                <input
                  type="checkbox"
                  checked={alertTypes.includes(t)}
                  onChange={() => setAlertTypes(toggle(alertTypes, t))}
                />
                {ALERT_TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </Field>

        {calibrationBlocked({ alertTypes, teams }) && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-[18px] text-danger">
            <b>이대로 저장하면 교정 알림은 한 통도 가지 않습니다.</b> 계측기에 담당반 항목이 없어,
            담당반을 지정한 주소는 교정 대상에서 빠집니다. 교정 알림도 받아야 하면 담당반을 모두
            해제하세요.
          </p>
        )}

        <Field
          label="담당반"
          hint={
            teamOptions.length === 0
              ? '안전검사 대상에 등록된 담당반이 없어 고를 값이 없습니다.'
              : '아무것도 고르지 않으면 담당반과 상관없이 전부 받습니다. 안전검사 알림에만 적용됩니다.'
          }
        >
          <div className="flex flex-wrap gap-4 py-1.5">
            {teamOptions.map((t) => (
              <label key={t} className="flex items-center gap-2 text-[19px]">
                <input
                  type="checkbox"
                  checked={teams.includes(t)}
                  onChange={() => setTeams(toggle(teams, t))}
                />
                {t}
              </label>
            ))}
            {teams.length === 0 && <span className="text-[18px] text-fg-muted">전체 담당반 수신</span>}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/** 등록·해지 공용 2단계 모달 */
function VerifyModal({
  mode,
  type,
  onClose,
}: {
  mode: 'subscribe' | 'unsubscribe';
  /** 이 화면에서 등록했으면 이 유형을 받겠다는 뜻이라 확정 시 같이 보낸다 */
  type: AlertType;
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
        ? notificationsApi.subscribeVerify(email.trim(), code.trim(), [type]).then(() => undefined)
        : notificationsApi.unsubscribeVerify(email.trim(), code.trim()),
    onSuccess: () => {
      toast.ok(
        subscribing
          ? `수신 등록을 마쳤습니다. ${ALERT_TYPE_LABEL[type]} 알림을 받습니다.`
          : '수신을 해지했습니다.',
      );
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
          기준일에서 역산해 대상을 다시 계산하고, 인증 완료된 수신자에게 메일을 보냅니다. 한 사람이
          하루에 받는 메일은 한 통입니다 — 여러 시점이 같은 날 겹치면 한 통에 모아 보내고, 당일
          발송 이력이 있는 대상은 건너뜁니다.
        </span>
      </div>
    </Section>
  );
}

/* ---------- 발송 이력 ---------- */

function LogSection({ type }: { type: AlertType }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [team, setTeam] = useState('');
  const teamOptions = useTeamOptions();

  // 유형·담당반 모두 서버가 걸러 준다. 담당반 필터는 안전검사에만 의미가 있다
  const query = useMemo(
    () => ({ page, size, alertType: type, team: team || undefined }),
    [page, size, type, team],
  );

  const q = useQuery({
    queryKey: queryKeys.notifications.logs(query),
    queryFn: () => notificationsApi.logs(query),
  });

  const rows = q.data?.items ?? [];

  return (
    <Section
      title={`${ALERT_TYPE_LABEL[type]} 발송 이력`}
      right={
        <>
          {type === 'SAFETY' && teamOptions.length > 0 && (
            <select
              className={`${inputClass} w-36`}
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setPage(0);
              }}
            >
              <option value="">담당반 전체</option>
              {teamOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <span className="text-[18px] text-fg-muted">30일 보관</span>
        </>
      }
    >
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
              {rows.map((l) => (
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
