import { describe, it, expect } from 'vitest';
import {
  CLOSURE_MEANINGS, CLOSURE_MEANING_LABEL, CLOSURE_ACTION,
  emptyClosureForm, checkClosureForm, canSubmitClosure,
  closeButtonLabel, closureUndertaking, orphanSignatureNotice,
} from '../lib/deviations/closure';

describe('closure meanings', () => {
  it('offers only meanings the signature vocabulary allows', () => {
    //  The seven from 3J.2. 'closed' is not one of them, which is why
    //  the design changed the label rather than adding an eighth.
    const allowed = ['authored', 'reviewed', 'approved', 'rejected',
      'verified', 'witnessed', 'released'];
    for (const m of CLOSURE_MEANINGS) expect(allowed).toContain(m);
  });

  it('does not offer rejection, because a rejected investigation does not close', () => {
    expect(CLOSURE_MEANINGS as readonly string[]).not.toContain('rejected');
  });

  it('labels every meaning it offers', () => {
    for (const m of CLOSURE_MEANINGS) {
      expect(CLOSURE_MEANING_LABEL[m]).toBeTruthy();
      //  First person. A signature block in the third person is a
      //  description of somebody else signing.
      expect(CLOSURE_MEANING_LABEL[m]).toMatch(/^I /);
    }
  });

  it('names the lifecycle action exactly once, as qa_close', () => {
    expect(CLOSURE_ACTION).toBe('qa_close');
  });
});

describe('checkClosureForm', () => {
  it('starts with both fields outstanding', () => {
    const problems = checkClosureForm(emptyClosureForm());
    expect(problems.map((p) => p.field).sort()).toEqual(['comment', 'password']);
  });

  it('reports every problem at once, not the first', () => {
    //  Each submission of this form is an attempt to sign, so finding
    //  out one thing at a time means signing three times to learn
    //  three things.
    expect(checkClosureForm({ meaning: 'approved', comment: '', password: '' })).toHaveLength(2);
  });

  it('treats whitespace as an empty comment', () => {
    const problems = checkClosureForm({
      meaning: 'approved', comment: '   \n  ', password: 'x',
    });
    expect(problems.map((p) => p.field)).toEqual(['comment']);
  });

  it('does not trim the password', () => {
    //  A password of spaces is a password. Trimming it here would
    //  reject a credential the database would have accepted.
    expect(checkClosureForm({
      meaning: 'approved', comment: 'Root cause addressed.', password: '   ',
    })).toEqual([]);
  });

  it('passes a complete form', () => {
    const form = { meaning: 'approved' as const, comment: 'CAPA raised.', password: 'pw' };
    expect(checkClosureForm(form)).toEqual([]);
    expect(canSubmitClosure(form)).toBe(true);
  });

  it('canSubmitClosure is false while anything is outstanding', () => {
    expect(canSubmitClosure(emptyClosureForm())).toBe(false);
  });
});

describe('closeButtonLabel', () => {
  it('names the irreversible act rather than saying Submit', () => {
    expect(closeButtonLabel(false)).toBe('Sign and close');
  });

  it('says what it is doing while it does it', () => {
    expect(closeButtonLabel(true)).toBe('Signing…');
  });
});

describe('closureUndertaking', () => {
  it('names the deviation, so the dialog cannot be about a different one', () => {
    expect(closureUndertaking('DV-2026-0042', 'approved')).toContain('DV-2026-0042');
  });

  it('says the record locks and that it cannot be undone', () => {
    const text = closureUndertaking('DV-1', 'approved');
    expect(text).toMatch(/locks/);
    expect(text).toMatch(/cannot be undone/);
  });

  it('says it stops blocking release, which is the consequence people care about', () => {
    expect(closureUndertaking('DV-1', 'approved')).toMatch(/blocking release/);
  });

  it('reads correctly for each meaning rather than for approval only', () => {
    expect(closureUndertaking('DV-1', 'approved')).toContain('approving');
    expect(closureUndertaking('DV-1', 'reviewed')).toContain('having reviewed');
  });
});

describe('orphanSignatureNotice', () => {
  it('says the signature WAS recorded, which a plain failure message would deny', () => {
    const notice = orphanSignatureNotice('Only QA may close a deviation.');
    expect(notice).toMatch(/signature was recorded/);
  });

  it('says the deviation did not close, and carries the reason verbatim', () => {
    const notice = orphanSignatureNotice('Only QA may close a deviation.');
    expect(notice).toMatch(/did not close/);
    expect(notice).toContain('Only QA may close a deviation.');
  });

  it('says the signature is unspent, so retrying is understood to be possible', () => {
    expect(orphanSignatureNotice('x')).toMatch(/unspent/);
  });
});
