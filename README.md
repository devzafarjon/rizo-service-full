# RIZO Service

After-sales field service for RIZO market. Staff dispatch jobs, technicians work them, and customers track them. Covers **installation** and **repair**, either **in shop** or **on site**.

Brand follows [rizo.uz](https://rizo.uz): Inter, white pages, black top bar, purple `#B439FD`, orange `#F6921E`.

Keep this file in sync with the product. After any user-visible change, re-check the running app and update this README.

---

## What it is

| Interface | Who | Where |
| --- | --- | --- |
| Staff dashboard | Admin / dispatcher | `/app` |
| Technician panel | Mobile or service-center technician | `/app/my-jobs` |
| Customer portal | Product owner | `/portal` |

Jobs can come from **RIZO market** (linked sale + warranty) or **RIZO Service** (walk-in / portal). Warranty dates are stored as UTC date-only. Matching available technicians can be auto-assigned.

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

---

## Demo accounts

Phone + password. Staff and customers use **separate JWT scopes** — a staff token cannot call portal routes and the reverse is blocked.

| Role | Phone | Password |
| --- | --- | --- |
| Admin / dispatcher | `998900000001` | `admin123` |
| Technician (mobile) | `998900000002` | `tech123` |
| Technician (service center) | `998900000004` | `tech123` |
| Customer (Dilnoza) | `998900000003` | `customer123` |

Seed also creates extra customers (Jasur, Malika) and invoices `RZ-1001` … `RZ-1004`.

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
| `/portal/forgot` | Password reset (returns a one-time password in-app; no SMS) |

### Staff (admin)

| Path | Screen |
| --- | --- |
| `/app` | Analytics dashboard (charts + KPI cards) — first screen after admin login |
| `/app/kanban` | Dispatch board — drag-and-drop status, live updates, technician load |
| `/app/customers` | Customer list + create/edit |
| `/app/customers/:id` | Profile, purchases, service history |
| `/app/catalog` | Products, service items, spare parts (three names required) |
| `/app/sales` | Record a sale; warranty expiry is calculated |
| `/app/requests` | All service requests |
| `/app/requests/new` | Create job with warranty check and auto/manual assign |
| `/app/requests/:id` | Job detail, timeline, print |
| `/app/receipts` | Completed / closed / replaced jobs |
| `/app/receipts/:id` | Printable branded receipt + editable disclaimer |
| `/app/reports` | Reports hub (admin only) |
| `/app/reports/products` | Volume, installation vs repair, paid revenue, warranty ratio |
| `/app/reports/parts` | Quantity used, parts revenue, ranked; optional product filter |
| `/app/reports/expenses` | Extra expenses + parts cost by technician and product, running total |
| `/app/reports/profit` | Paid revenue − parts − extras, daily/weekly/monthly trend |
| `/app/reports/technicians` | Jobs done, resolution time, rating, revenue |
| `/app/reports/warranty` | In-warranty (free) vs paid count and value over time |
| `/app/reports/sources` | RIZO market vs RIZO Service staff vs customer portal |

Dashboard and Reports are **admin / dispatcher only**. Technician and customer navigation do not show them; `RoleRoute` and `requireStaffRole("admin")` block the pages and APIs. Date filters: this week / month / quarter / year / all / custom. Each report exports CSV (opens in Excel). Dashboard date range is global and refreshes every chart from aggregated `/api/staff/reports/*` endpoints (not raw client-side job lists).

Header search finds phone, name, invoice, or request ID. The top-right account menu signs out from every staff page (including request detail, receipts, and reports).

### Technician

| Path | Screen |
| --- | --- |
| `/app/my-jobs` | Personal kanban; availability toggle |
| `/app/my-jobs/:id/complete` | Services, parts (stock check), extras, photo, complete |
| `/app/my-jobs/:id/receipt` | Print the same receipt |

Phone-friendly. Desktop still uses the staff shell. The header account menu is on every technician page, including job complete and receipt print.

### Customer portal

| Path | Screen |
| --- | --- |
| `/portal` | My requests, filters, ratings after completion |
| `/portal/new` | New request from a past purchase or catalog product |
| `/portal/requests/:id` | Live status, timeline, notes visible to the customer |

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

## Job types and statuses

Only statuses allowed for that type can be set (kanban drop is validated).

| Type | Flow |
| --- | --- |
| Installation | scheduled → in_progress → completed |
| Repair | received → diagnosing → awaiting_parts → repairing → ready_for_pickup → replaced / closed |

On-site jobs record arrival. Pauses have a reason and a custom timer.

---

## Domain model (short)

- **StaffUser** — `admin` or `technician` (`mobile` / `service_center`), availability, locale
- **Customer** — phone login, address, region, locale
- **Product** — SKU, category, translated names
- **Sale** — invoice, price, warranty months + expiry
- **ServiceCatalogItem / SparePart** — category-tagged, translated names; parts have stock
- **ServiceRequest** — type, source, location, assignment, warranty, payment, display id
- **Lines** — services, parts (qty + price at time), extra expenses, photos, notes, pauses
- **Feedback** — one rating per completed job
- **Notification** — English `message` fallback plus `code` / `params` for i18n

---

## API

Staff routes sit under `/api/staff/…` with a staff JWT. Customer routes sit under `/api/customer/…` with a customer JWT.

| Prefix | Purpose |
| --- | --- |
| `/api/health` | Liveness |
| `/api/staff/auth` | Login, me, availability, locale |
| `/api/customer/auth` | Register, login, me, forgot, locale |
| `/api/staff/customers` | CRUD |
| `/api/staff/products` | Product catalog |
| `/api/staff/catalog` | Services and spare parts |
| `/api/staff/sales` | Sales + warranty |
| `/api/staff/search` | Quick search |
| `/api/staff/technicians` | Board + workload |
| `/api/staff/requests` | Create / list / update jobs |
| `/api/staff/reports/dashboard` | Dashboard KPIs and chart series |
| `/api/staff/reports/products` | Product report |
| `/api/staff/reports/parts` | Spare-part report (`productId` optional) |
| `/api/staff/reports/expenses` | Extra expenses + parts cost |
| `/api/staff/reports/profit` | Profit summary and trend |
| `/api/staff/reports/technicians` | Technician performance |
| `/api/staff/reports/warranty` | Warranty vs paid |
| `/api/staff/reports/sources` | Request source mix |
| `/api/staff/my-jobs` | Technician jobs, complete, photos |
| `/api/customer` | Portal requests, notifications, feedback |

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

## How to work on it

1. Change one area at a time.
2. New UI copy goes into all three locale files. Customer-facing catalog fields need `nameUz` / `nameRu` / `nameEn`.
3. Verify in the browser (staff, technician if relevant, portal) — not only a screenshot.
4. Update this README so routes, demo accounts, and behaviour still match the running app.
