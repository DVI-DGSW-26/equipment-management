import type { ReactNode } from 'react';
import type { GaugeRrDetail } from '@/api/gaugeRr';
import { fmtDate } from '@/lib/date';
import { APPRAISER_LETTERS, fmtNum, JUDGMENT_TONE } from '@/domain/gaugeRr';
import { Badge } from '@/components/ui';

/**
 * 게이지 R&R 양식 한 장. 품질팀 엑셀(GAGE REPEATABILITY AND REPRODUCIBILITY DATA SHEET)을 옮긴다.
 *
 *   머리   품번·게이지·측정자 (양식은 좌우 두 번 적지만 한 번만)
 *   왼쪽   측정값 + 측정자별 AVE·R 행, PART AVE(Xp), R̄·X̄diff·UCLR
 *   오른쪽 EV·AV·R&R·PV·TV 와 %, ndc, 판정
 *
 * 숫자는 전부 서버 계산값이다. 이 화면은 자릿수만 맞춘다.
 * 인쇄 크기 조정은 이력카드와 같은 .card-sheet 규칙을 탄다.
 */
export default function GaugeRrSheet({ d }: { d: GaugeRrDetail }) {
  const parts = Array.from({ length: d.parts }, (_, p) => p);
  const r = d.results;
  const spec =
    d.specLower != null || d.specUpper != null
      ? `${d.specLower ?? '-'} ~ ${d.specUpper ?? '-'}`
      : '-';

  return (
    <div className="card-sheet mx-auto w-full max-w-[1360px] border border-fg bg-surface text-[17px] text-fg">
      <h2 className="card-heading border-b border-fg py-1.5 text-center text-[24px] font-bold tracking-[0.1em]">
        GAGE R&amp;R DATA SHEET
      </h2>

      {/* ---------- 머리 ---------- */}
      <div className="card-head grid grid-cols-[auto_1fr_auto_1fr_auto_1fr]">
        <L>Part Number</L>
        <V mono>{d.partNumber}</V>
        <L>Gage Name</L>
        <V>{d.gageName}</V>
        <L>Appraiser A</L>
        <V>{d.appraisers[0]}</V>

        <L>Part Name</L>
        <V>{d.partName}</V>
        <L>Gage Number</L>
        <V mono>
          {d.gageNumber ?? '-'}
          {d.instrumentMgmtNo && (
            <span className="ml-1 text-fg-muted">({d.instrumentMgmtNo})</span>
          )}
        </V>
        <L>Appraiser B</L>
        <V>{d.appraisers[1]}</V>

        <L>Characteristic</L>
        <V>{d.characteristic ?? '-'}</V>
        <L>Gage Type</L>
        <V>{d.gageType ?? '-'}</V>
        <L>Appraiser C</L>
        <V>{d.appraisers[2] ?? '-'}</V>

        <L>Specification</L>
        <V>{spec}</V>
        <L>Classification</L>
        <V>{d.characteristicClass ?? '-'}</V>
        <L>Date Performed</L>
        <V>{fmtDate(d.performedDate)}</V>
      </div>

      <div className="grid grid-cols-1 border-t border-fg xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        {/* ---------- 측정값 ---------- */}
        <div className="min-w-0 overflow-x-auto border-b border-fg xl:border-r xl:border-b-0">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="border-b border-fg bg-bg">
                <th className="border-r border-fg px-2 py-1 font-medium">측정자</th>
                <th className="border-r border-fg px-2 py-1 font-medium">회</th>
                {parts.map((p) => (
                  <th key={p} className="border-r border-fg px-2 py-1 font-medium">
                    {p + 1}
                  </th>
                ))}
                <th className="px-2 py-1 font-medium">AVERAGE</th>
              </tr>
            </thead>
            <tbody>
              {d.appraiserBlocks.map((b, a) => (
                <AppraiserRows key={b.appraiser} d={d} a={a} />
              ))}
              <tr className="border-b border-fg bg-bg font-medium">
                <td colSpan={2} className="border-r border-fg px-2 py-1">
                  PART AVE (Xp)
                </td>
                {d.partAverages.map((v, p) => (
                  <td key={p} className="num border-r border-fg px-2 py-1">
                    {fmtNum(v, 3)}
                  </td>
                ))}
                <td className="num px-2 py-1 text-left">X̿ = {fmtNum(d.grandMean, 4)}</td>
              </tr>
            </tbody>
          </table>

          {/* 양식 아래 17~20번 줄 */}
          <div className="grid grid-cols-2 gap-x-6 px-3 py-2 sm:grid-cols-3">
            <Stat label="Rp" value={fmtNum(d.rp, 4)} hint="max(Xp) − min(Xp)" />
            <Stat label="R̄" value={fmtNum(d.rBar, 4)} hint="(ra + rb + rc) / 측정자 수" />
            <Stat label="X̄diff" value={fmtNum(d.xDiff, 4)} hint="max(x̄) − min(x̄)" />
            <Stat label="UCLR" value={fmtNum(d.uclr, 4)} hint={`R̄ × D4 (${d.constants.d4})`} />
            <Stat label="LCLR" value={fmtNum(d.lclr, 4)} hint="R̄ × D3" />
          </div>
          <p className="px-3 pb-2 text-[15px] text-fg-muted">
            빨간 R 은 UCLR 을 넘은 것입니다. 같은 측정자·같은 게이지로 다시 재거나 그 값을 빼고
            다시 계산합니다.
          </p>
        </div>

        {/* ---------- 결과 ---------- */}
        <div className="min-w-0">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-fg bg-bg text-center">
                <th className="border-r border-fg px-2 py-1 font-medium">Measurement Unit Analysis</th>
                <th className="border-r border-fg px-2 py-1 font-medium">값</th>
                <th className="px-2 py-1 font-medium">% TV</th>
              </tr>
            </thead>
            <tbody>
              <ResultRow label="반복성 EV" sub={`R̄ × K1 (${d.constants.k1})`} v={r.ev} pct={r.pctEv} />
              <ResultRow label="재현성 AV" sub={`K2 = ${d.constants.k2}`} v={r.av} pct={r.pctAv} />
              <ResultRow label="R&R" sub="√(EV² + AV²)" v={r.grr} pct={r.pctGrr} strong />
              <ResultRow label="부품 변동 PV" sub={`Rp × K3 (${d.constants.k3})`} v={r.pv} pct={r.pctPv} />
              <ResultRow label="총 변동 TV" sub="√(R&R² + PV²)" v={r.tv} />
              <tr className="border-b border-fg">
                <td className="border-r border-fg px-2 py-1">
                  ndc
                  <div className="text-[15px] text-fg-muted">1.41 × PV / R&amp;R</div>
                </td>
                <td colSpan={2} className="num px-2 py-1 text-right">
                  {fmtNum(r.ndc, 2)}
                </td>
              </tr>
              <tr className="border-b border-fg">
                <td className="border-r border-fg px-2 py-1">
                  % Tolerance
                  <div className="text-[15px] text-fg-muted">
                    100 × R&amp;R / 공차{r.tolerance != null && ` (${fmtNum(r.tolerance, 3)})`}
                  </div>
                </td>
                <td colSpan={2} className="num px-2 py-1 text-right">
                  {r.pctGrrOfTolerance == null ? '규격 없음' : `${fmtNum(r.pctGrrOfTolerance, 2)} %`}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex items-center justify-between gap-2 border-b border-fg px-3 py-3">
            <span className="font-medium">판정 (%R&amp;R 기준)</span>
            <Badge tone={JUDGMENT_TONE[d.judgment]}>
              <span className="text-[20px] font-semibold">{d.judgmentLabel}</span>
            </Badge>
          </div>
          <p className="px-3 py-2 text-[15px] text-fg-muted">
            10% 미만 양호 · 10~30% 조건부 사용 · 30% 초과 부적합. 5.15σ(99%) 기준.
          </p>
          {d.remark && (
            <div className="border-t border-fg px-3 py-2">
              <span className="text-fg-muted">비고 </span>
              {d.remark}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 측정자 한 사람 — 반복 행들, AVE 행(xa), R 행(ra) */
function AppraiserRows({ d, a }: { d: GaugeRrDetail; a: number }) {
  const b = d.appraiserBlocks[a];
  const rows = d.measurements[a] ?? [];
  const span = rows.length + 2;
  return (
    <>
      {rows.map((cells, t) => (
        <tr key={t} className="border-b border-line">
          {t === 0 && (
            <td rowSpan={span} className="border-r border-b border-fg px-2 py-1 font-medium">
              {APPRAISER_LETTERS[a]}
              <div className="text-[15px] font-normal text-fg-sub">{b.name}</div>
            </td>
          )}
          <td className="border-r border-fg px-2 py-1 text-fg-muted">{t + 1}</td>
          {cells.map((v, p) => (
            <td key={p} className="num border-r border-fg px-2 py-1">
              {fmtNum(v, 3)}
            </td>
          ))}
          <td />
        </tr>
      ))}
      <tr className="border-b border-line bg-bg">
        <td className="border-r border-fg px-2 py-1">AVE</td>
        {b.partAverages.map((v, p) => (
          <td key={p} className="num border-r border-fg px-2 py-1">
            {fmtNum(v, 3)}
          </td>
        ))}
        <td className="num px-2 py-1 text-left">x̄{APPRAISER_LETTERS[a].toLowerCase()} = {fmtNum(b.average, 4)}</td>
      </tr>
      <tr className="border-b border-fg bg-bg">
        <td className="border-r border-fg px-2 py-1">R</td>
        {b.partRanges.map((v, p) => (
          <td
            key={p}
            className={`num border-r border-fg px-2 py-1 ${v > d.uclr ? 'font-semibold text-danger' : ''}`}
            title={v > d.uclr ? `UCLR(${fmtNum(d.uclr, 4)}) 초과` : undefined}
          >
            {fmtNum(v, 3)}
          </td>
        ))}
        <td className="num px-2 py-1 text-left">r̄{APPRAISER_LETTERS[a].toLowerCase()} = {fmtNum(b.averageRange, 4)}</td>
      </tr>
    </>
  );
}

function ResultRow({
  label,
  sub,
  v,
  pct,
  strong,
}: {
  label: string;
  sub: string;
  v: number;
  pct?: number;
  strong?: boolean;
}) {
  return (
    <tr className={`border-b border-fg ${strong ? 'bg-bg font-semibold' : ''}`}>
      <td className="border-r border-fg px-2 py-1">
        {label}
        <div className="text-[15px] font-normal text-fg-muted">{sub}</div>
      </td>
      <td className="num border-r border-fg px-2 py-1 text-right">{fmtNum(v, 4)}</td>
      <td className="num px-2 py-1 text-right">{pct == null ? '' : `${fmtNum(pct, 2)} %`}</td>
    </tr>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5" title={hint}>
      <span className="text-fg-sub">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function L({ children }: { children: ReactNode }) {
  return (
    <div className="border-r border-b border-fg bg-bg px-2 py-1.5 text-center font-medium whitespace-nowrap">
      {children}
    </div>
  );
}

function V({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <div className={`border-r border-b border-fg px-2 py-1.5 last:border-r-0 ${mono ? 'code' : ''}`}>
      {children}
    </div>
  );
}
