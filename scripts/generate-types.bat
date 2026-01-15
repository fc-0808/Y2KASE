@echo off
REM Generate TypeScript types from Supabase database schema
REM Run this script whenever you change your database schema

echo Generating TypeScript types from Supabase...

npx supabase gen types typescript --project-id "bvqtaytvxcnpxdefajxz" > src/types/database.types.ts

if %errorlevel% equ 0 (
  echo Types generated successfully!
  echo File: src/types/database.types.ts
) else (
  echo Failed to generate types
  exit /b 1
)
