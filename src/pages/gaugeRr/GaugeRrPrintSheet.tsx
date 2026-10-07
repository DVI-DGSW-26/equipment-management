import type { ReactNode } from 'react';
import type { GaugeRrDetail, GaugeRrJudgment } from '@/api/gaugeRr';

/**
 * 인쇄 전용 — 품질팀 엑셀 "GAUE R&R 데이터" 시트를 칸 단위로 그대로 옮긴다 (요청 2026-10-07).
 *
 * 화면용 GaugeRrSheet 는 읽기 좋게 배치를 바꿨지만, 종이로는 원래 쓰던 양식과 똑같이
 * 나가야 대조·보관이 된다. 엑셀의 A~Y 25열을 같은 너비 비율로 두고, 2~45행을 같은
 * 차례로 그린다. 엑셀 인쇄 설정(A4 가로, 한 장에 맞춤 78%)에 맞춰 글자 크기를 줄였다.
 *
 * 양식은 크기가 고정이다 — 측정자 3명 · 반복 3회 · 부품 10개 칸이 늘 있고,
 * 덜 쓴 칸은 엑셀처럼 비워 둔다.
 *
 * 숫자는 서버 값을 엑셀 표시 형식(TEXT "0.000" 등)으로 찍기만 한다. 회차 행 끝의
 * AVERAGE(엑셀 N18) 도 서버가 주는 trialAverages 를 쓴다.
 * 오른쪽 K1·K2·K3 표는 양식에 인쇄된 상수표 그대로다.
 */

/** 엑셀 열 너비(pt). A~M 37 · N 42.5 · O~Q 37 · R 44 · S~U 37 · V~Y 42.5 */
const COL_PT = [
  37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 42.5, 37, 37, 37, 44, 37, 37, 37, 42.5, 42.5,
  42.5, 42.5,
];
const TOTAL_PT = COL_PT.reduce((a, b) => a + b, 0);
/** 왼쪽(A~N)과 오른쪽(O~Y)의 비율. 표 아래 주석을 같은 선에 맞춘다 */
const LEFT_PCT = (COL_PT.slice(0, 14).reduce((a, b) => a + b, 0) / TOTAL_PT) * 100;

const K1 = [
  [2, '0.8862'],
  [3, '0.5908'],
] as const;
const K3 = [
  [2, '0.7071'],
  [3, '0.5231'],
  [4, '0.4467'],
  [5, '0.4030'],
  [6, '0.3742'],
  [7, '0.3534'],
  [8, '0.3375'],
  [9, '0.3249'],
  [10, '0.3146'],
] as const;

/** 엑셀 V29 의 문구. 서버 판정을 그대로 옮긴다 */
const JUDGMENT_TEXT: Record<GaugeRrJudgment, string> = {
  OK: 'Gage system O.K',
  CONDITIONAL: 'Gage system may be acceptable',
  NG: 'Gage system needs improvement',
};

const BLUE = 'text-[#0000ff]';
const YELLOW = 'bg-[#ffff00]';

/**
 * 테두리. 글자 하나가 한 변이다 — 소문자 가는 선, 대문자 굵은 선.
 *   t/T 위 · b/B 아래 · l/L 왼쪽 · r/R 오른쪽
 */
const BORDER: Record<string, string> = {
  t: 'border-t',
  T: 'border-t-2',
  b: 'border-b',
  B: 'border-b-2',
  l: 'border-l',
  L: 'border-l-2',
  r: 'border-r',
  R: 'border-r-2',
};

function C({
  s = 1,
  bd = '',
  className = '',
  children,
}: {
  s?: number;
  bd?: string;
  className?: string;
  children?: ReactNode;
}) {
  const border = [...bd].map((ch) => BORDER[ch] ?? '').join(' ');
  return (
    <td colSpan={s} className={`${border} ${className}`}>
      {children}
    </td>
  );
}

/** 빈 줄. 엑셀의 1·3·6·15행 */
const Gap = ({ h = 'h-[6pt]' }: { h?: string }) => (
  <tr>
    <td colSpan={25} className={h} />
  </tr>
);

/**
 * 한 줄씩 꺼내 쓰는 칸 묶음. 배열로 그리지 않고 left·mu·tl 을 같은 번호끼리 한 행에
 * 넣으므로 key 가 필요 없다 — 배열 글자로 적으면 린트가 key 를 요구해 함수로 받는다.
 */
const slots = (...cells: ReactNode[]): ReactNode[] => cells;

const f = (v: number | null | undefined, digits: number): string =>
  v == null || !Number.isFinite(v) ? '' : v.toFixed(digits);

/** 소수 자리 수. 20.5 → 1 */
const decimalsOf = (v: number): number => {
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

export default function GaugeRrPrintSheet({ d }: { d: GaugeRrDetail }) {
  const r = d.results;
  const k = d.constants;
  /* 엑셀 서식은 0.00 이다. 더 잘게 잰 값이 있으면 그 자리까지 보인다 */
  const vd = Math.max(2, ...d.measurements.flat(2).map(decimalsOf));
  const names = [0, 1, 2].map((i) => d.appraisers[i] ?? '');
  const lower = d.specLower == null ? '' : d.specLower.toFixed(2);
  const upper = d.specUpper == null ? '' : d.specUpper.toFixed(2);

  /* ---------- 왼쪽 측정값 (A~N, 엑셀 16~38행) ---------- */

  const left: ReactNode[] = [];
  left.push(
    <>
      <C s={2} bd="TL" className="font-bold">
        APPRAISER/
      </C>
      <C s={10} bd="Tlb" className="text-center font-bold">
        PART
      </C>
      <C s={2} bd="TlR" className="text-center font-bold">
        AVERAGE
      </C>
    </>,
    <>
      <C s={2} bd="Lb" className="font-bold">
        TRIAL #
      </C>
      {Array.from({ length: 10 }, (_, p) => (
        <C key={p} bd="lb" className="text-center font-bold">
          {p + 1}
        </C>
      ))}
      <C s={2} bd="lRb" />
    </>,
  );

  for (let a = 0; a < 3; a += 1) {
    const block = d.appraiserBlocks[a];
    const base = a * 5;
    for (let t = 0; t < 3; t += 1) {
      const row = d.measurements[a]?.[t];
      const avg = block?.trialAverages[t];
      left.push(
        <>
          <C bd="Lb">
            {base + t + 1}.{t === 0 && <span className="ml-[4pt]">{'ABC'[a]}</span>}
          </C>
          <C bd="b" className="text-right">
            {t + 1}
          </C>
          {Array.from({ length: 10 }, (_, p) => (
            <C key={p} bd="lb" className={`text-right ${BLUE}`}>
              {f(row?.[p], vd)}
            </C>
          ))}
          <C bd="lb" />
          <C bd="Rb" className="text-right">
            {f(avg, 3)}
          </C>
        </>,
      );
    }
    left.push(
      <>
        <C bd="Lb">{base + 4}.</C>
        <C bd="b" className="text-right">
          AVE
        </C>
        {Array.from({ length: 10 }, (_, p) => (
          <C key={p} bd="lb" className="text-right">
            {f(block?.partAverages[p], vd)}
          </C>
        ))}
        <C bd="lb" className="text-right">
          x<sub>{'abc'[a]}</sub>=
        </C>
        <C bd="Rb" className="text-right">
          {f(block?.average, 3)}
        </C>
      </>,
      <>
        <C bd="Lb">{base + 5}.</C>
        <C bd="b" className="text-right">
          R
        </C>
        {Array.from({ length: 10 }, (_, p) => (
          <C key={p} bd="lb" className="text-right">
            {f(block?.partRanges[p], vd)}
          </C>
        ))}
        <C bd="lb" className="text-right">
          r<sub>{'abc'[a]}</sub>=
        </C>
        <C bd="Rb" className="text-right">
          {f(block?.averageRange, 3)}
        </C>
      </>,
    );
  }

  left.push(
    <>
      <C s={2} bd="L">
        16. PART
      </C>
      <C s={10} bd="l" />
      <C bd="lb" className="text-right">
        X=
      </C>
      <C bd="Rb" className="text-right">
        {f(d.grandMean, 3)}
      </C>
    </>,
    <>
      <C s={2} bd="Lb" className="text-right">
        AVE ( Xp )
      </C>
      {Array.from({ length: 10 }, (_, p) => (
        <C key={p} bd="lb" className="text-right">
          {f(d.partAverages[p], vd)}
        </C>
      ))}
      <C bd="lb" className="text-right">
        R<sub>p</sub>=
      </C>
      <C bd="Rb" className="text-right">
        {f(d.rp, 3)}
      </C>
    </>,
  );

  const summary: [string, ReactNode, ReactNode, number][] = [
    ['17.', <>(r<sub>a</sub> + r<sub>b</sub> + r<sub>c</sub>) / (# OF APPRAISERS) =</>, <>R=</>, d.rBar],
    ['18.', <>(Max x - Min x) =</>, <>x<sub>DIFF</sub>=</>, d.xDiff],
    ['19.', <>R x D<sub>4</sub>* =</>, <>UCL<sub>R</sub>=</>, d.uclr],
    ['20.', <>R x D<sub>3</sub>* =</>, <>LCL<sub>R</sub>=</>, d.lclr],
  ];
  summary.forEach(([no, label, sym, v], i) => {
    const last = i === summary.length - 1;
    left.push(
      <>
        <C bd={last ? 'LB' : 'Lb'}>{no}</C>
        <C s={11} bd={last ? 'B' : 'b'} className="text-[9pt]">
          {label}
        </C>
        <C bd={last ? 'lB' : 'lb'} className="text-right">
          {sym}
        </C>
        <C bd={last ? 'RB' : 'Rb'} className="text-right">
          {f(v, 4)}
        </C>
      </>,
    );
  });

  /* ---------- 오른쪽 분석 (O~U) ---------- */

  const t3 = (v: number) => v.toFixed(3);
  /** K 표 칸 — 가는 선 상자 */
  const kc = (content: ReactNode, bold = false, bd = 'tlbr') => (
    <C bd={bd} className={bold ? 'text-center font-bold' : 'text-right'}>
      {content}
    </C>
  );
  const eq = <C className="text-center">=</C>;

  const mu: ReactNode[] = slots(
    <C key="h" s={7} bd="TLRb" className="text-center text-[10pt] font-bold">
      Measurement Unit Analysis
    </C>,
    <C s={7} bd="LR" className="font-bold">
      Repeatability - Equipment Variation (EV)
    </C>,
    <>
      <C bd="L">EV</C>
      {eq}
      <C s={3} className="text-[9pt]">
        R &nbsp;x&nbsp; K<sub>1</sub>
      </C>
      {kc('Trials', true)}
      {kc('K1', true, 'tlbR')}
    </>,
    <>
      <C bd="L" />
      {eq}
      <C s={3}>
        {t3(d.rBar)} x {k.k1.toFixed(4)}
      </C>
      {kc(K1[0][0])}
      {kc(K1[0][1], false, 'tlbR')}
    </>,
    <>
      <C bd="L" />
      {eq}
      <C s={3}>{t3(r.ev)}</C>
      {kc(K1[1][0])}
      {kc(K1[1][1], false, 'tlbR')}
    </>,
    <C s={7} bd="tLR" className="font-bold">
      Reproducibility - Appraiser Variation (AV)
    </C>,
    <>
      <C bd="L">AV</C>
      {eq}
      <C s={5} bd="R">
        {'{'}(x<sub>DIFF</sub> x K<sub>2</sub>)<sup>2</sup> - (EV<sup>2</sup>/nr){'}'}
        <sup>1/2</sup>
      </C>
    </>,
    <>
      <C bd="L" />
      {eq}
      <C s={5} bd="R">
        {`{(${t3(d.xDiff)} x ${k.k2.toFixed(4)})^2 - (${t3(r.ev)} ^2/(${d.parts} x ${d.trials}))}^1/2`}
      </C>
    </>,
    <>
      <C bd="L" />
      {eq}
      <C s={2}>{t3(r.av)}</C>
      {kc(<span className="text-[5.5pt]">Appraisers</span>, true)}
      {kc('2', true)}
      {kc('3', true, 'tlbR')}
    </>,
    <>
      <C s={2} bd="L" className="text-[6.5pt]">
        n = number of parts
      </C>
      <C s={2} className="text-[6.5pt]">
        r = number of trials
      </C>
      {kc(
        <>
          K<sub>2</sub>
        </>,
        true,
      )}
      {kc('0.7071')}
      {kc('0.5231', false, 'tlbR')}
    </>,
    <C s={7} bd="tLR" className="font-bold">
      Repeatability &amp; Reproducibility (R &amp; R)
    </C>,
    <>
      <C bd="L">R &amp; R</C>
      {eq}
      <C s={5} bd="R">
        {'{'}(EV<sup>2</sup> + AV<sup>2</sup>){'}'}
        <sup>1/2</sup>
      </C>
    </>,
    <>
      <C bd="L" />
      {eq}
      <C s={5} bd="R">{`{(${t3(r.ev)}^2 + ${t3(r.av)}^2)}^1/2`}</C>
    </>,
    <>
      <C bd="L" />
      {eq}
      <C s={3}>{t3(r.grr)}</C>
      {kc('Parts', true)}
      {kc(
        <>
          K<sub>3</sub>
        </>,
        true,
        'tlbR',
      )}
    </>,
    ...K3.map(([parts, k3], i) => {
      const lines: Record<number, ReactNode> = {
        0: (
          <C s={5} bd="tL" className="font-bold">
            Part Variation (PV)
          </C>
        ),
        1: (
          <>
            <C bd="L">PV</C>
            {eq}
            <C s={3}>
              R<sub>P</sub> x K<sub>3</sub>
            </C>
          </>
        ),
        2: (
          <>
            <C bd="L" />
            {eq}
            <C s={3}>
              {t3(d.rp)} x {k.k3.toFixed(4)}
            </C>
          </>
        ),
        3: (
          <>
            <C bd="L" />
            {eq}
            <C s={3}>{t3(r.pv)}</C>
          </>
        ),
        4: (
          <C s={5} bd="tL" className="font-bold">
            TV
          </C>
        ),
        5: (
          <>
            <C bd="L">TV</C>
            {eq}
            <C s={3}>
              {'{'}(R &amp; R<sup>2</sup> + PV<sup>2</sup>){'}'}
              <sup>1/2</sup>
            </C>
          </>
        ),
        6: (
          <>
            <C bd="L" />
            {eq}
            <C s={3}>{`{(${t3(r.grr)}^2 + ${t3(r.pv)}^2)}^1/2`}</C>
          </>
        ),
        7: (
          <>
            <C bd="L" />
            {eq}
            <C s={3}>{t3(r.tv)}</C>
          </>
        ),
        8: <C s={5} bd="LB" />,
      };
      const last = i === K3.length - 1;
      return (
        <>
          {lines[i]}
          {kc(parts, false, last ? 'tlB' : 'tlb')}
          {kc(k3, false, last ? 'tlBR' : 'tlbR')}
        </>
      );
    }),
  );

  /* ---------- 오른쪽 % Tolerance (V~Y) ---------- */

  const tol = (
    label: ReactNode,
    value: ReactNode,
    opts: { hl?: boolean; last?: boolean } = {},
  ) => (
    <>
      <C bd={opts.last ? 'LB' : 'L'}>{label}</C>
      <C bd={opts.last ? 'B' : ''} className="text-center">
        {value === '' ? '' : '='}
      </C>
      <C s={2} bd={opts.last ? 'RB' : 'R'} className={opts.hl ? YELLOW : ''}>
        {value}
      </C>
    </>
  );
  const pct = (part: number) => `100(${t3(part)}/${t3(r.tv)})`;
  const blank = (bd = 'LR') => <C s={4} bd={bd} />;

  const tl: ReactNode[] = slots(
    <C s={4} bd="TLRb" className="text-center text-[10pt] font-bold">
      % Tolerance (Tol)
    </C>,
    blank(),
    tol('% EV', '100 (EV/TV)'),
    tol('', pct(r.ev)),
    tol('', f(r.pctEv, 2)),
    blank(),
    tol('% AV', '100 (AV/TV)'),
    tol('', pct(r.av)),
    tol('', f(r.pctAv, 2), { hl: true }),
    blank(),
    tol('% R&R', '100 (R&R/TV)'),
    tol('', pct(r.grr)),
    tol('', f(r.pctGrr, 2), { hl: true }),
    <C s={4} bd="LR" className={`text-center font-bold italic ${YELLOW}`}>
      {JUDGMENT_TEXT[d.judgment]}
    </C>,
    tol('% PV', '100 (PV/TV)'),
    tol('', pct(r.pv)),
    tol('', f(r.pctPv, 2)),
    blank(),
    tol('ndc', '1.41 (PV/R & R)'),
    tol('', `1.41(${t3(r.pv)}/${t3(r.grr)})`),
    tol('', f(r.ndc, 2), { hl: true }),
    blank(),
    blank('LRB'),
  );

  return (
    <div
      style={{ fontFamily: 'Arial, sans-serif' }}
      className="hidden text-[8pt] text-black [print-color-adjust:exact] print:block [&_td]:px-[2pt] [&_td]:py-0 [&_td]:leading-[1.3] [&_td]:whitespace-nowrap [&_td]:border-black"
      aria-hidden
    >
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          {COL_PT.map((w, i) => (
            <col key={i} style={{ width: `${(w / TOTAL_PT) * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={25} className="pt-[4pt] pb-[6pt] text-center text-[12pt]">
              Measure System Evaluation Report
            </td>
          </tr>
          <tr>
            <td colSpan={25} className="text-center text-[11pt] font-bold">
              GAGE REPEATABILITY AND REPRODUCIBILITY DATA SHEET
            </td>
          </tr>
          <tr>
            <td colSpan={25} className="text-center text-[11pt] font-bold">
              VARIABLE DATA RESULTS
            </td>
          </tr>
          <Gap />

          {/* ---------- 머리 (7~14행). 오른쪽은 왼쪽을 옮겨 적은 사본이다 ---------- */}
          <tr className="text-[6.5pt]">
            <C s={5} bd="TL">Part Number</C>
            <C s={4} bd="Tl">Gage Name</C>
            <C s={5} bd="TlR">Appraiser A</C>
            <C s={3} bd="TL">Part Number</C>
            <C s={4} bd="Tl">Gage Name</C>
            <C s={4} bd="TlR">Appraiser A</C>
          </tr>
          <tr className={BLUE}>
            <C s={5} bd="L">{d.partNumber}</C>
            <C s={4} bd="l" className="text-center">{d.gageName}</C>
            <C s={5} bd="lR" className="text-center">{names[0]}</C>
            <C s={3} bd="L">{d.partNumber}</C>
            <C s={4} bd="l">{d.gageName}</C>
            <C s={4} bd="lR" className="text-center">{names[0]}</C>
          </tr>
          <tr className="text-[6.5pt]">
            <C s={5} bd="tL">Part Name</C>
            <C s={4} bd="tl">Gage Number</C>
            <C s={5} bd="tlR">Appraiser B</C>
            <C s={3} bd="tL">Part Name</C>
            <C s={4} bd="tl">Gage Number</C>
            <C s={4} bd="tlR">Appraiser B</C>
          </tr>
          <tr className={BLUE}>
            <C s={5} bd="L">{d.partName}</C>
            <C s={4} bd="l" className="text-center">{d.gageNumber ?? ''}</C>
            <C s={5} bd="lR" className="text-center">{names[1]}</C>
            <C s={3} bd="L">{d.partName}</C>
            <C s={4} bd="l" className="text-center">{d.gageNumber ?? ''}</C>
            <C s={4} bd="lR" className="text-center">{names[1]}</C>
          </tr>
          <tr className="text-[6.5pt]">
            <C s={3} bd="tL">Characteristic</C>
            <C s={2} bd="t" className="text-right">Specification</C>
            <C s={4} bd="tl">Gage Type</C>
            <C s={5} bd="tlR">Appraiser C</C>
            <C s={3} bd="tL">Characteristic</C>
            <C s={4} bd="tl">Gage Type</C>
            <C s={4} bd="tlR">Appraiser C</C>
          </tr>
          <tr className={BLUE}>
            <C s={3} bd="L">{d.characteristic ?? ''}</C>
            <C className="text-right text-[6.5pt]">{lower}</C>
            <C className="text-right text-[6.5pt]">{upper}</C>
            <C s={4} bd="l" className="text-center">{d.gageType ?? ''}</C>
            <C s={5} bd="lR" className="text-center">{names[2]}</C>
            <C s={3} bd="L">{d.characteristic ?? ''}</C>
            <C s={4} bd="l">{d.gageType ?? ''}</C>
            <C s={4} bd="lR" className="text-center">{names[2]}</C>
          </tr>
          <tr className="text-[6.5pt]">
            <C s={5} bd="tL">Characteristic Classification</C>
            <C s={2} bd="tl">Trials</C>
            <C s={2} bd="tl">Parts</C>
            <C s={2} bd="tl">Appraisers</C>
            <C s={3} bd="tlR">Date Performed</C>
            <C s={3} bd="tL">Characteristic Classification</C>
            <C s={2} bd="tl">Trials</C>
            <C s={2} bd="tl">Parts</C>
            <C s={2} bd="tl">Appraisers</C>
            <C s={2} bd="tlR">Date Performed</C>
          </tr>
          <tr>
            <C s={5} bd="LB" className={BLUE}>{d.characteristicClass ?? ''}</C>
            <C s={2} bd="lB" className="text-center">{d.trials}</C>
            <C s={2} bd="lB" className="text-right">{d.parts}</C>
            <C s={2} bd="lB" className="text-center">{d.appraisers.length}</C>
            <C s={3} bd="lRB" className={`text-right ${BLUE}`}>{d.performedDate}</C>
            <C s={3} bd="LB" className={BLUE}>{d.characteristicClass ?? ''}</C>
            <C s={2} bd="lB" className="text-center">{d.trials}</C>
            <C s={2} bd="lB" className="text-right">{d.parts}</C>
            <C s={2} bd="lB" className="text-center">{d.appraisers.length}</C>
            <C s={2} bd="lRB" className={BLUE}>{d.performedDate}</C>
          </tr>
          <Gap h="h-[10pt]" />

          {/* ---------- 본문 (16~38행) ---------- */}
          {left.map((l, i) => (
            <tr key={i}>
              {l}
              {mu[i]}
              {tl[i]}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- 주석 (39~45행) ---------- */}
      <div className="mt-[3pt] flex text-[6pt] leading-[1.45]">
        <div style={{ width: `${LEFT_PCT}%` }} className="pr-[6pt]">
          <p className="mt-[8pt]">
            * D<sub>4</sub> =3.27 for 2 trials and 2.58 for 3 trials;&nbsp; D<sub>3</sub> = 0 for up
            to 7 trials.&nbsp; UCL<sub>R</sub> represents the limit of individual R&apos;s.&nbsp;
            Circle those that are beyond this limit.&nbsp; Identify the cause and correct.&nbsp;
            Repeat these readings using the same appraiser and unit as originally used or discard
            values and re-average and recompute R and the limiting value from the remaining
            observations.
          </p>
          <p className="mt-[10pt] flex items-end gap-[4pt]">
            Notes:
            <span className="flex-1 border-b border-black">{d.remark ?? ''}</span>
          </p>
        </div>
        <div className="flex-1">
          <p>
            All calculations are based upon predicting 5.15 sigma (99.0% of the area under the
            normal distribution curve).
          </p>
          <p>
            K<sub>1</sub> is 5.15/d<sub>2</sub>, where d<sub>2</sub> is dependent on the number of
            trials (m) and the number if parts times the number of operators (g) which is assumed to
            be greater than 15.
          </p>
          <p>
            AV - If a negative value is calculated under the square root sign, the appraiser
            variation (AV) defaults to zero (0).
          </p>
          <p>
            K<sub>2</sub> is 5.15/d<sub>2</sub>, where d<sub>2</sub> is dependent on the number of
            operators (m) and (g) is 1, since there is only one range calculation.
          </p>
          <p>
            K<sub>3</sub> is 5.15/d<sub>2</sub>, where d<sub>2</sub> is dependent on the number of
            parts (m) and (g) is 1, since there is only one range calculation.
          </p>
          <p>
            d<sub>2</sub> is obtained from Table D<sub>3</sub>, &quot;Quality Control and Industrial
            Statistics&quot;, A.J. Duncan.
          </p>
        </div>
      </div>
    </div>
  );
}
