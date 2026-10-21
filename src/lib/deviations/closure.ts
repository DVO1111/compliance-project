/**
 * W5·11 / DV-08 — closing a deviation.
 *
 * Closure is the one action on this screen that cannot be undone, so
 * the rules about it live here, apart from the dialog that collects it
 * and apart from the service that sends it. Nothing in this file
 * imports a client.
 *
 * THREE THINGS THIS FILE DOES NOT DECIDE, each deliberately.
 *
 * 1. WHETHER THE DEVIATION MAY CLOSE. deviation_closure_readiness
 *    reports that, and assessReadiness in investigation.ts counts only
 *    the conditions marked blocking. A predicate here would be a second
 *    opinion that can disagree with the database at the moment it
 *    matters, and the database is the one that refuses.
 *
 * 2. WHETHER THIS PERSON MAY CLOSE IT. The transition carries
 *    required_role 'admin,compliance_officer' and the engine checks it.
 *    The screen hides the button from everybody else, which is a
 *    courtesy rather than a control.
 *
 * 3. WHAT THE SIGNATURE MEANS. 'approved' is the meaning the design
 *    settled on — the board originally said "Closed", which is not one
 *    of the seven meanings the signature vocabulary allows, and
 *    inventing an eighth to match a label would weaken the vocabulary
 *    for every other record that uses it.
 */

/** The meanings offered when closing. A closure is an approval: the
 *  QA authority is approving the investigation and its outcome, not
 *  merely witnessing it. 'rejected' is absent because a rejected
 *  investigation goes back for more work through
 *  return_to_investigation, and does not close. */
export const CLOSURE_MEANINGS = ['approved', 'reviewed'] as const;
export type ClosureMeaning = (typeof CLOSURE_MEANINGS)[number];

export const CLOSURE_MEANING_LABEL: Record<ClosureMeaning, string> = {
  approved: 'I approve this investigation and its outcome',
  reviewed: 'I have reviewed this investigation',
};

/** The action key on the deviation lifecycle. Named once, because a
 *  typo here fails as "no such transition", which reads like a missing
 *  migration rather than a misspelling. */
export const CLOSURE_ACTION = 'qa_close';

export interface ClosureForm {
  meaning: ClosureMeaning;
  /** Required by the transition — requires_comment is true on qa_close.
   *  The engine refuses an empty one, so the dialog asks for it rather
   *  than letting the refusal explain it afterwards. */
  comment: string;
  /** Re-entered at the moment of signing. Never stored, never logged,
   *  never put in component state that outlives the dialog. */
  password: string;
}

export function emptyClosureForm(): ClosureForm {
  return { meaning: 'approved', comment: '', password: '' };
}

export interface FormProblem {
  field: 'comment' | 'password';
  message: string;
}

/**
 * Everything wrong with the form, not the first thing.
 *
 * A dialog that reports one problem at a time makes somebody submit
 * three times to learn three things, and each submission here is an
 * attempt to sign.
 */
export function checkClosureForm(f: ClosureForm): FormProblem[] {
  const problems: FormProblem[] = [];
  if (f.comment.trim().length === 0) {
    problems.push({
      field: 'comment',
      message: 'A closure comment is required. It is the record of why this deviation closed.',
    });
  }
  if (f.password.length === 0) {
    problems.push({
      field: 'password',
      message: 'Re-enter your password to sign.',
    });
  }
  return problems;
}

/** Whether the dialog can submit. Separate from checkClosureForm so the
 *  button can be disabled without the form showing errors somebody has
 *  not had a chance to cause yet. */
export function canSubmitClosure(f: ClosureForm): boolean {
  return checkClosureForm(f).length === 0;
}

/**
 * What the button says.
 *
 * It names the irreversible thing. "Submit" and "Confirm" are what a
 * button says when the writer does not want to think about what it
 * does, and this one locks a compliance record permanently.
 */
export function closeButtonLabel(saving: boolean): string {
  return saving ? 'Signing…' : 'Sign and close';
}

/**
 * The sentence above the password field.
 *
 * Says what signing commits to, in the words of the thing being
 * signed, because a signature block that only says "enter your
 * password" is collecting a password rather than taking a signature.
 */
export function closureUndertaking(deviationNumber: string, meaning: ClosureMeaning): string {
  return `Signing records you as ${meaning === 'approved' ? 'approving' : 'having reviewed'}`
    + ` ${deviationNumber} and its investigation. The deviation closes, the record locks,`
    + ' and it stops blocking release. This cannot be undone.';
}

/**
 * What to say when a signature succeeded and the transition did not.
 *
 * This is a real state rather than a theoretical one: signing and
 * transitioning are two statements, and the second can be refused — by
 * a role check, by a condition that became blocking between the panel
 * loading and the button being pressed. The signature then exists and
 * is unspent, which is not the same as nothing having happened, and
 * telling somebody "closure failed" would leave them believing they had
 * not signed.
 */
export function orphanSignatureNotice(message: string): string {
  return `Your signature was recorded, but the deviation did not close: ${message}`
    + ' The signature remains unspent — nothing was closed, and you can try again'
    + ' once the reason above is resolved.';
}
