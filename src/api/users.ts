import { request } from './client';

/**
 * 통합로그인(Keycloak)에 등록된 사내 인원.
 *
 * 알림 수신자를 손으로 치지 않고 골라 넣는 데만 쓴다. 받아 온 값을 따로 저장하지 않는다.
 * 열람은 서버가 관리팀으로 제한한다 (jagigo 로그인 자체가 관리팀 전용).
 */
export interface DirectoryUser {
  name: string;
  email: string;
  /**
   * 통합로그인의 부서 그룹 경로("engineering/backend" 같은 꼴). 없으면 null.
   * 우리 부서 마스터(압출·가공…)와 형식이 달라 화면에서는 마스터로 따로 고른다.
   */
  department: string | null;
  username: string;
}

export const usersApi = {
  /**
   * 사내 명단.
   *
   * 수백 명 수준이라 한 번에 받아 화면에서 찾는다(서버가 10분 캐시한다).
   * keyword 를 주면 서버가 이름·이메일·계정·부서로 부분 일치를 걸러 준다.
   *
   * 통합로그인 연동 전이면 503, 인증서버 장애면 502 가 온다.
   * 그때는 명단 없이 직접 입력만 하도록 화면이 물러선다.
   */
  directory: (keyword?: string) =>
    request<DirectoryUser[]>('GET', '/user/directory', { query: { keyword } }),
};
