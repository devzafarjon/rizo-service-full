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
  const products = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`select id from products where sku like 'DEMO-%'`)).map((row) => row.id);
  console.log(`Demo customers: ${customers.length}, their requests: ${requests.length}, sales: ${sales.length}, demo products: ${products.length}`);
  if (process.env.DEMO_DRY === "yes") return;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.DEMO_CONFIRM !== "yes") {
    throw new Error("This is not a local database. Run again with DEMO_CONFIRM=yes to delete the demo data from it.");
  }
  if (customers.length === 0 && products.length === 0) return;

  await prisma.$transaction(
    async (tx) => {
      const all = [...requests, ...sales, ...customers];
      if (all.length) {
        removed.audit_logs = Number(await tx.$executeRawUnsafe(`delete from audit_logs where entity_id = any($1::text[])`, all));
        removed.outbound_messages = Number(await tx.$executeRawUnsafe(`delete from outbound_messages where entity_id = any($1::text[])`, all));
      }
      await purge(tx, "service_requests", requests);
      await purge(tx, "sales", sales);
      await purge(tx, "customers", customers);
      // A demo product is removed only when nothing real points at it any more.
      for (const id of products) {
        const used = await tx.$queryRawUnsafe<Array<{ n: number }>>(`select (select count(*) from sales where product_id = $1)::int + (select count(*) from service_requests where product_id = $1)::int as n`, id);
        if (used[0].n === 0) await purge(tx, "products", [id]);
      }
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
