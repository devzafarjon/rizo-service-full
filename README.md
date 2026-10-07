# RIZO Service

After-sales field service for RIZO market. Staff dispatch jobs, technicians work them, and customers track them. Covers **installation** (always at the customer address) and **repair** (in shop or on site).

Design matches the RIZO ecosystem — the RizoPost admin app and [rizo.uz](https://rizo.uz): Nunito Sans, light gray `#F5F7FA` pages with white cards, brand purple `#7B00E0` (tint `#F5EBFD`) and orange `#F7941E` as accents only. The staff app keeps a white top bar; the customer portal has a purple-tint header with an orange rule and a “Customer portal” badge so it is never mistaken for the internal tool. Shared tokens live in `client/src/index.css`; shared pieces are `SurfaceTable`, `StatCard`, `Field`/`inputClass`, `segmented.ts`, and the `btn-rizo*` classes.

Keep this file in sync with the product. After any user-visible change, re-check the running app and update this README.

---

## What it is

| Interface | Who | Where |
| --- | --- | --- |
| Staff dashboard | Admin / dispatcher | `/app` |
| Front desk | Receptionist (`receptionist` role: board, requests, customers, sales, calendar, map, part orders, kiosk — no reports, catalog costs, settings or staff) | `/app/kanban` |
| Technician panel | Mobile or service-center technician | `/app/my-jobs` |
| Accountant | `accountant` role: reports, payroll, debts, fiscal and partner reports, warranty plans (read-only for everything else) | `/app/reports` |
| Warehouse manager | `warehouse` role: spare parts, part orders and the parts each technician carries | `/app/tech-stock` |
| Customer portal | Product owner | `/portal` |

Jobs can come from **RIZO market** (linked sale + warranty) or **RIZO Service** (walk-in / portal). Warranty dates are stored as UTC date-only and run from the **installation date** once the product has been installed (set when an installation request completes), otherwise from the sale date. Matching available technicians who are working today are auto-assigned (fewest open jobs first). There is no periodic or seasonal maintenance service.

---

## Stack

| Layer | Tools |
| --- | --- |
| Client | React 19, Vite 7, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query, Socket.io client, react-i18next, Recharts, @dnd-kit, Headless UI |
| Server | Node.js, Express 4, TypeScript, Prisma 6, JWT, bcrypt, Socket.io, Zod |
| Database | PostgreSQL 16 |

Monorepo workspaces: `client/` and `server/`.

---

## Run locally

Need PostgreSQL 16 on `localhost:5432`.

```bash
createdb rizo_service   # skip if it already exists
cp server/.env.example server/.env
# set DATABASE_URL and JWT_SECRET in server/.env

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

| Service | URL |
| --- | --- |
| App | http://localhost:5173 |
| API | http://localhost:4000 |
| Health | http://localhost:4000/api/health |

Vite proxies `/api`, `/uploads`, and `/socket.io` to port 4000.

Other scripts:

```bash
npm run db:reset     # wipe DB, remigrate, reseed
npm run db:seed      # demo data only
npm run smoke        # API + cost/warranty/display-id checks (needs API running)
npm run dev:client
npm run dev:server
```

`server/.env` keys: `DATABASE_URL`, `JWT_SECRET`, optional `JWT_EXPIRES_IN` (default `7d`), `PORT` (default `4000`), `CLIENT_ORIGIN` (default `http://localhost:5173`).

Optional notification and backup keys (see `server/.env.example`):

| Key | Default | Purpose |
| --- | --- | --- |
| `SMS_PROVIDER` | `console` | `console` logs SMS (also password-reset texts); set `SMS_HTTP_URL` (+ optional `SMS_HTTP_TOKEN`) for a gateway |
| `TELEGRAM_PROVIDER` | `console` | `console` logs Telegram; set `TELEGRAM_BOT_TOKEN` to use Bot API |
| `TELEGRAM_ADMIN_CHAT_ID` | empty | Admin overdue / low-stock Telegram destination |
| `FIREBASE_SERVICE_ACCOUNT` | empty | Push notifications: the Firebase service-account JSON (on the host). `FIREBASE_SERVICE_ACCOUNT_FILE` is a file path for local work. Without either, pushes are only logged. Never commit it |
| `BACKUP_ENABLED` | `false` | When `true`, API process runs `pg_dump` at 02:00 Asia/Tashkent |
| `BACKUP_DIR` | `server/backups` | Where `.sql` dumps are written |
| `BACKUP_RETAIN_DAYS` | `30` | Older daily dumps are deleted |

Manual backup: `npm run db:backup` (needs `pg_dump` on PATH).

---

## Demo accounts

Phone + password. Staff and customers use **separate JWT scopes** — a staff token cannot call portal routes and the reverse is blocked.

| Role | Phone | Password |
| --- | --- | --- |
| Admin / dispatcher | `998900000001` | `admin123` |
| Technician (mobile) | `998900000002` | `tech123` |
| Technician (service center) | `998900000004` | `tech123` |
| Front desk (receptionist) | `998900000005` | `desk123` |
| Customer (Dilnoza) | `998900000003` | `customer123` |

Seed also creates extra customers (Jasur, Malika), invoices `RZ-1001` … `RZ-1004`, a catalog with cost prices, and — on an empty database — one request in every board column (an overdue New job, an on-site job in progress, a paused job, a completed in-shop job awaiting pickup, and a picked-up job with a rating). Login is rate limited (10 failed attempts per phone per 15 minutes).

---

## Languages

Uzbek (default), Russian, and English.

- Globe control in the header of landing, login, staff, technician, and portal.
- Guests: `localStorage` key `rizo_locale`.
- Signed-in users: `StaffUser.locale` / `Customer.locale`, plus localStorage.
- First visit can follow the browser language; the switcher always wins.
- Catalog names use `name_uz` / `name_ru` / `name_en` (products, services, spare parts).
- Dates, numbers, and so‘m amounts follow the active locale. Printable receipts use the language selected at print time.

Translation files: `client/src/i18n/locales/{uz,ru,en}.json`. Add keys there when you add UI copy.

---

## Screens

### Public

| Path | Screen |
| --- | --- |
| `/` | Home — staff vs customer portal |
| `/login` | Staff sign-in |
| `/portal/login` | Customer sign-in |
| `/portal/signup` | Customer registration (sends current language) |
| `/track` | Track a request by request number + phone (rate limited, no login) |
| `/t/:token` | Public tracking page from the unguessable link in the SMS / QR; the customer can approve or decline an estimate here |
| `/centers` | Directory of active service centers |
| `/portal/forgot` | Password reset — a new password is sent **by SMS only** (console driver until a gateway is configured); the reply never reveals whether the number exists |

### Staff (admin)

| Path | Screen |
| --- | --- |
| `/app` | Analytics dashboard (charts + KPI cards) — first screen after admin login |
| `/app/kanban` | Dispatch board — drag-and-drop status, countdown on every card, live updates, technician load. A card opens a **slide-over** (reassign, priority, status, timeline, directions) with a link to the full page |
| `/app/customers` | Customer list + create/edit |
| `/app/customers/:id` | Profile, purchases, service history |
| `/app/catalog` | Products, service items, spare parts (three names required; services and parts apply to one or more categories; parts carry a cost price) |
| `/app/sales` | Record a sale; warranty expiry is calculated |
| `/app/requests` | All service requests |
| `/app/requests/new` | Create job with warranty check and auto/manual assign. |
| `/app/requests/:id` | Job detail, timeline, print |
| `/app/receipts` | Every request (a receipt exists from creation); cancelled ones are hidden |
| `/app/receipts/:id` | Printable branded receipt + editable disclaimer |
| `/app/reports` | Reports hub (admin only) |
| `/app/reports/products` | Volume, installation vs repair, paid revenue, warranty ratio |
| `/app/reports/parts` | Quantity used, parts revenue, ranked; optional product filter |
| `/app/reports/expenses` | Extra expenses + parts cost by technician and product, running total |
| `/app/reports/profit` | Paid revenue − parts − extras, daily/weekly/monthly trend |
| `/app/reports/technicians` | Jobs done, resolution time, rating, revenue |
| `/app/reports/warranty` | In-warranty (free) vs paid count and value over time |
| `/app/reports/sources` | RIZO market vs RIZO Service staff vs customer portal |
| `/app/requests/:id/tag` | Printable QR sticker (request ID, customer, product) |
| `/app/scan` | Camera / manual QR lookup |
| `/app/schedule` | Technician working / off calendar (14 days) |
| `/app/audit` | Activity log + SMS/Telegram send queue |
| `/app/calendar` | Scheduled visits per technician and day (admin + receptionist) |
| `/app/map` | Open on-site jobs on an OpenStreetMap (Leaflet) map; jobs without coordinates are listed below |
| `/app/part-orders` | Part orders (requested → ordered → received) plus low-stock suggestions; receiving an order resumes the waiting jobs |
| `/app/centers` | Service centers (address, hours, coordinates, authorised flag) |
| `/app/staff` | Staff accounts: create, role, technician type, pay rate, activate, reset password (admin) |
| `/app/serials/:serial` | Serial-number card: sale, warranty, every visit, repeat count |
| `/app/sales/:id/warranty-card` | Printable warranty card |
| `/app/reports/defects` | Top defect codes, repeat-repair rate per product |
| `/app/reports/outcomes` | Repair / replacement / refund / rejection: count, charged, cost |
| `/app/reports/legal` | On-time rate against the legal repair limit, overdue open jobs |
| `/app/reports/debts` | Jobs and customers with an unpaid balance |
| `/app/reports/payroll` | Technician pay: % of labour + fixed per job + bonus/penalty adjustments |
| `/app/kiosk` | Counter pickup confirmation for in-shop jobs (tap or signature) |
| `/app/customers/duplicates` | Merge customers that share a phone |

Dashboard and Reports are **admin / dispatcher only**. Technician and customer navigation do not show them; `RoleRoute` and `requireStaffRole("admin")` block the pages and APIs. Date filters: this week / month / quarter / year / all / custom. Each report exports CSV (opens in Excel). Dashboard date range is global and refreshes every chart from aggregated `/api/staff/reports/*` endpoints (not raw client-side job lists).

Header search finds phone, name, invoice, or request ID. The top-right account menu signs out from every staff page (including request detail, receipts, and reports).

### Technician

| Path | Screen |
| --- | --- |
| `/app/my-jobs` | Personal kanban; availability toggle |
| `/app/my-jobs/:id/complete` | Photos first, then services, parts (stock check), extras, outcome (repaired / replaced + serial), complete |
| `/app/my-jobs/:id/receipt` | Print the same receipt |
| `/app/scan` | Scan a device tag and open the job |
| `/app/my-schedule` | Mark working days / days off |
| `/app/my-earnings` | Own pay for the period (percentage + fixed per job + adjustments) |

Phone-friendly. Desktop still uses the staff shell. The header account menu is on every technician page, including job complete and receipt print.

### Customer portal

| Path | Screen |
| --- | --- |
| `/portal` | My requests, filters, ratings after completion |
| `/portal/new` | New request from a past purchase or catalog product, with serial number, preferred visit time and service-center choice. |
| `/portal/register` | Register a product bought elsewhere (unverified until the office verifies it) |
| `/portal/requests/:id` | Live status in friendly wording, technician first name only, in-shop pickup confirmation (tap or signature), rating with quick tags, estimate approval (choose optional lines), messages to the service, "technician is on the way", payments and balance |

Notification bell translates from `code` + `params`. Socket room `customer:{id}`. The header account menu signs out from every portal page.

---

## Service growth suite

Added after comparing RIZO Service with other field-service and repair systems. Everything below works on the website, the technician / admin app and the customer app unless noted.

**Customers**
- **Visit booking.** The customer picks a day and one of the free time windows (`visit_slots` setting) when asking for service or later on the request page. Capacity is per technician per day (`visits_per_technician_per_day`) and respects the technicians' days off. A visit can be confirmed, moved a limited number of times (`reschedule_limit`) and, until work starts, cancelled (`cancel_before_hours` cut-off). A reminder goes out the day before; the tracking link and the Telegram bot can confirm it too.
- **Arrival estimate.** The technician says how many minutes the trip takes when tapping "on my way"; the customer sees it.
- **My products** (`/portal/products`): warranty countdown, book service for a product, ask for a paid **warranty extension plan**. The office takes the payment and the warranty is extended automatically; a notice goes out a few weeks before a warranty ends (`warranty_expiry_notice_days`).
- **Help centre** (`/portal/help`, `/help`): short guides and videos per product category, written by the admin (`/app/help`).
- **Pay online**: Payme / Click buttons on the request and tracking pages when `PAYME_MERCHANT_ID` / `CLICK_*` are set. The buttons only open the provider's page; the office still records the payment (an automatic callback needs a merchant contract).
- **My account** (`/portal/account`): choose SMS / Telegram / both, download all data as JSON, ask for the personal data to be erased (an admin anonymizes the account; requests and payments stay for the accounts). Privacy policy and terms at `/privacy` and `/terms`.
- **Telegram bot**: besides linking and `/status`, messages carry buttons to approve or decline an estimate, confirm a visit and rate a finished job; plain text or `/message <number> text` writes to the service.

**Technicians**
- **Skills and distance.** Auto-assignment only picks technicians who can repair the product category (`Technician skills`), then the lowest load plus distance from their base (10 km counts like one open job).
- **Checklists** per product category (diagnosis and "before completing"). Required items block completing a repair. Works offline in the app.
- **Technician stock ("van stock")**: the warehouse hands parts to a technician and takes them back; on a job the technician's own parts are used first. `/app/tech-stock`, `/app/my-stock`.
- **Two-step sign-in** (`/app/security`, TOTP: Google Authenticator etc.). An admin can reset it.

**Office**
- **Escalation**: an overdue job is raised again after `escalation_hours` and becomes urgent after `escalation_hours_urgent`; **low-rating alert** (`low_rating_threshold`); **weekly summary** every Monday (and `Send now` in settings).
- **Service quality KPIs** on the dashboard: first-time fix, callbacks and their cost, parts wait, average time in each status.
- **Bulk actions** on the requests list (assign, priority, cancel); reports grouped (main / money / more).
- **Partner service centres**: payout share + fixed amount per job, report `/app/reports/partners`.
- **Fiscal receipts**: the number belongs to each payment; setting `require_fiscal_receipt`; report of payments without one. OFD itself is not integrated.
- **Roles** `accountant` and `warehouse` (see the table above); the mobile apps tell them to use the website.
- **RIZO market integration**: `POST /api/integrations/market/sales` with header `X-Api-Key: $MARKET_API_KEY`. Body: `externalId`, `invoiceNumber`, `saleDate`, `customer {name, phone, address?}`, `items [{sku, quantity, price, serialNumber?}]`, optional `installation {address, lat?, lng?}` (opens an installation request per item). Sending the same `externalId` again does not duplicate anything; an unknown SKU answers 422 `unknownSku`. New customers sign in with "forgot password" (SMS).

Not modelled on purpose: periodic / seasonal maintenance and "service due" reminders.

Checks: `npm run smoke` (core flows) and `npm run smoke:growth` (everything above; run the API with `MARKET_API_KEY=smoke-key`).

---

## Request ID (`display_id`)

Shown as `#DDMMYYRRNNNN`.

| Part | Meaning |
| --- | --- |
| `DDMMYY` | Calendar date in `Asia/Tashkent` |
| `RR` | Uzbekistan vehicle region from `Customer.regionCode`, else inferred from address, else `00` |
| `NNNN` | Daily sequence (atomic `INSERT … ON CONFLICT` on `daily_request_counters`) |

Internal primary key stays a cuid. Search accepts the ID with or without `#`.

Region codes: `01` Toshkent shahri, `10` Toshkent viloyati, `20` Sirdaryo, `25` Jizzax, `30` Samarqand, `40` Fargʻona, `50` Namangan, `60` Andijon, `70` Qashqadaryo, `75` Surxondaryo, `80` Buxoro, `85` Navoiy, `90` Xorazm, `95` Qoraqalpogʻiston, `00` unknown.

---

## Statuses

One model for repair and installation (follows `Rizo.xlsx` #4):

`new → diagnosing → awaiting_decision → awaiting_parts → in_progress ⇄ paused → ready | completed | replaced → picked_up`, plus `refunded`, `rejected` and `cancelled`.

| Status | Meaning |
| --- | --- |
| New | Created, waiting for the technician (timer 1 day from assignment) |
| Diagnosing | Repair: the technician is diagnosing (repairs only) |
| Awaiting decision | Waiting for the customer (estimate sent) or the office decision |
| Awaiting parts | A part is on order; resumes automatically when the order is received |
| In progress | Work started (`accepted_at`; on-site jobs also record `arrived_at`) — timer 3 days |
| Paused | Needs a **reason** and a duration; each pause is stored |
| Ready | Finished in-shop repair waiting at the counter |
| Completed | Finished on-site repair or installation |
| Replaced / Refunded / Rejected | Outcomes of the decision (rejection needs a reason shown to the customer) |
| Picked up | In-shop jobs: customer taps “I received my device” or signs; blocked while a balance is unpaid unless staff allow it |
| Cancelled | Admin / front desk; leaves the boards |

Installation uses the short path `new → in_progress → completed` (plus paused / cancelled). **Installation is always on site** (in-shop installation is rejected by the API). The technician board shows four columns (New, In progress, Paused, Completed); the extra statuses are folded into them (`lib/techBoard.ts`). The staff board shows all columns for the chosen type. Transitions are validated server-side (`server/src/lib/status.ts` + `statusChange.ts`; the client mirrors the tables in `client/src/lib/status.ts`).

### Decision, estimate (smeta), payments

- After diagnosis the office or technician sets a **decision**: warranty repair, paid repair, replace, refund or reject (`/api/staff/requests/:id/decision`).
- A **paid repair needs an approved estimate** before work starts (setting `require_estimate_for_paid_repair`, default on). The estimate lists services, parts (taken from stock) and labour; lines can be **optional** — the customer chooses. The customer approves from the portal or the public tracking link, or staff approve on the phone. If a part is short a **part order** is created and the job waits in *Awaiting parts*. Estimates expire (default 7 days).
- **Payments / refunds** are recorded per request (cash, card, transfer, Payme, Click, other) with a **fiscal receipt number**; `payment_status` is `not_required | pending | partial | paid`.
- **Repeat failures** (same serial, 12 months) are flagged; a repair-warranty window (default 30 days) makes a repeat free. Duplicate open requests for the same product are blocked (`duplicateRequest`, staff can override). The **legal repair limit** (default 20 days) drives the legal-overdue KPI and report.
- **Intake**: checklist, notes and customer signature at the counter. **Defect codes** and return reasons are managed in the catalog and drive the defect report.
- **Warranty rules per product** (months, start from installation or sale, covers labour / parts); a sale can be extended, voided (with reason) and restored; customer-registered products stay *unverified* until verified.

Timers are green → yellow (last quarter) → red (expired). Completion needs at least one photo, a service when the product category has any (not for replacements) and, for replacements, the new product + serial number. Cost is 0 when covered by warranty (extras are still charged), otherwise services + parts + extras.

Repairs can be in shop or on site, chosen when the request is created; on-site requests need an address.

---

## Domain model (short)

- **StaffUser** — `admin`, `receptionist` or `technician` (`mobile` / `service_center`), availability, `is_active`, locale, pay percent / fixed per job, service center
- **ServiceCenter** — branch directory (address, hours, coordinates, authorised flag)
- **Estimate / EstimateLine** — draft → sent → approved / declined / expired; optional lines, part lines fulfilled from stock
- **Payment** — payment or refund per request, method, fiscal receipt number
- **PartOrder** — requested → ordered → received for missing stock, linked to the waiting job
- **DefectCode** — defect or return-reason code (optionally per product category)
- **PayAdjustment** — bonus / penalty used by payroll
- **Customer** — phone login, address, region, locale
- **ProductCategory / Product** — categories are a table; products reference one by name
- **Product** — SKU, category, translated names
- **Sale** — invoice, price, warranty months + expiry, installation date
- **ServiceCatalogItem / SparePart** — applicable to one or more product categories, translated names; parts have price, **cost price**, stock and a low-stock threshold
- **ServiceRequest** — type, source, location, assignment (`assigned_at`), warranty, payment, display id, resolution (`repair` / `replace`), pickup confirmation type
- **Lines** — services, parts (qty + price and cost at time), extra expenses, photos, notes, pauses
- **ReplacementItem** — new product + serial number when a repair ends in replacement
- **Feedback** — one rating (1–5) per completed job, optional comment and quick tags
- **Notification** — English `message` fallback plus `code` / `params` for i18n; staff alerts reuse the same table (`audience=staff`)
- **TechnicianSchedule** — per-day working / off (+ optional hours); auto-assign skips off technicians
- **AuditLog** — status, cost, role, pickup, merge
- **OutboundMessage** — SMS / Telegram queue (`pending` / `sent` / `failed`)
- **AppSetting** — `block_zero_stock`, `repair_warranty_days`, `repair_legal_days`, `estimate_valid_days`, `pickup_storage_days`, `require_estimate_for_paid_repair`

---

## API

Staff routes sit under `/api/staff/…` with a staff JWT. Customer routes sit under `/api/customer/…` with a customer JWT.

| Prefix | Purpose |
| --- | --- |
| `/api/health` | Liveness |
| `/api/staff/auth` | Login, me, availability, locale |
| `/api/customer/auth` | Register, login, me, forgot (SMS only), locale |
| `/api/staff/customers` | CRUD |
| `/api/staff/products` | Product catalog |
| `/api/staff/catalog` | Services and spare parts |
| `/api/staff/sales` | Sales + warranty |
| `/api/staff/search` | Quick search |
| `/api/staff/technicians` | Board + workload; `PATCH` role, type, availability, `isActive` |
| `/api/staff/requests` | Create / list; `PATCH` changes status, technician or priority (pause needs `pauseReason` + `pauseHours`) |
| `/api/staff/reports/dashboard` | Dashboard KPIs and chart series |
| `/api/staff/reports/products` | Product report |
| `/api/staff/reports/parts` | Spare-part report (`productId` optional) |
| `/api/staff/reports/expenses` | Extra expenses + parts cost |
| `/api/staff/reports/profit` | Profit summary and trend |
| `/api/staff/reports/technicians` | Technician performance |
| `/api/staff/reports/warranty` | Warranty vs paid |
| `/api/staff/reports/sources` | Request source mix |
| `/api/staff/requests/:id/…` | `decision`, `estimates` (+ `/:estimateId/send|approve|decline`), `payments`, `notes`, `pickup` |
| `/api/staff/part-orders`, `/defect-codes`, `/service-centers`, `/serials/:serial`, `/payroll`, `/staff` | Part orders, codes, branches, serial card, payroll + adjustments, staff admin |
| `/api/staff/reports/defects`, `/outcomes`, `/debts`, `/legal` | New reports (the dashboard also returns previous-period deltas) |
| `/api/public/track`, `/track/:token`, `/centers` | No login: tracking by token or request number + phone (rate limited), estimate approve / decline, service-center directory |
| `/api/staff/my-jobs` | Technician jobs: move, `arrived`, `resolution` (repair / replace + serial), services, parts, extras, photos, complete, own schedule |
| `/api/staff/settings` | Rules and flags (read: staff, change: admin) |
| `/api/staff/alerts` | Admin low-stock / overdue inbox |
| `/api/staff/audit` | Activity log |
| `/api/staff/outbound` | SMS / Telegram send log |
| `/api/staff/tags/:displayId` | QR lookup for any staff role |
| `/api/customer` | Portal requests, notifications, feedback, pickup |

Errors return `{ error, code, details }`. The client maps `code` to `errors.*` translation keys.

Socket.io rooms: `staff` and `customer:{id}`. Events include request created/updated and new notifications.

---

## Integrations and what is still manual

- **SMS**: console driver by default. Set `SMS_PROVIDER` / `SMS_HTTP_URL` / `SMS_HTTP_TOKEN` for a real gateway (Eskiz, Playmobile …). Creation, estimate, en-route, part-arrived and visit-reminder messages include the tracking link.
- **Telegram bot** (`server/src/lib/telegramBot.ts`): long polling starts only when `TELEGRAM_BOT_TOKEN` is set and the provider is not `console`. Customers can look up a request by number.
- **Not integrated (needs your accounts/contracts)**: Payme / Click merchant payments, fiscal receipt (OFD) devices — the app records the payment method and the fiscal receipt number but does not charge cards or print fiscal receipts; persistent photo storage on hosts with an ephemeral disk (Render free tier wipes `uploads/` on deploy).
- Change the demo passwords (`npm run set-password -- staff <phone> <new password>`) before going live.

---

## Repo layout

```
client/                 Vite app
  src/i18n/locales/     uz.json, ru.json, en.json
  src/features/         screens by area
  src/components/       chrome, logo, tables, dialogs
  public/rizo-logo.svg
server/
  prisma/schema.prisma
  prisma/seed.ts
  src/routes/
  src/lib/              assignment, display id, warranty, i18n names, notify
```

---

## Deploying (Netlify client + hosted API)

The client is static; the API (`server/`) and PostgreSQL run elsewhere (for example Render + Neon).

- **API host:** build `npm install --include=dev && npm run build -w server`, start `npm run start:prod -w server` (applies migrations, then starts). Env: `DATABASE_URL` (use the direct, non-pooled Neon URL), `JWT_SECRET`, `CLIENT_ORIGIN` (the Netlify URL, no trailing slash), `NODE_VERSION=22`.
- **Netlify:** `netlify.toml` builds the client. Set `VITE_API_URL` to the API's public URL and redeploy. Demo logins are neither shown nor prefilled on a production build (only in development, or with `VITE_SHOW_DEMO=true`).
- **First data:** run the seed once against the production database, then **change the demo passwords** straight away:

```bash
DATABASE_URL="<production url>" npm run set-password -- staff 998900000001 "a-strong-password"
DATABASE_URL="<production url>" npm run set-password -- staff 998900000002 "another-strong-password"
```

Uploaded photos are stored on the API server's disk; use a persistent disk or object storage if the host wipes it on deploy.

---

## Database backups

Daily dumps use `pg_dump --no-owner --no-acl`. Enable them with `BACKUP_ENABLED=true` in `server/.env`, or run `npm run db:backup` by hand. Files land in `BACKUP_DIR` (default `server/backups`) as `rizo-service-<ISO timestamp>.sql`. Dumps older than `BACKUP_RETAIN_DAYS` (default 30) are deleted after a successful run.

### Restore

1. Stop the API (`Ctrl+C` on `npm run dev` / the `server` process).
2. Recreate an empty database if needed: `dropdb rizo_service && createdb rizo_service`.
3. Restore the dump:

```bash
psql "$DATABASE_URL" < server/backups/rizo-service-YYYY-MM-DDTHH-mm-ss-sssZ.sql
```

4. Run `npm run prisma:generate -w server` if the Prisma client is stale, then start the API again.
5. Do **not** run `db:reset` after a restore — that wipes the restored data and reseeds demo accounts.

---

## How to work on it

1. Change one area at a time.
2. New UI copy goes into all three locale files. Customer-facing catalog fields need `nameUz` / `nameRu` / `nameEn`.
3. Verify in the browser (staff, technician if relevant, portal) — not only a screenshot.
4. Update this README so routes, demo accounts, and behaviour still match the running app.
