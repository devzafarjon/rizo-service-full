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
import { ActivityLogPage } from "./features/audit/ActivityLogPage";
import { AlertsPage } from "./features/alerts/AlertsPage";
import { CustomerDuplicatesPage } from "./features/customers/CustomerDuplicatesPage";
import { KioskPickupPage } from "./features/pickup/KioskPickupPage";
import { BackupSettingsPage } from "./features/settings/BackupSettingsPage";
import { MySchedulePage } from "./features/schedule/MySchedulePage";
import { ScheduleCalendarPage } from "./features/schedule/ScheduleCalendarPage";
import { PrintTagPage } from "./features/tags/PrintTagPage";
import { QrScanPage } from "./features/tags/QrScanPage";
import { TagLandingPage } from "./features/tags/TagLandingPage";
import { CalendarPage } from "./features/management/CalendarPage";
import { MapPage } from "./features/management/MapPage";
import { MyEarningsPage } from "./features/management/MyEarningsPage";
import { PartOrdersPage } from "./features/management/PartOrdersPage";
import { SerialCardPage } from "./features/management/SerialCardPage";
import { ServiceCentersPage } from "./features/management/ServiceCentersPage";
import { StaffPage } from "./features/management/StaffPage";
import { WarrantyCardPage } from "./features/management/WarrantyCardPage";
import { DebtsReportPage, DefectsReportPage, FiscalReportPage, LegalReportPage, OutcomesReportPage, PartnersReportPage, PayrollReportPage } from "./features/reporting/MoreReports";
import { ChecklistsPage } from "./features/catalog/ChecklistsPage";
import { HelpAdminPage } from "./features/catalog/HelpAdminPage";
import { SecurityPage } from "./features/auth/SecurityPage";
import { MyStockPage } from "./features/management/MyStockPage";
import { TechStockPage } from "./features/management/TechStockPage";
import { WarrantyPlansPage } from "./features/management/WarrantyPlansPage";
import { CentersPublicPage } from "./features/public/CentersPublicPage";
import { TrackLookupPage } from "./features/public/TrackLookupPage";
import { TrackPage } from "./features/public/TrackPage";
import { PortalRegisterPage } from "./features/portal/PortalRegisterPage";
import { PortalProductsPage } from "./features/portal/PortalProductsPage";
import { PortalHelpPage } from "./features/portal/PortalHelpPage";
import { PortalAccountPage } from "./features/portal/PortalAccountPage";
import { LegalPage } from "./features/public/LegalPage";
import { PublicHelpPage } from "./features/public/PublicHelpPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<StaffLoginPage />} />
      <Route path="/portal/login" element={<CustomerLoginPage />} />
      <Route path="/portal/signup" element={<CustomerSignupPage />} />
      <Route path="/portal/forgot" element={<CustomerForgotPage />} />

      <Route path="/track" element={<TrackLookupPage />} />
      <Route path="/t/:token" element={<TrackPage />} />
      <Route path="/centers" element={<CentersPublicPage />} />
      <Route path="/help" element={<PublicHelpPage />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />

      <Route element={<StaffProtectedRoute />}>
        <Route path="/app" element={<StaffShell />}>
          <Route element={<RoleRoute roles={["admin"]} />}>
            <Route index element={<DashboardPage />} />
            <Route path="schedule" element={<ScheduleCalendarPage />} />
            <Route path="audit" element={<ActivityLogPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="settings" element={<BackupSettingsPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="customers/duplicates" element={<CustomerDuplicatesPage />} />
            <Route path="checklists" element={<ChecklistsPage />} />
            <Route path="help" element={<HelpAdminPage />} />
          </Route>
          <Route element={<RoleRoute roles={["admin", "accountant"]} />}>
            <Route path="reports" element={<ReportsIndexPage />} />
            <Route path="reports/products" element={<ProductReportPage />} />
            <Route path="reports/parts" element={<PartsReportPage />} />
            <Route path="reports/expenses" element={<ExpensesReportPage />} />
            <Route path="reports/profit" element={<ProfitReportPage />} />
            <Route path="reports/technicians" element={<TechnicianReportPage />} />
            <Route path="reports/warranty" element={<WarrantyReportPage />} />
            <Route path="reports/sources" element={<SourcesReportPage />} />
            <Route path="reports/defects" element={<DefectsReportPage />} />
            <Route path="reports/outcomes" element={<OutcomesReportPage />} />
            <Route path="reports/legal" element={<LegalReportPage />} />
            <Route path="reports/debts" element={<DebtsReportPage />} />
            <Route path="reports/payroll" element={<PayrollReportPage />} />
            <Route path="reports/partners" element={<PartnersReportPage />} />
            <Route path="reports/fiscal" element={<FiscalReportPage />} />
          </Route>
          <Route element={<RoleRoute roles={["admin", "warehouse"]} />}>
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="tech-stock" element={<TechStockPage />} />
          </Route>
          <Route element={<RoleRoute roles={["admin", "receptionist", "warehouse"]} />}>
            <Route path="part-orders" element={<PartOrdersPage />} />
          </Route>
          <Route element={<RoleRoute roles={["admin", "receptionist", "accountant"]} />}>
            <Route path="warranty-plans" element={<WarrantyPlansPage />} />
          </Route>
          <Route element={<RoleRoute roles={["admin", "receptionist"]} />}>
            <Route path="kanban" element={<AdminKanbanPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="sales/:id/warranty-card" element={<WarrantyCardPage />} />
            <Route path="serials/:serial" element={<SerialCardPage />} />
            <Route path="requests" element={<ServiceRequestsPage />} />
            <Route path="requests/new" element={<NewRequestPage />} />
            <Route path="requests/:id" element={<RequestDetailPage />} />
            <Route path="requests/:id/tag" element={<PrintTagPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="centers" element={<ServiceCentersPage />} />
            <Route path="kiosk" element={<KioskPickupPage />} />
            <Route path="receipts" element={<ReceiptPage />} />
            <Route path="receipts/:id" element={<ReceiptPrintPage />} />
          </Route>
          <Route path="security" element={<SecurityPage />} />
          <Route path="scan" element={<QrScanPage />} />
          <Route path="tag/:displayId" element={<TagLandingPage />} />
          <Route element={<RoleRoute roles={["technician"]} />}>
            <Route path="my-jobs" element={<TechnicianKanbanPage />} />
            <Route path="my-jobs/:id/complete" element={<JobCompletePage />} />
            <Route path="my-jobs/:id/receipt" element={<ReceiptPrintPage />} />
            <Route path="my-schedule" element={<MySchedulePage />} />
            <Route path="my-earnings" element={<MyEarningsPage />} />
            <Route path="my-stock" element={<MyStockPage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<CustomerProtectedRoute />}>
        <Route path="/portal" element={<PortalShell />}>
          <Route index element={<PortalHomePage />} />
          <Route path="new" element={<PortalNewRequestPage />} />
          <Route path="register" element={<PortalRegisterPage />} />
          <Route path="products" element={<PortalProductsPage />} />
          <Route path="help" element={<PortalHelpPage />} />
          <Route path="account" element={<PortalAccountPage />} />
          <Route path="requests/:id" element={<PortalRequestDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
