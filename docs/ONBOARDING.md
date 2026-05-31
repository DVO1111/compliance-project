# Developer Onboarding Guide

Welcome to Compliance Governance OS. This guide will get you from zero to running the app locally.

## Step 1 — Prerequisites

Install the following:

- **Node.js 22+** — [nodejs.org](https://nodejs.org/) or use `nvm install 22`
- **npm 10+** — ships with Node.js 22
- **Git** — [git-scm.com](https://git-scm.com/)
- **VS Code** (recommended) with extensions:
  - ESLint
  - Tailwind CSS IntelliSense
  - TypeScript (built-in)

## Step 2 — Clone and Install

```bash
git clone https://github.com/CreativeCriateur/Compliance-Governance-OS.git
cd project
npm install --legacy-peer-deps
```

The `--legacy-peer-deps` flag is required due to a peer dependency conflict between `eslint-plugin-react-hooks` and the current ESLint version.

## Step 3 — Environment Setup

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Where to get it |
|----------|----------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard > Project Settings > API > Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard > Project Settings > API > anon/public key |
| `VITE_SENTRY_DSN` | Sentry Dashboard > Project Settings > Client Keys (optional for local dev) |

## Step 4 — Run the App

```bash
npm run dev
```

Open http://localhost:5173. You should see the landing page.

## Step 5 — Verify Your Setup

Run all checks to confirm everything works:

```bash
npm run typecheck    # Should exit with 0 errors
npm test             # Should show 39 passing tests
npm run build        # Should complete without errors
```

## Project Layout

```
src/
  components/     # UI components organized by feature domain
  contexts/       # React context providers (Auth, Theme)
  hooks/          # Custom hooks (useArchiveData, useCircuitBreaker, etc.)
  integrations/   # Third-party connection logic
  lib/            # Core business logic and services
    rules/        # Compliance rule definitions per jurisdiction
    governance/   # Governance services (legal hold, risk register, retention)
    grc/          # GRC framework, controls, evidence, snapshots
    grcAutomation/# GRC automated testing
    aiGovernance/ # AI asset, incident, and usage log services
    audit/        # Audit workspace and export
    identity/     # Identity provider management
    platform/     # Platform job service
  pages/          # Full-page components
  scripts/        # CLI utility scripts
  stores/         # Zustand state stores
  tests/          # Vitest test files
supabase/
  functions/      # 19 Deno edge functions
    _shared/      # Shared utilities (CORS, security headers)
  migrations/     # SQL migration files
```

## Key Files to Read First

1. **`src/lib/permissions.ts`** — the RBAC system (roles, permissions, how access control works)
2. **`src/lib/complianceEngine.ts`** — the compliance rules engine (core product logic)
3. **`src/lib/auditService.ts`** — the hash-chained audit trail
4. **`src/App.tsx`** — the root component and page routing
5. **`src/contexts/AuthContext.tsx`** — authentication flow
6. **`supabase/functions/llm-gateway/index.ts`** — the AI provider routing

## Development Workflow

1. **Create a branch** from `main` for your feature or fix
2. **Make changes** — the dev server hot-reloads
3. **Run checks** before pushing:
   ```bash
   npm run typecheck
   npm test
   ```
4. **Push and create a PR** — CI runs typecheck, tests, and build automatically
5. **Merge to `main`** after review

## Common Tasks

### Adding a new component module

1. Create a folder under `src/components/YourModule/`
2. Add the page component
3. Add a `PageId` entry in `src/components/Layout/MainLayout.tsx`
4. Add a route case in `src/App.tsx` `AppContent` function
5. Add permission flags in `src/lib/permissions.ts` if needed

### Adding a new edge function

1. Create `supabase/functions/your-function/index.ts`
2. Import `SECURITY_HEADERS` or define them locally (see any existing function for the pattern)
3. Handle CORS preflight and add security headers to all responses
4. Deploy via `supabase functions deploy your-function`

### Adding a compliance rule

1. Add the rule definition in the appropriate file under `src/lib/rules/`
2. Call the scanner in the relevant jurisdiction analyzer in `complianceEngine.ts`
3. Add a test case in `src/tests/complianceEngine.test.ts`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm install` fails with peer dependency errors | Use `npm install --legacy-peer-deps` |
| TypeScript errors after pulling | Run `npm run typecheck` to see specific errors |
| Tests fail on audit trail | The audit tests mock Supabase — check the mock setup in the test file |
| Edge functions return 401 | Check that `VITE_SUPABASE_ANON_KEY` is set correctly |
| Blank screen after login | Check browser console — likely a missing env variable |
