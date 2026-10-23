/**
 * "Material and batch flow" — the eight stages drawn on DB-01 and DB-02,
 * and which PM-03 column decides the access chip on each.
 *
 * THE CARD IS THE SAME ON BOTH DASHBOARDS AND READS DIFFERENTLY ON EACH,
 * which is the point of it. DB-01 subtitles it "your access is shown on
 * each stage" and DB-02 "Stages you can't open still show where your
 * lots are". A Storekeeper sees the whole chain of custody and a locked
 * chip on the parts that are not theirs, rather than a shorter chain
 * that hides the existence of QC.
 *
 * ── A DISAGREEMENT INSIDE THE DESIGN FILE, RECORDED NOT RESOLVED ──
 *
 * The chips drawn on DB-01 and DB-02 do not all match the grid on PM-03.
 * PM-03 is "Roles — what each role can open" and is the screen an
 * administrator uses to set access, so this module derives every chip
 * from PM-03 and treats the drawn chips as the illustration. Where they
 * differ, the difference is listed here rather than quietly split:
 *
 *   stage 01 PROCUREMENT, QA Manager
 *     PM-03 suppliers = Act, DB-01 draws View.
 *   stage 03 QC TESTING, QA Manager
 *     PM-03 qc_testing = View, DB-01 draws Act.
 *   stage 04 QA DISPOSITION, Storekeeper
 *     PM-03 qa_disposition = no access, DB-02 draws View.
 *   stage 07 QA RELEASE, Storekeeper
 *     PM-03 batch_release = no access, DB-02 draws View — and DB-02's
 *     own "Sections you can't open" card lists Batch release decision
 *     as not openable, so the frame disagrees with itself here.
 *
 * Following PM-03 makes the dashboard agree with the screen that
 * grants access, and makes a Storekeeper's locked stages agree with
 * their own locked-sections list. Following the drawn chips would have
 * shown a Storekeeper "View" on QA release while the same page told
 * them they cannot open it.
 *
 * ── STAGE 06 HAS NO COLUMN AT ALL ──
 *
 * PM-03 tabulates one QC TESTING column; the flow splits testing into
 * 03 (incoming material) and 06 (finished product). There is no
 * separate column for finished-product QC anywhere in the file, so 06
 * reads the qc_testing cell. That is an assumption, flagged here,
 * NOT something the design states.
 */

import type { PmSection } from '../../../lib/access/roleAccess';

export interface FlowStage {
  /** "01" … "08", as drawn. */
  no: string;
  /** "PROCUREMENT". Upper case is the design's, applied in CSS. */
  title: string;
  /** "Source & purchase". */
  caption: string;
  /**
   * The PM-03 column that decides this stage's chip. Null where the
   * design draws a stage that no column governs — the chip then falls
   * back to the role's access on `section`, and null means "unknown",
   * which renders as no access rather than as permission.
   */
  section: PmSection | null;
  /**
   * True where this module had to choose a column the design does not
   * name. Surfaced so a reader of the card knows which chip is inferred.
   */
  inferred?: boolean;
  /** The page this stage opens, when the viewer may open it. */
  page?: string;
}

export const FLOW_STAGES: FlowStage[] = [
  { no: '01', title: 'Procurement',     caption: 'Source & purchase',    section: 'suppliers',       page: 'supplier-qualification' },
  { no: '02', title: 'Warehouse',       caption: 'Receiving & storage',  section: 'goods_receipt',   page: 'goods-receipt' },
  { no: '03', title: 'QC testing',      caption: 'Laboratory analysis',  section: 'qc_testing',      page: 'qc-testing' },
  { no: '04', title: 'QA disposition',  caption: 'Quality decision',     section: 'qa_disposition',  page: 'qa-disposition' },
  { no: '05', title: 'Production',      caption: 'Manufacturing',        section: 'batch_records',   page: 'batch-execution' },
  //  See the header: finished-product QC has no column of its own.
  { no: '06', title: 'Finished QC',     caption: 'Final testing',        section: 'qc_testing',      inferred: true, page: 'qc-testing' },
  { no: '07', title: 'QA release',      caption: 'Final approval',       section: 'batch_release',   page: 'batch-release' },
  { no: '08', title: 'Distribution',    caption: 'To market',            section: 'distribution' },
];

/**
 * The counts each stage shows, as live numbers rather than the design's
 * illustrative ones.
 *
 * DB-01 and DB-02 put DIFFERENT numbers on the same stage — stage 05 is
 * "6 active batches" for a QA Manager and "4 issue requests" for a
 * Storekeeper, stage 08 is "2 released, ready to ship" against "2 ready
 * to dispatch". The stage is the same; what each role is counting is
 * not. So the caption travels with the count rather than being fixed on
 * the stage.
 */
export interface StageCount {
  /** The number, or null while it is still being read. */
  value: number | null;
  /** "lots in quarantine". Lower case, as drawn. */
  label: string;
}
