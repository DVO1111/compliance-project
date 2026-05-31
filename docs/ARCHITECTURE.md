# Architecture

## System Overview

Compliance Governance OS is a single-page React application backed by Supabase (PostgreSQL + Auth + Edge Functions). The AI analysis layer runs entirely server-side via a multi-provider LLM gateway.

```
                 Browser
                    |
            React SPA (Vite)
            /       |        \
     Supabase    Supabase    Sentry
     Client JS   Realtime    (error monitoring)
            \       |        /
         Supabase Platform
        /        |         \
  PostgreSQL   Auth      Edge Functions (Deno)
  (136+ tables, RLS)       |
                     LLM Gateway
                    /     |      \
               Gemini  OpenAI  Anthropic
```

## Frontend

- **Framework**: React 18 with TypeScript, bundled by Vite
- **Styling**: Tailwind CSS with custom design tokens
- **State**: Zustand stores for global state, React Context for auth and theme
- **Components**: 57 feature modules with 185+ components organized by domain
- **Routing**: Client-side page switching via `MainLayout` with `PageId` union type (no react-router)
- **Charts**: Recharts for dashboards and analytics
- **Animations**: Framer Motion for transitions and micro-interactions

### Key Frontend Services (`src/lib/`)

| Service | Purpose |
|---------|---------|
| `complianceEngine.ts` | Multi-jurisdiction rules engine (NAFDAC, FDA, EMA, AMA) |
| `auditService.ts` | Hash-chained audit trail with evidence snapshots |
| `permissions.ts` | RBAC with 76 permission flags and 5 system roles |
| `geminiClient.ts` | AI client proxy with circuit breaker pattern |
| `logger.ts` | Structured logging (JSON in prod, plain in dev) |
| `sanitize.ts` | DOMPurify-based XSS prevention |
| `reviewWorkflowService.ts` | Legal review approval pipeline |
| `policyAssistantService.ts` | AI-powered policy drafting |

## Backend — Supabase

### Database

- **136+ tables** covering compliance reports, content submissions, audit logs, GRC frameworks, vendor management, policies, and more
- **Row-Level Security (RLS)** on all tables enforcing company-level tenant isolation
- **Views** for aggregated dashboards (vendor risk exposure, policy compliance stats, audit velocity)
- **Database functions (RPCs)** for operations like `verify_audit_chain`

### Authentication

- Supabase Auth with email/password
- Session management via `AuthContext`
- Invite-based onboarding with time-limited tokens
- Profile-linked role assignment

### Realtime

- Supabase Realtime subscriptions for notifications, chat messages, and live updates

## Edge Functions (Deno)

19 serverless functions deployed via Supabase Edge Functions:

| Function | Purpose |
|----------|---------|
| `llm-gateway` | Multi-provider LLM proxy (Gemini/OpenAI/Anthropic) with JSON-only mode |
| `ai-worker` | Processes queued AI analysis jobs with retry and dead-letter handling |
| `enqueue-ai-job` | Accepts AI analysis requests and queues them |
| `api-v1-proxy` | External REST API proxy for integrations |
| `automation-runner` | Executes GRC automation test runs |
| `regulatory-crawl` | Crawls regulatory sources for horizon scanning |
| `chat-relay` | Routes chat messages to external destinations (Slack, etc.) |
| `deliver-webhook` | Delivers outbound webhooks |
| `webhook-dispatcher` | Dispatches webhook events to registered endpoints |
| `deadline-alerts` | Sends deadline and expiry notifications |
| `policy-reminder-runner` | Sends policy acknowledgement reminders |
| `publish-dispatch` | Handles content publication dispatch |
| `notify` | General notification delivery |
| `slack-oauth` / `slack-channels` | Slack integration OAuth and channel sync |
| `google-drive-oauth` / `google-drive-browse` | Google Drive integration |
| `microsoft-oauth` / `microsoft-browse` | Microsoft 365 integration |

All edge functions include security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`).

## AI Layer

### Architecture

The AI pipeline is designed so that **no LLM API keys reach the browser**:

1. **Frontend** (`geminiClient.ts`) sends prompts to the `llm-gateway` edge function via the Supabase client
2. **LLM Gateway** routes to the best available provider with cascading fallback:
   - Primary: Google Gemini 2.0 Flash (low latency, cost-effective)
   - Fallback 1: OpenAI
   - Fallback 2: Anthropic
3. Responses are forced into JSON-only mode with automatic repair for malformed output

### Circuit Breaker

The frontend AI client implements a circuit breaker pattern:
- **CLOSED**: normal operation, requests flow through
- **OPEN**: after 3 consecutive failures, requests are blocked for 30s
- **HALF_OPEN**: after recovery timeout, one test request is allowed through

### AI Worker Pipeline

For content analysis, jobs are queued asynchronously:
1. Content upload triggers `enqueue-ai-job`
2. `ai-worker` picks up jobs, calls `llm-gateway` with a structured compliance prompt
3. Results (risk score, intent violations, recommendations) are cached in `ai_risk_assessments`
4. Frontend merges AI findings with deterministic rule results via `mergeAIFindings()`

## Compliance Engine

The deterministic compliance engine (`src/lib/complianceEngine.ts`) runs entirely client-side:

1. **Rule scanning** — regex-based pattern matching for forbidden claims, superlatives, and professional ethics violations
2. **Mandatory caveats** — checks for required disclaimers based on content triggers, platform, and audience
3. **Risk scoring** — base score per violation severity (Red/Yellow), multiplied by audience factor (HCP: 1.0x, patients: 1.3x, general public: 1.5x) and adjusted by platform strictness
4. **Multi-jurisdiction** — separate rule sets per jurisdiction (Nigeria, USA, Europe, Pan-African, WHO)
5. **AI merge** — deterministic results are enhanced with AI findings when available

## Audit Trail

The audit system (`src/lib/auditService.ts`) provides tamper-evident logging:

- **SHA-256 integrity hashing** via Web Crypto API
- **Hash chain linking** — each entry's `previous_hash` points to the prior entry's `integrity_hash` (blockchain-light)
- **Evidence snapshots** — frozen entity state captured at event time
- **Chain verification** — client-side and server-side (`verify_audit_chain` RPC)
- **Sealed export** — ZIP package with audit trail, snapshots, and SHA-256 integrity manifest
