/**
 * Removes everything `npm run demo:load` created: customers noted DEMO-DATA with their sales, requests, payments,
 * photos' rows, ratings and so on, and the DEMO- products. (Requests are never deleted inside the app, so this is the only way.)
 *
 *   DATABASE_URL=... npm run demo:clean -w server          # asks for DEMO_CONFIRM=yes when the database is not local
 *   DEMO_DRY=yes DATABASE_URL=... npm run demo:clean -w server   # only counts
 *
 * Uploaded photo files in the bucket / on disk are not touched (they are small; delete the `jobs/` objects of the demo
 * requests by hand if you want the space back).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MARK = "DEMO-DATA";
const removed: Record<string, number> = {};

type Tx = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

async function foreignKeysTo(tx: Tx, table: string) {
  return tx.$queryRawUnsafe<Array<{ child: string; col: string; nullable: boolean }>>(
    `select cl.relname as child, a.attname as col, not a.attnotnull as nullable
       from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
       join pg_class parent on parent.oid = c.confrelid
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and parent.relname = $1 and c.connamespace = 'public'::regnamespace`,
    table,
  );
}
async function hasIdColumn(tx: Tx, table: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ n: number }>>(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'id'`, table);
  return rows[0].n > 0;
}

/** Deletes the rows with these ids, children first (every foreign key here is RESTRICT, so the order matters). */
async function purge(tx: Tx, table: string, ids: string[], stack: string[] = []): Promise<void> {
  if (ids.length === 0) return;
  for (const fk of await foreignKeysTo(tx, table)) {
    if (fk.child === table) {
      // A table that points at itself (a repeat request): detach the rows inside the set first.
      await tx.$executeRawUnsafe(`update "${table}" set "${fk.col}" = null where "${fk.col}" = any($1::text[])`, ids);
      continue;
    }
    if (stack.includes(fk.child)) continue;
    if (await hasIdColumn(tx, fk.child)) {
      const childIds = (await tx.$queryRawUnsafe<Array<{ id: string }>>(`select id from "${fk.child}" where "${fk.col}" = any($1::text[])`, ids)).map((row) => row.id);
      await purge(tx, fk.child, childIds, [...stack, table]);
    } else {
      removed[fk.child] = (removed[fk.child] ?? 0) + Number(await tx.$executeRawUnsafe(`delete from "${fk.child}" where "${fk.col}" = any($1::text[])`, ids));
    }
  }
  removed[table] = (removed[table] ?? 0) + Number(await tx.$executeRawUnsafe(`delete from "${table}" where id = any($1::text[])`, ids));
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(dbUrl.replace(/^postgres(ql)?:/, "http:")).hostname;
    } catch {
      return "";
    }
  })();
  if (!dbUrl) throw new Error("DATABASE_URL is required");
  console.log(`Database host: ${host}`);
  const customers = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from customers where notes = $1`, MARK)).map((row) => row.id);
  const requests = customers.length ? (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from service_requests where customer_id = any($1::text[])`, customers)).map((row) => row.id) : [];
  const sales = customers.length ? (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from sales where customer_id = any($1::text[])`, customers)).map((row) => row.id) : [];
  const products = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from products where sku like 'DEMO-%' or added_by_name = $1`, MARK)).map((row) => row.id);
  const stockOrders = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from part_orders where note = $1 and service_request_id is null`, MARK)).map((row) => row.id);
  const demoParts = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from spare_parts where name like 'DEMO %'`)).map((row) => row.id);
  const suppliers = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from suppliers where note like $1 || '%'`, MARK)).map((row) => row.id);
  const demoWarehouses = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from warehouses where kind <> 'central' and note like $1 || '%'`, MARK)).map((row) => row.id);
  const demoKeepers = demoWarehouses.length ? (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from staff_users where warehouse_id = any($1::text[]) and name like 'DEMO %'`, demoWarehouses)).map((row) => row.id) : [];
  console.log(`Demo warehouses: ${demoWarehouses.length}, keepers: ${demoKeepers.length}`);
  const demoRunCount = Number((await prisma.$queryRawUnsafe<Array<{ n: number }>>(`select count(*)::int as n from auto_job_runs where summary->>'demo' = 'true'`))[0].n);
  const demoBrandCount = Number((await prisma.$queryRawUnsafe<Array<{ n: number }>>(`select count(*)::int as n from brands where is_own = false and added_by_name = $1`, MARK))[0].n);
  console.log(`Demo customers: ${customers.length}, their requests: ${requests.length}, sales: ${sales.length}, demo products: ${products.length}, demo parts: ${demoParts.length}, suppliers: ${suppliers.length}, stock orders: ${stockOrders.length}, report runs: ${demoRunCount}, brands: ${demoBrandCount}`);
  if (process.env.DEMO_DRY === "yes") return;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.DEMO_CONFIRM !== "yes") {
    throw new Error("This is not a local database. Run again with DEMO_CONFIRM=yes to delete the demo data from it.");
  }
  if (customers.length === 0 && products.length === 0 && demoParts.length === 0 && suppliers.length === 0 && demoWarehouses.length === 0 && demoRunCount === 0 && demoBrandCount === 0) return;

  await prisma.$transaction(
    async (tx) => {
      // Warehouses first: parts in transit go back to where they were sent from, the shelves of the demo warehouses leave the
      // parts' totals, and nothing real is left pointing at a demo warehouse.
      const transfers = (
        await tx.$queryRawUnsafe<Array<{ id: string; status: string; quantity: number; spare_part_id: string; from_warehouse_id: string }>>(
          `select id, status, quantity, spare_part_id, from_warehouse_id from stock_transfers where note like $1 || '%' or from_warehouse_id = any($2::text[]) or to_warehouse_id = any($2::text[]) or service_request_id = any($3::text[])`,
          MARK,
          demoWarehouses,
          requests,
        )
      );
      for (const row of transfers) {
        if (row.status !== "shipped" || demoWarehouses.includes(row.from_warehouse_id)) continue;
        await tx.$executeRawUnsafe(`update part_stocks set quantity = quantity + $1 where warehouse_id = $2 and spare_part_id = $3`, row.quantity, row.from_warehouse_id, row.spare_part_id);
        await tx.$executeRawUnsafe(`update spare_parts set stock_quantity = stock_quantity + $1 where id = $2`, row.quantity, row.spare_part_id);
      }
      await purge(tx, "stock_transfers", transfers.map((row) => row.id));
      if (demoWarehouses.length) {
        await tx.$executeRawUnsafe(
          `update spare_parts sp set stock_quantity = greatest(0, sp.stock_quantity - ps.q) from (select spare_part_id, sum(quantity)::int as q from part_stocks where warehouse_id = any($1::text[]) group by spare_part_id) ps where sp.id = ps.spare_part_id`,
          demoWarehouses,
        );
        const central = (await tx.$queryRawUnsafe<Array<{ id: string }>>(`select id from warehouses where kind = 'central' order by created_at limit 1`))[0]?.id;
        if (central) await tx.$executeRawUnsafe(`update part_orders set warehouse_id = $1 where warehouse_id = any($2::text[])`, central, demoWarehouses);
        await tx.$executeRawUnsafe(`delete from stock_movements where warehouse_id = any($1::text[])`, demoWarehouses);
        await tx.$executeRawUnsafe(`delete from part_stocks where warehouse_id = any($1::text[])`, demoWarehouses);
        await tx.$executeRawUnsafe(`update staff_users set warehouse_id = null where warehouse_id = any($1::text[]) and not (id = any($2::text[]))`, demoWarehouses, demoKeepers);
        await purge(tx, "staff_users", demoKeepers);
        await purge(tx, "warehouses", demoWarehouses);
      }
      const all = [...requests, ...sales, ...customers];
      if (all.length) {
        removed.audit_logs = Number(await tx.$executeRawUnsafe(`delete from audit_logs where entity_id = any($1::text[])`, all));
        removed.outbound_messages = Number(await tx.$executeRawUnsafe(`delete from outbound_messages where entity_id = any($1::text[])`, all));
      }
      await purge(tx, "service_requests", requests);
      await purge(tx, "sales", sales);
      await purge(tx, "customers", customers);
      // Orders for stock, then the demo parts (only when no real job used them), then the suppliers (their parts and orders are only detached).
      await purge(tx, "part_orders", stockOrders);
      for (const id of demoParts) {
        const used = await tx.$queryRawUnsafe<Array<{ n: number }>>(`select (select count(*) from request_part_lines where spare_part_id = $1)::int as n`, id);
        if (used[0].n === 0) {
          await tx.$executeRawUnsafe(`delete from part_orders where spare_part_id = $1`, id);
          await purge(tx, "spare_parts", [id]);
        }
      }
      if (suppliers.length) {
        await tx.$executeRawUnsafe(`update spare_parts set supplier_id = null where supplier_id = any($1::text[])`, suppliers);
        await tx.$executeRawUnsafe(`update part_orders set supplier_id = null where supplier_id = any($1::text[])`, suppliers);
        removed.suppliers = Number(await tx.$executeRawUnsafe(`delete from suppliers where id = any($1::text[])`, suppliers));
      }
      // A demo product is removed only when nothing real points at it any more.
      for (const id of products) {
        const used = await tx.$queryRawUnsafe<Array<{ n: number }>>(`select (select count(*) from sales where product_id = $1)::int + (select count(*) from service_requests where product_id = $1)::int as n`, id);
        if (used[0].n === 0) await purge(tx, "products", [id]);
      }
      // The demo report history (daily / weekly runs) and the pay statements those runs list.
      const demoRuns = await tx.$queryRawUnsafe<Array<{ id: string; ids: string | null }>>(`select id, summary->>'statementIds' as ids from auto_job_runs where summary->>'demo' = 'true'`);
      const statementIds = demoRuns.flatMap((row) => (row.ids ? (JSON.parse(row.ids) as string[]) : []));
      if (statementIds.length) removed.payroll_statements = Number(await tx.$executeRawUnsafe(`delete from payroll_statements where id = any($1::text[])`, statementIds));
      if (demoRuns.length) removed.auto_job_runs = Number(await tx.$executeRawUnsafe(`delete from auto_job_runs where id = any($1::text[])`, demoRuns.map((row) => row.id)));
      // The demo brands of other makers go once no model is left under them ("I repair" entries go with them).
      removed.brands = Number(await tx.$executeRawUnsafe(`delete from brands b where b.is_own = false and b.added_by_name = $1 and not exists (select 1 from products p where p.brand_id = b.id)`, MARK));
    },
    { timeout: 120_000 },
  );
  console.log("Removed rows:");
  for (const key of Object.keys(removed).sort()) if (removed[key]) console.log(`  ${key.padEnd(28)} ${removed[key]}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
