# Wardrobe Items Data Model

Comprehensive reference for the wardrobe items data model, including database schema, storage configuration, security policies, and access patterns.

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Field Descriptions](#field-descriptions)
4. [Image Processing Status](#image-processing-status)
5. [Image Processing Job Queue](#image-processing-job-queue)
6. [Image Processing Edge Function](#image-processing-edge-function)
7. [Soft Delete Semantics](#soft-delete-semantics)
8. [Storage Configuration](#storage-configuration)
9. [Object Key Pattern](#object-key-pattern)
10. [Row Level Security](#row-level-security)
11. [Storage Policies](#storage-policies)
12. [Service Role and Edge Functions](#service-role-and-edge-functions)
13. [Signed URLs](#signed-urls)
14. [Code Examples](#code-examples)
15. [Usage by Feature Team](#usage-by-feature-team)
16. [Migration Reference](#migration-reference)

---

## Overview

The `public.items` table stores all wardrobe items with their metadata, image storage references, and processing status. This is the core data model for the Maidrobe digital closet feature.

**Target Audience:** Capture, Library, Outfit, and Wear History feature teams

**Key Features:**

- User-scoped items with strict RLS enforcement
- Soft delete support for data retention
- Image processing pipeline status tracking
- AI attribute detection status tracking
- Secure image storage with signed URL access

---

## Database Schema

**Table:** `public.items`

**Columns:**

```
Column                     | Type         | Nullable | Default           | Description
---------------------------|--------------|----------|-------------------|---------------------------
id                         | UUID         | NO       | (client-provided) | Primary key (UUIDv7)
user_id                    | UUID         | NO       | -                 | Owner (FK to auth.users)
name                       | TEXT         | YES      | NULL              | User-provided name
tags                       | TEXT[]       | YES      | NULL              | User-defined tags
type                       | TEXT         | YES      | NULL              | Item type (e.g. shirt)
colour                     | TEXT[]       | YES      | NULL              | Detected colours
pattern                    | TEXT         | YES      | NULL              | Pattern description
fabric                     | TEXT         | YES      | NULL              | Fabric type
season                     | TEXT[]       | YES      | NULL              | Suitable seasons
fit                        | TEXT         | YES      | NULL              | Fit description
original_key               | TEXT         | YES      | NULL              | Original image path
clean_key                  | TEXT         | YES      | NULL              | Cleaned image path
thumb_key                  | TEXT         | YES      | NULL              | Thumbnail image path
image_processing_status    | TEXT         | NO       | 'pending'         | Image pipeline status
attribute_status           | TEXT         | NO       | 'pending'         | AI detection status
created_at                 | TIMESTAMPTZ  | NO       | NOW()             | Creation timestamp
updated_at                 | TIMESTAMPTZ  | NO       | NOW()             | Last update (auto)
deleted_at                 | TIMESTAMPTZ  | YES      | NULL              | Soft delete timestamp
```

**Constraints:**

- Primary key: `id`
- Foreign key: `user_id` references `auth.users(id)` ON DELETE CASCADE
- Check: `image_processing_status IN ('pending', 'processing', 'succeeded', 'failed', 'skipped')`
- Check: `attribute_status IN ('pending', 'processing', 'succeeded', 'failed')`

**Indexes:**

- Primary key on `id` (implicit)
- `idx_items_user_id` on `user_id`
- `idx_items_user_id_created_at` on `(user_id, created_at DESC)`
- `idx_items_user_id_updated_at` on `(user_id, updated_at DESC)`
- `idx_items_image_processing_status` on `image_processing_status` (partial: pending/processing)
- `idx_items_attribute_status` on `attribute_status` (partial: pending/processing)

**Triggers:**

- `set_updated_at`: Automatically updates `updated_at` on any UPDATE

---

## Field Descriptions

### Core Identity

**`id`** (UUID)

- Unique identifier for the item
- Client-generated UUIDv7 (no server-side default)
- Must be provided by client on INSERT (see mobile/src/features/onboarding/api/useCreateFirstItem.ts)
- Time-ordered for better database index performance
- Used as foreign key target in outfits and wear_history tables

**`user_id`** (UUID)

- Owner of the item
- References `auth.users(id)` with CASCADE delete
- Enforced by RLS policies to match `auth.uid()`

### User Metadata

**`name`** (TEXT, nullable)

- User-provided name or label
- Example: "Blue Oxford Shirt", "Black Jeans"
- Can be edited by user

**`tags`** (TEXT[], nullable)

- User-defined tags for organization
- Example: `['casual', 'work', 'favorite']`
- NULL means no tags set, empty array `{}` means explicitly no tags

### AI-Detected Attributes

**`type`** (TEXT, nullable)

- Item category detected by AI or set by user
- Examples: 'shirt', 'pants', 'dress', 'jacket', 'shoes'

**`colour`** (TEXT[], nullable)

- Detected or user-specified colours
- Array supports multi-colour items
- Examples: `['blue']`, `['blue', 'white', 'striped']`

**`pattern`** (TEXT, nullable)

- Pattern description
- Examples: 'solid', 'striped', 'floral', 'checked'

**`fabric`** (TEXT, nullable)

- Fabric type
- Examples: 'cotton', 'wool', 'polyester', 'denim'

**`season`** (TEXT[], nullable)

- Suitable seasons
- Examples: `['summer']`, `['spring', 'fall']`, `['all-season']`

**`fit`** (TEXT, nullable)

- Fit description
- Examples: 'slim', 'regular', 'loose', 'oversized'

### Image Storage References

**`original_key`** (TEXT, nullable)

- Full path to original uploaded image in Supabase Storage
- Example: `user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/original.jpg`
- Initially NULL until upload completes

**`clean_key`** (TEXT, nullable)

- Full path to background-removed/cleaned image
- Generated by background processing pipeline
- NULL until processing succeeds

**`thumb_key`** (TEXT, nullable)

- Full path to thumbnail image
- Generated by background processing pipeline
- Used for grid views and lists
- NULL until processing succeeds

### Processing Status

**`image_processing_status`** (TEXT, NOT NULL, default: 'pending')

- Status of background removal and thumbnail generation
- See [Image Processing Status](#image-processing-status) section

**`attribute_status`** (TEXT, NOT NULL, default: 'pending')

- Status of AI attribute detection
- See [Image Processing Status](#image-processing-status) section

### Timestamps

**`created_at`** (TIMESTAMPTZ, NOT NULL, default: NOW())

- When the item was created
- Set automatically on INSERT
- Stored in UTC

**`updated_at`** (TIMESTAMPTZ, NOT NULL, default: NOW())

- When the item was last updated
- Auto-updated by trigger on any UPDATE
- Stored in UTC

**`deleted_at`** (TIMESTAMPTZ, nullable)

- When the item was soft-deleted
- NULL = active item
- Non-NULL = soft-deleted item
- See [Soft Delete Semantics](#soft-delete-semantics) section

---

## Image Processing Status

The `image_processing_status` field tracks the lifecycle of background removal and thumbnail generation.
The `attribute_status` field tracks AI attribute detection and uses a similar state machine (without `skipped`).

**Status Values for `image_processing_status`:**

1. **`pending`** (default)
   - Initial state after item creation with non-null `original_key`
   - Item is queued for background processing
   - Consumers should show placeholder or original image
   - Item is still fully usable

2. **`processing`**
   - Background job is actively processing
   - Short-lived state (seconds to minutes)
   - Consumers should show loading indicator

3. **`succeeded`**
   - Processing completed successfully
   - `clean_key` and `thumb_key` are available
   - Consumers should use processed results

4. **`failed`**
   - Processing failed after retries or due to non-recoverable error
   - Item remains valid and usable
   - Consumers should fall back to original image
   - Can be retried by setting status back to `pending`

5. **`skipped`** (image processing only)
   - Processing is intentionally not run for this item
   - Used for special imports or admin overrides
   - Item remains valid and usable with original image only
   - Will not be picked up by background processing jobs

**Status Values for `attribute_status`:**

Uses the same state machine as above, except without the `skipped` status:
`pending` → `processing` → `succeeded` | `failed`

**Important Notes:**

- Items with `pending`, `failed`, or `skipped` status are valid and usable
- UI should gracefully handle missing `clean_key` and `thumb_key`
- Attribute detection failure doesn't prevent item usage
- Background jobs poll for `pending` and `failed` items to process
- Items with `skipped` status will not be automatically processed

---

## Image Processing Job Queue

The image processing pipeline uses a database-backed job queue to ensure reliable, asynchronous processing.

### Architecture Overview

```
┌─────────────┐     ┌─────────────────────┐     ┌───────────────────────────┐
│   Client    │────▶│   items table       │────▶│  image_processing_jobs    │
│  (insert/   │     │  (trigger fires)    │     │  (job enqueued)           │
│   update)   │     └─────────────────────┘     └───────────────────────────┘
└─────────────┘                                             │
                                                            ▼
                                        ┌───────────────────────────────────┐
                                        │  Edge Function Worker             │
                                        │  (polls for pending jobs)         │
                                        └───────────────────────────────────┘
```

### Job Queue Table

**Table:** `public.image_processing_jobs`

**Columns:**

```
Column          | Type         | Nullable | Default   | Description
----------------|--------------|----------|-----------|---------------------------
id              | BIGSERIAL    | NO       | auto      | Primary key (FIFO ordering)
item_id         | UUID         | NO       | -         | FK to items(id)
original_key    | TEXT         | NO       | -         | Storage key being processed
status          | TEXT         | NO       | 'pending' | Job status
attempt_count   | INTEGER      | NO       | 0         | Number of attempts made
max_attempts    | INTEGER      | NO       | 3         | Max attempts before failure
last_error      | TEXT         | YES      | NULL      | Error from last attempt
created_at      | TIMESTAMPTZ  | NO       | NOW()     | When job was enqueued
updated_at      | TIMESTAMPTZ  | NO       | NOW()     | Last update (auto)
started_at      | TIMESTAMPTZ  | YES      | NULL      | When worker started
completed_at    | TIMESTAMPTZ  | YES      | NULL      | When job completed
```

**Constraints:**

- Primary key: `id`
- Foreign key: `item_id` references `items(id)` ON DELETE CASCADE
- Unique: `(item_id, original_key)` - ensures idempotency
- Check: `status IN ('pending', 'processing', 'completed', 'failed')`

### Job Status Values

1. **`pending`** (default)
   - Job is waiting to be picked up by a worker
   - Inserted by database trigger

2. **`processing`**
   - Worker has claimed the job
   - `started_at` is set
   - `attempt_count` is incremented

3. **`completed`**
   - Processing finished successfully
   - `completed_at` is set
   - Item's `image_processing_status` set to `succeeded`

4. **`failed`**
   - Processing failed after max attempts
   - `completed_at` is set
   - `last_error` contains error message
   - Item's `image_processing_status` set to `failed`

### Database Triggers

Jobs are automatically enqueued by database triggers when items become eligible:

**Eligibility Criteria:**

- `original_key IS NOT NULL` (image has been uploaded)
- `image_processing_status = 'pending'` (awaiting processing)

**Trigger Events:**

1. **INSERT** - New item created with image and pending status
2. **UPDATE** - Item's `original_key` changed (new image uploaded)
3. **UPDATE** - Item's `image_processing_status` reset to `pending`

**Idempotency:**

The unique constraint on `(item_id, original_key)` combined with `ON CONFLICT DO NOTHING` ensures:

- Duplicate enqueue attempts are silently ignored
- Only one job exists per item/image combination
- Safe to retry or re-trigger without side effects

### RLS Policies

**SELECT Policy:** Users can view jobs for their own items

```sql
USING (
  EXISTS (
    SELECT 1 FROM items
    WHERE items.id = image_processing_jobs.item_id
      AND items.user_id = auth.uid()
  )
)
```

**No INSERT/UPDATE/DELETE for users** - Jobs are managed by:

- Database triggers (job creation)
- Edge Functions with service role (job updates)

---

## Image Processing Edge Function

The `process-item-image` Edge Function handles background removal and thumbnail generation.

### Endpoint

```
POST /functions/v1/process-item-image
```

### Invocation Modes

**Direct Mode** - Process a specific item:

```json
{
  "itemId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Queue Mode** - Poll and process pending jobs:

```json
{
  "batchSize": 10
}
```

Or with empty body `{}` to use default batch size (10).

### Processing Pipeline

1. **Validate Item** - Fetch item, verify `original_key` exists
2. **Check Eligibility** - Status must be `pending` or `failed`
3. **Claim Job** - Atomically set `image_processing_status = 'processing'`
4. **Download Original** - Fetch from Storage using service role
5. **Background Removal** - Call Replicate API over TLS
6. **Generate Thumbnail** - Create 200x200 version
7. **Upload Results** - Save `clean.jpg` and `thumb.jpg` to deterministic paths
8. **Update Item** - Set `clean_key`, `thumb_key`, `image_processing_status = 'succeeded'`

### Storage Paths

Output images use deterministic paths:

```
user/{userId}/items/{itemId}/clean.jpg   # Background-removed image
user/{userId}/items/{itemId}/thumb.jpg   # 200x200 thumbnail
```

### Response Format

**Success:**

```json
{
  "success": true,
  "processed": 1,
  "failed": 0,
  "results": [{ "itemId": "...", "success": true }]
}
```

**Partial Failure (batch mode):**

```json
{
  "success": true,
  "processed": 8,
  "failed": 2,
  "results": [
    { "itemId": "...", "success": true },
    { "itemId": "...", "success": false, "error": "..." }
  ]
}
```

### Environment Variables

| Variable                      | Required | Default              | Description                     |
| ----------------------------- | -------- | -------------------- | ------------------------------- |
| `SUPABASE_URL`                | Yes      | -                    | Supabase project URL            |
| `SUPABASE_SERVICE_ROLE_KEY`   | Yes      | -                    | Service role key (bypasses RLS) |
| `REPLICATE_API_KEY`           | Yes      | -                    | Replicate API key               |
| `REPLICATE_MODEL_VERSION`     | No       | cjwbw/rembg:fb8af... | Background removal model        |
| `IMAGE_PROCESSING_TIMEOUT_MS` | No       | 120000               | API timeout in milliseconds     |
| `THUMBNAIL_SIZE`              | No       | 200                  | Thumbnail dimension (pixels)    |
| `CLEAN_IMAGE_MAX_DIMENSION`   | No       | 1600                 | Clean image max edge (pixels)   |

### Idempotency

The function is safe to retry:

- Re-validates item state before processing
- Uses deterministic storage paths (uploads with `upsert: true`)
- Job queue has `UNIQUE(item_id, original_key)` constraint
- Same item can be reprocessed if status reset to `pending`

### Error Handling

- **Transient failures**: Job status reset to `pending`, `attempt_count` incremented
- **Permanent failures**: After `max_attempts` (3), job and item marked as `failed`
- **Item updates**: Status reverts to `failed` if any pipeline step fails

### Scheduled Invocation

For production, configure a scheduled task (e.g., cron job, pg_cron, or external scheduler) to invoke the function periodically:

```bash
# Example: Process queue every minute
curl -X POST https://your-project.supabase.co/functions/v1/process-item-image \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 10}'
```

---

## Soft Delete Semantics

Wardrobe items use soft delete to preserve data integrity and support potential undo operations.

### How It Works

**Active Items:**

- `deleted_at IS NULL`
- Returned by normal SELECT queries (filtered by RLS)
- Visible in UI (library, outfits, wear history)

**Soft-Deleted Items:**

- `deleted_at IS NOT NULL` (timestamp when deleted)
- NOT returned by normal SELECT queries (filtered by RLS)
- Not visible in UI
- Still exist in database
- Can be referenced by historical outfits/wear records

### Implementation

**To soft-delete an item:**

```sql
UPDATE items SET deleted_at = NOW() WHERE id = ? AND user_id = auth.uid();
```

**To restore a soft-deleted item (if UI supports):**

```sql
UPDATE items SET deleted_at = NULL WHERE id = ? AND user_id = auth.uid();
```

**RLS automatically filters soft-deleted items from SELECT:**

- User queries only see items where `deleted_at IS NULL`
- No additional filtering needed in application code

### Hard Delete

Physical deletion from database is reserved for:

- Account deletion (cascade from `auth.users`)
- Periodic cleanup jobs (e.g., items deleted >30 days ago)
- Administrative operations

Hard delete is NOT exposed to end users directly.

---

## Storage Configuration

### Bucket Configuration

**Bucket Name:** `wardrobe-items`

**Environment Strategy:**

This project uses separate Supabase projects for each environment. Each environment has its own isolated Supabase instance with the same bucket name:

- **Local:** `wardrobe-items` (in maidrobe-local project)
- **Dev:** `wardrobe-items` (in separate dev project)
- **Staging:** `wardrobe-items` (in separate staging project)
- **Production:** `wardrobe-items` (in separate production project)

No environment-specific bucket naming is used. Complete data isolation is achieved through separate Supabase projects, not bucket names.

**Bucket Properties:**

- **Public:** `false` (not publicly accessible)
- **File Size Limit:** 50 MiB (52,428,800 bytes)
- **Allowed MIME Types:**
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/heic`
  - `image/heif`

---

## Object Key Pattern

All wardrobe item images follow a strict path structure:

### Pattern

```
user/{userId}/items/{itemId}/{variant}.{ext}
```

### Components

- **`{userId}`** - UUID of the item owner (from `auth.uid()`)
- **`{itemId}`** - UUID of the wardrobe item (from `items.id`)
- **`{variant}`** - Image variant: `original`, `clean`, or `thumb`
- **`{ext}`** - File extension: `jpg`, `png`, `webp`, `heic`, etc.

### Examples

```
user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/original.jpg
user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/clean.webp
user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/thumb.jpg
```

### Path Enforcement

Storage policies enforce this structure using `storage.foldername()`:

- Component [1] must be `'user'`
- Component [2] must be `auth.uid()::text`
- Prevents users from accessing other users' images
- Prevents using incorrect path patterns

### Storage in Database

The full object key (path) is stored in the items table:

- `original_key` = full path to original image
- `clean_key` = full path to cleaned image
- `thumb_key` = full path to thumbnail image

---

## Row Level Security

RLS is enabled on `public.items` with four policies:

### SELECT Policy: "Users can view their own items"

```sql
FOR SELECT TO authenticated
USING (auth.uid() = user_id AND deleted_at IS NULL)
```

- Users can only SELECT their own items
- Soft-deleted items automatically filtered out
- Anonymous users cannot SELECT

### INSERT Policy: "Users can insert their own items"

```sql
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id)
```

- Users can only INSERT items with their own `user_id`
- Prevents creating items for other users

### UPDATE Policy: "Users can update their own items"

```sql
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```

- Users can only UPDATE their own items
- Prevents changing `user_id` to another user

### DELETE Policy: "Users can delete their own items"

```sql
FOR DELETE TO authenticated
USING (auth.uid() = user_id)
```

- Users can only DELETE their own items
- Note: Soft delete (UPDATE `deleted_at`) is preferred

### Anonymous Access

Anonymous (unauthenticated) users have NO access to items table. All policies require `authenticated` role.

---

## Storage Policies

RLS is enabled on `storage.objects` with four policies for the `wardrobe-items` bucket:

### SELECT Policy: "Users can view their own wardrobe images"

```sql
FOR SELECT TO authenticated
USING (
  bucket_id = 'wardrobe-items' AND
  (storage.foldername(name))[1] = 'user' AND
  (storage.foldername(name))[2] = auth.uid()::text
)
```

- Users can view/download images from their own folder
- Enables signed URL generation

### INSERT Policy: "Users can upload their own wardrobe images"

```sql
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wardrobe-items' AND
  (storage.foldername(name))[1] = 'user' AND
  (storage.foldername(name))[2] = auth.uid()::text
)
```

- Users can upload to their own folder only
- Prevents uploading to other users' folders

### UPDATE Policy: "Users can update their own wardrobe images"

```sql
FOR UPDATE TO authenticated
USING (...) WITH CHECK (...)
```

- Users can replace their own images
- Both USING and WITH CHECK enforce ownership

### DELETE Policy: "Users can delete their own wardrobe images"

```sql
FOR DELETE TO authenticated
USING (
  bucket_id = 'wardrobe-items' AND
  (storage.foldername(name))[1] = 'user' AND
  (storage.foldername(name))[2] = auth.uid()::text
)
```

- Users can delete their own images
- Used during item cleanup

---

## Service Role and Edge Functions

### User Impersonation Pattern (Recommended)

Edge Functions should authenticate as the user they're acting on behalf of:

**Step 1:** Receive user JWT from client request

```typescript
const authHeader = req.headers.get('Authorization');
const userJwt = authHeader?.replace('Bearer ', '');
```

**Step 2:** Create Supabase client with user's JWT

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  global: {
    headers: { Authorization: `Bearer ${userJwt}` },
  },
});
```

**Step 3:** RLS policies automatically enforce user boundaries

```typescript
// This query automatically filters to user's items
const { data, error } = await supabase
  .from('items')
  .select('*')
  .order('created_at', { ascending: false });
```

**Step 4:** Storage operations respect user's permissions

```typescript
// This respects storage policies
const { data: signedUrl } = await supabase.storage
  .from('wardrobe-items')
  .createSignedUrl(imagePath, 3600);
```

### Service Role (Admin Only)

The service role bypasses ALL RLS policies. Use ONLY for:

- Administrative operations (bulk migrations, system maintenance)
- Cross-user analytics or reporting
- Scheduled cleanup jobs operating on all users

**Security Requirements:**

- Never expose service role key to clients
- Carefully audit and log all service role operations
- Restrict to trusted server-side code only
- Document clear justification for each use case

---

## Signed URLs

Signed URLs provide temporary authenticated access to images without exposing permanent URLs.

### Generate Signed URL

```typescript
const { data, error } = await supabase.storage
  .from('wardrobe-items')
  .createSignedUrl(imagePath, expiresIn);

// Example:
const imagePath =
  'user/550e8400-e29b-41d4-a716-446655440000/items/123e4567-e89b-12d3-a456-426614174000/thumb.jpg';
const { data } = await supabase.storage.from('wardrobe-items').createSignedUrl(imagePath, 3600); // 1 hour

const signedUrl = data?.signedUrl;
```

### Parameters

- **`path`**: Full object key from `original_key`, `clean_key`, or `thumb_key`
- **`expiresIn`**: Expiry in seconds (recommended: 3600 = 1 hour)

### Security

- Signed URLs automatically respect storage policies
- User must own the path to generate signed URL
- Expired URLs return 403 error
- Use for displaying images in UI
- Regenerate as needed (low cost)

### Usage in UI

```typescript
// Load item with images
const { data: item } = await supabase
  .from('items')
  .select('*')
  .eq('id', itemId)
  .single();

// Generate signed URL for thumbnail
const { data } = await supabase.storage
  .from('wardrobe-items')
  .createSignedUrl(item.thumb_key, 3600);

// Display image
<Image source={{ uri: data.signedUrl }} />
```

---

## Code Examples

### Create New Item

```typescript
// 1. Generate UUIDv7 for the item
// Note: Use a proper UUIDv7 library (e.g., 'uuidv7' package)
// Example placeholder - replace with actual implementation
const itemId = generateUUIDv7(); // Must be time-ordered UUIDv7

// 2. Create item record (without images)
const { data: item, error } = await supabase
  .from('items')
  .insert({
    id: itemId, // Required: client-generated UUIDv7
    user_id: userId, // Will be enforced by RLS
    name: 'Blue Shirt',
    tags: ['casual', 'work'],
  })
  .select()
  .single();

// 3. Upload original image
const imagePath = `user/${userId}/items/${itemId}/original.jpg`;
const { error: uploadError } = await supabase.storage
  .from('wardrobe-items')
  .upload(imagePath, imageFile);

// 4. Update item with image path
await supabase.from('items').update({ original_key: imagePath }).eq('id', itemId);
```

### Query User's Items

```typescript
// Get all active items for current user
const { data: items } = await supabase
  .from('items')
  .select('*')
  .order('created_at', { ascending: false });
// RLS automatically filters to user's items and excludes deleted

// Get items with specific tag
const { data: casualItems } = await supabase.from('items').select('*').contains('tags', ['casual']);

// Get items pending image processing
const { data: pendingItems } = await supabase
  .from('items')
  .select('*')
  .eq('image_processing_status', 'pending');
```

### Soft Delete Item

```typescript
const { error } = await supabase
  .from('items')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', itemId);
// RLS ensures user can only delete their own items
```

### Display Item with Images

```typescript
// Fetch item
const { data: item } = await supabase.from('items').select('*').eq('id', itemId).single();

// Generate signed URL for display
const getImageUrl = async (key: string | null) => {
  if (!key) return null;

  const { data } = await supabase.storage.from('wardrobe-items').createSignedUrl(key, 3600);

  return data?.signedUrl;
};

// Use thumb for list, clean for detail, original as fallback
const thumbUrl = await getImageUrl(item.thumb_key);
const displayUrl = thumbUrl || (await getImageUrl(item.original_key));
```

---

## Usage by Feature Team

### Capture Team

**Responsibilities:**

- Create new item records
- Upload original images to storage
- Update `original_key` after upload
- Handle upload failures gracefully

**Key Operations:**

- `INSERT INTO items` (name, tags optional initially)
- `storage.upload()` to `user/{userId}/items/{itemId}/original.{ext}`
- `UPDATE items SET original_key = ?`

**Notes:**

- Item is valid even without images
- Background processing will populate `clean_key` and `thumb_key`
- Check `image_processing_status` for pipeline progress

### Library Team

**Responsibilities:**

- Display grid of user's items
- Filter and search items
- Show item details
- Handle soft delete

**Key Operations:**

- `SELECT * FROM items` (RLS filters to user, excludes deleted)
- Generate signed URLs for thumbnails
- Filter by tags, type, season, etc.
- Sort by `created_at` or `updated_at`

**Notes:**

- Use `thumb_key` for grid views (fallback to `original_key`)
- Handle missing `clean_key`/`thumb_key` gracefully
- Respect `image_processing_status` for loading states

### Outfit Team

**Responsibilities:**

- Reference items in outfit combinations
- Display outfit items
- Validate item availability

**Key Operations:**

- `SELECT * FROM items WHERE id IN (?)` (for outfit items)
- Check `deleted_at IS NULL` for availability
- Generate signed URLs for outfit visualization

**Notes:**

- Items table is source of truth for item metadata
- Soft-deleted items should not be used in new outfits
- Historical outfits may reference deleted items (show as unavailable)

### Wear History Team

**Responsibilities:**

- Record when items are worn
- Display wear history
- Calculate no-repeat windows

**Key Operations:**

- Reference `item_id` in wear_history table
- `SELECT * FROM items WHERE id IN (?)` (for worn items)
- Check item availability for suggestions

**Notes:**

- Wear history should persist even if item soft-deleted
- Display deleted items differently in history
- Use for outfit suggestion constraints

---

## Migration Reference

The items data model is defined in the following migrations:

**Table and RLS:**

- `20241120000001_create_items_table.sql`
  - Creates `public.items` table
  - Adds indexes
  - Enables RLS with 4 policies
  - Creates `updated_at` trigger

**Storage and Policies:**

- `20241120000002_create_storage_buckets.sql`
  - Creates `wardrobe-items` bucket
  - Configures file size and MIME type restrictions
  - Enables RLS on `storage.objects`
  - Creates 4 storage policies

**Image Processing Status Enhancement:**

- `20241127000001_add_skipped_image_processing_status.sql`
  - Adds `skipped` value to `image_processing_status` CHECK constraint
  - Enables intentional bypassing of processing for special imports

**Image Processing Job Queue:**

- `20241127000002_create_image_processing_jobs_table.sql`
  - Creates `public.image_processing_jobs` table
  - Adds indexes for efficient job polling
  - Enables RLS with SELECT policy for users
  - Creates `updated_at` trigger

- `20241127000003_create_image_processing_trigger.sql`
  - Creates `enqueue_image_processing_job()` trigger function
  - Creates triggers on `public.items` for INSERT and UPDATE
  - Implements idempotent job enqueueing

**Location:**
`edge-functions/supabase/migrations/`

**Documentation:**
See `edge-functions/supabase/migrations/README.md` for migration details and how to apply.

---

## Additional Resources

- **Migrations README:** `edge-functions/supabase/migrations/README.md`
- **Code Guidelines:** `code-guidelines.md` (in project files)
- **ADRs:** `docs/adr/`
- **Supabase Docs:** https://supabase.com/docs

---

**Last Updated:** 2024-11-27
**Maintained By:** Backend team
**Questions:** See migrations or ask in #backend channel
