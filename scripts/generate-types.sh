#!/bin/bash

# Generate TypeScript types from Supabase database schema
# Run this script whenever you change your database schema

echo "🔄 Generating TypeScript types from Supabase..."

npx supabase gen types typescript --project-id "bvqtaytvxcnpxdefajxz" > src/types/database.types.ts

if [ $? -eq 0 ]; then
  echo "✅ Types generated successfully!"
  echo "📁 File: src/types/database.types.ts"
else
  echo "❌ Failed to generate types"
  exit 1
fi
