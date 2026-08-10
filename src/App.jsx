import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/layout/AdminLayout";

const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminExportAllProductsPage = lazy(() => import("./pages/admin/AdminExportAllProductsPage"));
const AdminExportApplicationsPage = lazy(() => import("./pages/admin/AdminExportApplicationsPage"));
const AdminExportByDatePage = lazy(() => import("./pages/admin/AdminExportByDatePage"));
const AdminExportByDepositDatePage = lazy(() => import("./pages/admin/AdminExportByDepositDatePage"));
const AdminExportByProductPage = lazy(() => import("./pages/admin/AdminExportByProductPage"));
const AdminExportByStatusPage = lazy(() => import("./pages/admin/AdminExportByStatusPage"));
const AdminExportMyProductsPage = lazy(() => import("./pages/admin/AdminExportMyProductsPage"));
const AdminExportPhotosPage = lazy(() => import("./pages/admin/AdminExportPhotosPage"));
const AdminFileUploadPage = lazy(() => import("./pages/admin/AdminFileUploadPage"));
const AdminBulkEditPage = lazy(() => import("./pages/admin/AdminBulkEditPage"));
const AdminProductDetailPage = lazy(() => import("./pages/admin/AdminProductDetailPage"));
const AdminProductOverviewPage = lazy(() => import("./pages/admin/AdminProductOverviewPage"));
const AdminProductsPage = lazy(() => import("./pages/admin/AdminProductsPage"));
const AdminReviewReceiveDetailPage = lazy(() => import("./pages/admin/AdminReviewReceiveDetailPage"));
const AdminReviewReceivePage = lazy(() => import("./pages/admin/AdminReviewReceivePage"));
const AdminSettingPage = lazy(() => import("./pages/admin/AdminSettingPage"));
const LoginPage = lazy(() => import("./pages/admin/LoginPage"));
const PublicReviewReceiveDetailPage = lazy(() => import("./pages/public/PublicReviewReceiveDetailPage"));

function RouteLoadingFallback() {
  return (
    <section className="dashboard-panel" aria-label="화면 로딩 상태">
      <p className="login-message">화면을 불러오는 중...</p>
    </section>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
            <Route path="photos" element={<AdminExportPhotosPage />} />
          </Route>
          <Route path="file-upload" element={<AdminFileUploadPage />} />
          <Route path="bulk-edit" element={<AdminBulkEditPage />} />
          <Route path="setting" element={<AdminSettingPage />} />
        </Route>
        <Route path="/review-receive/specific/:productId" element={<PublicReviewReceiveDetailPage />} />
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </Suspense>
  );
}
