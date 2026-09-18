export type StaffRole = "admin" | "technician";
export type TechnicianType = "service_center" | "mobile";
export type WarrantyStatus = "in_warranty" | "expired" | "not_applicable";
export type ServiceType = "installation" | "repair" | "maintenance";
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
  | "closed"
  | "due";
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
  isRecurring: boolean;
  recurrenceIntervalMonths: number | null;
  nextDueDate: string | null;
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

export type ReportRangeKey = "all" | "30d" | "90d" | "year";

export type ReportsSummary = {
  range: { key: ReportRangeKey; from: string | null; to: string };
  totals: {
    requests: number;
    open: number;
    done: number;
    avgResolutionHours: number | null;
    resolvedCount: number;
    avgRating: number | null;
    ratingCount: number;
  };
  byType: Array<{ type: ServiceType; count: number }>;
  byStatus: Array<{ status: RequestStatus; count: number }>;
  defects: Array<{ type: "dead_on_arrival" | "failed_during_use" | "unspecified"; count: number }>;
  products: Array<Named & { productId: string; sku: string; category: string; count: number }>;
  revenue: {
    inWarranty: { jobs: number; amount: number };
    paid: { jobs: number; amount: number };
  };
  technicians: Array<{
    id: string;
    name: string;
    technicianType: TechnicianType | null;
    avgRating: number | null;
    ratingCount: number;
    jobsDone: number;
  }>;
};
