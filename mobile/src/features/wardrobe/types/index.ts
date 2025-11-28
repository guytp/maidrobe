/**
 * Wardrobe feature type definitions.
 *
 * This module defines types for the wardrobe grid display, item detail view,
 * pagination, search, and related functionality. Types are designed to support:
 * - Minimal data projection for grid performance
 * - Full data projection for item detail view
 * - Image fallback chain (thumb_key → clean_key → original_key)
 * - Infinite scroll pagination
 * - Backend-powered search with ILIKE filters
 *
 * @module features/wardrobe/types
 */

/**
 * Processing status for AI attribute detection.
 *
 * Tracks the lifecycle of AI attribute extraction for wardrobe items:
 * - pending: Waiting to be processed
 * - processing: Currently being analyzed by AI
 * - succeeded: AI attributes successfully extracted
 * - failed: AI processing failed (attributes may be partial or missing)
 */
export type AttributeStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

/**
 * Processing status for image background removal and thumbnail generation.
 *
 * Tracks the lifecycle of image processing for wardrobe items:
 * - pending: Item has non-null original_key and is waiting to be processed
 * - processing: Background removal and thumbnail generation is in progress
 * - succeeded: Processing completed successfully, clean_key/thumb_key are populated
 * - failed: Processing failed after retries or due to non-recoverable error
 * - skipped: Processing is intentionally not run (special imports, admin override)
 */
export type ImageProcessingStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped';

/**
 * Minimal projection of a wardrobe item for grid display.
 *
 * Contains only the fields needed for the wardrobe grid to minimize
 * payload size and improve performance. Uses snake_case to match
 * Supabase column names directly.
 *
 * Image fallback order per AC12:
 * 1. thumb_key - Optimized thumbnail (~200x200)
 * 2. clean_key - Background-removed version
 * 3. original_key - Original uploaded image
 * 4. Neutral placeholder if all fail
 */
export interface WardrobeGridItem {
  /** Unique item identifier (UUIDv7) */
  id: string;

  /** User who owns this item (UUID foreign key to auth.users) */
  user_id: string;

  /** Optional user-provided name/label for the item */
  name: string | null;

  /** Optional user-provided tags (lowercased, max 20 tags, 30 chars each) */
  tags: string[] | null;

  /** Storage key for thumbnail image (preferred, ~200x200) */
  thumb_key: string | null;

  /** Storage key for background-removed image (fallback 1) */
  clean_key: string | null;

  /** Storage key for original uploaded image (fallback 2) */
  original_key: string | null;

  /** Item creation timestamp (ISO 8601, UTC) */
  created_at: string;
}

/**
 * Supabase projection string for wardrobe grid queries.
 *
 * Projects only the fields needed for grid display to minimize
 * payload size. Use with supabase.from('items').select(GRID_PROJECTION).
 */
export const WARDROBE_GRID_PROJECTION =
  'id, user_id, name, tags, thumb_key, clean_key, original_key, created_at' as const;

/**
 * Error reason codes for failed AI attribute detection.
 *
 * Used when attribute_status is 'failed' to categorize the failure:
 * - timeout: Model call exceeded 15-second timeout
 * - invalid_json: Model response was malformed or failed validation
 * - missing_image: No valid image key (clean_key or original_key) available
 * - rate_limited: Provider returned 429 rate limit error
 * - config_error: Missing API key, invalid endpoint, or misconfiguration
 */
export type AttributeErrorReason =
  | 'timeout'
  | 'invalid_json'
  | 'missing_image'
  | 'rate_limited'
  | 'config_error';

/**
 * Full projection of a wardrobe item for detail view.
 *
 * Contains all fields needed to display the item detail screen including:
 * - Core fields (id, user_id, name, tags)
 * - AI-detected attributes (type, colour, pattern, fabric, season, fit)
 * - AI detection status and error tracking
 * - Image storage keys for fallback chain
 * - Timestamps and processing status
 *
 * Uses snake_case to match Supabase column names directly.
 */
export interface ItemDetail {
  /** Unique item identifier (UUIDv7) */
  id: string;

  /** User who owns this item (UUID foreign key to auth.users) */
  user_id: string;

  /** Optional user-provided name/label for the item */
  name: string | null;

  /** Optional user-provided tags (lowercased, max 20 tags, 30 chars each) */
  tags: string[] | null;

  /** AI-detected item type (e.g., shirt, pants, dress) */
  type: string | null;

  /** AI-detected colours (array allows multi-colour items) */
  colour: string[] | null;

  /** AI-detected pattern (e.g., striped, solid, floral) */
  pattern: string | null;

  /** AI-detected fabric type (e.g., cotton, wool, polyester) */
  fabric: string | null;

  /** AI-detected suitable seasons (array allows multi-season items) */
  season: string[] | null;

  /** AI-detected fit description (e.g., slim, regular, loose) */
  fit: string | null;

  /** Storage key for thumbnail image (preferred, ~200x200) */
  thumb_key: string | null;

  /** Storage key for background-removed image (fallback 1) */
  clean_key: string | null;

  /** Storage key for original uploaded image (fallback 2) */
  original_key: string | null;

  /** Item creation timestamp (ISO 8601, UTC) */
  created_at: string;

  /** Item last update timestamp (ISO 8601, UTC) */
  updated_at: string;

  /** Status of background removal and thumbnail generation */
  image_processing_status: ImageProcessingStatus;

  /** Status of AI attribute detection */
  attribute_status: AttributeStatus;

  /** Timestamp of last AI attribute detection attempt (ISO 8601, UTC). NULL if never run. */
  attribute_last_run_at: string | null;

  /** Error reason code when attribute_status is 'failed'. NULL otherwise. */
  attribute_error_reason: AttributeErrorReason | null;
}

/**
 * Supabase projection string for item detail queries.
 *
 * Projects all fields needed for the item detail screen including
 * AI attributes, processing status, and detection tracking fields. Use with:
 * supabase.from('items').select(ITEM_DETAIL_PROJECTION).eq('id', itemId)
 */
export const ITEM_DETAIL_PROJECTION =
  'id, user_id, name, tags, type, colour, pattern, fabric, season, fit, thumb_key, clean_key, original_key, image_processing_status, created_at, updated_at, attribute_status, attribute_last_run_at, attribute_error_reason' as const;

/**
 * Parameters for fetching wardrobe items with pagination and search.
 */
export interface FetchWardrobeItemsParams {
  /** User ID to filter items (required for RLS compliance) */
  userId: string;

  /** Number of items to fetch per page (default: 20) */
  pageSize?: number;

  /** Offset for pagination (cursor-based alternative available) */
  offset?: number;

  /**
   * Optional search query for filtering items.
   * Filters by name and tags using case-insensitive ILIKE.
   */
  searchQuery?: string;
}

/**
 * Response from wardrobe items fetch operation.
 */
export interface FetchWardrobeItemsResponse {
  /** Array of wardrobe items for the current page */
  items: WardrobeGridItem[];

  /** Total count of items matching the query (for pagination) */
  total: number;

  /** Whether there are more items to load */
  hasMore: boolean;
}

/**
 * State shape for wardrobe screen UI persistence.
 *
 * Used to preserve scroll position and search query across
 * navigation to Item Detail and back.
 */
export interface WardrobeScreenState {
  /** Current search query (empty string = no filter) */
  searchQuery: string;

  /** Scroll offset to restore on navigation back */
  scrollOffset: number;
}

/**
 * Default page size for wardrobe grid pagination.
 *
 * Balances responsiveness and network usage per AC10.
 * Tuned to show ~3-4 screens worth of content per fetch.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Minimum card width in pixels for grid column calculation.
 *
 * Used to determine number of columns based on available width:
 * - 2 columns on phones (~160px cards)
 * - 3 columns on tablets (~160px cards)
 */
export const MIN_CARD_WIDTH = 150;

/**
 * Grid gap between items in pixels.
 *
 * Uses spacing.sm (8px) from design tokens for consistency.
 */
export const GRID_GAP = 8;

/**
 * Search debounce delay in milliseconds.
 *
 * Per AC11: ~300ms debounce to avoid request per keystroke.
 */
export const SEARCH_DEBOUNCE_MS = 300;

// ============================================================================
// Batch Item Types (Story #363)
// ============================================================================

/**
 * Minimal projection of a wardrobe item for batch resolution.
 *
 * Contains only the fields needed for outfit suggestion item chips:
 * - Core identification (id, user_id)
 * - Display fields (name, thumbnails)
 * - Accessibility fields (type, colour)
 *
 * This projection is optimised for the outfit recommendation flow where
 * we need to resolve multiple item IDs efficiently without fetching
 * full item details.
 *
 * Uses snake_case to match Supabase column names directly.
 */
export interface BatchWardrobeItem {
  /** Unique item identifier (UUIDv7) */
  id: string;

  /** User who owns this item (UUID foreign key to auth.users) */
  user_id: string;

  /** Optional user-provided name/label for the item */
  name: string | null;

  /** Storage key for thumbnail image (preferred, ~200x200) */
  thumb_key: string | null;

  /** Storage key for background-removed image (fallback 1) */
  clean_key: string | null;

  /** Storage key for original uploaded image (fallback 2) */
  original_key: string | null;

  /** AI-detected item type (e.g., shirt, pants, dress) - for accessibility */
  type: string | null;

  /** AI-detected colours (array allows multi-colour items) - for accessibility */
  colour: string[] | null;
}

/**
 * Supabase projection string for batch item queries.
 *
 * Projects only the fields needed for outfit suggestion item chips.
 * Optimised for minimal payload size while including all fields
 * required for display names, thumbnails, and accessibility labels.
 *
 * Use with: supabase.from('items').select(BATCH_ITEM_PROJECTION).in('id', itemIds)
 */
export const BATCH_ITEM_PROJECTION =
  'id, user_id, name, thumb_key, clean_key, original_key, type, colour' as const;

/**
 * Parameters for batch fetching wardrobe items by ID.
 */
export interface FetchBatchItemsParams {
  /** User ID for RLS compliance (must match authenticated user) */
  userId: string;

  /** Array of item IDs to fetch (should be de-duplicated) */
  itemIds: string[];
}

/**
 * Response from batch wardrobe items fetch operation.
 */
export interface FetchBatchItemsResponse {
  /** Map of item ID to item data for successfully fetched items */
  items: Map<string, BatchWardrobeItem>;

  /** Array of item IDs that were requested but not found */
  missingIds: string[];
}
