import { useSyncExternalStore } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken, isLoginRequired, subscribeToken } from '@/lib/session';
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

export default function App() {
  /* 토큰이 사라지면(만료·로그아웃) 화면이 곧바로 로그인으로 돌아온다 */
  const token = useSyncExternalStore(subscribeToken, getToken);

  return (
    <Routes>
      {/* 콜백은 토큰을 받으러 오는 길이라 로그인 검사 밖에 둔다 */}
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route element={token || !isLoginRequired ? <AppLayout /> : <LoginPage auto />}>
        <Route index element={<Navigate to="/assets" replace />} />
        <Route path="/assets" element={<AssetListPage />} />
        {/* /assets/new 가 /assets/:id 보다 먼저 와야 한다 */}
                <Route path="/assets/new" element={<AssetNewPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/physical-assets" element={<PhysicalAssetListPage />} />
        <Route path="/instruments" element={<InstrumentListPage />} />
        <Route path="/instruments/:id" element={<InstrumentDetailPage />} />
        <Route path="/instruments/:id/card" element={<InstrumentCardPage />} />
        <Route path="/depreciation" element={<DepreciationPage />} />
        <Route path="/inspections" element={<InspectionListPage />} />
        <Route path="/notifications" element={<NotificationPage />} />
        <Route path="/settings/master" element={<MasterPage />} />
        <Route path="*" element={<Navigate to="/assets" replace />} />
      </Route>
    </Routes>
  );
}
