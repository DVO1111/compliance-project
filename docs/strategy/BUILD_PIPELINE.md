# Build Pipeline — Strategic Module Catalogue

**Purpose.** This document records the fifteen productised modules surfaced in the expanded competitive scan (Drata, Vanta, Secureframe, OneTrust, AuditBoard, Diligent, MetricStream) that would meaningfully extend Criateur's product surface over the next 24+ months. None are committed to a sprint. This is the *pipeline* — sequenced by strategic priority for Criateur's African-regulated-organisations market, with scope, dependencies, and effort estimates captured so they don't get lost.

**Build authority.** No item on this list moves into active engineering until (a) it's been selected at a roadmap planning session, (b) a module spec has been written using the standard template, and (c) the work has been sized against current sprint capacity.

---

## Tier 1 — Build first

These five modules are the strongest near-term gaps. They map onto pains surfaced in design-partner conversations, build on primitives Criateur already has, and are load-bearing for the pharma-manufacturing wedge plus any near-term expansion into financial services or healthcare.

### 1. Pre-encoded Framework Library with Cross-Mapping Engine

**What it is.** A structured library of regulatory frameworks encoded as machine-readable rule sets, with controls cross-mapped across frameworks so a single control can satisfy requirements in multiple standards simultaneously.

**Why this tier.** Currently rules are hard-coded in `src/lib/rules/`. Every new regulator requires a code deploy. This is the single biggest scalability blocker. It's also the foundation that most other items in this list build on.

**Scope.**
- Rule-as-data architecture: rule definitions stored in versioned database tables, not hard-coded
- Framework catalogue: each framework as a top-level entity with metadata, sections, controls
- Cross-mapping table: many-to-many relationships between controls across frameworks
- Authoring tool for the platform team to add/update frameworks
- Customer workspace configuration to select active frameworks
- Engine consumes rules from the database at runtime
- Initial framework set: NAFDAC GMP, NAFDAC advertising, NAFDAC food, PCN, NHI, HEFAMAA, SAHPRA, PPB, Ghana FDA, NDPR, POPIA, WHO PQ, ICH guidelines, SafeCare, COHSASA

**Prerequisites.** Current rule engine refactored to consume from data store. Layer 2 schema validation (from the earlier audit) should be closed first.

**Content dependency.** Authoring credible African regulatory rule sets requires domain expertise. Hire or contract a regulatory affairs specialist for content authoring.


---

### 2. Continuous Control Monitoring

**What it is.** A monitoring layer that continuously evaluates whether configured controls are operating effectively, alerts on drift, and tracks control state over time. Distinct from event-driven review.

**Why this tier.** This is the architectural feature that most distinguishes a continuous trust infrastructure from a periodic compliance tool. It also produces the data that fuels meaningful executive dashboards and risk register updates.

**Scope.**
- Control state model: each control has a current state (passing, failing, expired, unknown) with timestamps
- Scheduled evaluation jobs running control checks at configurable intervals
- Drift detection triggering audit entries and notifications
- Re-attestation cycles for controls requiring periodic re-confirmation
- Alert routing to control owners with escalation paths
- Control state history for trend reporting

**Prerequisites.** Framework Library (item 1) — controls must exist as structured entities before monitoring.

---

### 3. Regulatory Horizon Scanning / Regulatory Change Management

**What it is.** Continuous monitoring of regulator publications and circulars, automated identification of changes, mapping of changes to the customer's affected controls and policies, routing to owners, tracking of adoption.

**Why this tier.** The single highest-leverage differentiation opportunity in this list for Criateur. No foreign GRC vendor will track NAFDAC circulars, NHI bulletins, or PCN updates with the local context Criateur can provide. African regulators publish frequently and customers struggle to keep pace. Building this layer early — even in basic form — meaningfully strengthens the "built for African regulators specifically" positioning that wins against foreign QMS vendors.

**Scope.**
- Regulator source registry: structured catalogue of regulator publication channels (websites, circulars, social media, gazettes)
- Ingestion pipeline pulling new publications on a schedule
- Change identification: structured diff against prior versions, classification of change type (new rule, amendment, withdrawal, guidance update)
- Impact mapping: automated mapping of changes to affected controls in the framework library
- Notification routing to control owners and compliance leadership
- Acknowledgement and adoption tracking workflow
- Audit trail of changes consumed, decisions made, controls updated

**Prerequisites.** Framework Library (item 1) — changes need controls to map to. Continuous Control Monitoring (item 2) — for the adoption-tracking workflow to be meaningful.

**Strategic consideration.** This module compounds in value over time. Each new customer expands the regulator footprint, which expands the curated content, which expands the value to all customers. Network effect on the content side. Worth building before competitors notice this gap exists in African markets.

---

### 4. Productised Third-Party Risk Management (TPRM)

**What it is.** Productised workflow for managing third-party (supplier, vendor, provider, partner) risk: structured inventory, risk-scoring criteria, document collection, periodic re-assessment, current-status dashboard.

**Why this tier.** Maps directly onto pains surfaced in both design-partner conversations — Joyce's supplier qualification at MeCure and Itohan's provider compliance at Hygeia. Even with Hygeia deprioritised, the module extends to multiple buyer types.

**Scope.**
- Third-party inventory (suppliers, providers, vendors, partners) with type taxonomy
- Risk-scoring framework with configurable criteria
- Document collection workflow with required-document checklists per type
- Re-assessment scheduling (annual, semi-annual, etc.)
- Current-status view with risk-level indicators
- Third-party portal: limited external access for the third party to upload documents themselves
- Integration with License Vault for licence-document tracking
- Connection to Continuous Control Monitoring for ongoing third-party state tracking

**Prerequisites.** License Vault (exists). Workspace isolation (exists).

---

### 5. Policy Lifecycle Management

**What it is.** End-to-end policy management: drafting (with templates), version control, approval workflow, distribution, acknowledgement tracking, periodic review reminders, policy-to-control mapping.

**Why this tier.** Both Hygeia and MeCure surfaced internal-policy and SOP management as real pain. Joyce specifically mentioned manual two-step verification on SOPs. Load-bearing for every regulated customer regardless of industry.

**Scope.**
- Policy entity model (title, body, current version, status, owner, framework links)
- Template library for common policies (HR, IT security, data protection, regulatory)
- Version control with diff view
- Approval workflow with multi-stage sign-off
- Distribution to defined audiences (by role, by department)
- Acknowledgement tracking with reminders
- Annual review scheduling with automated reminders
- Policy-to-control linkage (policy as evidence for specific controls)

**Prerequisites.** Document storage (exists). Workspace and role primitives (exist). Framework Library (item 1) for policy-to-control mapping, though partial initially.

---

## Tier 2 — Build next

These six modules become valuable as customer base matures, design-partner relationships convert to paying customers, and broader feature requirements emerge from real customer use.

### 6. Audit Project Workspace (Auditor as External User)

**What it is.** A scoped workspace where external auditors (NAFDAC inspectors, accreditation reviewers, donor auditors, internal-audit firms) are invited with limited access to a specific audit project, can request and review evidence, ask questions captured in the audit trail, and track audit progress against a defined timeline.

**Why this tier.** Customer base for this is paying customers actively undergoing audits — which Criateur won't have at meaningful volume for at least a year. Premature for Tier 1.

**Scope.**
- Audit project entity (scope, timeline, auditor identity, customer team)
- Auditor external-user role with scoped read-only access to specified evidence
- Evidence-package compilation workflow scoped to audit
- In-platform Q&A between auditor and customer team, captured in audit trail
- Audit timeline tracking with milestones
- Audit closure with sealed evidence export and audit-report archive

**Prerequisites.** Workspace isolation (in place). Continuous Control Monitoring (item 2) for evidence currency. Framework Library (item 1) for scoping by framework.

---

### 7. Risk Register with Quantification and Linkage

**What it is.** Productised risk-management module with structured risk taxonomy, likelihood × impact scoring, mitigation tracking, risk-acceptance workflow, risk-to-control linkage, heat maps, executive reporting.

**Why this tier.** Criateur has the basic shape (three risks seeded in the demo workspace) but not the productisation. Becomes valuable when customers are using the platform for board-level reporting and senior-stakeholder visibility — which comes after initial operational adoption.

**Scope.**
- Risk taxonomy with categories and sub-categories
- Structured risk-scoring (configurable likelihood × impact matrix)
- Mitigation plan tracking with owners and timelines
- Risk-acceptance workflow with sign-off
- Risk-to-control linkage (risks mitigated by controls; control failure surfaces in risk view)
- Heat-map visualisation and risk-trend reporting
- Risk export for board reports

**Prerequisites.** Continuous Control Monitoring (item 2) for risk-to-control linkage to be meaningful in real time.

**Effort estimate.** 3–4 weeks. One to two engineers.

**Decision gate.** Build trigger is when an Enterprise-tier customer requests board-level risk reporting, OR when at least two active customers have populated the basic risk register sufficiently to justify productisation.

---

### 8. Consent Management & Data Subject Rights (DSR)

**What it is.** Structured workflow for consent capture (including cookie consent for digital properties), data subject request handling (right of access, deletion, portability, rectification), data mapping (knowing what personal data sits where), and consent-state tracking over time.

**Why this tier.** Real near-term value, especially for customers operating under NDPR, POPIA, and emerging African data-protection regimes. If Criateur's next wedge moves toward healthcare providers or HMOs, this becomes Tier 1. For the current pharma-manufacturer wedge, Tier 2 is appropriate because manufacturers' primary regulatory exposure is product registration and GMP, not consumer data handling. The exception is multinational pharma subsidiaries where parent-company data-protection standards apply globally.

**Scope.**
- Consent capture forms (configurable per purpose, jurisdiction)
- Consent state ledger with immutable history
- DSR request intake (web form, email integration)
- DSR workflow (identity verification, scoping, response drafting, fulfillment)
- Data mapping (which systems contain which categories of personal data)
- Retention period tracking and automated retention enforcement
- Cross-jurisdictional consent variation (NDPR vs POPIA vs Ghana DPA, etc.)
- Audit trail of every consent decision and DSR action

**Prerequisites.** Workspace isolation (in place). Framework Library (item 1) for NDPR/POPIA encoding.

**Effort estimate.** 5–7 weeks. Two engineers. Adds non-trivial database design and security review because it directly handles personal data.

**Decision gate.** Build trigger is when (a) a healthcare-adjacent customer onboards, OR (b) any customer escalates data-subject-rights handling as a specific request. Healthcare onboarding likely triggers this first.

---

### 9. Internal Audit Workpapers / Structured Testing

**What it is.** Productised internal audit practice: audit scoping, planning, structured testing workflows, workpaper management, finding tracking with linkage to risks and controls, audit report generation. Distinct from item 6 (Audit Project Workspace) because this is the *internal audit function's own work*, not the evidence-presentation-to-external-auditor function.

**Why this tier.** AuditBoard owns this niche specifically because internal audit is a discrete discipline with its own workflow and tools. For Criateur, this becomes valuable when entering customers with mature internal audit functions — typically larger banks, multinational pharma, listed companies. Most near-term wedge customers (mid-tier pharma manufacturers, mid-tier fintechs) don't yet have substantial internal audit capability, but enterprise customers will.

**Scope.**
- Audit planning module (scoping, resource allocation, timeline)
- Audit programme library (templated audit procedures per regulatory area)
- Structured testing workflow (control selection, sampling, testing, evidence collection)
- Workpaper management with version control
- Finding tracking with severity, status, owner, due date
- Finding-to-risk-to-control linkage
- Audit report generation with structured templates
- Audit committee reporting view

**Prerequisites.** Framework Library (item 1). Risk Register (item 7). Continuous Control Monitoring (item 2). Sits on top of most prior modules.

**Effort estimate.** 6–8 weeks. Two engineers. Larger than most because the internal audit workflow is structurally complex.

**Decision gate.** Build trigger is when at least one enterprise customer with a dedicated internal audit function explicitly requests workpaper management. Defer until then.

---

### 10. Ethics & Speak-Up / Whistleblower Hotline

**What it is.** Structured intake and case management for ethics violations, whistleblower reports, anti-bribery disclosures, conflict-of-interest declarations. Includes anonymous intake channel, structured investigation workflow, outcome tracking, regulator notification where required.

**Why this tier.** OneTrust Speak-Up Program Management defines this category. For Criateur, this aligns with NGX listing rules, FCCPC consumer protection regulations, and emerging anti-bribery enforcement in Nigeria. Specifically valuable for listed companies, banks, NGOs, and multinationals operating in Africa.

**Scope.**
- Anonymous intake channel (web form, phone, email)
- Reporter identity protection with one-way encryption
- Case management workflow (intake, triage, investigation assignment, outcome)
- Investigation workpaper management
- Regulatory notification scaffolding (if required, e.g., for material whistleblower allegations)
- Audit trail of every action — separate from main audit trail for privacy reasons
- Reporter communication channel (one-way or anonymous-two-way)
- Statistics and trend reporting (without identifying individual cases)

**Prerequisites.** Workspace isolation (exists). Hash-chained audit trail (exists). Reasonably standalone otherwise.

**Effort estimate.** 4–5 weeks. One to two engineers. Sensitivity of data requires careful security and privacy review.

**Decision gate.** Build trigger is when a customer explicitly requests this — most likely a listed company, bank, or NGO. Not speculative.

---

### 11. Personnel / Joiner-Mover-Leaver (JML) Automation

**What it is.** Structured workflows for employee onboarding (evidence collection, training assignment), role changes (access reviews, certification refreshes), and offboarding (access revocation, equipment return, exit interview, knowledge transfer). Equivalent of the Criateur Talent module in the master document, scoped down to the trust-and-evidence subset.

**Why this tier.** Critical for regulated organisations but Criateur's near-term wedge customers (pharma manufacturers) typically have HR systems already. The trust-and-evidence overlay sits on top. Not the first thing they buy.

**Scope.**
- Workforce member entity with employment type, role, status
- Onboarding workflow with required-document checklists per role
- Training assignment and completion tracking
- Access review scheduling and execution
- Offboarding workflow with access-revocation propagation
- Certification tracking per workforce member
- Integration with Policy Management (item 5) for policy-acknowledgement-as-onboarding-step

**Prerequisites.** Workspace identity primitives (in place). Policy Lifecycle Management (item 5).

**Effort estimate.** 5–7 weeks. Two engineers.

**Decision gate.** Build trigger is when (a) Criateur Talent is committed in the portfolio as the next product, OR (b) a paying customer specifically requests workforce-trust workflow as part of their scope. Master document positions Talent as the third product; this module is the first slice of it.

---

## Tier 3 — Build when scaling justifies (24+ months, paying-customer-driven)

These four modules are valuable but depend on either scale (volume justifying investment) or strategic moves Criateur hasn't yet committed to.

### 12. Integrations Framework

**What it is.** Architectural framework for connecting to external systems, normalising data, storing as evidence, linking to controls. Drata has 200+ specific integrations; for Criateur, the relevant integrations are different (Nigerian banking, payment systems, African ERPs, document signing tools, eventually regulator APIs if they ever open).

**Why this tier.** The framework matters; the specific integrations don't yet. Most of Criateur's customers do their work *inside* the platform (system-of-record model) rather than needing data pulled from elsewhere. The integrations need will grow as Criateur enters larger customers with existing system landscapes.

**Scope.**
- Pluggable integration architecture with a standard connector interface
- Credential management for external systems
- Data normalisation layer
- Webhook and polling support
- Audit trail for integration activity
- Initial set of 3–5 integrations specifically valuable to Criateur's market (Paystack/Flutterwave for billing, a major Nigerian ERP, email-based document ingestion, Google Workspace, Microsoft 365)

**Prerequisites.** Continuous Control Monitoring (item 2) — most useful integrations feed monitoring data.

**Effort estimate.** 6–8 weeks for the framework. Then 1–2 weeks per integration.

**Decision gate.** Build trigger is when at least three paying customers ask for the same specific integration, OR when entering an enterprise customer with mandatory integration requirements.

---

### 13. Trust Center / External Posture Portal

**What it is.** Public-facing or scoped-access portal where a Criateur customer can display their regulatory posture, certifications, audit history, and current standing to external parties — regulators, multinational partners, donors, parent companies, accreditation bodies.

**Why this tier.** Real value for Criateur's customers (pharma manufacturers proving themselves to multinational partners, HMOs proving themselves to NHIA, NGOs proving themselves to donors) but requires the underlying trust infrastructure to be mature enough that the posture being displayed is meaningful. Premature otherwise.

**Scope.**
- Public posture page (configurable visibility per element)
- Certificate and accreditation display with verification
- Real-time policy and document publication (consent-gated for sensitive items)
- External-party access request workflow
- Document request workflow with NDA-gated content
- Audit-history display (configurable scope)

**Prerequisites.** Framework Library (item 1), Continuous Control Monitoring (item 2), Policy Lifecycle (item 5). All of Tier 1 essentially.

**Effort estimate.** 4–6 weeks.

**Decision gate.** Build trigger is when at least one customer explicitly requests the ability to publish their posture externally, OR when the Enterprise tier needs a competitive differentiator. Likely 2027–2028.

---

### 14. Executive Reporting and Dashboards

**What it is.** Productised executive dashboards, trend reporting over time, control-health KPIs, custom report builder, scheduled reports. The "how is my compliance posture trending" view for Heads of Compliance, CISOs, and board reporting.

**Why this tier.** Real value but only at Enterprise tier with mature customers. Most data needed for meaningful executive reporting comes from Continuous Control Monitoring (item 2) and Risk Register (item 7), which precede this.

**Scope.**
- Pre-built executive dashboards (compliance health, risk posture, audit readiness, control trends)
- Time-series data store for trend reporting
- Custom report builder with drag-drop or query interface
- Scheduled report generation and delivery
- Export to PDF/Excel for board materials
- Drill-down navigation from dashboards to underlying records

**Prerequisites.** Continuous Control Monitoring (item 2), Risk Register (item 7).

**Effort estimate.** 5–7 weeks.

**Decision gate.** Build trigger is when at least two Enterprise customers request board-level reporting as part of their tier value, OR when the company has stable enterprise sales motion that benefits from a clear "executive view" demo.

---

### 15. Business Continuity Management / Operational Resilience

**What it is.** Structured workflows for business continuity planning, disaster scenario modeling, recovery action initiation, emergency mass notification, post-incident review and learnings. MetricStream productises this as a discrete module.

**Why this tier.** Regulators (CBN for banks, NHI for HMOs, NAFDAC for manufacturers) increasingly demand operational-resilience documentation. Under DORA-equivalent frameworks emerging in Africa, this will become a real expectation. Not urgent now; track regulatory direction over 24 months.

**Scope.**
- Business continuity plan entity (scope, dependencies, recovery time objectives, recovery point objectives)
- Critical business process inventory with dependencies mapping
- Disaster scenario modeling (technology failure, facility loss, supplier failure, regulatory action)
- Recovery procedure documentation with step-by-step playbooks
- Tabletop exercise scheduling and outcome tracking
- Incident initiation workflow (when a continuity scenario materialises)
- Emergency mass notification (SMS, email, push)
- Post-incident review template and lessons-learned tracking

**Prerequisites.** Framework Library (item 1) for regulatory continuity requirements encoded. Risk Register (item 7) for risk-to-continuity-plan linkage.

**Effort estimate.** 6–8 weeks.

**Decision gate.** Build trigger is when a regulator publishes operational-resilience requirements that affect Criateur customers (e.g., CBN updating its banking IT framework to demand DORA-style resilience documentation), OR when an enterprise customer explicitly requests this. Track regulatory direction; act when triggered.

---

## Cross-cutting principles for sequencing

**Customer signal before speculation.** Nothing on this list moves into build without explicit customer demand, either from a paying customer or an active design partner. This pipeline is for *knowing what's available to build*, not for justifying speculative work.

**Tier 1 strategic modules first.** The six pharma-manufacturing modules from the post-discovery strategy update (batch release, deviation/CAPA, change control, document/SOP versioning, supplier qualification, GMP inspection readiness) come before any item on this list. Those are the wedge-defining build; this list is the broader product surface.

**Foundational gaps before new features.** Layer 2 schema validation, Layer 3 citation verification, and the content_submissions company_id RLS fix from the earlier audit are foundational and come before any new module work. They are technical debt that compounds; close them first.

**Dependencies matter.** Item 1 (Framework Library) is a prerequisite for items 2, 3, 6, 8, 13, and 15. Item 2 (Continuous Control Monitoring) is a prerequisite for items 3, 6, 7, 12, and 14. Build foundations before dependents.

**Effort estimates are minimums.** Every number on this page assumes a focused engineer or pair working without interruption, with proper review, on a stable foundation. Real-world execution typically takes 1.3–1.5x the estimate. Plan accordingly.

**Selective adoption, not category replication.** Drata, Vanta, Secureframe, OneTrust, AuditBoard, Diligent, and MetricStream collectively have hundreds of features and modules. The point of this pipeline is to identify which of their patterns are worth Criateur adopting, not to replicate their full product surface.

---

## How to maintain this pipeline

Treat this as a living document alongside the master operating plan. Review it at each quarterly roadmap planning session. When customer signal validates a build trigger, move the item from this pipeline into the actual sprint queue with a full module spec written first. When customer signal does not validate a trigger, leave the item where it is.

Items can move *up* the priority order if customer signal warrants. They can also be deprioritised or removed if the strategic context changes. Don't treat the ordering here as fixed — treat the existence of the pipeline as fixed.

When an item enters active build, mark it in this document with a status flag and link to the active module spec. When it ships, mark it shipped with the shipping date. Over time this document becomes a record of how the product surface evolved relative to the gap analysis that surfaced it.

---

**The single most important strategic point:** Regulatory Horizon Scanning (item 3) is the highest-leverage differentiation opportunity in this list for Criateur specifically. It's the one module where local-regulator focus creates structural advantage no foreign vendor can replicate. When the time comes to pick the first item from this list to actually build, start there if customer signal allows.
