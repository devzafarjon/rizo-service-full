export type ReportLinkDef = { to: string; labelKey: string };
const products: ReportLinkDef = { to: "/app/reports/products", labelKey: "reports.nav.products" };
const parts: ReportLinkDef = { to: "/app/reports/parts", labelKey: "reports.nav.parts" };
const expenses: ReportLinkDef = { to: "/app/reports/expenses", labelKey: "reports.nav.expenses" };
const profit: ReportLinkDef = { to: "/app/reports/profit", labelKey: "reports.nav.profit" };
const technicians: ReportLinkDef = { to: "/app/reports/technicians", labelKey: "reports.nav.technicians" };
const warranty: ReportLinkDef = { to: "/app/reports/warranty", labelKey: "reports.nav.warranty" };
const sources: ReportLinkDef = { to: "/app/reports/sources", labelKey: "reports.nav.sources" };
const defects: ReportLinkDef = { to: "/app/reports/defects", labelKey: "reports.nav.defects" };
const outcomes: ReportLinkDef = { to: "/app/reports/outcomes", labelKey: "reports.nav.outcomes" };
const legal: ReportLinkDef = { to: "/app/reports/legal", labelKey: "reports.nav.legal" };
const debts: ReportLinkDef = { to: "/app/reports/debts", labelKey: "reports.nav.debts" };
const payroll: ReportLinkDef = { to: "/app/reports/payroll", labelKey: "reports.nav.payroll" };
const partners: ReportLinkDef = { to: "/app/reports/partners", labelKey: "reports.nav.partners" };
const fiscal: ReportLinkDef = { to: "/app/reports/fiscal", labelKey: "reports.nav.fiscal" };

/** The reports looked at every day; the sidebar shows only these. */
export const MAIN_REPORT_LINKS: readonly ReportLinkDef[] = [profit, technicians, legal, debts, products];

/** All reports in groups, as the reports hub shows them. */
export const REPORT_GROUPS: ReadonlyArray<{ key: string; labelKey: string; links: readonly ReportLink[] }> = [
  { key: "main", labelKey: "reports.groups.main", links: MAIN_REPORT_LINKS },
  { key: "money", labelKey: "reports.groups.money", links: [expenses, payroll, partners, fiscal, warranty] },
  { key: "other", labelKey: "reports.groups.other", links: [parts, sources, defects, outcomes] },
] as const;

export type ReportLink = { to: string; labelKey: string };

export const REPORT_LINKS: ReportLink[] = REPORT_GROUPS.flatMap((group) => [...group.links] as ReportLink[]);
