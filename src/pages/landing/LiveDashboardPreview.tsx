/**
 * LiveDashboardPreview — the product mock in the landing page hero.
 *
 * It used to animate once on mount and then sit still, which undercut the
 * "Live Dashboard" label above it. Now a scripted event stream drives it: new
 * audit entries arrive on a timer, the risk counts move with them, and the
 * compliance score springs to its new value. The risk rows are clickable and
 * filter the feed, so a visitor can poke at it rather than just watch.
 *
 * The data is illustrative — this is a marketing mock, not a live connection.
 * Under `prefers-reduced-motion` the stream is disabled and a settled snapshot
 * is rendered instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'framer-motion';

type Severity = 'high' | 'medium' | 'low';
type Tone = Severity | 'ok';

interface StreamEvent {
  action: string;
  actor: string;
  tone: Tone;
  /** How this event nudges the compliance score. */
  delta: number;
}

interface FeedEntry extends StreamEvent {
  id: number;
  at: number;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  low: '#3BB75E',
  medium: '#F5B944',
  high: '#FF8E8E',
};

const TONE_COLOR: Record<Tone, string> = {
  ...SEVERITY_COLOR,
  ok: '#3BB75E',
};

/** Cycled in order — chosen to read like a real compliance day. */
const EVENT_SCRIPT: StreamEvent[] = [
  { action: 'NAFDAC submission approved', actor: 'Dr. Okonkwo', tone: 'ok', delta: 1 },
  { action: 'Superiority claim flagged', actor: 'AI Engine', tone: 'high', delta: -4 },
  { action: 'Batch BR-2291 released', actor: 'QA Lab', tone: 'ok', delta: 1 },
  { action: 'CAPA-118 opened', actor: 'Auto-CAPA', tone: 'medium', delta: -2 },
  { action: 'Risk assessment updated', actor: 'C. Ifeanyi', tone: 'low', delta: 1 },
  { action: 'Licence renewal due in 30d', actor: 'Watchdog', tone: 'medium', delta: -1 },
  { action: 'Control CTL-09 passed', actor: 'Automation', tone: 'ok', delta: 2 },
  { action: 'Fair-balance issue detected', actor: 'AI Engine', tone: 'high', delta: -3 },
  { action: 'SOP-042 acknowledged', actor: 'M. Bello', tone: 'ok', delta: 1 },
  { action: 'Evidence pack sealed', actor: 'D. Amadi', tone: 'ok', delta: 2 },
];

/**
 * Seeded so the card opens at its full height — otherwise it grows as the
 * first events land and shoves the hero around. Deliberately distinct from the
 * head of EVENT_SCRIPT so the first streamed entry never looks like a repeat.
 */
const SEED: FeedEntry[] = [
  { id: -1, at: Date.now() - 120_000, action: 'Policy POL-07 published', actor: 'A. Balogun', tone: 'ok', delta: 0 },
  { id: -2, at: Date.now() - 480_000, action: 'Vendor re-assessment due', actor: 'Watchdog', tone: 'medium', delta: 0 },
  { id: -3, at: Date.now() - 900_000, action: 'Audit session AS-14 closed', actor: 'Dr. Amadi', tone: 'ok', delta: 0 },
  { id: -4, at: Date.now() - 1_080_000, action: 'Risk RSK-32 downgraded', actor: 'C. Ifeanyi', tone: 'low', delta: 0 },
];

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FEED_LENGTH = 4;
const EVENT_INTERVAL_MS = 3400;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function relativeTime(from: number, now: number): string {
  const secs = Math.max(1, Math.round((now - from) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

export default function LiveDashboardPreview() {
  const reduceMotion = useReducedMotion();

  const [feed, setFeed] = useState<FeedEntry[]>(SEED);
  const [counts, setCounts] = useState<Record<Severity, number>>({ low: 2, medium: 5, high: 1 });
  const [score, setScore] = useState(94);
  const [filter, setFilter] = useState<Severity | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [syncedAt, setSyncedAt] = useState(() => Date.now());

  const cursor = useRef(0);
  const nextId = useRef(1);

  /* ── The stream ─────────────────────────────── */
  useEffect(() => {
    if (reduceMotion) return;

    const timer = setInterval(() => {
      const event = EVENT_SCRIPT[cursor.current % EVENT_SCRIPT.length];
      cursor.current += 1;

      setFeed((prev) => [{ ...event, id: nextId.current++, at: Date.now() }, ...prev].slice(0, FEED_LENGTH));
      setScore((prev) => clamp(prev + event.delta, 78, 99));
      setSyncedAt(Date.now());

      setCounts((prev) => {
        const next = { ...prev };
        if (event.tone === 'ok') {
          // A clean event resolves whichever bucket is currently worst.
          const worst = (['high', 'medium', 'low'] as Severity[]).find((s) => next[s] > 0);
          if (worst) next[worst] = Math.max(0, next[worst] - 1);
        } else {
          next[event.tone] = Math.min(9, next[event.tone] + 1);
        }
        return next;
      });
    }, EVENT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [reduceMotion]);

  /* ── Clock, so "2m ago" and the sync counter stay honest ── */
  useEffect(() => {
    if (reduceMotion) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [reduceMotion]);

  /* ── Score → gauge, both spring-driven ──────── */
  const scoreValue = useMotionValue(94);
  const scoreSpring = useSpring(scoreValue, { stiffness: 55, damping: 18, restDelta: 0.01 });
  const scoreLabel = useTransform(scoreSpring, (v) => Math.round(v));
  const dashOffset = useTransform(scoreSpring, (v) => CIRCUMFERENCE * (1 - v / 100));

  useEffect(() => {
    scoreValue.set(score);
  }, [score, scoreValue]);

  const visibleFeed = useMemo(
    () => (filter ? feed.filter((e) => e.tone === filter) : feed),
    [feed, filter]
  );

  const toggleFilter = useCallback((severity: Severity) => {
    setFilter((prev) => (prev === severity ? null : severity));
  }, []);

  const secondsSinceSync = Math.max(0, Math.round((now - syncedAt) / 1000));

  return (
    <div className="lp-preview rounded-2xl p-7 shadow-2xl shadow-black/40 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            {!reduceMotion && (
              <motion.span
                className="absolute inline-flex w-full h-full rounded-full"
                style={{ background: 'var(--lp-mint)' }}
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 2.1, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ background: 'var(--lp-mint)' }} />
          </span>
          <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--lp-t2)' }}>
            Live Dashboard
          </span>
        </div>
        <span className="text-xs lp-num" style={{ color: 'var(--lp-t4)' }}>
          Last sync: {reduceMotion ? '4s' : `${secondsSinceSync}s`} ago
        </span>
      </div>

      {/* Score gauge + risk distribution */}
      <div className="flex items-center gap-7 mb-7">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
            <motion.circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              style={{ strokeDashoffset: dashOffset }}
            />
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                {/* Figma Colors/Primary/300 — the ramp step that carries on a dark ground */}
                <stop offset="0%" stopColor="var(--primary-300)" />
                <stop offset="100%" stopColor="#3BB75E" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[1.75rem] font-bold lp-num tracking-[-0.03em]">
              <motion.span>{scoreLabel}</motion.span>
              <span className="text-sm font-semibold" style={{ color: 'var(--lp-t3)' }}>%</span>
            </span>
          </div>
        </div>

        <div className="space-y-1.5 flex-1">
          {(['low', 'medium', 'high'] as Severity[]).map((level) => {
            const active = filter === level;
            const count = counts[level];
            return (
              <button
                key={level}
                type="button"
                onClick={() => toggleFilter(level)}
                aria-pressed={active}
                className="lp-risk-row w-full flex items-center gap-2.5 text-[0.8125rem] rounded-lg px-2 py-1 -mx-2"
                data-active={active || undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SEVERITY_COLOR[level] }} />
                <span className="w-14 text-left capitalize" style={{ color: active ? 'var(--lp-t1)' : 'var(--lp-t3)' }}>
                  {level}
                </span>
                <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.07)' }}>
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: SEVERITY_COLOR[level], opacity: 0.75 }}
                    // A zero count must show no bar at all — a stub of colour
                    // next to a "0" reads as a rendering bug.
                    animate={{ width: count === 0 ? '0%' : `${clamp(count, 1, 9) * 10 + 10}%` }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </span>
                <span className="w-4 text-right lp-num" style={{ color: 'var(--lp-t2)' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Audit trail feed */}
      <div className="pt-5" style={{ borderTop: '1px solid var(--lp-line)' }}>
        <div className="flex items-center justify-between mb-3.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--lp-t4)' }}>
            Recent Audit Trail
          </p>
          <AnimatePresence>
            {filter && (
              <motion.button
                type="button"
                onClick={() => setFilter(null)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] hover:underline"
                style={{ color: 'var(--lp-accent)' }}
              >
                {filter} only · clear
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-3 min-h-[128px]">
          <AnimatePresence initial={false} mode="popLayout">
            {visibleFeed.map((entry) => (
              <motion.div
                key={entry.id}
                layout
                initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex items-start gap-2.5 text-[0.8125rem]"
              >
                <span
                  className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                  style={{ background: TONE_COLOR[entry.tone] }}
                />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold" style={{ color: TONE_COLOR[entry.tone] }}>
                    {entry.action}
                  </span>
                  <span style={{ color: 'var(--lp-t4)' }}> — {entry.actor}</span>
                </span>
                <span className="shrink-0 lp-num" style={{ color: 'var(--lp-t4)' }}>
                  {relativeTime(entry.at, now)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {visibleFeed.length === 0 && (
            <p className="text-[0.8125rem]" style={{ color: 'var(--lp-t4)' }}>
              No {filter} events in the last few minutes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
