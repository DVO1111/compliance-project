/**
 * Product mockups for the landing page.
 *
 * Ported from the landing-page design source, value for value. They are
 * markup rather than images, so they stay sharp at any density, reflow at
 * narrow widths, and can be corrected when the real screens change.
 *
 * The hero's batch record is the one light surface on the page — the artefact
 * the product exists to produce, given the weight of a printed certificate.
 * It also plays its assembly once on load: the rules draw, the results drop
 * in, and the two live chips settle from their in-progress state to their
 * final one. That is the product's own behaviour, not decoration.
 *
 * Everything shown is illustrative sample data for a fictional facility.
 */

import type { CSSProperties, ReactNode } from 'react';
import { LOGO_LIGHT } from './shell';

const mono = (size: number, tracking = 0.12): CSSProperties => ({
  fontFamily: 'var(--lp-font-mono)',
  fontSize: size,
  letterSpacing: `${tracking}em`,
});

/* ── Shared panel chrome ──────────────────────────
   Each capability mockup is a bordered panel with a tinted header, in the
   colour of the section it belongs to: green for the floor and the
   regulator, blue for quality and traceability. */
function Panel({
  tone, label, meta, children,
}: {
  tone: 'green' | 'blue';
  label: string;
  meta: string;
  children: ReactNode;
}) {
  const t = tone === 'green'
    ? { border: 'rgba(71,141,75,0.28)', bg: 'rgba(71,141,75,0.07)', head: 'rgba(71,141,75,0.15)', headLine: 'rgba(71,141,75,0.22)', ink: 'var(--lp-green-glow)' }
    : { border: 'rgba(63,106,201,0.26)', bg: 'rgba(63,106,201,0.07)', head: 'rgba(63,106,201,0.14)', headLine: 'rgba(63,106,201,0.2)', ink: 'var(--lp-periwinkle)' };

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.bg, overflow: 'hidden' }}>
      <div
        className="flex justify-between"
        style={{
          gap: 16, padding: '14px 22px', background: t.head,
          borderBottom: `1px solid ${t.headLine}`, color: t.ink,
          textTransform: 'uppercase', ...mono(10.5, 0.13),
        }}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="whitespace-nowrap">{meta}</span>
      </div>
      {children}
    </div>
  );
}

/** Row divider inside a panel, in the panel's own tint. */
const rowLine = (tone: 'green' | 'blue') =>
  `1px solid ${tone === 'green' ? 'rgba(71,141,75,0.16)' : 'rgba(63,106,201,0.16)'}`;

/* ════════════════════════════════════════════════
   HERO — the batch record
   ════════════════════════════════════════════════ */

const TESTS = [
  { name: 'Identification — HPLC', value: 'CONFORMS', delay: '0.15s' },
  { name: 'Dissolution, 45 min', value: '92.4%', delay: '0.3s' },
  { name: 'Water content', value: '3.1%', delay: '0.45s' },
];

const chipBase: CSSProperties = {
  ...mono(10.5, 0.13),
  textTransform: 'uppercase',
  padding: '6px 11px',
  borderRadius: 6,
  whiteSpace: 'nowrap',
};

export function BatchRecordCard() {
  return (
    <div
      style={{
        background: 'var(--lp-paper)', color: 'var(--lp-ink)',
        padding: '26px 26px 24px', borderRadius: 16,
        boxShadow: '0 24px 60px -28px rgba(0,0,0,0.7)',
        textAlign: 'left',
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 16 }}>
        <img src={LOGO_LIGHT} alt="Criateur" style={{ height: 34, width: 'auto', display: 'block', flexShrink: 0 }} />
        <span style={{ ...mono(11, 0.12), color: 'var(--lp-slate)' }}>BATCH-2026-0819</span>
      </div>

      <div
        style={{
          height: 1, background: 'var(--lp-stone)', margin: '14px 0 16px',
          transformOrigin: 'left', animation: 'ruleDraw 0.5s ease-out both',
        }}
      />

      <div style={{ fontFamily: 'var(--lp-font-display)', fontSize: 23, fontWeight: 500, lineHeight: 1.2, marginBottom: 16 }}>
        Ibadan Pharmaceuticals Ltd. — Amoxicillin 500&nbsp;mg, Batch 0819
      </div>

      {/* Two of these chips are live: the batch closes while you watch. */}
      <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 22 }}>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span
            data-mid="1"
            style={{ ...chipBase, display: 'inline-block', background: 'var(--lp-amber-tint)', color: 'var(--lp-ink)', animation: 'chipMidOut 2.6s ease-out both' }}
          >
            2 stages open
          </span>
          <span
            data-final="1"
            style={{ ...chipBase, position: 'absolute', inset: 0, display: 'inline-flex', alignItems: 'center', background: '#DCF3E6', color: 'var(--lp-green-deep)', animation: 'chipFinalIn 2.6s ease-out both' }}
          >
            <span style={{ width: 6, height: 6, background: 'var(--lp-verified)', marginRight: 7, display: 'inline-block' }} />
            Verified
          </span>
        </span>

        <span style={{ ...chipBase, background: 'var(--lp-blue-tint)', color: 'var(--lp-ink)' }}>12 records</span>

        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span
            data-mid="1"
            style={{ ...chipBase, display: 'inline-block', background: 'var(--lp-blue-tint)', color: 'var(--lp-ink)', animation: 'stageTick 2.6s ease-out both' }}
          >
            Stage 3/4
          </span>
          <span
            data-final="1"
            style={{ ...chipBase, position: 'absolute', inset: 0, display: 'inline-flex', alignItems: 'center', background: 'var(--lp-blue-tint)', color: 'var(--lp-ink)', animation: 'stageDone 2.6s ease-out both' }}
          >
            Stage 4/4
          </span>
        </span>
      </div>

      <div style={{ ...mono(10, 0.14), textTransform: 'uppercase', color: 'var(--lp-slate)', marginBottom: 9 }}>
        Test results
      </div>

      <div
        className="flex flex-col"
        style={{ gap: 1, background: 'var(--lp-stone)', borderTop: '1px solid var(--lp-stone)', borderBottom: '1px solid var(--lp-stone)' }}
      >
        {TESTS.map((t) => (
          <div
            key={t.name}
            style={{
              background: 'var(--lp-paper)', padding: '10px 2px',
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'baseline',
              animation: `recIn 0.4s ease-out ${t.delay} both`,
            }}
          >
            <span style={{ fontSize: 14 }}>{t.name}</span>
            <span style={{ ...mono(11.5, 0), color: 'var(--lp-green-deep)' }}>{t.value}</span>
          </div>
        ))}

        <div style={{ background: 'var(--lp-paper)', padding: '12px 2px 13px', animation: 'recIn 0.4s ease-out 0.6s both' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'baseline', marginBottom: 9 }}>
            <span style={{ fontSize: 14 }}>Assay — content of amoxicillin</span>
            <span style={{ ...mono(11.5, 0), color: 'var(--lp-verified)' }}>99.2%</span>
          </div>

          {/* The spec-limit band: the value sits inside it, which is the
              point — a number alone does not show you that it passed. */}
          <div style={{ position: 'relative', height: 20 }} aria-hidden="true">
            <div style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 2, background: 'var(--lp-stone)' }} />
            <div
              style={{
                position: 'absolute', left: '22%', width: '56%', top: 6, height: 8,
                background: '#DCF3E6',
                borderLeft: '1px solid var(--lp-green)', borderRight: '1px solid var(--lp-green)',
                transformOrigin: 'left',
                animation: 'ruleDraw 0.6s cubic-bezier(0.2,0.9,0.2,1) 0.5s both',
              }}
            />
            <div style={{ position: 'absolute', left: '64%', top: 2, width: 2, height: 16, background: 'var(--lp-verified)' }} />
          </div>

          <div className="flex justify-between" style={{ ...mono(10, 0.1), color: 'var(--lp-slate)', marginTop: 5 }}>
            <span>90.0% LSL</span>
            <span>SPEC LIMIT BAND</span>
            <span>USL 110.0%</span>
          </div>
        </div>
      </div>

      <div
        className="flex justify-between items-center"
        style={{ marginTop: 16, ...mono(10, 0.12), textTransform: 'uppercase', color: 'var(--lp-slate)' }}
      >
        <span>Issued by A. Okonkwo, QA Manager</span>
        <span>19 Aug 2026 · 14:07</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   MANUFACTURING — in-process check
   ════════════════════════════════════════════════ */

const CHECKS = [
  { name: 'Compression weight, mg', spec: '595–605', value: '599', pass: true },
  { name: 'Hardness, kP', spec: 'NLT 6.0', value: '7.2', pass: true },
  { name: 'Friability', spec: 'NMT 1.0%', value: '1.34%', pass: false },
];

export function InProcessCheck() {
  return (
    <Panel tone="green" label="In-process check · Line 3" meta="Batch 0819">
      {CHECKS.map((c) => (
        <div
          key={c.name}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) max-content max-content max-content',
            gap: '8px 14px', justifyItems: 'end', padding: '13px 22px',
            borderBottom: rowLine('green'), alignItems: 'baseline', fontSize: 14,
          }}
        >
          <span style={{ justifySelf: 'start' }}>{c.name}</span>
          <span style={{ ...mono(12, 0), color: 'var(--lp-dim)' }}>{c.spec}</span>
          <span style={{ ...mono(12, 0), color: c.pass ? undefined : 'var(--lp-hold-lite)' }}>{c.value}</span>
          <span
            style={{
              ...mono(10, 0.12), padding: '4px 8px', borderRadius: 6,
              whiteSpace: 'nowrap', textAlign: 'center',
              background: c.pass ? 'rgba(18,160,90,0.18)' : 'rgba(198,47,30,0.2)',
              border: c.pass ? '1px solid rgba(18,160,90,0.4)' : '1px solid rgba(255,140,122,0.45)',
              color: c.pass ? '#7DE0A8' : 'var(--lp-hold-lite)',
            }}
          >
            {c.pass ? 'PASS' : 'OUT OF SPEC'}
          </span>
        </div>
      ))}

      {/* The out-of-spec result gates the step — the mockup shows the block,
          not just the reading. */}
      <div className="flex flex-wrap items-center" style={{ gap: 14, padding: '18px 22px 22px' }}>
        <span
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid var(--lp-line-soft)',
            color: 'var(--lp-dim)', padding: '11px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8,
          }}
        >
          Close step
        </span>
        <span style={{ ...mono(11, 0.1), textTransform: 'uppercase', color: 'var(--lp-hold-lite)' }}>
          Held — QA supervisor sign-off required
        </span>
      </div>
    </Panel>
  );
}

/* ════════════════════════════════════════════════
   QUALITY EVENTS — the lifecycle
   ════════════════════════════════════════════════ */

const LIFECYCLE = [
  { title: 'Deviation raised', detail: 'DEV-0142 · friability out of spec', done: false },
  { title: 'Investigation opened', detail: '5-Why · punch wear, station 4', done: false },
  { title: 'CAPA assigned', detail: 'Tooling replacement · owner O. Bello', done: true },
  { title: 'Effectiveness verified', detail: 'Follow-up audit auto-scheduled, 90 days', done: true },
];

export function QualityLifecycle() {
  return (
    <Panel tone="blue" label="Quality event lifecycle" meta="Role gated">
      <div style={{ padding: '6px 22px 20px' }}>
        {LIFECYCLE.map((s, i) => (
          <div key={s.title} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16 }}>
            <div className="flex flex-col items-center" style={{ paddingTop: 16 }}>
              <span
                style={{
                  width: 9, height: 9, borderRadius: 2, flexShrink: 0,
                  background: s.done ? 'var(--lp-verified)' : 'var(--lp-attention)',
                }}
              />
              {/* No connector below the last step. */}
              {i < LIFECYCLE.length - 1 && (
                <span style={{ width: 1, flex: 1, minHeight: 34, background: 'rgba(63,106,201,0.3)' }} />
              )}
            </div>
            <div style={{ padding: i < LIFECYCLE.length - 1 ? '12px 0 0' : '12px 0 2px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
              <div style={{ ...mono(11.5, 0.04), color: 'var(--lp-dim)' }}>{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ════════════════════════════════════════════════
   REGULATORY AFFAIRS — the CTD dossier
   ════════════════════════════════════════════════ */

const MODULES = [
  { n: 'Module 1', name: 'Administrative & product information', state: 'Complete' },
  { n: 'Module 2', name: 'Common technical document summaries', state: 'Complete' },
  { n: 'Module 3', name: 'Quality — S & P sections', state: 'In review' },
  { n: 'Module 4', name: 'Non-clinical study reports', state: 'Not required' },
  { n: 'Module 5', name: 'Clinical study reports', state: 'Not required' },
];

const MODULE_STATE_COLOR: Record<string, string> = {
  Complete: '#7DE0A8',
  'In review': 'var(--lp-attention)',
  'Not required': 'rgba(207,222,255,0.4)',
};

export function CtdDossier() {
  return (
    <Panel tone="green" label="CTD dossier · renewal" meta="NAFDAC">
      {MODULES.map((m) => (
        <div
          key={m.n}
          style={{
            display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) auto', gap: 14,
            padding: '13px 22px', borderBottom: rowLine('green'), alignItems: 'baseline', fontSize: 14,
          }}
        >
          <span style={{ ...mono(11.5, 0), color: 'var(--lp-dim)' }}>{m.n}</span>
          <span>{m.name}</span>
          <span
            style={{
              ...mono(10, 0.12), textTransform: 'uppercase', whiteSpace: 'nowrap',
              color: MODULE_STATE_COLOR[m.state],
            }}
          >
            {m.state}
          </span>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12, padding: '17px 22px 20px' }}>
        <span style={{ ...mono(11, 0.1), textTransform: 'uppercase', color: 'var(--lp-attention)' }}>
          NAPAMS clock paused · day 41 of 90
        </span>
        <span style={{ ...mono(11, 0.1), textTransform: 'uppercase', color: 'var(--lp-dim)' }}>
          Renewal in 11 months
        </span>
      </div>
    </Panel>
  );
}

/* ════════════════════════════════════════════════
   AUDIT & RECALL — forward trace
   ════════════════════════════════════════════════ */

const TRACE = [
  { batch: 'BATCH-2026-0819', detail: '12,400 units · 3 distributors', flagged: false },
  { batch: 'BATCH-2026-0822', detail: '9,750 units · 2 distributors', flagged: false },
  { batch: 'BATCH-2026-0831', detail: '14,100 units · 5 distributors', flagged: true },
];

export function RecallTrace() {
  return (
    <Panel tone="blue" label="Trace forward · RM-LOT-4471" meta="Mock recall">
      <div style={{ padding: '18px 22px 4px', ...mono(11, 0.12), textTransform: 'uppercase', color: 'var(--lp-dim)' }}>
        Raw material lot → finished batches
      </div>

      {TRACE.map((t) => (
        <div
          key={t.batch}
          style={{
            display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 14,
            padding: '13px 22px', borderBottom: rowLine('blue'), alignItems: 'center', fontSize: 14,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: 1, flexShrink: 0,
              background: t.flagged ? 'var(--lp-attention)' : '#7DE0A8',
            }}
          />
          <span style={{ ...mono(12.5, 0), minWidth: 0 }}>{t.batch}</span>
          <span style={{ fontSize: 13, color: 'var(--lp-dim)', whiteSpace: 'nowrap' }}>{t.detail}</span>
        </div>
      ))}

      <div className="flex flex-wrap items-center" style={{ gap: 14, padding: '18px 22px 22px' }}>
        <span
          style={{
            background: 'rgba(71,141,75,0.16)', border: '1px solid var(--lp-green)',
            color: 'var(--lp-green-glow)', padding: '11px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8,
          }}
        >
          Export recall dossier
        </span>
        <span style={{ ...mono(11, 0.1), textTransform: 'uppercase', color: 'var(--lp-dim)' }}>
          Compiled in 47s
        </span>
      </div>
    </Panel>
  );
}
