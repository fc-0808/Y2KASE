# Y2KASE

A modern, AI-powered e-commerce storefront for **Y2KASE** — kawaii / Y2K aesthetic phone cases, charms, and accessories.

Built the way a top-tier product team would: type-safe end to end, serverless Postgres, AI-assisted catalog generation, and ISR-rendered storefront pages for SEO + speed.

## Tech stack

| Layer        | Choice                                  |
| ------------ | --------------------------------------- |
| Framework    | Next.js 16 (App Router) + React 19 + TS |
| Database     | PostgreSQL on [Neon](https://neon.tech) |
| ORM          | Drizzle ORM + drizzle-kit               |
| Images / CDN | Cloudinary                              |
| AI copy      | OpenAI GPT-4o-mini (vision)             |
| Cart state   | Zustand (persisted to localStorage)     |
| Styling      | Tailwind CSS v4                         |
| Icons        | lucide-react                            |
| Hosting      | Vercel (recommended)                    |

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                 # Homepage (hero, featured, tag cloud)
│  ├─ products/
│  │  ├─ page.tsx              # Catalog: search, tag filter, pagination
│  │  └─ [slug]/page.tsx       # Product detail (ISR, revalidate hourly)
│  └─ admin/products/          # Review AI drafts → publish (server actions)
├─ components/                 # Navbar, Footer, CartDrawer, ProductCard, ...
└─ lib/
   ├─ db/                      # Drizzle client + schema (lazy, build-safe)
   ├─ products.ts              # All read queries for the storefront
   ├─ ai.ts                    # GPT vision → product copy
   ├─ store/cart.ts            # Zustand cart
   └─ utils.ts                 # cn(), formatPrice()
scripts/
├─ migrate-sqlite.ts           # Import legacy MDM catalog → Postgres
└─ ingest-images.ts            # Local images → Cloudinary → GPT → draft products
```

The data model mirrors Shopify's own (products → images → options → variants)
plus an append-only `provenance_events` audit log carried over from the legacy
Master Data Management (MDM) pipeline.

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

- **`DATABASE_URL`** — create a free Postgres at [neon.tech](https://neon.tech) and copy the *pooled* connection string.
- **`OPENAI_API_KEY`** — from [platform.openai.com](https://platform.openai.com/api-keys) (only needed for AI ingestion).
- **`CLOUDINARY_*`** — from [cloudinary.com](https://console.cloudinary.com/) (only needed for AI ingestion).

The site runs without these — pages render with empty states until a database is connected.

### 3. Create the database schema

```bash
npm run db:push      # push schema straight to the DB (fast, for dev)
# or, for versioned migrations:
npm run db:generate  # generate SQL migration files into ./drizzle
npm run db:migrate   # apply them
```

### 4. (Optional) Import the existing catalog

Imports the 238 golden records from the legacy Shopify project's SQLite MDM
database into Postgres. Path is configurable via `LEGACY_SQLITE_PATH`.

```bash
npm run import:catalog
```

### 5. (Optional) Generate new products from images with AI

Point it at a folder of images. **Subfolders = one product each** (all images
inside become the gallery); a flat folder = one product per image. Products are
created as **drafts** for review in the admin panel.

```bash
npm run ingest:images -- "C:\path\to\your\images"
```

Each image is uploaded to Cloudinary, then GPT-4o-mini writes the title,
description, tags, and a suggested price. Cost is roughly **$0.01 per image**.

### 6. Run

```bash
npm run dev
```

- Storefront: http://localhost:3000
- Admin (review drafts): http://localhost:3000/admin/products

## Scripts

| Command                  | Description                                  |
| ------------------------ | -------------------------------------------- |
| `npm run dev`            | Start the dev server (Turbopack)             |
| `npm run build`          | Production build                             |
| `npm run db:push`        | Push schema to the database                  |
| `npm run db:studio`      | Open Drizzle Studio (visual DB browser)      |
| `npm run import:catalog` | One-time legacy SQLite → Postgres import     |
| `npm run ingest:images`  | AI image ingestion → draft products          |

## Roadmap

- [x] Stripe checkout + orders table
- [x] Order confirmation emails (Resend)
- [x] Admin auth (Better Auth, email + password)
- [x] Customer auth — passwordless magic link + Google OAuth (Better Auth)
- [x] Customer account area + order history (`/account/orders`)
- [ ] Per-variant pricing & inventory
- [ ] Full-text / Algolia search
- [ ] Apple Sign In (needs Apple Developer account)

### Enabling Google sign-in

Customer sign-in shows **Continue with Google** only when both
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. To create them:

1. [Google Cloud Console](https://console.cloud.google.com) → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name, support
   email, logo; add scopes `email`, `profile`, `openid`; add yourself as a test user.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
4. Authorized JavaScript origins: `http://localhost:3000` and `https://YOUR_DOMAIN`.
5. Authorized redirect URIs:
   `http://localhost:3000/api/auth/callback/google` and
   `https://YOUR_DOMAIN/api/auth/callback/google`.
6. Copy the Client ID + Client Secret into `.env.local` (and Vercel env), redeploy.

> Magic-link sign-in works today with just `RESEND_API_KEY` set — but until your
> sending domain is **verified in Resend**, links only deliver to your own
> Resend account email. Verify `send.y2kase.com` and set
> `EMAIL_FROM="Y2KASE <orders@send.y2kase.com>"` before launch.

## Notes

- **Why Postgres over the legacy SQLite?** Concurrent writes, native arrays +
  JSONB, full-text search, and Neon's branch-per-environment workflow.
- **Why drafts by default for AI products?** AI-authored copy should always get
  a human review before going live. Publish from `/admin/products`.
