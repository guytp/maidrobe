/**
 * Utility functions for grouping wear events by date.
 *
 * Provides date grouping and label formatting for the wear history list,
 * using device locale for internationalization.
 *
 * @module features/wearHistory/utils/groupWearEventsByDate
 */

import { t } from '../../../core/i18n';
import type { WearHistoryRow } from '../types';

/**
 * Section data structure for SectionList.
 *
 * Each section represents a single date with all wear events from that day.
 */
export interface WearHistorySection {
  /**
   * Display title for the section header.
   * Can be "Today", "Yesterday", or a formatted date like "Mon, Dec 2".
   */
  title: string;

  /**
   * The date key in YYYY-MM-DD format.
   * Used for key extraction and debugging.
   */
  dateKey: string;

  /**
   * Array of wear events for this date.
   * Preserves the server-side ordering (worn_at DESC within each date).
   */
  data: WearHistoryRow[];
}

/**
 * Gets today's date string in YYYY-MM-DD format.
 *
 * @returns Date string for today in local timezone
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets yesterday's date string in YYYY-MM-DD format.
 *
 * @returns Date string for yesterday in local timezone
 */
function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string into a user-friendly label.
 *
 * Returns:
 * - "Today" for today's date
 * - "Yesterday" for yesterday's date
 * - Locale-formatted date for older dates (e.g., "Mon, Dec 2" or "Mon, Dec 2, 2023" if different year)
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Formatted date label
 */
export function formatDateLabel(dateString: string): string {
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  if (dateString === today) {
    return t('screens.history.dateLabels.today');
  }

  if (dateString === yesterday) {
    return t('screens.history.dateLabels.yesterday');
  }

  // Parse the date string - add T00:00:00 to avoid timezone issues
  const date = new Date(dateString + 'T00:00:00');
  const currentYear = new Date().getFullYear();
  const dateYear = date.getFullYear();

  // Use device locale for formatting
  // Include year only if it's different from current year
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(dateYear !== currentYear && { year: 'numeric' }),
  };

  return date.toLocaleDateString(undefined, options);
}

/**
 * Groups wear events by their worn_date field.
 *
 * Takes a flat array of wear events (already sorted by worn_date DESC, worn_at DESC
 * from the server) and groups them into sections for SectionList rendering.
 *
 * The grouping preserves the server-side ordering:
 * - Sections are ordered by date (most recent first)
 * - Events within each section maintain their worn_at ordering
 *
 * @param events - Flat array of wear events from the query hook
 * @returns Array of sections for SectionList
 *
 * @example
 * ```tsx
 * const { events } = useWearHistoryInfiniteQuery();
 * const sections = groupWearEventsByDate(events);
 *
 * <SectionList
 *   sections={sections}
 *   keyExtractor={(item) => item.id}
 *   renderItem={renderItem}
 *   renderSectionHeader={renderSectionHeader}
 * />
 * ```
 */
export function groupWearEventsByDate(events: WearHistoryRow[]): WearHistorySection[] {
  if (events.length === 0) {
    return [];
  }

  // Use a Map to preserve insertion order (which matches server ordering)
  const groupedMap = new Map<string, WearHistoryRow[]>();

  for (const event of events) {
    const dateKey = event.worn_date;
    const existing = groupedMap.get(dateKey);

    if (existing) {
      existing.push(event);
    } else {
      groupedMap.set(dateKey, [event]);
    }
  }

  // Convert Map to sections array
  // Map preserves insertion order, so sections are already in correct order
  const sections: WearHistorySection[] = [];

  for (const [dateKey, data] of groupedMap) {
    sections.push({
      title: formatDateLabel(dateKey),
      dateKey,
      data,
    });
  }

  return sections;
}
