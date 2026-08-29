/**
 * Product mockups for the landing page.
 *
 * The design illustrates each capability with a rendering of the product
 * rather than a stock image or a screenshot. They are built as markup, not
 * pictures, so they stay sharp at any density, respond at narrow widths, and
 * can be corrected when the real screens change.
 *
 * The hero's batch record inverts the page onto paper; the four capability
 * mockups stay dark and take a tinted header in the colour of the section
 * they belong to.
 *
 * Everything shown is illustrative sample data for a fictional facility.
 */

import type { ReactNode } from 'react';

/* ── Shared chrome ──────────────────────────── */

/** Dark mockup shell with a tinted header strip. */
function Panel({
  tint, label, meta, children,
}: {
  /** Header tint, matching the section's accent. */
  tint: string;
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden w-full"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--lp-line-strong)' }}
    >
      <div
        className="flex items-center justify-between gap-4 px-5 py-3.5"
        style={{ background: tint, borderBottom: '1px solid var(--lp-line)' }}
      >
        <span className="lp-mono-up" style={{ color: 'var(--lp-t2)' }}>{label}</span>
        {meta && <span className="lp-mono-up" style={{ color: 'var(--lp-t4)' }}>{meta}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Small status pill used inside the mockups. */
function Pill({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'bad' | 'neutral' }) {
  const tones = {
    ok: { color: 'var(--lp-accent)', border: 'rgba(71,141,75,0.4)', background: 'rgba(71,141,75,0.12)' },
    bad: { color: 'var(--lp-coral)', border: 'rgba(198,47,30,0.45)', background: 'rgba(198,47,30,0.14)' },
    neutral: { color: 'var(--lp-t3)', border: 'var(--lp-line-strong)', background: 'transparent' },
  }[tone];
  return (
    <span
      className="lp-mono-up px-2 py-1 rounded-md whitespace-nowrap"
      style={{ color: tones.color, border: `1px solid ${tones.border}`, background: tones.background }}
    >
      {children}
    </span>
  );
}

/* ── Hero: the batch record ─────────────────────
   The one light surface on the page. It is the artefact the whole product
   exists to produce, so the design gives it the weight of a printed
   certificate rather than a screenshot of a screen. */

const TESTS = [
  { name: 'Identification — HPLC', value: 'CONFORMS' },
  { name: 'Dissolution, 45 min', value: '92.4%' },
  { name: 'Water content', value: '3.1%' },
];

export function BatchRecordCard() {
  /* The assay sits at 99.2% inside a 90.0–110.0% band. Positioned as a
     percentage of the band so the marker and the fill cannot drift apart. */
  const LSL = 90;
  const USL = 110;
  const assay = 99.2;
  const assayPct = ((assay - LSL) / (USL - LSL)) * 100;

  return (
    <div className="lp-paper p-6 w-full text-left">
      <p className="lp-mono text-right" style={{ color: 'var(--lp-paper-dim)' }}>BATCH-2026-0819</p>

      <h3
        className="mt-3 text-[1.25rem] md:text-[1.375rem] leading-snug"
        style={{ fontFamily: 'var(--lp-font-display)', fontWeight: 600, color: 'var(--lp-paper-ink)' }}
      >
        Ibadan Pharmaceuticals Ltd. — Amoxicillin 500&nbsp;mg, Batch 0819
      </h3>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span
          className="lp-mono-up px-2.5 py-1 rounded-md inline-flex items-center gap-1.5"
          style={{ background: '#DCF3E6', color: '#12A05A' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#12A05A' }} />
          Verified
        </span>
        <span className="lp-mono-up px-2.5 py-1 rounded-md" style={{ background: '#EFF3FC', color: '#3F6AC9' }}>
          12 records
        </span>
        <span className="lp-mono-up px-2.5 py-1 rounded-md" style={{ background: '#EFF3FC', color: '#3F6AC9' }}>
          Stage 4/4
        </span>
      </div>

      <p className="lp-mono-up mt-6" style={{ color: 'var(--lp-paper-dim)' }}>Test results</p>

      <div className="mt-1">
        {TESTS.map((t) => (
          <div key={t.name} className="lp-paper-row">
            <span className="text-[0.9375rem]" style={{ color: 'var(--lp-paper-ink)' }}>{t.name}</span>
            <span className="lp-mono" style={{ color: 'var(--lp-paper-dim)' }}>{t.value}</span>
          </div>
        ))}

        <div className="lp-paper-row" style={{ display: 'block' }}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[0.9375rem]" style={{ color: 'var(--lp-paper-ink)' }}>
              Assay — content of amoxicillin
            </span>
            <span className="lp-mono" style={{ color: '#12A05A' }}>{assay}%</span>
          </div>

          {/* Spec-limit band. The value sits inside it, which is the point:
              a number alone does not show you it passed. */}
          <div className="relative mt-3 h-6" aria-hidden="true">
            <div
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
              style={{ background: 'var(--lp-paper-line)' }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full"
              style={{ left: '18%', right: '18%', background: '#DCF3E6' }}
            />
            <span className="absolute top-1/2 -translate-y-1/2 w-px h-3" style={{ left: '18%', background: 'var(--lp-paper-dim)' }} />
            <span className="absolute top-1/2 -translate-y-1/2 w-px h-3" style={{ right: '18%', background: 'var(--lp-paper-dim)' }} />
            <span
              className="absolute top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full"
              style={{ left: `calc(18% + ${assayPct}% * 0.64)`, background: '#12A05A' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="lp-mono-up" style={{ color: 'var(--lp-paper-dim)' }}>90.0% LSL</span>
            <span className="lp-mono-up" style={{ color: 'var(--lp-paper-dim)' }}>Spec limit band</span>
            <span className="lp-mono-up" style={{ color: 'var(--lp-paper-dim)' }}>USL 110.0%</span>
          </div>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 mt-5 pt-4"
        style={{ borderTop: '1px solid var(--lp-paper-line)' }}
      >
        <span className="lp-mono-up" style={{ color: 'var(--lp-paper-dim)' }}>Issued by A. Okonkwo, QA Manager</span>
        <span className="lp-mono-up" style={{ color: 'var(--lp-paper-dim)' }}>19 Aug 2026 · 14:07</span>
      </div>
    </div>
  );
}

/* ── Manufacturing: in-process check ─────────── */

const CHECKS = [
  { name: 'Compression weight, mg', spec: '595–605', value: '599', pass: true },
  { name: 'Hardness, kP', spec: 'NLT 6.0', value: '7.2', pass: true },
  { name: 'Friability', spec: 'NMT 1.0%', value: '1.34%', pass: false },
];

export function InProcessCheck() {
  return (
    <Panel tint="rgba(71,141,75,0.15)" label="In-process check · Line 3" meta="Batch 0819">
      <div className="space-y-px">
        {CHECKS.map((c, i) => (
          <div
            key={c.name}
            className="flex items-center justify-between gap-3 py-3"
            style={i > 0 ? { borderTop: '1px solid var(--lp-line)' } : undefined}
          >
            <span className="text-[0.9375rem]" style={{ color: 'var(--lp-t1)' }}>{c.name}</span>
            <span className="flex items-center gap-3 shrink-0">
              <span className="lp-mono" style={{ color: 'var(--lp-t4)' }}>{c.spec}</span>
              <span className="lp-mono" style={{ color: c.pass ? 'var(--lp-t1)' : 'var(--lp-coral)' }}>{c.value}</span>
              <Pill tone={c.pass ? 'ok' : 'bad'}>{c.pass ? 'Pass' : 'Out of spec'}</Pill>
            </span>
          </div>
        ))}
      </div>

      {/* The out-of-spec result gates the step — the mockup shows the block,
          not just the reading. */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--lp-line)' }}>
        <span
          className="px-4 py-2 rounded-lg text-[0.875rem] font-semibold"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--lp-t4)', border: '1px solid var(--lp-line)' }}
        >
          Close step
        </span>
        <span className="lp-mono-up" style={{ color: 'var(--lp-t3)' }}>
          Held — QA supervisor sign-off required
        </span>
      </div>
    </Panel>
  );
}

/* ── Quality events: the lifecycle ───────────── */

const LIFECYCLE = [
  { title: 'Deviation raised', detail: 'DEV-0142 · friability out of spec', done: false },
  { title: 'Investigation opened', detail: '5-Why · punch wear, station 4', done: false },
  { title: 'CAPA assigned', detail: 'Tooling replacement · owner O. Bello', done: true },
  { title: 'Effectiveness verified', detail: 'Follow-up audit auto-scheduled, 90 days', done: true },
];

export function QualityLifecycle() {
  return (
    <Panel tint="rgba(63,106,201,0.16)" label="Quality event lifecycle" meta="Role gated">
      <div className="space-y-4">
        {LIFECYCLE.map((s) => (
          <div key={s.title} className="flex items-start gap-3">
            <span
              className="w-2 h-2 rounded-sm mt-1.5 shrink-0"
              style={{ background: s.done ? 'var(--lp-accent)' : 'var(--lp-tango)' }}
            />
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold" style={{ color: 'var(--lp-t1)' }}>{s.title}</span>
              <span className="block lp-mono mt-0.5" style={{ color: 'var(--lp-t4)' }}>{s.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Regulatory affairs: the CTD dossier ─────── */

const MODULES = [
  { n: 'Module 1', name: 'Administrative & product information', state: 'Complete' },
  { n: 'Module 2', name: 'Common technical document summaries', state: 'Complete' },
  { n: 'Module 3', name: 'Quality — S & P sections', state: 'In review' },
  { n: 'Module 4', name: 'Non-clinical study reports', state: 'Not required' },
  { n: 'Module 5', name: 'Clinical study reports', state: 'Not required' },
];

export function CtdDossier() {
  return (
    <Panel tint="rgba(71,141,75,0.15)" label="CTD dossier · renewal" meta="NAFDAC">
      <div>
        {MODULES.map((m, i) => (
          <div
            key={m.n}
            className="flex items-center gap-4 py-2.5"
            style={i > 0 ? { borderTop: '1px solid var(--lp-line)' } : undefined}
          >
            <span className="lp-mono w-[72px] shrink-0" style={{ color: 'var(--lp-t4)' }}>{m.n}</span>
            <span className="text-[0.9375rem] flex-1 min-w-0" style={{ color: 'var(--lp-t1)' }}>{m.name}</span>
            <span
              className="lp-mono-up shrink-0"
              style={{ color: m.state === 'In review' ? 'var(--lp-gold)' : 'var(--lp-t4)' }}
            >
              {m.state}
            </span>
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4"
        style={{ borderTop: '1px solid var(--lp-line)' }}
      >
        <span className="lp-mono-up" style={{ color: 'var(--lp-accent)' }}>NAPAMS clock paused · day 41 of 90</span>
        <span className="lp-mono-up" style={{ color: 'var(--lp-t4)' }}>Renewal in 11 months</span>
      </div>
    </Panel>
  );
}

/* ── Audit & recall: forward trace ───────────── */

const TRACE = [
  { batch: 'BATCH-2026-0819', detail: '12,400 units · 3 distributors', flagged: false },
  { batch: 'BATCH-2026-0822', detail: '9,750 units · 2 distributors', flagged: false },
  { batch: 'BATCH-2026-0831', detail: '14,100 units · 5 distributors', flagged: true },
];

export function RecallTrace() {
  return (
    <Panel tint="rgba(63,106,201,0.16)" label="Trace forward · RM-LOT-4471" meta="Mock recall">
      <p className="lp-mono-up mb-3" style={{ color: 'var(--lp-t4)' }}>Raw material lot → finished batches</p>

      <div>
        {TRACE.map((t, i) => (
          <div
            key={t.batch}
            className="flex items-center justify-between gap-4 py-2.5"
            style={i > 0 ? { borderTop: '1px solid var(--lp-line)' } : undefined}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: t.flagged ? 'var(--lp-tango)' : 'var(--lp-accent)' }}
              />
              <span className="lp-mono truncate" style={{ color: 'var(--lp-t1)' }}>{t.batch}</span>
            </span>
            <span className="lp-mono shrink-0" style={{ color: 'var(--lp-t4)' }}>{t.detail}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--lp-line)' }}>
        <span
          className="px-4 py-2 rounded-lg text-[0.875rem] font-semibold"
          style={{ background: 'rgba(71,141,75,0.12)', color: 'var(--lp-accent)', border: '1px solid var(--lp-accent-line)' }}
        >
          Export recall dossier
        </span>
        <span className="lp-mono-up" style={{ color: 'var(--lp-t4)' }}>Compiled in 47s</span>
      </div>
    </Panel>
  );
}
