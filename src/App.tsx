import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import AssetListPage from '@/pages/assets/AssetListPage';
import AssetNewPage from '@/pages/assets/AssetNewPage';
import AssetDetailPage from '@/pages/assets/AssetDetailPage';
import DepreciationPage from '@/pages/depreciation/DepreciationPage';
import InspectionListPage from '@/pages/inspections/InspectionListPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/assets" replace />} />
        <Route path="/assets" element={<AssetListPage />} />
        {/* /assets/new 가 /assets/:id 보다 먼저 와야 한다 */}
                <Route path="/assets/new" element={<AssetNewPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/depreciation" element={<DepreciationPage />} />
        <Route path="/inspections" element={<InspectionListPage />} />
        <Route path="*" element={<Navigate to="/assets" replace />} />
      </Route>
    </Routes>
  );
}
