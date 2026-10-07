/** Every staff role. `accountant` reads money and reports; `warehouse` runs parts and technicians' stock. */
export const STAFF_ROLES = ["admin", "receptionist", "technician", "accountant", "warehouse"] as const;
export type StaffRoleName = (typeof STAFF_ROLES)[number];

/** Roles that may read what the office works with (requests, sales) without changing it. */
export const READ_OFFICE: StaffRoleName[] = ["admin", "receptionist", "accountant"];
/** Roles that read money: reports, payroll, debts. */
export const READ_MONEY: StaffRoleName[] = ["admin", "accountant"];
/** Roles that read and write spare parts and part orders. */
export const PARTS: StaffRoleName[] = ["admin", "warehouse"];
