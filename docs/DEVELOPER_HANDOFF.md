# Compliance Governance OS — Developer Handoff Document

**Version:** June 2026  
**Status:** Active development — onboarding new engineering team  
**Branch:** `main`  

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [Technical Stack](#2-technical-stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Architecture](#4-database-architecture)
5. [Authentication, Roles & Permissions](#5-authentication-roles--permissions)
6. [Navigation & Routing](#6-navigation--routing)
7. [Onboarding Flow](#7-onboarding-flow)
8. [Existing Modules — Complete Reference](#8-existing-modules--complete-reference)
9. [The Intelligence Layer — How Modules Wire Together](#9-the-intelligence-layer--how-modules-wire-together)
10. [The AI Layer](#10-the-ai-layer)
11. [Industry Profiles (Pharma vs Logistics)](#11-industry-profiles-pharma-vs-logistics)
12. [Modules Requiring Further Engineering](#12-modules-requiring-further-engineering)
13. [New Builds Required — NASCO Compliance Expert Meeting](#13-new-builds-required--nasco-compliance-expert-meeting)
14. [Adjustments to Existing Modules](#14-adjustments-to-existing-modules)
15. [Build Priority & Sequencing](#15-build-priority--sequencing)
16. [Platform Direction](#16-platform-direction)
17. [Developer Getting Started](#17-developer-getting-started)

---

## 1. What We Are Building

This is a **multi-vertical Compliance Governance Operating System (OS)** — not a document management tool and not a single-regulation tracker. The platform is designed to be the central compliance infrastructure for any regulated company: pharmaceutical manufacturers, logistics operators, financial services firms, food producers, and more.

**The core thesis:** Compliance in regulated industries is operationally fragmented. Companies manage GMP inspection readiness in spreadsheets, track batch QC results in Word documents, handle regulatory obligations in email threads, and generate Certificates of Analysis by copying test results into manually formatted templates. This platform replaces that entire operational layer with a single, connected system.

**Current primary vertical:** Pharmaceutical manufacturing in Nigeria (primary regulators: NAFDAC, SON, MDCN). The platform has been validated with NAFDAC and NASCO (pharma) and Rosexpress Delivery Services (logistics).

**Platform pillars:**
- **Manufacturing & Quality** — Batch release, CAPA, SOP versioning, change control, GMP inspection readiness
- **Governance & Policy** — GRC frameworks, controls, risk register, policy lifecycle, compliance obligations
- **Regulatory Intelligence** — Horizon scanning, regulatory affairs submissions, CTD dossier, SON compliance
- **Audit & Evidence** — Immutable audit trail, AI-powered audit prep, audit workspaces
- **Content & Marketing Compliance** — For pharma marketing teams: claim extraction, legal review, channel monitoring
- **AI Intelligence Layer** — Cross-module signal correlation, auto-CAPA creation, risk posture scoring, alerting engine

**What makes this different from generic GRC tools:** The platform has pharmaceutical operational depth (batch records, CoA generation, environmental monitoring, GMP facility checklists) combined with an intelligence layer that connects every module — a failing control auto-creates a CAPA, an overdue obligation auto-creates a CAPA, and a threshold breach across multiple signals auto-creates a risk register entry. Everything is connected.

---

## 2. Technical Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + TypeScript | Vite build tool |
| Styling | Tailwind CSS | Utility-first, no component library |
| Backend / DB | Supabase (PostgreSQL) | Row-Level Security enforced on all tables |
| Auth | Supabase Auth | JWT-based, profile table extends auth.users |
| Edge Functions | Supabase Edge Functions (Deno) | Used for AI assembly jobs, compliance scans |
| AI / LLM | Google Gemini (primary) + Anthropic fallback | `src/lib/geminiClient.ts` — wrapped in graceful degradation |
| State Management | React Context + local useState | No Redux; AuthContext is the main global store |
| Routing | Custom hash/key-based routing in App.tsx | Not React Router — uses `activePage` state |
| Type Safety | TypeScript throughout | `database.types.ts` auto-generated from Supabase schema |

**Key environment variables:**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
```

**Supabase client:** `src/lib/supabase.ts` — exports a single typed `supabase` singleton. Always import from here. Never instantiate a second client.

---

## 3. Repository Structure

```
src/
├── components/           # All UI pages and components, organized by module
│   ├── Dashboard/        # Role-based dashboard with widgets
│   ├── Layout/           # MainLayout.tsx — navigation, sidebar, shell
│   ├── Auth/             # Login, Signup pages
│   ├── Onboarding/       # Multi-step onboarding wizard
│   ├── BatchRelease/     # Batch QC release workflow
│   ├── SopLibrary/       # SOP versioning and acknowledgement
│   ├── CapaManagement/   # CAPA lifecycle
│   ├── ChangeControl/    # Change control workflow
│   ├── GmpInspection/    # GMP readiness checklist
│   ├── AuditPrep/        # AI-powered audit evidence assembly
│   ├── AuditTrail/       # Immutable hash-chained audit ledger
│   ├── Alerts/           # Compliance alerting rules engine
│   ├── Governance/       # Sub-folders: Audits, Risks, Obligations, Policies,
│   │                     #   CommandCenter, Identity, LegalHold, Retention, Timeline, AI
│   ├── GrcFrameworks/    # GRC framework library
│   ├── GrcControls/      # GRC control management
│   ├── GrcAutomation/    # Automated control testing
│   ├── HorizonScanning/  # Regulatory intelligence feed
│   ├── RegulatoryAffairs/# NAFDAC/SON submission tracking
│   ├── SONCompliance/    # SON audit and ManCap applications
│   ├── CTDDossier/       # Common Technical Document dossier
│   ├── LicenseVault/     # Licence and certificate tracking
│   ├── Vendors/          # Vendor management
│   ├── VendorScorecard/  # Vendor risk scoring and audits
│   ├── Training/         # Training log (quiz-based)
│   ├── TrainingSimulation/ # Scenario-based compliance training
│   ├── Logistics/        # CN22/CN23 customs declarations
│   ├── ContrabandRejection/ # Contraband rejection workflow
│   └── [30+ other modules]
│
├── lib/                  # All service layer — DB queries, business logic
│   ├── supabase.ts       # Supabase client (singleton)
│   ├── permissions.ts    # Permission matrix (78 keys)
│   ├── pharma/           # Pharma-specific services
│   ├── grc/              # GRC framework services
│   ├── grcAutomation/    # GRC test automation services
│   ├── governance/       # Core governance services
│   ├── platform/         # Webhooks, jobs, ecosystem
│   ├── audit/            # Audit workspace services
│   ├── identity/         # SSO/identity provider services
│   └── integrations/     # API key, external integration services
│
├── contexts/
│   └── AuthContext.tsx   # Global auth state — user, profile, permissions, company
│
├── App.tsx               # All routes — single-page app with page key switching
└── types/                # Shared TypeScript types

supabase/
├── migrations/           # All DB schema migrations (run in order)
└── functions/            # Edge functions (audit-prep-assembler, compliance-alert-scanner)

docs/                     # This document and other architecture docs
schema/                   # Schema snapshots
```

---

## 4. Database Architecture

The database is PostgreSQL hosted on Supabase. **Row-Level Security (RLS) is active on all tables** — every query is scoped to `company_id` automatically. Never query without company_id context.

### Core Table Groups

#### Identity & Access
| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users` — role, company_id, industry_type, onboarding_completed |
| `companies` / `company_settings` | Company master record — name, industry, regulatory_focus |
| `company_members` | Links users to companies with role and module_access array |
| `company_invites` | Invite tokens for new user onboarding |
| `departments` | Org structure for SOP/policy assignment |
| `custom_roles` | JSONB permissions for custom role definitions |

#### Pharmaceutical Operations
| Table | Purpose |
|-------|---------|
| `batch_records` | Batch QC lifecycle — qc_pending → released/rejected |
| `batch_qc_results` | Individual test results per batch (test_name, spec, result, pass) |
| `change_controls` | Change request workflow with regulatory impact flag |
| `sop_documents` | SOP master records |
| `sop_versions` | SOP version history |
| `sop_acknowledgements` | Per-user SOP sign-off records |
| `gmp_readiness_log` | GMP inspection item status per company |
| `regulatory_submissions` | NAFDAC/SON submission tracking |
| `regulatory_licences` | Product registration and licence records |
| `son_audits` | SON audit records |
| `son_mancap_applications` | SON ManCap application tracking |
| `ctd_dossiers` | CTD dossier master (Module 1–5) |
| `ctd_module_progress` | Per-module completion status |
| `ctd_documents` | Documents uploaded per CTD module |

#### Governance Core
| Table | Purpose |
|-------|---------|
| `grc_frameworks` | Framework library (ISO, NAFDAC GMP, SON, NIST, etc.) |
| `grc_controls` | Control definitions linked to frameworks |
| `grc_control_snapshots` | Point-in-time control compliance status |
| `grc_control_tests` | Automated test definitions per control |
| `grc_test_runs` | Test execution results (pass/fail) |
| `policies` | Policy master records |
| `policy_versions` | Policy version lifecycle (draft → published) |
| `policy_acknowledgements` | User acknowledgements per policy version |
| `regulatory_obligations` | Regulatory obligations with due dates and owners |
| `obligation_links` | Links obligations to controls, policies, risks, vendors |
| `risks` | Risk register entries |
| `risk_links` | Cross-references: risk → control/policy/vendor/CAPA |
| `company_risk_posture` | Aggregated risk score per company (recomputed on changes) |
| `capa_records` | CAPA master records |
| `capa_actions` | Sub-actions within each CAPA |
| `correlation_events` | Events fired by the cross-module correlation engine |
| `governance_job_runs` | Async job tracking for correlation, retention, alerting |

#### Alerting & Audit
| Table | Purpose |
|-------|---------|
| `compliance_alert_rules` | Alert rule configuration per trigger type |
| `compliance_alert_log` | Alert firing history |
| `audit_logs` | Immutable SHA-256 hash-chained audit trail — all mutations |
| `audit_prep_sessions` | AI audit prep sessions |
| `audit_prep_items` | Individual evidence items per session |
| `audit_sessions` | External audit workspaces |
| `audit_requests` | Evidence requests within audit workspaces |

#### Content & Marketing
| Table | Purpose |
|-------|---------|
| `content_submissions` | Marketing content — the central "work item" for content workflow |
| `compliance_reports` | AI analysis results per submission |
| `extracted_claims` | NLP-extracted claims from content |
| `ai_risk_assessments` | AI-powered risk scores per submission |

#### Vendor & Third-Party
| Table | Purpose |
|-------|---------|
| `vendors` | Vendor master records |
| `vendor_profiles` | Risk tier, assessment score per vendor |
| `vendor_audits` | Vendor audit history and findings |
| `vendor_documents` | Vendor contracts, certifications |

#### Platform & Integration
| Table | Purpose |
|-------|---------|
| `webhook_endpoints` | Configured outbound webhook URLs |
| `webhook_deliveries` | Delivery tracking per webhook event |
| `api_keys` | API key management for integrations |
| `retention_policies` | Data retention rules per jurisdiction |
| `legal_holds` | Litigation hold — prevents document deletion |

### Key Relationships

```
auth.users
  └── profiles (1:1)
        └── company_members (N:M with companies)
              └── companies
                    ├── batch_records → batch_qc_results
                    ├── sop_documents → sop_versions → sop_acknowledgements
                    ├── capa_records → capa_actions
                    ├── grc_frameworks → grc_controls → grc_control_snapshots
                    │                              └── grc_control_tests → grc_test_runs
                    ├── policies → policy_versions → policy_acknowledgements
                    ├── regulatory_obligations → obligation_links
                    ├── risks → risk_links
                    ├── audit_logs (hash-chained, append-only)
                    └── compliance_alert_rules → compliance_alert_log
```

### Important DB Conventions
- Every table is scoped by `company_id` — never forget this in queries
- `audit_logs` is hash-chained — never UPDATE or DELETE rows, only INSERT
- Status enums are strings, not PostgreSQL enums (easier to extend)
- `created_by` is always `user_id` (uuid from auth.users)
- Timestamps are always UTC (`timestamptz`)

---

## 5. Authentication, Roles & Permissions

### Auth Flow

1. **Signup:** User creates account → Supabase auth → `profiles` row created → onboarding wizard
2. **Login:** Supabase auth → `AuthContext.loadProfile()` loads profile + company_members + custom_role
3. **Invited users:** Accept token → skip onboarding wizard → mark `onboarding_completed = true`
4. **Session:** Supabase handles JWT refresh automatically; `AuthContext` listens to `onAuthStateChange`

**Auth context** (`src/contexts/AuthContext.tsx`) is the single source of truth. It exposes:
- `user` — Supabase auth user
- `profile` — row from `profiles` table (role, company_id, industry_type, etc.)
- `perms` — resolved `Permissions` object (78 boolean keys)
- `activeBrandId` — for multi-brand enterprise accounts

### Roles

There are 5 built-in legacy roles and an unlimited custom role system:

| Role | Access Level | Typical User |
|------|-------------|-------------|
| `executive` / `admin` | All 78 permissions enabled | CEO, COO, Compliance Director |
| `compliance` | Near-universal — GRC, policies, audit, vendors, AI governance | Compliance Officer, QA Manager |
| `marketing` | Content-focused — upload, archive, regulations, horizon scanning | Marketing Manager |
| `agency` | Upload, archive, content blocks, agency portal only | External marketing agency |
| `auditor` | Read-only audit workspace only — nav is restricted to audit-sessions | External auditor |
| `legal_partner` | Legal marketplace and partner dashboard | External law firm |

**Custom roles:** Companies can create custom roles in Role Management with granular toggles per permission key. Stored in `custom_roles` table with a JSONB permissions object. When a user has `custom_role_id` set, that overrides their base role.

**Permission resolution priority:**
1. `module_access[]` from `company_members` (set at invite time) — highest
2. `custom_role.permissions` JSONB (if `custom_role_id` is set)
3. Legacy role → `SYSTEM_ROLE_DEFAULTS` lookup in `permissions.ts`
4. All-false fallback

### The 78 Permissions

All permission keys live in `src/lib/permissions.ts`. They map directly to `canView*` / `canManage*` boolean flags on the `Permissions` type. Key ones developers will encounter:

```typescript
// Manufacturing
canViewCapaManagement
canViewGrcFrameworks        // gates most compliance modules
canViewAuditWorkspace
canViewAuditTrail
canViewLicenseVault

// Governance
canViewPolicies / canManagePolicies / canPublishPolicies
canViewVendors / canManageVendors
canViewGrcControls / canManageGrcControls

// Platform
canManageRoles
canViewPlatformJobs
canViewWebhooks
canManageApiKeys
```

### Industry Profile Suppression

When `profile.industry_type === 'Logistics & Courier'` (the `isLogisticsProfile` flag in `permissions.ts`):
- **Hidden from logistics:** GMP Inspection, Batch Release, Supplier Qualification, Regulatory Affairs, CTD Dossier, SON Compliance, Pharma Integrations, Claim Extraction, Social Listening, Agency Portal, Channel Rules, Translation, Content Blocks, Website Monitoring, Programmatic Ads
- **Shown only for logistics:** Contraband Rejection, Shipment Event Log, CN22/CN23 Declarations

This is how one codebase serves both verticals without a fork.

---

## 6. Navigation & Routing

### Routing System

The app does **not** use React Router. Routing is driven by an `activePage` string state in `App.tsx`. `MainLayout.tsx` renders a sidebar with nav items that call `setActivePage(routeKey)`. A large switch statement in `App.tsx` renders the correct component.

**To add a new route:**
1. Add the route key to the switch in `App.tsx` with the component and permission guard
2. Add the nav item in `MainLayout.tsx` under the appropriate group

**Route guard pattern:**
```tsx
case 'my-new-module':
  if (!perms.canViewMyNewModule) return <AccessDenied />;
  return <MyNewModulePage />;
```

**Feature gate pattern** (for plan-gated features):
```tsx
case 'grc-frameworks':
  if (!perms.canViewGrcFrameworks) return <AccessDenied />;
  return (
    <FeatureGate feature="grc_frameworks">
      <GrcFrameworksPage />
    </FeatureGate>
  );
```

### Navigation Groups (10 groups in MainLayout.tsx)

| Group | Key Modules |
|-------|------------|
| Overview | Dashboard, Compliance Report, AI Insights, Team Chat |
| Manufacturing & Quality | Batch Release, CAPA, Change Control, SOP Library, GMP Inspection, Supplier Qual *(pharma only)* / Contraband Rejection, Shipment Log, CN Declarations *(logistics only)* |
| Governance & Policy | Policies, GRC Posture, GRC Frameworks, Controls, Automation, Obligations, Risk Register, Compliance Alerts, AI Audit Prep |
| Content & Marketing Compliance | Upload, Legal Review, Content Blocks, Archive, Channel Rules, Claim NLP, Translation, Agency Portal, Consent |
| Regulatory Intelligence | Framework Library, Control Health, Reg Affairs, SON Compliance, CTD Dossier, Regulations Ledger, Reg Library, Horizon Scanning, Drift Monitor, Policy Assistant |
| Risk & Monitoring | Risk Modeling, Social Listening, Web Monitoring, Crisis Response, Whistleblower, Ad Compliance |
| Provider & Vendor | Vendor Scorecard, Vendors, License Vault |
| AI Governance | AI Dashboard, Assets, Usage, Reviews, Prompts, Incidents |
| Audit & Evidence | Audit Trail, Audit Workspace |
| Administration | Billing, Company Settings, Members, Invites, Departments, Integrations, Webhooks, Platform Jobs, Role Management, Training Log, Training Sim |

**Auditor Portal Mode:** If `profile.role === 'auditor'`, the entire nav collapses to show only Audit Sessions. This gives external auditors a clean, restricted interface.

---

## 7. Onboarding Flow

New account owners go through a 3–4 step wizard (`src/components/Onboarding/OnboardingWizard.tsx`):

**Step 1 — Company Profile**
- Company name input
- Industry type selector: Pharmaceuticals, Biotechnology, Medical Devices, Cosmetics, Food & Nutraceuticals, Healthcare Services, CRO, Advertising & Marketing, **Logistics & Courier**, Financial Services, Food & Beverage, Other
- This selection sets `profile.industry_type` and drives module visibility for the entire company

**Step 2 — Regulatory Focus**
- Multi-select: Primary Markets (jurisdiction-based, filtered by industry)
- Multi-select: Product Categories (category-based, filtered by industry)
- On completion: **seeds** obligations, licences, and policies from industry templates (`src/lib/governance/obligationTemplates.ts`, `licenceSeedTemplates.ts`, `policyTemplates.ts`)

**Step 3 — Your Role**
- Executive/Admin OR Legal Partner

**Step 4 — Partner Details** (legal_partner only)
- Jurisdictions, specialties, firm name, hourly rate, bio

**Post-onboarding:** A one-time setup checklist (stored in localStorage) prompts admin/exec/compliance users to: create a department, add a policy, set obligations, invite team.

**Invited users** skip the wizard entirely — `onboarding_completed = true` is set automatically.

---

## 8. Existing Modules — Complete Reference

### MANUFACTURING & QUALITY

---

#### Batch Release
**Files:** `src/components/BatchRelease/` | `src/lib/pharma/batchReleaseService.ts`  
**DB Tables:** `batch_records`, `batch_qc_results`  

Manages the pharmaceutical batch QC lifecycle. A batch moves through: `qc_pending → qc_in_progress → hold / released / rejected → archived`. QC test results (test name, method, spec, actual result, pass/fail) are stored per batch. The module displays status-filtered views with counts, supports hold reason tracking, and renders a next-action workflow bar.

**What's complete:** Full status lifecycle, QC result recording, hold management, filtering.  
**What's missing:** In-process QC stages (only final QC today), raw material receipt and testing records, Certificate of Analysis generation (see new builds).

---

#### SOP Library
**Files:** `src/components/SopLibrary/` | `src/lib/pharma/sopService.ts`  
**DB Tables:** `sop_documents`, `sop_versions`, `sop_acknowledgements`  

Document control for Standard Operating Procedures. SOPs have a version history (draft → effective). Users must acknowledge published versions. Tracks review due dates and flags overdue reviews. Supports category-based organization (quality, security, operations, etc.).

**What's complete:** SOP creation, versioning, acknowledgement, overdue alerts, category filtering.

---

#### CAPA Management
**Files:** `src/components/CapaManagement/` | `src/lib/capaService.ts`  
**DB Tables:** `capa_records`, `capa_actions`  

Corrective and Preventive Actions. Sources: audit findings, compliance failures (auto-created when a GRC control test fails), near misses, customer complaints, regulatory actions (auto-created when an obligation goes overdue), internal review. Status workflow: `open → investigating → action_planned → in_progress → verification → closed`. Sub-actions are tracked per CAPA with assignment and due dates.

**Auto-creation triggers (critical to understand):**
- A GRC control test returning `fail` → `controlMonitoringService.ts` auto-creates a CAPA linked to that control
- An obligation passing its due date → `obligationService.escalateOverdueObligations()` auto-creates a CAPA with source `regulatory_action`
- Both deduplicate — checks for existing open CAPA before creating

**What's complete:** Full lifecycle, sub-actions, auto-creation from controls and obligations, deduplication.

---

#### Change Control
**Files:** `src/components/ChangeControl/` | `src/lib/pharma/changeControlService.ts`  
**DB Tables:** `change_controls`  

Tracks changes to SOPs, formulations, equipment, and processes. Change types: process, system, formula, equipment. Categories: minor, major, emergency. Workflow: `draft → impact_assessment → pending_approval → approved → implementing → verification → closed`. Includes regulatory impact flag and validation required flag. Impact assessment documented inline.

**What's complete:** Full workflow, all change types, regulatory/validation flags.

---

#### GMP Inspection
**Files:** `src/components/GmpInspection/GmpInspectionPage.tsx` | `src/lib/gmpInspectionService.ts`  
**DB Tables:** `gmp_readiness_log`  

A self-assessment readiness checker across 7 areas: personnel, equipment, sanitation, materials, operations, documentation, QA. ~100+ items per company, each with status: `ready / in_progress / gap / not_applicable`. Calculates an overall readiness score (% ready of applicable items). Flags critical gaps (immediate fail risk). Notes and action owners tracked per item.

**What's complete:** Readiness assessment, scoring, critical gap identification, notes.  
**What's missing:** The current checklist is generic. The NASCO compliance expert provided the exact NAFDAC inspection criteria — this module needs expansion (see Section 13, Item 6). Also missing: inspector finding capture for live unannounced inspections.

---

#### Training Simulation
**Files:** `src/components/TrainingSimulation/` | `src/lib/complianceTrainingSimService.ts`  
**DB Tables:** `training_scenarios`, `scenario_attempts`  

Scenario-based training where users submit written responses to compliance scenarios. AI grades responses (pass/fail with score and explanation). Difficulty levels: beginner, intermediate, advanced. Scenario types: off-label question, misleading claims, adverse event reports, social media posts. Tracks per-user pass rates.

**What's complete:** Full scenario creation, AI grading, attempt tracking, pass rate.

---

#### Training Log
**Files:** `src/components/Training/TrainingLogPage.tsx`  
**DB Tables:** `scenario_attempts` (read from training simulation)  

Displays a log of all training simulation quiz answers across the company. Filterable by jurisdiction and user. Shows overall stats (total attempts, correct rate, unique active users). **This module currently only tracks quiz answers from the simulation — it does not support logging of external/offline training courses, certifications, or medical fitness certificates.** This is a known gap (see Section 12).

---

### GOVERNANCE & POLICY

---

#### GRC Frameworks
**Files:** `src/components/GrcFrameworks/` | `src/lib/grc/grcFrameworkService.ts`  
**DB Tables:** `grc_frameworks`  

The framework library. Companies can add and manage compliance frameworks: ISO 9001, ISO 13485, NAFDAC GMP, SON ManCap, NIST CSF, SOC 2, HIPAA, etc. Each framework has a version, status (active/inactive/draft), and a control count. The platform seeds default frameworks at onboarding based on industry type.

---

#### GRC Controls
**Files:** `src/components/GrcControls/` | `src/lib/grc/grcControlsService.ts`  
**DB Tables:** `grc_controls`, `grc_control_snapshots`, `grc_control_evidence`, `grc_control_tests`, `grc_test_runs`  

The control library. Each control belongs to a framework, has a reference code (e.g., `NAFDAC-GMP-001`), domain category, owner, and status. Controls can have:
- **Evidence linked** from `content_submissions` (valid/expired/missing)
- **Snapshots** — point-in-time compliance status (compliant/non_compliant/partial/unknown)
- **Automated tests** — defined pass/fail criteria that produce `grc_test_runs`

A failing test run triggers auto-CAPA creation (see CAPA Management above).

---

#### GRC Automation
**Files:** `src/components/GrcAutomation/` | `src/lib/grcAutomation/`  
**DB Tables:** `grc_control_tests`, `grc_test_runs`, `grc_test_run_evidence`  

Allows defining automated tests for controls and running them. Each run produces a pass/fail result with attached evidence. Results feed into the correlation engine and the control health dashboard.

---

#### Risk Register
**Files:** `src/components/Governance/Risks/` | `src/lib/governance/riskRegisterService.ts`  
**DB Tables:** `risks`, `risk_links`, `company_risk_posture`  

Enterprise risk register with likelihood/impact scoring. Risk categories: security, privacy, operational, financial, legal, compliance. Risks can be linked to controls, policies, obligations, vendors, CAPAs. Updating a risk triggers `recomputeCompanyRiskPosture()` which updates the company's overall risk score (0–100) using a weighted signal model.

**Auto-creation:** The correlation engine auto-creates risks when multi-signal thresholds are breached (see Section 9).

---

#### Obligations Tracker
**Files:** `src/components/Governance/Obligations/` | `src/lib/governance/obligationService.ts`  
**DB Tables:** `regulatory_obligations`, `obligation_links`  

Operationalizes regulatory requirements into trackable tasks. Each obligation has a jurisdiction, due date, owner, and status (identified/implemented/monitored). Obligations can be linked to controls, policies, risks, and vendors. Overdue obligations auto-escalate to CAPAs via `escalateOverdueObligations()`.

**What's missing:** Recurring obligation support (e.g., SON quarterly check that auto-creates the next obligation on completion). Currently obligations are one-time records.

---

#### Policies
**Files:** `src/components/Governance/Policies/` | `src/lib/governance/policyService.ts`  
**DB Tables:** `policies`, `policy_versions`, `policy_acknowledgements`  

Policy lifecycle from draft to published. Status flow: `draft → under_review → pending_approval → approved → published → archived`. Each version can require acknowledgement from all users. Acknowledgement completion is tracked and surfaces in the Command Center.

---

#### Compliance Alerting Engine
**Files:** `src/components/Alerts/ComplianceAlertingPage.tsx` | `src/lib/complianceAlertingService.ts`  
**DB Tables:** `compliance_alert_rules`, `compliance_alert_log`  

A rules-based engine that fires alerts when compliance conditions are breached. Current trigger types (5):
- `capa_overdue` — CAPA past due_date
- `licence_expiring` — licence_expiry_date within threshold days
- `obligation_overdue` — obligation past due_date
- `control_non_compliant` — latest GRC snapshot = non_compliant
- `deviation_raised` — new CAPA in last 24 hours (disabled by default)

Each rule is configured with: threshold_days, escalation_days, notification channels (email, in-app, owner, admins). Firing is triggered manually or by calling the `compliance-alert-scanner` Edge Function.

**What's missing:** 3 new trigger types needed (medical_certificate_expiring, environmental_test_overdue, cleaning_overdue) — see Section 14.

---

#### AI Audit Preparation Engine
**Files:** `src/components/AuditPrep/AuditPrepPage.tsx` | `src/lib/auditPrepService.ts`  
**DB Tables:** `audit_prep_sessions`, `audit_prep_items`  
**Edge Function:** `supabase/functions/audit-prep-assembler`  

Creates audit prep sessions for specific audit types (NAFDAC, GMP, ISO, FDA, WHO, SON, ECJU, internal, custom). On trigger, an Edge Function assembles evidence from all modules: batch records, CAPAs, controls, licences, SOPs, policies, obligations, risks, change controls. An LLM generates an AI readiness assessment (text summary). Session states: `draft → assembling → ready → exported`. Frontend polls every 3 seconds until ready (max 2 minutes). Exports a structured text file.

**What's missing:** Inspection-type-specific evidence packages (NAFDAC scheduled vs. unannounced vs. SON quarterly require different document sets). New facility log types (environmental monitoring, cleaning records, water treatment, pest control) are not yet evidence sources.

---

#### Audit Trail
**Files:** `src/components/AuditTrail/AuditTrailPage.tsx` | `src/lib/auditService.ts`  
**DB Tables:** `audit_logs`  

The immutable, SHA-256 hash-chained compliance ledger. Every mutation across the platform calls `recordAuditEvent()` which inserts a row with the previous entry's hash (chain). Supports: chain integrity verification, evidence snapshot capture, PDF and JSON sealed exports. The chain cannot be altered — any tampering is detectable via `verifyChainIntegrity()`.

**This is non-negotiable infrastructure.** Never UPDATE or DELETE rows in `audit_logs`. Never skip calling `recordAuditEvent()` when building new modules.

---

#### Command Center
**Files:** `src/components/Governance/CommandCenter/CommandCenterPage.tsx` | `src/lib/governance/commandCenterService.ts`  

Executive-level intelligence dashboard. Aggregates: risk posture score, max risk level, overdue audits, risk distribution heatmap, vendor pulse (risk by category), policy compliance rate (% users acknowledged), automation health (pass/fail test trends), audit velocity, top 5 open risks, regulatory exposure summary. Also has a "Run Correlation Evaluation" button that manually triggers the signal correlation engine.

---

#### Audit Workspace
**Files:** `src/components/Governance/Audits/` | `src/lib/audit/auditWorkspaceService.ts`  
**DB Tables:** `audit_sessions`, `audit_session_participants`, `audit_requests`, `audit_request_items`, `audit_request_evidence`  

Manages formal audit sessions (internal, external, SOC 2, ISO, etc.) with participant rosters and structured evidence request/response cycles. External auditors with the `auditor` role see only this section of the platform.

---

### REGULATORY INTELLIGENCE

---

#### Horizon Scanning
**Files:** `src/components/HorizonScanning/` | `src/lib/horizonScanningService.ts`  
**DB Tables:** `regulatory_alerts`, `affected_content`, `control_flags`, `horizon_subscriptions`  

Monitors for upcoming regulatory changes. Fetches regulatory alerts by industry type, assesses which company assets are affected, generates AI impact recommendations, auto-flags GRC controls when alerts affect them, and allows creating obligations directly from alerts. Consultation periods tracked. Currently seeded for pharma regulators (FDA, EMA, MHRA, NAFDAC, TGA, WHO, SON).

---

#### Regulatory Affairs
**Files:** `src/components/RegulatoryAffairs/` | `src/lib/regulatoryAffairsService.ts`  
**DB Tables:** `regulatory_submissions`, `regulatory_licences`, `submission_status_log`  

Tracks regulatory submissions to NAFDAC, SON, Ministry of Health. Submission types: local_manufacture, importation, export. Each submission moves through a status lifecycle with a log. The Licence Vault (`src/components/LicenseVault/`) provides the certificate tracking side.

---

#### SON Compliance
**Files:** `src/components/SONCompliance/` | `src/lib/sonComplianceService.ts`  
**DB Tables:** `son_audits`, `son_mancap_applications`, `son_certificates`  

Standards Organisation of Nigeria compliance tracking. Covers SON audits, ManCap (Manufacturing Capacity) applications, and SON certificates. This feeds into the obligations tracker for quarterly SON check recurring obligations (pending implementation — see Section 14).

---

#### CTD Dossier
**Files:** `src/components/CTDDossier/` | `src/lib/ctdDossierService.ts`  
**DB Tables:** `ctd_dossiers`, `ctd_module_progress`, `ctd_documents`  

Common Technical Document dossier management for pharmaceutical product registration. Tracks Modules 1–5 progress (not_started/in_progress/complete/not_applicable) with document uploads per module. Application types: new_registration, renewal, variation, generic.

---

#### Licence Vault
**Files:** `src/components/LicenseVault/` | `src/lib/licenseService.ts`  
**DB Tables:** `licenses`, `license_renewal_tasks`  

Tracks NAFDAC registration certificates, SON licences, and other company-level licences. Displays expiry status (active, expiring soon, expired) with days remaining. Animated expiry ring for near-expiry licences. Auto-generates renewal tasks. Filterable by status.

**What's missing:** Personnel-level certificate tracking (medical fitness certificates) — currently only supports company-level licences. See Section 14.

---

### AUDIT & EVIDENCE (already covered above)

---

### VENDOR & PROVIDER

---

#### Vendors
**Files:** `src/components/Vendors/` | `src/lib/vendorService.ts`  
**DB Tables:** `vendors`, `vendor_profiles`, `vendor_documents`, `vendor_risk_profiles`  

Vendor master list with category (cloud, payment, marketing, legal, logistics_carrier, customs_broker, last_mile) and risk level. Security review status and last review date tracked. Vendor category list adapts based on industry profile (logistics companies get carrier-specific categories).

---

#### Vendor Scorecard
**Files:** `src/components/VendorScorecard/` | `src/lib/vendorScorecardService.ts`  
**DB Tables:** `vendor_scorecards`, `vendor_audits`  

Vendor risk assessment and audit history. Each vendor has an overall compliance score (0–100) and risk tier (low/medium/high/critical). Audit types: initial, periodic, for_cause, follow_up. Each audit records score, auditor, and findings. Vendors can be suspended/reactivated.

---

### LOGISTICS-SPECIFIC MODULES

These routes are **only visible when `isLogisticsProfile = true`**.

---

#### Contraband Rejection
**Files:** `src/components/ContrabandRejection/ContrabandRejectionPage.tsx` | `src/lib/contrabandService.ts`  
**DB Tables:** `contraband_rejection_log`, `customer_flags`  

Contraband intake-to-rejection workflow. Staff flag a shipment, document findings, select rejection reason, generate an immutable rejection record, and optionally flag the customer for future monitoring. Rejection records auto-log to Audit Trail.

---

#### Shipment Event Log
**Files:** `src/components/Logistics/` (ShipmentEventLogPage) | `src/lib/shipmentEventService.ts`  
**DB Tables:** `shipments`, `shipment_events`  

Logistics-level audit trail at the individual shipment level. Event types: registered, weighed, declared, dispatched, customs_cleared, delivered, rejected, exception. Each event is timestamped with staff attribution. This is the chain-of-custody record for customs disputes and insurance claims.

---

#### CN22/CN23 Declaration Logger
**Files:** `src/components/Logistics/CN2223DeclarationPage.tsx` | `src/lib/customsDeclarationService.ts`  
**DB Tables:** `cn_declarations`  

Structured form for international customs declarations. CN22 (items under £270) vs CN23 (items over £270). Captures: item description, declared value, HS code (optional), item count, weight. Field validation enforces correct description format. Produces dated declaration records.

---

## 9. The Intelligence Layer — How Modules Wire Together

This is the most important architectural concept to understand. **Modules are not isolated.** There is a bidirectional signal propagation system that connects every compliance event across the platform.

### Signal Flow Diagram

```
TIER 1: DATA CHANGES (Raw Signals)
────────────────────────────────────────
Control test → fail result
Obligation → passes due_date
Licence → within expiry threshold
CAPA → past due_date
Policy acknowledgement → overdue
Vendor → risk_score ≥ 70

         ↓ all recorded in audit_logs

TIER 2: DIRECT CASCADE (Immediate, automatic)
────────────────────────────────────────
Control test fail
  → controlMonitoringService checks for existing CAPA
  → if none: createCapa(source='compliance_failure', control_id)
  → audit event recorded

Obligation past due_date
  → escalateOverdueObligations() [scheduled or manual]
  → createCapa(source='regulatory_action', priority='high')
  → deduplication check prevents duplicates

Alerts Engine (manual scan or scheduled)
  → evaluates all active alert_rules
  → fires compliance_alert_log entries
  → sends notifications (email, in-app, owner, admins)

         ↓ CAPAs surface in dashboard KPIs
         ↓ Alerts surface in Alerts module

TIER 3: CORRELATION ENGINE (Multi-signal, triggered manually or scheduled)
────────────────────────────────────────
correlationService.evaluateSignalsAndTriggerEvents()
  ├── counts last-7-day signals:
  │     automation_failures (grc_test_runs where result='fail')
  │     high_vendor_risks (vendors where risk_score ≥ 70)
  │     overdue_policy_acks
  │     pending_obligations
  │
  ├── evaluates correlation_rules:
  │     "High Vendor Risk + Automation Failure" → if both thresholds breached
  │     "Policy Gap + Non-Compliant Controls" → if obligation count breached
  │
  └── for each triggered rule:
        createCorrelationEvent()
        createRisk()  ← auto-creates Risk Register entry
        recordAuditEvent()
        enqueueWebhook('vendor.risk.changed')
        recomputeCompanyRiskPosture()

         ↓ Risk appears in Risk Register
         ↓ Risk posture score updated (used in Dashboard KPIs)
         ↓ Command Center reflects updated intelligence
```

### Risk Posture Scoring

`src/lib/governance/riskScoringService.ts` computes the company risk posture (0–100) using weighted signals:

| Signal | Weight |
|--------|--------|
| GRC control compliance rate | 35% |
| Vendor risk (avg vendor score) | 25% |
| Policy acknowledgement rate | 20% |
| Automation test pass rate | 10% |
| Open audit request ratio | 10% |

Score is stored in `company_risk_posture` and displayed on the Dashboard KPI strip and Command Center.

### Webhook Propagation

`src/lib/platform/webhookService.ts` enqueues external webhook deliveries for:
- `vendor.risk.changed` — on risk create/update
- `capa.created` — on new CAPA
- `obligation.escalated` — on CAPA from obligation

Subscribed endpoints receive JSON payloads asynchronously. Delivery is tracked in `webhook_deliveries` with retry logic.

### Governance Job Tracking

All async operations (correlation runs, compliance scans, retention sweeps) are tracked in `governance_job_runs`. Status: `queued → running → completed / failed`. The Platform Jobs admin page surfaces this for ops visibility.

---

## 10. The AI Layer

### What Uses AI

| Feature | Service | AI Provider | How |
|---------|---------|------------|-----|
| Audit Prep Assembly | `auditPrepService.ts` + Edge Function | Gemini (via `geminiClient.ts`) | Assembles evidence, generates readiness summary |
| Compliance Alerting Scan | Edge Function `compliance-alert-scanner` | Rule-based (no LLM) | Pure DB queries against rules config |
| AI Insights Narrative | `aiInsightsService.ts` | Gemini | Executive summary of compliance posture |
| Smart Alerts | `aiInsightsService.ts` | Rule-based pattern detection | No LLM — detects batch hold rates, CAPA volume, SOP overdue |
| Policy Assistant | `policyAssistantService.ts` | Gemini | Drafts policy text from templates |
| Training Simulation Grading | `complianceTrainingSimService.ts` | Gemini | Grades user training scenario responses |
| Content Compliance Analysis | `complianceEngine.ts` + `aiRiskService.ts` | Gemini | Rules + LLM for marketing content review |

### The LLM Gateway

`src/lib/geminiClient.ts` provides a `generateText(prompt)` function that:
1. Calls Google Gemini as primary
2. Falls back to Anthropic if Gemini fails
3. Wraps in `wrapAICall()` for graceful degradation (returns null on failure, never crashes the app)

**When building AI-powered features:** Always use `geminiClient.ts`. Never call AI providers directly. Always handle null returns (graceful degradation when AI is unavailable).

---

## 11. Industry Profiles (Pharma vs Logistics)

The platform currently serves two industry profiles with one codebase:

| | Pharma Manufacturing | Logistics & Courier |
|--|---------------------|---------------------|
| `industry_type` value | `Pharmaceuticals` (or similar) | `Logistics & Courier` |
| `isLogisticsProfile` flag | false | true |
| Modules visible | All pharma modules | Contraband, Shipment Log, CN Declarations |
| Modules hidden | Contraband, Shipment, CN | Batch Release, GMP, Regulatory Affairs, CTD, SON, Claim NLP, Social, Agency, Channel Rules, Translation, Programmatic Ads |
| Vendor categories | Generic | logistics_carrier, customs_broker, last_mile |
| GRC frameworks seeded | NAFDAC GMP, SON ManCap, ISO 13485 | ISO 28000, TAPA FSR, AEO, ISO 9001 |
| Obligation seeds | NAFDAC-specific | UK VAT, Companies House, ICO, NCAA, CAC |
| Alert types | capa_overdue, licence_expiring, etc. | Same + future: contraband_incident |

**Adding a new vertical:** Add the industry to `StepCompanyProfile.tsx` dropdown, add template seeds in `governance/obligationTemplates.ts` + `licenceSeedTemplates.ts`, add module suppression conditions in `permissions.ts` (`isLogisticsProfile` pattern).

---

## 12. Modules Requiring Further Engineering

These modules exist but are incomplete and need engineering work before they are production-ready.

### Training Log — NEEDS EXPANSION
**Current state:** Only displays results from the training simulation quiz (question_id-based). Has no way to log: external training courses attended, offline certifications, medical fitness certificates, mandatory induction records.  
**Required:** A proper training record management system where HR/Compliance can manually log training events per employee with: training type, date, provider, certificate number, expiry date, uploaded certificate document.

### GMP Inspection — NEEDS EXPANSION
**Current state:** A generic self-assessment readiness checklist. Items are internal to the company.  
**Required:** (1) The checklist items must be replaced/expanded with the exact NAFDAC inspection criteria from the compliance expert meeting (facility location, unidirectional flow, wall/floor/ceiling materials, lux measurements, disinfection stations, flood/drainage assessment). (2) A separate flow for capturing actual findings raised by an inspector during a live visit — these are different from self-assessment items.

### Batch Release — NEEDS EXPANSION
**Current state:** Tracks final batch QC only.  
**Required:** In-process QC stages (intermediate testing points during manufacturing, not just final release testing) and raw material receipt/testing records (RM testing before use in batch).

### Obligations Tracker — NEEDS RECURRING SUPPORT
**Current state:** Each obligation is a one-time record.  
**Required:** Recurring obligation support. When a recurring obligation (e.g., SON quarterly audit, annual ICO registration renewal) is marked complete, the system should automatically create the next occurrence with the next due date. This is critical for SON quarterly check obligations.

---

## 13. New Builds Required — NASCO Compliance Expert Meeting

The following 8 modules need to be built **from scratch**. They were validated against the actual inspection checklist used by Nigerian pharmaceutical regulators (NAFDAC, SON). All 8 are greenfield — no existing component, service, or DB table covers them.

The overall build priority order is given in Section 15.

---

### BUILD 1 — Certificate of Analysis (CoA) Generator
**Priority: HIGH — Build first**  
**Why it matters:** Named explicitly in the expert meeting as the single largest automation gap in Nigerian pharma. Every company — including multinationals — generates CoAs manually by copying QC test results into Word documents. This is the feature that justifies a subscription on its own.

**What to build:**

*Database:*
```sql
CREATE TABLE certificate_of_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  batch_id uuid REFERENCES batch_records(id),
  control_number text UNIQUE NOT NULL,  -- auto-generated, e.g. COA-2026-0001
  version integer DEFAULT 1,
  product_name text,
  batch_number text,
  manufacturing_date date,
  expiry_date date,
  test_summary jsonb,           -- pulled from batch_qc_results
  conformance_statement text,   -- AI-generated
  conclusions text,             -- AI-generated
  qc_approved_by uuid REFERENCES profiles(id),
  qc_approved_at timestamptz,
  status text DEFAULT 'draft',  -- draft | approved | issued
  created_at timestamptz DEFAULT now()
);
```

*Service:* `src/lib/pharma/coaService.ts`
- `generateCoa(batchId)` — pulls all `batch_qc_results` for the batch, structures them into the CoA format, calls AI for conformance statement and conclusions
- `approveCoa(coaId, userId)` — QA sign-off with timestamp
- `exportCoaPdf(coaId)` — renders to PDF
- `listCoas(companyId)` — list with filtering

*Component:* `src/components/CoaGenerator/`
- CoA list view (linked from Batch Release page — "Generate CoA" button on released batches)
- CoA detail/preview page
- QA approval workflow
- PDF export button

*Integration points:*
- Batch Release: Add "Generate CoA" action on batches with status `released`
- Audit Prep: Add CoA records as an evidence type
- Audit Trail: Log CoA creation, approval, and export events

*AI prompt (for conformance statement):*
```
Given the following batch QC results: [test_name, specification, result, pass/fail]
Generate:
1. A conformance statement (1 sentence: does the batch conform to specifications?)
2. A conclusions section (2-3 sentences: summary of all test results and release decision)
Format professionally as would appear on a pharmaceutical Certificate of Analysis.
```

---

### BUILD 2 — Medical Fitness Certificate Tracker
**Priority: HIGH — Build second**  
**Why it matters:** 6-month renewal cycle named explicitly by the compliance expert. Production staff with expired medical certificates cannot legally work in the manufacturing area. Currently no company tracks this systematically.

**What to build:**

*Database:*
```sql
CREATE TABLE medical_fitness_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  user_id uuid REFERENCES profiles(id),
  employee_name text,
  issue_date date NOT NULL,
  expiry_date date NOT NULL,
  issuing_doctor text,
  issuing_clinic text,
  certificate_file_url text,
  production_cleared boolean DEFAULT true,  -- false if expired
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

*Service:* `src/lib/medicalFitnessService.ts`
- `listCertificates(companyId)` — with expiry status computed
- `createCertificate(data)` — record issue
- `getExpiredOrExpiring(companyId, daysThreshold)` — for alerting
- Computed status: `valid | expiring_soon (≤30 days) | expired`

*Component:* `src/components/MedicalFitness/MedicalFitnessCertPage.tsx`
- Employee certificate list with expiry status badges
- Add certificate modal (per employee, upload certificate file)
- Expired employees flagged as "not cleared for production"
- Summary card: X certificates expiring this month, Y expired

*Integrations:*
- **Alerting Engine:** Add `medical_certificate_expiring` trigger type (fires 30 days before expiry, configurable). Add to `complianceAlertingService.ts` trigger enum and scan logic.
- **Training Log:** Surface medical fitness certificates as a tracked document type alongside training records (a future unified personnel record view)
- **Audit Trail:** Log all certificate additions and updates
- **Navigation:** Add under Administration group initially; can move to Manufacturing & Quality later

---

### BUILD 3 — Environmental Monitoring Log
**Priority: HIGH**  
**Why it matters:** Top audit failure point named by compliance expert. Microbiological surface swabs and air sampling are mandatory for any pharma manufacturing facility. No platform currently automates this.

**What to build:**

*Database:*
```sql
CREATE TABLE production_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  zone_name text NOT NULL,          -- e.g. "Production Suite A", "Packaging Area"
  zone_type text,                    -- production | packaging | storage | lab | corridor
  classification text                -- Grade A | Grade B | Grade C | Grade D | unclassified
);

CREATE TABLE env_monitoring_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  zone_id uuid REFERENCES production_zones(id),
  test_type text NOT NULL,           -- surface_swab | air_sample | settle_plate | contact_plate
  frequency text NOT NULL,           -- daily | weekly | monthly
  next_due_date date,
  assigned_to uuid REFERENCES profiles(id)
);

CREATE TABLE env_monitoring_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  zone_id uuid REFERENCES production_zones(id),
  schedule_id uuid REFERENCES env_monitoring_schedules(id),
  test_date date NOT NULL,
  test_type text NOT NULL,
  sample_location text,             -- specific location within zone
  result_value numeric,             -- CFU/plate or CFU/m3
  result_unit text,                 -- CFU/plate | CFU/m3
  acceptance_limit numeric,
  alert_limit numeric,
  status text,                       -- pass | alert_limit_exceeded | action_limit_exceeded | fail
  organism_identified text,          -- if any
  tested_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);
```

*Service:* `src/lib/envMonitoringService.ts`
- `getZones(companyId)` / `createZone()`
- `getSchedules(companyId)` — with overdue status computed
- `logResult(data)` — record test result, compute pass/alert/fail status
- `getTrend(zoneId, testType, months)` — trend data for chart
- `getOverdueTests(companyId)` — for alerting

*Component:* `src/components/EnvMonitoring/EnvMonitoringPage.tsx`
- Zone management (create/edit zones)
- Test schedule view (calendar or list, overdue highlighted in red)
- Result entry form
- Trend chart per zone (line chart of CFU values over time — rising trend is a contamination risk signal)
- Link to cleaning records for same zone/date (see Build 4)
- Summary cards: tests due today, overdue, recent failures

*Integrations:*
- **Alerting Engine:** Add `environmental_test_overdue` trigger type
- **CAPA:** If result status = `action_limit_exceeded` or `fail`, prompt user to create CAPA
- **AI Audit Prep:** Add env monitoring records as evidence type
- **Audit Trail:** Log all results

---

### BUILD 4 — Cleaning & Line Clearance Records
**Priority: HIGH**  
**Why it matters:** Explicitly named as the area where most companies fail NAFDAC inspections. Deep cleaning logs, line clearance before each batch, and disinfection records are all mandatory inspection checkpoints.

**What to build:**

*Database:*
```sql
CREATE TABLE cleaning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  zone_id uuid REFERENCES production_zones(id),   -- link to env monitoring zones
  cleaning_date date NOT NULL,
  cleaning_type text NOT NULL,                     -- routine | deep_clean | disinfection
  method text,                                     -- e.g. "Hypochlorite solution 500ppm"
  chemicals_used text,                             -- chemical name + concentration
  contact_time_minutes integer,
  operator_id uuid REFERENCES profiles(id),
  supervisor_id uuid REFERENCES profiles(id),
  verified_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE deep_cleaning_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  zone_id uuid REFERENCES production_zones(id),
  frequency text,              -- weekly | monthly | quarterly
  last_completed date,
  next_due date,
  assigned_to uuid REFERENCES profiles(id)
);

CREATE TABLE line_clearance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  batch_id uuid REFERENCES batch_records(id),      -- which batch follows this clearance
  production_line text,
  clearance_date timestamptz NOT NULL,
  previous_product text,                           -- product run before
  previous_batch_number text,
  checklist_items jsonb,                           -- array of {item, checked, notes}
  cleared_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  status text DEFAULT 'pending',                   -- pending | cleared | failed
  created_at timestamptz DEFAULT now()
);
```

*Service:* `src/lib/cleaningRecordsService.ts`
- `logCleaning(data)` / `listCleaningRecords(companyId, zoneId)`
- `getDeepCleanSchedule(companyId)` — with overdue status
- `createLineClearance(batchId, data)` — called before batch starts
- `approveLineClearance(clearanceId, userId)`
- `getOverdueCleaning(companyId)` — for alerting

*Component:* `src/components/CleaningRecords/CleaningRecordsPage.tsx`
- Tabs: Cleaning Log | Line Clearance | Deep Clean Schedule
- Cleaning log: per zone/date, filterable
- Line clearance: checklist-based form tied to a batch, signature capture (approved_by)
- Deep clean schedule: calendar view with overdue alerts
- Link to env monitoring results for same zone/date

*Integrations:*
- **Alerting Engine:** Add `cleaning_overdue` trigger type
- **Batch Release:** Block batch from proceeding to `qc_in_progress` if line clearance not completed and approved for that batch
- **Environmental Monitoring:** Link cleaning records to env monitoring zones for same date (cleaning → monitoring correlation)
- **AI Audit Prep:** Include cleaning records as evidence type

---

### BUILD 5 — Regulator Access Portal
**Priority: HIGH — Strategically critical**  
**Why it matters:** The compliance expert stated directly that regulators want real-time document access. Without this, companies will be reluctant to put sensitive batch formulations in the platform. This is an adoption gate — not a nice-to-have.

**What to build:**

*Database:*
```sql
CREATE TABLE regulator_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  regulator_user_id uuid REFERENCES profiles(id),
  regulatory_body text,              -- NAFDAC | SON | MDCN | FDA | EMA
  granted_by uuid REFERENCES profiles(id),
  access_start timestamptz,
  access_end timestamptz,            -- time-limited access
  is_active boolean DEFAULT true,
  document_scope jsonb,              -- array of {entity_type, entity_id, visible: bool}
  can_download boolean DEFAULT false,
  can_print boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE regulator_document_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES regulator_access_grants(id),
  regulator_user_id uuid REFERENCES profiles(id),
  entity_type text,                  -- batch_record | sop | policy | capa | licence
  entity_id uuid,
  viewed_at timestamptz DEFAULT now(),
  ip_address text
);
```

*New Role:* Add `regulator` to the role system. This role, when created, has access only to the Regulator Portal view and nothing else.

*Component:* `src/components/RegulatorPortal/`
- **Company side (admin/compliance role):**
  - Grant management UI: create time-limited access grants for specific regulators
  - Document scope selector: which entity types/specific records are visible to this regulator
  - Confidentiality flag: mark batch formulations and sensitive records as Confidential (hidden by default, explicit unlock required)
  - View log: real-time feed of what the regulator has accessed (who, what document, when)
  - Notification: company receives in-app notification every time a regulator views a document
  
- **Regulator side (regulator role):**
  - View-only document list (scoped to what company granted)
  - No download button, no print button (unless company explicitly enabled)
  - Clean, professional interface for regulatory inspectors

*Service:* `src/lib/regulatorPortalService.ts`
- `createGrant(data)` / `revokeGrant(grantId)`
- `getGrantsForCompany(companyId)`
- `getVisibleDocuments(grantId, regulatorUserId)` — respects scope + confidentiality
- `logDocumentView(grantId, entityType, entityId, regulatorUserId)`
- `getViewLogForCompany(companyId)` — company sees all regulator activity

*Integrations:*
- **Audit Trail:** All regulator document views must be recorded (immutable log)
- **Notifications:** Fire in-app notification to company admin/compliance when any view occurs
- **Alerting Engine:** Future: `regulator_access_revoked_auto` trigger (auto-revoke when grant expires)

---

### BUILD 6 — Water Treatment & Pest Control Log
**Priority: MEDIUM**  
**Why it matters:** Both named as explicit audit requirements for wet process manufacturers. Particularly relevant for NAFDAC inspections of injectable and liquid pharmaceutical manufacturers.

**What to build:**

*Database:*
```sql
CREATE TABLE water_treatment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  log_date date NOT NULL,
  water_source text,                 -- municipal | borehole | purified_water_system
  treatment_method text,             -- e.g. "Reverse Osmosis + UV"
  test_lab text,
  microbial_count numeric,           -- CFU/mL
  chemical_result jsonb,             -- {ph: 7.2, tds: 5, conductivity: 1.2}
  result_status text,                -- pass | fail | borderline
  tested_by uuid REFERENCES profiles(id),
  next_test_due date,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE pest_control_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  service_date date NOT NULL,
  service_provider text,
  method text,                       -- physical | chemical | biological
  areas_treated text[],
  findings text,
  evidence_of_pests boolean DEFAULT false,
  corrective_actions text,
  next_service_due date,
  serviced_by_name text,
  created_at timestamptz DEFAULT now()
);
```

*Component:* `src/components/FacilityLogs/FacilityLogsPage.tsx`
- Two tabs: Water Treatment Log | Pest Control Log
- Both with: log entry form, history table, next-due date display, overdue alert
- Water treatment: results chart (microbial counts over time)

*Integrations:*
- **AI Audit Prep:** Include both log types as facility compliance evidence
- **GMP Inspection:** Surface water treatment and pest control status in the facility checklist
- **Audit Trail:** Log all entries

---

### BUILD 7 — Inspection Type Management & Unannounced Mode
**Priority: MEDIUM**  
**Why it matters:** The compliance expert identified 4 distinct inspection types with completely different documentation responses. The platform currently only prepares for scheduled inspections. Unannounced investigative inspections require instant document access — a different UX entirely.

**What to build:**

*Database:*
```sql
-- Add inspection_type to audit_prep_sessions
ALTER TABLE audit_prep_sessions 
ADD COLUMN inspection_type text DEFAULT 'scheduled';
-- Values: scheduled_production | investigative_unannounced | renewal | routine_son_quarterly

-- Evidence package templates per inspection type
CREATE TABLE inspection_evidence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_type text NOT NULL,
  evidence_type text NOT NULL,       -- batch_record | sop | capa | licence | etc.
  is_priority boolean DEFAULT false, -- priority items surfaced first in unannounced mode
  sort_order integer
);
```

*Inspection Types and Their Evidence Sets:*
| Type | Key Evidence |
|------|-------------|
| `scheduled_production` | Full batch records, all SOPs, complete CAPA log, all licences, env monitoring, cleaning records, training records |
| `investigative_unannounced` | Top 10 priority documents (immediately surfaced): batch for current production run, relevant SOP, line clearance record, medical fitness certs for current staff, latest env monitoring, CoA for last batch, NAFDAC licence, GMP checklist status, last CAPA closure, change control log |
| `renewal` | Licence applications, historical batch records (12 months), CAPA closure rate, training records, GMP facility checklist, quality manual |
| `routine_son_quarterly` | SON compliance records, ManCap status, change controls since last quarter, open CAPAs |

*Component additions:*
- **AI Audit Prep:** Add inspection type selector when creating a session. The assembled evidence package adapts based on type.
- **Unannounced Mode:** A prominent "Inspector is here NOW" button on the dashboard (visible only to compliance/admin). One tap → opens a modal with the 10 most-requested documents for an unannounced inspection, all linked, all viewable immediately. This is not a separate page — it's an emergency overlay.

*SON quarterly auto-obligation:*
- When a SON quarterly obligation is marked complete, automatically create the next obligation with due_date = +3 months
- This closes the recurring obligation gap in the Obligations Tracker

---

### BUILD 8 — Facility GMP Compliance Checklist Expansion
**Priority: MEDIUM**  
**Why it matters:** The compliance expert provided the exact NAFDAC GMP facility inspection checklist. The current GMP Inspection module has generic items. Replacing them with the real inspection criteria is essential for the module to be useful in a live audit preparation context.

**What to build:**

This is primarily a **data replacement task** for the GMP readiness items, plus new fields per item.

*Schema additions:*
```sql
ALTER TABLE gmp_readiness_log 
ADD COLUMN last_verified_date date,
ADD COLUMN next_review_date date,
ADD COLUMN evidence_file_url text,
ADD COLUMN evidence_description text;
```

*New inspection areas and items to add to the readiness checklist:*

**Facility Location & Structure:**
- Facility located in approved industrial zone (yes/no + documentation upload)
- Unidirectional flow plan documented (floor plan uploaded)
- Walls: tiled or epoxy-coated, non-particulate-shedding
- Floors: seamless, non-slip, easy to clean
- Ceilings: smooth, non-particle-shedding
- Lighting levels documented per zone (lux measurements)
- Drainage and flood risk assessment completed

**Disinfection & Hygiene:**
- Disinfection station present at each production area entry point
- Disinfection station stocked and serviced record (links to Cleaning Records module)
- Hand hygiene protocol posted and practiced

**Personnel:**
- All production staff have current medical fitness certificates (link to Medical Fitness Tracker — Build 2)
- GMP training completed for all staff (link to Training Log)
- Protective clothing adequate per zone classification

**Equipment:**
- Equipment calibration records current for all QC instruments
- Preventive maintenance schedule active
- Equipment qualification records (IQ/OQ/PQ) on file

**Documentation:**
- Master batch records available for all products
- SOPs available at point of use
- All SOPs within review date

*Component update:* `GmpInspectionPage.tsx` — update the checklist seed data, add `last_verified_date`, `next_review_date`, and `evidence_file_url` fields to the item update modal.

---

## 14. Adjustments to Existing Modules

These are changes to modules that already exist — not greenfield builds.

| Module | Adjustment | Priority |
|--------|-----------|---------|
| **Training Log** | Add medical fitness certificate as a tracked certificate type. Once Medical Fitness Tracker (Build 2) is built, display medical certs alongside training simulation results in a unified personnel compliance view | HIGH |
| **Batch Release** | Add in-process QC stages (intermediate testing during manufacturing) and raw material receipt/testing records. New tables: `batch_inprocess_qc`, `raw_material_receipts` | HIGH |
| **AI Audit Prep** | Add cleaning records (Build 4), environmental monitoring (Build 3), water treatment and pest control (Build 6) as evidence sources. Add inspection-type-specific evidence packages (Build 7). Update `audit-prep-assembler` Edge Function. | HIGH |
| **Alerting Engine** | Add 3 new trigger types: `medical_certificate_expiring` (threshold: 30 days), `environmental_test_overdue` (threshold: 0 days), `cleaning_overdue` (threshold: 0 days). Update `complianceAlertingService.ts` trigger enum and scan logic in Edge Function. | HIGH |
| **GMP Inspection** | Expand to full NAFDAC inspection criteria (Build 8). Add `last_verified_date`, `next_review_date`, `evidence_file_url` fields. | MEDIUM |
| **Regulatory Obligations** | Add recurring obligation support. When `is_recurring = true` and frequency is set, auto-create next obligation on completion. Required for SON quarterly checks. | MEDIUM |
| **Horizon Scanning** | Confirm SON (Standards Organisation of Nigeria) is active as a seeded regulatory body subscription. Add `last_scan_date` and `next_scan_date` display per body. | LOW |
| **Licence Vault** | Add personnel-level certificate category alongside company licences. A new `certificate_category` field distinguishing `company_licence` from `personnel_certificate`. This enables medical fitness certs to appear in Licence Vault with the same expiry tracking. | LOW |

---

## 15. Build Priority & Sequencing

### Wave 1 — Immediate (Builds that close the most critical gaps for a NAFDAC-regulated pharma customer)

| # | Build | Reason |
|---|-------|--------|
| 1 | CoA Generator | Biggest named gap, strongest demo differentiator, standalone value |
| 2 | Medical Fitness Certificate Tracker | Simple build, direct regulatory requirement, connects to Alerting |
| 3 | Environmental Monitoring Log | Top audit failure point, no equivalent anywhere |
| 4 | Cleaning & Line Clearance Records | Second most-cited inspection failure area |
| — | Alerting Engine: add 3 new trigger types | Required for Builds 2, 3, 4 to have real-time alerts |
| — | AI Audit Prep: add new evidence sources | Connects Builds 3 & 4 into the intelligence layer |

### Wave 2 — Strategic (Higher complexity, higher long-term value)

| # | Build | Reason |
|---|-------|--------|
| 5 | Regulator Access Portal | Adoption-critical, unlocks enterprise and government trust |
| 6 | Water & Pest Control Log | Completes the facility compliance picture |
| 7 | Inspection Type Management + Unannounced Mode | Differentiates from every generic GRC tool |

### Wave 3 — Completion (Polish and depth)

| # | Build | Reason |
|---|-------|--------|
| 8 | Facility GMP Checklist expansion | Replaces generic checklist with real NAFDAC criteria |
| — | Training Log expansion | Unified personnel compliance view |
| — | Batch Release in-process QC + RM receipt | Completes pharma manufacturing depth |
| — | Recurring obligations | Required for SON quarterly compliance |

---

## 16. Platform Direction

**Where this is going:** A multi-vertical Compliance Governance OS that any regulated company can onboard, select their industry, and immediately have a compliance infrastructure that reflects their exact regulatory environment — with all the relevant frameworks pre-seeded, the correct modules visible, and AI that understands their context.

**Vertical expansion roadmap:**
- Pharmaceuticals (primary, deepest) — current
- Logistics & Courier (built, logistics modules exist) — current
- Food & Beverage (regulatory: NAFDAC, EFSA, CODEX) — planned
- Financial Services (regulatory: CBN, SEC, FSCA, FCA) — planned
- Healthcare Services (regulatory: MDCN, NMC, PCN) — planned

**The sector profile system** (A1 in the logistics build plan) is the architectural unlock for new verticals — a company onboards, selects their industry, and gets a completely tailored compliance environment. The module visibility system already supports this pattern (`isLogisticsProfile`). Generalizing it to a proper `industryProfile` config is the next infrastructure investment.

**The AI direction:** The platform is moving from rule-based compliance checking toward a genuine compliance intelligence system. The correlation engine and risk posture scorer are the foundation. The next layer is predictive — using historical signal patterns to warn companies about upcoming compliance failures before they happen.

**Never lose sight of:** The audit trail is the spine of everything. Every new module must write to `audit_logs`. Every new feature that changes data must call `recordAuditEvent()`. The immutability of this trail is what makes the platform defensible in a real regulatory inspection.

---

## 17. Developer Getting Started

### Environment Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd Compliance-Governance-OS-main

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GEMINI_API_KEY

# 4. Run dev server
npm run dev

# 5. TypeScript check
npx tsc --noEmit
```

### Database Setup

The `supabase/migrations/` folder contains all migrations in order. Run via:
```bash
supabase db push
```

Or apply manually against your Supabase project. The `schema_snapshot.sql` in `schema/` reflects the current full schema.

### Key Files to Read First (in order)

1. `src/contexts/AuthContext.tsx` — understand the auth/permission model
2. `src/lib/permissions.ts` — understand what each permission key controls
3. `src/App.tsx` — understand routing
4. `src/components/Layout/MainLayout.tsx` — understand navigation structure
5. `src/lib/auditService.ts` — understand the audit trail (mandatory reading before building anything)
6. `src/lib/governance/correlationService.ts` — understand cross-module signal propagation

### Adding a New Module — Checklist

- [ ] Create `src/components/NewModule/NewModulePage.tsx`
- [ ] Create `src/lib/newModuleService.ts` with company_id-scoped queries
- [ ] Add migration in `supabase/migrations/` for any new tables (with RLS policies)
- [ ] Add permission key to `src/lib/permissions.ts` if module needs gating
- [ ] Add route to `src/App.tsx` switch statement
- [ ] Add nav item to `src/components/Layout/MainLayout.tsx` under correct group
- [ ] Wire `recordAuditEvent()` calls for all mutations in the service
- [ ] Add `industry_type` suppression if module is vertical-specific

### Code Conventions

- **Service layer:** All DB access lives in `src/lib/`. Components never call `supabase` directly — they call service functions.
- **Types:** Use `database.types.ts` generated types. Add custom types to `src/types/` or inline in service files.
- **Error handling:** Services return `{ data, error }` pattern matching Supabase conventions. Never throw from services — return the error.
- **Graceful AI degradation:** All LLM calls must be wrapped in `wrapAICall()`. The app must function when AI is unavailable.
- **RLS:** Every table must have `company_id` in the RLS policy. Never assume a query is automatically scoped.
- **Audit trail:** Call `recordAuditEvent()` from `src/lib/auditService.ts` on every create/update/delete that has governance significance. This is not optional.

---

*Document ends. Questions: contact the platform architect.*
