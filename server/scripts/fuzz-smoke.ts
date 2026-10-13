/**
 * Bad input must never produce a 500: wrong types, negative or huge numbers, unknown ids, empty bodies, oversized text, against the
 * warehouse, transfer, part-order, Telegram and sign-in routes. Needs the API running (SMOKE_API) on a scratch database with the demo seed.
 *   npm run smoke:fuzz -w server
 */
const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
let checked = 0;
async function call(method: string, path: string, token: string | null, body?: unknown, raw?: string) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return res.status;
}
async function main() {
  const login = async (phone: string, password: string) => ((await (await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password }) })).json()) as any).token as string;
  const admin = await login("998900000001", "admin123");
  const tech = await login("998900000002", "tech123");
  const customer = await login("998900000003", "customer123");
  const part = ((await (await fetch(`${API}/api/staff/catalog/parts`, { headers: { Authorization: `Bearer ${admin}` } })).json()) as any).parts[0].id as string;
  const wh = ((await (await fetch(`${API}/api/staff/warehouses`, { headers: { Authorization: `Bearer ${admin}` } })).json()) as any).warehouses[0].id as string;

  const weird: unknown[] = [null, "x", -1, 0, 1e12, 1.5, [], {}, true, "9".repeat(300), "'; drop table users; --", "<script>alert(1)</script>"];
  const cases: Array<[string, string, string, (v: unknown) => unknown]> = [
    ["POST", "/api/staff/transfers", admin, (v) => ({ sparePartId: v, quantity: v, fromWarehouseId: v, toWarehouseId: v })],
    ["POST", "/api/staff/transfers", admin, (v) => ({ sparePartId: part, quantity: v, fromWarehouseId: wh, toWarehouseId: wh })],
    ["POST", "/api/staff/transfers/none/ship", admin, (v) => ({ quantity: v, etaAt: v })],
    ["POST", "/api/staff/transfers/none/receive", admin, (v) => ({ quantity: v })],
    ["POST", "/api/staff/transfers/none/reject", admin, (v) => ({ reason: v })],
    ["POST", "/api/staff/warehouses", admin, (v) => ({ name: v, kind: v, regionCode: v, leadDaysSameRegion: v, leadDaysOtherRegion: v, lat: v, lng: v })],
    ["PATCH", `/api/staff/warehouses/${wh}`, admin, (v) => ({ name: v, isActive: v, leadDaysSameRegion: v })],
    ["PATCH", `/api/staff/warehouses/${wh}/stock/${part}`, admin, (v) => ({ quantity: v, delta: v, minQuantity: v, note: v })],
    ["POST", `/api/staff/warehouses/${wh}/restock`, admin, (v) => ({ items: v })],
    ["POST", `/api/staff/warehouses/${wh}/restock`, admin, (v) => ({ items: [{ sparePartId: v, quantity: v, from: v }] })],
    ["POST", "/api/staff/part-orders", admin, (v) => ({ sparePartId: v, quantity: v, warehouseId: v, supplierId: v, expectedAt: v })],
    ["PATCH", "/api/staff/part-orders/none", admin, (v) => ({ status: v, receivedQuantity: v })],
    ["POST", "/api/staff/part-orders/bulk", admin, (v) => ({ items: v, supplierId: v })],
    ["POST", "/api/staff/tech-stock/issue", admin, (v) => ({ technicianId: v, sparePartId: v, quantity: v })],
    ["POST", "/api/staff/my-jobs/stock/requests", tech, (v) => ({ sparePartId: v, quantity: v, fromWarehouseId: v })],
    ["POST", "/api/staff/my-jobs/none/part-requests", tech, (v) => ({ sparePartId: v, quantity: v, source: v })],
    ["POST", "/api/staff/my-jobs/transfers/none/receive", tech, (v) => ({ quantity: v })],
    ["POST", "/api/auth/login", "", (v) => ({ phone: v, password: v, code: v, as: v })],
    ["POST", "/api/staff/auth/login", "", (v) => ({ phone: v, password: v })],
    ["POST", "/api/customer/auth/login", "", (v) => ({ phone: v, password: v })],
    ["PATCH", "/api/staff/telegram", admin, (v) => ({ notify: v })],
    ["POST", "/api/staff/settings", admin, (v) => ({ v })],
    ["PATCH", "/api/staff/settings", admin, (v) => ({ transferShipHours: v, partsSafetyDays: v })],
    ["POST", "/api/customer/requests", customer, (v) => ({ type: v, saleId: v, issueDescription: v, locationType: v, customerLocation: v })],
  ];
  for (const [method, path, token, make] of cases) {
    for (const value of weird) {
      const status = await call(method, path, token || null, make(value));
      checked += 1;
      if (status >= 500) {
        failed += 1;
        console.error(`  FAIL ${method} ${path} with ${JSON.stringify(value)?.slice(0, 40)} -> ${status}`);
      }
    }
    // not JSON at all, and an empty body
    for (const raw of ["{not json", "", "[1,2"]) {
      const status = await call(method, path, token || null, undefined, raw);
      checked += 1;
      if (status >= 500) {
        failed += 1;
        console.error(`  FAIL ${method} ${path} with raw ${JSON.stringify(raw)} -> ${status}`);
      }
    }
  }
  // Long, odd query strings and ids.
  for (const path of [`/api/staff/warehouses/sources?partId=${"x".repeat(500)}&quantity=abc&toWarehouseId=%00`, `/api/staff/warehouses/${wh}/stock?q=${"%25".repeat(100)}`, "/api/staff/transfers?status=nope&direction=sideways&warehouseId=%27", `/api/staff/my-jobs/part-sources?partId=${part}&quantity=-5&jobId=zzz`, "/api/staff/warehouses/none/stock", "/api/staff/warehouses/none/movements", "/api/staff/warehouses/none/restock"]) {
    const status = await call("GET", path, path.includes("my-jobs") ? tech : admin);
    checked += 1;
    if (status >= 500) {
      failed += 1;
      console.error(`  FAIL GET ${path.slice(0, 80)} -> ${status}`);
    }
  }
  console.log(failed ? `\n${failed} of ${checked} calls answered 500` : `\nfuzz smoke: ${checked} bad requests, none answered 500`);
  if (failed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
