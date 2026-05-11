import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/layout/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminExportAllProductsPage from "./pages/admin/AdminExportAllProductsPage";
import AdminExportApplicationsPage from "./pages/admin/AdminExportApplicationsPage";
import AdminExportByDatePage from "./pages/admin/AdminExportByDatePage";
import AdminExportByDepositDatePage from "./pages/admin/AdminExportByDepositDatePage";
import AdminExportByProductPage from "./pages/admin/AdminExportByProductPage";
import AdminExportByStatusPage from "./pages/admin/AdminExportByStatusPage";
import AdminExportMyProductsPage from "./pages/admin/AdminExportMyProductsPage";
import AdminFileUploadPage from "./pages/admin/AdminFileUploadPage";
import AdminProductDetailPage from "./pages/admin/AdminProductDetailPage";
import AdminProductOverviewPage from "./pages/admin/AdminProductOverviewPage";
import AdminProductsPage from "./pages/admin/AdminProductsPage";
import AdminReviewReceiveDetailPage from "./pages/admin/AdminReviewReceiveDetailPage";
import AdminReviewReceivePage from "./pages/admin/AdminReviewReceivePage";
import AdminSettingPage from "./pages/admin/AdminSettingPage";
import LoginPage from "./pages/admin/LoginPage";
import PublicReviewReceiveDetailPage from "./pages/public/PublicReviewReceiveDetailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="product" element={<AdminProductsPage />} />
        <Route path="product/specific/:productId" element={<AdminProductDetailPage />} />
        <Route path="product-overview">
          <Route index element={<Navigate to="all" replace />} />
          <Route path="all" element={<AdminProductOverviewPage viewMode="all" />} />
          <Route path="status" element={<AdminProductOverviewPage viewMode="status" />} />
        </Route>
        <Route path="review-receive">
          <Route index element={<Navigate to="all" replace />} />
          <Route path="all" element={<AdminReviewReceivePage viewMode="all" />} />
          <Route path="in-progress" element={<AdminReviewReceivePage viewMode="in_progress" />} />
          <Route path="completed" element={<AdminReviewReceivePage viewMode="completed" />} />
        </Route>
        <Route path="review-receive/specific/:productId" element={<AdminReviewReceiveDetailPage />} />
        <Route path="export">
          <Route index element={<Navigate to="all-products" replace />} />
          <Route path="all-products" element={<AdminExportAllProductsPage />} />
          <Route path="my-products" element={<AdminExportMyProductsPage />} />
          <Route path="by-date" element={<AdminExportByDatePage />} />
          <Route path="by-product" element={<AdminExportByProductPage />} />
          <Route path="by-deposit-date" element={<AdminExportByDepositDatePage />} />
          <Route path="by-status" element={<AdminExportByStatusPage />} />
          <Route path="applications" element={<AdminExportApplicationsPage />} />
        </Route>
        <Route path="file-upload" element={<AdminFileUploadPage />} />
        <Route path="setting" element={<AdminSettingPage />} />
      </Route>
      <Route path="/review-receive/specific/:productId" element={<PublicReviewReceiveDetailPage />} />
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}
