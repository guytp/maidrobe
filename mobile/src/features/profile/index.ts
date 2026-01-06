/**
 * Profile feature public exports.
 *
 * This module provides a clean interface for importing profile-related
 * components from other parts of the application.
 *
 * @module features/profile
 */

// Components
export { ProfileScreen, StylingPreferencesScreen } from './components';

// Types
export type {
  CalendarProvider,
  CalendarIntegrationRow,
  CalendarIntegration,
  CreateCalendarIntegrationParams,
  OAuthTokens,
  ConnectCalendarParams,
  UpdateTokensParams,
  fromCalendarIntegrationRow,
} from './types';

// Hooks
export { useCalendarIntegration } from './hooks/useCalendarIntegration';

// API
export {
  getCalendarIntegration,
  upsertCalendarIntegration,
  CalendarIntegrationError,
} from './api/calendarIntegrationRepository';
