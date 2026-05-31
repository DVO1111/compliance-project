# Security Controls — SOC 2 Trust Service Criteria Mapping

This document maps the security controls implemented in the Compliance Governance OS platform to the AICPA SOC 2 Trust Service Criteria.

---

## CC6 — Logical and Physical Access Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| CC6.1 Role-based access control | `src/lib/permissions.ts` — five system roles (marketing, compliance, executive, agency, auditor) with 76 granular permission flags | Active |
| CC6.2 Custom role permissions | Custom RBAC via `customPermissions` JSONB overlay that overrides system role defaults | Active |
| CC6.3 Row-level security | Supabase RLS policies on all 136+ tables enforce company-level tenant isolation | Active |
| CC6.4 API key management | API keys scoped per company with `api_keys` table, managed via Governance UI | Active |
| CC6.5 Authentication | Supabase Auth with email/password, session management via `AuthContext` | Active |
| CC6.6 Invite-based onboarding | Company membership via time-limited invite tokens (`company_invites` table) | Active |
| CC6.7 Edge function auth | All Supabase edge functions validate JWT `Authorization` header before processing | Active |
| CC6.8 Service role key removal | Test scripts use only `VITE_SUPABASE_ANON_KEY`; no service_role keys in client code | Active |

## CC7 — System Operations

| Control | Implementation | Status |
|---------|---------------|--------|
| CC7.1 Structured logging | `src/lib/logger.ts` — JSON-structured logs in production with timestamp, level, message, context | Active |
| CC7.2 Error monitoring | Sentry integration (`@sentry/react`) with `ErrorBoundary`, browser tracing, and session replay | Active |
| CC7.3 CI/CD pipeline | GitHub Actions CI: typecheck, test (Vitest), build on every push/PR to main/develop | Active |
| CC7.4 Dependency pinning | All dependencies in `package.json` pinned to exact versions (no `^` or `~`) | Active |
| CC7.5 Automated testing | 39 Vitest tests covering compliance engine, audit trail integrity, and permissions system | Active |

## CC8 — Change Management

| Control | Implementation | Status |
|---------|---------------|--------|
| CC8.1 Version-controlled policies | `governance_policies` and `governance_policy_versions` tables with full version history | Active |
| CC8.2 Policy approval workflow | Multi-step review with `signoff_status` tracking and reviewer assignment | Active |
| CC8.3 Git-based change tracking | All source changes tracked via Git with commit attribution | Active |
| CC8.4 Audit trail for changes | Immutable, hash-chained audit log (`src/lib/auditService.ts`) records all entity changes | Active |

## CC9 — Risk Mitigation

| Control | Implementation | Status |
|---------|---------------|--------|
| CC9.1 Compliance engine | Multi-jurisdiction rules engine (`src/lib/complianceEngine.ts`) — Nigeria/NAFDAC, FDA, EMA, Pan-African | Active |
| CC9.2 Risk scoring | Automated risk scoring with audience multipliers and platform strictness levels | Active |
| CC9.3 AI-augmented analysis | LLM-based intent analysis via `ai-worker` edge function merged with deterministic rules | Active |
| CC9.4 Predictive risk | `src/lib/predictiveRiskService.ts` for forward-looking risk indicators | Active |
| CC9.5 Vendor risk management | Vendor scorecards, due diligence tracking, and risk exposure views | Active |
| CC9.6 GRC frameworks | Full GRC framework, control, and evidence management with automated testing | Active |
| CC9.7 Crisis response | Crisis response playbooks and affected materials tracking | Active |

## A1 — Availability

| Control | Implementation | Status |
|---------|---------------|--------|
| A1.1 Supabase managed infrastructure | PostgreSQL with automated backups, point-in-time recovery | Active |
| A1.2 Edge function distribution | Supabase Edge Functions deployed globally via Deno Deploy | Active |
| A1.3 Circuit breaker pattern | `src/hooks/useCircuitBreaker.ts` — prevents cascading failures on API errors | Active |
| A1.4 Retention policies | Configurable data retention per jurisdiction (`audit_retention_policies` table) | Active |
| A1.5 Legal holds | Legal hold management prevents data deletion during litigation (`src/lib/governance/legalHoldService.ts`) | Active |

## C1 — Confidentiality

| Control | Implementation | Status |
|---------|---------------|--------|
| C1.1 Input sanitization | `src/lib/sanitize.ts` — DOMPurify-based XSS prevention for all user inputs | Active |
| C1.2 Content Security Policy | CSP meta tag in `index.html` restricting script, style, connect, frame, and object sources | Active |
| C1.3 Security headers | All edge functions return `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` | Active |
| C1.4 Secret vault | Encrypted secret storage via `src/components/Vault/SecretVaultPage.tsx` with `src/lib/crypto.ts` | Active |
| C1.5 Secure deletion | `src/lib/secureDeletionService.ts` for compliant data erasure | Active |
| C1.6 Environment variable isolation | Secrets managed via `.env` (gitignored) and GitHub Actions secrets | Active |

## PI1 — Processing Integrity

| Control | Implementation | Status |
|---------|---------------|--------|
| PI1.1 Hash-chained audit trail | SHA-256 integrity hashing with blockchain-light chain linking (`auditService.ts`) | Active |
| PI1.2 Chain verification | Client-side and server-side (`verify_audit_chain` RPC) chain integrity verification | Active |
| PI1.3 Evidence snapshots | Frozen entity state captured at time of audit event for regulatory defensibility | Active |
| PI1.4 Sealed evidence export | ZIP export with audit trail, evidence snapshots, and SHA-256 integrity manifest | Active |
| PI1.5 Compliance reporting | Multi-format export (PDF, CSV) with tamper-evident integrity hashes | Active |
| PI1.6 Obligation tracking | Regulatory obligation management with deadline monitoring and status tracking | Active |

---

## Reporting a Security Issue

If you discover a security vulnerability, please report it responsibly by emailing **security@compliancegovernanceos.com**. Do not open a public GitHub issue for security vulnerabilities.
