import { useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken, isLoginRequired, subscribeToken } from '@/lib/session';
import { allows, type Domain } from '@/lib/permissions';
import { usePerms } from '@/hooks/useMe';
import { NoPermission } from '@/components/ui';
import AppLayout from '@/components/AppLayout';
import LoginPage from '@/pages/auth/LoginPage';
import CallbackPage from '@/pages/auth/CallbackPage';
import AssetListPage from '@/pages/assets/AssetListPage';
import AssetNewPage from '@/pages/assets/AssetNewPage';
import AssetDetailPage from '@/pages/assets/AssetDetailPage';
import PhysicalAssetListPage from '@/pages/physicalAssets/PhysicalAssetListPage';
import InstrumentListPage from '@/pages/instruments/InstrumentListPage';
import InstrumentDetailPage from '@/pages/instruments/InstrumentDetailPage';
import InstrumentCardPage from '@/pages/instruments/InstrumentCardPage';
import DepreciationPage from '@/pages/depreciation/DepreciationPage';
import InspectionListPage from '@/pages/inspections/InspectionListPage';
import NotificationPage from '@/pages/notifications/NotificationPage';
import MasterPage from '@/pages/settings/MasterPage';

/**
 * 권한 가드.
 *
 * 메뉴를 감추는 것만으로는 주소를 직접 친 사람을 막지 못한다. 서버도 403 으로
 * 막지만, 그 전에 화면이 무엇을 요구하는지 알려 주는 편이 낫다 — 403 은 화면을
 * 반쯤 그린 뒤에야 온다.
 */
function Require({ need, children }: { need: Domain; children: ReactNode }) {
  const { perms, isPending } = usePerms();
  /* /auth/me 를 기다리는 동안 "권한 없음" 을 깜빡이지 않는다 */
  if (isPending) return null;
  if (!allows(perms, need)) return <NoPermission />;
  return <>{children}</>;
}

/**
 * 첫 화면.
 *
 * 고정자산으로 고정해 두면 계측기 롤만 가진 사람은 들어오자마자 권한 안내를 본다.
 * 볼 수 있는 것 중 앞의 것으로 보낸다.
 */
function Home() {
  const { perms, isPending } = usePerms();
  if (isPending) return null;
  if (perms.asset) return <Navigate to="/assets" replace />;
  if (perms.instrument) return <Navigate to="/instruments" replace />;
  return <NoPermission message="볼 수 있는 화면이 없습니다." />;
}

export default function App() {
  /* 토큰이 사라지면(만료·로그아웃) 화면이 곧바로 로그인으로 돌아온다 */
  const token = useSyncExternalStore(subscribeToken, getToken);

  return (
    <Routes>
      {/* 콜백은 토큰을 받으러 오는 길이라 로그인 검사 밖에 둔다 */}
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route element={token || !isLoginRequired ? <AppLayout /> : <LoginPage auto />}>
        <Route index element={<Home />} />
        <Route
          path="/assets"
          element={
            <Require need="asset">
              <AssetListPage />
            </Require>
          }
        />
        {/* /assets/new 가 /assets/:id 보다 먼저 와야 한다 */}
        <Route
          path="/assets/new"
          element={
            <Require need="asset">
              <AssetNewPage />
            </Require>
          }
        />
        <Route
          path="/assets/:id"
          element={
            <Require need="asset">
              <AssetDetailPage />
            </Require>
          }
        />
        <Route
          path="/physical-assets"
          element={
            <Require need="asset">
              <PhysicalAssetListPage />
            </Require>
          }
        />
        <Route
          path="/instruments"
          element={
            <Require need="instrument">
              <InstrumentListPage />
            </Require>
          }
        />
        <Route
          path="/instruments/:id"
          element={
            <Require need="instrument">
              <InstrumentDetailPage />
            </Require>
          }
        />
        <Route
          path="/instruments/:id/card"
          element={
            <Require need="instrument">
              <InstrumentCardPage />
            </Require>
          }
        />
        <Route
          path="/depreciation"
          element={
            <Require need="asset">
              <DepreciationPage />
            </Require>
          }
        />
        <Route
          path="/inspections"
          element={
            <Require need="asset">
              <InspectionListPage />
            </Require>
          }
        />
        <Route
          path="/notifications"
          element={
            <Require need="any">
              <NotificationPage />
            </Require>
          }
        />
        <Route
          path="/settings/master"
          element={
            <Require need="any">
              <MasterPage />
            </Require>
          }
        />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
