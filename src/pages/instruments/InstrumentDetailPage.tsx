import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instrumentsApi } from '@/api/instruments';
import {
  calibrationsApi,
  CALIBRATION_RESULT_LABEL,
  type Calibration,
  type CalibrationResult,
  type SaveCalibrationPayload,
} from '@/api/calibrations';
import { attachmentsApi, fileSizeText } from '@/api/attachments';
import AuthImage from '@/components/AuthImage';
import { isAgency } from '@/api/instrumentMasters';
import { queryKeys } from '@/api/queryKeys';
import { usePartners } from '@/hooks/useMasters';
import { saveFile } from '@/api/client';
import { currentYear, fmtDate, fmtDateTime } from '@/lib/date';
import { won } from '@/lib/won';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import InstrumentModal from './InstrumentModal';
import InstrumentCard from './InstrumentCard';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Def,
  Field,
  inputClass,
  QueryState,
  Section,
  Tabs,
  thClass,
} from '@/components/ui';

export default function InstrumentDetailPage() {
  const { id } = useParams();
  const instrumentId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  /*
   * 들어오면 관리 정보부터 보인다. 이력카드는 바로 옆 탭이라 한 번만 누르면 된다 —
   * 전에는 다른 화면으로 넘어가야 했다(목록 → 상세 → 이력카드).
   * 수정·교정 이력 등록·삭제는 탭 밖 머리줄에 있어 어느 탭에서든 한 번에 닿는다.
   */
  const [tab, setTab] = useState<'manage' | 'card'>('manage');
  const [editing, setEditing] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<Calibration | 'new' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: queryKeys.instruments.detail(instrumentId),
    queryFn: () => instrumentsApi.detail(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });
  const calibrations = useQuery({
    queryKey: queryKeys.calibrations.byInstrument(instrumentId),
    queryFn: () => calibrationsApi.byInstrument(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });
  const attachments = useQuery({
    queryKey: queryKeys.instruments.attachments(instrumentId),
    queryFn: () => attachmentsApi.byInstrument(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.instruments.all });
    void qc.invalidateQueries({ queryKey: queryKeys.calibrations.all });
  };

  const removeInstrument = useMutation({
    mutationFn: () => instrumentsApi.remove(instrumentId),
    onSuccess: () => {
      toast.ok('계측기를 삭제했습니다.');
      invalidateAll();
      navigate('/instruments');
    },
    onError: toast.fail,
  });

  const removeCalibration = useMutation({
    mutationFn: (calibrationId: number) => calibrationsApi.remove(calibrationId),
    onSuccess: () => {
      toast.ok('교정 이력을 삭제했습니다.');
      invalidateAll();
    },
    onError: toast.fail,
  });

  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(instrumentId, file),
    onSuccess: () => {
      toast.ok('첨부파일을 올렸습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.instruments.attachments(instrumentId) });
    },
    onError: toast.fail,
  });

  const download = useMutation({
    mutationFn: attachmentsApi.download,
    onSuccess: saveFile,
    onError: toast.fail,
  });

  const removeAttachment = useMutation({
    mutationFn: (attachmentId: number) => attachmentsApi.remove(attachmentId),
    onSuccess: () => {
      toast.ok('첨부파일을 삭제했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.instruments.attachments(instrumentId) });
    },
    onError: toast.fail,
  });

  const d = detail.data;
  const overdue = !!d?.nextDueDate && d.nextDueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* 카드 탭에서 인쇄하면 종이에는 카드만 나가야 한다 */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onClick={() => navigate('/instruments')}>
          ← 목록
        </button>
        <h1 className="text-[24px] font-semibold">{d?.name ?? '계측기'}</h1>
        {d && <span className="code text-[19px] text-fg-sub">{d.mgmtNo}</span>}
        {overdue && <Badge tone="danger">차기 교정일 경과</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tab === 'card' && (
            <button
              type="button"
              className={btnClass}
              disabled={!d}
              onClick={() => window.print()}
            >
              이력카드 인쇄
            </button>
          )}
          <button type="button" className={btnClass} disabled={!d} onClick={() => setEditing(true)}>
            수정
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={!d}
            onClick={() => setCalibrationTarget('new')}
          >
            교정 이력 등록
          </button>
          <button
            type="button"
            className={btnDangerClass}
            disabled={!d || removeInstrument.isPending}
            onClick={() => {
              if (window.confirm('이 계측기를 삭제합니다. 교정 이력도 함께 사라집니다.'))
                removeInstrument.mutate();
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <QueryState isPending={detail.isPending} error={detail.error} />

      {d && (
        <div className="no-print">
          <Tabs
            tabs={[
              { key: 'manage' as const, label: '관리 정보' },
              { key: 'card' as const, label: '이력카드' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      )}

      {d && tab === 'card' && <InstrumentCard instrumentId={instrumentId} />}

      {d && tab === 'manage' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Section title="계측기">
              <Def label="관리번호">
                <span className="code">{d.mgmtNo}</span>
              </Def>
              <Def label="계측기명">{d.name}</Def>
              <Def label="S/NO">{d.serialNo ?? '-'}</Def>
              <Def label="제작사">{d.maker ?? '-'}</Def>
              <Def label="규격">{d.specText ?? '-'}</Def>
              <Def label="정도 / 정확도">{d.accuracy ?? '-'}</Def>
            </Section>

            <Section title="운용">
              <Def label="교정주기">{d.calibrationCycleMonths}개월</Def>
              <Def label="최근 교정일">{fmtDate(d.lastCalibratedDate)}</Def>
              <Def label="차기 교정일">
                <span className={overdue ? 'font-semibold text-danger' : ''}>
                  {fmtDate(d.nextDueDate)}
                </span>
              </Def>
              <Def label="사용부서">{d.departmentDisplay ?? '-'}</Def>
              <Def label="사용위치">{d.locationName ?? '-'}</Def>
              <Def label="사용자">{d.userName ?? '-'}</Def>
            </Section>

            <Section title="구매·연결">
              <Def label="구매일">{fmtDate(d.purchaseDate)}</Def>
              <Def label="구매가격">
                <span className="num block">{won(d.purchasePrice)}</span>
              </Def>
              <Def label="구매처">{d.supplierName ?? '-'}</Def>
              <Def label="연결 고정자산">
                {d.assetId ? (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => navigate(`/assets/${d.assetId}`)}
                  >
                    {d.assetName ?? `#${d.assetId}`}
                  </button>
                ) : (
                  '-'
                )}
              </Def>
              <Def label="비고">{d.remark ?? '-'}</Def>
            </Section>
          </div>

          <Section title="교정 이력 (HISTORY)">
            <QueryState
              isPending={calibrations.isPending}
              error={calibrations.error}
              isEmpty={(calibrations.data ?? []).length === 0}
              emptyText="교정 이력이 없습니다."
            />
            {(calibrations.data ?? []).length > 0 && (
              <table className="w-max min-w-full text-[19px]">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-fg-sub">
                    <th className={thClass}>계획 연도</th>
                    <th className={thClass}>계획일</th>
                    <th className={thClass}>실시일</th>
                    <th className={thClass}>차기 교정일</th>
                    <th className={thClass}>결과</th>
                    <th className={thClass}>의뢰처</th>
                    <th className={thClass}>성적서 번호</th>
                    <th className={`${thClass} text-right`}>비용</th>
                    <th className={thClass}>이상발생 조치</th>
                    <th className={thClass}>확인자</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {(calibrations.data ?? []).map((c) => (
                    <tr key={c.id} className="border-b border-line hover:bg-bg">
                      <td className="px-3 py-2 tabular-nums">{c.planYear}</td>
                      <td className="px-3 py-2">{fmtDate(c.planDate)}</td>
                      <td className="px-3 py-2">{fmtDate(c.performedDate)}</td>
                      <td className="px-3 py-2">{fmtDate(c.nextDueDate)}</td>
                      <td className="px-3 py-2">
                        {c.performed ? (
                          <span className={c.result === 'FAIL' ? 'text-danger' : ''}>
                            {c.resultMark ?? '-'}
                          </span>
                        ) : (
                          <Badge tone="warn">미실시</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">{c.agencyName ?? '-'}</td>
                      <td className="px-3 py-2">{c.certificateNo ?? '-'}</td>
                      <td className="num px-3 py-2">{won(c.cost)}</td>
                      <td className="px-3 py-2 text-fg-sub">{c.actionNote ?? '-'}</td>
                      <td className="px-3 py-2">{c.confirmedBy ?? '-'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="mr-2 whitespace-nowrap text-[18px] text-accent hover:underline"
                          onClick={() => setCalibrationTarget(c)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="whitespace-nowrap text-[18px] text-danger hover:underline"
                          onClick={() => {
                            if (window.confirm('이 교정 이력을 삭제합니다.'))
                              removeCalibration.mutate(c.id);
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title="첨부파일"
            right={
              <>
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate(file);
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
            }
          >
            <QueryState
              isPending={attachments.isPending}
              error={attachments.error}
              isEmpty={(attachments.data ?? []).length === 0}
              emptyText="첨부파일이 없습니다. 교정성적서 스캔본 등을 올립니다."
            />
            {(attachments.data ?? []).length > 0 && (
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
                  {(attachments.data ?? []).map((f) => (
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
                        <button
                          type="button"
                          className="whitespace-nowrap text-[18px] text-danger hover:underline"
                          onClick={() => {
                            if (window.confirm(`${f.originalName} 을 삭제합니다.`))
                              removeAttachment.mutate(f.id);
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}

      {d && editing && <InstrumentModal instrument={d} onClose={() => setEditing(false)} />}
      {calibrationTarget && (
        <CalibrationModal
          instrumentId={instrumentId}
          calibration={calibrationTarget === 'new' ? undefined : calibrationTarget}
          onClose={() => setCalibrationTarget(null)}
        />
      )}
    </div>
  );
}

/* ---------- 교정 이력 등록·수정 ---------- */

function CalibrationModal({
  instrumentId,
  calibration,
  onClose,
}: {
  instrumentId: number;
  calibration?: Calibration;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    planYear: String(calibration?.planYear ?? currentYear()),
    planDate: calibration?.planDate ?? '',
    performedDate: calibration?.performedDate ?? '',
    result: (calibration?.result ?? '') as CalibrationResult | '',
    agencyId: calibration?.agencyId != null ? String(calibration.agencyId) : '',
    certificateNo: calibration?.certificateNo ?? '',
    cost: calibration?.cost != null ? String(calibration.cost) : '',
    actionNote: calibration?.actionNote ?? '',
    confirmedBy: calibration?.confirmedBy ?? '',
    remark: calibration?.remark ?? '',
  });

  // 이력카드의 "수리여부" 칸. 미입력과 "무" 를 구분해야 해서 별도로 둔다
  const [repaired, setRepaired] = useState<boolean | null>(calibration?.repaired ?? null);

  const partners = usePartners();

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: SaveCalibrationPayload = {
        planYear: Number(form.planYear),
        planDate: form.planDate || undefined,
        performedDate: form.performedDate || undefined,
        result: form.result || undefined,
        agencyId: form.agencyId ? Number(form.agencyId) : undefined,
        certificateNo: form.certificateNo || undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        actionNote: form.actionNote || undefined,
        confirmedBy: form.confirmedBy || undefined,
        repaired: repaired ?? undefined,
        remark: form.remark || undefined,
      };
      return calibration
        ? calibrationsApi.update(calibration.id, body)
        : calibrationsApi.create(instrumentId, body);
    },
    onSuccess: () => {
      toast.ok('저장했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.calibrations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.instruments.all });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={calibration ? '교정 이력 수정' : '교정 이력 등록'}
      width={740}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || !form.planYear}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="계획 연도" required>
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.planYear}
            onChange={(e) => set('planYear', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="교정계획일" hint="계획 없이 실시했으면 비웁니다.">
          <input
            type="date"
            className={inputClass}
            value={form.planDate}
            onChange={(e) => set('planDate', e.target.value)}
          />
        </Field>
        <Field label="교정실시일" hint="미실시면 비웁니다. 차기 교정일은 서버가 계산합니다.">
          <input
            type="date"
            className={inputClass}
            value={form.performedDate}
            onChange={(e) => set('performedDate', e.target.value)}
          />
        </Field>
        <Field label="결과">
          <select
            className={inputClass}
            value={form.result}
            onChange={(e) => set('result', e.target.value)}
          >
            <option value="">미입력</option>
            {(Object.keys(CALIBRATION_RESULT_LABEL) as CalibrationResult[]).map((r) => (
              <option key={r} value={r}>
                {CALIBRATION_RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="의뢰처">
          <select
            className={inputClass}
            value={form.agencyId}
            onChange={(e) => set('agencyId', e.target.value)}
          >
            <option value="">선택</option>
            {(partners.data ?? []).filter(isAgency).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="교정성적서 번호">
          <input
            className={inputClass}
            value={form.certificateNo}
            onChange={(e) => set('certificateNo', e.target.value)}
          />
        </Field>
        <Field label="교정비용">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.cost}
            onChange={(e) => set('cost', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="확인자">
          <input
            className={inputClass}
            value={form.confirmedBy}
            onChange={(e) => set('confirmedBy', e.target.value)}
          />
        </Field>
        {/* 종이 양식에는 수리여부 칸이 없다. 관리 정보 탭의 교정 이력에서만 본다 */}
        <Field label="수리여부" hint="관리 정보의 교정 이력에 남습니다. 이력카드에는 찍히지 않습니다.">
          <select
            className={inputClass}
            value={repaired == null ? '' : repaired ? 'Y' : 'N'}
            onChange={(e) => setRepaired(e.target.value === '' ? null : e.target.value === 'Y')}
          >
            <option value="">미입력</option>
            <option value="N">무</option>
            <option value="Y">유</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="이상발생 조치">
            <input
              className={inputClass}
              value={form.actionNote}
              onChange={(e) => set('actionNote', e.target.value)}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
