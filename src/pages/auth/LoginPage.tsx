import { useEffect } from 'react';
import { btnPrimaryClass } from '@/components/ui';
import { shouldAutoLogin, startLogin } from '@/lib/session';

/**
 * 로그인 화면.
 *
 * 아이디·비밀번호를 여기서 받지 않는다. DVI 통합 로그인(Keycloak) 화면이
 * OTP 까지 처리하고, 우리는 돌아온 토큰만 받는다.
 *
 * 그래서 로그인이 필요하면 이 화면을 거치지 않고 곧바로 통합 로그인으로 보낸다(auto).
 * 스스로 로그아웃했거나 방금 다녀왔는데 또 튕긴 경우(권한 없는 계정 등)에만
 * 여기서 세우고 사람이 누르게 한다 — 그러지 않으면 무한 왕복이 된다.
 */
export default function LoginPage({ message, auto }: { message?: string; auto?: boolean }) {
  const leaving = auto === true && message === undefined && shouldAutoLogin();

  useEffect(() => {
    if (leaving) startLogin();
  }, [leaving]);

  if (leaving) {
    return <p className="p-8 text-[18px] text-fg-sub">로그인 화면으로 이동 중…</p>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 text-fg">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-sm border border-line bg-surface p-8">
        <img src="/logo.svg" alt="자산·기자재 관리" className="h-20 w-auto self-center" />
        <h1 className="text-center text-[21px] font-medium">자산·기자재 관리</h1>
        {message ? (
          <p className="text-center text-[18px] text-danger">{message}</p>
        ) : (
          <p className="text-center text-[18px] text-fg-sub">DVI 계정으로 로그인합니다.</p>
        )}
        <button type="button" className={btnPrimaryClass} onClick={startLogin}>
          DVI 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
