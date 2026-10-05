# RIZO Service

After-sales field service for RIZO market. Staff dispatch jobs, technicians work them, and customers track them. Covers **installation** (always at the customer address) and **repair** (in shop or on site).

Design matches the RIZO ecosystem — the RizoPost admin app and [rizo.uz](https://rizo.uz): Nunito Sans, light gray `#F5F7FA` pages with white cards, brand purple `#7B00E0` (tint `#F5EBFD`) and orange `#F7941E` as accents only. The staff app keeps a white top bar; the customer portal has a purple-tint header with an orange rule and a “Customer portal” badge so it is never mistaken for the internal tool. Shared tokens live in `client/src/index.css`; shared pieces are `SurfaceTable`, `StatCard`, `Field`/`inputClass`, `segmented.ts`, and the `btn-rizo*` classes.

Keep this file in sync with the product. After any user-visible change, re-check the running app and update this README.

---

## What it is

| Interface | Who | Where |
| --- | --- | --- |
| Staff dashboard | Admin / dispatcher | `/app` |
| Technician panel | Mobile or service-center technician | `/app/my-jobs` |
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

Phone-friendly. Desktop still uses the staff shell. The header account menu is on every technician page, including job complete and receipt print.

### Customer portal

| Path | Screen |
| --- | --- |
| `/portal` | My requests, filters, ratings after completion |
| `/portal/new` | New request from a past purchase or catalog product. |
| `/portal/requests/:id` | Live status in friendly wording, technician first name only, in-shop pickup confirmation (tap or signature), rating with quick tags |

Notification bell translates from `code` + `params`. Socket room `customer:{id}`. The header account menu signs out from every portal page.

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

One model for both repair and installation:

`new → in_progress → paused → completed → picked_up`, plus `cancelled`.

| Status | Meaning | Timer |
| --- | --- | --- |
| New | Waiting for the technician | 1 day (from assignment) |
| In progress | Work started (`accepted_at`; on-site jobs also record `arrived_at` via “I’ve arrived”) | 3 days (from accept) |
| Paused | Needs a **reason** and a technician-set duration; each pause is stored with start/end | the chosen duration |
| Completed | Photos (≥1), services, parts, extras recorded; cost is automatic | — |
| Picked up | In-shop jobs only: customer taps “I received my device” or signs | — |
| Cancelled | Admin action; leaves the boards, can be reopened to New | — |

Timers are green → yellow (last quarter) → red (expired). The technician board shows New, In progress, Paused, Completed (completed + picked up). The admin board adds Picked up. Admin transitions are validated server-side (`server/src/lib/statusChange.ts`); a technician can pause, resume and complete only their own jobs.

Completion needs at least one photo, a service when the product category has any, and — when a repair is resolved by **replacement** — the new product and serial number (no service line required). Cost is 0 when in warranty (extra expenses are still charged), otherwise services + parts + extras.

Installation is always on site at the customer's address (in-shop installation is rejected by the API and not offered in the forms). Repair can be in shop or on site, chosen when the request is created; on-site requests need an address.

---

## Domain model (short)

- **StaffUser** — `admin` or `technician` (`mobile` / `service_center`), availability, `is_active`, locale
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
- **AppSetting** — `block_zero_stock` (admin catalog toggle)

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
| `/api/staff/my-jobs` | Technician jobs: move, `arrived`, `resolution` (repair / replace + serial), services, parts, extras, photos, complete, own schedule |
| `/api/staff/settings` | Admin flags (block zero-stock) |
| `/api/staff/alerts` | Admin low-stock / overdue inbox |
| `/api/staff/audit` | Activity log |
| `/api/staff/outbound` | SMS / Telegram send log |
| `/api/staff/tags/:displayId` | QR lookup for any staff role |
| `/api/customer` | Portal requests, notifications, feedback, pickup |

Errors return `{ error, code, details }`. The client maps `code` to `errors.*` translation keys.

Socket.io rooms: `staff` and `customer:{id}`. Events include request created/updated and new notifications.

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
