# Sprint 4 — Controlled Access & Invite-Only Onboarding

> **Depends on:** Sprint 3 complete (billing, feature gates, dashboard overhaul)
> **Goal:** Replace open self-registration with an admin-first, invite-only access model. Every company starts with one admin. All other users enter through an invite link. Nobody picks their own permissions — the admin assigns them at invite time.

---

## Why this sprint exists

A compliance platform where anyone can self-register and choose their own role is a contradiction in terms. This sprint closes that gap. After it ships:

- The first person to sign up for a company becomes the admin — full stop
- Only admins can invite others (max 3 admins per company — hard enforced)
- Every invited user's access is defined by the admin at invite time (module-level)
- The dashboard assembles itself based only on what was assigned — nothing more
- Legal partner signup remains its own separate path — **untouched**

---

## What the model looks like after this sprint

```
Company creation
└── Admin signs up (1st person = admin, auto-assigned)
    └── Admin completes company setup
        └── Admin invites users
            ├── Selects modules/sections the user can access (Option A — module bundles)
            ├── Sends invite link via email
            └── Invited user:
                ├── Clicks link → lands on "Set your password" screen
                ├── No role selection — access already defined
                └── Arrives at dashboard showing only their assigned modules
```

---

## Scope boundaries

| In scope | Out of scope |
|----------|-------------|
| Admin-first signup | Legal partner signup path (stays as-is) |
| 3-admin cap (hard limit) | Fully custom per-permission invite (Option B — future sprint) |
| Module-level invite assignment | Stripe/Paystack (already deferred to Sprint 3.2) |
| Invited-user signup path | Any change to the core compliance/review modules |
| Dashboard auto-assembly from assigned modules | Role Management UI changes |
| Landing page invite redemption entry point | — |

---

## Sprint 4.1 — Database Foundation

**Duration:** ~2 days
**Prerequisite:** None — run this first

### Tasks

**4.1.1 — Add `module_access` column to `company_invites`**
```sql
ALTER TABLE company_invites
  ADD COLUMN module_access TEXT[] DEFAULT '{}';
```
This stores an array of module keys assigned at invite time, e.g. `['upload', 'legal_review', 'audit_trail']`.

**4.1.2 — Add `module_access` column to `company_members`**
```sql
ALTER TABLE company_members
  ADD COLUMN module_access TEXT[] DEFAULT '{}';
```
When an invite is accepted, this field is populated from the invite.

**4.1.3 — Update `accept_company_invite` RPC**
Modify the existing RPC to copy `module_access` from the invite row to the new `company_members` row on acceptance.

**4.1.4 — Add 3-admin cap to `create_company_invite` RPC**
Before inserting a new invite with `role = 'admin'`, check:
```sql
SELECT COUNT(*) FROM company_members
WHERE company_id = p_company_id
  AND (role = 'admin' OR role = 'owner')
  AND status = 'active';
```
If count >= 3, raise an exception: `'Admin seat limit reached. A company may have a maximum of 3 admins.'`

**4.1.5 — Add 3-admin cap to `company_members` as a trigger (belt-and-suspenders)**
Database-level enforcement so the cap cannot be bypassed even if someone calls the API directly.

**4.1.6 — Update `profiles` table RLS / column defaults**
Ensure that a new profile row created via an invite path does not auto-assign `role = 'owner'`. The role should be `null` or `'member'` until resolved from `company_members`.

### Acceptance criteria
- [ ] `company_invites.module_access` column exists
- [ ] `company_members.module_access` column exists
- [ ] Accepting an invite copies `module_access` correctly
- [ ] Creating a 4th admin invite throws a clear error
- [ ] Creating a 4th admin member via direct insert is blocked by trigger

---

## Sprint 4.2 — Admin Signup & Module-Selector Invite Form

**Duration:** ~3 days
**Prerequisite:** Sprint 4.1 complete

### Tasks

**4.2.1 — Split the signup flow**

Currently `signUp()` in `AuthContext.tsx` always calls `get_or_create_company()` and registers the user as `owner`. Add a parameter to distinguish paths:

```ts
// New signature
signUp(email, password, fullName, organization, inviteToken?: string)
```

- If `inviteToken` is present → skip company creation, skip owner role, flag for invite redemption
- If no `inviteToken` → existing flow (create company, set as owner/admin)

The landing page and signup form need a visible split:
- **"Start your company account"** → standard admin signup
- **"I have an invite"** → enter invite token or click from email link

**4.2.2 — Landing page: add "Redeem an invite" entry point**

Add a second CTA on the landing page / login screen:

> "Joining a team? Use your invite link."

This routes to the invite acceptance flow without hitting the company-creation signup form. Invited users who land on the homepage by mistake should not be confused into creating a new company account.

**4.2.3 — Redesign the invite form in `CompanyInvitesPage.tsx`**

Replace the role dropdown with a **Module Access Selector**. The admin selects which modules this person can access. Suggested module groupings (Option A):

| Module Key | Display Name | Description |
|---|---|---|
| `content_review` | Content & Review | Upload content, view archive, submit for review |
| `legal_review` | Legal Review | Review queue, approve/reject submissions |
| `compliance_reporting` | Compliance Reports | Compliance reports, audit trail, evidence export |
| `risk_governance` | Risk & Governance | Risk register, obligations, command center |
| `policy_management` | Policies | View, manage, and publish policies |
| `vendor_management` | Vendors | Vendor list, contracts, expiry tracking |
| `ai_governance` | AI Governance | AI assets, usage logs, incidents, reviews |

Each module maps to a set of `Permissions` keys. This mapping is defined in a new file `src/lib/moduleAccess.ts`.

**4.2.4 — Create `src/lib/moduleAccess.ts`**

```ts
export const MODULE_KEYS = [
  'content_review',
  'legal_review',
  'compliance_reporting',
  'risk_governance',
  'policy_management',
  'vendor_management',
  'ai_governance',
] as const;

export type ModuleKey = typeof MODULE_KEYS[number];

export const MODULE_LABELS: Record<ModuleKey, { name: string; description: string }> = { ... };

// Maps module keys → Permissions flags to enable
export const MODULE_TO_PERMISSIONS: Record<ModuleKey, Partial<Permissions>> = {
  content_review: {
    canUpload: true,
    canViewArchive: true,
    canViewContentBlocks: true,
  },
  legal_review: {
    canViewLegalReview: true,
    canViewAuditTrail: true,
  },
  compliance_reporting: {
    canViewComplianceReporting: true,
    canViewAuditTrail: true,
    canViewAuditExports: true,
    canViewGovernanceTimeline: true,
  },
  risk_governance: {
    canViewGrcFrameworks: true,
    canViewGrcControls: true,
    canViewGrcDashboard: true,
  },
  policy_management: {
    canViewPolicies: true,
    canViewMyPolicies: true,
    canManagePolicies: true,
  },
  vendor_management: {
    canViewVendors: true,
  },
  ai_governance: {
    canViewAIGovernance: true,
    canViewAIUsage: true,
    canViewAIDashboard: true,
    canViewAIIncidents: true,
    canViewAIReviews: true,
  },
};

// Convert an array of module keys → flat Permissions object
export function moduleAccessToPermissions(modules: ModuleKey[]): Partial<Permissions> { ... }
```

**4.2.5 — Update `create_company_invite` RPC call**

Pass the resolved module array:
```ts
createInvite({
  email,
  role: 'member', // role string becomes irrelevant — access is module-driven
  module_access: selectedModules, // string[] of ModuleKey
})
```

**4.2.6 — Admin cap UI feedback**

When the admin tries to add a 4th admin, show a clear inline error:
> "You've reached the 3-admin limit. Promote an existing admin to owner or contact support."

### Acceptance criteria
- [ ] Signup form shows two distinct paths: "Start an account" vs "Join a team"
- [ ] Admin signup creates company and sets role to admin/owner as before
- [ ] Invite form shows module-selector checkboxes, not a role dropdown
- [ ] Selected modules are saved to `company_invites.module_access`
- [ ] Attempting a 4th admin invite shows a clear error before submission

---

## Sprint 4.3 — Invited User Onboarding Path

**Duration:** ~2 days
**Prerequisite:** Sprint 4.2 complete

### Tasks

**4.3.1 — Update `AcceptInvitePage.tsx` to handle new accounts**

Currently the accept flow assumes the user already has an account. After this sprint, an invited user who clicks their link and has no account should be able to:

1. See the invite details (company name, who invited them)
2. Set a password (name pre-filled from invite email)
3. Click "Accept and join" → account created, invite redeemed, dashboard loaded

No role selector. No company name field. No OnboardingWizard.

**4.3.2 — Update `OnboardingWizard.tsx` to skip role step for invited users**

If the user joined via an invite (detectable by checking `company_members` row was inserted before `onboarding_completed = false`), skip Step 3 ("Your Role"). Their access was already determined. Show a simplified wizard:

- Step 1: Your name, profile photo (optional)
- Step 2: Notification preferences
- *(No role step)*

**4.3.3 — Update `App.tsx` routing for invite-first users**

Currently: if `profile.company_id` is null → show `OnboardingCompany` (create a company).

After this sprint: if `profile.company_id` is null AND there is a pending invite token in localStorage → skip company creation, go straight to invite acceptance. Only show `OnboardingCompany` if no invite is pending.

**4.3.4 — Persist module access on profile load**

In `AuthContext.tsx`, when loading the profile, also query `company_members` for `module_access`. Store it on the auth context so it's available to `getPermissions()`.

**4.3.5 — Update `getPermissions()` in `permissions.ts`**

Add a third resolution path (highest priority):

```ts
export function getPermissions(opts?: {
  profileRole?: string | null;
  customPermissions?: Partial<Permissions> | null;
  moduleAccess?: string[] | null;        // ← new
}): Permissions {
  // Path 1: explicit module access from invite assignment
  if (opts?.moduleAccess?.length) {
    return moduleAccessToPermissions(opts.moduleAccess as ModuleKey[]);
  }
  // Path 2: custom role JSONB
  if (opts?.customPermissions) { ... }
  // Path 3: legacy role string
  ...
}
```

### Acceptance criteria
- [ ] Invited user with no existing account can set password and join in one flow
- [ ] Invited user never sees a role selector
- [ ] Non-invited new users (admins) still go through full OnboardingWizard
- [ ] `module_access` from `company_members` is loaded into auth context on login
- [ ] `getPermissions()` resolves module access correctly

---

## Sprint 4.4 — Dashboard Auto-Assembly & Access Enforcement

**Duration:** ~1 day
**Prerequisite:** Sprint 4.3 complete

### Tasks

**4.4.1 — Verify nav auto-hides correctly**

The sidebar already hides nav items based on `perms.*` flags. With `getPermissions()` now resolving from module access, this should work automatically. Do a manual walkthrough for each module bundle:

- Invite with `content_review` only → should see Upload, Archive. Nothing else.
- Invite with `risk_governance` only → should see Risk Register, Obligations, Command Center. Nothing else.
- Invite with all modules → should see everything (same as compliance role today)

Fix any nav item that still lacks a `hidden` condition (there were 3 already fixed — do a full audit here).

**4.4.2 — Dashboard KPI cards: hide if no access**

The dashboard KPI cards (Open Risks, Overdue Obligations, Draft Policies, Active Vendors) currently render for all users. Wrap each card's render with a permission check:

- Open Risks → show only if `canViewGrcFrameworks`
- Overdue Obligations → show only if `canViewGrcFrameworks`
- Draft Policies → show only if `canViewPolicies`
- Active Vendors → show only if `canViewVendors`

Users with limited access should see a dashboard that matches exactly what they can reach.

**4.4.3 — `NeedsAttentionWidget` and `ComplianceHealthScoreWidget`: scope to user access**

Currently these query all modules regardless of role. For a marketing user invited with only `content_review`, showing "3 unmitigated critical risks" is noise — they have no path to act on it.

- `NeedsAttentionWidget`: Only surface items from modules the user can access
- `ComplianceHealthScoreWidget`: Only include pillars the user can access; show "—" for locked pillars

**4.4.4 — QuickActionsBar: already role-aware**

The existing `ACTIONS_BY_ROLE` lookup in `QuickActionsBar.tsx` uses a role string. Update it to also check permissions, so it works for module-access users who don't have a named role:

```ts
// Fallback: build actions dynamically from perms if no role match
const actions = ACTIONS_BY_ROLE[role.toLowerCase()]
  ?? buildActionsFromPermissions(perms)
  ?? DEFAULT_ACTIONS;
```

**4.4.5 — Members list: show assigned modules per member**

In `CompanyMembersPage.tsx`, add a "Modules" column to the members table showing which modules each member has access to (small pill tags). This gives admins a at-a-glance view of who can see what.

### Acceptance criteria
- [ ] A user invited with `content_review` only sees Upload/Archive in nav — no governance items
- [ ] Dashboard KPI cards hidden when user has no permission for that module
- [ ] `NeedsAttentionWidget` only surfaces items the user can act on
- [ ] Members list shows module access per member
- [ ] Full nav audit complete — no item visible that links to a page the user can't reach

---

## What stays unchanged

- Legal partner signup (`/invite/accept?type=legal_partner` and `legal_partner_profiles` table)
- Admin role capabilities — admins still have full access to everything
- `custom_roles` table and custom permission JSONB — still valid for future Option B (per-permission assignment)
- Billing page and plan gating — orthogonal to access control, both coexist
- All existing compliance/review/audit modules — no functional changes

---

## File change summary

| File | Change type | Sprint |
|------|-------------|--------|
| `supabase/migrations/` | New migration: `module_access` columns, admin cap trigger | 4.1 |
| `supabase/functions/accept_company_invite/` | Copy `module_access` on accept | 4.1 |
| `supabase/functions/create_company_invite/` | Admin cap check | 4.1 |
| `src/lib/moduleAccess.ts` | **New file** — module → permissions mapping | 4.2 |
| `src/lib/permissions.ts` | Add `moduleAccess` resolution path | 4.3 |
| `src/contexts/AuthContext.tsx` | Load `module_access` from `company_members` on profile load; split signup | 4.2, 4.3 |
| `src/components/Onboarding/AcceptInvitePage.tsx` | Handle new accounts inline | 4.3 |
| `src/components/Onboarding/OnboardingWizard.tsx` | Skip role step for invited users | 4.3 |
| `src/components/CompanyMembers/CompanyInvitesPage.tsx` | Replace role dropdown with module selector | 4.2 |
| `src/components/CompanyMembers/CompanyMembersPage.tsx` | Add module tags to members table | 4.4 |
| `src/components/Dashboard/DashboardPage.tsx` | Gate KPI cards, scope widgets to access | 4.4 |
| `src/components/Dashboard/widgets/NeedsAttentionWidget.tsx` | Filter items by user access | 4.4 |
| `src/components/Dashboard/widgets/ComplianceHealthScoreWidget.tsx` | Hide inaccessible pillars | 4.4 |
| `src/components/Dashboard/ui/QuickActionsBar.tsx` | Fallback from permissions for non-role users | 4.4 |
| `src/App.tsx` | Update routing for invite-first path | 4.3 |
| `src/components/Layout/MainLayout.tsx` | Full nav hidden-condition audit | 4.4 |
| Landing page component | Add "I have an invite" entry point | 4.2 |

---

## Estimated total effort

| Sprint | Focus | Estimated days |
|--------|-------|---------------|
| 4.1 | Database foundation | 2 |
| 4.2 | Admin signup + module-selector invite form | 3 |
| 4.3 | Invited user onboarding path | 2 |
| 4.4 | Dashboard assembly + nav audit | 1 |
| **Total** | | **~8 working days** |

---

## Testing checklist (run before marking sprint complete)

**Admin path**
- [ ] Sign up fresh → land in OnboardingWizard as admin
- [ ] Complete company setup → reach dashboard
- [ ] Invite a user with `content_review` only → invite email sent
- [ ] Invite a 4th admin → blocked with clear error

**Invited user path**
- [ ] Click invite link (no existing account) → land on "Set your password" screen
- [ ] Complete → dashboard shows only assigned modules
- [ ] Nav contains no links to unassigned modules
- [ ] Clicking a direct URL to a restricted page shows AccessDenied

**Existing users**
- [ ] Existing admin accounts unaffected — full access preserved
- [ ] Existing `marketing`/`compliance`/`executive` role-string users unaffected
- [ ] Legal partner signup path completely unchanged

---

*Document version: 1.0 — March 2026*
*Author: engineering*
*Status: Ready to start after Sprint 3 sign-off*
