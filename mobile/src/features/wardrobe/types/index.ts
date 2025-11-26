/**
 * Wardrobe feature type definitions.
 *
 * This module defines types for the wardrobe grid display, pagination,
 * search, and related functionality. Types are designed to support:
 * - Minimal data projection for grid performance
 * - Image fallback chain (thumb_key → clean_key → original_key)
 * - Infinite scroll pagination
 * - Backend-powered search with ILIKE filters
 *
 * @module features/wardrobe/types
 */

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
