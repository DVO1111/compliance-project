/**
 * The onboarding hub, as the screen you land on after signing in.
 *
 * IT IS NOT A CHECKLIST OF LINKS. Each row opens a form, the form saves
 * to the database, and the row ticks because the value is now stored —
 * see src/lib/onboarding/setupSteps.ts for what each one writes and
 * where it shows up in the product.
 *
 * IT NEVER TRAPS ANYONE. "Finish later" opens the workspace and is
 * remembered per user, so the hub does not reappear on every sign-in.
 *
 * IT DOES NOT MAKE ANYONE WAIT FOR IT. The hub renders immediately and
 * the stored progress fills in when it arrives, rather than holding a
 * spinner over the whole screen first. Signing in is already several
 * round trips; adding one more before anything is drawn is what made it
 * feel slow.
 */

import { useCallback, useEffect, useState } from 'react';
import { logger } from '../../../lib/logger';
import {
  loadSetupState, completedFromState, EMPTY_SETUP_STATE, type SetupState,
} from '../../../lib/onboarding/setupSteps';
import SetupHub, { SETUP_STEPS } from './SetupHub';
import StepPanel from './StepPanel';

export interface SetupHubGateProps {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  /** Dismisses the hub and opens the workspace, optionally on a page. */
  onFinish: (navigateTo?: string) => void;
}

export default function SetupHubGate({ companyId, userId, onFinish }: SetupHubGateProps) {
  const [state, setState] = useState<SetupState>(EMPTY_SETUP_STATE);
  const [openStep, setOpenStep] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!companyId) return;
    loadSetupState(companyId, userId)
      .then(setState)
      //  The hub is still usable with nothing ticked, so a failed read
      //  leaves it empty rather than blocking the way in.
      .catch((err) => logger.warn('[setup] progress read failed', err));
  }, [companyId, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  //  SIGN IN → /onboarding. The hub is reached by state rather than by a
  //  router, so without this the address bar would still read "/" while
  //  the onboarding screen is showing. replaceState, not pushState: Back
  //  should leave onboarding rather than step through it.
  useEffect(() => {
    try {
      if (window.location.pathname.replace(/\/+$/, '').toLowerCase() !== '/onboarding') {
        window.history.replaceState({}, '', '/onboarding');
      }
    } catch { /* history is unavailable in some embedded views */ }
  }, []);

  const completed = completedFromState(state);
  const firstOpen = SETUP_STEPS.find((s) => completed[s.id] !== true);

  return (
    <>
      <SetupHub
        completed={completed}
        onOpenStep={(id) => setOpenStep(id)}
        onStartSetup={() => setOpenStep(firstOpen?.id ?? SETUP_STEPS[0].id)}
        onFinishLater={() => onFinish()}
      />

      {openStep && companyId && userId && (
        <StepPanel
          stepId={openStep}
          state={state}
          companyId={companyId}
          userId={userId}
          onSaved={refresh}
          onClose={() => setOpenStep(null)}
          onNavigate={(page) => onFinish(page)}
        />
      )}
    </>
  );
}
