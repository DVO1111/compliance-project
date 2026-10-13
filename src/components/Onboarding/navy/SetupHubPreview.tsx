/**
 * A viewer for the v2 onboarding hub, served at /onboarding.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT THE REAL ROUTE. ONB-00 is a hub over
 * six step screens, and four of those steps need schema the database does
 * not have yet — `companies` holds only id, name and created_at, and
 * there is no `sites` table at all. Wiring the hub in as the live gate
 * would therefore trap a real user: `canOpenWorkspace` requires steps 1–4,
 * and steps 1–4 lead nowhere to be finished. So the live flow keeps
 * CompanySetupChecklist, and this route exists to SHOW the new screen.
 *
 * It holds no session, reads no table and writes nothing. Every control
 * below moves local state only, which is also what makes it useful for a
 * walkthrough: the three row states and the progress bar can be reached
 * on demand instead of described.
 *
 * Mobile is shown in a real 390 px frame rather than by narrowing the
 * window, because the differences between ONB-00 and ONB-M00 are what
 * `compact` encodes — a shorter subtitle, meta without durations, "After
 * step n", a stacked footer, and no reassurance line.
 */

import { useState } from 'react';
import SetupHub, { SETUP_STEPS, canOpenWorkspace, stepStates } from './SetupHub';

type Device = 'desktop' | 'mobile';

/*  The two controls are also readable from the URL, so a particular state
    can be linked to rather than clicked to during a walkthrough:

      /onboarding?device=mobile
      /onboarding?done=1,2,3      → first three Done, fourth Current

    Anything unparseable is ignored and the defaults stand; this is a
    viewer, and a malformed link should still show the screen. */
function initialDevice(): Device {
  try {
    return new URLSearchParams(window.location.search).get('device') === 'mobile'
      ? 'mobile' : 'desktop';
  } catch { return 'desktop'; }
}

function initialCompleted(): Record<string, boolean> {
  try {
    const raw = new URLSearchParams(window.location.search).get('done');
    if (!raw) return {};
    const out: Record<string, boolean> = {};
    for (const part of raw.split(',')) {
      const n = Number(part.trim());
      const step = SETUP_STEPS[n - 1];
      if (step) out[step.id] = true;
    }
    return out;
  } catch { return {}; }
}

export default function SetupHubPreview() {
  const [device, setDevice] = useState<Device>(initialDevice);
  const [completed, setCompleted] = useState<Record<string, boolean>>(initialCompleted);

  const steps = SETUP_STEPS.map((s) => ({ ...s, done: completed[s.id] === true }));
  const states = stepStates(steps);
  const open = canOpenWorkspace(steps);

  const toggle = (id: string) =>
    setCompleted((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div style={{ minHeight: '100vh', background: '#0b1326', fontFamily: 'var(--nv-font-body)' }}>
      {/* ── The control strip. Deliberately plain: it is scaffolding for
             the demo and must not be mistaken for part of the design. ── */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--nv-border-default)',
          background: 'var(--nv-surface-raised)',
          color: 'var(--nv-text-secondary)',
          fontSize: 12, lineHeight: '18px',
        }}
      >
        <strong style={{ color: 'var(--nv-text-primary)', fontWeight: 600 }}>
          ONB-00 · Set up your workspace
        </strong>

        <span style={{ fontFamily: 'var(--nv-font-mono)' }}>
          PREVIEW · NOT THE LIVE ONBOARDING ROUTE
        </span>

        <span style={{ display: 'inline-flex', gap: 6 }}>
          {(['desktop', 'mobile'] as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              style={{
                height: 28, padding: '0 10px', borderRadius: 6,
                cursor: 'pointer',
                background: device === d ? 'var(--nv-action-primary-bg)' : 'transparent',
                color: device === d ? 'var(--nv-action-primary-text)' : 'var(--nv-text-secondary)',
                border: '1px solid var(--nv-border-strong)',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              }}
            >
              {d === 'desktop' ? 'Desktop' : 'Mobile 390'}
            </button>
          ))}
        </span>

        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--nv-font-mono)' }}>MARK DONE:</span>
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              title={`${s.title} — ${states[i]}`}
              style={{
                height: 28, width: 28, borderRadius: 6, cursor: 'pointer',
                background: s.done ? 'var(--nv-action-primary-bg)' : 'transparent',
                color: s.done ? 'var(--nv-action-primary-text)' : 'var(--nv-text-secondary)',
                border: s.required
                  ? '1px solid var(--nv-border-strong)'
                  : '1px dashed var(--nv-border-strong)',
                fontFamily: 'var(--nv-font-mono)', fontSize: 12, fontWeight: 500,
              }}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCompleted({})}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: 'var(--nv-text-secondary)',
              border: '1px solid var(--nv-border-strong)',
              fontFamily: 'inherit', fontSize: 12,
            }}
          >
            Reset
          </button>
        </span>

        {/*  The gate itself, read out loud: the workspace opens at four of
             six, and the solid-bordered numbers above are those four.  */}
        <span style={{ fontFamily: 'var(--nv-font-mono)' }}>
          WORKSPACE:{' '}
          <span style={{ color: open ? 'var(--nv-state-compliant-text)' : 'var(--nv-text-tertiary)' }}>
            {open ? 'OPEN (steps 1–4 done)' : 'CLOSED until steps 1–4 are done'}
          </span>
        </span>
      </div>

      {device === 'desktop' ? (
        <SetupHub completed={completed} />
      ) : (
        <div style={{ display: 'grid', placeItems: 'start center', padding: '32px 16px' }}>
          {/*  A 390 px frame, so the mobile screen is seen at its own
               width instead of at whatever the window happens to be.  */}
          <div
            style={{
              width: 390, maxWidth: '100%',
              borderRadius: 24, overflow: 'hidden',
              border: '1px solid var(--nv-border-strong)',
            }}
          >
            <SetupHub completed={completed} compact />
          </div>
        </div>
      )}
    </div>
  );
}
