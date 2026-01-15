# Production Notes

## What Changed

Your code has been upgraded to production standards:

1. **Database**: Removed email redundancy from admins table (uses auth.users instead)
2. **Types**: Auto-generated from database - run `npm run generate-types` after schema changes
3. **Products Page**: Now server-rendered for SEO (was client-side)
4. **Store**: Fixed price calculation to handle free items correctly
5. **Security**: Locked down image sources to your Supabase project

## Important Commands

```bash
# Regenerate types after database changes
npm run generate-types

# Build for production
npm run build

# Run locally
npm run dev
```

## Key Files

- `tables.sql` - Database schema (run in Supabase SQL Editor)
- `src/types/database.types.ts` - Auto-generated (don't edit manually)
- `src/types/index.ts` - Application types derived from database
- `src/app/products/page.tsx` - Server component (fetches data)
- `src/app/products/ProductGrid.tsx` - Client component (interactivity)

## Before Deploying

1. Run `tables.sql` in Supabase SQL Editor
2. Add products with `is_active = true`
3. Ensure product_media has `display_order = 0` for main images
4. Test locally: `npm run dev`
5. Build: `npm run build`

That's it.
