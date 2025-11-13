# Maidrobe

A mobile app that helps people manage their clothes without the usual faff. Snap photos of each item, build a searchable closet, and get AI-powered outfit suggestions based on your catalogue, occasion, and preferences.

## Features

- Digital closet management with automatic item recognition
- AI stylist for outfit suggestions
- Wear history tracking with no-repeat windows
- Weather-aware recommendations
- Smart search and filtering

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js LTS** (v18.x or v20.x)
  - Download from https://nodejs.org/
  - Verify: `node --version`

- **pnpm** (v8.x or later)
  - Install: `npm install -g pnpm`
  - Verify: `pnpm --version`

- **Expo CLI**
  - No global install needed, use: `npx expo`
  - Or install globally: `npm install -g expo-cli`

- **Supabase CLI**
  - macOS: `brew install supabase/tap/supabase`
  - Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase`
  - Linux: See https://supabase.com/docs/guides/cli
  - Verify: `supabase --version`

## Getting Started

### 1. Clone the repository

```
git clone https://github.com/yourusername/maidrobe.git
cd maidrobe
```

### 2. Install dependencies

```
pnpm install
```

### 3. Setup environment variables

```
cp .env.example .env
```

Edit `.env` and add your Supabase credentials.

### 4. Start development

**Mobile app:**
```
pnpm mobile:start
```

**Edge functions (local Supabase):**
```
pnpm edge:dev
```

## Project Structure

```
maidrobe/
├── mobile/              # React Native (Expo) mobile app
├── edge-functions/      # Supabase Edge Functions (Deno)
├── .github/             # CI/CD workflows
├── package.json         # Monorepo root configuration
└── README.md           # This file
```

## Development Commands

### Mobile Workspace

- `pnpm mobile:start` - Start Expo development server
- `pnpm mobile:lint` - Run ESLint
- `pnpm mobile:typecheck` - Run TypeScript compiler check
- `pnpm mobile:test` - Run unit tests

### Edge Functions Workspace

- `pnpm edge:dev` - Start local Supabase (includes Edge Functions)
- `pnpm edge:lint` - Run Deno linter
- `pnpm edge:typecheck` - Run Deno type checker
- `pnpm edge:test` - Run Deno tests

### All Workspaces

- `pnpm lint` - Lint all packages
- `pnpm typecheck` - Type-check all packages
- `pnpm test` - Test all packages

## Technology Stack

- **Frontend:** React Native, Expo, TypeScript
- **State Management:** Zustand (local), React Query (server cache)
- **Navigation:** Expo Router
- **Backend:** Supabase (Postgres, Auth, Storage)
- **Serverless:** Supabase Edge Functions (Deno)
- **AI/ML:** OpenAI GPT-4o, Claude Sonnet, Replicate
- **Testing:** Vitest, Jest, React Testing Library, Detox
- **CI/CD:** GitHub Actions, EAS Build

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass: `pnpm test`
4. Ensure code quality: `pnpm lint && pnpm typecheck`
5. Commit using conventional commits
6. Open a pull request

## License

UNLICENSED - Private project
