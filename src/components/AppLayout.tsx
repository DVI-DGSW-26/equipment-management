import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { inspectionsApi } from '@/api/inspections';
import { queryKeys } from '@/api/queryKeys';
import { logout } from '@/lib/session';
import { Badge } from '@/components/ui';
import { ToastProvider } from '@/components/Toast';

const NAV = [
  { to: '/assets', label: '고정자산' },
  { to: '/physical-assets', label: '실물자산' },
  { to: '/instruments', label: '계측기' },
  { to: '/depreciation', label: '감가상각' },
  { to: '/inspections', label: '안전검사' },
  { to: '/notifications', label: '알림' },
  { to: '/settings/master', label: '마스터' },
];

export default function AppLayout() {
  const qc = useQueryClient();

  // 로그인한 사람. 헤더에 이름과 권한을 띄운다
  const me = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => authApi.me(),
    staleTime: 30 * 60_000,
  });

  /*
   * 안전검사 메뉴의 배지.
   *
   * 오늘 검사해야 하는 것만 센다 (요청 2026-09-04). 지난 것과 이달 안에 드는 것까지
   * 더해 놓으니 늘 숫자가 붙어 있어 오늘 할 일이 있는지 없는지를 알 수 없었다.
   * days=0 이면 서버가 만료일이 오늘인 것만 주고, includeOverdue=false 로 지난 것은 뺀다.
   *
   * 실패해도 화면을 막지 않는다.
   */
  const safety = useQuery({
    queryKey: queryKeys.inspections.upcoming(0),
    queryFn: () => inspectionsApi.upcoming({ days: 0, includeOverdue: false }),
    staleTime: 5 * 60_000,
  });
  /** 오늘이 검사 기한인 건수. 없으면 배지를 달지 않는다 */
  const dueToday = (safety.data ?? []).length;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg text-fg">
        <header className="no-print border-b border-line bg-surface">
          <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2 sm:h-28 sm:flex-nowrap sm:px-8 sm:py-0">
            {/* 로고를 누르면 첫 화면(고정자산)으로 돌아온다 */}
            <NavLink
              to="/"
              className="flex shrink-0 items-center rounded-sm hover:opacity-80"
              aria-label="첫 화면으로"
            >
              <img src="/logo.svg" alt="자산·기자재 관리" className="h-12 w-auto sm:h-24" />
            </NavLink>

            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'px-3 py-2 text-[19px] rounded-sm whitespace-nowrap',
                      isActive ? 'bg-accent text-white font-medium' : 'text-fg-sub hover:bg-bg',
                    ].join(' ')
                  }
                >
                  {item.label}
                  {item.to === '/inspections' && dueToday > 0 && (
                    <span
                      className="ml-1 rounded-sm bg-danger px-1 text-[17px] text-white"
                      title={`오늘이 검사 기한인 대상 ${dueToday}건`}
                    >
                      {dueToday}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            {/*
              미확정 설정 개수는 개발용 표시라 헤더에서 뺐다.
              항목별 확정 여부는 마스터 화면의 "미확정 설정" 탭에서 본다.
            */}
            <div className="ml-auto flex items-center gap-2 text-[18px]">
              {safety.isError && (
                <span
                  className="rounded-sm border border-danger/40 bg-danger/10 px-2 py-0.5 text-danger"
                  title="vite 프록시(VITE_API_PROXY_TARGET)와 백엔드 상태를 확인하세요"
                >
                  API 연결 실패
                </span>
              )}
              {me.data && (
                <>
                  <span className="whitespace-nowrap text-fg-sub">{me.data.name}</span>
                  {me.data.roles.map((role) => (
                    <Badge key={role}>{role}</Badge>
                  ))}
                  {/* 다른 사람 자료가 남지 않게 캐시까지 비운다 */}
                  <button
                    type="button"
                    className="whitespace-nowrap text-accent hover:underline"
                    onClick={() => {
                      logout();
                      qc.clear();
                    }}
                  >
                    로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="px-3 py-3 sm:px-8">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
