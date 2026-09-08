import { ASSET_STATUS_LABEL, DEPRECIATION_METHOD_LABEL, EXPENSE_TYPE_LABEL } from '@/api/assets';
import { CALIBRATION_RESULT_LABEL } from '@/api/calibrations';
import { EQUIPMENT_STATUS_LABEL } from '@/api/inspections';
import { PARTNER_TYPE_LABEL } from '@/api/instrumentMasters';
import { INSTRUMENT_DEPARTMENT_LABEL } from '@/api/instruments';
import { ALERT_TYPE_LABEL } from '@/api/notifications';
import { fmtDate } from '@/lib/date';
import { won } from '@/lib/won';

/**
 * 승인 요청을 사람 말로 옮긴다.
 *
 * 서버는 원 요청을 그대로 보관하므로 화면에 오는 것은 "PATCH /asset/12/tax-record" 와
 * JSON 본문이다. 승인하는 사람이 그것을 읽고 판단할 수는 없다(2026-09-09 요청).
 * 그래서 무엇을 하려는 요청인지와 어떤 칸에 무엇을 넣었는지를 한글로 적는다.
 *
 * 이름은 Swagger 의 각 API summary·필드 설명을 그대로 따른다 — 백엔드와 같은 말을
 * 써야 물어볼 때 서로 무엇을 가리키는지 안다.
 */

interface Rule {
  /** 빈 값이면 메서드를 가리지 않는다 */
  method?: string;
  re: RegExp;
  what: string;
}

/**
 * 위에서부터 먼저 맞는 것을 쓴다 — 좁은 규칙(.../discard)이 넓은 규칙(...{id})보다 앞이다.
 * 숫자 자리는 \d+ 로 두어 어떤 대상이든 맞는다.
 */
const RULES: Rule[] = [
  /* 고정자산 */
  { method: 'POST', re: /^\/asset$/, what: '고정자산 등록' },
  { method: 'PATCH', re: /^\/asset\/\d+\/correction$/, what: '고정자산 회계 정정' },
  { method: 'PATCH', re: /^\/asset\/\d+\/tax-record$/, what: '고정자산 추가등록사항(세무 기록) 수정' },
  { method: 'POST', re: /^\/asset\/\d+\/additions$/, what: '자본적지출(신규취득및증가) 등록' },
  { method: 'DELETE', re: /^\/asset\/\d+\/additions\/\d+$/, what: '자본적지출 삭제' },
  { method: 'PATCH', re: /^\/asset\/\d+$/, what: '고정자산 수정' },
  { method: 'DELETE', re: /^\/asset\/\d+$/, what: '고정자산 폐기 처리' },
  { method: 'POST', re: /^\/asset\/sticker$/, what: '고정자산 스티커 출력' },
  { method: 'POST', re: /^\/asset\/account$/, what: '계정과목 등록' },
  { method: 'PATCH', re: /^\/asset\/account\/\d+$/, what: '계정과목 수정' },
  { method: 'DELETE', re: /^\/asset\/account\/\d+$/, what: '계정과목 삭제' },

  /* 실물자산 */
  { method: 'POST', re: /^\/physical-asset$/, what: '실물자산 등록' },
  { method: 'POST', re: /^\/physical-asset\/sticker$/, what: '실물자산 스티커 출력' },
  { method: 'PATCH', re: /^\/physical-asset\/\d+$/, what: '실물자산 수정' },
  { method: 'DELETE', re: /^\/physical-asset\/\d+$/, what: '실물자산 삭제' },

  /* 계측기 · 교정 */
  { method: 'POST', re: /^\/instrument$/, what: '계측기 등록' },
  { method: 'PATCH', re: /^\/instrument\/\d+\/discard$/, what: '계측기 폐기 처리' },
  { method: 'PATCH', re: /^\/instrument\/\d+\/restore$/, what: '계측기 폐기 취소' },
  { method: 'PATCH', re: /^\/instrument\/\d+$/, what: '계측기 수정' },
  { method: 'DELETE', re: /^\/instrument\/\d+$/, what: '계측기 완전 삭제' },
  { method: 'POST', re: /^\/calibration\/annual$/, what: '연간 교정계획 만들기' },
  { method: 'POST', re: /^\/calibration\/instrument\/\d+$/, what: '교정 이력 등록' },
  { method: 'PATCH', re: /^\/calibration\/\d+$/, what: '교정 이력 수정' },
  { method: 'DELETE', re: /^\/calibration\/\d+$/, what: '교정 이력 삭제' },

  /* 안전검사 */
  { method: 'POST', re: /^\/safety-equipment$/, what: '안전검사 대상 등록' },
  { method: 'POST', re: /^\/safety-equipment\/\d+\/inspections$/, what: '안전검사 결과 등록' },
  { method: 'PATCH', re: /^\/safety-equipment\/\d+\/inspections\/\d+$/, what: '안전검사 결과 수정' },
  { method: 'DELETE', re: /^\/safety-equipment\/\d+\/inspections\/\d+$/, what: '안전검사 결과 삭제' },
  { method: 'PATCH', re: /^\/safety-equipment\/\d+$/, what: '안전검사 대상 수정' },
  { method: 'DELETE', re: /^\/safety-equipment\/\d+$/, what: '안전검사 대상 삭제' },

  /* 감가상각 */
  { method: 'POST', re: /^\/depreciation\/calculate$/, what: '감가상각 계산 실행' },
  { method: 'POST', re: /^\/depreciation\/rate$/, what: '상각률 등록' },
  { method: 'PATCH', re: /^\/depreciation\/rate\/\d+$/, what: '상각률 수정' },

  /* 첨부 */
  { method: 'POST', re: /^\/attachment\//, what: '사진 · 첨부파일 올리기' },
  { method: 'DELETE', re: /^\/attachment\/\d+$/, what: '사진 · 첨부파일 삭제' },

  /* 알림 */
  { method: 'POST', re: /^\/notification\/alert\/send$/, what: '교정 알림 보내기' },
  { method: 'POST', re: /^\/notification\/safety-alert\/send$/, what: '안전검사 알림 보내기' },
  { method: 'PATCH', re: /^\/notification\/settings$/, what: '알림 발송 시점 수정' },
  { method: 'POST', re: /^\/notification-email$/, what: '알림 수신자 등록' },
  { method: 'PATCH', re: /^\/notification-email\/\d+$/, what: '알림 수신자 수정' },
  { method: 'DELETE', re: /^\/notification-email\/\d+$/, what: '알림 수신자 삭제' },

  /* 마스터 */
  { method: 'POST', re: /^\/asset-master\/category/, what: '자산구분 등록 (마스터)' },
  { method: 'PATCH', re: /^\/asset-master\/category/, what: '자산구분 수정 (마스터)' },
  { method: 'POST', re: /^\/asset-master\/item-type/, what: '비품구분 등록 (마스터)' },
  { method: 'PATCH', re: /^\/asset-master\/item-type/, what: '비품구분 수정 (마스터)' },
  { method: 'POST', re: /^\/asset-master\/item/, what: '품목 등록 (마스터)' },
  { method: 'PATCH', re: /^\/asset-master\/item/, what: '품목 수정 (마스터)' },
  { method: 'POST', re: /^\/asset-master\/location/, what: '위치 등록 (마스터)' },
  { method: 'PATCH', re: /^\/asset-master\/location/, what: '위치 수정 (마스터)' },
  { method: 'POST', re: /^\/asset-master\/department/, what: '부서 등록 (마스터)' },
  { method: 'PATCH', re: /^\/asset-master\/department/, what: '부서 수정 (마스터)' },
  { method: 'POST', re: /^\/location$/, what: '계측기 사용위치 등록 (마스터)' },
  { method: 'PATCH', re: /^\/location\/\d+$/, what: '계측기 사용위치 수정 (마스터)' },
  { method: 'DELETE', re: /^\/location\/\d+$/, what: '계측기 사용위치 삭제 (마스터)' },
  { method: 'POST', re: /^\/partner$/, what: '거래처 등록 (마스터)' },
  { method: 'PATCH', re: /^\/partner\/\d+$/, what: '거래처 수정 (마스터)' },
  { method: 'DELETE', re: /^\/partner\/\d+$/, what: '거래처 삭제 (마스터)' },
];

/** 못 알아본 요청에 쓸 말. 메서드만이라도 한글로 적는다 */
const METHOD_WORD: Record<string, string> = {
  POST: '등록',
  PATCH: '수정',
  PUT: '수정',
  DELETE: '삭제',
};

/**
 * "PATCH /asset/12/tax-record" → "고정자산 추가등록사항(세무 기록) 수정".
 *
 * 규칙에 없는 주소는 메서드만 옮겨 "등록 요청" 처럼 적는다. 새 API 가 붙었을 때
 * 영문 주소가 그대로 노출되는 것보다는 낫다.
 */
export const describeRequest = (method: string, path: string): string => {
  const clean = (path || '').split('?')[0].replace(/\/+$/, '');
  const m = (method || '').toUpperCase();
  const hit = RULES.find((r) => (!r.method || r.method === m) && r.re.test(clean));
  if (hit) return hit.what;
  return METHOD_WORD[m] ? `${METHOD_WORD[m]} 요청` : '요청';
};

/** 주소 안의 첫 번째 번호. "12번 대상" 처럼 어느 건인지 짚어 줄 때만 쓴다 */
export const targetNoOf = (path: string): string | null => {
  const m = (path || '').split('?')[0].match(/\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
};

/**
 * 본문 칸 이름. Swagger 의 필드 설명을 그대로 옮긴다.
 * 단위(원·개월)는 값 쪽에서 붙이므로 이름에는 넣지 않는다.
 */
const FIELD_LABEL: Record<string, string> = {
  /* 고정자산 */
  name: '이름',
  assetCode: '자산코드',
  categoryCode: '자산구분',
  itemTypeCode: '비품구분',
  itemCode: '품목',
  locationCode: '사용위치',
  usingDeptCode: '사용부서',
  managingDeptCode: '관리부서',
  accountId: '계정과목',
  acquisitionDate: '취득일자',
  acquisitionCost: '취득가액',
  quantity: '취득수량',
  expenseType: '경비구분',
  depreciationMethod: '상각방법',
  usefulLifeYears: '내용연수',
  depreciationRate: '상각률',
  openingFiscalYear: '개시 기준연도',
  openingAccumulatedDepreciation: '전기말상각누계액',
  status: '상태',
  excludedFromPrint: '목록표·스티커 출력 제외',
  supplier: '매입처',
  assignee: '담당자',
  modelName: '모델명',
  spec: '규격',
  equipmentCode: '설비코드',
  instrumentMgmtNo: '계측기 관리번호',
  disposalDate: '양도/폐기일',
  disposalAmount: '양도폐기금액',
  partialDisposalAmount: '부분매각및폐기',
  remark: '비고',
  reason: '사유',
  verified: '회계 담당자 확인',

  /* 자본적지출 */
  addedOn: '발생일',
  amount: '증가 금액',
  note: '메모',
  assetId: '연결 고정자산',

  /* 세무 기록 13종 */
  priorDisallowedAccumulated: '전기말부인누계',
  priorDeemedAccumulated: '전기말의제누계액',
  currentDeemedDepreciation: '당기의제상각액',
  specialDepreciationRate: '특별상각률',
  specialDepreciationAmount: '특별상각비',
  minTaxDisallowedAmount: '최저한세부인액',
  sincereBaseAmount: '성실기초가액',
  sincereAccumulated: '성실상각누계액',
  sincereYears: '성실경과/차감연수',
  sincereBookValue: '성실장부가액',
  specialCaseApplied: '특례적용',
  specialCaseYears: '특례년수',
  businessVehicle: '업무용승용차여부',

  /* 계측기 */
  mgmtNo: '관리번호',
  serialNo: 'S/NO',
  maker: '제작사',
  specText: '규격',
  accuracy: '정도 / 정확도',
  calibrationCycleMonths: '교정주기',
  department: '사용부서',
  departmentEtc: '사용부서 직접 입력',
  locationId: '사용위치',
  locationName: '사용위치',
  userName: '사용자',
  purchaseDate: '구매일',
  purchasePrice: '구매가격',
  supplierId: '구매처',
  supplierName: '구매처',
  discardedAt: '폐기일',

  /* 교정 이력 */
  planYear: '계획 연도',
  planDate: '교정계획일',
  performedDate: '교정실시일',
  result: '결과',
  repaired: '수리여부',
  agencyId: '의뢰처',
  certificateNo: '성적서 번호',
  cost: '교정비용',
  actionNote: '이상발생 조치',
  confirmedBy: '확인자',

  /* 실물자산 */
  maker2: '제조업체',
  rental: '렌탈',

  /* 안전검사 */
  modelNo: '형식번호',
  installLocation: '설치장소',
  capacity: '용량',
  installedAt: '최초 설치일',
  inspectionCycleMonths: '검사 주기',
  inspectionAgency: '검사기관',
  team: '담당반',
  inspectedAt: '검사일',
  validFrom: '검사유효 시작일',
  validUntil: '검사유효 만료일',

  /* 알림 · 마스터 */
  email: '이메일',
  alertTypes: '받을 알림',
  teams: '담당 팀',
  deptCode: '부서',
  partnerType: '거래처 구분',
  code: '코드',
  sortOrder: '정렬 순서',
  extra: '부가 정보',
  defaultUsefulLifeYears: '기본 내용연수',
  straightLineRate: '정액법 상각률',
  decliningBalanceRate: '정률법 상각률',
  calibrationDaysBefore: '교정 알림 시점',
  safetyDaysBefore: '안전검사 알림 시점',
  startPosition: '라벨지 시작 위치',
  ids: '대상',
};

/** 값 자체가 코드인 칸. 코드 그대로 보여 주면 무슨 뜻인지 알 수 없다 */
const VALUE_LABEL: Record<string, Record<string, string>> = {
  status: { ...ASSET_STATUS_LABEL, ...EQUIPMENT_STATUS_LABEL },
  depreciationMethod: DEPRECIATION_METHOD_LABEL,
  expenseType: EXPENSE_TYPE_LABEL,
  result: CALIBRATION_RESULT_LABEL,
  department: INSTRUMENT_DEPARTMENT_LABEL,
  partnerType: PARTNER_TYPE_LABEL,
};

/** 원 단위로 적을 칸 */
const MONEY = new Set([
  'acquisitionCost',
  'openingAccumulatedDepreciation',
  'disposalAmount',
  'partialDisposalAmount',
  'amount',
  'purchasePrice',
  'cost',
  'priorDisallowedAccumulated',
  'priorDeemedAccumulated',
  'currentDeemedDepreciation',
  'specialDepreciationAmount',
  'minTaxDisallowedAmount',
  'sincereBaseAmount',
  'sincereAccumulated',
  'sincereBookValue',
]);

/** 개월로 적을 칸 */
const MONTHS = new Set(['calibrationCycleMonths', 'inspectionCycleMonths']);

/** 년으로 적을 칸 */
const YEARS = new Set(['usefulLifeYears', 'specialCaseYears', 'defaultUsefulLifeYears']);

const DATE = /^\d{4}-\d{2}-\d{2}/;

const valueText = (key: string, v: unknown): string => {
  if (v == null || v === '') return '(비움)';
  if (typeof v === 'boolean') return v ? '예' : '아니오';

  if (Array.isArray(v)) {
    const each = v.map((x) => valueText(key, x));
    return each.length > 0 ? each.join(', ') : '(비움)';
  }

  if (typeof v === 'object') return JSON.stringify(v);

  const s = String(v);
  const named = VALUE_LABEL[key]?.[s] ?? ALERT_TYPE_LABEL[s as keyof typeof ALERT_TYPE_LABEL];
  if (named) return named;

  if (typeof v === 'number') {
    if (MONEY.has(key)) return `${won(v)}원`;
    if (MONTHS.has(key)) return `${v}개월`;
    if (YEARS.has(key)) return `${v}년`;
    return v.toLocaleString('ko-KR');
  }

  if (DATE.test(s)) return fmtDate(s);
  return s;
};

export interface BodyRow {
  label: string;
  value: string;
  /** 이름을 못 알아본 칸. 화면에서 흐리게 적어 구분한다 */
  unknown: boolean;
}

/**
 * 보관된 JSON 본문을 "칸 이름 — 값" 줄로 바꾼다.
 * 못 알아본 칸도 버리지 않고 그대로 싣는다 — 승인하는 사람이 본 것이 전부여야 한다.
 */
export const bodyRows = (body: string | null): BodyRow[] => {
  if (!body) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  return Object.entries(parsed as Record<string, unknown>).map(([key, v]) => ({
    label: FIELD_LABEL[key] ?? key,
    value: valueText(key, v),
    unknown: !FIELD_LABEL[key],
  }));
};
