import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, takeReturnTo } from '@/lib/session';
import LoginPage from './LoginPage';

/**
 * 로그인 콜백. 백엔드가 여기로 돌려보낸다.
 *
 *   성공  /auth/callback#token=<JWT>
 *   실패  /auth/callback#error=<사유>
 *
 * 토큰을 주소창에 남겨 두지 않으려고, 받은 즉시 보던 화면으로 옮긴다(replace).
 * 실패 사유(관리팀 그룹이 아닌 계정 등)는 서버 문구를 그대로 보여준다.
 */
const readHash = () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return { token: hash.get('token'), error: hash.get('error') };
};

export default function CallbackPage() {
  const navigate = useNavigate();
  /* 주소는 이 화면에 들어온 순간 한 번만 읽으면 된다 */
  const [{ token, error }] = useState(readHash);

  useEffect(() => {
    if (!token) return;
    setToken(token);
    navigate(takeReturnTo(), { replace: true });
  }, [token, navigate]);

  if (!token) {
    return <LoginPage message={error || '로그인에 실패했습니다. 다시 시도해 주세요.'} />;
  }
  return <p className="p-8 text-[18px] text-fg-sub">로그인 중…</p>;
}
