export type StaffRole = "admin" | "technician" | "receptionist" | "accountant" | "warehouse";
export type TechnicianType = "service_center" | "mobile";
export type WarrantyStatus = "in_warranty" | "expired" | "not_applicable";
export type ServiceType = "installation" | "repair";
export type RequestStatus =
  | "new"
  | "diagnosing"
  | "awaiting_decision"
  | "awaiting_parts"
  | "in_progress"
  | "paused"
  | "ready"
  | "completed"
  | "picked_up"
  | "replaced"
  | "refunded"
  | "rejected"
  | "cancelled";
export type RequestDecision = "warranty_repair" | "paid_repair" | "replace" | "refund" | "reject";
export type PaymentMethod = "cash" | "card" | "transfer" | "payme" | "click" | "other";
export type ResolutionType = "repair" | "replace" | "refund";
export type PickupConfirmationType = "tap" | "signature";
export type Priority = "low" | "medium" | "high" | "urgent";
export type LocationType = "in_shop" | "on_site";
export type PaymentStatus = "not_required" | "pending" | "partial" | "paid";

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
  isActive?: boolean;
  locale: AppLocale;
  totpEnabled?: boolean;
};

export type CustomerUser = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  locale: AppLocale;
  preferredChannel?: "sms" | "telegram" | "both";
  telegramLinked?: boolean;
  deletionRequested?: boolean;
};

export type StaffCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  regionCode: string;
  deletionRequested?: boolean;
  anonymized?: boolean;
  notes: string | null;
  createdAt: string;
  salesCount: number;
  requestsCount: number;
};

export type Product = Named & {
  id: string;
  sku: string;
  category: string;
  warrantyMonths: number;
  warrantyStartsOn: "installation" | "sale";
  warrantyCoversLabor: boolean;
  warrantyCoversParts: boolean;
  createdAt: string;
  salesCount: number;
  requestsCount: number;
};

export type CatalogService = Named & {
  id: string;
  price: number;
  productCategories: string[];
  createdAt: string;
  usedCount: number;
};

export type SparePart = Named & {
  id: string;
  price: number;
  costPrice: number;
  productCategories: string[];
  stockQuantity: number;
  lowStockThreshold: number;
  lowStock?: boolean;
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
  installationDate?: string | null;
  serialNumber?: string | null;
  source?: "rizo" | "registered";
  isVerified?: boolean;
  extensionMonths?: number;
  extensionReason?: string | null;
  voided?: boolean;
  voidReason?: string | null;
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
export type EstimateStatus = "draft" | "sent" | "approved" | "declined" | "expired";
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
  resolutionType: ResolutionType | null;
  decision: RequestDecision | null;
  decisionNote: string | null;
  rejectionReason: string | null;
  serialNumber: string | null;
  scheduledAt: string | null;
  visitSlot: string | null;
  visitConfirmedAt: string | null;
  visitRescheduleCount: number;
  etaMinutes: number | null;
  etaSetAt: string | null;
  escalationLevel: number;
  enRouteAt: string | null;
  legalDueAt: string | null;
  isLegallyOverdue: boolean;
  isRepeat: boolean;
  repeatOfId: string | null;
  repairWarrantyUntil: string | null;
  fiscalReceiptNumber: string | null;
  intakeChecklist: string[];
  intakeNotes: string | null;
  intakeSignatureUrl: string | null;
  defectCodeId: string | null;
  returnReasonId: string | null;
  serviceCenter: { id: string; name: string } | null;
  trackingToken: string;
  estimate: { id: string; status: EstimateStatus } | null;
  payment: { due: number; paid: number; refunded: number; balance: number };
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
  assignedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  overdueAt: string | null;
  isOverdue: boolean;
  timer: TechJobTimer | null;
  activePause: TechJobPause | null;
  pickupConfirmedAt: string | null;
  pickupConfirmationType: PickupConfirmationType | null;
  pickupSignatureUrl: string | null;
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

export type JobReplacement = Named & {
  id: string;
  productId: string;
  serialNumber: string;
  sku: string;
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
  productCategories: string[];
  stockQuantity?: number;
  /** How many the technician carries (van stock). */
  carried?: number;
  lowStockThreshold?: number;
  lowStock?: boolean;
};

export type JobWorkPayload = {
  job: TechJob;
  serviceLines: JobServiceLine[];
  partLines: JobPartLine[];
  extraExpenses: JobExtraExpense[];
  photos: JobPhoto[];
  resolutionType: ResolutionType | null;
  replacement: JobReplacement | null;
  pauses: RequestPauseRecord[];
  timeline: TimelineEvent[];
  decision: RequestDecision | null;
  estimates: Estimate[];
  defectCodes: DefectCodeOption[];
  partOrders: Array<Named & { id: string; quantity: number; status: PartOrder["status"]; createdAt: string }>;
  notes: NoteRow[];
  cost: JobCost;
  canComplete: boolean;
  missing: string[];
  checklist?: JobChecklist;
  catalog: {
    services: CatalogChoice[];
    parts: CatalogChoice[];
    replacementProducts: Array<Named & { id: string; sku: string; category: string }>;
  };
  settings?: { blockZeroStock: boolean };
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
  kind: "created" | "received" | "assigned" | "accepted" | "en_route" | "arrived" | "paused" | "resumed" | "completed" | "picked_up" | "status" | "decision" | "estimate";
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
    serialNumber?: string | null;
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
  feedback: { rating: number; comment: string | null; tags: string[]; createdAt: string } | null;
  canFeedback: boolean;
  pickupConfirmedAt: string | null;
  canConfirmPickup: boolean;
  serialNumber: string | null;
  scheduledAt: string | null;
  visit: VisitInfo;
  eta: { minutes: number; setAt: string } | null;
  enRouteAt: string | null;
  dueBy: string | null;
  repairWarrantyUntil: string | null;
  rejectionReason: string | null;
  serviceCenter: { id: string; name: string; address: string; phone: string | null; workingHours: string | null } | null;
  trackingToken: string;
  payment: { due: number; paid: number; refunded: number; balance: number };
  estimate: PortalEstimate | null;
  messages: Array<{ id: string; text: string; fromCustomer: boolean; createdAt: string }>;
};

export type PortalEstimate = {
  id: string;
  status: EstimateStatus;
  validUntil: string;
  note: string | null;
  canRespond: boolean;
  total?: number;
  lines?: Array<{ id: string; kind: EstimateLine["kind"]; name: string; names: Named | null; quantity: number; unitPrice: number; isOptional: boolean; isSelected: boolean }>;
};

export type StaffAlert = {
  id: string;
  serviceRequestId: string | null;
  sparePartId: string | null;
  message: string;
  code: string | null;
  params: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  userId: string;
  userType: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
};

export type ScheduleDay = {
  id: string;
  technicianId: string;
  date: string;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type OutboundMessage = {
  id: string;
  channel: string;
  to: string;
  body: string;
  status: string;
  error: string | null;
  code: string | null;
  createdAt: string;
  sentAt: string | null;
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
  serialNumber?: string | null;
  isVerified?: boolean;
  invoiceNumber: string;
  quantity: number;
  saleDate: string;
  pricePaid: number;
  warrantyMonths: number;
  warrantyExpiry: string;
  warrantyStatus: WarrantyStatus;
  warrantyDaysLeft?: number | null;
  voided?: boolean;
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
  previous: { requests: number; revenue: number; profit: number } | null;
  totals: {
    requests: number;
    revenue: number;
    profit: number;
    costs: number;
    avgResolutionHours: number | null;
    avgWorkMinutes: number | null;
    avgRating: number | null;
    ratingCount: number;
    legalOverdue: number;
    debt: number;
  };
  service: ServiceKpis;
  trend: TrendPoint[];
  topProducts: Array<Named & { id: string; sku: string; category: string; count: number }>;
  topParts: Array<Named & { id: string; quantity: number }>;
  defectsByCategory: Array<{ category: string; count: number }>;
  byStatus: Array<{ status: RequestStatus; count: number }>;
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

export type EstimateLine = {
  id: string;
  kind: "service" | "part" | "labor" | "other";
  serviceCatalogItemId?: string | null;
  sparePartId?: string | null;
  name: string;
  names: Named | null;
  quantity: number;
  unitPrice: number;
  isOptional: boolean;
  isSelected: boolean;
  isFulfilled?: boolean;
};

export type Estimate = {
  id: string;
  status: EstimateStatus;
  note: string | null;
  validUntil: string;
  sentAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdByName: string | null;
  createdAt: string;
  total: number;
  lines: EstimateLine[];
};

export type PaymentRow = {
  id: string;
  kind: "payment" | "refund";
  method: PaymentMethod;
  amount: number;
  note: string | null;
  fiscalReceiptNumber?: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type NoteRow = {
  id: string;
  text: string;
  authorScope: "staff" | "customer";
  authorName: string | null;
  isVisibleToCustomer: boolean;
  createdAt: string;
};

export type DefectCodeOption = Named & { id: string; code: string };

export type ServiceCenter = {
  id: string;
  name: string;
  regionCode: string;
  address: string;
  phone: string | null;
  workingHours: string | null;
  lat: number | null;
  lng: number | null;
  isAuthorized: boolean;
  isActive: boolean;
  isPartner?: boolean;
  payoutPercent?: number;
  payoutFixedPerJob?: number;
  staffCount?: number;
  requestsCount?: number;
};

export type PartOrder = {
  id: string;
  quantity: number;
  status: "requested" | "ordered" | "received" | "cancelled";
  supplier: string | null;
  note: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  part: Named & { id: string; stockQuantity: number };
  request: { id: string; displayId: string; status: RequestStatus } | null;
};

export type RequestDetailPayload = {
  request: ServiceRequest;
  pauses: RequestPauseRecord[];
  timeline: TimelineEvent[];
  serviceLines: JobServiceLine[];
  partLines: JobPartLine[];
  extraExpenses: JobExtraExpense[];
  photos: JobPhoto[];
  resolutionType: ResolutionType | null;
  replacement: JobReplacement | null;
  cost: JobCost;
  matchingServices: Array<Named & { id: string; price: number; productCategories: string[] }>;
  matchingParts: Array<Named & { id: string; price: number; productCategories: string[]; stockQuantity: number }>;
  estimates: Estimate[];
  payments: PaymentRow[];
  paymentSummary: { due: number; paid: number; refunded: number; net: number; balance: number };
  notes: NoteRow[];
  defectCodes: DefectCodeOption[];
  returnReasons: DefectCodeOption[];
  repeatOf: { id: string; displayId: string } | null;
  feedback: { rating: number; comment: string | null; tags: string[]; createdAt: string } | null;
  settings: AppSettings;
};

export type FeedbackReport = {
  range: { preset: ReportPreset; from: string | null; to: string };
  summary: {
    count: number;
    average: number | null;
    withComment: number;
    distribution: Array<{ rating: number; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
  truncated: boolean;
  technicians: Array<{ id: string; name: string }>;
  items: Array<{
    id: string;
    createdAt: string;
    rating: number;
    comment: string | null;
    tags: string[];
    customer: { id: string; name: string; phone: string };
    request: { id: string; displayId: string; type: ServiceType; product: Named };
    technician: { id: string; name: string } | null;
  }>;
};

export type AppSettings = {
  blockZeroStock: boolean;
  requireEstimate: boolean;
  repairWarrantyDays: number;
  repairLegalDays: number;
  estimateValidDays: number;
  pickupStorageDays: number;
  visitSlots: string;
  visitsPerTechnicianPerDay: number;
  rescheduleLimit: number;
  cancelBeforeHours: number;
  escalationHours: number;
  escalationHoursUrgent: number;
  lowRatingThreshold: number;
  requireFiscalReceipt: boolean;
  weeklyDigest: boolean;
  warrantyExpiryNoticeDays: number;
};

// ---- growth suite -------------------------------------------------------------------------------------------------

export type TechnicianStockRow = Named & { sparePartId: string; quantity: number };
export type TechnicianStockOverview = { id: string; name: string; technicianType: TechnicianType | null; items: TechnicianStockRow[]; total: number };
export type StockMovement = {
  id: string;
  kind: "issue" | "return" | "used" | "unused" | "adjust";
  quantity: number;
  technicianName: string | null;
  part: Named | null;
  serviceRequestId: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type ChecklistItem = { id: string; uz: string; ru: string; en: string; required: boolean };
export type ChecklistTemplate = { id: string; kind: "diagnosis" | "completion"; productCategory: string | null; items: ChecklistItem[]; isActive: boolean };
export type JobChecklist = {
  diagnosis: { items: ChecklistItem[]; checked: string[] };
  completion: { items: ChecklistItem[]; checked: string[] };
  missingRequired: string[];
};

export type HelpArticle = {
  id: string;
  productCategory: string | null;
  productId: string | null;
  title: { uz: string; ru: string; en: string };
  body: { uz: string; ru: string; en: string };
  videoUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export type WarrantyPlan = Named & { id: string; months: number; price: number; productCategories: string[]; isActive: boolean };
export type WarrantyPurchase = {
  id: string;
  status: "requested" | "paid" | "cancelled";
  months: number;
  price: number;
  paymentMethod: PaymentMethod | null;
  fiscalReceiptNumber: string | null;
  requestedAt: string;
  paidAt: string | null;
  plan: WarrantyPlan;
  customer: { id: string; name: string; phone: string };
  sale: { id: string; invoiceNumber: string; serialNumber: string | null; warrantyExpiry: string; warrantyStatus: WarrantyStatus; product: Named & { id: string; sku: string } };
};

export type VisitSlot = { slot: string; left: number; free: boolean };
export type VisitInfo = { slot: string | null; confirmed: boolean; canBook: boolean; canReschedule: boolean; canCancel: boolean };

export type ServiceKpis = {
  repairsFinished: number;
  firstTimeFixRate: number | null;
  callbackRate: number | null;
  callbackCost: number;
  statusHours: Array<{ status: string; hours: number; jobs: number }>;
  avgPartsWaitHours: number | null;
  avgDecisionWaitHours: number | null;
  jobsCost: number;
};

export type PartnersReport = {
  range: ReportWindow;
  totalPayout: number;
  rows: Array<{
    center: { id: string; name: string; payoutPercent: number; payoutFixedPerJob: number };
    jobs: number;
    labour: number;
    payout: number;
    detail: Array<{ id: string; displayId: string; product: string; completedAt: string | null; labour: number; payout: number }>;
  }>;
};

export type FiscalReport = {
  range: ReportWindow;
  count: number;
  total: number;
  rows: Array<{ id: string; requestId: string; displayId: string; method: PaymentMethod; amount: number; createdAt: string; createdByName: string | null }>;
};

export type PayLinks = { enabled: boolean; amount: number; payme?: string; click?: string };
