/**
 * The tile strip across the top of DB-01 (node 77:380) and DB-02.
 *
 * Seven tiles on the QA Manager's dashboard, six on the Storekeeper's,
 * and not one of them is the same metric. That is the clearest evidence
 * in the file that these are two screens rather than one screen with a
 * role label: a QA Manager counts QC PENDING and QA REVIEW, a
 * Storekeeper counts PUT-AWAY and READY TO ISSUE. Neither cares about
 * the other's number.
 *
 * A tile whose count has not arrived shows a dot rather than a zero.
 * Zero is a claim — "nothing is waiting for you" — and on a quality
 * system somebody acts on that claim by going home.
 */

import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface Tile {
  /** "MY TASKS". Drawn upper case and letter-spaced. */
  label: string;
  /** null while loading. */
  value: number | null;
  /** "5 due today", "material lots". */
  caption: string;
  icon: LucideIcon;
  /** Where clicking it goes, when it goes anywhere. */
  page?: string;
}

export interface DashTilesProps {
  tiles: Tile[];
  onOpen?: (page: string) => void;
}

export default function DashTiles({ tiles, onOpen }: DashTilesProps) {
  return (
    <div style={row}>
      {tiles.map((t) => {
        const Icon = t.icon;
        const clickable = !!t.page && !!onOpen;
        const inner = (
          <>
            <span style={head}>
              <Icon size={15} strokeWidth={1.75} />
              <span style={label}>{t.label}</span>
            </span>
            <span style={value}>{t.value === null ? '·' : t.value}</span>
            <span style={caption}>{t.caption}</span>
          </>
        );
        return clickable ? (
          <button key={t.label} type="button" style={{ ...tile, cursor: 'pointer', font: 'inherit' }}
            onClick={() => onOpen!(t.page!)}>
            {inner}
          </button>
        ) : (
          <div key={t.label} style={tile}>{inner}</div>
        );
      })}
    </div>
  );
}

const row: CSSProperties = {
  display: 'grid', gap: 10, minWidth: 0,
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
};
const tile: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '14px 16px', textAlign: 'left', minWidth: 0,
};
const head: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, color: '#5b6472', minWidth: 0,
};
const label: CSSProperties = {
  fontSize: 10.5, letterSpacing: '0.07em', fontWeight: 700,
  fontFamily: 'var(--nv-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const value: CSSProperties = { fontSize: 30, fontWeight: 600, lineHeight: '34px' };
const caption: CSSProperties = { fontSize: 12.5, color: '#5b6472', lineHeight: '17px' };
