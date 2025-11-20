-- Migration: Create storage buckets and policies for wardrobe item images
-- Purpose: Configure Supabase Storage with non-public bucket and user-scoped access policies
-- Dependencies: Requires auth.users table (provided by Supabase Auth)
-- Idempotency: Safe to re-run; uses INSERT ON CONFLICT and DROP POLICY IF EXISTS

-- Create wardrobe items storage bucket
--
-- ENVIRONMENT STRATEGY: Separate Supabase Projects Per Environment
--
-- This project uses separate Supabase projects for each environment (local, dev, staging, production).
-- Each environment has its own isolated Supabase instance with independent databases, storage, and auth.
--
-- Bucket Naming Convention:
--   - Consistent bucket name 'wardrobe-items' is used across ALL environments
--   - No environment suffix needed (e.g., NOT wardrobe-items-dev, wardrobe-items-stage, etc.)
--   - Each Supabase project has its own 'wardrobe-items' bucket
--
-- Benefits of This Approach:
--   - Complete data isolation between environments (no risk of cross-environment access)
--   - Simpler migration code (no conditional logic or environment detection required)
--   - Independent scaling, backups, and disaster recovery per environment
--   - Consistent migration scripts applied identically to each environment
--   - Aligns with Supabase best practices for production deployments
--
-- Deployment Process:
--   1. Local: Apply migration via 'supabase db reset' or 'supabase db push'
--   2. Dev/Staging/Production: Apply migration via 'supabase db push --linked' to each project
--   3. Same migration file is applied to each Supabase project independently
--   4. No configuration changes needed between environments
--
-- Alternative Approach NOT Used:
--   - Single Supabase project with environment-specific bucket names (wardrobe-items-dev, etc.)
--   - Rejected due to lack of data isolation and increased complexity
--
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wardrobe-items',
  'wardrobe-items',
  false, -- Non-public bucket: images not accessible without authentication
  52428800, -- 50 MiB file size limit (50 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] -- Restrict to image types only
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object Key Pattern Documentation:
--
-- All wardrobe item images must follow this path structure:
--   user/{userId}/items/{itemId}/{variant}.{ext}
--
-- Where:
--   - {userId}  = UUID of the item owner (from auth.uid())
--   - {itemId}  = UUID of the wardrobe item (from items.id)
--   - {variant} = Image variant: 'original', 'clean', or 'thumb'
--   - {ext}     = File extension: 'jpg', 'png', 'webp', 'heic', etc.
--
-- Examples:
--   user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/original.jpg
--   user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/clean.webp
--   user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/thumb.jpg
--
-- Path Components (using storage.foldername() function):
--   [1] = 'user'           (enforces consistent path structure)
--   [2] = {userId}         (enforces user ownership)
--   [3] = 'items'          (resource type)
--   [4] = {itemId}         (specific item)
--   [5] = filename         (variant.ext)
--
-- Storage keys in items table (original_key, clean_key, thumb_key) must store full paths.

-- Enable Row Level Security on storage.objects
-- This is implicitly enabled by Supabase, but explicit for clarity
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own wardrobe images" ON storage.objects;

-- Storage Policy: Allow users to SELECT (view/download) their own wardrobe images
-- Users can generate signed URLs and download images from their own user folder
CREATE POLICY "Users can view their own wardrobe images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'wardrobe-items' AND
    (storage.foldername(name))[1] = 'user' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Storage Policy: Allow users to INSERT (upload) wardrobe images to their own folder
-- Prevents users from uploading to other users' folders
CREATE POLICY "Users can upload their own wardrobe images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'wardrobe-items' AND
    (storage.foldername(name))[1] = 'user' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Storage Policy: Allow users to UPDATE (replace) their own wardrobe images
-- Useful for re-uploading or replacing existing images
CREATE POLICY "Users can update their own wardrobe images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'wardrobe-items' AND
    (storage.foldername(name))[1] = 'user' AND
    (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'wardrobe-items' AND
    (storage.foldername(name))[1] = 'user' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Storage Policy: Allow users to DELETE their own wardrobe images
-- Enables cleanup when items are deleted
CREATE POLICY "Users can delete their own wardrobe images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'wardrobe-items' AND
    (storage.foldername(name))[1] = 'user' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Service Role and Edge Functions Access Pattern:
--
-- Edge Functions should use the same user impersonation pattern as table RLS:
--   1. Receive user JWT from client request
--   2. Create Supabase client with user's JWT (see items table migration for details)
--   3. Storage policies automatically enforce path matching with auth.uid()
--   4. Edge Functions can only access images belonging to the authenticated user
--
-- Signed URL Generation:
--   - Use supabase.storage.from('wardrobe-items').createSignedUrl(path, expiresIn)
--   - Signed URLs respect storage policies (user must own the path)
--   - Typically 1-hour expiry for temporary access
--   - Used for displaying images in UI without exposing permanent URLs
--
-- Service role (bypasses storage policies) should ONLY be used for:
--   - Administrative operations (bulk migrations, cleanup)
--   - System-level maintenance across all users
--   - Must be carefully audited and access-controlled
--
-- Security Features:
--   - Non-public bucket: No unauthenticated access
--   - Path enforcement: Users can only access user/{their-uid}/* paths
--   - No information leakage: Failed attempts return 403/404 without revealing object existence
--   - MIME type restrictions: Only image files can be uploaded
--   - File size limits: Maximum 50 MiB per file
--
-- Environment Configuration:
--
-- This migration creates a bucket named 'wardrobe-items' that will exist independently
-- in each Supabase project (local, dev, staging, production).
--
-- Environment Setup:
--   - Local:      Supabase project 'maidrobe-local' with 'wardrobe-items' bucket
--   - Dev:        Separate Supabase project with 'wardrobe-items' bucket
--   - Staging:    Separate Supabase project with 'wardrobe-items' bucket
--   - Production: Separate Supabase project with 'wardrobe-items' bucket
--
-- Each environment is completely isolated:
--   - No shared data between environments
--   - Each has independent auth.users tables
--   - Each has independent storage buckets
--   - Migrations applied separately to each project
--
-- Bucket Access:
--   - Mobile app connects to environment-specific Supabase URL
--   - App always references 'wardrobe-items' bucket (no environment logic)
--   - RLS policies enforce user isolation within each environment
--   - No code changes needed when deploying to different environments
--
-- Migration Deployment:
--   To apply this migration to a specific environment:
--   1. Link to the target Supabase project: supabase link --project-ref <project-id>
--   2. Push migrations: supabase db push --linked
--   3. Repeat for each environment (dev, staging, production)
--
-- This approach ensures maximum security, simplicity, and aligns with Supabase best practices.

-- Add documentation comment
COMMENT ON TABLE storage.buckets IS 'Storage buckets for Supabase Storage. The wardrobe-items bucket stores user wardrobe item images with strict access control.';
