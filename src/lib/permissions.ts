/**
 * 화면 권한.
 *
 * /auth/me 의 roles 로 갈린다 (백엔드 회신 2026-09-08).
 *
 *   asset       고정자산·실물자산·감가상각·안전검사
 *   instrument  계측기·교정
 *   admin       등록·수정·삭제가 승인 없이 바로 되는 계정 (팀장)
 *
 * admin 이 아닌 담당자가 등록하면 서버가 승인 대기로 받는다 — api/client.ts 의 202 처리.
 * asset 과 instrument 를 둘 다 가졌는데 admin 이 없으면 IT 계정이라 조회만 된다.
 *
 * 서버도 같은 검사를 하고 어긋나면 403 을 준다. 여기서 메뉴를 감추는 것은
 * 안내일 뿐 방어선이 아니다 — 주소를 직접 쳐도 서버가 막는다.
 */

/** 롤 이름 표기 흔들림 흡수. ROLE_ASSET 도 asset 으로 본다 */
const normalize = (role: string): string => role.trim().toLowerCase().replace(/^role_/, '');

/**
 * 헤더에 적을 롤 이름.
 *
 * 서버가 주는 문자열(asset·instrument·admin)을 그대로 띄워 두었더니 쓰는 사람이
 * 무슨 뜻인지 알 수 없었다(2026-09-09 요청). Keycloak 기본 롤(user 등)은 권한과
 * 상관없어 아예 적지 않는다 — 읽을 것만 는다.
 */
const ROLE_LABEL: Record<string, string> = {
  asset: '자산 담당',
  instrument: '계측기 담당',
  admin: '팀장',
};

/** 헤더용. 아는 롤만 한글로, 차례는 자산 → 계측기 → 팀장 */
export const roleLabels = (roles: readonly string[] | undefined): string[] => {
  const set = new Set((roles ?? []).map(normalize));
  return Object.keys(ROLE_LABEL)
    .filter((key) => set.has(key))
    .map((key) => ROLE_LABEL[key]);
};

export interface Perms {
  /** 고정자산·실물자산·감가상각·안전검사를 볼 수 있는가 */
  asset: boolean;
  /** 계측기·교정을 볼 수 있는가 */
  instrument: boolean;
  /** 팀장. 등록·수정·삭제가 승인 없이 바로 된다 */
  admin: boolean;
  /** IT 계정. 두 도메인을 다 보지만 쓰기는 서버가 403 으로 막는다 */
  readOnly: boolean;
  /** 등록·수정·삭제 단추를 보여도 되는가 */
  canWrite: boolean;
  /** 삭제·폐기가 곧바로가 아니라 승인 대기로 넘어가는가. 등록·수정은 곧바로 된다 */
  needsApproval: boolean;
  /**
   * roles 에서 아는 이름을 하나도 못 찾았는가.
   *
   * 서버 스펙에 roles 값 목록이 없어서 표기가 바뀔 여지가 있다. 못 알아본 것을
   * "권한 없음" 으로 읽으면 멀쩡한 계정에 빈 화면만 남는다. 그래서 이때는
   * 전부 열어 두고 서버의 403 에 맡긴다. 권한 없는 계정은 애초에 토큰을 못 받는다.
   */
  unknown: boolean;
}

export function permsOf(roles: readonly string[] | undefined): Perms {
  const set = new Set((roles ?? []).map(normalize));
  const admin = set.has('admin');
  const known = set.has('asset') || set.has('instrument') || admin;

  /* 못 알아본 롤이면 화면은 열어 두고 서버 판단을 따른다 */
  const asset = known ? set.has('asset') : true;
  const instrument = known ? set.has('instrument') : true;

  /*
   * IT 계정. admin 이 붙으면 아니다 — 팀장이 두 도메인을 다 가진 경우다.
   *
   * "담당자도 두 도메인을 다 받는 것 아니냐" 싶어 한 번 뺐다가 되돌렸다.
   * roles 가 instrument·asset·user 인 계정으로 자산을 등록해 보니 서버가 403 으로
   * 막았다 — 승인 요청조차 만들어지지 않는다(2026-09-08 확인). 회신의 규칙이 맞다.
   */
  const readOnly = known && asset && instrument && !admin;
  const anyDomain = asset || instrument;

  return {
    asset,
    instrument,
    admin,
    readOnly,
    canWrite: !readOnly && anyDomain,
    needsApproval: known && !admin && !readOnly && anyDomain,
    unknown: !known,
  };
}

/**
 * 화면이 요구하는 도메인.
 *
 * any 는 두 도메인이 함께 쓰는 화면이다 — 알림(교정·안전검사 공용 수신자)과
 * 마스터(자산코드 마스터와 계측기 사용위치·거래처가 한 화면에 있다).
 * 어느 쪽 롤이든 하나만 있으면 들어갈 수 있고, 안에서 못 보는 탭은 서버가 막는다.
 */
export type Domain = 'asset' | 'instrument' | 'any';

export const allows = (perms: Perms, domain: Domain): boolean =>
  domain === 'any' ? perms.asset || perms.instrument : perms[domain];
