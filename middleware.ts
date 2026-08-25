import { next } from '@vercel/edge';

/**
 * 테스트 배포 접근 제한.
 *
 * Vercel 의 Password Protection 은 유료라, 같은 일을 Edge Middleware 로 한다.
 * 브라우저 기본 인증창이 뜨고, 한 번 입력하면 그 세션 동안 유지된다.
 *
 * 비밀번호는 Vercel 환경변수에 둔다 — 번들에 들어가지 않는다.
 *   BASIC_AUTH_USER      예: dvision
 *   BASIC_AUTH_PASSWORD  팀에 공유할 값
 *
 * 둘 중 하나라도 비어 있으면 잠그지 않는다. 로컬 개발과
 * 환경변수를 지웠을 때 사이트가 통째로 막히는 걸 막기 위해서다.
 *
 * 화면뿐 아니라 /api 프록시도 함께 막힌다 — 미들웨어가 라우팅보다 먼저 돈다.
 * 다만 백엔드(112.146.55.78:3378)를 직접 부르는 건 막지 못한다.
 * 그건 서버 쪽 조치가 필요하다.
 */
export const config = {
  // Vercel 내부 경로(_vercel/*)는 건드리지 않는다
  matcher: '/((?!_vercel).*)',
};

export default function middleware(request: Request) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) return next();

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      // atob 은 바이트 문자열을 준다. 한글 비밀번호를 위해 UTF-8 로 다시 읽는다
      const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      // 비밀번호에 콜론이 들어갈 수 있으므로 첫 콜론만 구분자로 쓴다
      const at = decoded.indexOf(':');
      if (at > -1 && decoded.slice(0, at) === user && decoded.slice(at + 1) === password) {
        return next();
      }
    } catch {
      /* 형식이 깨진 헤더는 실패로 본다 */
    }
  }

  return new Response('인증이 필요합니다. 브라우저 로그인 창에 아이디와 비밀번호를 입력하세요.', {
    status: 401,
    headers: {
      // realm 은 ASCII 만 쓴다. 한글을 넣으면 헤더가 통째로 버려져
      // 브라우저가 로그인 창을 띄우지 않는다.
      'WWW-Authenticate': 'Basic realm="Asset Management", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
