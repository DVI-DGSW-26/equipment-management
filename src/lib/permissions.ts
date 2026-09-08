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

export interface Perms {
  /** 고정자산·실물자산·감가상각·안전검사를 볼 수 있는가 */
  asset: boolean;
  /** 계측기·교정을 볼 수 있는가 */
  instrument: boolean;
  /** 팀장. 등록·수정·삭제가 승인 없이 바로 된다 */
  admin: boolean;
  /**
   * 등록·수정·삭제 단추를 보여도 되는가.
   *
   * 볼 수 있는 도메인이 하나라도 있으면 보인다. 쓸 수 있는지를 화면에서 미리
   * 판정하지 않는다 — 아래 "조회 전용을 짐작하지 않는다" 참고.
   */
  canWrite: boolean;
  /** 쓰기가 곧바로가 아니라 승인 대기로 넘어가는가 */
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

/**
 * 조회 전용(IT 계정)을 짐작하지 않는다.
 *
 * 회신에는 "asset 과 instrument 를 다 가졌는데 admin 이 없으면 IT 계정" 이라고
 * 적혀 있었다. 그 규칙은 담당자가 도메인 롤을 하나만 갖는다는 것을 전제한다.
 * 그런데 실제 계정을 보니 담당자에게도 두 도메인이 다 나갔다(2026-09-08 확인) —
 * 그대로 두면 담당자의 등록·수정 단추가 통째로 사라진다. 회신대로면 담당자의
 * 쓰기는 막히는 것이 아니라 승인 대기로 가야 한다.
 *
 * 두 방향의 위험이 같지 않다. 쓸 수 있는 사람에게 단추를 감추면 아무것도 못 하고,
 * 그 사실을 확인할 방법까지 함께 막힌다. 못 쓰는 사람에게 단추를 보이면 눌렀을 때
 * 403 안내가 뜨는 것이 전부다. 그래서 화면에서는 판정하지 않고 서버에 맡긴다.
 *
 * 서버가 진짜 판단자다. 롤 구성이 확정되면 여기서 다시 좁히면 된다.
 */
export function permsOf(roles: readonly string[] | undefined): Perms {
  const set = new Set((roles ?? []).map(normalize));
  const admin = set.has('admin');
  const known = set.has('asset') || set.has('instrument') || admin;

  /* 못 알아본 롤이면 화면은 열어 두고 서버 판단을 따른다 */
  const asset = known ? set.has('asset') : true;
  const instrument = known ? set.has('instrument') : true;
  const anyDomain = asset || instrument;

  return {
    asset,
    instrument,
    admin,
    canWrite: anyDomain,
    needsApproval: known && !admin && anyDomain,
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
