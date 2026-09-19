export type StaffRole = "admin" | "technician";
export type TechnicianType = "service_center" | "mobile";
export type WarrantyStatus = "in_warranty" | "expired" | "not_applicable";
export type ServiceType = "installation" | "repair";
export type RequestStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "received"
  | "diagnosing"
  | "awaiting_parts"
  | "repairing"
  | "ready_for_pickup"
  | "replaced"
  | "closed";
export type Priority = "low" | "medium" | "high" | "urgent";
export type LocationType = "in_shop" | "on_site";
export type PaymentStatus = "not_required" | "pending" | "paid";

export type AppLocale = "uz" | "ru" | "en";

export type Named = {
  name: string;
  nameUz?: string;
  nameRu?: string;
  nameEn?: string;
};

export type StaffUser = {
  id: string;
  name: string;
  phone: string;
  role: StaffRole;
  technicianType: TechnicianType | null;
  isAvailable: boolean;
  locale: AppLocale;
};

export type CustomerUser = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  locale: AppLocale;
};

export type StaffCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  regionCode: string;
  notes: string | null;
  createdAt: string;
  salesCount: number;
  requestsCount: number;
};

export type Product = Named & {
  id: string;
  sku: string;
  category: string;
  createdAt: string;
  salesCount: number;
  requestsCount: number;
};

export type CatalogService = Named & {
  id: string;
  price: number;
  productCategory: string;
  createdAt: string;
  usedCount: number;
};

export type SparePart = Named & {
  id: string;
  price: number;
  productCategory: string;
  stockQuantity: number;
  createdAt: string;
  usedCount: number;
};

export type Sale = {
  id: string;
  customerId: string;
  productId: string;
  quantity: number;
  saleDate: string;
  pricePaid: number;
  warrantyMonths: number;
  warrantyExpiry: string;
  warrantyStatus: WarrantyStatus;
  invoiceNumber: string;
  createdAt: string;
  requestsCount: number;
  customer: { id: string; name: string; phone: string };
  product: Named & { id: string; sku: string; category: string };
};

export type CustomerSale = {
  id: string;
  invoiceNumber: string;
  quantity: number;
  saleDate: string;
  pricePaid: number;
  warrantyMonths: number;
  warrantyExpiry: string;
  warrantyStatus: WarrantyStatus;
  product: Named & { id: string; sku: string; category: string };
};

export type CustomerRequest = {
  id: string;
  displayId: string;
  type: ServiceType;
  status: RequestStatus;
  priority: Priority;
  warrantyStatus: WarrantyStatus;
  locationType: LocationType;
  createdAt: string;
  receivedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  finalCost: number | null;
  paymentStatus: PaymentStatus;
  product: Named & { id: string; sku: string; category: string };
  assignedTechnician: { id: string; name: string } | null;
};

export type DefectType = "dead_on_arrival" | "failed_during_use";
export type RequestSource = "rizo_market" | "rizo_service";

export type CustomerLocation = {
  address: string;
  lat?: number | null;
  lng?: number | null;
};

export type TechnicianSummary = {
  id: string;
  name: string;
  phone: string;
  technicianType: TechnicianType | null;
  isAvailable: boolean;
  openJobCount: number;
};

export type ServiceRequest = {
  id: string;
  displayId: string;
  type: ServiceType;
  source: RequestSource;
  submittedByCustomer: boolean;
  saleId: string | null;
  customerId: string;
  productId: string;
  issueDescription: string;
  defectType: DefectType | null;
  locationType: LocationType;
  customerLocation: CustomerLocation | null;
  technicianTypeRequired: TechnicianType;
  assignedTechnicianId: string | null;
  status: RequestStatus;
  priority: Priority;
  warrantyStatus: WarrantyStatus;
  isPaidRepair: boolean;
  estimatedCost: number | null;
  finalCost: number | null;
  paymentStatus: PaymentStatus;
  receivedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string; address: string | null; regionCode?: string };
  product: Named & { id: string; sku: string; category: string };
  assignedTechnician: { id: string; name: string; technicianType: TechnicianType | null; isAvailable: boolean } | null;
  sale: {
    id: string;
    invoiceNumber: string;
    saleDate: string;
    warrantyMonths: number;
    warrantyExpiry: string;
    warrantyStatus: WarrantyStatus;
    product: Named & { id: string; sku: string; category: string };
  } | null;
};

export type TechColumn = "new" | "in_progress" | "paused" | "completed";

export type TechJobPause = {
  id: string;
  reason: string;
  pausedAt: string;
  customTimerHours: number;
};

export type TechJobTimer = {
  startsAt: string;
  durationMs: number;
};

export type TechJob = ServiceRequest & {
  column: TechColumn;
  activePause: TechJobPause | null;
  timer: TechJobTimer | null;
};

export type JobServiceLine = Named & {
  id: string;
  serviceCatalogItemId: string;
  priceAtTime: number;
};

export type JobPartLine = Named & {
  id: string;
  sparePartId: string;
  quantity: number;
  priceAtTime: number;
  lineTotal: number;
};

export type JobExtraExpense = {
  id: string;
  description: string;
  price: number;
};

export type JobPhoto = {
  id: string;
  photoUrl: string;
  uploadedBy: string;
  createdAt: string;
};

export type JobCost = {
  servicesTotal: number;
  partsTotal: number;
  extrasTotal: number;
  catalogTotal: number;
  workTotal: number;
  chargedTotal: number;
  coveredByWarranty: boolean;
};

export type CatalogChoice = Named & {
  id: string;
  price: number;
  productCategory: string;
  stockQuantity?: number;
};

export type JobWorkPayload = {
  job: TechJob;
  serviceLines: JobServiceLine[];
  partLines: JobPartLine[];
  extraExpenses: JobExtraExpense[];
  photos: JobPhoto[];
  pauses: RequestPauseRecord[];
  timeline: TimelineEvent[];
  cost: JobCost;
  canComplete: boolean;
  missing: string[];
  catalog: {
    services: CatalogChoice[];
    parts: CatalogChoice[];
  };
};

export type RequestPauseRecord = {
  id: string;
  pausedAt: string;
  resumedAt: string | null;
  reason: string;
  customTimerHours: number;
  durationMs: number | null;
};

export type TimelineEvent = {
  key: string;
  kind: "created" | "received" | "accepted" | "arrived" | "paused" | "resumed" | "completed";
  at: string;
  title: string;
  detail: string | null;
  titleKey?: string;
  detailKey?: string;
  params?: Record<string, unknown>;
};

export type SearchResults = {
  customers: Array<{ id: string; name: string; phone: string; address: string | null }>;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    saleDate: string;
    pricePaid: number;
    warrantyExpiry: string;
    warrantyStatus: WarrantyStatus;
    customer: { id: string; name: string; phone: string };
    product: Named & { id: string; sku: string };
  }>;
  requests: Array<{
    id: string;
    displayId: string;
    status: RequestStatus;
    type: ServiceType;
    customerName: string;
    productName: string;
    product: Named;
  }>;
};

export type PortalRequest = {
  id: string;
  displayId: string;
  type: ServiceType;
  status: RequestStatus;
  priority: Priority;
  warrantyStatus: WarrantyStatus;
  locationType: LocationType;
  issueDescription: string;
  createdAt: string;
  completedAt: string | null;
  submittedByCustomer: boolean;
  product: Named & { id: string; sku: string; category: string };
  assignedTechnician: { name: string } | null;
  sale: { invoiceNumber: string; warrantyExpiry: string; warrantyStatus: WarrantyStatus } | null;
  feedback: { rating: number; comment: string | null; createdAt: string } | null;
  canFeedback: boolean;
};

export type PortalNotification = {
  id: string;
  serviceRequestId: string;
  message: string;
  code: string | null;
  params: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

export type PortalSale = {
  id: string;
  invoiceNumber: string;
  quantity: number;
  saleDate: string;
  pricePaid: number;
  warrantyMonths: number;
  warrantyExpiry: string;
  warrantyStatus: WarrantyStatus;
  product: Named & { id: string; sku: string; category: string };
};

export type ReportPreset = "week" | "month" | "quarter" | "year" | "all" | "custom";
export type TrendGrain = "day" | "week" | "month";

export type ReportWindow = {
  preset: ReportPreset;
  from: string | null;
  to: string;
};

export type TrendPoint = {
  key: string;
  requests: number;
  revenue: number;
  costs: number;
  profit: number;
};

export type DashboardReport = {
  range: ReportWindow;
  grain: TrendGrain;
  totals: {
    requests: number;
    revenue: number;
    profit: number;
    costs: number;
    avgResolutionHours: number | null;
    avgRating: number | null;
    ratingCount: number;
  };
  trend: TrendPoint[];
  topProducts: Array<Named & { id: string; sku: string; category: string; count: number }>;
  topParts: Array<Named & { id: string; quantity: number }>;
  defectsByCategory: Array<{ category: string; count: number }>;
  byStatus: Array<{ status: RequestStatus | "paused"; count: number }>;
  warrantySplit: { free: number; paid: number };
};

export type ProductReport = {
  range: ReportWindow;
  rows: Array<
    Named & {
      id: string;
      sku: string;
      category: string;
      requests: number;
      installation: number;
      repair: number;
      revenue: number;
      warranty: number;
      paid: number;
      warrantyRatio: number;
    }
  >;
};

export type PartsReport = {
  range: ReportWindow;
  productId: string | null;
  products: Array<Named & { id: string; sku: string }>;
  rows: Array<Named & { id: string; quantity: number; revenue: number }>;
};

export type ExpensesReport = {
  range: ReportWindow;
  totals: { extras: number; parts: number; running: number };
  byTechnician: Array<{ id: string; name: string; extras: number; parts: number; total: number }>;
  byProduct: Array<Named & { id: string; sku: string; category: string; extras: number; parts: number; total: number }>;
};

export type ProfitReport = {
  range: ReportWindow;
  grain: TrendGrain;
  totals: { revenue: number; parts: number; extras: number; costs: number; profit: number; done: number };
  trend: TrendPoint[];
};

export type TechnicianReport = {
  range: ReportWindow;
  rows: Array<{
    id: string;
    name: string;
    technicianType: TechnicianType | null;
    completed: number;
    avgResolutionHours: number | null;
    avgRating: number | null;
    ratingCount: number;
    revenue: number;
  }>;
};

export type WarrantyReport = {
  range: ReportWindow;
  grain: TrendGrain;
  totals: { freeCount: number; paidCount: number; freeValue: number; paidValue: number };
  trend: Array<{ key: string; free: number; paid: number; freeValue: number; paidValue: number }>;
};

export type SourcesReport = {
  range: ReportWindow;
  rows: Array<{ source: "rizo_market" | "rizo_service" | "portal"; count: number }>;
};
