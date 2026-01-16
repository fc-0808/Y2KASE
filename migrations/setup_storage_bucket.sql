-- ==========================================
-- STORAGE BUCKET SETUP FOR MEDIA UPLOADS
-- ==========================================
-- Description: Creates product-media storage bucket with RLS policies
-- Author: System Migration
-- Date: 2026-01-16
-- ==========================================
-- Enable storage schema if not already enabled
CREATE SCHEMA IF NOT EXISTS storage;
-- 1. Create the storage bucket (idempotent)
INSERT INTO storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
VALUES (
        'product-media',
        'product-media',
        true,
        52428800,
        -- 50MB limit
        ARRAY ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
    ) ON CONFLICT (id) DO
UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
-- 2. Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Only" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Only" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Only" ON storage.objects;
-- 3. Allow public read access to all files in product-media bucket
CREATE POLICY "Public Read Access" ON storage.objects FOR
SELECT USING (bucket_id = 'product-media');
-- 4. Allow authenticated admin users to upload files
-- Validates user exists in admins table and is authenticated
CREATE POLICY "Admin Upload Only" ON storage.objects FOR
INSERT WITH CHECK (
        bucket_id = 'product-media'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1
            FROM public.admins
            WHERE id = auth.uid()
        )
    );
-- 5. Allow authenticated admin users to delete their uploaded files
CREATE POLICY "Admin Delete Only" ON storage.objects FOR DELETE USING (
    bucket_id = 'product-media'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1
        FROM public.admins
        WHERE id = auth.uid()
    )
);
-- 6. Allow authenticated admin users to update file metadata
CREATE POLICY "Admin Update Only" ON storage.objects FOR
UPDATE USING (
        bucket_id = 'product-media'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1
            FROM public.admins
            WHERE id = auth.uid()
        )
    ) WITH CHECK (
        bucket_id = 'product-media'
        AND auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1
            FROM public.admins
            WHERE id = auth.uid()
        )
    );
-- ==========================================
-- VERIFICATION
-- ==========================================
-- Verify bucket configuration
DO $$ BEGIN IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'product-media'
) THEN RAISE NOTICE 'Storage bucket "product-media" created successfully';
ELSE RAISE EXCEPTION 'Failed to create storage bucket "product-media"';
END IF;
END $$;