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
import { appPath, appUrl } from '../../../lib/routing';
import {
  loadSetupState, completedFromState, markOnboardingComplete, loadCompanyDetails,
  loadSitesStep, loadAreas, loadSiteOptions,
  EMPTY_SETUP_STATE, type SetupState, type CompanyDetailsInput, type SitesStepState,
} from '../../../lib/onboarding/setupSteps';
import { INDUSTRIES } from '../../../lib/onboarding/onboardingData';
import { defaultAreasFor, modulesForAreas } from '../../../lib/onboarding/onboardingAreas';
import StepCompanyDetails from './StepCompanyDetails';
import StepIndustryRegion from './StepIndustryRegion';
import StepSites from './StepSites';
import StepModules from './StepModules';
import StepInviteTeam, { type SiteOption } from './StepInviteTeam';
import SetupHub, { SETUP_STEPS } from './SetupHub';
import BrandSplash from '../../BrandSplash';
import StepPanel from './StepPanel';

export interface SetupHubGateProps {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  /** The signed-in person, for ONB-05's "(you)" row. */
  me?: { email: string; fullName: string; jobTitle: string };
  /** Dismisses the hub and opens the workspace, optionally on a page. */
  onFinish: (navigateTo?: string) => void;
}

export default function SetupHubGate({ companyId, userId, me, onFinish }: SetupHubGateProps) {
  const [state, setState] = useState<SetupState>(EMPTY_SETUP_STATE);
  const [openStep, setOpenStep] = useState<string | null>(null);
  //  ONB-01 reads its own fields, several of which the hub has no use
  //  for. Loaded when the step opens rather than on every hub render.
  const [companyDetails, setCompanyDetails] = useState<Partial<CompanyDetailsInput> | null>(null);
  //  ONB-03 reads sites, department codes and the company's product
  //  categories — three queries the hub itself has no use for.
  const [sitesState, setSitesState] = useState<SitesStepState | null>(null);
  //  ONB-04 reads back which areas are ticked; null means "nothing
  //  stored", which is the industry's defaults rather than an empty set.
  const [areas, setAreas] = useState<string[] | null | undefined>(undefined);
  //  ONB-05 needs the sites from step 3 for its SITES column.
  const [siteOptions, setSiteOptions] = useState<SiteOption[] | null>(null);

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
      if (appPath() !== '/onboarding') {
        window.history.replaceState({}, '', appUrl('/onboarding'));
      }
    } catch { /* history is unavailable in some embedded views */ }
  }, []);

  const completed = completedFromState(state);
  const firstOpen = SETUP_STEPS.find((s) => completed[s.id] !== true);

  //  Each full-page step reads its own fields. Opening one means clearing
  //  what is held, fetching, and letting the step render once it is
  //  there — so the fields never fill in under the person's cursor.
  const openSites = useCallback(() => {
    setSitesState(null);
    setOpenStep('sites-departments');
    loadSitesStep(companyId)
      .then(setSitesState)
      .catch(() => setSitesState({
        sites: [], departments: [], productCategories: [], sitesUnavailable: false,
      }));
  }, [companyId]);

  const openModules = useCallback(() => {
    setAreas(undefined);
    setOpenStep('modules');
    loadAreas(companyId, userId).then(setAreas).catch(() => setAreas(null));
  }, [companyId, userId]);

  const openTeam = useCallback(() => {
    setSiteOptions(null);
    setAreas(undefined);
    setOpenStep('invite-team');
    //  Both: the SITES column comes from step 3, and the areas decide
    //  what an invited person can reach.
    loadSiteOptions(companyId).then(setSiteOptions).catch(() => setSiteOptions([]));
    loadAreas(companyId, userId).then(setAreas).catch(() => setAreas(null));
  }, [companyId, userId]);

  const openStepById = useCallback((id: string) => {
    if (id === 'sites-departments') { openSites(); return; }
    if (id === 'modules') { openModules(); return; }
    if (id === 'invite-team') { openTeam(); return; }
    if (id === 'company-details') {
      setCompanyDetails(null);
      loadCompanyDetails(companyId, userId).then(setCompanyDetails).catch(() => setCompanyDetails({}));
    }
    setOpenStep(id);
  }, [companyId, userId, openSites, openModules, openTeam]);

  //  ONB-04 and ONB-05 both need to know the industry: it decides which
  //  areas exist at all, and the areas decide what an invitee can reach.
  const industryId = INDUSTRIES.find((i) => i.value === state.industryType)?.id ?? 'pharma';

  //  THE FIRST TWO STEPS ARE FULL PAGES, not panels over the hub.
  //  ONB-01 and ONB-02 are designed as their own screens — their own
  //  title, their own step counter, their own footer — and squeezing
  //  them into the dialog the other steps use would be redrawing the
  //  design rather than building it.
  if (openStep === 'company-details' && companyId && userId) {
    //  Held until the current values are in hand, so the fields do not
    //  render empty and then fill in under the person's cursor.
    if (companyDetails === null) return <BrandSplash />;
    return (
      <StepCompanyDetails
        companyId={companyId}
        userId={userId}
        initial={companyDetails}
        onBack={() => setOpenStep(null)}
        onDone={() => { refresh(); setOpenStep('industry-region'); }}
      />
    );
  }

  if (openStep === 'industry-region' && userId) {
    const current = INDUSTRIES.find((i) => i.value === state.industryType)?.id;
    return (
      <StepIndustryRegion
        userId={userId}
        initialIndustryId={current}
        onBack={() => setOpenStep('company-details')}
        onDone={() => { refresh(); openSites(); }}
      />
    );
  }

  if (openStep === 'sites-departments' && companyId) {
    //  Held until the stored sites are in hand: the empty state opens a
    //  blank form, and opening one over a workspace that already has
    //  sites would invite a duplicate.
    if (sitesState === null) return <BrandSplash />;
    return (
      <StepSites
        companyId={companyId}
        initial={sitesState}
        onBack={() => setOpenStep('industry-region')}
        onDone={() => { refresh(); openModules(); }}
      />
    );
  }

  if (openStep === 'modules' && companyId && userId) {
    if (areas === undefined) return <BrandSplash />;
    return (
      <StepModules
        companyId={companyId}
        userId={userId}
        industryId={industryId}
        initialAreas={areas ?? defaultAreasFor(industryId)}
        onBack={openSites}
        onDone={() => { refresh(); openTeam(); }}
      />
    );
  }

  if (openStep === 'invite-team' && companyId && userId) {
    if (areas === undefined || siteOptions === null) return <BrandSplash />;
    const chosen = areas ?? defaultAreasFor(industryId);
    return (
      <StepInviteTeam
        companyId={companyId}
        userId={userId}
        me={me ?? { email: '', fullName: '', jobTitle: '' }}
        sites={siteOptions}
        moduleKeys={modulesForAreas(chosen)}
        onBack={openModules}
        onDone={() => { refresh(); setOpenStep(null); }}
      />
    );
  }

  return (
    <>
      <SetupHub
        completed={completed}
        onOpenStep={openStepById}
        onStartSetup={() => openStepById(firstOpen?.id ?? SETUP_STEPS[0].id)}
        onFinishLater={() => {
          //  Finishing here is finishing onboarding. Without this the
          //  older wizard would claim the next visit, since it is what
          //  used to set the flag.
          if (userId) void markOnboardingComplete(userId);
          onFinish();
        }}
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
