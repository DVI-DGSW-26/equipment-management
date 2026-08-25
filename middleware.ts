import { next } from '@vercel/edge';

/**
 * 테스트 배포 접근 제한.
 *
 * Vercel 의 Password Protection 은 유료라 같은 일을 Edge Middleware 로 한다.
 * 브라우저 기본 인증창은 아이디 칸을 숨길 수 없어서, 비밀번호만 받는
 * 로그인 화면을 여기서 직접 그린다.
 *
 * 비밀번호는 Vercel 환경변수에 둔다 — 번들에 들어가지 않는다.
 *   SITE_PASSWORD        (없으면 BASIC_AUTH_PASSWORD 를 쓴다)
 *
 * 값이 비어 있으면 잠그지 않는다. 환경변수를 지웠을 때 사이트가
 * 통째로 막혀 아무도 못 들어가는 걸 막기 위해서다.
 *
 * 화면뿐 아니라 /api 프록시도 함께 막힌다 — 미들웨어가 라우팅보다 먼저 돈다.
 * 다만 백엔드를 직접 부르는 건 막지 못한다. 그건 서버 쪽 조치가 필요하다.
 */
export const config = {
  matcher: '/((?!_vercel).*)',
};

const COOKIE = 'site_auth';
const LOGIN_PATH = '/__login';
const MAX_AGE = 60 * 60 * 12; // 12시간

/** 쿠키에 담을 값. 비밀번호를 알아야만 만들 수 있다 */
async function tokenOf(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${password}|asset-management`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loginPage(nextPath: string, error?: string): Response {
  const safeNext = nextPath.startsWith('/') ? nextPath : '/';
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>자산·기자재 관리</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  :root {
    --bg:#f1eae0; --surface:#fffcf8; --fg:#241b12; --sub:#5a4c3e;
    --muted:#736250; --line:#dfd3c2; --accent:#7b4f1c; --danger:#9e3b2a;
  }
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--bg);color:var(--fg);padding:24px;
    font-family:"Malgun Gothic","맑은 고딕",system-ui,sans-serif;font-size:18px}
  .card{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--line);
    border-radius:6px;padding:32px 28px;display:flex;flex-direction:column;gap:18px}
  img{height:72px;width:auto;align-self:center}
  h1{margin:0;font-size:21px;font-weight:600;text-align:center}
  p{margin:0;color:var(--sub);font-size:16px;text-align:center;line-height:1.6}
  label{display:block;font-size:16px;color:var(--sub);margin-bottom:6px}
  input{width:100%;font-size:19px;padding:10px 12px;border:1px solid var(--line);
    border-radius:4px;background:var(--surface);color:var(--fg)}
  input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
  button{width:100%;font-size:18px;font-weight:600;padding:12px;border:0;border-radius:4px;
    background:var(--accent);color:#fff;cursor:pointer}
  button:hover{opacity:.92}
  .err{color:var(--danger);font-size:16px;text-align:center}
  .foot{color:var(--muted);font-size:15px;text-align:center}
</style>
</head>
<body>
  <form class="card" method="POST" action="${LOGIN_PATH}">
    <img src="/logo.svg" alt="">
    <h1>자산·기자재 관리</h1>
    <p>테스트 중인 화면입니다.<br>전달받은 비밀번호를 입력하세요.</p>
    ${error ? `<div class="err">${error}</div>` : ''}
    <div>
      <label for="pw">비밀번호</label>
      <input id="pw" name="password" type="password" autofocus autocomplete="current-password">
    </div>
    <input type="hidden" name="next" value="${safeNext.replace(/"/g, '&quot;')}">
    <button type="submit">들어가기</button>
    <div class="foot">비밀번호는 관리팀 담당자에게 문의하세요.</div>
  </form>
</body>
</html>`;

  return new Response(html, {
    status: error ? 401 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function middleware(request: Request) {
  const password = process.env.SITE_PASSWORD || process.env.BASIC_AUTH_PASSWORD;
  if (!password) return next();

  const expected = await tokenOf(password);
  const url = new URL(request.url);

  // 이미 통과한 방문자
  const cookie = request.headers.get('cookie') ?? '';
  if (cookie.split(/;\s*/).includes(`${COOKIE}=${expected}`)) return next();

  // 로그인 제출
  if (request.method === 'POST' && url.pathname === LOGIN_PATH) {
    const form = await request.formData();
    const target = String(form.get('next') || '/');
    if (String(form.get('password')) === password) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: target.startsWith('/') ? target : '/',
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
        },
      });
    }
    return loginPage(target, '비밀번호가 맞지 않습니다.');
  }

  // API 요청에는 로그인 화면 대신 JSON 으로 답한다 (화면이 HTML 을 파싱하려다 깨지지 않게)
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ code: 'UNAUTHORIZED', status: 401, message: '로그인이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return loginPage(url.pathname + url.search);
}
