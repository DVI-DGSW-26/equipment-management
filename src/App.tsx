import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import AssetListPage from '@/pages/assets/AssetListPage';
import AssetNewPage from '@/pages/assets/AssetNewPage';
import AssetDetailPage from '@/pages/assets/AssetDetailPage';
import PhysicalAssetListPage from '@/pages/physicalAssets/PhysicalAssetListPage';
import InstrumentListPage from '@/pages/instruments/InstrumentListPage';
import InstrumentDetailPage from '@/pages/instruments/InstrumentDetailPage';
import DepreciationPage from '@/pages/depreciation/DepreciationPage';
import InspectionListPage from '@/pages/inspections/InspectionListPage';
import MasterPage from '@/pages/settings/MasterPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/assets" replace />} />
        <Route path="/assets" element={<AssetListPage />} />
        {/* /assets/new 가 /assets/:id 보다 먼저 와야 한다 */}
                <Route path="/assets/new" element={<AssetNewPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/physical-assets" element={<PhysicalAssetListPage />} />
        <Route path="/instruments" element={<InstrumentListPage />} />
        <Route path="/instruments/:id" element={<InstrumentDetailPage />} />
        <Route path="/depreciation" element={<DepreciationPage />} />
        <Route path="/inspections" element={<InspectionListPage />} />
        {/* 알림 화면은 계측기·안전검사 안으로 들어갔다. 예전 주소는 안전검사로 보낸다 */}
        <Route path="/notifications" element={<Navigate to="/inspections" replace />} />
        <Route path="/settings/master" element={<MasterPage />} />
        <Route path="*" element={<Navigate to="/assets" replace />} />
      </Route>
    </Routes>
  );
}
