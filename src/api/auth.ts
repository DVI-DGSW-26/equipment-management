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
};
