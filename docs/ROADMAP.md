# Criateur OS — Launch Roadmap
## March 2026 → December 2026

> **MVP Launch Target:** September 1, 2026
> **Feature-Complete ("Peak") Target:** December 31, 2026
> **Current Status:** Architecture complete, core libraries built, landing page live, CI/CD operational

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase Overview](#2-phase-overview)
3. [Track A — Product & Engineering](#3-track-a--product--engineering)
4. [Track B — Legal & Compliance](#4-track-b--legal--compliance)
5. [Track C — Business & Partnerships](#5-track-c--business--partnerships)
6. [Track D — Infrastructure & Security](#6-track-d--infrastructure--security)
7. [Third-Party Approvals & Collaborations](#7-third-party-approvals--collaborations)
8. [Team & Hiring Plan](#8-team--hiring-plan)
9. [Risk Register](#9-risk-register)
10. [Success Metrics per Phase](#10-success-metrics-per-phase)
11. [Budget Estimate](#11-budget-estimate)

---

## 1. Executive Summary

Criateur OS is a compliance operating system for pharmaceutical and healthcare companies, targeting the Nigerian/African regulatory market (NAFDAC, FDA, EMA, WHO). The platform is architected and partially implemented. The roadmap below covers the full path from current state to a commercially launched MVP in September 2026, and a feature-complete, enterprise-ready product by December 2026.

The roadmap runs **four parallel tracks** — Product/Engineering, Legal/Compliance, Business/Partnerships, and Infrastructure/Security — because a compliance product cannot launch with gaps in any of these areas. Technical readiness alone is insufficient; legal protection, domain validation, and customer relationships must develop alongside the code.

---

## 2. Phase Overview

| Phase | Period | Focus | Exit Criteria |
|-------|--------|-------|---------------|
| **Phase 0 — Foundation** | April 2026 | Legal setup, pilot recruitment, domain validation | Company registered, lawyer engaged, 2 pilot candidates confirmed |
| **Phase 1 — Core Build** | April–June 2026 | Three core modules bulletproof | Compliance review, audit trail, dashboard fully wired end-to-end |
| **Phase 2 — Private Beta** | July–August 2026 | Pilot customers on live platform | 2–3 companies using platform daily, critical bugs resolved |
| **Phase 3 — MVP Launch** | September 2026 | Public launch, paid tier open | Payment processing live, onboarding self-serve, 5+ paying customers |
| **Phase 4 — Expansion** | October–November 2026 | Remaining modules, enterprise features | All six feature pillars live, SSO available, second jurisdiction pair (FDA/EMA) fully tested |
| **Phase 5 — Peak** | December 2026 | Feature-complete, scale-ready | All modules live, SOC 2 audit initiated, regulatory partnerships established |

---

## 3. Track A — Product & Engineering

### Phase 0 (April 2026) — Prerequisite Technical Work

Before building new features, close existing gaps:

- **Audit `as any` casts** — identify which TypeScript suppressions hide real missing data (tables with no RLS, unimplemented edge functions) vs. safe casts
- **Map module completion** — for all 60+ modules, document: Does it have a UI? Does it have a working Supabase query? Does it have real data flow? This gives an honest baseline
- **Set up staging environment** — separate Supabase project for staging so pilot testing does not happen on production data
- **End-to-end smoke test** — manually walk through every main navigation route and document what works and what dead-ends

---

### Phase 1 (April–June 2026) — Three Core Modules

#### Module 1: Compliance Review Workflow

**Sprint 1.1 (weeks 1–2)**
- Content submission form — rich text / file upload, persists to Supabase `review_submissions` table
- Submission triggers compliance engine scan automatically via edge function
- Scan results (violations, risk score, jurisdiction breakdown) returned and displayed inline
- Submission enters review queue visible to assigned reviewers

**Sprint 1.2 (weeks 3–4)**
- Reviewer actions: Approve, Reject, Request Changes (with required comment)
- Status machine enforced: `draft → submitted → under_review → approved | rejected | changes_requested`
- Email notification on status change (Supabase email or Resend)
- Every status transition automatically writes an audit trail entry

**Sprint 1.3 (weeks 5–6)**
- Multi-jurisdiction scan display — NAFDAC, FDA, EMA results in tabbed view
- AI analysis results surfaced in review UI with severity labels
- Reviewer can override AI findings with documented reason (creates audit entry)
- Basic content history — see all previous versions of a submitted item

**Deliverable:** A compliance officer can submit content, get an automated scan, review findings, and approve or reject — in one unbroken flow.

---

#### Module 2: Audit Trail & Evidence Export

**Sprint 2.1 (weeks 3–4, parallel with 1.2)**
- Audit log view — paginated table of all events, newest first
- Columns: timestamp, action, actor, resource, jurisdiction, risk level
- Filter by: date range, action type, user, status

**Sprint 2.2 (weeks 5–6, parallel with 1.3)**
- Chain integrity check — UI button runs `verifyChainIntegrity()`, displays pass/fail with block count
- Evidence export — sealed JSON package (all entries + hashes) downloadable
- PDF export — formatted audit report suitable for regulatory submission
- Search within audit trail by keyword or record ID

**Deliverable:** A compliance officer can pull any time range of audit records, verify chain integrity, and download a sealed evidence package in under 5 minutes.

---

#### Module 3: Dashboard & Risk Overview

**Sprint 3.1 (weeks 7–8)**
- Replace hardcoded mockup numbers with real Supabase queries
- Compliance score: calculated from ratio of clean vs. flagged submissions in last 30 days
- Active risks: pulled from risk register with counts by severity
- Pending reviews: live count with direct link to queue

**Sprint 3.2 (weeks 9–10)**
- Jurisdiction health panel — per-jurisdiction compliance status (NAFDAC, FDA, EMA)
- Recent audit feed — last 15 entries, live
- Trend chart — compliance score over time (last 90 days)
- Overdue reviews alert — items in `under_review` for more than configured SLA

**Deliverable:** On login, a compliance officer immediately sees their full risk posture, what needs action today, and jurisdiction-level health — with all numbers reflecting real data.

---

### Phase 2 (July–August 2026) — Private Beta

**Sprint 4.1 (weeks 11–13) — Onboarding**
- Company setup wizard — create company, invite users, assign roles
- Brand profile setup — company details, jurisdictions active, regulatory IDs
- Sample data seeder — pre-populate with example submissions so new users see a live dashboard immediately
- Role-based access gates enforced throughout all three core modules

**Sprint 4.2 (weeks 13–15) — Stability & Feedback**
- Weekly sessions with pilot customers — observe them using the platform live
- Bug fixes based on real usage (expect significant surface area here)
- Performance profiling — audit trail queries with 1,000+ entries, dashboard aggregations
- Error monitoring review in Sentry — fix any uncaught exceptions surfaced in pilot

**Sprint 4.3 (weeks 15–17) — Pre-launch Polish**
- Empty states — every page must have a useful empty state, not a blank screen
- Loading skeletons — no layout shift while data loads
- Error states — every failed query shows a recoverable error message
- Mobile responsiveness — compliance officers use tablets; test at 768px
- Print stylesheet for audit reports

---

### Phase 3 (September 2026) — MVP Launch

- Payment integration live (Stripe for international, Paystack for Nigeria)
- Self-serve signup → company creation → first scan in under 10 minutes
- In-app upgrade prompts at feature gates
- Help documentation for three core modules (Notion or in-app)
- Status page live (statuspage.io or equivalent)

---

### Phase 4 (October–November 2026) — Feature Expansion

Priority order based on what drives retention and upsell:

1. **Risk Register** — full CRUD, link risks to submissions and audit events
2. **Legal Review Workflow** — multi-step approval with SLA tracking
3. **Regulatory Change Tracking** — horizon scanning alerts per jurisdiction
4. **GRC Framework Management** — control mapping, evidence linking
5. **AI Governance Module** — LLM usage tracking, incident management
6. **Reporting & Analytics** — exportable compliance reports per period

---

### Phase 5 (December 2026) — Feature-Complete

- All six platform pillars fully implemented
- Enterprise features: SSO/SAML, custom SLA, API access
- Multi-brand support (multiple products under one company account)
- Full FDA and EMA rule sets validated by regulatory advisors
- Webhook integrations (push audit events to external SIEM/GRC tools)

---

## 4. Track B — Legal & Compliance

This track runs from day one and is non-negotiable for a regulated-industry software product. Delays here block the commercial launch entirely.

### April 2026

**Business Registration**
- Register business entity in Nigeria (CAC registration)
  - *Owner:* Founder
  - *Timeline:* 2–4 weeks via CAC online portal or a corporate secretary
  - *Output:* RC Number, Certificate of Incorporation, TIN
- Open a business bank account
- Register for VAT/FIRS tax compliance

**Engage a Technology Lawyer**
- Lawyer must have experience in: Nigerian data protection law (NDPA 2023), SaaS contracts, health/pharma sector preferred
- *Deliverables from lawyer:*
  - Terms of Service
  - Privacy Policy (NDPA + GDPR aligned)
  - Data Processing Agreement (DPA) — required for any enterprise customer
  - Software as a Service Subscription Agreement
  - Non-Disclosure Agreement template (for pilot customers)
  - Limitation of liability clauses specific to compliance software
- *Critical clause:* The ToS must clearly define that Criateur OS is a compliance tool and decision aid — final regulatory responsibility remains with the customer. This is existential. If your AI misses a violation and a customer is fined, your liability exposure without this clause is severe.

### May 2026

**NDPA Registration**
- Register as a Data Controller/Processor with the Nigeria Data Protection Commission (NDPC)
- *Required because:* You process personal data (employee names, user actions, company compliance records)
- *Timeline:* 2–4 weeks
- *Output:* NDPC registration certificate — required to show enterprise customers

**Intellectual Property**
- File trademark application for "Criateur OS" with the Nigerian Trademark Registry (FIPO)
- Document all proprietary algorithms (compliance engine, hash-chain audit system) as trade secrets via lawyer
- Ensure all third-party dependencies (Supabase, Framer Motion, etc.) are reviewed for commercial use licensing

### June 2026

**Pilot Customer Agreements**
- All pilot customers must sign:
  - NDA before any product access
  - Pilot Agreement (free access, feedback obligations, no liability for missed violations during pilot)
  - Data Processing Agreement
- *Do not let any pilot customer use the platform on live regulatory submissions without these signed*

**Cyber Insurance**
- Obtain cyber liability insurance before MVP launch
- Coverage should include: data breach, regulatory fines from third-party claims, business interruption
- *Why now:* Enterprise buyers in pharma often require proof of cyber insurance before signing a contract

### August 2026 (Pre-Launch)

**Legal Review of Platform**
- Lawyer reviews the live platform UX — specifically any language that implies guaranteed compliance outcomes
- Remove or disclaim any phrasing that could be read as a warranty (e.g., "ensures compliance" should be "supports compliance")
- Review pricing page terms, refund policy, and SLA language

---

## 5. Track C — Business & Partnerships

### April 2026 — Pilot Customer Recruitment

**Target profile for pilot customers:**
- Small to mid-size pharmaceutical companies in Nigeria (50–500 employees)
- Active NAFDAC promotional approval obligations
- Has experienced at least one inspection or compliance incident in the last 3 years
- Has a named Regulatory Affairs or Compliance officer who will be the primary user

**Where to find them:**
- MAN (Manufacturers Association of Nigeria) — Pharma division
- NAFDAC-registered manufacturer list (publicly available)
- LinkedIn outreach to Directors of Regulatory Affairs at Nigerian pharma companies
- Pharmaceutical Society of Nigeria (PSN) network
- Personal/professional referrals from your compliance domain advisor

**Pitch to pilots:** Free access for 6 months in exchange for 2 hours per month of structured feedback, a case study at the end, and permission to use their company category (not name) in marketing.

**Target:** 2 pilots confirmed by end of April, platform access granted by July 1.

### May 2026 — Regulatory Domain Advisor

**Engage a Regulatory Affairs Advisor:**
- Former NAFDAC director, regulatory affairs consultant, or senior RA professional at a pharma company
- *Responsibilities:*
  - Validate that compliance engine rules match current NAFDAC guidelines
  - Review audit evidence export format against what NAFDAC actually accepts
  - Advise on which data points inspectors ask for most frequently
  - Review platform language for regulatory accuracy
- *Engagement:* Paid advisory retainer, 4–6 hours per month
- *This person is your most important non-technical hire before launch*

### June 2026 — Payment & Commercial Infrastructure

- Stripe account (international customers, card payments)
- Paystack account (Nigerian customers, local bank transfers, USSD)
- Pricing page linked to payment checkout
- Subscription management (upgrades, downgrades, cancellations)
- Invoice generation (required for Nigerian enterprise procurement)
- Set up accounting software (QuickBooks, Wave, or Zoho Books)

### July 2026 — Partnerships Outreach

**NAFDAC Relationship (Long Game)**
- Initiate contact with NAFDAC's directorate responsible for advertising and promotion (DPRD)
- Goal: Not formal approval (that takes years) but awareness — position Criateur OS as a tool that helps regulated companies comply, not circumvent
- Attend NAFDAC industry engagement events
- *Note:* Do not claim NAFDAC endorsement without explicit written permission. This is a legal minefield.

**Industry Associations**
- Pharmaceutical Manufacturers Group of MAN (PMG-MAN) — apply for associate membership
- Healthcare Federation of Nigeria — introduce product at their events
- ISPE (International Society for Pharmaceutical Engineering) Nigeria chapter — compliance/quality professionals

**Technology Partners**
- Supabase — apply for their startup program if not already (free credits)
- Anthropic, Google (Gemini), OpenAI — apply for startup API credit programs to reduce LLM costs during early growth

### September 2026 — Launch Activities

- Press release to Nigerian tech and pharma trade publications (Technext, Nairametrics, Pharmanewsonline)
- Product Hunt launch (visibility in global SaaS community)
- LinkedIn content campaign — "behind the build" series targeting compliance professionals
- 3 case study drafts ready from pilot customers (even anonymized)

---

## 6. Track D — Infrastructure & Security

### April 2026

**Supabase Audit**
- Engage a senior Supabase developer for a 2-day RLS policy audit
- Review every table's RLS policies for multi-tenant isolation
- Verify that company A cannot query company B's data under any permutation of role or auth state
- *This is the most critical infrastructure task. One RLS gap in a compliance product is company-ending.*
- Fix all identified issues before any pilot customer touches the platform

**Environment Separation**
- Production Supabase project — live customer data only
- Staging Supabase project — pilot testing and development
- Local development — individual developer instances
- Separate environment variables, no shared keys between environments

### May 2026

**Penetration Test**
- Engage a security firm for a focused penetration test on:
  - Authentication flows (signup, login, invite, SSO)
  - Multi-tenant data isolation (can user from company A access company B's data)
  - API endpoints and edge functions
  - File upload handling (content submissions)
- *Budget: $2,000–$5,000 for a focused scope test*
- Remediate all critical and high findings before beta

**Backup & Recovery**
- Automated daily Supabase backups verified (Pro plan includes this)
- Test restoration procedure — actually restore from backup to verify it works
- Document RTO (Recovery Time Objective) and RPO (Recovery Point Objective) for SLA

### June 2026

**Monitoring Stack**
- Sentry configured and alerting (already set up — verify alert rules are correct)
- Uptime monitoring — UptimeRobot or Better Uptime for all critical endpoints
- Database query performance monitoring — identify slow queries before pilot
- Edge function error rate monitoring

**Compliance of the Compliance Platform**
- Run an internal SOC 2 readiness gap assessment (use a checklist, not a full audit)
- Document all controls in place, identify gaps
- *Formal SOC 2 Type I audit can begin in Q4 2026 — enterprise customers will ask for it*

### Ongoing (July–December 2026)

- Monthly dependency updates and security patches
- Quarterly review of third-party service terms (Supabase, LLM providers)
- Incident response plan documented and tested before launch
- NDPA data retention policy implemented in Supabase (automated deletion of data per retention schedule)

---

## 7. Third-Party Approvals & Collaborations

This section catalogs every external entity whose involvement, approval, or relationship is required.

### Regulatory Bodies

| Entity | What You Need | How to Get It | Timeline |
|--------|--------------|---------------|----------|
| **CAC (Corporate Affairs Commission)** | Business registration | Online CAC portal or corporate secretary | April 2026 |
| **FIRS (Federal Inland Revenue)** | Tax Identification Number, VAT registration | FIRS online portal | April 2026 |
| **NDPC (Nigeria Data Protection Commission)** | Data Controller registration | NDPC online portal | May 2026 |
| **NAFDAC** | Awareness/relationship (not formal approval) | Industry engagement events, DPRD directorate meetings | July 2026 onward |
| **FIPO (Federal IP Office)** | Trademark registration | FIPO application | May 2026 |

### Technology Vendors

| Vendor | What You Need | Action Required | Priority |
|--------|--------------|-----------------|----------|
| **Supabase** | Pro or Team plan for production | Upgrade from free tier, enable PITR backups | Before pilot |
| **Supabase** | Startup program credits | Apply at supabase.com/blog/supabase-startup-program | April 2026 |
| **Anthropic** | API access + startup credits | Apply at anthropic.com/startups | April 2026 |
| **Google (Gemini)** | API quota increase + startup credits | Google for Startups program | April 2026 |
| **OpenAI** | API access + usage limits review | Review rate limits for multi-tenant load | April 2026 |
| **Stripe** | Merchant account activation | Standard application, may require business docs | May 2026 |
| **Paystack** | Nigerian payment processing | Apply at paystack.com, requires CAC docs | May 2026 |
| **Resend / SendGrid** | Transactional email (notifications, invites) | Account setup, domain verification | May 2026 |
| **GitHub** | Confirm repo remains private until launch | Review visibility settings | Immediate |

### Professional Services

| Role | What They Deliver | When to Engage | Estimated Cost |
|------|------------------|----------------|----------------|
| **Corporate Secretary / Lawyer** | CAC registration, company setup | April 2026 | ₦150,000–₦300,000 |
| **Technology Lawyer** | ToS, Privacy Policy, DPA, SaaS Agreement, NDA | April 2026 | ₦500,000–₦1,500,000 |
| **Regulatory Affairs Advisor** | Validate compliance engine, audit format, domain accuracy | May 2026 (ongoing) | ₦100,000–₦200,000/month |
| **Security Firm (Pentest)** | Infrastructure penetration test | May–June 2026 | $2,000–$5,000 |
| **Supabase Specialist** | RLS audit across all 136 tables | April 2026 | $500–$2,000 (2 days) |
| **Contract Designer** | UI polish, design system, empty/error states | June–July 2026 | $2,000–$5,000 (3-week sprint) |
| **Part-Time Developer** | Testing, bug fixes, second pair of hands | August 2026 onward | ₦300,000–₦600,000/month |
| **Accountant** | Bookkeeping, tax filing, invoicing setup | June 2026 | ₦50,000–₦100,000/month |
| **Cyber Insurance Broker** | Cyber liability policy | July 2026 | $1,000–$3,000/year |

### Pilot Customers

| What You Need From Them | What They Get | Agreement Required |
|------------------------|---------------|-------------------|
| Primary contact (RA/Compliance Director) as daily user | 6 months free access | Pilot Agreement + NDA + DPA |
| 2 hours/month structured feedback sessions | Case study written about them | Signed before platform access |
| Permission to reference their industry vertical | Early adopter pricing locked in | Written consent clause in Pilot Agreement |
| Real content/submissions run through platform during beta | Priority support + feature requests considered first | — |

---

## 8. Team & Hiring Plan

### Current State
- 1 founder/developer (full-stack, TypeScript/React/Supabase)

### Phase 0–1 (April–June 2026) — Advisors Only
No full-time hires yet. Engage:
- Regulatory Affairs Advisor (retainer)
- Technology Lawyer (project)
- Supabase Specialist (short contract)

### Phase 2 (July–August 2026) — First External Help
- **Contract Designer** (3-week engagement): UI polish before beta
- **Part-time developer** (10–15 hrs/week): Testing, edge cases, bug fixes during pilot

### Phase 3 (September 2026) — Launch
- Evaluate whether customer support load requires a dedicated resource
- If 5+ paying customers, consider a **Customer Success / Onboarding Manager** (can be part-time or contract initially)

### Phase 4–5 (October–December 2026) — Scale Preparation
- **Full-time developer** (if revenue supports it): Accelerate feature expansion
- Formalize Regulatory Affairs Advisor relationship if partnership/institutional backing emerges

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Single-developer illness/burnout delays timeline | High | High | Buffer time built into phases; scope Phase 2 tightly |
| Pilot customer fails to engage meaningfully | Medium | High | Recruit 3 pilots, not 2; structure feedback sessions formally |
| Supabase RLS audit reveals multi-tenant data leak | Medium | Critical | Prioritize audit in April before any real data enters platform |
| NAFDAC rule sets are inaccurate or outdated | Medium | High | Regulatory advisor validates rules by June; accept responsibility clause in ToS |
| LLM API costs exceed budget at scale | Medium | Medium | Rate limit per company, cache common scan results, monitor cost per scan |
| Lawyer engagement delayed, blocking commercial launch | Low | High | Engage lawyer in April; commercial launch cannot proceed without signed ToS/Privacy Policy |
| Competitor launches in Nigerian pharma compliance space | Low | Medium | Speed is your moat; deepen domain specificity; NAFDAC relationship is hard to replicate |
| Stripe/Paystack account rejected or delayed | Low | High | Apply in May; have backup (manual invoice + wire transfer) if delayed |

---

## 10. Success Metrics Per Phase

### Phase 0 (April 2026)
- [ ] Company registered with CAC
- [ ] Lawyer engaged, ToS/Privacy Policy drafted
- [ ] 2 pilot customer candidates confirmed (NDA signed)
- [ ] Supabase RLS audit completed
- [ ] Staging environment live and separate from production

### Phase 1 (June 2026)
- [ ] End-to-end compliance review flow works without dead ends
- [ ] Audit trail records every action in the review workflow
- [ ] Dashboard shows real data from real submissions
- [ ] Zero `as any` casts hiding broken data flows in core modules
- [ ] Smoke test passes on 20+ real content samples with a regulatory advisor present

### Phase 2 (August 2026)
- [ ] 2 pilot companies completing reviews on the platform weekly
- [ ] NAFDAC content scan accuracy validated by regulatory advisor (>85% precision on known violations)
- [ ] Sentry shows <2% error rate across all user sessions
- [ ] Evidence export tested and approved by at least one compliance officer as regulator-ready
- [ ] All critical and high pentest findings remediated

### Phase 3 (September 2026)
- [ ] Payment processing live on Stripe and Paystack
- [ ] 5+ paying customers (any tier)
- [ ] NDPC registration certificate obtained
- [ ] Self-serve onboarding completable in under 15 minutes
- [ ] Zero data isolation incidents (one company never sees another's data)

### Phase 4 (November 2026)
- [ ] Risk Register module live and used by at least 3 customers
- [ ] Legal Review Workflow module live
- [ ] FDA rule set validated by regulatory advisor
- [ ] SSO integration available for Enterprise tier
- [ ] SOC 2 readiness gap assessment completed

### Phase 5 (December 2026)
- [ ] All six platform pillars fully implemented and used in production
- [ ] 15+ paying customers across all tiers
- [ ] SOC 2 Type I audit initiated with a certified firm
- [ ] At least one industry association partnership or endorsement
- [ ] Press coverage in at least one Nigerian pharma/tech publication
- [ ] MRR sufficient to cover infrastructure + one part-time developer

---

## 11. Budget Estimate

All figures are estimates. Nigerian Naira amounts assume ₦1,600/$1 (adjust as needed).

### One-Time Costs

| Item | Estimated Cost |
|------|---------------|
| CAC registration + corporate secretary | ₦200,000 |
| Technology lawyer (ToS, Privacy Policy, DPA, Agreements) | ₦800,000 |
| Trademark filing (FIPO) | ₦80,000 |
| Penetration test | $3,000 (~₦4,800,000) |
| Supabase RLS specialist (2 days) | $1,500 (~₦2,400,000) |
| Contract designer (3 weeks) | $3,000 (~₦4,800,000) |
| Cyber liability insurance (annual) | $1,500 (~₦2,400,000) |
| **One-Time Total** | **~₦15,500,000 (~$9,700)** |

### Monthly Recurring Costs (from July 2026)

| Item | Estimated Cost/Month |
|------|---------------------|
| Supabase Pro | $25 |
| LLM APIs (Gemini/OpenAI/Anthropic) | $100–$500 (scales with usage) |
| Regulatory Affairs Advisor retainer | ₦150,000 |
| Part-time developer | ₦400,000 |
| Accountant | ₦75,000 |
| Monitoring tools (Sentry Pro, Uptime) | $50 |
| Email service (Resend) | $20 |
| **Monthly Total (mid-estimate)** | **~₦1,000,000 (~$625)** |

### Revenue Target to Break Even
- 3 Growth customers ($799/mo each) = ~$2,400/mo gross
- Covers all monthly costs with margin for reinvestment
- Target: 3 paying Growth customers by October 2026

---

## Appendix A — Weekly Sprint Cadence (April–September 2026)

| Week | Primary Focus | Secondary Focus |
|------|--------------|-----------------|
| W1 (Apr 1) | Module audit, staging setup | Lawyer engagement, pilot outreach |
| W2 (Apr 8) | Review workflow UI — submission form | RLS audit with Supabase specialist |
| W3 (Apr 15) | Review workflow — compliance engine wiring | CAC registration process |
| W4 (Apr 22) | Review workflow — reviewer actions | Pilot customer NDA signing |
| W5 (Apr 29) | Audit trail — paginated log view | NDPC registration application |
| W6 (May 6) | Audit trail — export and PDF | Pentest engagement scoping |
| W7 (May 13) | Dashboard — real data queries | Stripe/Paystack applications |
| W8 (May 20) | Dashboard — trend charts, jurisdiction panel | Regulatory advisor first session |
| W9 (May 27) | Integration testing — all 3 modules together | ToS/Privacy Policy review with lawyer |
| W10 (Jun 3) | Bug fixes from integration testing | Pentest execution |
| W11 (Jun 10) | Onboarding wizard — company setup | Pentest remediation |
| W12 (Jun 17) | Onboarding wizard — roles, invites, seeded data | Designer engagement begins |
| W13 (Jun 24) | Pilot onboarding — first company on staging | Designer sprint week 1 |
| W14 (Jul 1) | Pilot feedback session 1 | Designer sprint week 2 |
| W15 (Jul 8) | Bug fixes from pilot session 1 | Designer sprint week 3 |
| W16 (Jul 15) | Pilot feedback session 2 | Part-time developer onboarding |
| W17 (Jul 22) | Performance and load testing | Regulatory advisor rule validation |
| W18 (Jul 29) | Pilot feedback session 3 | Cyber insurance application |
| W19 (Aug 5) | Pre-launch polish — empty states, loading states | DPA signing with pilots |
| W20 (Aug 12) | Payment integration — Stripe + Paystack | Launch content preparation |
| W21 (Aug 19) | Self-serve onboarding flow | Press/PR preparation |
| W22 (Aug 26) | Final QA, launch rehearsal | Waitlist email sequence |
| **W23 (Sep 1)** | **MVP LAUNCH** | **Product Hunt, press release** |

---

*Document version: 1.0 — March 2026*
*Next review: After Phase 0 completion (end of April 2026)*
