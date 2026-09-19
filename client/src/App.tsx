import { Navigate, Route, Routes } from "react-router-dom";
import { PortalShell } from "./components/layout/PortalShell";
import { StaffShell } from "./components/layout/StaffShell";
import { CustomerForgotPage } from "./features/auth/CustomerForgotPage";
import { CustomerLoginPage } from "./features/auth/CustomerLoginPage";
import { CustomerSignupPage } from "./features/auth/CustomerSignupPage";
import { CustomerProtectedRoute } from "./features/auth/CustomerProtectedRoute";
import { HomePage } from "./features/auth/HomePage";
import { RoleRoute, StaffProtectedRoute } from "./features/auth/ProtectedRoute";
import { StaffLoginPage } from "./features/auth/StaffLoginPage";
import { DashboardPage } from "./features/reporting/DashboardPage";
import {
  ExpensesReportPage,
  PartsReportPage,
  ProductReportPage,
  ProfitReportPage,
  ReportsIndexPage,
  SourcesReportPage,
  TechnicianReportPage,
  WarrantyReportPage,
} from "./features/reporting/ReportsPages";
import { CatalogPage } from "./features/catalog/CatalogPage";
import { CustomerDetailPage } from "./features/customers/CustomerDetailPage";
import { CustomersPage } from "./features/customers/CustomersPage";
import { AdminKanbanPage } from "./features/kanban-admin/AdminKanbanPage";
import { TechnicianKanbanPage } from "./features/kanban-technician/TechnicianKanbanPage";
import { JobCompletePage } from "./features/kanban-technician/JobCompletePage";
import { PortalHomePage } from "./features/portal/PortalHomePage";
import { PortalNewRequestPage } from "./features/portal/PortalNewRequestPage";
import { PortalRequestDetailPage } from "./features/portal/PortalRequestDetailPage";
import { ReceiptPage } from "./features/receipt/ReceiptPage";
import { ReceiptPrintPage } from "./features/receipt/ReceiptPrintPage";
import { SalesPage } from "./features/sales/SalesPage";
import { NewRequestPage } from "./features/service-requests/NewRequestPage";
import { RequestDetailPage } from "./features/service-requests/RequestDetailPage";
import { ServiceRequestsPage } from "./features/service-requests/ServiceRequestsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<StaffLoginPage />} />
      <Route path="/portal/login" element={<CustomerLoginPage />} />
      <Route path="/portal/signup" element={<CustomerSignupPage />} />
      <Route path="/portal/forgot" element={<CustomerForgotPage />} />

      <Route element={<StaffProtectedRoute />}>
        <Route path="/app" element={<StaffShell />}>
          <Route element={<RoleRoute roles={["admin"]} />}>
            <Route index element={<DashboardPage />} />
            <Route path="kanban" element={<AdminKanbanPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="requests" element={<ServiceRequestsPage />} />
            <Route path="requests/new" element={<NewRequestPage />} />
            <Route path="requests/:id" element={<RequestDetailPage />} />
            <Route path="receipts" element={<ReceiptPage />} />
            <Route path="receipts/:id" element={<ReceiptPrintPage />} />
            <Route path="reports" element={<ReportsIndexPage />} />
            <Route path="reports/products" element={<ProductReportPage />} />
            <Route path="reports/parts" element={<PartsReportPage />} />
            <Route path="reports/expenses" element={<ExpensesReportPage />} />
            <Route path="reports/profit" element={<ProfitReportPage />} />
            <Route path="reports/technicians" element={<TechnicianReportPage />} />
            <Route path="reports/warranty" element={<WarrantyReportPage />} />
            <Route path="reports/sources" element={<SourcesReportPage />} />
          </Route>
          <Route element={<RoleRoute roles={["technician"]} />}>
            <Route path="my-jobs" element={<TechnicianKanbanPage />} />
            <Route path="my-jobs/:id/complete" element={<JobCompletePage />} />
            <Route path="my-jobs/:id/receipt" element={<ReceiptPrintPage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<CustomerProtectedRoute />}>
        <Route path="/portal" element={<PortalShell />}>
          <Route index element={<PortalHomePage />} />
          <Route path="new" element={<PortalNewRequestPage />} />
          <Route path="requests/:id" element={<PortalRequestDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
