/**
 * The banner a page shows when its tables are not in the database yet.
 *
 * WHY THIS EXISTS RATHER THAN AN EMPTY LIST. Several sections built
 * from the design file are on their way into production ahead of the
 * migrations that back them — deliberately, so the screens can be
 * looked at and reviewed while the data layer catches up. A page in
 * that state has two honest options and one dishonest one.
 *
 * The dishonest one is an empty list. "No deviations" and "the
 * deviations table does not exist here" look identical, and on a
 * compliance system the first is a claim about the business: it says
 * nothing has gone wrong. Somebody could screenshot it for an
 * inspector.
 *
 * So a page that cannot read its data says so, in the place the data
 * would have been, and names what is missing. The screen around it
 * still renders — that is the point of shipping it early — but nothing
 * on it pretends to be a record.
 */

import { Database } from 'lucide-react';

export interface SectionNotReadyProps {
  /** What this section is, in the user's words: "Deviations",
   *  "Material release". Not a table name. */
  section: string;
  /** One sentence on what will be here. Written in the future tense,
   *  because it is not here now. */
  whatItWillShow: string;
  className?: string;
}

export default function SectionNotReady(p: SectionNotReadyProps) {
  return (
    <section className={p.className} style={card} role="status">
      <span style={mark}>
        <Database size={18} strokeWidth={2.25} aria-hidden />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          {p.section} is not connected to this workspace yet
        </span>
        <span style={{ fontSize: 14, lineHeight: '21px', color: '#5b6472' }}>
          {p.whatItWillShow} The screen is here so it can be reviewed; the records
          behind it are not, and nothing below is real data.
        </span>
      </div>
    </section>
  );
}

const card: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  background: '#f7f8fa', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '14px 16px', minWidth: 0,
};
const mark: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, background: '#eceff4',
  display: 'grid', placeItems: 'center', color: '#5b6472', flexShrink: 0,
};
