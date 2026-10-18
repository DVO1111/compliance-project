/**
 * ONB-08 · Dashboard after setup.
 *
 * The screen the workspace opens on once the six setup steps are done,
 * and the one the person lands on every morning afterwards. Its logic —
 * what counts as having data, what each badge means, why a tile shows an
 * em-dash — is in src/lib/dashboard/firstRun.ts, where it can be tested
 * without a database. This file is the drawing.
 *
 * THE TILES NEVER INVENT A NUMBER. "Nothing is shown until there is real
 * data behind it" is written on the design, and it is the reason this
 * screen exists at all: the alternative — four zeros and a compliance
 * score on a workspace that opened an hour ago — is what the whole
 * onboarding flow was built to avoid arriving at.
 *
 * WHY THIS IS A LIGHT SCREEN. ONB-01 to ONB-07 are navy; this is cream.
 * That is the design's own decision, not a drift: setup is a sequence
 * you pass through once and the dashboard is a room you sit in, and the
 * palettes say which one you are in without a word. The light tokens
 * live beside the navy ones in src/styles/tokens.css.
 *
 * WHAT THIS FILE DOES NOT DRAW. The sidebar and the top bar, because
 * MainLayout already draws them and already draws what ONB-08 shows
 * there — the search field, the bell, the name over the upper-case role,
 * the initials avatar. Only the content column is here.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  loadWorkspaceOverview, greeting, glanceScope, tilesFrom, finishRowsFrom, nextStepFrom,
  NO_COUNTS, type WorkspaceOverview, type FinishBadge, type FinishRow, type Tile,
} from '../../lib/dashboard/firstRun';
import { logger } from '../../lib/logger';
import { STATUS_ICONS, iconProps } from '../../lib/design/icons';
import { Clock, CircleDashed, MapPin, ChevronDown } from 'lucide-react';
import {
  lightPage, lightCard, lightNextCard, lightPageTitle, lightCardTitle,
  lightBody, lightPrimaryButton, lightLinkButton, lightBadge, lightTwoColumns,
} from '../../lib/design/lightSurface';

export interface FirstRunDashboardProps {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  /** Opens the product registry — the next step's primary action. */
  onAddProduct: () => void;
  onImportSpreadsheet: () => void;
  /** Each "Finish setting up" row opens the page that finishes it. */
  onOpenRow: (key: FinishRow['key']) => void;
}

const LOADING: WorkspaceOverview = {
  ...NO_COUNTS, companyName: '', fullName: '', setupComplete: false, sites: [],
};

export default function FirstRunDashboard({
  companyId, userId, onAddProduct, onImportSpreadsheet, onOpenRow,
}: FirstRunDashboardProps) {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadWorkspaceOverview(companyId, userId)
      .then((o) => { if (live) setOverview(o); })
      //  An unreadable workspace still draws. Every count is already
      //  allowed to be null, and null is a screen that says "nothing
      //  here yet" — which is the honest thing to say when we could not
      //  find out.
      .catch((err) => {
        logger.warn('[dashboard] overview read failed', err);
        if (live) setOverview(LOADING);
      });
    return () => { live = false; };
  }, [companyId, userId]);

  //  The site picker defaults to the only site when there is one, and to
  //  "All sites" when there are several — picking one of several on the
  //  person's behalf would be a guess about where they work.
  useEffect(() => {
    if (overview && overview.sites.length === 1) setSiteId(overview.sites[0].id);
  }, [overview]);

  const o = overview ?? LOADING;
  const scope = useMemo(() => glanceScope(o.sites, siteId), [o.sites, siteId]);
  const tiles = useMemo(() => tilesFrom(o), [o]);
  const rows = useMemo(() => finishRowsFrom(o), [o]);
  const next = useMemo(() => nextStepFrom(o), [o]);

  //  "Ibadan Pharmaceuticals Ltd. · setup complete". The second half is
  //  only said when it is true; a workspace that opened the dashboard
  //  with "Finish later" has not completed setup and should not be told
  //  it has.
  const subtitle = [
    o.companyName,
    o.setupComplete ? 'setup complete' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={page}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={header}>
        <div style={{ minWidth: 0 }}>
          <h1 style={title}>{greeting(o.fullName)}</h1>
          {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        </div>

        {o.sites.length > 0 && (
          <label style={sitePicker}>
            <MapPin {...iconProps('sm')} size={15} aria-hidden="true"
              style={{ color: 'var(--nv-light-text-tertiary)' }} />
            <span style={{ color: 'var(--nv-light-text-tertiary)' }}>Site:</span>
            {o.sites.length === 1 ? (
              <span style={{ fontWeight: 600 }}>{o.sites[0].name}</span>
            ) : (
              <>
                <select
                  value={siteId ?? ''}
                  onChange={(e) => setSiteId(e.target.value || null)}
                  style={siteSelect}
                  aria-label="Site"
                >
                  <option value="">All sites</option>
                  {o.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {/*  The chevron the design draws. The native select's own
                    arrow is suppressed below, so this is the only one.  */}
                <ChevronDown {...iconProps('sm')} size={15} aria-hidden="true"
                  style={{ color: 'var(--nv-light-text-tertiary)' }} />
              </>
            )}
          </label>
        )}
      </header>

      {/* ── The next step ─────────────────────────────────────────── */}
      {next && (
        <section style={nextCard} aria-labelledby="onb08-next">
          <h2 id="onb08-next" style={cardTitle}>{next.title}</h2>
          <p style={bodyText}>{next.reason}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button type="button" onClick={onAddProduct} style={primaryButton}>
              {next.primaryLabel}
            </button>
            <button type="button" onClick={onImportSpreadsheet} style={linkButton}>
              {next.secondaryLabel}
            </button>
          </div>
        </section>
      )}

      {/*  TWO COLUMNS, as the design draws them: what is left to do
          beside what there is to see. They are a pair — the list is the
          reason the tiles are still empty — and stacking them put a
          screen's height between a cause and its effect.  */}
      <div style={twoColumns}>
        {/* ── Finish setting up ───────────────────────────────────── */}
        <section style={card} aria-labelledby="onb08-finish">
          <div>
            <h2 id="onb08-finish" style={cardTitle}>Finish setting up</h2>
            <p style={{ ...bodyText, marginTop: 6 }}>
              Optional, but each one makes the workspace more useful.
            </p>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row, i) => (
              <li key={row.key} style={{ ...finishRow, borderTop: i === 0 ? 'none' : finishRow.borderTop }}>
                <button type="button" onClick={() => onOpenRow(row.key)} style={rowButton}>
                  <span style={{ minWidth: 0 }}>
                    <span style={rowLabel}>{row.label}</span>
                    <span style={rowDetail}>{row.detail}</span>
                  </span>
                  <Badge badge={row.badge} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── At a glance ─────────────────────────────────────────── */}
        <section style={card} aria-labelledby="onb08-glance">
          <div>
            <h2 id="onb08-glance" style={cardTitle}>{scope.heading}</h2>
            <p style={{ ...bodyText, marginTop: 6 }}>
              Fills in as you work. Nothing is shown until there is real data behind it.
            </p>
            {scope.caveat && <p style={caveatText}>{scope.caveat}</p>}
          </div>

          <div style={tileGrid}>
            {tiles.map((t) => <TileBox key={t.key} tile={t} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * One tile. The em-dash is marked `aria-hidden` and the caption carries
 * the meaning, so a screen reader hears "Batches in progress, appears
 * after your first batch" rather than "Batches in progress, dash".
 */
function TileBox({ tile }: { tile: Tile }) {
  const empty = tile.value === null;
  return (
    <div style={tileBox}>
      <span style={tileLabel}>
        {/*  The small square the design puts before each label. Purely a
            bullet, so it is hidden from screen readers rather than
            announced as a shape with no meaning.  */}
        <span aria-hidden="true" style={tileBullet} />
        {tile.label}
      </span>
      {empty
        ? <span aria-hidden="true" style={{ ...tileValue, color: 'var(--nv-light-text-tertiary)' }}>—</span>
        : <span style={tileValue}>{tile.value}</span>}
      <span style={tileCaption}>{tile.caption}</span>
    </div>
  );
}

/**
 * Each badge is a fill, a text colour and a GLYPH — never colour alone.
 * Clock for waiting on somebody else, a dashed ring for not started, a
 * tick for done; Optional carries no glyph because it is not a state
 * anybody has to reach. The shapes are what keep the four readable in
 * greyscale and to a colour-blind reader, which is the rule the icon
 * toolkit states and the reason the words are there too.
 */
const BADGES: Record<FinishBadge, { style: CSSProperties; icon: typeof Clock | null }> = {
  Waiting: {
    style: { background: 'var(--nv-light-badge-waiting-bg)', color: 'var(--nv-light-badge-waiting-text)' },
    icon: STATUS_ICONS.pending.icon,
  },
  'To do': {
    style: { background: 'var(--nv-light-badge-todo-bg)', color: 'var(--nv-light-badge-todo-text)' },
    icon: CircleDashed,
  },
  Optional: {
    style: { background: 'var(--nv-light-badge-optional-bg)', color: 'var(--nv-light-badge-optional-text)' },
    icon: null,
  },
  Done: {
    style: { background: 'var(--nv-light-badge-done-bg)', color: 'var(--nv-light-badge-done-text)' },
    icon: STATUS_ICONS.released.icon,
  },
};

function Badge({ badge }: { badge: FinishBadge }) {
  const Glyph = BADGES[badge].icon;
  return (
    <span style={{ ...badgeBase, ...BADGES[badge].style }}>
      {Glyph && <Glyph {...iconProps('sm')} size={13} aria-hidden="true" />}
      {badge}
    </span>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

//  The cream sheet, the cards, the type scale and the buttons are
//  the shared light surface — see src/lib/design/lightSurface.ts for
//  why they are a module rather than a convention.
const page = lightPage;

const header: CSSProperties = {
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  gap: 16, flexWrap: 'wrap',
};

const title = lightPageTitle;

const subtitleStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 14, lineHeight: '20px',
  color: 'var(--nv-light-text-secondary)',
};

const sitePicker: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  height: 'var(--nv-control-height)', padding: '0 12px',
  borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-light-surface)',
  border: '1px solid var(--nv-light-border)',
  fontSize: 14, color: 'var(--nv-light-text-primary)',
  flexShrink: 0,
};

const siteSelect: CSSProperties = {
  border: 'none', background: 'transparent',
  font: 'inherit', fontWeight: 600, color: 'inherit',
  padding: 0, cursor: 'pointer',
  //  The native arrow is replaced by the chevron beside it, so the
  //  control does not carry two.
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
};

const twoColumns = lightTwoColumns;

const card = lightCard;

const nextCard = lightNextCard;

const cardTitle = lightCardTitle;

const bodyText = lightBody;

const caveatText: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-tertiary)',
  maxWidth: '62ch',
};

const primaryButton = lightPrimaryButton;

const linkButton = lightLinkButton;

const finishRow: CSSProperties = {
  borderTop: '1px solid var(--nv-light-border)',
};

const rowButton: CSSProperties = {
  width: '100%',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  gap: 16, padding: '14px 0',
  background: 'none', border: 'none', font: 'inherit',
  textAlign: 'left', cursor: 'pointer',
};

const rowLabel: CSSProperties = {
  display: 'block',
  fontSize: 14, fontWeight: 600, lineHeight: '20px',
  color: 'var(--nv-light-text-primary)',
};

const rowDetail: CSSProperties = {
  display: 'block', marginTop: 3,
  fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-secondary)',
};

const badgeBase = lightBadge;

const tileGrid: CSSProperties = {
  display: 'grid',
  //  Four across on a wide screen, two on a tablet, one on a phone,
  //  without a media query and without a track narrower than its label.
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
};

const tileBox: CSSProperties = {
  minWidth: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: 16,
  borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border)',
};

const tileLabel: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  fontFamily: 'var(--nv-font-mono)',
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const tileBullet: CSSProperties = {
  width: 9, height: 9, flexShrink: 0, borderRadius: 2,
  background: 'var(--nv-light-border-strong)',
};

const tileValue: CSSProperties = {
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 28, lineHeight: '32px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--nv-light-text-primary)',
};

const tileCaption: CSSProperties = {
  fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-secondary)',
};
