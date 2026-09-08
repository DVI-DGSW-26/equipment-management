import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from '@/api/approvals';
import { inspectionsApi } from '@/api/inspections';
import { queryKeys } from '@/api/queryKeys';
import { useMe, usePerms } from '@/hooks/useMe';
import { allows, type Domain } from '@/lib/permissions';
import { logout } from '@/lib/session';
import { Badge } from '@/components/ui';
import { ToastProvider } from '@/components/Toast';

/**
 * 차림표. need 는 그 메뉴를 보려면 있어야 하는 롤이다 (백엔드 회신 2026-09-08).
 * 라우트 쪽 가드는 App.tsx 가 같은 규칙으로 건다 — 주소를 직접 쳐도 막히도록.
 */
const NAV: { to: string; label: string; need: Domain }[] = [
  { to: '/assets', label: '고정자산', need: 'asset' },
  { to: '/physical-assets', label: '실물자산', need: 'asset' },
  { to: '/instruments', label: '계측기', need: 'instrument' },
  { to: '/depreciation', label: '감가상각', need: 'asset' },
  { to: '/inspections', label: '안전검사', need: 'asset' },
  { to: '/notifications', label: '알림', need: 'any' },
  /* 팀장은 검토하러, 담당자는 자기 요청이 어떻게 됐는지 보러 들어온다 */
  { to: '/approvals', label: '승인', need: 'any' },
  { to: '/settings/master', label: '마스터', need: 'any' },
];

export default function AppLayout() {
  const qc = useQueryClient();

  // 로그인한 사람. 헤더에 이름과 권한을 띄운다
  const me = useMe();
  const { perms } = usePerms();
  const menu = NAV.filter((item) => allows(perms, item.need));

  /*
   * 안전검사 메뉴의 배지.
   *
   * 오늘 검사해야 하는 것만 센다 (요청 2026-09-04). 지난 것과 이달 안에 드는 것까지
   * 더해 놓으니 늘 숫자가 붙어 있어 오늘 할 일이 있는지 없는지를 알 수 없었다.
   * days=0 이면 서버가 만료일이 오늘인 것만 주고, includeOverdue=false 로 지난 것은 뺀다.
   *
   * 실패해도 화면을 막지 않는다.
   * asset 롤이 없으면 안전검사 자체가 권한 밖이라 묻지 않는다 — 물어 봐야 403 이고,
   * 그 403 이 "API 연결 실패" 로 보인다.
   */
  const safety = useQuery({
    queryKey: queryKeys.inspections.upcoming(0),
    queryFn: () => inspectionsApi.upcoming({ days: 0, includeOverdue: false }),
    staleTime: 5 * 60_000,
    enabled: perms.asset,
  });
  /** 오늘이 검사 기한인 건수. 없으면 배지를 달지 않는다 */
  const dueToday = (safety.data ?? []).length;

  /*
   * 승인 메뉴의 배지. 서버가 관리자 화면용으로 내려주는 전체 대기 건수라
   * 팀장에게만 묻는다 — 담당자에게는 남의 요청까지 센 숫자가 붙어 봐야 읽을 것만 는다.
   * 승인·반려를 하면 목록과 함께 다시 센다(queryKeys.approvals.all 무효화).
   */
  const pending = useQuery({
    queryKey: queryKeys.approvals.pendingCount(),
    queryFn: () => approvalsApi.pendingCount(),
    staleTime: 60_000,
    enabled: perms.admin,
  });
  const waiting = pending.data ?? 0;

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
              {menu.map((item) => (
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
                  {item.to === '/approvals' && waiting > 0 && (
                    <span
                      className="ml-1 rounded-sm bg-danger px-1 text-[17px] text-white"
                      title={`승인을 기다리는 요청 ${waiting}건`}
                    >
                      {waiting}
                    </span>
                  )}
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
                  {/* 등록·수정이 왜 막히는지 헤더에서 바로 알 수 있게 (IT 계정) */}
                  {perms.readOnly && <Badge tone="muted">조회 전용</Badge>}
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
