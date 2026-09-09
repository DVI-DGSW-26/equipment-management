import { request } from './client';

/** GET /auth/me. 헤더에 이름을 띄우고 권한 배지를 붙이는 데 쓴다 */
export interface Me {
  sub: string;
  uid: string;
  username: string;
  name: string;
  email: string;
  roles: string[];
}

export const authApi = {
  me: () => request<Me>('GET', '/auth/me'),

  /**
   * 로그아웃. 갱신 핸들을 폐기하고 인증 서버 세션까지 닫는다.
   *
   * 부르지 않으면 핸들이 살아 있어, 로그아웃한 브라우저에서 그 값만 있으면 다시
   * 토큰을 받을 수 있다. 모르는 핸들이어도 서버가 200 을 주므로 실패로 다루지 않는다
   * (백엔드 회신 2026-09-09).
   */
  logout: (refreshToken: string | null) =>
    refreshToken == null
      ? Promise.resolve()
      : request<void>('POST', '/auth/logout', { body: { refreshToken } }),
};
