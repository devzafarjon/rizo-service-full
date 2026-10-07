import type { PaymentMethod } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { HttpError } from "./httpError.js";
import { serializeNamed } from "./named.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import { notifyAdmins } from "./notifyStaff.js";
import { prisma } from "./prisma.js";
import { getAppSettings } from "./settings.js";
import { computeWarrantyStatus, money, toDateOnly, warrantyExpiryFor } from "./warranty.js";

const GRACE_DAYS = 30; // a plan can still be bought for a month after the warranty ended

export function serializePlan(plan: { id: string; name: string; nameUz: string; nameRu: string; nameEn: string; months: number; price: { toString(): string } | number; productCategories: string[]; isActive: boolean }) {
  return { id: plan.id, ...serializeNamed(plan), months: plan.months, price: money(plan.price), productCategories: plan.productCategories, isActive: plan.isActive };
}

export const purchaseInclude = {
  plan: true,
  sale: { include: { product: true } },
  customer: { select: { id: true, name: true, phone: true } },
} as const;

type PurchaseRow = Awaited<ReturnType<typeof loadPurchase>>;

export function serializePurchase(row: PurchaseRow) {
  return {
    id: row.id,
    status: row.status,
    months: row.months,
    price: money(row.price),
    paymentMethod: row.paymentMethod,
    fiscalReceiptNumber: row.fiscalReceiptNumber,
    requestedAt: row.requestedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    plan: serializePlan(row.plan),
    customer: row.customer,
    sale: {
      id: row.sale.id,
      invoiceNumber: row.sale.invoiceNumber,
      serialNumber: row.sale.serialNumber,
      warrantyExpiry: toDateOnly(row.sale.warrantyExpiry),
      warrantyStatus: computeWarrantyStatus(row.sale.warrantyMonths, row.sale.warrantyExpiry),
      product: { id: row.sale.product.id, ...serializeNamed(row.sale.product), sku: row.sale.product.sku },
    },
  };
}

async function loadPurchase(id: string) {
  const row = await prisma.warrantyPlanPurchase.findUnique({ where: { id }, include: purchaseInclude });
  if (!row) throw new HttpError(404, "Record not found");
  return row;
}

/** Plans that can be bought for a sale: active, for its category, and the warranty is not long gone. */
export async function plansForSale(saleId: string, customerId?: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { product: true } });
  if (!sale || (customerId && sale.customerId !== customerId)) throw new HttpError(404, "Sale not found");
  if (sale.voidedAt) return { sale, plans: [] };
  const expired = Date.now() - sale.warrantyExpiry.getTime() > GRACE_DAYS * 86_400_000;
  if (expired || sale.warrantyMonths <= 0) return { sale, plans: [] };
  const plans = await prisma.warrantyPlan.findMany({ where: { isActive: true, productCategories: { has: sale.product.category } }, orderBy: { months: "asc" } });
  return { sale, plans };
}

export async function requestPlan(input: { saleId: string; planId: string; customerId: string }) {
  const { sale, plans } = await plansForSale(input.saleId, input.customerId);
  const plan = plans.find((row) => row.id === input.planId);
  if (!plan) throw new HttpError(400, "This plan is not available for this product", "planNotAvailable");
  const open = await prisma.warrantyPlanPurchase.findFirst({ where: { saleId: sale.id, status: "requested" } });
  if (open) throw new HttpError(409, "You already asked for a plan for this product", "planAlreadyRequested");
  const row = await prisma.warrantyPlanPurchase.create({
    data: { saleId: sale.id, planId: plan.id, customerId: input.customerId, months: plan.months, price: plan.price, status: "requested" },
    include: purchaseInclude,
  });
  await notifyAdmins({
    message: `A customer asked for a warranty plan (${plan.name}) for ${sale.product.name}`,
    code: "warrantyPlanRequested",
    params: { plan: plan.name, product: sale.product.name, months: plan.months, customer: row.customer.name },
  });
  return row;
}

/** Counter sale or confirmation of a customer's request: takes the money and extends the warranty. */
export async function payPlan(input: { purchaseId?: string; saleId?: string; planId?: string; method: PaymentMethod; fiscalReceiptNumber?: string | null; actor: AuditActor }) {
  let purchaseId = input.purchaseId;
  if (!purchaseId) {
    if (!input.saleId || !input.planId) throw new HttpError(400, "Choose a plan", "invalidInput");
    const sale = await prisma.sale.findUnique({ where: { id: input.saleId } });
    if (!sale) throw new HttpError(404, "Sale not found");
    const { plans } = await plansForSale(sale.id);
    const plan = plans.find((row) => row.id === input.planId);
    if (!plan) throw new HttpError(400, "This plan is not available for this product", "planNotAvailable");
    const created = await prisma.warrantyPlanPurchase.create({ data: { saleId: sale.id, planId: plan.id, customerId: sale.customerId, months: plan.months, price: plan.price, status: "requested" } });
    purchaseId = created.id;
  }
  const purchase = await loadPurchase(purchaseId);
  if (purchase.status !== "requested") throw new HttpError(409, "This plan was already handled", "planHandled");
  if ((await getAppSettings()).requireFiscalReceipt && !input.fiscalReceiptNumber) {
    throw new HttpError(400, "Enter the fiscal receipt number for this payment", "fiscalReceiptRequired");
  }
  const sale = purchase.sale;
  const extensionMonths = sale.extensionMonths + purchase.months;
  const warrantyExpiry = warrantyExpiryFor({ ...sale, extensionMonths }, sale.product);
  await prisma.$transaction([
    prisma.sale.update({ where: { id: sale.id }, data: { extensionMonths, extensionReason: `Warranty plan: ${purchase.plan.name}`, warrantyExpiry } }),
    prisma.warrantyPlanPurchase.update({
      where: { id: purchase.id },
      data: { status: "paid", paidAt: new Date(), paymentMethod: input.method, fiscalReceiptNumber: input.fiscalReceiptNumber || null, createdByName: input.actor.name ?? null },
    }),
  ]);
  await writeAudit({
    actor: input.actor,
    action: "sale.warranty.plan",
    entityType: "Sale",
    entityId: sale.id,
    oldValue: { warrantyExpiry: toDateOnly(sale.warrantyExpiry) },
    newValue: { warrantyExpiry: toDateOnly(warrantyExpiry), months: purchase.months, price: money(purchase.price), plan: purchase.plan.name },
  });
  const fresh = await loadPurchase(purchase.id);
  const customerNote = `Your warranty for ${sale.product.name} now lasts until ${toDateOnly(warrantyExpiry)}.`;
  await createCustomerNotification(sale.customerId, null, customerNote, "warrantyExtended", { product: sale.product.name, until: toDateOnly(warrantyExpiry), months: purchase.months });
  return fresh;
}

export async function cancelPlan(purchaseId: string, actor: AuditActor) {
  const purchase = await loadPurchase(purchaseId);
  if (purchase.status !== "requested") throw new HttpError(409, "This plan was already handled", "planHandled");
  await prisma.warrantyPlanPurchase.update({ where: { id: purchase.id }, data: { status: "cancelled" } });
  await writeAudit({ actor, action: "warrantyPlan.cancel", entityType: "WarrantyPlanPurchase", entityId: purchase.id });
  return loadPurchase(purchase.id);
}

export { loadPurchase };
