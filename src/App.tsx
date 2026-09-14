import { useSyncExternalStore } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken, isLoginRequired, subscribeToken } from '@/lib/session';
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
import ApprovalListPage from '@/pages/approvals/ApprovalListPage';
import MyPage from '@/pages/me/MyPage';
import MasterPage from '@/pages/settings/MasterPage';

/*
 * 경로마다 영역 권한으로 막던 가드(Require)는 걷었다 (2026-09-14).
 * 누구나 같은 화면을 보고, 고칠 수 있는지만 화면 안에서 canEdit 으로 가른다.
 * 서버가 조회까지 막는 영역이면 그 화면의 QueryState 가 403 을 받아 안내한다.
 */
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
            <AssetListPage />
          }
        />
        {/* /assets/new 가 /assets/:id 보다 먼저 와야 한다 */}
        <Route
          path="/assets/new"
          element={
            <AssetNewPage />
          }
        />
        <Route
          path="/assets/:id"
          element={
            <AssetDetailPage />
          }
        />
        <Route
          path="/physical-assets"
          element={
            <PhysicalAssetListPage />
          }
        />
        <Route
          path="/instruments"
          element={
            <InstrumentListPage />
          }
        />
        <Route
          path="/instruments/:id"
          element={
            <InstrumentDetailPage />
          }
        />
        <Route
          path="/instruments/:id/card"
          element={
            <InstrumentCardPage />
          }
        />
        <Route
          path="/depreciation"
          element={
            <DepreciationPage />
          }
        />
        <Route
          path="/inspections"
          element={
            <InspectionListPage />
          }
        />
        <Route
          path="/notifications"
          element={
            <NotificationPage />
          }
        />
        <Route
          path="/approvals"
          element={
            <ApprovalListPage />
          }
        />
        {/* 내 계정에 딸린 것. 도메인 권한과 상관없이 들어온 사람은 누구나 본다 */}
        <Route path="/me" element={<MyPage />} />
        <Route
          path="/settings/master"
          element={
            <MasterPage />
          }
        />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
