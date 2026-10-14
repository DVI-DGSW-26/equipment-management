import { request } from './client';
import type { IsoDate } from './types';

/**
 * 게이지 R&R. 품질팀 "GAUGE R&R 데이터" 엑셀 양식 한 장이 한 건이다.
 *
 * 양식의 파란 칸(입력값)만 보내고, 평균·범위·EV·AV·R&R·PV·TV·%·ndc 는 서버가
 * 계산해 상세 응답에 내려준다 — 화면에서 계산하지 않는다 (백엔드 안내, PR #67).
 * 숫자는 반올림 없이 오므로 표시할 때 domain/gaugeRr.ts 의 포맷으로 자른다.
 *
 * 양식은 측정자 3명 × 반복 3회 × 시료 10개로 고정이다 (품질팀 최종본, 백엔드 회신 2026-10-14).
 * 그래서 요청에 trials·parts·characteristic 이 없다. 모양이 다르면 400 이다.
 *
 * 쓰기는 instrument 롤, 조회는 누구나. 삭제(기록·계획 줄)는 다른 삭제와 같이 하위 권한이면 202 승인 대기다.
 */

/** %R&R 판정. 10% 미만 양호, 10~30% 조건부, 30% 초과 부적합 */
export type GaugeRrJudgment = 'OK' | 'CONDITIONAL' | 'NG';

/** 목록 한 줄 — 머리 정보와 결과 요약 */
export interface GaugeRrSummary {
  id: number;
  performedDate: IsoDate;
  partNumber: string;
  partName: string;
  gageName: string;
  gageNumber: string | null;
  instrumentId: number | null;
  instrumentMgmtNo: string | null;
  /** A, B, C 순 */
  appraisers: string[];
  /** %R&R (TV 기준) */
  pctGrr: number | null;
  ndc: number | null;
  judgment: GaugeRrJudgment | null;
  /** 양호 / 조건부 사용 / 부적합 */
  judgmentLabel: string | null;
  /** %R&R 10 초과 사유 (있을 때만) */
  exceedReason: string | null;
}

/** 측정자 한 사람 몫 — 양식의 AVE·R 행과 xa=·ra= */
export interface GaugeRrAppraiserBlock {
  /** 1부터 */
  appraiser: number;
  name: string;
  /** 부품별 반복 평균 (AVE 행) */
  partAverages: number[];
  /** 부품별 범위 (R 행) */
  partRanges: number[];
  /** 회차별 평균 — 회차 행 끝의 AVERAGE 칸 (엑셀 N18 등) */
  trialAverages: number[];
  /** x̄a */
  average: number;
  /** r̄a */
  averageRange: number;
}

/** 양식 오른쪽 결과 칸 */
export interface GaugeRrResults {
  ev: number;
  av: number;
  grr: number;
  pv: number;
  tv: number;
  pctEv: number;
  pctAv: number;
  pctGrr: number;
  pctPv: number;
  ndc: number;
  /** 규격 공차 (상한−하한). 규격이 없으면 null */
  tolerance: number | null;
  /** 100 × R&R / 공차. 규격이 없으면 null */
  pctGrrOfTolerance: number | null;
}

/** 양식 한 장 전체 — 입력칸과 서버가 계산한 모든 칸 */
export interface GaugeRrDetail {
  id: number;
  instrumentId: number | null;
  instrumentMgmtNo: string | null;
  /** 연결된 계획표 줄 */
  planId: number | null;
  partNumber: string;
  partName: string;
  characteristicClass: string | null;
  specLower: number | null;
  specUpper: number | null;
  gageName: string;
  gageNumber: string | null;
  gageType: string | null;
  appraisers: string[];
  trials: number;
  parts: number;
  performedDate: IsoDate;
  remark: string | null;
  /** %R&R 10 초과 사유 */
  exceedReason: string | null;
  /** [측정자][반복][시료] */
  measurements: number[][][];
  appraiserBlocks: GaugeRrAppraiserBlock[];
  /** 부품별 전체 평균 Xp (PART AVE 행) */
  partAverages: number[];
  /** X̿ */
  grandMean: number;
  rp: number;
  rBar: number;
  xDiff: number;
  /** 범위 관리 상한. 이를 넘는 R 은 다시 재야 한다 */
  uclr: number;
  lclr: number;
  constants: { k1: number; k2: number; k3: number; d4: number };
  results: GaugeRrResults;
  judgment: GaugeRrJudgment;
  judgmentLabel: string;
  /** %R&R 이 10 을 넘어 사유가 필요한 상태인가. 미리보기에서 사유 칸을 띄우는 데 쓴다 */
  exceeded?: boolean;
}

/**
 * 등록·수정·미리보기 본문. 수정(PATCH)도 부분 수정이 아니라 이 본문을 통째로 보낸다 — 양식을 다시 쓰는 것이다.
 * measurements 는 [3][3][10] 이어야 한다.
 */
export interface SaveGaugeRrPayload {
  instrumentId?: number;
  /** 주면 그 계획표 줄의 실적이 된다. 이미 다른 기록이 연결된 계획이면 409 */
  planId?: number;
  partNumber: string;
  partName: string;
  characteristicClass?: string;
  specLower?: number;
  specUpper?: number;
  gageName: string;
  gageNumber?: string;
  gageType?: string;
  /** 3명 */
  appraisers: string[];
  performedDate: IsoDate;
  remark?: string;
  /** %R&R 이 10 을 넘으면 필수. 없으면 저장이 막힌다 */
  exceedReason?: string;
  measurements: number[][][];
}

export interface GaugeRrListQuery {
  from?: IsoDate;
  to?: IsoDate;
  partNumber?: string;
}

/**
 * 연간 계획표 한 줄. 계획과 그 실적이 한 줄에 같이 온다 — 계획월(●)과 실적월을 한 표에 그린다.
 * 실적은 R&R 기록을 등록·수정할 때 planId 로 잇는다. 이 줄에서는 실적을 바꾸지 못한다.
 */
export interface GaugeRrPlan {
  id: number;
  planYear: number;
  /** 대장 NO */
  seq: number;
  /** 제품 (양식의 품명) */
  product: string;
  /** 제품 규격 (양식 품명 둘째 줄) */
  productSpec: string | null;
  partNo: string;
  gageName: string;
  gageSerial: string | null;
  /** 항목 (외경 등) */
  item: string | null;
  /** 1~12 */
  plannedMonth: number;
  remark: string | null;
  /** 실적이 연결됐는가 */
  done: boolean;
  /** 실적 — 연결된 R&R 기록 */
  studyId: number | null;
  performedDate: IsoDate | null;
  performedMonth: number | null;
  pctGrr: number | null;
  ndc: number | null;
  judgment: GaugeRrJudgment | null;
  judgmentLabel: string | null;
}

/** 계획 줄 등록·수정 본문. 수정에서 연도는 바꿀 수 없다 */
export interface SaveGaugeRrPlanPayload {
  planYear: number;
  /** 비우면 그 해의 다음 번호. 같은 해에 겹치면 409 */
  seq?: number;
  product: string;
  productSpec?: string;
  partNo: string;
  gageName: string;
  gageSerial?: string;
  item?: string;
  plannedMonth: number;
  remark?: string;
}

export const gaugeRrApi = {
  /** 페이지 없이 전부 온다 */
  list: (query: GaugeRrListQuery = {}) =>
    request<GaugeRrSummary[]>('GET', '/gauge-rr', { query }),
  detail: (id: number) => request<GaugeRrDetail>('GET', `/gauge-rr/${id}`),
  /** 응답에 계산 결과까지 온다 — 저장 직후 바로 양식을 채울 수 있다 */
  create: (body: SaveGaugeRrPayload) => request<GaugeRrDetail>('POST', '/gauge-rr', { body }),
  update: (id: number, body: SaveGaugeRrPayload) =>
    request<GaugeRrDetail>('PATCH', `/gauge-rr/${id}`, { body }),
  remove: (id: number) => request<void>('DELETE', `/gauge-rr/${id}`),
  /**
   * 저장하지 않고 계산만. 등록과 같은 검증을 거쳐서 필수 머리 정보와 측정값 90칸이 다 차야
   * 결과가 온다 — 그 전에 부르면 400 이다.
   */
  preview: (body: SaveGaugeRrPayload) =>
    request<GaugeRrDetail>('POST', '/gauge-rr/preview', { body }),

  /** 계획이 있는 연도. 최근 연도부터 */
  planYears: () => request<number[]>('GET', '/gauge-rr/plans/years'),
  /** 그 해 계획표 전부, NO 순 */
  plans: (year: number) => request<GaugeRrPlan[]>('GET', '/gauge-rr/plans', { query: { year } }),
  createPlan: (body: SaveGaugeRrPlanPayload) =>
    request<GaugeRrPlan>('POST', '/gauge-rr/plans', { body }),
  updatePlan: (id: number, body: SaveGaugeRrPlanPayload) =>
    request<GaugeRrPlan>('PATCH', `/gauge-rr/plans/${id}`, { body }),
  /** 줄만 지운다. 이어진 R&R 기록은 남는다 */
  removePlan: (id: number) => request<void>('DELETE', `/gauge-rr/plans/${id}`),
};
