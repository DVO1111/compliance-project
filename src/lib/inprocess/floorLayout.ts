/**
 * Workstation or phone — W4·19.
 *
 * Every flow in this section has both, and the design file draws them
 * as two compositions rather than one that reflows. The differences
 * are not spacing:
 *
 *   IP-M02 has NO ON-SCREEN KEYPAD. "The phone's number pad opens for
 *     entry" — so the field is a real input and the OS keyboard does
 *     the work. On a tablet bolted to a press there is no OS keyboard
 *     to open, and the 64 px keypad is the only way in.
 *   YR-M01 uses SHORT LABELS and BARE FIGURES, drops the threshold
 *     strip, puts the block above the account rather than beside it,
 *     and moves both routes into a sticky bar at the bottom.
 *   IP-M01 puts the prompt's button UNDER its text rather than beside
 *     it, and shrinks the dial from 72 px to 56.
 *
 * WHICH IS WHY THIS IS A PROP AND NOT A MEDIA QUERY. Those are
 * content decisions — which words, which controls, which figures —
 * and a stylesheet cannot make them. A component that tried would end
 * up with both sets of markup present and one of them hidden, which
 * is how a screen reader reads a keypad that is not there.
 *
 * IT IS ALSO NOT DERIVED FROM THE WINDOW BY DEFAULT. A workstation
 * tablet in portrait is 820 px wide and a phone is 390, but a tablet
 * can be docked beside another window and a phone can be a 1024 px
 * tablet in a technician's hand. The caller knows which device this
 * is; `useFloorLayout` is offered for the cases where it genuinely
 * does not, and it errs towards the workstation, because a phone
 * layout on a tablet wastes space while a workstation layout on a
 * phone is unusable.
 */

import { useEffect, useState } from 'react';

export type FloorLayout = 'workstation' | 'phone';

/** The width below which the phone composition is the right one. 560
 *  rather than a round 600: the workstation reading grid needs two
 *  150 px cells plus its padding, and below that it has nothing to
 *  lay out. */
export const PHONE_MAX_WIDTH = 560;

/**
 * The layout for the viewport, for callers that have no better
 * information.
 *
 * Returns 'workstation' on the first render and when there is no
 * `matchMedia` — during a server render, or in a test environment.
 * Erring that way is deliberate: a workstation layout briefly shown on
 * a phone reflows into place, whereas a phone layout briefly shown on
 * a wall-mounted tablet hides the keypad an operator is reaching for.
 */
export function useFloorLayout(): FloorLayout {
  const [layout, setLayout] = useState<FloorLayout>('workstation');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    const apply = () => setLayout(mq.matches ? 'phone' : 'workstation');
    apply();
    //  addEventListener rather than addListener: the latter is
    //  deprecated, and Safari has supported the former since 14.
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return layout;
}

/**
 * The touch targets each layout uses.
 *
 * A phone is held; a workstation tablet is poked at arm's length with
 * a gloved hand. Both are above the 44 px platform minimum, and the
 * workstation keypad is larger again because it takes twenty presses
 * per check.
 */
export const TARGET: Record<FloorLayout, { action: number; key: number; gap: number }> = {
  workstation: { action: 56, key: 64, gap: 12 },
  //  56 for an action on a phone too — the design draws every phone
  //  button at 56 — but the keypad is the OS's, so `key` is the
  //  single field instead.
  phone: { action: 56, key: 56, gap: 10 },
};
