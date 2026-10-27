# OHMYGAS

Integrated Point-of-Sale and Inventory System for Island Gas LPG Store, built
with Next.js 16 and MySQL (via Prisma).

## Requirements

- [Node.js](https://nodejs.org) 20 or later
- A MySQL/MariaDB server — the easiest option is [XAMPP](https://www.apachefriends.org/),
  which bundles MariaDB and phpMyAdmin. You only need MySQL running (Apache is
  not required by this project).

## First-time setup

1. Start your MySQL server (in XAMPP, open the XAMPP Control Panel and click
   **Start** next to MySQL).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create the database, tables, and demo data automatically:
   ```bash
   npm run setup
   ```
   This creates a `.env` file (with a randomly generated secret) if one
   doesn't exist yet, creates the `ohmygas` database if it's not already
   there, syncs the schema, and seeds two demo accounts and sample products.
4. Start the app:
   ```bash
   npm run dev
   ```
   Open the URL it prints (usually [http://localhost:3000](http://localhost:3000) —
   if that port is already in use on your machine, Next.js will automatically
   pick the next free one and print it in the terminal).

### Demo accounts

| Role     | Username      | Password    |
|----------|---------------|-------------|
| Admin    | `admin`       | `Admin@123` |
| Cashier  | `mariasantos` | `Cash@123`  |

### Connecting to a different MySQL setup

If your MySQL server isn't the XAMPP default (`root` user, no password,
`localhost:3306`), edit `DATABASE_URL` in `.env` before running `npm run setup`:

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/ohmygas"
```

## Everyday commands

```bash
npm run dev      # start the app
npm run build    # production build (also type-checks everything)
npm run setup    # re-run database setup (safe to run again — won't duplicate data)
```

## Project structure

- `src/app/` — pages and API routes (Next.js App Router)
- `src/lib/` — shared server-side logic (database client, auth, business rules)
- `src/components/`, `src/context/` — shared UI and client-side state
- `src/utils/api-services/` — typed `fetch()` wrappers the frontend calls
- `prisma/schema.prisma` — database schema
- `prisma/seed.ts` — demo data
- `scripts/setup-db.js` — one-time setup script (see above)

See `HANDOFF.md` for a full module-by-module status of what's implemented.
