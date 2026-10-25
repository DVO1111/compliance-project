# Pilot completion audit — UI and backend connectors

Audit of the Criateur Compliance implementation against the Figma
product design and against the actual code paths behind every action.

| | |
|---|---|
| HEAD audited | `c82ab784be378c321e24b2d718d7fb055d545a9f` |
| Branch | `claude/project-remodel-review-5e064v` |
| Working tree | clean |
| Divergence | **15 commits ahead of `origin/main`, 4 behind** — diverged. Not merged, not rebased |
| Figma file | `wSj81KWfoy7rS8u9CDcqtY`, 26 top-level pages (read-only session) |
| Production | **not touched.** No query, no migration, no ledger write in this audit |

---

## 1. Executive summary

The backend is substantially ahead of the interface. Every
release-critical *control* has a database implementation and SQL
coverage; the gaps are **screens that were never built for controls
that exist**, not broken controls.

### Confirmed completion

| Area | State |
|---|---|
| Auth: login, password reset, signup + invite | **Implemented and wired.** `LoginPage` sends the reset email, `ResetPasswordPage` calls `updateUser` and handles a lapsed link explicitly, `SignupPage` carries a pending invite token with code verification and resend. All three surface errors to the user. Unit tests: `passwordReset.test.ts`, `inviteCallback.test.ts`, `signinAllowlist.test.ts` |
| Onboarding | **8 of 9 design steps implemented** (`StepCompanyDetails`, `StepIndustryRegion`, `StepSites`, `StepModules`, `StepInviteTeam`, `StepStarterRecords`, `StepReady`, plus `SetupHub`/`SetupHubGate`). Tests: `setupHub`, `onboardingSites`, `onboardingAreas`, `starterRecords` |
| Permissions / access | `access_request_raise`, `access_decide`, `access_grant_revoke`, `access_restrict`, `access_restriction_lift`, `access_max_grant_days` all called from UI. Tests: `permissions`, `permissionRequests`, `pm03Matrix`, `accessSections`, `sectionGrid`, `roleAccess` + 2 SQL suites |
| Operational roles | `operational_role_assign` / `_revoke` / `_bootstrap` / `_sign` / `_unsigned_grants` all called from UI |
| Batch execution | 11 `batch_stage_*` RPCs called from UI, plus `batch_record_initiate/close/assign_line`. Tests: `batchExecution`, `stageStrip`, `stagePermits`, `executionRules` |
| Release + signature | `lifecycle_transition`, `quality_verdict_sign`, `sign_electronic_record`, `product_specification_approve`/`_sign` all called. Tests: `signAndTransition`, `releaseReadiness`, `batch_release_gate_test.sql` (45 assertions) |
| Audit chain | `verify_audit_chain` called from UI. Tests: `auditTrail.test.ts`, `audit_chain_seal_test.sql` |
| Dispatch | `dispatchService.ts` reads and writes `batch_dispatches` |
| Traceability | Implemented via `traceService`; **dispensing-only scope is documented in the file header** and the empty states say so |

### The three release blockers

**BL-1 — The incoming supplier CoA flow has no interface at all.**
Severity: **high**.

Evidence: `material_certificates_of_analysis` appears in `src/` **only
inside the generated `database.types.ts`** — no service, no component,
no read, no write. `material_coa_verify` is **never called from `src/`**
(verified against the full RPC-call inventory).

Consequences, in order of importance:

1. **A tested control is inert in practice.** Decision 2 — whoever
   verified a lot's certificate may not make its disposition — reads
   `material_certificates_of_analysis.verified_by`. Nothing in the
   product can set that column, so the duty conflict **can never fire
   through the application**. It is enforced, covered by
   `decision_enforcement_test.sql` §C and §I, and unreachable.
2. The authorisation guard added in `20261130000000` (quality role
   required to verify) protects an RPC no screen calls. Correct, and
   currently theoretical.
3. `incoming_coa_verification_test.sql` carries **73 assertions** over a
   flow with no UI — the backend is the most-tested unreachable code in
   the repository.
4. Production holds **0 rows** in that table, consistent with there
   never having been a way in.

**BL-2 — Role-revocation stranded work has no interface.**
Severity: **medium-high**.

`operational_role_stranded_work` and `stranded_work_reassign` are never
called from `src/`. When a role is revoked, `20261124000000` emits a
notification and the report exists in the database, but there is no
in-app route to see or reassign the stranded work. The reassignment path
is authorised and auditable — and only reachable by SQL.

**BL-3 — Governance registers are operator-SQL only.**
Severity: **low, but needs an explicit scope decision.**

`duty_decisions_outstanding` and `policy_decisions_outstanding` have no
UI. Defensible for a pilot (they are release-gate queries, not daily
work), but it should be a recorded pilot exclusion rather than an
oversight.

### Three things that are *not* defects

Checked, because earlier notes implied otherwise:

- **Blocked-release reasons do reach the user.** `batch_release_block_reason`
  is not called from the UI, but `batch_release_conditions` is, and
  `batchReleaseService.ts:526` documents that both read the same query
  in the database. Same for `material_lot_release_conditions` versus
  `material_lot_release_block_reason`. No information is withheld.
- **Traceability's narrow scope is honest**, not hidden: the service
  header states it traces through dispensing only, and the empty state
  tells the user where the first record comes from.
- **Global search was removed deliberately** (`HS-01` row 2), not left
  inert.

---

## 2. Figma versus implementation

### What was actually inspected

| | |
|---|---|
| Page inventory | **26 top-level pages**, read live from the file |
| Frames inspected in detail | **Onboarding — W1·14** (67 frames: `ONB-00`…`ONB-08`, `ONB-M00`…`ONB-M04`+, mobile adaptation rules) |
| Frames **not** compared | the other 25 pages |

**No per-frame visual comparison was completed, and this report does
not claim visual equivalence for any screen.** Colour, typography,
spacing and responsive behaviour were not measured against the frames.
Section 6 budgets that work.

### Mismatch register — only what is evidenced

| ID | Area | Finding | Severity | Evidence | Defect or scope? |
|---|---|---|---|---|---|
| M-1 | Auth | **The design has no login or password-reset frame.** `W1·14 Onboarding` begins at `ONB-00 · Set up your workspace`; no sign-in frame appears in its 67 frames | Medium | Live frame inventory | **Design gap, not a code defect.** The implementation has all three screens; they have no design authority. Needs a product decision: accept as-built, or design and reconcile |
| M-2 | Onboarding | `ONB-08 · Dashboard after setup` is a design frame; the implementation routes to the ordinary dashboard with a `SetupHub` gate rather than a distinct post-setup screen | Low | `SetupHubGate.tsx` | Likely intentional; confirm as scope |
| M-3 | Onboarding mobile | `ONB-M00`…`ONB-M04` mobile variants exist in the design with explicit "Mobile adaptation rules"; the implementation is responsive but **was never rendered at phone width in any verification pass** | Medium | `docs/screen-audit.md` §7 records the same gap | Unverified — not yet a defect |
| M-4 | Incoming CoA | No Figma page for incoming supplier CoA verification either — `W5·14` is the **outgoing** certificate register | High | Page list; `docs/decision-note-coa-separation.md` | **Design *and* implementation gap.** BL-1 |

---

## 3. Connector matrix

`UI control → handler → RPC/service → table → authorisation → test`

| Flow | Classification | Evidence |
|---|---|---|
| Login / password reset / signup+invite | **Connected and tested** | `supabase.auth` calls in all three pages; errors surfaced; `passwordReset`, `inviteCallback` tests |
| Workspace provisioning | **Connected and tested** | `create_company`, `provision_profile`, `ensure_system_roles`, `create_company_invite`, `accept_company_invite`; `profile_provisioning_test.sql` |
| Access requests / grants / restrictions / revocation | **Connected and tested** | 6 RPCs from UI; `access_requests_test.sql`, `access_restrictions_test.sql` |
| Operational role assign / revoke / sign / bootstrap | **Connected and tested** | 5 RPCs from UI; `operational_role_model_test.sql`, `role_signatures_and_duties_test.sql` |
| Goods receipt | **Connected and tested** | `material_lot_record_sampling`, `material_lot_block_reason`; `receiptRules.test.ts`, `material_master_test.sql` |
| Material testing | **Connected and tested** | `material_test_record_result`; `qcRules.test.ts`, `material_testing_and_release_test.sql` |
| **Incoming CoA verification** | **Backend exists, UI missing** | `material_coa_verify` uncalled; table absent from `src/` outside generated types. **BL-1** |
| QA disposition | **Connected, but a precondition is unreachable** | `material_lot_release` / `material_lot_reject` called and tested (`dispositionRules.test.ts`, `material_quarantine_gate_test.sql`) — but the CoA-verified precondition and Decision 2's duty conflict cannot be exercised in-product. **BL-1** |
| Batch execution → finished QC | **Connected and tested** | 11 `batch_stage_*` RPCs; `batchExecution`, `stagePermits`, `stageStrip` |
| Specification-gated release + signature | **Connected and tested** | `lifecycle_transition` with signature; `quality_verdict_sign`; `signAndTransition.test.ts`, `batch_release_gate_test.sql` 45 assertions incl. the unsigned-release negative test |
| Specification approval | **Connected and tested** | `product_specification_approve` / `_sign`; `product_specification_test.sql` |
| Audit chain creation + verification | **Connected and tested** | `verify_audit_chain` from UI; `audit_chain_seal_test.sql`, `write_path_audit_test.sql` |
| Dispatch | **Connected, insufficiently tested** | `dispatchService.ts` writes `batch_dispatches`; no dedicated unit test found for the dispatch service |
| Traceability | **Connected and tested** | `traceService`; `traceSummary.test.ts` |
| **Stranded work after revocation** | **Backend exists, UI missing** | both RPCs uncalled. **BL-2** |
| **Duty / policy decision registers** | **Backend exists, UI missing** | both RPCs uncalled. **BL-3** |
| Register export | **Partial** | `ExportModal` is wired to `DashboardPage` only; `auditExportEngine` exists. Per-register CSV export is **not** built |
| Global search | **Intentionally unavailable in pilot** | removed deliberately; restoring it means building the lookup |
| Notifications | **Connected** | `notifications` table + `NotificationBell`; revocation notices emitted by `20261124000000` |
| Configuration / customer surfaces | **Partial, scope** | `docs/screen-audit.md` §6 records `W6·30` and `W6·31` as partial; neither is on the release path |

---

## 4. Inert or misleading controls

Scanned for empty handlers, dead `href`, TODO markers and placeholder copy.

| Location | Control | Current behaviour | Should do |
|---|---|---|---|
| `Landing/LandingPage.tsx:459,469-471` | Footer links + Twitter / LinkedIn / GitHub | `href="#"` — navigate nowhere | Point at real URLs, or remove. **Marketing page, not in the application** |
| `ControlMonitoring/ControlHealthDashboard.tsx:225` | link | `href="#"` | Resolve or remove |
| `Governance/AI/AIAssetDetailPage.tsx:253` | "Audit logs coming soon" | Honest placeholder | Acceptable — labelled, not inert |
| `integrations/providers/baseProvider.ts:70,82` | `sendEvent` / automation check | Returns a structured "not implemented for this provider" error | Acceptable — fails loudly, out of pilot scope |

**No inert control was found in any release-path screen** (materials,
QC, QA disposition, batch execution, release, CoA register, dispatch,
traceability, permissions). The four above are marketing, governance
and integration surfaces.

---

## 5. Fixable in 24 hours versus needs a decision

### Safe to fix now (engineering only)

| ID | Fix | Effort |
|---|---|---|
| F-1 | Remove or resolve the four dead `href="#"` links | 15 min |
| F-2 | Add a dispatch service unit test (write + role refusal) | 45 min |
| F-3 | Render all in-scope pages at 390 px and fix clipping found | 2 h |
| F-4 | **Read-only** stranded-work panel: call `operational_role_stranded_work` and list results, no reassignment | 2 h |
| F-5 | Record BL-3 as an explicit pilot exclusion in the scope document | 15 min |

### Needs a product, QA or regulatory decision

| ID | Question | Owner |
|---|---|---|
| D-1 | **BL-1.** Build the incoming-CoA screen for the pilot, or declare the flow out of pilot scope and accept that Decision 2's duty conflict is inert in-product? Building it also requires deciding **which role verifies** (`docs/decision-note-coa-separation.md` §8 — Option A, still open) | Product + Quality |
| D-2 | **BL-2.** Is a read-only stranded-work view sufficient for the pilot, or must reassignment be in-app? | Product |
| D-3 | **M-1.** Accept the as-built login/reset screens with no design authority, or design them? | Product + Design |
| D-4 | Per-register CSV export: pilot requirement or not? | Product |
| D-5 | The six open quality decisions, one a temporary exception | Quality |
| D-6 | Disposition of the seven historical released rows | QA |

**I did not invent any permission to make the interface look complete.**
PM-03 was treated as the authority throughout; every gap above is
reported as a gap.

---

## 6. 24-hour plan with acceptance criteria

| Hours | Work | Acceptance criterion |
|---|---|---|
| 0–1 | **Decisions D-1 and D-2** put to Product/Quality | Written answers recorded |
| 1–2 | F-1, F-5 | No `href="#"` in `src/`; scope doc updated |
| 2–4 | F-3 — render every in-scope page at 390 px | 17 pages, 0 horizontal scroll, 0 clipped controls; evidence captured |
| 4–5 | F-2 | Dispatch test proves the write **and** a non-storekeeper refusal |
| 5–7 | F-4 (if D-2 says read-only suffices) | Panel lists stranded work for a revoked role; empty state when none |
| 7–13 | **If D-1 says build**: incoming-CoA screen — upload, verify via `material_coa_verify`, surface `COA_VERIFY_FORBIDDEN` | A `qc_analyst` verifies; a storekeeper is refused with the real message; Decision 2 then fires on disposition — proven end-to-end, not asserted |
| 13–16 | Per-frame Figma comparison for the 8 release-path pages | Mismatch register completed with severities and screenshots |
| 16–19 | Fix high/medium mismatches found | Each closed item re-rendered as evidence |
| 19–21 | Full regression: SQL on PG17.6, unit, typecheck, build | **2687+ assertions, 0 failed**; 1057+ unit tests; clean |
| 21–23 | Release-candidate verification pass | All §3 "connected and tested" rows re-confirmed |
| 23–24 | Final report and RC tag | Decision-ready |

**The deployment gates are unchanged and separate from this audit:**
recovery is still unestablished and the 31-migration sequence is
untouched. A UI release candidate does not imply a deployable
database change.
