# OHMYGAS Build Handoff

## Project status

Full Next.js 16 App Router build of OHMYGAS, wired to a real MySQL database via
Prisma (through XAMPP/MariaDB), covering every module in the capstone proposal
and `OHMYGAS_Build_Prompt_NextJS (2).md`.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4
- Prisma 7 with the `@prisma/adapter-mariadb` driver adapter
- MySQL/MariaDB via XAMPP — database name `ohmygas`, `root` user, no password
- JWT (httpOnly cookie) auth with bcrypt password hashing
- Home-grown TOTP (RFC 6238) for optional admin two-factor auth — no extra
  dependency, implemented in `src/lib/totp.ts`

## Running it

1. Start XAMPP's MySQL/MariaDB service (Apache is not needed).
2. `cd ohmygas-next && npm install` (already done in this environment).
3. `npm run dev` — note the port: 3000 was occupied by another local service
   on this machine, so Next.js fell back to **3001**
   (`http://localhost:3001`). If port 3000 is free for you, it'll use that
   instead.
4. Log in with the seeded demo accounts:
   - Admin: `admin` / `Admin@123`
   - Cashier: `mariasantos` / `Cash@123`

To re-seed (safe to re-run — upserts, won't duplicate):
```
npx prisma db seed
```

## What's implemented

Every module from the build-prompt spec, backed by real Prisma/MySQL data —
not the old in-memory store (which has been removed):

- **Auth**: login, logout, JWT session, bcrypt, forced password-change flow
  for new accounts (`must_change_password`), optional TOTP 2FA for admins
- **Dashboard**: real KPIs, cylinder stock bar chart, weekly empty-return
  line chart, low-stock alerts, recent transactions (recharts)
- **File Maintenance**: Products (CRUD, archive/restore, margin→price calc),
  Suppliers (CRUD, supplied-product tags via a join table)
- **Price Management**: margin editing, VAT rate control, audit-logged
- **Transactions**: POS (cart, senior/bulk discount, cylinder exchange fee,
  cash/GCash, receipt), Cash Management (open/close shift), X & Z Reports
  (interim vs. end-of-day, resets via a settings timestamp instead of
  destructive deletes), Purchase Orders, Receive Orders
- **Delivery**: delivery orders (dispatch/complete/cancel, stock updates on
  completion), Customers (auto-classification: new → regular → loyal → vip,
  `bulk` is manual-only and never auto-downgraded)
- **Inventory**: Stock Monitor, Stock Adjustment (+/- with required reason),
  Warehouse (location reassignment)
- **Reports & Analytics**: sales/annual/transactions/delivery/stock/PO/
  receiving tabs, date range, CSV export
- **Audit Logs**: every mutating action across every module writes a row;
  searchable/filterable, color-coded action badges
- **Settings & Security**: change-password, user management with
  generated-default-password flow + "DEFAULT PW" badge, tax/discount
  settings, backup/about panels, 2FA management

## Architecture notes

- `src/lib/db.ts` — shared Prisma client (MariaDB driver adapter)
- `src/lib/auth.ts` — JWT + `requireAuth(req, role?)` guard used by every API route
- `src/lib/audit.ts` — `writeAuditLog()` helper called from mutating routes
- `src/lib/calc.ts` — VAT-inclusive/discount/cylinder-fee cart math (server-authoritative)
- `src/lib/serialize.ts` — converts Prisma `Decimal` → plain numbers for JSON responses
- `src/proxy.ts` — route protection (Next.js 16 renamed `middleware.ts` → `proxy.ts`)
- `src/components/AppShell.tsx` + `src/context/SessionContext.tsx` — client-side
  shell that shows/hides the sidebar and feeds role info to `Sidebar.tsx`
  (this fixes a bug in the original scaffold where admin-only nav items were
  hidden unconditionally, even for admins)
- Route pattern per module: `app/<group>/<page>/page.tsx` → `utils/api-services/<x>Service.ts`
  → `app/api/<x>/route.ts` → Prisma

## Database changes required on other environments

This project has **no Prisma migration history** — the schema was introspected
from an existing database and has been extended since with raw `ALTER TABLE`
statements, mirrored into `prisma/schema.prisma` and applied with
`prisma generate`.

That means **`npm run build` will succeed on a database that is missing these
columns, and the app will then fail at runtime.** Before deploying to any
environment that has not had them applied, run the SQL below and re-run
`npx prisma generate`.

```sql
-- Reference tables for the File Maintenance Category and Unit modules
CREATE TABLE IF NOT EXISTS categories (
  category_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40)  NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  is_cylinder TINYINT(1)   NOT NULL DEFAULT 0,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX categories_code_key (code)
);

CREATE TABLE IF NOT EXISTS uoms (
  uom_id     INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(20) NOT NULL,
  name       VARCHAR(80) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uoms_code_key (code)
);

-- Category moved from a Prisma enum to a code referencing categories.code
ALTER TABLE products MODIFY category VARCHAR(40) NOT NULL;

-- Purchase order: who raised it, and cancellation
ALTER TABLE purchase_orders
  ADD COLUMN created_by INT NULL,
  ADD COLUMN cancelled_at DATETIME(3) NULL,
  ADD CONSTRAINT purchase_orders_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(user_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-line receiving, with structured discrepancy counts
ALTER TABLE purchase_order_items
  ADD COLUMN received_qty   INT         NOT NULL DEFAULT 0,
  ADD COLUMN receive_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN receive_note   TEXT        NULL,
  ADD COLUMN received_at    DATETIME(3) NULL,
  ADD COLUMN missing_qty    INT         NOT NULL DEFAULT 0,
  ADD COLUMN damaged_qty    INT         NOT NULL DEFAULT 0,
  ADD COLUMN excess_qty     INT         NOT NULL DEFAULT 0;

-- GCash sender's number, captured at the till alongside the reference
ALTER TABLE transactions ADD COLUMN gcash_mobile VARCHAR(20) NULL;
```

Then seed the reference rows (`npx prisma db seed` does this, or insert by hand):

```sql
INSERT IGNORE INTO categories (code,name,is_cylinder) VALUES
  ('cylinder','Cylinder',1), ('accessory','Accessory',0), ('appliance','Appliance',0);
INSERT IGNORE INTO uoms (code,name) VALUES
  ('pcs','Piece'), ('cylinder','Cylinder'), ('kg','Kilogram'),
  ('liter','Liter'), ('box','Box'), ('set','Set');
```

To check an environment for drift:

```
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource
```

Entries reading `[+] Added index on columns (...)` for foreign-key columns are
expected noise — MySQL creates those indexes implicitly and Prisma reports them
on every diff. Anything mentioning a **column**, a **foreign key** or a
**renamed index** is real drift and should be resolved.

## Known simplifications (documented trade-offs, not bugs)

- Cash sessions are per-user, not per-terminal; "Terminal #01" in X/Z reports
  is a hardcoded label matching the single-terminal license note in Settings.
- Auto Backup panel is a static display — no real scheduled backup job runs.
- Reports page reuses the sales/PO/delivery list endpoints rather than having
  a dedicated aggregation endpoint per tab.

## Verification performed

- `npm run build` passes (TypeScript strict, zero errors) after every phase.
- End-to-end smoke tests against the real MySQL database via `npm run dev`:
  login (admin + cashier), POS checkout (stock/inventory/audit rows verified
  in MySQL directly), purchase order create → receive (stock increments),
  stock adjustment, delivery create → dispatch → complete (customer
  auto-reclassified new → regular, stock decremented), role-based 403s on
  admin-only endpoints for the cashier account, and proxy redirect for
  unauthenticated access.
