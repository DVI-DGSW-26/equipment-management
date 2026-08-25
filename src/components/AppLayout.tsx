import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { inspectionsApi } from '@/api/inspections';
import { queryKeys } from '@/api/queryKeys';
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
  // 안전검사 메뉴의 긴급 건수 배지용. 실패해도 화면을 막지 않는다
  const safety = useQuery({
    queryKey: queryKeys.inspections.summary(),
    queryFn: () => inspectionsApi.summary(),
    staleTime: 5 * 60_000,
  });
  const urgent = (safety.data?.overdueCount ?? 0) + (safety.data?.within30Count ?? 0);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg text-fg">
        <header className="border-b border-line bg-surface">
          <div className="flex h-28 items-center gap-6 px-8">
            <span className="flex shrink-0 items-center gap-3 text-[24px]">
              <img src="/logo.svg" alt="자산·기자재 관리" className="h-24 w-auto" />
            </span>

            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'px-3 py-2 text-[19px] rounded-sm',
                      isActive ? 'bg-accent text-white font-medium' : 'text-fg-sub hover:bg-bg',
                    ].join(' ')
                  }
                >
                  {item.label}
                  {item.to === '/inspections' && urgent > 0 && (
                    <span className="ml-1 rounded-sm bg-danger px-1 text-[17px] text-white">
                      {urgent}
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
            </div>
          </div>
        </header>

        <main className="px-8 py-3">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
