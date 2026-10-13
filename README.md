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
| Accountant | `accountant` role: reports, payroll, debts, fiscal and partner reports (read-only for everything else) | `/app/reports` |
| Warehouse manager | `warehouse` role: spare parts, part orders and the parts each technician carries | `/app/tech-stock` |
| Customer portal | Product owner | `/portal` |

Jobs can come from **RIZO market** (linked sale + warranty) or **RIZO Service** (walk-in / portal). Warranty dates are stored as UTC date-only. Where they start is a company setting (**Settings → Service rules → "When the warranty starts"**, `warranty_starts_on`): the **sale date** (default) or the **installation date** (set when an installation request completes; the sale date until then). A change only affects new sales and sales that are edited. Matching available technicians who are working today are auto-assigned (fewest open jobs first). There is no periodic or seasonal maintenance service.

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
| `SMS_PROVIDER` | `console` | `console` logs SMS (also password-reset texts); `eskiz` sends through eskiz.uz (`ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_SENDER` default `4546`); otherwise set `SMS_HTTP_URL` (+ optional `SMS_HTTP_TOKEN`) for a generic gateway |
| `UPLOAD_BUCKET_ENDPOINT` / `UPLOAD_BUCKET_NAME` / `UPLOAD_BUCKET_ACCESS_KEY_ID` / `UPLOAD_BUCKET_SECRET_ACCESS_KEY` | empty | S3-compatible bucket (Cloudflare R2) for photos and signatures. Files are written to disk and copied to the bucket; a file missing on disk (a free host wipes it on deploy) is read back from the bucket. Without it, files stay on disk only |
| `TELEGRAM_PROVIDER` | `console` | `console` logs Telegram; set `TELEGRAM_BOT_TOKEN` (from @BotFather) and a provider other than `console` (for example `live`) to use the Bot API |
| `TELEGRAM_BOT_USERNAME` | read from Telegram | The bot's @username, used in the "Connect Telegram" links |
| `TELEGRAM_WEBHOOK_URL` / `TELEGRAM_WEBHOOK_SECRET` | empty | The API's public address (https) and a long random secret: the bot then receives updates by webhook (wakes a sleeping host). Empty = long polling (development) |
| `APP_DOWNLOAD_URL` | empty | Where the customer gets the mobile app; shown by the bot's "App and website" button |
| `TELEGRAM_ADMIN_CHAT_ID` | empty | Shared admin chat for overdue / low-stock alerts |
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
| Warehouse keeper | `998900000007` | `ware1234` |

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
| `/app/warehouses` | Warehouses: requests to send, parts on the way, stock, restock, history, list (admin) |
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
| `/app/part-orders` | **Spare-part control** (admin, front desk, warehouse): jobs waiting for parts, what to order next (by supplier), orders and deliveries, suppliers. See *Spare-part control* below |
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
- **My products** (`/portal/products`): warranty countdown, book service for a product. A notice goes out a few weeks before a warranty ends (`warranty_expiry_notice_days`). There are no paid warranty-extension plans.
- **Help centre** (`/portal/help`, `/help`): short guides and videos per product category, written by the admin (`/app/help`).
- **Pay online**: Payme / Click buttons on the request and tracking pages when `PAYME_MERCHANT_ID` / `CLICK_*` are set. The buttons only open the provider's page; the office still records the payment (an automatic callback needs a merchant contract).
- **My account** (`/portal/account`): choose SMS / Telegram / both, download all data as JSON, ask for the personal data to be erased (an admin anonymizes the account; requests and payments stay for the accounts). Privacy policy and terms at `/privacy` and `/terms`.
- **Telegram bot**: see "Telegram bot" below.

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
- **Roles** `accountant` and `warehouse` (see the table above). The accountant works on the website (the app points there); the warehouse signs in to the staff app, which opens on the spare-part control (it has no technician-stock screen on the phone yet).
- **RIZO market integration**: `POST /api/integrations/market/sales` with header `X-Api-Key: $MARKET_API_KEY`. Body: `externalId`, `invoiceNumber`, `saleDate`, `customer {name, phone, address?}`, `items [{sku, quantity, price, serialNumber?}]`, optional `installation {address, lat?, lng?}` (opens an installation request per item). Sending the same `externalId` again does not duplicate anything; an unknown SKU answers 422 `unknownSku`. New customers sign in with "forgot password" (SMS).

Not modelled on purpose: periodic / seasonal maintenance and "service due" reminders.

Checks: `npm run smoke` (core flows) and `npm run smoke:growth` (everything above; run the API with `MARKET_API_KEY=smoke-key`).

---

## Spare-part control

Built so a part that is missing never leaves a customer or a technician in the dark. Page `/app/part-orders` (admin, front desk and warehouse; the warehouse also reads its alerts in the bell).

- **Suppliers** (`/api/staff/suppliers`, admin + warehouse edit): name, phone, Telegram, delivery time in days. A spare part has a usual supplier and an optional **target stock** (empty = worked out). An order without a date gets *today + the supplier's delivery time*.
- **Jobs waiting for parts**: every job held up by a part with what it needs, stock, what is on order (supplier, date, late flag), days waiting and a **"nothing ordered"** flag. A general stock order counts as cover for a waiting job (the gap is worked out per part: needs − stock − all open orders).
- **What to order** (`lib/partsControl.ts`): a part is suggested when a job waits for more than is in stock and on order (`waiting`), when stock plus on-order is at or below the minimum (`low`), or when average use says it runs out before a delivery could land (`forecast`). Quantity = target + missing − stock − on order, where an empty target is `max(2 × minimum, average daily use × (delivery days + safety days))`. Grouped by supplier; the quantities can be changed, then *create orders*, *mark as ordered* (one bulk call) or *copy the text* for the supplier (uz/ru/en).
- **Receiving**: all of an order or only what came (the rest stays on order). Stock goes up, the linked job is served first, then **every other job still waiting for that part**, oldest first. A job that now has everything continues (`in_progress`), the **customer** (`partArrived`) and the **technician** (`jobPartReady`) are told.
- **Automatic notices** (background watch, every 10 minutes, part of housekeeping): customer when an order is placed (`partOrdered` / `partEta` with the date, again if the date changes); a late delivery, once per promised date, to admins + warehouse (`partOrderLate`) and an apology to the customer (`partLate`); a job waiting with nothing ordered for 30+ minutes (`partNoOrder`, at most once a day per job); a customer who waits hears from us at least every `parts_customer_update_days` days (`partWaiting` / `partEta`); one morning suggestion (after 09:00 Tashkent) to admins + warehouse (`reorderSuggestion`). Low-stock alerts (`lowStock`) now reach the warehouse too.
- **Settings** (admin, Settings page): `parts_safety_days` (7), `parts_usage_days` (30), `parts_customer_update_days` (3, 0 = off).
- **Dashboard**: the admin dashboard (website and staff app) has a *Spare parts* row: jobs waiting, nothing ordered, late orders, to order; each tile opens the matching view.
- **The customer** sees a banner on the request (portal, public tracking page and the customer app): whether the part is ordered, the expected date, and an apology when late (`partWait` in the request payload).
- **Mobile (RIZO Texnik)**: admin, front desk and warehouse get the same four views (More → Spare parts; the warehouse's first screen), including receiving part of an order, the supplier message to copy, and new-order sheets. Technicians and customers get the notices as push and in the bell.
- **Demo data**: `npm run demo:load` also creates 3 suppliers, 4 low-stock `DEMO ` parts, jobs waiting for parts (some ordered, some late, some with no order) and 2 stock orders; `demo:clean` removes them again.
- Check: `npm run smoke:parts -w server` (scratch database, API running).

---

## Warehouses (central, regional, branch)

Spare parts live in **warehouses**, not in one pile. Page `/app/warehouses` (admin, front desk, warehouse; accountant reads). The same screens are in RIZO Texnik.

- **Network**: one **central** warehouse that supplies every service centre (created by the migration; it takes over the old stock), any number of **regional** warehouses (per region; demo: Toshkent viloyati, Samarqand, Farg‘ona, Buxoro, Qashqadaryo, Xorazm) and **branch** stock rooms linked to one service centre. A warehouse has a region, address, two delivery times (`leadDaysSameRegion` / `leadDaysOtherRegion`, days) and optional keepers (`StaffUser.warehouseId`; empty = a keeper of the whole network). `SparePart.stockQuantity` is always the total of all shelves (`PartStock`).
- **Which shelf a job takes from** (`lib/warehouses.ts`): the technician's assigned warehouse, else the stock room of their service centre, else a regional warehouse in the centre's region, else the central one. A van's stock (`TechnicianStock`) is still used first.
- **Where is the part, and what arrives soonest** (`rankSources`, `GET /api/staff/warehouses/sources`, `GET /my-jobs/part-sources`): every warehouse that holds it (minus what is already promised) with days and date of arrival, fastest first, plus the supplier (its lead time); the best one is marked. A technician or the office can pick any of them; `POST /my-jobs/:id/part-requests` takes `source` (empty = the fastest). Short of stock on a job: `sourceMissingPart` → a **transfer** from the fastest warehouse that has enough, else a supplier order delivered to the warehouse that serves the job.
- **Requests between warehouses** (`StockTransfer`, `lib/transfers.ts`, `/api/staff/transfers`): requested → shipped → received, or rejected / cancelled. Who can ask: a technician (van top-up or a job), the front desk (the branch admin), the warehouse itself, the system. The keeper of the source sees it, sends all or part (the rest stays a request), may promise a date, or refuses with a reason (a job-linked request moves on to the next source). The receiver confirms the quantity; less than sent sends the rest back. Receiving releases every job waiting for that part. Notices: `transferRequested`, `transferShipped`, `transferRejected`, `transferStale` (no answer after `transfer_ship_hours`, default 24), `transferLate`, `warehouseLow`.
- **Keeper's screens**: requests to send, parts on the way in, the **stock** list (count a shelf, set a per-warehouse minimum), **restock** (everything below its minimum with the quickest source for each, one tap sends all), the **history** of every movement, and (admin) the **list** of warehouses to add, edit, link to a service centre or switch off. Technician stock (give / take back) is in the app too (More → Technician stock).
- **Orders** (`/api/staff/part-orders`) show the warehouse they are delivered to and who asked; `receivePartOrder` puts the stock on that shelf.
- **Settings**: `transfer_ship_hours` (24).
- **Demo data**: `npm run demo:load` creates 8 warehouses (6 regional, 2 branch), 3 keepers, filled shelves and requests in every state (waiting, sent, late, received, refused, a van top-up); `demo:clean` removes them and puts parts in transit back.
- Check: `npm run smoke:warehouses -w server` (scratch database, API running).

---

## Telegram bot

One bot for customers and staff (`server/src/lib/telegram/`: `customer.ts`, `staff.ts`, `links.ts`, `text.ts`, `index.ts`; routes in `routes/telegram.ts`). All its wording is in uz / ru / en and follows the person's language.

- **Set up (once)**: in Telegram open @BotFather → `/newbot` → name and username → copy the token. On the host set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_PROVIDER=live`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_URL` (the API's https address) and `TELEGRAM_WEBHOOK_SECRET` (a long random string); optional `APP_DOWNLOAD_URL`. After a deploy the bot registers its webhook and its command list by itself. Without the webhook keys it long-polls (fine locally, but a sleeping free host misses messages).
- **Customer** — connects in three ways: the button "Share my number" (only the sender's own contact counts), **typing the phone number registered with RIZO** (the Telegram number is often a different one: a 6-digit code is sent by SMS to the account's number and must be typed back; 5 minutes, 3 attempts, at most 3 codes per number per hour), or **Connect Telegram** in the portal / the customer app (a one-time `t.me` link valid 15 minutes). The typed-number way needs a working SMS gateway (until Eskiz is set up the code only appears in the API log). The menu: **My requests** (cards with status, technician, visit, estimate, waiting-for-part state and balance, buttons to approve / decline the estimate, confirm the visit, write to the service, open the tracking page), **New request** (repair or installation → purchase → problem → at a centre or at my address (typed or a Telegram location) → confirm; created exactly like a portal request, duplicates refused), **Warranty** (purchases and warranty end), **Service centres** (by region, with the map pin), **Write to the service** (to a request; plain text works when one request is open), **Language**, **App and website**. Status messages arrive in the customer's language with the same buttons (estimate, visit, rating). `/stop` disconnects.
- **Staff** — connect only with the one-time link (**Security → Telegram** on the website, Settings in RIZO Texnik): every alert they get in the bell and as a push also goes to their chat (with an "Open" button), with a mute switch; the bot's menu shows alerts, a technician's open jobs, or an overview (new / open / overdue / waiting for parts) for the office.
- **API**: `GET|DELETE /api/{staff|customer}/telegram`, `POST …/link` (returns the link), `PATCH /api/staff/telegram` (`notify`), `POST /api/telegram/webhook` (the secret header is checked). Data: `telegram_chats` (language, dialogue step), `telegram_link_tokens`, `StaffUser.telegramChatId / telegramNotify`, `Customer.telegramChatId`.
- Check: `npm run smoke:telegram -w server` (start the API with `TELEGRAM_BOT_TOKEN=smoke TELEGRAM_PROVIDER=live TELEGRAM_BOT_USERNAME=rizo_smoke_bot TELEGRAM_WEBHOOK_URL=https://example.invalid TELEGRAM_WEBHOOK_SECRET=smoke-secret`; the Telegram network is stubbed in the script).

---

## Automatic tasks
Admin page **Automatic tasks** (`/app/automation`; accountant read-only): the system does the routine work by itself so that nobody writes reports or watches the clock.
- **Deadline watch** (every minute): a technician is warned once before a job's status timer ends or the legal repair limit is reached; the admins get one summary. The page lists the jobs at risk.
- **Daily report** (every day at `daily_report_hour`, Tashkent): new / finished / open / overdue / at risk / waiting for parts, money collected, average rating, busiest technician. **Weekly report** (Monday 09:00): the existing digest.
- **Payroll statements** (Monday 09:30 for the week before, or the 1st for the month before): pay of every technician (percent of labour + fixed per job + bonuses/penalties) is calculated and stored; each technician sees their own in *My earnings* (website and Texnik app) and gets a notification, the owner gets the total.
- Each job has a **Run now** button (the payroll one shows the last 7 days up to now, marked "interim"), a switch, a run log and a catch-up: a job whose time passed while the free host slept runs as soon as the server wakes. Settings: warning share, legal-limit days, daily hour, payroll period.

## Brands and models of other makers
The service system is not limited to RIZO products: a master (or a technician) can repair devices of **other brands**.
- **Directory** (`/app/directory`, admin and front desk; app: More → Brands and models): category → brand → model. RIZO is the company's own brand and its products stay in the catalogue. Other makers' models have no RIZO warranty and are **always paid repairs**.
- **Adding**: technicians, front desk and admins add a brand or model (website and apps). Similar names are shown first ("did you mean Samsung?"), and "Samsung", "samsung" and "SAM-SUNG" are one brand. An admin's own entry is approved at once; everything else waits for **one admin** (a bell alert tells them) who also renames, merges duplicates and deletes. Customers cannot add anything.
- **"I repair"** (`/app/my-skills`, technician menu in the app; admins edit it on the Staff page): the brands or single models a technician can repair. What a technician adds lands in their list.
- **New request**: for a repair without a sale choose *RIZO product* or *Another maker* (category, brand, model).
- **Queue rule**: RIZO products and jobs under warranty come first. A job for another maker goes only to a technician who lists it and waits (the technician cannot start it) while they have RIZO / warranty jobs in New, Diagnostics or In progress; paused and parts-waiting jobs do not block. An admin can move one to the front with a reason (kept in the activity log).
- API: `/api/staff/directory/*` (brands, models, categories, pending, skills), `POST /api/staff/requests/:id/queue-override`. Tests: `npm run smoke:brands -w server`.

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
- **Warranty rules per product** (months, covers labour / parts; the start date rule is a company setting); a sale can be voided (with reason) and restored; warranties cannot be extended; customer-registered products stay *unverified* until verified.

Timers are green → yellow (last quarter) → red (expired). Completion needs at least one photo, a service when the product category has any (not for replacements) and, for replacements, the new product + serial number. Cost is 0 when covered by warranty (extras are still charged), otherwise services + parts + extras.

Repairs can be in shop or on site, chosen when the request is created; on-site requests need an address.

---

## Domain model (short)

- **StaffUser** — `admin`, `receptionist` or `technician` (`mobile` / `service_center`), availability, `is_active`, locale, pay percent / fixed per job, service center
- **ServiceCenter** — branch directory (address, hours, coordinates, authorised flag)
- **Estimate / EstimateLine** — draft → sent → approved / declined / expired; optional lines, part lines fulfilled from stock
- **Payment** — payment or refund per request, method, fiscal receipt number
- **PartOrder** — requested → ordered → received for missing stock, linked to the waiting job and delivered to a warehouse
- **Warehouse / PartStock / StockTransfer** — central, regional and branch warehouses, the quantity of each part on each shelf (with its own minimum), and requests between them (or to a technician's van)
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
- **TelegramChat / TelegramLinkToken** — the bot's language and dialogue step per chat; one-time keys behind the "Connect Telegram" links
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
| `/api/staff/requests` | Create / list (`limit`, `offset` → also `total`, `hasMore`; no `limit` = up to 1000, same for customers and sales); `PATCH` changes status, technician or priority (pause needs `pauseReason` + `pauseHours`) |
| `/api/staff/reports/dashboard` | Dashboard KPIs and chart series |
| `/api/staff/reports/products` | Product report |
| `/api/staff/reports/parts` | Spare-part report (`productId` optional) |
| `/api/staff/reports/expenses` | Extra expenses + parts cost |
| `/api/staff/reports/profit` | Profit summary and trend |
| `/api/staff/reports/technicians` | Technician performance |
| `/api/staff/reports/warranty` | Warranty vs paid |
| `/api/staff/reports/sources` | Request source mix |
| `/api/staff/requests/:id/…` | `decision`, `estimates` (+ `/:estimateId/send|approve|decline`), `payments`, `notes`, `pickup` |
| `/api/staff/warehouses` (+ `/mine`, `/sources`, `/:id/stock`, `/:id/movements`, `/:id/restock`), `/api/staff/transfers` (+ `/:id/ship|receive|reject|cancel`) | Warehouses, stock per shelf, restock suggestions, requests between warehouses |
| `/api/staff/part-orders` (+ `/overview`, `/waiting`, `/recommendations`, `/bulk`), `/api/staff/suppliers`, `/defect-codes`, `/service-centers`, `/serials/:serial`, `/payroll`, `/staff` | Part orders, codes, branches, serial card, payroll + adjustments, staff admin |
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
- **Telegram bot** (`server/src/lib/telegram/`): starts only when `TELEGRAM_BOT_TOKEN` is set and the provider is not `console` (see "Telegram bot").
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
