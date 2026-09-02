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
import { instrumentsApi } from '@/api/instruments';
import { queryKeys } from '@/api/queryKeys';
import { ApiError } from '@/api/types';
import { useDepartments } from '@/hooks/useMasters';
import { fmtDateTime, toIsoDate } from '@/lib/date';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { rowNo } from '@/lib/paging';
import {
  Badge,
  btnClass,
  btnPrimaryClass,
  Field,
  inputClass,
  Pagination,
  QueryState,
  SearchBox,
  Section,
  seqThClass,
  thClass,
} from '@/components/ui';
import { searchIn } from '@/lib/search';

/**
 * 교정·안전검사 알림 화면. 유형만 다르고 구성이 같아 한 컴포넌트로 두고,
 * 계측기 화면과 안전검사 화면이 각자 자기 유형으로 불러 쓴다.
 *
 * "언제 보내나" 와 "누구에게 보내나" 는 따로 볼 일이 없어 한 상자에 담는다.
 * 수신 이메일은 주소 하나가 alertTypes 로 받을 유형을, teams 로 담당반을 가진다.
 * 목록 자체는 하나라서 두 화면이 같은 목록을 보되, 기본은 자기 유형 수신자만 보여준다.
 */
export default function AlertTab({ type }: { type: AlertType }) {
  const [sending, setSending] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);

  return (
    <div className="space-y-3">
      <Section
        title={`${ALERT_TYPE_LABEL[type]} 알림`}
        right={
          <>
            <button type="button" className={btnClass} onClick={() => setUnsubscribing(true)}>
              본인 인증 해지
            </button>
            <button type="button" className={btnClass} onClick={() => setSending(true)}>
              수동 발송
            </button>
          </>
        }
      >
        <ScheduleRow type={type} />
        <RecipientBlock type={type} />
      </Section>

      <LogSection type={type} />

      {sending && <SendModal type={type} onClose={() => setSending(false)} />}
      {unsubscribing && <UnsubscribeModal onClose={() => setUnsubscribing(false)} />}
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

function ScheduleRow({ type }: { type: AlertType }) {
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
  const basis = type === 'CALIBRATION' ? '차기 교정일' : '검사유효 만료일';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
      <span className="text-[18px] text-fg-sub">발송 시점</span>

      {q.isPending && <span className="text-[18px] text-fg-muted">불러오는 중…</span>}

      {draft !== null ? (
        <>
          <input
            className={`${inputClass} w-52`}
            value={draft}
            placeholder="예: 60, 30, 7"
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className="text-[18px] text-fg-muted">{basis} 기준. 쉼표로 구분, 0 = 당일</span>
          <div className="ml-auto flex gap-2">
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
          </div>
        </>
      ) : (
        q.data && (
          <>
            {(days ?? []).length === 0 ? (
              <Badge tone="warn">발송 안 함</Badge>
            ) : (
              (days ?? []).map((d) => (
                <Badge key={d} tone="accent">
                  {d === 0 ? '당일' : `${d}일 전`}
                </Badge>
              ))
            )}
            <span className="text-[18px] text-fg-muted">{basis} 기준 · 매일 아침 자동 발송</span>
            <button
              type="button"
              className={`${btnClass} ml-auto`}
              onClick={() => setDraft((days ?? []).join(', '))}
            >
              수정
            </button>
          </>
        )
      )}
    </div>
  );
}

/* ---------- 수신자 ---------- */

/**
 * 부서 고르기. 부서 마스터(마스터 화면의 "부서")에 등록된 값에서 고른다 —
 * 손으로 적으면 "압출"·"압출반"·"EX압출" 이 섞여 부서로 묶어 볼 수 없다.
 *
 * 마스터에 없는 값이 이미 저장돼 있으면 그 값도 목록에 얹는다.
 * 그러지 않으면 고치려고 열었다가 저장만 눌러도 남의 부서가 조용히 지워진다.
 */
function DepartmentPicker({
  value,
  onChange,
  className = 'w-36',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const departments = useDepartments();
  const names = (departments.data ?? []).map((d) => d.name);
  const options = value && !names.includes(value) ? [value, ...names] : names;

  return (
    <select
      className={`${inputClass} ${className}`}
      value={value}
      aria-label="부서"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">부서 미지정</option>
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

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

function RecipientBlock({ type }: { type: AlertType }) {
  const qc = useQueryClient();
  const toast = useToast();
  /** 빠른 등록칸. 이메일만 필수고 이름·부서는 나중에 채워도 된다 */
  const [draft, setDraft] = useState({ email: '', name: '', department: '' });
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<NotificationEmail | null>(null);

  const setDraftField = (k: keyof typeof draft, v: string) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const q = useQuery({
    queryKey: queryKeys.notifications.emails(),
    queryFn: () => notificationsApi.emails(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.notifications.emails() });

  // 이 화면은 자기 유형만 책임진다. 다른 유형 수신자는 그 화면에서 관리한다
  const all = useMemo(
    () => (q.data ?? []).filter((e) => e.alertTypes.includes(type)),
    [q.data, type],
  );
  const rows = useMemo(() => {
    const hit = searchIn(keyword);
    return all.filter((e) => hit(e.email, e.name, e.department, e.statusLabel, ...e.teams));
  }, [all, keyword]);
  const other: AlertType = type === 'CALIBRATION' ? 'SAFETY' : 'CALIBRATION';

  /**
   * 주소를 넣으면 이 화면의 알림을 받게 된다. 인증 절차는 없다.
   *
   * 다른 화면에서 이미 등록한 주소면 서버가 409 를 준다. 그때는 등록 대신
   * 그 주소에 이 유형만 더해 준다. 쓰는 사람은 "이미 있다" 를 알 필요가 없다.
   */
  const add = useMutation({
    mutationFn: async (): Promise<{ email: string; already: boolean }> => {
      const email = draft.email.trim();
      /* 비운 칸은 아예 보내지 않는다. 빈 문자열은 "지우기" 라는 뜻이라 등록에는 맞지 않는다 */
      const who = {
        name: draft.name.trim() || undefined,
        department: draft.department.trim() || undefined,
      };
      try {
        const created = await notificationsApi.addEmail(email, { alertTypes: [type], ...who });
        return { email: created.email, already: false };
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err;
        const found = (await notificationsApi.emails()).find(
          (e) => e.email.toLowerCase() === email.toLowerCase(),
        );
        if (!found) throw err;
        /* 이미 있는 주소면 이 유형을 더해 주고, 비어 있던 이름·부서만 채운다 */
        const fill = {
          name: found.name ? undefined : who.name,
          department: found.department ? undefined : who.department,
        };
        if (found.alertTypes.includes(type) && !fill.name && !fill.department)
          return { email: found.email, already: true };
        await notificationsApi.updatePreferences(found.id, {
          alertTypes: [...new Set([...found.alertTypes, type])],
          ...fill,
        });
        return { email: found.email, already: found.alertTypes.includes(type) };
      }
    },
    onSuccess: ({ email, already }) => {
      toast.ok(
        already
          ? `${email} 은 이미 ${ALERT_TYPE_LABEL[type]} 알림을 받고 있습니다.`
          : `${email} 등록했습니다.`,
      );
      setDraft({ email: '', name: '', department: '' });
      invalidate();
    },
    onError: toast.fail,
  });

  /** 다른 알림도 받는 주소면 이 유형만 뺀다. 아니면 목록에서 지운다 */
  const remove = useMutation({
    mutationFn: (e: NotificationEmail) => {
      const rest = e.alertTypes.filter((t) => t !== type);
      return rest.length > 0
        ? notificationsApi.updatePreferences(e.id, { alertTypes: rest }).then(() => undefined)
        : notificationsApi.removeEmail(e.id);
    },
    onSuccess: () => {
      toast.ok(`${ALERT_TYPE_LABEL[type]} 알림 수신자에서 뺐습니다.`);
      invalidate();
    },
    onError: toast.fail,
  });

  /** 교정 화면에서 "교정 미수신" 을 그 자리에서 풀 수 있게 한다 */
  const clearTeams = useMutation({
    mutationFn: (e: NotificationEmail) => notificationsApi.updatePreferences(e.id, { teams: [] }),
    onSuccess: () => {
      toast.ok('담당반을 비웠습니다. 이제 교정 알림을 받습니다.');
      invalidate();
    },
    onError: toast.fail,
  });

  return (
    <>
      {/*
        찾는 칸과 넣는 칸을 줄로 갈라 놓는다.
        한 줄에 붙여 두니 맨 앞 검색칸이 등록 항목처럼 읽혔다.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <span className="text-[18px] text-fg-sub">
          수신자 <b className="text-fg">{rows.length}명</b>
          {rows.length !== all.length && ` / 전체 ${all.length}명`}
        </span>
        <div className="ml-auto">
          <SearchBox
            value={keyword}
            onChange={setKeyword}
            placeholder="이름·이메일로 찾기"
            width="w-56"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg/40 px-3 py-2">
        <span className="text-[18px] text-fg-sub">수신자 추가</span>
        <input
          type="email"
          className={`${inputClass} w-56`}
          placeholder="name@dvi-ind.com"
          aria-label="이메일"
          value={draft.email}
          onChange={(e) => setDraftField('email', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && draft.email.trim() && add.mutate()}
        />
        <input
          className={`${inputClass} w-28`}
          placeholder="이름"
          aria-label="이름"
          maxLength={50}
          value={draft.name}
          onChange={(e) => setDraftField('name', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && draft.email.trim() && add.mutate()}
        />
        <DepartmentPicker
          value={draft.department}
          onChange={(v) => setDraftField('department', v)}
        />
        <button
          type="button"
          className={btnPrimaryClass}
          disabled={add.isPending || draft.email.trim() === ''}
          title="이름·부서는 비워 두고 나중에 채워도 됩니다."
          onClick={() => add.mutate()}
        >
          등록
        </button>
        <span className="text-[18px] text-fg-muted">이메일만 넣어도 됩니다.</span>
      </div>

      <QueryState
        isPending={q.isPending}
        error={q.error}
        isEmpty={rows.length === 0}
        emptyText={
          keyword
            ? '검색 결과가 없습니다.'
            : `${ALERT_TYPE_LABEL[type]} 알림을 받는 사람이 없습니다. 위에 주소를 넣으면 바로 받습니다.`
        }
      />

      {rows.length > 0 && (
        <table className="w-max min-w-full text-[19px]">
          <thead>
            <tr className="border-b border-line bg-bg text-left text-fg-sub">
              <th className={seqThClass}>No.</th>
              <th className={thClass}>이름</th>
              <th className={thClass}>부서</th>
              <th className={thClass}>이메일</th>
              <th className={thClass}>{type === 'SAFETY' ? '담당반' : '수신 여부'}</th>
              <th className={thClass}>상태</th>
              <th className={thClass}>등록일</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((e, idx) => (
              <tr key={e.id} className="border-b border-line">
                <td className="num px-3 py-2 text-fg-muted">{rowNo(idx)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.name ?? <span className="text-fg-muted">-</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-fg-sub">
                  {e.department ?? <span className="text-fg-muted">-</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    {e.email}
                    {e.alertTypes.includes(other) && (
                      <Badge title={`${ALERT_TYPE_LABEL[other]} 화면에서도 관리됩니다`}>
                        {ALERT_TYPE_LABEL[other]}도 받음
                      </Badge>
                    )}
                  </span>
                </td>

                {type === 'SAFETY' ? (
                  <td className="px-3 py-2 text-fg-sub">
                    {e.teams.length === 0 ? (
                      <span className="text-fg-muted">전체</span>
                    ) : (
                      e.teams.join(', ')
                    )}
                  </td>
                ) : (
                  <td className="px-3 py-2">
                    {calibrationBlocked(e) ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone="danger">받지 못함</Badge>
                        <button
                          type="button"
                          className="whitespace-nowrap text-[18px] text-accent hover:underline"
                          disabled={clearTeams.isPending}
                          onClick={() => clearTeams.mutate(e)}
                          title={`담당반 ${e.teams.join(', ')} 이 지정돼 있어 교정 알림 대상에서 빠집니다`}
                        >
                          담당반 비우고 받기
                        </button>
                      </span>
                    ) : (
                      <span className="text-fg-muted">정상</span>
                    )}
                  </td>
                )}

                <td className="px-3 py-2">
                  {e.status === 'VERIFIED' ? (
                    <Badge tone="accent">{e.statusLabel}</Badge>
                  ) : (
                    <Badge tone="warn">{e.statusLabel}</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-fg-sub">
                  {fmtDateTime(e.createdAt)}
                </td>
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
                        const rest = e.alertTypes.filter((t) => t !== type);
                        const msg =
                          rest.length > 0
                            ? `${e.email} 을 ${ALERT_TYPE_LABEL[type]} 알림에서 뺍니다. ${ALERT_TYPE_LABEL[other]} 알림은 계속 받습니다.`
                            : `${e.email} 을 수신 목록에서 지웁니다. 받고 있던 알림이 모두 끊깁니다.`;
                        if (window.confirm(msg)) remove.mutate(e);
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

      {editing && <RecipientModal email={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/**
 * 담당반은 안전검사 대상에만 있는 값이라 여기서만 고친다.
 * 교정도 받는 주소면 담당반을 지정하는 순간 교정이 끊기므로 그 자리에서 경고한다.
 */
function RecipientModal({ email, onClose }: { email: NotificationEmail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [teams, setTeams] = useState<string[]>(email.teams);
  const [name, setName] = useState(email.name ?? '');
  const [department, setDepartment] = useState(email.department ?? '');
  const teamOptions = useTeamOptions();

  const save = useMutation({
    mutationFn: (): Promise<NotificationEmail> =>
      notificationsApi.updatePreferences(email.id, {
        teams,
        /* 비워서 저장하면 지운다는 뜻이다. 서버가 빈 문자열을 삭제로 받는다 */
        name: name.trim(),
        department: department.trim(),
      } satisfies EmailPreferences),
    onSuccess: () => {
      toast.ok('저장했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.emails() });
      onClose();
    },
    onError: toast.fail,
  });

  const breaksCalibration = calibrationBlocked({ alertTypes: email.alertTypes, teams });

  return (
    <Modal
      title={`${email.name ? `${email.name} · ` : ''}${email.email}`}
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
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="이름" hint="비우고 저장하면 지워집니다.">
            <input
              className={inputClass}
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="부서" hint="마스터 화면의 부서 목록에서 고릅니다.">
            <DepartmentPicker value={department} onChange={setDepartment} className="w-full" />
          </Field>
        </div>

        <h3 className="border-t border-line pt-3 text-[19px] font-semibold">담당반</h3>
        <p className="text-[18px] text-fg-sub">
          고른 담당반의 설비 알림만 받습니다. 아무것도 고르지 않으면 담당반과 상관없이 전부
          받습니다. 위 “부서”와는 별개로, 이쪽은 무엇을 받을지 고르는 조건입니다.
        </p>

        {breaksCalibration && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-[18px] text-danger">
            <b>이 주소는 교정 알림도 받고 있습니다.</b> 담당반을 지정하면 교정 알림이 끊깁니다.
            계측기에는 담당반 항목이 없기 때문입니다.
          </p>
        )}

        {teamOptions.length === 0 ? (
          <p className="text-[18px] text-fg-muted">
            안전검사 대상에 등록된 담당반이 없습니다. 대상 등록 화면에서 담당반을 먼저 지정하세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {teamOptions.map((t) => (
              <label key={t} className="flex items-center gap-2 text-[19px]">
                <input
                  type="checkbox"
                  checked={teams.includes(t)}
                  onChange={() =>
                    setTeams(teams.includes(t) ? teams.filter((x) => x !== t) : [...teams, t])
                  }
                />
                {t}
              </label>
            ))}
            {teams.length === 0 && <span className="text-[18px] text-fg-muted">전체 수신</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- 수동 발송 ---------- */

/**
 * 누르면 진짜 메일이 나간다. 몇 명에게 가는지 먼저 보여주고 확인받는다.
 * 평소에는 서버가 매일 아침 자동으로 보내므로 이 경로는 예비 수단이다.
 */
function SendModal({ type, onClose }: { type: AlertType; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [baseDate, setBaseDate] = useState(toIsoDate(new Date()));
  const label = ALERT_TYPE_LABEL[type];

  const emails = useQuery({
    queryKey: queryKeys.notifications.emails(),
    queryFn: () => notificationsApi.emails(),
  });
  const targets = (emails.data ?? []).filter(
    (e) => e.status === 'VERIFIED' && e.alertTypes.includes(type),
  );

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
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={`${label} 알림 수동 발송`}
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
            disabled={send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? '보내는 중…' : '지금 발송'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p
          className={
            targets.length === 0
              ? 'rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-[19px] text-warn'
              : 'rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-[19px] text-danger'
          }
        >
          {targets.length === 0 ? (
            '등록된 수신자가 없어 메일이 나가지 않습니다.'
          ) : (
            <>
              <b>{targets.length}명</b>에게 실제로 메일이 나갑니다.
            </>
          )}
        </p>

        <Field label="기준일" hint="이 날짜에서 역산해 대상을 다시 계산합니다">
          <input
            type="date"
            className={`${inputClass} w-48`}
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
          />
        </Field>

        <p className="text-[18px] text-fg-muted">
          평소에는 서버가 매일 아침 자동으로 보냅니다. 이 버튼은 급할 때 한 번 더 보내는 용도입니다.
          오늘 이미 받은 대상은 건너뛰고, 한 사람이 하루에 받는 메일은 한 통입니다.
        </p>
      </div>
    </Modal>
  );
}

/**
 * 주소 소유자가 스스로 수신을 끊는 2단계 경로.
 *
 * 등록은 관리 담당자가 대신 넣는 경로 하나만 둔다. 사내 인원이 소수라
 * 본인 인증 등록까지 두면 같은 일을 하는 길이 둘이 되어 오히려 헷갈린다.
 * 해지는 메일을 받은 사람이 관리자를 거치지 않고 끊을 수 있어야 해서 남긴다.
 */
function UnsubscribeModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const sendCode = useMutation({
    mutationFn: () => notificationsApi.unsubscribeRequest(email.trim()),
    onSuccess: (r) => {
      setExpiresAt(r.expiresAt);
      toast.ok('인증코드를 보냈습니다. 메일함을 확인하세요.');
    },
    onError: toast.fail,
  });

  const verify = useMutation({
    mutationFn: () => notificationsApi.unsubscribeVerify(email.trim(), code.trim()),
    onSuccess: () => {
      toast.ok('수신을 해지했습니다. 이 주소로는 더 이상 알림이 가지 않습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title="알림 수신 해지"
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
            해지 확정
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

/* ---------- 발송 이력 ---------- */

/** 계측기 목록 화면과 같은 조건으로 부른다 — 이미 받아 둔 것이 있으면 그대로 쓴다 */
const INSTRUMENT_ALL = { page: 0, size: 500 };

/**
 * 이름·부서·담당반은 보낼 당시 값이 이력에 박혀 온다.
 * 그 기능이 생기기 전에 남은 이력에는 값이 없어 빈칸으로 둔다.
 */
const OLD_LOG_NOTE = '이름·부서를 남기기 전에 발송된 이력입니다';

interface Target {
  /** 목록에서 찾았을 때의 이름. 못 찾았으면 빈 문자열 */
  name: string;
  /** 안전검사 대상만 담당반을 가진다. 계측기에는 담당반 항목이 없다 */
  team: string | null;
  /** 못 찾았을 때 대신 보여 줄 번호 */
  fallback: string;
}

/**
 * 이력에는 대상이 번호로만 남는다("안전검사 대상 #12").
 * 대상 목록을 받아 이름과 담당반을 이어 붙인다. 유형에 따라 한쪽만 부른다 —
 * 교정 이력을 보는데 안전검사 목록까지 받을 이유가 없다.
 */
function useTargets(type: AlertType) {
  const equipment = useQuery({
    queryKey: queryKeys.inspections.list({}),
    queryFn: () => inspectionsApi.list({}),
    staleTime: 10 * 60_000,
    enabled: type === 'SAFETY',
  });
  const instruments = useQuery({
    queryKey: queryKeys.instruments.list(INSTRUMENT_ALL),
    queryFn: () => instrumentsApi.list(INSTRUMENT_ALL),
    staleTime: 10 * 60_000,
    enabled: type === 'CALIBRATION',
  });

  return useMemo(() => {
    const byEquipment = new Map(
      (equipment.data ?? []).map((e) => [e.id, { name: e.name, team: e.team }]),
    );
    const byInstrument = new Map(
      (instruments.data?.items ?? []).map((i) => [i.id, `${i.mgmtNo} ${i.name}`]),
    );

    return (log: { instrumentId: number | null; safetyEquipmentId: number | null }): Target => {
      if (log.safetyEquipmentId != null) {
        const hit = byEquipment.get(log.safetyEquipmentId);
        return {
          name: hit?.name ?? '',
          team: hit?.team ?? null,
          fallback: `안전검사 대상 #${log.safetyEquipmentId}`,
        };
      }
      if (log.instrumentId != null) {
        return {
          name: byInstrument.get(log.instrumentId) ?? '',
          team: null,
          fallback: `계측기 #${log.instrumentId}`,
        };
      }
      return { name: '', team: null, fallback: '-' };
    };
  }, [equipment.data, instruments.data]);
}

function LogSection({ type }: { type: AlertType }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [team, setTeam] = useState('');
  const teamOptions = useTeamOptions();
  const targetOf = useTargets(type);

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
                <th className={seqThClass}>No.</th>
                <th className={thClass}>발송 일시</th>
                <th className={thClass}>{type === 'SAFETY' ? '대상 설비' : '대상 계측기'}</th>
                {type === 'SAFETY' && (
                  <th className={thClass} title="대상 설비에 지정된 담당반입니다">
                    대상 담당반
                  </th>
                )}
                <th className={thClass}>수신자</th>
                <th className={thClass}>부서</th>
                <th className={thClass}>이메일</th>
                <th className={thClass} title="보낼 당시 이 주소에 지정돼 있던 담당반입니다">
                  수신자 담당반
                </th>
                <th className={thClass}>결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, idx) => {
                const target = targetOf(l);
                return (
                  <tr key={l.id} className="border-b border-line">
                    <td className="num px-3 py-2 text-fg-muted">{rowNo(idx, page, size)}</td>
                    <td className="px-3 py-2">{fmtDateTime(l.sentAt)}</td>
                    <td className="px-3 py-2" title={target.fallback}>
                      {target.name || (
                        <span className="text-fg-muted" title="목록에서 지워진 대상입니다">
                          {target.fallback}
                        </span>
                      )}
                    </td>
                    {type === 'SAFETY' && (
                      <td className="px-3 py-2 text-fg-sub">{target.team ?? '-'}</td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.recipientName ?? <span className="text-fg-muted">-</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-fg-sub">
                      {l.recipientDepartment ?? <span className="text-fg-muted">-</span>}
                    </td>
                    <td className="px-3 py-2">{l.recipientEmail}</td>
                    <td className="px-3 py-2 text-fg-sub">
                      {l.recipientTeams == null ? (
                        <span className="text-fg-muted" title={OLD_LOG_NOTE}>
                          -
                        </span>
                      ) : l.recipientTeams.length > 0 ? (
                        l.recipientTeams.join(' · ')
                      ) : (
                        <span className="text-fg-muted" title="담당반과 무관하게 전부 받는 주소">
                          전체 수신
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {l.success ? (
                        <Badge tone="accent">성공</Badge>
                      ) : (
                        <Badge tone="danger">실패</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
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
