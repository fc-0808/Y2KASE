# leluxeloop - Premium E-commerce Platform

A modern, luxury-focused e-commerce platform built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS v4**, and **Supabase**.

## 🌟 Features

- ✨ Premium luxury product showcase
- 🛒 Shopping cart with persistent storage
- 🔐 Authentication with Supabase
- 💳 Stripe payment integration
- 📊 Product reviews and ratings
- 🎨 Elegant, modern UI with Tailwind CSS v4
- ⚡ Server-side rendering with App Router
- 🔄 Real-time database with Supabase
- 🚀 Production-ready architecture

## 🏗️ Project Structure

```
leluxeloop/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── cart/                 # Shopping cart
│   │   ├── products/             # Product pages
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Home page
│   ├── components/               # Reusable components
│   ├── lib/                      # Utilities & services
│   │   ├── supabase/             # Supabase clients
│   │   └── store.ts              # Zustand store
│   ├── styles/                   # Global styles (Tailwind v4)
│   ├── types/                    # TypeScript types
│   ├── hooks/                    # Custom hooks
│   └── constants/                # Constants
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
├── public/                       # Static assets
└── package.json                  # Dependencies
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ or later
- npm or yarn

### Installation

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Set Up Environment Variables**

   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with your values:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key
   ```

3. **Run Development Server**

   ```bash
   npm run dev
   ```

4. **Open in Browser**
   ```
   http://localhost:3000
   ```

## 📦 Tech Stack

| Layer          | Technology            |
| -------------- | --------------------- |
| Framework      | Next.js 16            |
| Runtime        | React 19              |
| Language       | TypeScript 5.7        |
| Styling        | Tailwind CSS v4       |
| State          | Zustand 5             |
| Database       | Supabase (PostgreSQL) |
| Authentication | Supabase Auth         |
| Payments       | Stripe                |
| HTTP           | Axios                 |

## 💻 Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

## 🗂️ Import Paths

Use path aliases for clean imports:

```typescript
// Components
import Button from '@/components/Button'

// Libraries
import { createClient } from '@/lib/supabase/client'
import { useCart } from '@/lib/store'

// Types
import type { Product, User } from '@/types'

// Styles
import '@/styles/globals.css'
```

## 🔐 Environment Variables

Create `.env.local`:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Stripe (optional)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

## 📝 License

This project is private and licensed under the leluxeloop Terms.

---

**Version:** 2.0.0  
**Built with:** Next.js 16 | React 19 | TypeScript 5.7 | Tailwind CSS v4 | Zustand 5 | Supabase
