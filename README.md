# Allo Inventory — Take-Home Exercise

Multi-warehouse inventory reservation system built with Next.js 14, Prisma, and PostgreSQL.

## Live URL
https://allo-inventory-eight.vercel.app

## GitHub
https://github.com/sanathshetty777/allo-inventory

## Local setup

```bash
# 1. Clone and install
git clone https://github.com/sanathshetty777/allo-inventory.git
cd allo-inventory
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env and fill in your DATABASE_URL from Neon/Supabase

# 3. Run migrations and seed
npx prisma migrate dev --name init
npx prisma db seed

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon/Supabase/Railway) |
| `CRON_SECRET` | Secret token protecting the `/api/cron/expire` endpoint |

---

## How expiry works in production

**Lazy cleanup (always on, zero infrastructure)**

Every `GET /api/products` call runs two SQL statements before returning data:
- Updates `reservedQty` on Inventory rows for all expired reservations
- Marks those Reservations as `RELEASED`

This means stock counts shown to shoppers are always accurate at the point they matter — when someone is deciding whether to buy. Cost: one extra SQL round-trip on the products page.

A Vercel Cron job (`/api/cron/expire`) also exists in the codebase for background sweeps, but was removed from `vercel.json` due to Vercel's free tier limiting crons to once per day. The lazy cleanup fully covers the requirement since expiry is enforced both on read and at confirm time.

---

## Concurrency guarantee

`POST /api/reservations` uses a Postgres transaction with `SELECT ... FOR UPDATE`:

```sql
SELECT id, "totalQty", "reservedQty"
FROM "Inventory"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

This acquires a row-level exclusive lock. Two simultaneous requests for the last unit will serialize:
- **Request A** acquires the lock → sees 1 available → increments `reservedQty` → commits
- **Request B** waits for the lock → sees 0 available → returns 409

Without `FOR UPDATE`, both requests could read "1 available" in parallel and both succeed — classic oversell race condition.

---

## Idempotency (bonus)

Pass `Idempotency-Key: <uuid>` on `POST /api/reservations`.

The key is stored in a `@unique` column on the Reservation table. On retry:
1. Look up the key before entering the transaction
2. If found, return the original response (200, not 201)
3. If not found, proceed with normal reservation logic

The frontend generates a fresh UUID per button click using `crypto.randomUUID()`.

---

## Trade-offs / what I'd do differently with more time

- **Redis distributed lock**: `SELECT FOR UPDATE` serializes correctly on a single Postgres primary, but under very high concurrency across many replicas a Redis-based lock (Redlock) would reduce contention.
- **Auth**: Reservations aren't tied to users — any client can confirm or release any reservation by ID. In production you'd verify session ownership.
- **Optimistic UI**: The checkout page refetches from the server after confirm/cancel. React Query or SWR would give optimistic updates.
- **Shared expiry util**: The cleanup SQL is duplicated between `/api/products` and `/api/cron/expire`. Worth extracting to `src/lib/expiry.ts`.
- **Structured error codes**: Errors are currently string messages. A proper API would return typed error codes.

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List warehouses |
| `POST` | `/api/reservations` | Reserve units — 409 if insufficient stock |
| `GET` | `/api/reservations/:id` | Fetch a single reservation |
| `POST` | `/api/reservations/:id/confirm` | Confirm (payment succeeded) — 410 if expired |
| `POST` | `/api/reservations/:id/release` | Release early (cancelled / failed) |
| `GET` | `/api/cron/expire` | Release all expired reservations (cron only) |
