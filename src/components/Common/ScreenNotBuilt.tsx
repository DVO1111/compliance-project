/**
 * The panel behind a rail entry the design draws and no page answers to.
 *
 * WHY A TAB THAT ADMITS THIS BEATS THE TWO ALTERNATIVES. DB-01's rail
 * lists fourteen destinations. Five of them — My tasks, Goods receipt,
 * QC testing, QA disposition and Traceability — have no page in this
 * codebase. There were three ways to handle that and only one of them
 * is honest.
 *
 * Leaving them out makes the product look unfinished against its own
 * design, and the rail stops being the thing that was signed off.
 *
 * Pointing them at the nearest existing screen is worse. "QA
 * disposition" opening the batch release register, or "Goods receipt"
 * opening the material lot list, looks finished. Somebody demonstrates
 * it, somebody else files a record there, and the gap is discovered
 * after it has been built on.
 *
 * So the tab is where the design puts it, and says plainly what it is.
 * This is distinct from SectionNotReady, which means "the page exists
 * and its tables do not". This one means "the page does not exist".
 */

import { Hammer } from 'lucide-react';

export interface ScreenNotBuiltProps {
  /** The rail's own words for this screen, e.g. "QA disposition". */
  name: string;
  /** One sentence on what it will do. Future tense, because it does
   *  not do it yet. */
  whatItWillDo: string;
  /** The screen in the design file this comes from, e.g. "DB-01". */
  designRef?: string;
}

export default function ScreenNotBuilt({ name, whatItWillDo, designRef }: ScreenNotBuiltProps) {
  return (
    <div style={wrap}>
      <section style={card} role="status">
        <span style={mark}>
          <Hammer size={20} strokeWidth={2} aria-hidden />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{name} is not built yet</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: '#5b6472' }}>
            {whatItWillDo}
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: '#78808d' }}>
            It appears in the navigation because {designRef ?? 'the design'} lists it.
            Nothing here records anything, and no data is stored against it.
          </p>
        </div>
      </section>
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, paddingTop: 4,
};
const card: React.CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start',
  background: '#f7f8fa', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '18px 20px', minWidth: 0, maxWidth: 640,
};
const mark: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, background: '#eceff4',
  display: 'grid', placeItems: 'center', color: '#5b6472', flexShrink: 0,
};
