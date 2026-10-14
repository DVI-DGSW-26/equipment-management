import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gaugeRrApi, type GaugeRrJudgment, type GaugeRrPlan } from '@/api/gaugeRr';
import { queryKeys } from '@/api/queryKeys';
import { useCanEdit } from '@/hooks/useMe';
import { useUrlState } from '@/hooks/useUrlState';
import { FROM_LIST } from '@/hooks/useBackToList';
import { currentYear, fmtDate, getToday, toIsoDate } from '@/lib/date';
import { printAs } from '@/lib/printTitle';
import { downloadExcel, stampedFileName, type ExcelColumn } from '@/lib/excel';
import { searchIn } from '@/lib/search';
import { fmtNum, JUDGMENT_TONE } from '@/domain/gaugeRr';
import { useToast } from '@/components/toastContext';
import {
  Badge,
  btnClass,
  btnDangerClass,
  btnPrimaryClass,
  FilterBar,
  filterClass,
  QueryState,
  ReadOnlyChip,
  Section,
  thClass,
} from '@/components/ui';
import GaugeRrModal from './GaugeRrModal';
import GaugeRrPlanModal from './GaugeRrPlanModal';
import GaugeRrPlanPrintSheet from './GaugeRrPlanPrintSheet';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 계획표는 2026년부터 쓴다 (요청 2026-10-14) */
const FIRST_YEAR = 2026;

/**
 * 계획표 조건도 주소에 담는다. 기록 탭과 이름이 겹치지 않게 p 를 붙인다 —
 * 같은 주소를 나눠 쓰므로 keyword 를 같이 쓰면 탭을 바꿀 때 검색어가 따라온다.
 */
const PLAN_DEFAULTS = { pYear: '', pKeyword: '', pState: '' };

type StateFilter = '' | 'done' | 'todo' | 'late';

/** 실적월 표시의 색. 판정을 그대로 따른다 — 양호는 여유(ok) 색이다 */
const MARK_CLASS: Record<GaugeRrJudgment, string> = {
  OK: 'text-ok',
  CONDITIONAL: 'text-warn',
  NG: 'text-danger',
};

/** 계획월이 지났는데 실적이 없는가. 지난해 계획은 전부, 올해는 이번 달 전까지 */
const isLate = (p: GaugeRrPlan, today: Date): boolean => {
  if (p.done) return false;
  const y = today.getFullYear();
  return p.planYear < y || (p.planYear === y && p.plannedMonth < today.getMonth() + 1);
};

type Row = GaugeRrPlan;

const COLUMNS: ExcelColumn<Row>[] = [
  { header: 'NO', value: (r) => r.seq, numeric: true, width: 6 },
  { header: '제품', value: (r) => r.product, width: 22 },
  { header: '제품 규격', value: (r) => r.productSpec, width: 18 },
  { header: 'PART NO.', value: (r) => r.partNo, width: 14 },
  { header: 'GAGE 명', value: (r) => r.gageName, width: 16 },
  { header: 'S/NO.', value: (r) => r.gageSerial, width: 14 },
  { header: '계측기 관리번호', value: (r) => r.instrumentMgmtNo, width: 14 },
  { header: '항목', value: (r) => r.item, width: 10 },
  { header: '계획월', value: (r) => r.plannedMonth, numeric: true, width: 8 },
  { header: '실시일', value: (r) => r.performedDate, width: 12 },
  { header: '실시월', value: (r) => r.performedMonth, numeric: true, width: 8 },
  { header: '%R&R', value: (r) => (r.pctGrr == null ? null : fmtNum(r.pctGrr, 2)), numeric: true, width: 10 },
  { header: 'ndc', value: (r) => (r.ndc == null ? null : fmtNum(r.ndc, 2)), numeric: true, width: 8 },
  { header: '판정', value: (r) => r.judgmentLabel, width: 12 },
  { header: '비고', value: (r) => r.remark, width: 24 },
];

/**
 * 게이지 R&R 연간 계획표.
 *
 * 품질팀 엑셀 계획표처럼 한 줄에 1~12월 칸을 두고 계획월에 ●, 실시한 달에 판정 색 ✓ 를 찍는다.
 * 계획과 실적이 같은 달이면 한 칸에 둘 다 보인다. 실적은 R&R 기록 쪽에서 계획을 골라 잇는다 —
 * 아직 실적이 없는 줄은 [실적 등록] 으로 이 계획에 이어진 R&R 등록 창을 연다.
 */
export default function GaugeRrPlanTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  /* 쓰기는 계측기 담당만. 보는 것은 누구나 */
  const edit = useCanEdit('instrument');

  const [pq, setPq] = useUrlState(PLAN_DEFAULTS);
  const year = Number(pq.pYear) || Math.max(currentYear(), FIRST_YEAR);
  const keyword = pq.pKeyword;
  const state = pq.pState as StateFilter;

  const [editing, setEditing] = useState<GaugeRrPlan | 'new' | null>(null);
  const [recording, setRecording] = useState<GaugeRrPlan | null>(null);
  const [exporting, setExporting] = useState(false);

  const years = useQuery({
    queryKey: queryKeys.gaugeRr.planYears(),
    queryFn: () => gaugeRrApi.planYears(),
  });
  /*
   * 2026년부터 내년까지 + 계획이 있는 해. 아직 계획이 없는 해에도 새로 적을 수 있어야 한다.
   * 계획이 있는 해는 그 전이라도 남긴다 — 숨기면 이미 적은 계획을 볼 길이 없다.
   */
  const yearOptions = [
    ...new Set([
      ...(years.data ?? []),
      ...Array.from(
        { length: Math.max(0, currentYear() + 1 - FIRST_YEAR + 1) },
        (_, i) => FIRST_YEAR + i,
      ),
      year,
    ]),
  ].sort((a, b) => b - a);

  const plans = useQuery({
    queryKey: queryKeys.gaugeRr.plans(year),
    queryFn: () => gaugeRrApi.plans(year),
  });

  const remove = useMutation({
    mutationFn: (p: GaugeRrPlan) => gaugeRrApi.removePlan(p.id),
    onSuccess: () => {
      toast.ok('계획을 지웠습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
    },
    onError: toast.fail,
  });

  const today = getToday();
  const all = plans.data ?? [];
  const doneCount = all.filter((p) => p.done).length;
  const lateCount = all.filter((p) => isLate(p, today)).length;

  /*
   * 작년 계획 복사. 해마다 측정 대상이 거의 같아 복사한 뒤 계획월만 고친다.
   * 실적은 옮기지 않는다. 이미 줄이 있으면 서버가 마지막 NO 뒤로 이어 붙인다.
   */
  const fromYear = year - 1;
  const canCopy = (years.data ?? []).includes(fromYear);
  const copy = useMutation({
    mutationFn: () => gaugeRrApi.copyPlans(fromYear, year),
    onSuccess: (next) => {
      /* 응답이 그 해 계획표 전체다 — 다시 묻지 않고 바로 채운다 */
      qc.setQueryData(queryKeys.gaugeRr.plans(year), next);
      void qc.invalidateQueries({ queryKey: queryKeys.gaugeRr.all });
      toast.ok(`${fromYear}년 계획을 ${year}년으로 복사했습니다. 계획월을 확인해 주세요.`);
    },
    onError: toast.fail,
  });
  const copyButton = edit && canCopy && (
    <button
      type="button"
      className={btnClass}
      disabled={copy.isPending}
      title={`${fromYear}년 계획 줄을 ${year}년으로 옮깁니다. 실적은 옮기지 않습니다.`}
      onClick={() => {
        if (
          window.confirm(
            `${fromYear}년 계획을 ${year}년으로 복사합니다. 실적은 옮기지 않습니다.` +
              (all.length > 0 ? ` 지금 있는 ${all.length}줄 뒤로 이어 붙습니다.` : ''),
          )
        )
          copy.mutate();
      }}
    >
      {copy.isPending ? '복사 중…' : `${fromYear}년 계획 복사`}
    </button>
  );

  const hit = searchIn(keyword);
  const rows = all.filter(
    (p) =>
      hit(p.partNo, p.product, p.productSpec, p.gageName, p.gageSerial, p.instrumentMgmtNo, p.item) &&
      (state === '' ||
        (state === 'done' && p.done) ||
        (state === 'todo' && !p.done) ||
        (state === 'late' && isLate(p, today))),
  );

  const download = async () => {
    setExporting(true);
    try {
      await downloadExcel(rows, COLUMNS, stampedFileName(`${year}년_게이지RR계획표`, toIsoDate(today)));
      toast.ok(`${year}년 계획 ${rows.length.toLocaleString('ko-KR')}건을 내려받았습니다.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setExporting(false);
    }
  };

  const addButton = edit && (
    <button type="button" className={btnPrimaryClass} onClick={() => setEditing('new')}>
      계획 추가
    </button>
  );

  return (
    <>
      <Section
        className="print:hidden"
        title={
          <>
            {year}년 게이지 R&amp;R 계획 및 관리 대장{' '}
            <span className="font-normal text-fg-muted">
              실시 {doneCount} / 계획 {all.length}
              {lateCount > 0 && <span className="text-danger"> · 지연 {lateCount}</span>}
            </span>
          </>
        }
        right={
          <>
            <button
              type="button"
              className={btnClass}
              disabled={rows.length === 0 || exporting}
              onClick={() => void download()}
            >
              {exporting ? '만드는 중…' : '엑셀 다운로드'}
            </button>
            {/* 종이에는 거르지 않은 그 해 계획 전부가 나간다 — 대장은 한 해 전체다 */}
            <button
              type="button"
              className={btnClass}
              disabled={all.length === 0}
              title="품질팀 엑셀 양식(년간 시트) 그대로 인쇄합니다. 검색·필터와 상관없이 그 해 계획 전부가 나갑니다."
              onClick={() => printAs(`${year}년_게이지RR_계획및관리대장`)}
            >
              인쇄 · PDF
            </button>
            {copyButton}
            {addButton || <ReadOnlyChip />}
          </>
        }
      >
        <FilterBar
          search={{
            value: keyword,
            onChange: (v) => setPq({ pKeyword: v }),
            fields: 'PART NO · 제품 · GAGE · S/NO · 관리번호 · 항목',
          }}
          count={{ shown: rows.length, total: all.length }}
          onReset={() => setPq({ pKeyword: '', pState: '' })}
          resetDisabled={keyword === '' && state === ''}
        >
          {/* 연도는 초기화하지 않는다. 계획 추가도 이 연도로 한다 */}
          <select
            className={`${filterClass} w-28`}
            value={year}
            aria-label="계획 연도"
            onChange={(e) =>
              setPq({ pYear: Number(e.target.value) === currentYear() ? '' : e.target.value })
            }
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            className={`${filterClass} w-36`}
            value={state}
            aria-label="실시 여부"
            onChange={(e) => setPq({ pState: e.target.value })}
          >
            <option value="">실시 여부 전체</option>
            <option value="done">실시</option>
            <option value="todo">미실시</option>
            <option value="late">지연 (계획월 지남)</option>
          </select>
        </FilterBar>

        <QueryState
          isPending={plans.isPending}
          error={plans.error}
          isEmpty={rows.length === 0}
          emptyText={
            all.length > 0 ? (
              '조건에 맞는 계획이 없습니다.'
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <span>{year}년 계획이 없습니다.</span>
                {copyButton}
                {addButton}
              </span>
            )
          }
        />

        {rows.length > 0 && (
          <>
            <table className="w-max min-w-full text-[19px]">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-fg-sub">
                  <th className={`${thClass} w-14 text-right`}>NO</th>
                  <th className={thClass}>제품</th>
                  <th className={thClass}>PART NO.</th>
                  <th className={thClass}>GAGE 명</th>
                  <th className={thClass}>S/NO.</th>
                  <th className={thClass}>항목</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="w-10 px-1 py-2 text-center font-medium">
                      {m}
                    </th>
                  ))}
                  <th className={thClass}>실시일</th>
                  <th className={`${thClass} text-right`}>%R&amp;R</th>
                  <th className={`${thClass} text-right`}>ndc</th>
                  <th className={`${thClass} text-center`}>판정</th>
                  <th className={thClass}>비고</th>
                  {edit && <th className={thClass} />}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const late = isLate(p, today);
                  const open = () =>
                    p.studyId != null &&
                    navigate(`/gauge-rr/${p.studyId}`, { state: FROM_LIST });
                  return (
                    <tr
                      key={p.id}
                      onClick={open}
                      title={p.studyId != null ? '눌러서 실적(R&R 기록)을 엽니다.' : undefined}
                      className={`border-b border-line ${
                        p.studyId != null ? 'cursor-pointer hover:bg-bg' : ''
                      }`}
                    >
                      <td className="num px-3 py-2 text-fg-muted">{p.seq}</td>
                      <td className="px-3 py-2">
                        {p.product}
                        {p.productSpec && (
                          <div className="text-[17px] text-fg-muted">{p.productSpec}</div>
                        )}
                      </td>
                      <td className="code px-3 py-2">{p.partNo}</td>
                      <td className="px-3 py-2">{p.gageName}</td>
                      <td className="code px-3 py-2">
                        {p.gageSerial ?? '-'}
                        {p.instrumentMgmtNo && (
                          <div className="text-[17px] text-fg-muted" title="연결된 계측기 관리번호">
                            {p.instrumentMgmtNo}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">{p.item ?? '-'}</td>
                      {MONTHS.map((m) => {
                        const planned = p.plannedMonth === m;
                        const performed = p.done && p.performedMonth === m;
                        return (
                          <td key={m} className="border-l border-line px-1 py-2 text-center">
                            {planned && (
                              <span
                                className={late ? 'text-danger' : 'text-fg-sub'}
                                title={late ? `${m}월 계획 — 아직 실시하지 않았습니다` : `${m}월 계획`}
                              >
                                ●
                              </span>
                            )}
                            {performed && (
                              <span
                                className={`font-semibold ${p.judgment ? MARK_CLASS[p.judgment] : ''}`}
                                title={`${fmtDate(p.performedDate)} 실시 · ${p.judgmentLabel ?? ''}`}
                              >
                                ✓
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-l border-line px-3 py-2 whitespace-nowrap">
                        {p.done ? fmtDate(p.performedDate) : late ? <Badge tone="danger">지연</Badge> : '-'}
                      </td>
                      <td className="num px-3 py-2">{fmtNum(p.pctGrr, 2)}</td>
                      <td className="num px-3 py-2">{fmtNum(p.ndc, 2)}</td>
                      <td className="px-3 py-2 text-center">
                        {p.judgment ? (
                          <Badge tone={JUDGMENT_TONE[p.judgment]}>{p.judgmentLabel}</Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-3 py-2 text-fg-sub">{p.remark ?? '-'}</td>
                      {edit && (
                        <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <span className="flex gap-1">
                            {!p.done && (
                              <button
                                type="button"
                                className={btnClass}
                                onClick={() => setRecording(p)}
                              >
                                실적 등록
                              </button>
                            )}
                            <button type="button" className={btnClass} onClick={() => setEditing(p)}>
                              수정
                            </button>
                            <button
                              type="button"
                              className={btnDangerClass}
                              disabled={remove.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `NO.${p.seq} ${p.partNo} 계획 줄을 지웁니다.` +
                                      (p.done ? ' 이어진 R&R 기록은 그대로 남습니다.' : ''),
                                  )
                                )
                                  remove.mutate(p);
                              }}
                            >
                              삭제
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-line px-3 py-2 text-[17px] text-fg-muted">
              ● 계획월 (빨강은 지난 달까지 실시하지 않은 계획) · ✓ 실시월 (색은 판정: 초록 양호 ·
              금색 조건부 · 빨강 부적합). 실시한 줄을 누르면 그 R&amp;R 기록을 엽니다.
            </p>
          </>
        )}

        {editing && (
          <GaugeRrPlanModal
            plan={editing === 'new' ? undefined : editing}
            year={year}
            onClose={() => setEditing(null)}
          />
        )}
        {recording && <GaugeRrModal plan={recording} onClose={() => setRecording(null)} />}
      </Section>
      <GaugeRrPlanPrintSheet year={year} plans={all} />
    </>
  );
}
