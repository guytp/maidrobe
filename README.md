# Maidrobe

[![CI](https://github.com/maidrobe/maidrobe/workflows/CI/badge.svg)](https://github.com/maidrobe/maidrobe/actions)

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

- **npm** (v8.x or later)
  - Comes with Node.js
  - Verify: `npm --version`

- **Expo CLI**
  - No global install needed, use: `npx expo`
  - Or install globally: `npm install -g expo-cli`

- **Supabase CLI** (for edge-functions workspace)
  - macOS: `brew install supabase/tap/supabase`
  - Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase`
  - Linux: See https://supabase.com/docs/guides/cli
  - Verify: `supabase --version`

- **Deno** (for edge-functions workspace)
  - Install: `curl -fsSL https://deno.land/install.sh | sh`
  - Or visit: https://deno.land/manual/getting_started/installation
  - Verify: `deno --version`

## Getting Started

### 1. Clone the repository

```
git clone https://github.com/maidrobe/maidrobe.git
cd maidrobe
```

### 2. Install dependencies

```
npm install
```

### 3. Setup environment variables

```
cp .env.example .env
```

Edit `.env` and add your Supabase credentials.

### 4. Start development

**Mobile app:**

```
npm run mobile:start
```

**Edge functions (local Supabase):**

```
npm run edge:dev
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

- `npm run mobile:start` - Start Expo development server
- `npm run mobile:lint` - Run ESLint
- `npm run mobile:typecheck` - Run TypeScript compiler check
- `npm run mobile:test` - Run unit tests

### Edge Functions Workspace

- `npm run edge:dev` - Start local Supabase (includes Edge Functions)
- `npm run edge:lint` - Run Deno linter
- `npm run edge:typecheck` - Run Deno type checker
- `npm run edge:test` - Run Deno tests

### All Workspaces

- `npm run lint` - Lint all packages
- `npm run typecheck` - Type-check all packages
- `npm run test` - Test all packages

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
3. Ensure all tests pass: `npm run test`
4. Ensure code quality: `npm run lint && npm run typecheck`
5. Commit using conventional commits
6. Open a pull request

## License

UNLICENSED - Private project
