# Maidrobe Mobile App

Digital closet management with AI-powered outfit suggestions. Built with React Native (Expo) and TypeScript.

## Technology Stack

- **Framework**: React Native with Expo SDK 55
- **Language**: TypeScript (strict mode)
- **Routing**: Expo Router (file-based)
- **State Management**:
  - Zustand for local/ephemeral UI state
  - React Query for server state and caching
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **Styling**: React Native StyleSheet with theme system
- **Testing**: Jest + React Testing Library
- **Code Quality**: ESLint + Prettier + Husky pre-commit hooks

## Directory Structure

This project follows a **feature-first** architecture for better scalability and maintainability:

```
mobile/
├── app/                      # Expo Router file-based routing
│   ├── _layout.tsx          # Root layout with providers
│   ├── index.tsx            # Entry point (redirects to /home)
│   ├── home/                # Home route
│   └── auth/                # Auth route
├── src/
│   ├── components/          # Shared UI components
│   │   └── index.ts         # Barrel export
│   ├── core/                # Core functionality
│   │   ├── i18n/            # Internationalization
│   │   ├── query/           # React Query configuration
│   │   ├── state/           # Zustand store configuration
│   │   └── theme/           # Theming system
│   ├── features/            # Feature modules (feature-first)
│   │   ├── auth/            # Authentication feature
│   │   │   ├── store/       # Auth-specific state
│   │   │   └── index.ts     # Barrel export
│   │   └── home/            # Home feature
│   │       ├── api/         # Home-specific API hooks
│   │       └── index.ts     # Barrel export
│   ├── navigation/          # Navigation utilities
│   │   └── index.ts         # Barrel export
│   └── services/            # External services
│       └── supabase.ts      # Supabase client
└── __tests__/               # Test files

```

## Feature-First Convention

### What is Feature-First?

Feature-first architecture organizes code by feature/domain rather than by technical layer. Each feature contains all the code it needs (components, state, API calls, types) in one place.

### Directory Purposes

- **`app/`**: Expo Router screens - keep these thin, delegate logic to features
- **`src/features/`**: Feature modules - each feature is self-contained
- **`src/components/`**: Shared components used across multiple features
- **`src/core/`**: Core infrastructure (theme, i18n, state config)
- **`src/services/`**: External service clients (Supabase, APIs)
- **`src/navigation/`**: Navigation utilities and types

### When to Use Each Directory

**Use `src/features/[feature]/` when:**

- Code is specific to one feature/domain
- Component is only used within that feature
- Business logic belongs to that feature
- Example: `features/auth/store/sessionSlice.ts`

**Use `src/components/` when:**

- Component is used across multiple features
- Component is part of the design system
- Component is purely presentational
- Example: Button, Input, Card components

**Use `src/core/` when:**

- Code provides foundational functionality
- Code is used throughout the application
- Example: theme system, i18n, query client config

**Use `src/services/` when:**

- Integrating with external services
- Creating API clients
- Example: Supabase client, external API wrappers

### Barrel Exports

Each feature and directory exports its public API through an `index.ts` barrel file:

```typescript
// Instead of deep imports:
import { useHealthcheck } from './features/home/api/useHealthcheck';

// Use barrel exports:
import { useHealthcheck } from './features/home';
```

## Development

### Prerequisites

- Node.js >= 20.19.4
- npm >= 10.0.0

### Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Running the App

```bash
# Start Expo development server
npm run start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

### Code Quality

```bash
# Run TypeScript type checking
npm run typecheck

# Run ESLint
npm run lint

# Run tests
npm run test

# Format code with Prettier
npm run format
```

### Pre-commit Hooks

Husky runs the following checks before each commit:

- ESLint
- TypeScript type checking
- Unit tests
- Prettier formatting

## Testing

Tests are located in `__tests__/` and use Jest + React Testing Library.

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run test -- --coverage
```

## Project Guidelines

### Code Standards

- TypeScript strict mode enabled
- No business logic in screen components
- ESLint and Prettier enforced
- WCAG AA accessibility minimum
- All public functions have JSDoc comments

### State Management

- **Zustand**: Use for local/ephemeral UI state only
- **React Query**: Use for all server state and caching
- Cache keys in React Query must include `userId` where applicable

### Accessibility

- 44px minimum touch targets
- Support for screen readers
- Dynamic text scaling with `allowFontScaling`
- Proper accessibility roles and labels

### Performance

- Target p95 API < 300ms
- App TTI < 2.5s on mid-range devices
- Lazy loading and virtualization for long lists

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [Supabase Documentation](https://supabase.com/docs)
