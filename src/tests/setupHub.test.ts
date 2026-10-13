/**
 * The onboarding hub's rules, which come from the ONB-00 notes frame
 * rather than from anyone's judgement, and are the parts most likely to
 * be lost in a later edit.
 *
 * The icon registry is tested here too. It is a mapping, so the only
 * failure it can have is pointing at a glyph that does not exist — which
 * is a blank space at runtime and nothing at compile time, since the
 * import would have to be removed for TypeScript to notice.
 */
import { describe, it, expect } from 'vitest';
import {
  SETUP_STEPS, canOpenWorkspace, stepStates, metaLine, type SetupStep,
} from '../components/Onboarding/navy/SetupHub';
import {
  ICONS, ICON_SIZES, iconProps, icon, STATUS_ICONS,
  RENAMED_SINCE_TOOLKIT, APPROXIMATED, type IconName,
} from '../lib/design/icons';

const withDone = (done: string[]): SetupStep[] =>
  SETUP_STEPS.map((s) => ({ ...s, done: done.includes(s.id) }));

describe('the six steps', () => {
  it('there are six, in the order ONB-00 lists them', () => {
    expect(SETUP_STEPS.map((s) => s.id)).toEqual([
      'company-details',
      'industry-region',
      'sites-departments',
      'modules',
      'invite-team',
      'review-records',
    ]);
  });

  //  "4 steps become 6" — the count is the headline change in the notes.
  it('four are required and two are not', () => {
    expect(SETUP_STEPS.filter((s) => s.required)).toHaveLength(4);
    expect(SETUP_STEPS.filter((s) => !s.required).map((s) => s.id))
      .toEqual(['invite-team', 'review-records']);
  });
});

describe('canOpenWorkspace', () => {
  //  "'Skip setup' becomes 'Finish later'. Skipping straight to an empty
  //  dashboard is the problem J3.3 describes, so the workspace opens
  //  after steps 1-4." Four of six, not six of six.
  it('opens once the four required steps are done, with 5 and 6 outstanding', () => {
    const steps = withDone([
      'company-details', 'industry-region', 'sites-departments', 'modules',
    ]);
    expect(canOpenWorkspace(steps)).toBe(true);
    expect(steps.filter((s) => !s.done)).toHaveLength(2);
  });

  it('stays shut while any required step is outstanding', () => {
    expect(canOpenWorkspace(withDone([]))).toBe(false);
    expect(canOpenWorkspace(withDone(['company-details']))).toBe(false);
    //  Doing the two OPTIONAL steps does not open it: this is the case a
    //  naive "how many are done" count would get wrong, because it is
    //  two of six either way.
    expect(canOpenWorkspace(withDone(['invite-team', 'review-records']))).toBe(false);
  });

  it('is about which steps, not how many', () => {
    const fourOptionalish = withDone([
      'invite-team', 'review-records', 'company-details', 'industry-region',
    ]);
    expect(fourOptionalish.filter((s) => s.done)).toHaveLength(4);
    expect(canOpenWorkspace(fourOptionalish)).toBe(false);
  });
});

describe('stepStates', () => {
  it('the first unfinished step is the only Current one', () => {
    const states = stepStates(withDone(['company-details']));
    expect(states).toEqual([
      'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
    ]);
  });

  it('nothing is Current once every step is done', () => {
    const states = stepStates(withDone(SETUP_STEPS.map((s) => s.id)));
    expect(states.every((s) => s === 'done')).toBe(true);
  });

  //  A step finished out of order stays Done; the hub does not re-open it
  //  just because an earlier one is outstanding.
  it('a step done out of order stays Done', () => {
    const states = stepStates(withDone(['modules']));
    expect(states[0]).toBe('current');
    expect(states[3]).toBe('done');
  });
});

describe('metaLine', () => {
  it('reads "STEP n · ABOUT n MIN · REQUIRED" on desktop', () => {
    expect(metaLine(SETUP_STEPS[0], 0)).toBe('STEP 1 · ABOUT 2 MIN · REQUIRED');
  });

  //  "No time or count is shown that the product cannot back up.
  //  Durations are estimates and are labelled 'about'."
  it('always says "ABOUT" when it gives a duration', () => {
    for (const [i, s] of SETUP_STEPS.entries()) {
      const line = metaLine(s, i);
      if (s.aboutMinutes !== undefined) expect(line).toContain('ABOUT');
      else expect(line).not.toMatch(/MIN/);
    }
  });

  it('omits the duration where the design gives none', () => {
    //  Invite your team carries no estimate in ONB-00.
    expect(metaLine(SETUP_STEPS[4], 4)).toBe('STEP 5 · OPTIONAL NOW');
  });

  //  ONB-M00 shows "STEP 1 · REQUIRED": the durations go on mobile.
  it('drops the duration in compact mode', () => {
    expect(metaLine(SETUP_STEPS[0], 0, true)).toBe('STEP 1 · REQUIRED');
    expect(metaLine(SETUP_STEPS[2], 2, true)).toBe('STEP 3 · REQUIRED');
  });
});

describe('the icon toolkit', () => {
  it('every entry resolves to a real component', () => {
    const broken = (Object.keys(ICONS) as IconName[])
      .filter((k) => typeof ICONS[k] !== 'object' && typeof ICONS[k] !== 'function');
    expect(broken).toEqual([]);
  });

  it("covers all six of the toolkit's sections", () => {
    const prefixes = new Set(Object.keys(ICONS).map((k) => k.split('/')[0]));
    expect([...prefixes].sort()).toEqual(
      ['access', 'action', 'lifecycle', 'nav', 'quality', 'regulatory'],
    );
  });

  it('every step on the hub names an icon the toolkit has', () => {
    for (const s of SETUP_STEPS) expect(ICONS[s.iconName]).toBeTruthy();
  });

  //  THE STROKE RULE. "1.5 px at 16 · 1.75 px at 20. Weight is set in
  //  pixels for each size, not scaled down from the 24 master." Lucide's
  //  default is 2 and scales with the box, so a bare `size` gives a
  //  visibly heavier line than the toolkit asks for.
  it('pairs each size with its own stroke width', () => {
    expect(ICON_SIZES.sm).toEqual({ size: 16, strokeWidth: 1.5 });
    expect(ICON_SIZES.md).toEqual({ size: 20, strokeWidth: 1.75 });
  });

  it('iconProps carries the stroke width, never the size alone', () => {
    expect(iconProps('sm')).toMatchObject({ size: 16, strokeWidth: 1.5 });
    expect(iconProps('md')).toMatchObject({ size: 20, strokeWidth: 1.75 });
    expect(iconProps()).toMatchObject({ size: 16 });
  });

  it('icon() returns the same component as a direct lookup', () => {
    expect(icon('quality/dispensing')).toBe(ICONS['quality/dispensing']);
  });

  //  Each status pairs a colour with a DISTINCT shape, so the states stay
  //  legible in greyscale and to colour-blind readers. Two statuses share
  //  the danger colour, which is exactly why the shapes must differ.
  it('overdue and rejected share a colour but not a glyph', () => {
    expect(STATUS_ICONS.overdue.colour).toBe(STATUS_ICONS.rejected.colour);
    expect(STATUS_ICONS.overdue.icon).not.toBe(STATUS_ICONS.rejected.icon);
  });

  //  The rule generalises: no two states may draw the same shape, or the
  //  pair that happens to share a colour becomes indistinguishable. This
  //  is the assertion that caught on-hold reusing the reject glyph.
  it('no two statuses draw the same glyph', () => {
    const glyphs = Object.values(STATUS_ICONS).map((s) => s.icon);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('every status names the token it came from', () => {
    for (const s of Object.values(STATUS_ICONS)) {
      expect(s.token).toMatch(/^status\//);
      expect(s.colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  //  The version divergence is recorded as data so an upgrade has a
  //  checklist. These assertions keep the record honest: every icon it
  //  names must still exist.
  it('the rename list points at icons that exist', () => {
    for (const r of RENAMED_SINCE_TOOLKIT) {
      for (const n of r.icons) expect(ICONS[n]).toBeTruthy();
    }
  });

  it('the approximation list is explicit about what differs', () => {
    expect(APPROXIMATED).toHaveLength(1);
    expect(APPROXIMATED[0].name).toBe('lifecycle/signature');
    expect(ICONS[APPROXIMATED[0].name]).toBeTruthy();
  });
});
