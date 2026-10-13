/**
 * The onboarding hub as the screen you land on after signing in.
 *
 * WHAT IT REPLACES. This slot used to render CompanySetupChecklist. The
 * hub is the v2 design of the same moment (ONB-00), so it takes the slot
 * rather than sitting beside it.
 *
 * IT NEVER TRAPS ANYONE, and that is the condition on it being here at
 * all. Two of the six steps ask for things this database cannot yet
 * store — `companies` holds only id, name and created_at, so there is
 * nowhere to put a CAC number or a head office, and there is no `sites`
 * table — so a hub that demanded all six before opening the workspace
 * would be a locked door. "Finish later" always opens the workspace, and
 * it is recorded per user, so the hub does not reappear on every sign-in
 * once it has been dismissed.
 *
 * WHAT "DONE" MEANS HERE. Only the three steps whose state actually
 * exists are ever ticked, and each is ticked by reading the real data,
 * never by remembering that someone visited the screen:
 *
 *   industry and region   the profile carries industry_type and
 *                         default_jurisdiction, both set at sign-up
 *   sites and departments at least one department exists
 *   invite your team      the company has more than one member
 *
 * The other three stay open because nothing in the database can tell us
 * otherwise. That is a truthful 3 of 6, not a decorative one — the
 * progress bar is only worth having if it cannot lie.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import SetupHub, { SETUP_STEPS } from './SetupHub';
import BrandSplash from '../../BrandSplash';

/**
 * Where each step sends you. Several share a destination, because one
 * screen covers several steps today.
 *
 * `company-details` goes to Company Settings even though the fields it
 * describes — CAC registration number, head office — have nowhere to be
 * stored yet. A button that does nothing when pressed is worse than one
 * that lands somewhere approximately right: the first reads as a broken
 * product, the second as an unfinished one. When those columns exist,
 * this is the line that changes.
 */
export const STEP_DESTINATION: Record<string, string> = {
  'company-details': 'company-settings',
  'industry-region': 'company-settings',
  'sites-departments': 'company-departments',
  'modules': 'company-settings',
  'invite-team': 'company-invites',
  'review-records': 'obligations',
};

export interface SetupProgressInput {
  companyId: string | null | undefined;
  industryType?: string | null;
  jurisdiction?: string | null;
}

/** Reads the three checkable steps. Anything that fails is reported as
 *  NOT done: a lookup that errored is not evidence that the work was
 *  finished, and claiming otherwise would tick a box on a failure. */
export async function fetchSetupProgress(
  input: SetupProgressInput,
): Promise<Record<string, boolean>> {
  const done: Record<string, boolean> = {
    'industry-region': Boolean(input.industryType && input.jurisdiction),
  };

  if (!input.companyId) return done;

  const [departments, members] = await Promise.all([
    (supabase as any)
      .from('departments')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', input.companyId),
    (supabase as any)
      .from('company_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('company_id', input.companyId),
  ]);

  if (departments?.error) {
    logger.warn('setup progress: department count failed', departments.error.message);
  } else {
    done['sites-departments'] = (departments?.count ?? 0) > 0;
  }

  if (members?.error) {
    logger.warn('setup progress: member count failed', members.error.message);
  } else {
    //  More than one, because the person reading this screen is the first.
    done['invite-team'] = (members?.count ?? 0) > 1;
  }

  return done;
}

export interface SetupHubGateProps {
  companyId: string | null | undefined;
  industryType?: string | null;
  jurisdiction?: string | null;
  /** Dismisses the hub and opens the workspace, optionally on a page. */
  onFinish: (navigateTo?: string) => void;
}

export default function SetupHubGate({
  companyId, industryType, jurisdiction, onFinish,
}: SetupHubGateProps) {
  const [completed, setCompleted] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let live = true;
    fetchSetupProgress({ companyId, industryType, jurisdiction })
      .then((p) => { if (live) setCompleted(p); })
      .catch((err) => {
        //  The hub is still useful with nothing ticked, so a failed probe
        //  shows the hub rather than blocking the way in.
        logger.warn('setup progress failed', err);
        if (live) setCompleted({});
      });
    return () => { live = false; };
  }, [companyId, industryType, jurisdiction]);

  if (completed === null) return <BrandSplash />;

  const openStep = (stepId: string) => {
    //  Dismisses the hub and opens the workspace on that step's screen.
    //  Falling back to Company Settings means every row leads somewhere:
    //  no button on this screen is inert.
    onFinish(STEP_DESTINATION[stepId] ?? 'company-settings');
  };

  const firstOpenStep = SETUP_STEPS.find((s) => completed[s.id] !== true);

  return (
    <SetupHub
      completed={completed}
      onOpenStep={openStep}
      onStartSetup={() => { if (firstOpenStep) openStep(firstOpenStep.id); }}
      onFinishLater={() => onFinish()}
    />
  );
}
