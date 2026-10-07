import { request } from './client';
import type { IsoDate } from './types';

/**
 * 게이지 R&R. 품질팀 "GAUGE R&R 데이터" 엑셀 양식 한 장이 한 건이다.
 *
 * 양식의 파란 칸(입력값)만 보내고, 평균·범위·EV·AV·R&R·PV·TV·%·ndc 는 서버가
 * 계산해 상세 응답에 내려준다 — 화면에서 계산하지 않는다 (백엔드 안내, PR #67).
 * 숫자는 반올림 없이 오므로 표시할 때 domain/gaugeRr.ts 의 포맷으로 자른다.
 *
 * 쓰기는 instrument 롤, 조회는 누구나. 삭제는 다른 삭제와 같이 하위 권한이면 202 승인 대기다.
 */

/** %R&R 판정. 10% 미만 양호, 10~30% 조건부, 30% 초과 부적합 */
export type GaugeRrJudgment = 'OK' | 'CONDITIONAL' | 'NG';

/** 목록 한 줄 — 머리 정보와 결과 요약 */
export interface GaugeRrSummary {
  id: number;
  performedDate: IsoDate;
  partNumber: string;
  partName: string;
  characteristic: string | null;
  gageName: string;
  gageNumber: string | null;
  instrumentId: number | null;
  instrumentMgmtNo: string | null;
  /** A, B, C 순 */
  appraisers: string[];
  trials: number;
  parts: number;
  /** %R&R (TV 기준) */
  pctGrr: number | null;
  ndc: number | null;
  judgment: GaugeRrJudgment | null;
  /** 양호 / 조건부 사용 / 부적합 */
  judgmentLabel: string | null;
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
  partNumber: string;
  partName: string;
  characteristic: string | null;
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
  /** [측정자][반복][부품] */
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
}

/**
 * 등록·수정 본문. 수정(PATCH)도 부분 수정이 아니라 이 본문을 통째로 보낸다 — 양식을 다시 쓰는 것이다.
 * measurements 크기는 appraisers 수 × trials × parts 와 정확히 맞아야 한다.
 */
export interface SaveGaugeRrPayload {
  instrumentId?: number;
  partNumber: string;
  partName: string;
  characteristic?: string;
  characteristicClass?: string;
  specLower?: number;
  specUpper?: number;
  gageName: string;
  gageNumber?: string;
  gageType?: string;
  /** 2~3명 */
  appraisers: string[];
  /** 2~3 */
  trials: number;
  /** 2~10 */
  parts: number;
  performedDate: IsoDate;
  remark?: string;
  measurements: number[][][];
}

export interface GaugeRrListQuery {
  from?: IsoDate;
  to?: IsoDate;
  partNumber?: string;
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
};
