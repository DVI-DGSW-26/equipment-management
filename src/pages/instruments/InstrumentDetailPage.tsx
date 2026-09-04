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
import { printAs } from '@/lib/printTitle';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import InstrumentModal from './InstrumentModal';
import InstrumentCard from './InstrumentCard';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  Field,
  inputClass,
  QueryState,
  Section,
  thClass,
} from '@/components/ui';

export default function InstrumentDetailPage() {
  const { id } = useParams();
  const instrumentId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  /*
   * 화면은 이력카드 한 장이다.
   *
   * 관리 정보를 탭으로 갈라 두었더니 이력카드를 보려고 한 번 더 눌러야 했고,
   * 정작 관리 정보 탭은 따로 볼 일이 없었다(2026-09-03 피드백). 탭을 걷고
   * 이력카드 아래에 관리 정보·교정 이력·첨부를 이어 붙인다.
   *
   * 종이·PDF 로는 이력카드 양식만 나간다 — 이어 붙인 것은 모두 no-print 다.
   */
  const [editing, setEditing] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<Calibration | 'new' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: queryKeys.instruments.detail(instrumentId),
    queryFn: () => instrumentsApi.detail(instrumentId),
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

  /*
   * 폐기는 삭제와 다르다. 교정 이력과 사진은 그대로 남고 기본 목록·교정계획·알림에서만
   * 빠진다. 현장에서 못 쓰게 된 계측기는 지우지 말고 폐기로 넘겨야, 나중에 "그 계측기
   * 언제 어떻게 됐냐" 는 물음에 답할 수 있다. 삭제는 잘못 등록한 것을 치울 때만 쓴다.
   */

  const restore = useMutation({
    mutationFn: () => instrumentsApi.restore(instrumentId),
    onSuccess: () => {
      toast.ok('사용중으로 되돌렸습니다.');
      invalidateAll();
    },
    onError: toast.fail,
  });

  /*
   * [삭제] 는 정말 지우지 않고 폐기로 넘긴다.
   *
   * 서버의 DELETE 는 교정 이력과 사진까지 함께 지워 되돌릴 수 없다. 못 쓰게 된 계측기를
   * 목록에서 치우려던 것뿐인데 이력이 사라지면 "그 계측기 언제 어떻게 됐냐" 에 답할 수 없다.
   * 그래서 폐기로 바꾼다 — 화면에서는 사라지고(목록 기본이 사용중), 상태를 폐기·전체로
   * 두면 다시 보이고 [폐기 취소] 로 되돌릴 수 있다.
   */
  const removeInstrument = useMutation({
    mutationFn: () => instrumentsApi.discard(instrumentId),
    onSuccess: () => {
      toast.ok('폐기 처리했습니다. 교정 이력은 그대로 남습니다.');
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
  const gone = d?.status === 'DISCARDED';
  /* 폐기한 것은 교정 기한을 따지지 않는다 */
  const overdue =
    !gone && !!d?.nextDueDate && d.nextDueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* 인쇄하면 종이에는 이력카드만 나간다 */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onClick={() => navigate('/instruments')}>
          ← 목록
        </button>
        <h1 className="text-[24px] font-semibold">{d?.name ?? '계측기'}</h1>
        {d && <span className="code text-[19px] text-fg-sub">{d.mgmtNo}</span>}
        {gone && (
          <Badge tone="muted">
            폐기{d?.discardedAt ? ` · ${fmtDate(d.discardedAt)}` : ''}
          </Badge>
        )}
        {overdue && <Badge tone="danger">차기 교정일 경과</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/*
            종이·PDF 로는 이력카드 양식만 나간다. 화면에서만 보는 것은 인쇄에서 빠진다.
            PDF 로 저장하면 파일 이름이 "계측기명(관리번호)" 가 된다.
          */}
          <button
            type="button"
            className={btnClass}
            disabled={!d}
            onClick={() => d && printAs(`${d.name}(${d.mgmtNo})`)}
          >
            이력카드 인쇄 · PDF
          </button>
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
          {gone ? (
            <button
              type="button"
              className={btnClass}
              disabled={restore.isPending}
              onClick={() => {
                if (window.confirm('폐기를 취소하고 사용중으로 되돌립니다.')) restore.mutate();
              }}
            >
              폐기 취소
            </button>
          ) : (
            <button
              type="button"
              className={btnDangerClass}
              disabled={!d || removeInstrument.isPending}
              title="목록에서 내려갑니다. 교정 이력과 사진은 그대로 남고, 상태를 폐기로 두면 다시 보입니다."
              onClick={() => {
                if (
                  window.confirm(
                    '이 계측기를 폐기 처리합니다. 목록에서 내려가지만 교정 이력은 그대로 남고, 상세에서 [폐기 취소] 로 되돌릴 수 있습니다.',
                  )
                )
                  removeInstrument.mutate();
              }}
            >
              삭제
            </button>
          )}
        </div>
      </div>

      <QueryState isPending={detail.isPending} error={detail.error} />

      {/*
        계측기가 가진 것은 전부 이력카드 안에 있다. 양식에 칸이 없는 항목과 첨부는
        카드 안에 이어 붙이되 종이에는 나가지 않는다 (2026-09-04 요청).
      */}
      {d && (
        <InstrumentCard
          instrumentId={instrumentId}
          onEditCalibration={setCalibrationTarget}
          onDeleteCalibration={(id) => removeCalibration.mutate(id)}
          footer={
            <>
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
            </>
          }
        />
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
