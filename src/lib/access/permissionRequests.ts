/**
 * Asking for access, and deciding on it — W2-0 (Dashboard & permissions).
 *
 * The page header states the flow, and every rule below comes from it
 * or from one of the screens rather than from my judgement:
 *
 *   "1. A person sees a locked stage or section and taps Request access.
 *    2. They pick the section, View or Act, which records, how long and
 *       why. ACT IS DISABLED WHERE SEGREGATION OF DUTIES FORBIDS IT.
 *    3. The request goes to the Compliance admin with an automatic
 *       conflict check.
 *    4. The admin grants as asked, grants with limits (shorter time,
 *       fewer records, with a note) or declines with a reason.
 *    5. Later the admin can restrict, pause or revoke the grant...
 *       Everything is logged."
 *
 * And two rules carried from the sources:
 *
 *   "Release is a step permission, not a page permission; IT CANNOT BE
 *    REQUESTED (2.5, C8.6)."
 *   "Users don't see actions they can't take; locked sections show why
 *    and how to ask."
 *
 * WHY THE CONFLICT CHECK IS HERE AND NOT IN A SCREEN. Segregation of
 * duties is the control that stops one person both doing a thing and
 * approving it, and it is the first thing an inspector tests. If the
 * check lived in the request dialog, an admin reviewing a request would
 * be relying on the asker's screen having run it — and the API would
 * have no opinion at all. So the rule is a function, the dialog uses it
 * to disable Act, the review drawer uses it to show "Conflict", and
 * both are reading the same answer.
 *
 * NOTHING HERE GRANTS ANYTHING. These are decisions about a request;
 * the grant itself is written by the database, which re-checks. A
 * browser is not a security boundary, and this module is in the browser.
 */

/** The sections a person can hold access to. */
export type AccessSection =
  | 'batch_records' | 'batch_release' | 'qc_testing' | 'qa_disposition'
  | 'material_lots' | 'deviation_capa' | 'change_control' | 'sop_library'
  | 'gmp_inspection' | 'products' | 'registrations_licences'
  | 'obligations' | 'risk_register' | 'policies' | 'audit_trail';

/** What they want to do there. */
export type AccessLevel = 'view' | 'act';

/** The job the person holds, which is what duties are segregated by. */
export type WorkRole =
  | 'production_operator' | 'production_supervisor'
  | 'storekeeper' | 'qc_analyst' | 'qa_officer' | 'qa_manager'
  | 'regulatory_affairs' | 'procurement' | 'compliance_admin' | 'other';

export interface AccessRequestInput {
  section: AccessSection;
  level: AccessLevel;
  /** Which records. Free text on screen: "Lots they received". */
  scope: string;
  /** ISO date, or null for "No end date". */
  until: string | null;
  reason: string;
}

export const SECTION_LABELS: Record<AccessSection, string> = {
  batch_records:          'Batch records',
  batch_release:          'Batch release decision',
  qc_testing:             'QC testing',
  qa_disposition:         'QA disposition',
  material_lots:          'Material lots',
  deviation_capa:         'Deviation / CAPA',
  change_control:         'Change control',
  sop_library:            'SOP library',
  gmp_inspection:         'GMP inspection',
  products:               'Products',
  registrations_licences: 'Registrations & Licences',
  obligations:            'Obligations',
  risk_register:          'Risk register',
  policies:               'Policies',
  audit_trail:            'Audit trail',
};

// ── What can be asked for at all ─────────────────────────────────────

/**
 * "Release is a step permission, not a page permission; it can't be
 * requested."
 *
 * The screen says it in the person's own words — "QA release role only ·
 * can't be requested" — on a locked tile that offers no Request button.
 * Releasing a batch is not a page somebody can be let into: it is the
 * act the whole quality system exists to control, and it belongs to the
 * designated QA release role or to nobody.
 */
export const UNREQUESTABLE: Partial<Record<AccessSection, string>> = {
  batch_release:
    'Batch release is a step permission held by the designated QA release role. '
    + 'It cannot be requested — it is assigned with the role.',
};

export function canBeRequested(section: AccessSection): boolean {
  return UNREQUESTABLE[section] === undefined;
}

/** Why not, for the locked tile. Null when it can be requested. */
export function unrequestableReason(section: AccessSection): string | null {
  return UNREQUESTABLE[section] ?? null;
}

// ── Segregation of duties ────────────────────────────────────────────

export interface Conflict {
  /** Shown as the CHECK column's "Conflict" / "No conflict". */
  conflicts: boolean;
  /** Present whenever conflicts is true. Never a bare "Conflict". */
  reason?: string;
  /**
   * What to tell the asker instead. The design's own declines read like
   * this: "Issuing material is a Storekeeper task. Ask Tunde to issue
   * lots." A refusal that names the right person is a redirection; one
   * that does not is a wall.
   */
  insteadAsk?: string;
}

/**
 * The pairs that must not meet in one person.
 *
 * Each entry is a role that may not ACT on a section, with the reason
 * written as the inspector's question rather than as a rule number.
 * VIEW is never a conflict: seeing a record you cannot change is how
 * people do their jobs, and the design's own example grants a
 * storekeeper View on QC testing with "No conflict".
 */
const ACT_CONFLICTS: { role: WorkRole; section: AccessSection; reason: string; insteadAsk: string }[] = [
  {
    role: 'qc_analyst', section: 'qa_disposition',
    reason: 'A QC analyst tests the material. Deciding its disposition as well would mean '
      + 'approving their own result.',
    insteadAsk: 'QA disposition belongs to a QA officer or QA manager.',
  },
  {
    role: 'production_operator', section: 'qa_disposition',
    reason: 'Production makes the batch. Disposition is the independent check on it.',
    insteadAsk: 'Ask a QA officer to record the disposition.',
  },
  {
    role: 'production_supervisor', section: 'qa_disposition',
    reason: 'Production makes the batch. Disposition is the independent check on it.',
    insteadAsk: 'Ask a QA officer to record the disposition.',
  },
  {
    role: 'production_operator', section: 'qc_testing',
    reason: 'Testing the batch you produced is not an independent test.',
    insteadAsk: 'QC testing belongs to a QC analyst.',
  },
  {
    role: 'production_supervisor', section: 'qc_testing',
    reason: 'Testing the batch your line produced is not an independent test.',
    insteadAsk: 'QC testing belongs to a QC analyst.',
  },
  {
    //  The design's own declined example: "Issuing material is a
    //  Storekeeper task. Ask Tunde to issue lots."
    role: 'production_operator', section: 'material_lots',
    reason: 'Issuing material to your own line removes the second pair of hands between '
      + 'the store and the batch.',
    insteadAsk: 'Issuing material is a storekeeper task.',
  },
  {
    //  The dialog's own words on the disabled Act option, kept verbatim
    //  because they say the WHY and not just the rule.
    role: 'storekeeper', section: 'qc_testing',
    reason: 'QC results must be recorded by QC, so the person receiving material never '
      + 'tests it.',
    insteadAsk: 'QC testing belongs to a QC analyst.',
  },
  {
    //  "Segregation of duties — enforced for everyone, INCLUDING
    //  ADMINS." The Compliance admin decides who can open what; if
    //  they could also act in QA disposition, they could grant
    //  themselves the one permission the whole quality system is built
    //  to separate, and the access log would show it as routine
    //  administration.
    role: 'compliance_admin', section: 'qa_disposition',
    reason: 'A Compliance admin decides who holds access. Acting in QA disposition as well '
      + 'would let one person grant themselves the decision they then make.',
    insteadAsk: 'QA disposition belongs to a QA officer or QA manager.',
  },
  {
    role: 'qc_analyst', section: 'batch_records',
    reason: 'A QC analyst records results against a batch. Editing the batch record itself '
      + 'would let the result and the record be changed together.',
    insteadAsk: 'Batch records belong to production.',
  },
];

/**
 * Sections only named roles may act in.
 *
 * WHY AN ALLOWLIST AND NOT MORE PAIRS. PM-03's matrix shows QA
 * disposition locked for Procurement, Storekeeper, QC Analyst,
 * Production supervisor and the Compliance admin — everyone drawn
 * except QA. Expressing that as five more rows in ACT_CONFLICTS would
 * look identical on that screen and be wrong in the one case the
 * screen does not draw: a role nobody thought of. `other` exists, new
 * roles get added, and a denylist says yes to every one of them.
 *
 * So the sections where acting IS the control get named owners, and
 * everything not named is refused. A denylist is safe only if it is
 * complete, and nothing keeps it complete.
 */
const ACT_RESTRICTED_TO: Partial<Record<AccessSection, {
  roles: WorkRole[]; reason: string; insteadAsk: string;
}>> = {
  qa_disposition: {
    roles: ['qa_officer', 'qa_manager'],
    reason: 'Deciding the disposition of material is the independent quality check on '
      + 'everyone else\'s work.',
    insteadAsk: 'QA disposition belongs to a QA officer or QA manager.',
  },
};

/**
 * The automatic check step 3 describes. Pure, so the request dialog can
 * disable Act with the same answer the admin's drawer will show.
 */
export function checkConflict(
  role: WorkRole, section: AccessSection, level: AccessLevel,
): Conflict {
  //  "Act is disabled where segregation of duties forbids it" — the
  //  rule is about acting. Viewing is not a conflict.
  if (level === 'view') return { conflicts: false };

  //  The allowlist first: where a section has named owners, everyone
  //  else is refused, including roles that have no explicit pair.
  const owned = ACT_RESTRICTED_TO[section];
  if (owned && !owned.roles.includes(role)) {
    //  A role WITH an explicit pair keeps that pair's wording, which is
    //  written for them — "approving their own result" says more to a
    //  QC analyst than the generic sentence does.
    const specific = ACT_CONFLICTS.find((c) => c.role === role && c.section === section);
    return specific
      ? { conflicts: true, reason: specific.reason, insteadAsk: specific.insteadAsk }
      : { conflicts: true, reason: owned.reason, insteadAsk: owned.insteadAsk };
  }

  const hit = ACT_CONFLICTS.find((c) => c.role === role && c.section === section);
  if (!hit) return { conflicts: false };

  return { conflicts: true, reason: hit.reason, insteadAsk: hit.insteadAsk };
}

/** Every section this role may not act on. Drives the dialog's disabling. */
export function forbiddenActSections(role: WorkRole): AccessSection[] {
  const out = new Set<AccessSection>(
    ACT_CONFLICTS.filter((c) => c.role === role).map((c) => c.section),
  );
  for (const [section, owned] of Object.entries(ACT_RESTRICTED_TO)) {
    if (!owned!.roles.includes(role)) out.add(section as AccessSection);
  }
  return [...out];
}

export const ROLE_LABELS: Record<WorkRole, string> = {
  production_operator:   'Production operator',
  production_supervisor: 'Production supervisor',
  storekeeper:           'Storekeeper',
  qc_analyst:            'QC Analyst',
  qa_officer:            'QA Officer',
  qa_manager:            'QA Manager',
  regulatory_affairs:    'Regulatory affairs',
  procurement:           'Procurement',
  compliance_admin:      'Compliance admin',
  other:                 'Other',
};

/**
 * The "Segregation of duties · enforced for everyone, including admins"
 * card, one line per role.
 *
 * DERIVED, not written out. The design shows four sentences —
 * "Storekeeper can't record QC results or make dispositions" and so on
 * — and typing those in would make a fifth copy of the rule, one that
 * nothing checks and that would still read "four" after a fifth rule
 * was added. Grouping the same table the check reads means the card
 * cannot describe a rule that is not enforced, or omit one that is.
 */
export function segregationSummary(): { role: WorkRole; line: string }[] {
  const byRole = new Map<WorkRole, AccessSection[]>();
  for (const c of ACT_CONFLICTS) {
    byRole.set(c.role, [...(byRole.get(c.role) ?? []), c.section]);
  }
  //  The allowlist's effect on the roles the card already names. It is
  //  not expanded into a line for every other role — "Regulatory
  //  affairs can't act in QA disposition" is true and is noise, and
  //  the matrix's lock already says it where it matters.
  for (const [section, owned] of Object.entries(ACT_RESTRICTED_TO)) {
    for (const role of byRole.keys()) {
      const list = byRole.get(role)!;
      if (!owned!.roles.includes(role) && !list.includes(section as AccessSection)) {
        byRole.set(role, [...list, section as AccessSection]);
      }
    }
  }

  return [...byRole.entries()].map(([role, sections]) => {
    const names = sections.map((s) => SECTION_LABELS[s]);
    const list = names.length === 1 ? names[0]
      : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
    return { role, line: `${ROLE_LABELS[role]} can't act in ${list}.` };
  });
}

// ── What the two levels mean, per section ────────────────────────────

/**
 * The sentence under each radio in the request dialog.
 *
 * The design writes both levels out for the section being asked about —
 * "See sampling status, results and evidence. You can't change
 * anything." / "Record samples and results." — rather than a generic
 * "read" and "write". Somebody asking for access to QC testing does not
 * think in CRUD, and a dialog that does makes them guess what they are
 * agreeing to. Both sentences are the design's for QC testing; the rest
 * follow its pattern, naming the records and the act.
 */
export const LEVEL_MEANING: Record<AccessSection, { view: string; act: string }> = {
  batch_records: {
    view: 'See batch records, their steps and their evidence. You can\'t change anything.',
    act: 'Record steps, readings and in-process checks on a batch record.',
  },
  batch_release: {
    view: 'See release decisions and what they were based on.',
    act: 'Release or reject a finished batch.',
  },
  qc_testing: {
    view: 'See sampling status, results and evidence. You can\'t change anything.',
    act: 'Record samples and results.',
  },
  qa_disposition: {
    view: 'See dispositions and the results behind them.',
    act: 'Approve, hold or reject material and batches.',
  },
  material_lots: {
    view: 'See lots, their status and where they are.',
    act: 'Receive, move and issue material lots.',
  },
  deviation_capa: {
    view: 'See deviations, investigations and CAPAs.',
    act: 'Raise deviations, investigate them and record CAPA actions.',
  },
  change_control: {
    view: 'See change requests and their assessments.',
    act: 'Raise changes and record their assessment and implementation.',
  },
  sop_library: {
    view: 'Read the current version of each SOP.',
    act: 'Draft and revise SOPs, and route them for approval.',
  },
  gmp_inspection: {
    view: 'See inspection findings and their responses.',
    act: 'Record findings and their responses.',
  },
  products: {
    view: 'See products, their stage and what each stage permits.',
    act: 'Add and edit products, and move them between stages.',
  },
  registrations_licences: {
    view: 'See registrations, licences and their expiry dates.',
    act: 'Record registrations and licences, and start renewals.',
  },
  obligations: {
    view: 'See obligations and when each one is due.',
    act: 'Record evidence against an obligation and close it.',
  },
  risk_register: {
    view: 'See risks, their rating and their controls.',
    act: 'Add and re-rate risks, and record their controls.',
  },
  policies: {
    view: 'Read the current version of each policy.',
    act: 'Draft and revise policies, and route them for approval.',
  },
  audit_trail: {
    view: 'See the history of records, including who changed what and when.',
    //  Deliberately not an action anybody can be granted. The audit
    //  trail is append-only by design, and an Act level on it would be
    //  a contradiction rather than a permission.
    act: 'The audit trail cannot be edited by anyone.',
  },
};

// ── The checks the admin sees before deciding ────────────────────────

export interface ReviewCheck {
  /** Whether it passed. A failed check is shown, never hidden. */
  passed: boolean;
  /** One sentence. Always present, pass or fail. */
  note: string;
}

/** What the admin's drawer knows about the workspace, beyond the request. */
export interface ReviewContext {
  /** The site the request is for, named in the checks. */
  site?: string;
  /** Whether the section is switched on at that site. */
  sectionEnabledAtSite?: boolean;
  /** Whether the person already holds a live grant on this section. */
  existingGrant?: { level: AccessLevel; until: string | null } | null;
}

/**
 * The CHECKS block, in the drawer's order.
 *
 * It is a LIST and not a verdict, and that is the point. An admin
 * deciding on access is being asked to hold three separate facts at
 * once — is this a duties conflict, is the section even switched on
 * here, and do they already have something — and a single "Conflict /
 * No conflict" chip collapses all three into the one the computer
 * happens to know about. Each check carries its own sentence so a
 * failure says which of the three failed.
 */
export function reviewChecks(
  request: AccessRequestInput,
  role: WorkRole,
  roleLabel: string,
  context: ReviewContext = {},
): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const section = SECTION_LABELS[request.section];

  const conflict = checkConflict(role, request.section, request.level);
  checks.push(conflict.conflicts
    ? { passed: false, note: `Segregation-of-duties conflict: ${conflict.reason} ${conflict.insteadAsk ?? ''}`.trim() }
    //  The design's own passing sentence says what the grant does NOT
    //  let them do, which is the part the admin is being asked to be
    //  sure of: "viewing QC results doesn't let a Storekeeper record or
    //  approve them."
    : {
      passed: true,
      //  Section labels are NOT lower-cased on the way into a sentence.
      //  Half of them start with an acronym — QC testing, QA
      //  disposition, SOP library, GMP inspection — and lowercasing
      //  turns the control's own name into "qc testing".
      note: request.level === 'view'
        ? `No segregation-of-duties conflict: viewing ${section} doesn't let a ${roleLabel} change it.`
        : `No segregation-of-duties conflict for a ${roleLabel} acting on ${section}.`,
    });

  if (context.sectionEnabledAtSite !== undefined) {
    const where = context.site ? ` at ${context.site}` : '';
    checks.push(context.sectionEnabledAtSite
      ? { passed: true, note: `${section} is enabled${where}.` }
      : { passed: false, note: `${section} is not enabled${where}, so a grant would do nothing.` });
  }

  if (context.existingGrant !== undefined) {
    const held = context.existingGrant;
    checks.push(held
      ? {
        passed: false,
        note: `They already hold ${held.level === 'act' ? 'Act' : 'View'} on this section`
          + `${held.until ? ` until ${held.until}` : ' with no end date'}. Change that grant instead of adding a second one.`,
      }
      : { passed: true, note: 'No other active grant for this section.' });
  }

  return checks;
}

// ── Deciding ─────────────────────────────────────────────────────────

export type Decision =
  | { kind: 'grant_as_asked' }
  | { kind: 'grant_with_limits'; level: AccessLevel; scope: string; until: string | null; note: string }
  | { kind: 'decline'; reason: string };

export type DecisionCheck =
  | { ok: true }
  | { ok: false; field: 'note' | 'reason' | 'limits' | 'conflict'; message: string };

/** The longest a temporary grant may run. The design asks the question
 *  — "Maximum length of a temporary grant (suggest 90 days)?" — and
 *  this is its suggestion, in one place so answering it later is a
 *  one-line change rather than a hunt. */
export const MAX_GRANT_DAYS = 90;

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, isoDate: string): number {
  const end = new Date(isoDate + 'T00:00:00Z').getTime();
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((end - start) / DAY);
}

/**
 * Whether a decision may be recorded as made.
 *
 * The screen's rules, each of which exists because of what it prevents:
 *
 *   "Note to Tunde (REQUIRED WHEN YOU CHANGE THE REQUEST)" — a grant
 *   that quietly gives less than was asked for leaves somebody
 *   wondering why their access does not work.
 *
 *   "Decline. They keep their current access. A REASON IS REQUIRED." —
 *   a refusal with no reason cannot be appealed or learned from.
 *
 *   Granting Act into a conflict is refused outright. An admin may
 *   narrow a request; they may not approve a segregation-of-duties
 *   breach by clicking through it.
 */
export function checkDecision(
  decision: Decision,
  request: AccessRequestInput,
  role: WorkRole,
  now: Date = new Date(),
): DecisionCheck {
  if (decision.kind === 'decline') {
    return decision.reason.trim() === ''
      ? { ok: false, field: 'reason', message: 'Say why, so the person knows what to do next.' }
      : { ok: true };
  }

  const level = decision.kind === 'grant_with_limits' ? decision.level : request.level;
  const until = decision.kind === 'grant_with_limits' ? decision.until : request.until;

  const conflict = checkConflict(role, request.section, level);
  if (conflict.conflicts) {
    return {
      ok: false, field: 'conflict',
      message: `${conflict.reason} ${conflict.insteadAsk ?? ''}`.trim(),
    };
  }

  if (!canBeRequested(request.section)) {
    return { ok: false, field: 'conflict', message: unrequestableReason(request.section)! };
  }

  if (until !== null) {
    const days = daysBetween(now, until);
    if (days < 0) {
      return { ok: false, field: 'limits', message: 'That end date has already passed.' };
    }
    if (days > MAX_GRANT_DAYS) {
      return {
        ok: false, field: 'limits',
        message: `A temporary grant runs for at most ${MAX_GRANT_DAYS} days.`,
      };
    }
  }

  if (decision.kind === 'grant_with_limits') {
    const narrowed = decision.level !== request.level
      || decision.scope !== request.scope
      || decision.until !== request.until;

    //  Choosing "grant with limits" and then changing nothing is a
    //  grant as asked, and should be recorded as one rather than as a
    //  limited grant with no limits.
    if (!narrowed) {
      return {
        ok: false, field: 'limits',
        message: 'Nothing was narrowed. Use "Grant as asked", or shorten the time or the records.',
      };
    }

    //  Widening is not narrowing. An admin who wants to give more than
    //  was asked for is making a different decision, and it should not
    //  travel under a note addressed to the asker.
    if (request.level === 'view' && decision.level === 'act') {
      return {
        ok: false, field: 'limits',
        message: 'This would give more than was asked for. Act has to be requested, not added.',
      };
    }

    if (decision.note.trim() === '') {
      return {
        ok: false, field: 'note',
        message: 'A note is required when you change the request, so the person knows what they got.',
      };
    }
  }

  return { ok: true };
}

/**
 * The one-line summary the Change log shows: "Granted, narrowed",
 * "Declined", "Granted".
 */
export function describeDecision(decision: Decision): string {
  if (decision.kind === 'decline') return 'Declined';
  if (decision.kind === 'grant_as_asked') return 'Granted';
  return 'Granted, narrowed';
}

/**
 * The drawer's three options, and its primary button, which takes the
 * selected option's own words. The design shows "Grant with limits" on
 * the button while that option is selected, so the button never says
 * something the admin has to translate.
 */
export const DECISION_OPTIONS: { kind: Decision['kind']; title: string; blurb: string }[] = [
  {
    kind: 'grant_as_asked', title: 'Grant as asked',
    blurb: '',   //  filled by the screen with the request's own terms
  },
  {
    kind: 'grant_with_limits', title: 'Grant with limits',
    blurb: 'Narrow the records or shorten the time. Tell them why.',
  },
  {
    kind: 'decline', title: 'Decline',
    blurb: 'They keep their current access. A reason is required.',
  },
];

export function decisionButtonLabel(kind: Decision['kind']): string {
  return DECISION_OPTIONS.find((o) => o.kind === kind)!.title;
}

// ── The access chip ──────────────────────────────────────────────────

/**
 * What a person's standing on a stage or section is, as the dashboard's
 * legend puts it: "Your access: Act · View · No access".
 *
 * `not_requestable` is a fourth value and not a flavour of `none`,
 * because the two behave differently: a locked section offers a Request
 * button and a not-requestable one must not.
 */
export type AccessGrade = 'act' | 'view' | 'none' | 'not_requestable';

export function gradeLabel(grade: AccessGrade): string {
  switch (grade) {
    case 'act':  return 'Act';
    case 'view': return 'View';
    case 'none': return 'No access';
    case 'not_requestable': return 'Not requestable';
  }
}
