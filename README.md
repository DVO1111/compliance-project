# Compliance Governance OS

An enterprise-grade GRC (Governance, Risk, and Compliance) SaaS platform for pharmaceutical and healthcare organizations. Built to ensure marketing content meets regulatory standards across multiple jurisdictions — Nigeria (NAFDAC), USA (FDA), Europe (EMA), and Pan-African (AMA).

## Who It's For

- **Pharmaceutical companies** managing multi-market promotional content
- **Compliance teams** enforcing advertising regulations across jurisdictions
- **Marketing teams** needing pre-clearance workflows before publication
- **Legal reviewers** managing approval pipelines and audit trails
- **Executives** monitoring organizational compliance posture

## Key Features

- **Multi-jurisdiction compliance engine** — deterministic rules for NAFDAC, FDA, EMA, and Pan-African regulations with risk scoring
- **AI-augmented analysis** — LLM-powered intent detection (Gemini/OpenAI/Anthropic fallback) that catches violations beyond keyword matching
- **Immutable audit trail** — SHA-256 hash-chained audit logs with evidence snapshots and sealed export
- **GRC framework management** — frameworks, controls, evidence linking, automated testing, and compliance dashboards
- **Policy lifecycle** — version-controlled governance policies with multi-step approval workflows
- **Role-based access control** — 5 system roles with 76 granular permissions plus custom role support
- **Multi-tenant architecture** — company-level isolation with row-level security across 136+ tables
- **Vendor risk management** — scorecards, due diligence tracking, and risk exposure monitoring
- **Real-time collaboration** — team chat, comments, notifications, and calendar integration
- **Executive dashboards** — role-based KPIs, jurisdiction comparisons, and trend analytics
- **40+ governance modules** — including crisis response, consent management, whistleblower reporting, drift monitoring, CAPA, and more

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| State | Zustand, React Context |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Edge Functions | Deno (Supabase Edge Functions) |
| AI | LLM Gateway (Gemini 2.0 Flash primary, OpenAI + Anthropic fallback) |
| Testing | Vitest |
| CI/CD | GitHub Actions |
| Monitoring | Sentry |
| Charts | Recharts |
| UI | Lucide React icons, Framer Motion |

## Running Locally

### Prerequisites

- Node.js 22+
- npm 10+
- A Supabase project with migrations applied

### Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public API key |
| `VITE_SENTRY_DSN` | Sentry DSN for error monitoring (optional for local dev) |

### Install and Run

```bash
npm install --legacy-peer-deps
npm run dev
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run Vitest test suite |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

## Project Structure

```
src/
  components/    # 57 feature modules, 185+ React components
  contexts/      # AuthContext, ThemeContext
  hooks/         # Custom React hooks
  integrations/  # Third-party connection handlers
  lib/           # Core services (compliance engine, audit, permissions, AI, etc.)
  pages/         # Page-level components
  scripts/       # Utility scripts
  stores/        # Zustand stores
  tests/         # Vitest test suites
supabase/
  functions/     # 19 Deno edge functions + shared helpers
  migrations/    # Database migrations
```

## Security

See [SECURITY.md](SECURITY.md) for a full mapping of security controls to SOC 2 Trust Service Criteria.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system architecture and design decisions
- [Onboarding](docs/ONBOARDING.md) — new developer setup guide
- [Changelog](CHANGELOG.md) — sprint history and release notes
