import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, setSession, subscribeToken, takeReturnTo } from '@/lib/session';
import LoginPage from './LoginPage';

/**
 * 로그인 콜백. 백엔드가 여기로 돌려보낸다.
 *
 *   성공  /auth/callback#token=<JWT>&refresh=<갱신 핸들>
 *   실패  /auth/callback#error=<사유>
 *
 * refresh 는 앱 토큰(30분)이 만료됐을 때 새 토큰을 받아 오는 핸들이다. 이것을 함께
 * 보관해 두지 않으면 30분마다 로그인 화면으로 튕긴다 (백엔드 회신 2026-09-09).
 *
 * 토큰을 주소창에 남겨 두지 않으려고, 받은 즉시 보던 화면으로 옮긴다(replace).
 * 실패 사유(관리팀 그룹이 아닌 계정 등)는 서버 문구를 그대로 보여준다.
 *
 * 실패 화면에서도 저장소의 토큰은 계속 지켜본다. 탭 여러 개가 동시에 만료되면
 * 전부 로그인으로 달려가는데, 한 세션을 나눠 쓰는 탓에 먼저 끝난 탭만 성공하고
 * 나머지는 여기로 떨어진다(#error). 그 사이 다른 탭이 로그인을 끝냈다면 이
 * 오류는 소음이다 — 토큰이 생기는 순간(또는 이미 있으면) 보던 화면으로 보낸다.
 */
const readHash = () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return { token: hash.get('token'), refresh: hash.get('refresh'), error: hash.get('error') };
};

export default function CallbackPage() {
  const navigate = useNavigate();
  /* 주소는 이 화면에 들어온 순간 한 번만 읽으면 된다 */
  const [{ token, refresh, error }] = useState(readHash);
  /* 다른 탭의 로그인(storage 이벤트)과 새로고침 시 남아 있는 토큰을 본다 */
  const storedToken = useSyncExternalStore(subscribeToken, getToken);

  useEffect(() => {
    if (!token) return;
    setSession({ token, refreshToken: refresh });
    navigate(takeReturnTo(), { replace: true });
  }, [token, refresh, navigate]);

  useEffect(() => {
    if (token || !storedToken) return;
    navigate(takeReturnTo(), { replace: true });
  }, [token, storedToken, navigate]);

  if (!token) {
    if (storedToken) {
      return <p className="p-8 text-[18px] text-fg-sub">로그인 중…</p>;
    }
    return <LoginPage message={error || '로그인에 실패했습니다. 다시 시도해 주세요.'} />;
  }
  return <p className="p-8 text-[18px] text-fg-sub">로그인 중…</p>;
}
