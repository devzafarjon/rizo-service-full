import { pushJobAssigned } from "./push.js";
import { Prisma } from "@prisma/client";
import type { LocationType, Priority, RequestSource, ServiceType, TechnicianType } from "@prisma/client";
import { initialStatusFor, paymentFor, pickAvailableTechnician } from "./assignment.js";
import { allocateDisplayId } from "./displayId.js";
import { HttpError } from "./httpError.js";
import { notifyRequestCreated } from "./notifyCustomer.js";
import { prisma } from "./prisma.js";
import { publishRequest } from "./realtime.js";
import { detectRepeat, findDuplicate } from "./requestRules.js";
import { requestInclude, serializeRequest } from "./serializeRequest.js";
import { repairLegalDays } from "./settings.js";
import { saveSignature } from "./uploads.js";
import { computeWarrantyStatus } from "./warranty.js";

export type CreateRequestInput = {
  type: ServiceType;
  customerId: string;
  saleId?: string | null;
  productId?: string | null;
  issueDescription: string;
  defectType?: "dead_on_arrival" | "failed_during_use" | null;
  locationType: LocationType;
  customerLocation?: { address: string; lat?: number | null; lng?: number | null } | null;
  technicianTypeRequired?: TechnicianType;
  assignedTechnicianId?: string | null;
  autoAssign?: boolean;
  priority?: Priority;
  source?: RequestSource;
  submittedByCustomer?: boolean;
  serialNumber?: string | null;
  scheduledAt?: Date | null;
  serviceCenterId?: string | null;
  intake?: { checklist?: string[]; notes?: string | null; signatureDataUrl?: string | null } | null;
  /** Staff may knowingly create a second request for the same unit. */
  allowDuplicate?: boolean;
};

/**
 * The one place a service request is created. The admin form, the customer portal and — later — the
 * RIZO market integration all call this, so warranty, duplicate checks, assignment and numbering stay identical.
 */
export async function createServiceRequest(input: CreateRequestInput) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new HttpError(400, "Customer not found");

  let sale = null;
  if (input.saleId) {
    sale = await prisma.sale.findUnique({ where: { id: input.saleId } });
    if (!sale) throw new HttpError(400, "Sale not found");
    if (sale.customerId !== customer.id) {
      throw new HttpError(400, input.submittedByCustomer ? "This purchase was not found on your account" : "This sale does not belong to the selected customer");
    }
  }
  const productId = sale ? sale.productId : input.productId;
  if (!productId) throw new HttpError(400, "Select a past purchase or a product");
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(400, "Product not found");

  const serialNumber = input.serialNumber?.trim() || sale?.serialNumber || null;
  const identity = { customerId: customer.id, saleId: sale?.id ?? null, serialNumber, productId: product.id };

  if (!input.allowDuplicate) {
    const duplicate = await findDuplicate({ ...identity, type: input.type });
    if (duplicate) {
      throw new HttpError(409, "A request for this product is already open", "duplicateRequest", {
        id: duplicate.id,
        displayId: duplicate.displayId,
      });
    }
  }

  const repeat = input.type === "repair" ? await detectRepeat(identity) : null;
  const warrantyStatus = sale ? computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry) : "not_applicable";
  const freeRepeat = Boolean(repeat?.coveredByRepairWarranty);
  const payment = freeRepeat ? { isPaidRepair: false, paymentStatus: "not_required" as const } : paymentFor(input.type, warrantyStatus);

  const technicianTypeRequired = input.technicianTypeRequired ?? (input.locationType === "on_site" ? "mobile" : "service_center");
  let serviceCenterId = input.locationType === "in_shop" ? (input.serviceCenterId ?? null) : null;
  if (input.locationType === "in_shop" && !serviceCenterId) {
    const center = await prisma.serviceCenter.findFirst({
      where: { isActive: true, regionCode: customer.regionCode },
      orderBy: { createdAt: "asc" },
    });
    serviceCenterId = center?.id ?? null;
  }

  let assignedTechnicianId: string | null = null;
  let assignmentMode: "manual" | "auto" | "unassigned" = "unassigned";
  if (input.assignedTechnicianId) {
    const technician = await prisma.staffUser.findUnique({ where: { id: input.assignedTechnicianId } });
    if (!technician || technician.role !== "technician") throw new HttpError(400, "Technician not found");
    if (!technician.isActive) throw new HttpError(400, "This technician is not active", "technicianInactive");
    if (technician.technicianType !== technicianTypeRequired) throw new HttpError(400, "This technician does not match the required type");
    assignedTechnicianId = technician.id;
    assignmentMode = "manual";
  } else if (input.autoAssign !== false) {
    const picked = await pickAvailableTechnician(technicianTypeRequired, {
      serviceCenterId,
      productCategory: product.category,
      location: input.customerLocation ?? null,
    });
    assignedTechnicianId = picked?.id ?? null;
    assignmentMode = picked ? "auto" : "unassigned";
  }

  const now = new Date();
  const legalDays = input.type === "repair" ? await repairLegalDays() : null;
  const customerLocation =
    input.locationType === "on_site" && input.customerLocation
      ? {
          address: input.customerLocation.address,
          lat: typeof input.customerLocation.lat === "number" ? input.customerLocation.lat : null,
          lng: typeof input.customerLocation.lng === "number" ? input.customerLocation.lng : null,
        }
      : Prisma.JsonNull;

  const created = await prisma.$transaction(async (tx) => {
    const displayId = await allocateDisplayId(tx, {
      regionCode: customer.regionCode,
      address: customer.address,
      extraAddress: input.customerLocation?.address,
      at: now,
    });
    return tx.serviceRequest.create({
      data: {
        displayId,
        type: input.type,
        source: input.source ?? "rizo_service",
        submittedByCustomer: Boolean(input.submittedByCustomer),
        saleId: sale?.id ?? null,
        customerId: customer.id,
        productId: product.id,
        serialNumber,
        issueDescription: input.issueDescription,
        defectType: input.type === "repair" ? (input.defectType ?? null) : null,
        locationType: input.locationType,
        customerLocation,
        technicianTypeRequired,
        assignedTechnicianId,
        assignedAt: assignedTechnicianId ? now : null,
        serviceCenterId,
        status: initialStatusFor(),
        statusChangedAt: now,
        priority: repeat && (input.priority ?? "medium") !== "urgent" ? "high" : (input.priority ?? "medium"),
        warrantyStatus,
        isPaidRepair: payment.isPaidRepair,
        paymentStatus: payment.paymentStatus,
        decision: freeRepeat ? "warranty_repair" : null,
        decisionNote: freeRepeat ? `Repeat failure inside the warranty of repair #${repeat!.previous.displayId}` : null,
        decidedAt: freeRepeat ? now : null,
        isRepeat: Boolean(repeat),
        repeatOfId: repeat?.previous.id ?? null,
        scheduledAt: input.scheduledAt ?? null,
        legalDueAt: legalDays != null ? new Date(now.getTime() + legalDays * 86_400_000) : null,
        intakeChecklist: input.intake?.checklist?.length ? input.intake.checklist : undefined,
        intakeNotes: input.intake?.notes?.trim() || null,
        receivedAt: now,
      },
      include: requestInclude,
    });
  });

  let withSignature = created;
  if (input.intake?.signatureDataUrl) {
    const url = saveSignature("intake", created.id, input.intake.signatureDataUrl);
    withSignature = await prisma.serviceRequest.update({ where: { id: created.id }, data: { intakeSignatureUrl: url }, include: requestInclude });
  }

  publishRequest("request:created", serializeRequest(withSignature));
  pushJobAssigned(withSignature.assignedTechnicianId, withSignature);
  await notifyRequestCreated(withSignature);

  const technicianName = withSignature.assignedTechnician?.name;
  return {
    request: withSignature,
    repeat: repeat ? { displayId: repeat.previous.displayId, id: repeat.previous.id, free: freeRepeat } : null,
    assignment: {
      mode: assignmentMode,
      technicianName: technicianName ?? null,
      note:
        assignmentMode === "auto" && technicianName
          ? `Auto-assigned to ${technicianName}`
          : assignmentMode === "manual" && technicianName
            ? `Assigned to ${technicianName}`
            : "Saved unassigned — no matching technician was available",
    },
  };
}
