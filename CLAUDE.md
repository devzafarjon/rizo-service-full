# RIZO Service — working notes

After-sales service management for RIZO market (Uzbekistan). Web only; technician and customer views must work on phones (360–420px), admin on tablets (768–1024px). `README.md` is the product documentation; this file is the short brief for working in the repo. Keep both current.

## Business rules
- Two service types: **repair** (dead on arrival or failed in use; resolved by repair or replacement; free in warranty, paid otherwise) and **installation** (first-time setup). **No periodic / seasonal maintenance** — never model it.
- Location is **in_shop** or **on_site**, chosen when the request is created. **Installation is always on site at the customer's address** (in-shop installation is not allowed; the API rejects it). Repairs can be either. On-site needs an address (+ optional lat/lng).
- `source` is `rizo_service` | `rizo_market`. Request creation lives in service-layer code so a future RIZO market API can call it. Integration is not built.
- Warranty runs from the **installation date** when the product was installed (set when an installation request completes), otherwise from the sale date. Dates are UTC date-only; "today" is `Asia/Tashkent`.
- Cost: 0 if in warranty (extras are still charged), otherwise services + parts + extra expenses. Profit = revenue − part **cost price** (snapshotted per line) − extra expenses.

## Roles
`admin` (dispatcher), `technician` (`mobile` | `service_center`), `customer`. Phone + password for all three; customers use a separate login and JWT scope. Reports, dashboard, inventory, schedule, audit, duplicates and settings are admin-only **at the API** (`requireStaffRole("admin")`). Customer queries are always scoped to the token's customer id. Deactivated staff (`is_active=false`) cannot sign in and lose API access within ~15s.

## Status model (one model for both types)
`new → in_progress → paused → completed → picked_up`, plus `cancelled`.
- Technician board columns: New, In progress, Paused, Completed (completed + picked_up). Cancelled jobs leave the boards.
- Timers: New 1 day (from assignment), In progress 3 days (from accept), Paused = technician-set hours. A pause **requires a reason**.
- `picked_up` only follows `completed` for in-shop jobs (customer tap or signature).
- Completion needs ≥1 photo, a service when the category has any (not for replacements), and — for replacements — the new product + serial number.
- All transitions go through `server/src/lib/statusChange.ts` (`changeRequestStatus`); pickup through `lib/pickup.ts`.

## Stack and layout
React 19 + Vite + TS + Tailwind 4 + React Router + TanStack Query + Headless UI + lucide-react + @dnd-kit + Recharts + html5-qrcode + react-i18next (client/); Express + TS + Zod + Prisma + PostgreSQL + Socket.io + JWT/bcrypt (server/). npm workspaces.

- `server/src/routes/*` thin routes, `server/src/lib/*` domain logic (assignment, displayId, statusChange, pickup, sla, notify*, reportJobs…), `server/prisma/` schema, migrations, seed.
- `client/src/features/<area>/` screens, `client/src/components/` shared UI, `client/src/lib/` helpers, `client/src/i18n/locales/{uz,ru,en}.json`.

## Conventions
- **i18n**: Uzbek default, Russian, English. No hardcoded UI strings; add keys to all three locale files. Server errors are English with a `code`; the client maps `errors.<code>`. Add new messages to `MESSAGE_CODES` in `server/src/middleware/error.ts` (or throw `HttpError` with an explicit code). Run `node server/scripts/i18n-scan.mjs` — `portal.pendingFeedback` / `portal.photoCount` show as "missing" only because they are plural keys.
- **Request ID** `display_id` = `DDMMYY` (Tashkent) + 2-digit region + 4-digit daily sequence (one counter per day, atomic upsert), shown as `#…`.
- **Brand**: purple `#7B00E0`, orange `#F7941E` as accents on a light neutral base (never a full purple screen). Staff app = white header; customer portal = purple-tint header with orange rule and badge. Logo: `client/public/rizo-logo.svg` (do not redraw it).
- Requests are never hard-deleted. Everything audit-worthy goes through `writeAudit`.
- Stubs that are not real integrations: SMS and Telegram default to a `console` driver (set `SMS_HTTP_URL` / `TELEGRAM_BOT_TOKEN` to send). Password-reset SMS therefore only appears in the API log until a gateway is configured.

## Commands
```bash
npm install
npm run db:migrate        # prisma migrate dev
npm run db:seed           # demo staff, customers, catalog, sales, one request per board column
npm run dev               # API :4000 + client :5173
npm run smoke             # API checks; needs the API running (SMOKE_API=http://localhost:4100 to target another)
npx tsc -b                # client typecheck (run in client/)
npx tsc --noEmit          # server typecheck (run in server/)
node server/scripts/i18n-scan.mjs
```
Scratch DB for QA: point `DATABASE_URL` at another database, `prisma migrate deploy`, seed, run the API on another `PORT`, and start Vite with `API_TARGET=http://localhost:4100 DEV_PORT=5174`.
