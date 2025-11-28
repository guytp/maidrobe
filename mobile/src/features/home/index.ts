/**
 * Home feature barrel export.
 *
 * Exports all public APIs from the home feature module.
 * This allows consumers to import from '@/features/home' instead of
 * deep paths like '@/features/home/api/useHealthcheck'.
 *
 * Note: Recommendations functionality should be imported directly from
 * '@/features/recommendations' to maintain clear feature boundaries.
 */

export * from './api/useHealthcheck';
