# Screen and workflow audit

Every screen the application draws, checked against the Figma file's
own dead-end register (`HS-01`, page *Honest state & dead ends —
W6·32*): placeholders, empty states, failure states, and the actions
each role is offered.

Audited by rendering the real `MainLayout` with the real page
components against an empty database, which is the state a customer's
first morning produces. Verified 2026-10-23.

---

## 1. The design's own register, and what is still true of the code

`HS-01` is a 32-row table of "every control that does nothing or goes
nowhere", each tagged BUILD, REMOVE, LABEL, FIXED or KEEP. Most of it
has been acted on in earlier rounds. These are the rows that were
still live in the code when this audit ran.

| Row | Control | Register says | State in the code | Action taken |
|---|---|---|---|---|
| 1 | Four versions of the navigation rail | BUILD one rail | **Already one rail.** `DB01_NAV` regroups every item and anything the design does not name falls to *More* | none needed |
| 2 | Global search, *"Search batches, lots, records…"* | BUILD number lookup, **or remove the field** | **Dead.** The input had no `value`, no `onChange` and no handler — it took typing and discarded it | **Removed**, see §2 |
| 3 | Notifications bell | REMOVE — "no popover designed; the old one was always empty" | **Outdated.** `NotificationBell` is wired to the `notifications` table and now carries real content | **Kept**, and given a label for the new notice |
| 12 | Audit trail page | BUILD | Not built | **Open** — recorded, not built here |
| 16 | *Export* on registers | BUILD one CSV pattern | Not built | **Open** |
| 22 | *Create custom role* | REMOVE — "the pilot uses the fixed roles in PM-03" | `custom_roles` still exists in the legacy permission model | **Open** — out of this branch's scope, recorded |
| 24 | *Switch user* on the floor bar | BUILD | Not built | **Open** |

Rows 27–31 are tagged FIXED or LABEL in the file itself — the design
already corrected the wording. Nothing in the code contradicts them.

### Why the bell's register entry is now wrong

Row 3 says remove the bell because there was nothing to put in it.
That stopped being true in this branch: `20261124000000` emits
`role_revocation_stranded_work` to whoever administers roles when a
revocation leaves unfinished work behind. That is a notification with
a reason to exist and somewhere to go, so the bell stays and has been
given the label for it. **This is a disagreement with the design file,
and it is recorded rather than silently taken.**

---

## 2. The global search field, removed

The register's instruction is conditional: *"Number lookup only: lot,
batch, deviation, certificate or licence number opens that record …
If it isn't ready by Thursday, remove the field."*

It is not ready — a lookup across five record types with its own
not-found state is a piece of work, not a patch — so the field is
removed and the markup carries the reason.

**A search box that silently discards what somebody types is worse
than no search box**, because they believe they have searched. On a
compliance system that belief can end an investigation early.

Restoring it means building the lookup, not re-adding the input. This
is the most visible change in this round and the easiest to reverse if
you disagree.

---

## 3. Empty states

Every PM-03 page rendered against an empty database. All eight say
what is absent and what produces it; none shows a bare spinner or a
blank panel.

| Page | Empty state |
|---|---|
| QA disposition | *"No lot is waiting for a decision. Lots appear here once they have been received and sampled."* |
| Goods receipt | *"Nothing has been received yet."* |
| QC testing | *"No lot is awaiting test. Lots appear here once they are received."* |
| My tasks | *"Nothing is waiting on you across 4 areas…"*, and it names them |
| Dispatch | *"Nothing dispatched yet"*, plus what that costs a trace |
| Batch execution | *"No batch records yet."* |
| Specifications | **Fixed earlier this branch** — was a dropdown with nothing in it |
| Traceability | **Fixed in this round** — same defect, same fix |

### Traceability, fixed

It drew a *"Choose one…"* dropdown holding one disabled line and a
*Trace* button that could never be pressed. Identical to the
specifications defect found in an earlier round, in a different file —
which is the kind of repetition that suggests the pattern, not the
page, was the problem.

It now says which register is empty and where the first record comes
from, worded for the direction being traced.

---

## 4. Failure states

`HS-07`: *"Failed to load: plain words, nothing lost, try again."*

Three pages distinguished **"the table is not there"** (`SectionNotReady`,
from a probe query) from a normal load — but had no branch at all for
a load that fails for any other reason: a refused policy, a dropped
connection, a timeout. The service call would reject, the `await`
would throw past `setLoading(false)`, and the page would sit on its
spinner for ever with nothing said.

Fixed in QA disposition, Goods receipt and QC testing: the load is
wrapped, the failure is logged, and the screen says

> Could not load this page just now. Nothing has been lost — try again
> in a moment.

with `setLoading(false)` moved to a `finally`, so the spinner stops
whatever happened.

**Still open**: `TraceabilityPage` and `MyTasksPage` surface a trace
failure and an unreadable-source list respectively, but neither has a
general load-failure branch. Lower risk — both are read-only screens
whose failure is visible as "nothing appeared" — and recorded here
rather than fixed, because both load through services with their own
shapes and a uniform patch would have been guesswork.

---

## 5. Role-specific actions

The audit that mattered most, because the role model changed under
these screens in an earlier round.

### A regression found, and fixed

`resolveWorkRole` returns **null** for anybody holding more than one
operational role — deliberately, since answering with one of several
would make behaviour depend on which. Four screens still called it:

| Caller | What null did | Fixed to |
|---|---|---|
| `MainLayout` rail filter | **Skipped the PM-03 branch entirely** for multi-role holders, letting the legacy permission model decide the rail — the exact thing the comment above it says must not happen | `resolveWorkRoles` + `pageOpenableBy` |
| `CoaRegisterPage` | Fell through to the legacy floor instead of the union | `sectionAccessFor(roles, 'coa_register')` |
| `BatchDetailModal` | Hid *Record QC* from somebody entitled to it | `sectionAccessFor(roles, 'qc_testing')` |
| `PeopleTab` | Read `company_members.role`, which since `20261119000000` holds membership and never an operational role — so **every person in the list showed as holding nothing** | Reads `operational_role_assignments` |

None of these exposed anything: the database refuses regardless. The
rail one is the serious one, because it let a weaker model answer a
question the grid was supposed to own.

**Found by auditing the callers after the model changed, not by a
failing test.** A test now covers the union through `pageRefused` and
`sectionAccessFor`, but nothing would have caught a *caller* that
stopped consulting the grid — which is the same shape as the
dead-guard hazard the SQL side keeps meeting.

### Still open: dashboards for a person holding two roles

`App.tsx` picks a dashboard by sole role, so somebody holding both QC
Analyst and QA Manager gets the generic one rather than either
specific dashboard.

**Not changed, deliberately.** Choosing between them needs a
precedence rule — "QA Manager outranks QC Analyst" — and that is a
decision about the organisation, not a default to pick. The generic
dashboard is correct in the meantime: it derives its cards from the
sections the person actually holds, which for two roles is the union.

### What each role is told it cannot do

The screens explain refusals rather than hiding controls silently, and
name the database as the authority:

- Dispatch, as QA Manager: *"You can read this register but not add to
  it. Recording a dispatch is reserved to the storekeeper. The
  database enforces that, not this screen."*
- Batch execution, as QA Manager: *"You can read this batch record but
  not change it… reserved to the production supervisor."*
- Goods receipt, as QA Manager: *"Booking deliveries in is a
  Storekeeper task."*

That wording is the `HS-13` pattern — *"Page the role can't open: who
can, and how to ask"* — applied to a section rather than a page.

---

## 6. Screens in Figma with no page in the application

From the file's page list, compared against the rail. These are
recorded, not built; several are deliberate exclusions the register
already made.

| Figma page | State |
|---|---|
| Submissions & dossiers — W2·10 | Built (regulatory affairs) |
| Licences & products — W2·11 | Built |
| Materials — W4·15 | Built |
| Master formula — W4·16 | Built |
| Batch record — W4·17 | Built |
| Clearance, dispensing, calibration — W4·18 | Built |
| In-process and yield — W4·19 | Built |
| Deviation — W5·11 | Built |
| Release decision & rejection — W5·12 | Built |
| Genealogy trace — W5·13 | Built |
| Certificate of analysis — W5·14 | Built |
| Training & certificates — W6·28 | Built |
| Facility logs — W6·29 | Built |
| Registrations & customers — W6·30 | Partial — customers are not a page |
| Configuration surfaces — W6·31 | Partial — settings exist, not every surface |
| Honest state & dead ends — W6·32 | **This audit** |
| Ten-minute story — W6·33 | A walkthrough, not a screen |
| MVP prototype — full journey | A walkthrough, not a screen |
| Onboarding — W1·14 | Built |
| Signature & return — W1·15 | Built |
| Website UI cards — W1·12 | Marketing, out of scope |
| State display — W1·13 | Component states, folded into the pages |
| Deviation — W5·11 · v1 | Superseded in the file itself |

No Figma page is unaccounted for. The two partials are scope, not
defects, and neither is on the release path.

---

## 6b. Second pass: the four that had no fixture

The first pass rendered the harness's *"no fixture wired"* placeholder
for `batch-release`, `coa`, `deviations` and `master-formulas`, which
proves nothing about those pages. They are now wired and render real
content:

| Page | Renders |
|---|---|
| Batch release | *"Track QC testing and release decisions for every production batch."* |
| CoA register | *"Every CoA issued from a released batch — searchable, re-…"* |
| Deviations | *"Raise a deviation / Raising against a batch, a lot or an instrument happens from the…"* |
| Master formulas | *"The manufacturing instruction a batch is made against."* |

**17 pages, 0 page errors, 0 blank.**

### The rail, rendered for every role

| Rendered as | Rail items |
|---|---|
| qa_manager | 27 |
| qa_officer | 27 |
| compliance_admin | 27 |
| management | 27 |
| qc_analyst | 23 |
| storekeeper | 22 |
| procurement | 22 |
| production_supervisor | 20 |
| **qc_analyst + qa_manager** | **27 — the union** |
| no operational role | 26 (abstention; the legacy model decides) |

The multi-role row is the one that matters: before the fix in §5 it
fell through to the legacy permission model entirely. The harness now
takes `?roles=a,b` so that case can be looked at rather than reasoned
about.

## 7. What this audit did not cover

- **Phone layouts.** The file has an `HS-M04`–`HS-M13` set for phone
  states. The application is responsive but the phone states were not
  rendered at phone width in this pass.
- **The walkthrough pages** (W6·33, MVP prototype) as end-to-end
  journeys. Individual screens were checked; the journeys were not
  replayed.
- **Loading and slow states** (`HS-06`). Every page has a loading
  branch; none was tested under an artificially slow connection, so
  "words at every step, and a way out" is unverified.
- **Double-submit** (`HS-10`). The signature path has server-side
  single-use enforcement, which is the control that matters; the
  screen-level double-tap guard was not exercised.
