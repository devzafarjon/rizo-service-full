# RIZO Service

After-sales field service for RIZO market: installation, repair, and maintenance.

## Stack

- Client: React (Vite), TypeScript, Tailwind CSS, React Router, TanStack Query
- Server: Node.js, Express, TypeScript, Socket.io
- Database: PostgreSQL + Prisma

## Run locally

PostgreSQL 16 must be running on `localhost:5432`.

```bash
createdb rizo_service   # skip if it already exists
cp server/.env.example server/.env
# set DATABASE_URL and JWT_SECRET in server/.env

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:4000

## Demo accounts

| Role | Phone | Password |
| --- | --- | --- |
| Admin / dispatcher | 998900000001 | admin123 |
| Technician (mobile) | 998900000002 | tech123 |
| Technician (service center) | 998900000004 | tech123 |
| Customer | 998900000003 | customer123 |

Staff and customer tokens are separate JWT scopes. A staff token cannot call customer portal routes, and the reverse is also blocked.
