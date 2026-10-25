-- =====================================================================
--  THE CoA PAIR WAS LABELLED WITH THE WRONG COLUMN
--
--  20261128000000 enforced decision 2 — whoever verified a material
--  lot's certificate of analysis may not make its disposition — and
--  recorded its sections as coa_register / qa_disposition, with the
--  justification that PM-03 gives both columns to qa_manager and
--  qa_officer so the pair is not derivable.
--
--  The conclusion was right and the reason was wrong, which matters
--  because the reason is what a reviewer reads and what
--  duty_pair_is_derived() consults.
--
--  ── WHAT THE TWO CoA ACTS ACTUALLY ARE ──
--
--    certificate_of_analysis            The OUTGOING certificate,
--    (PM-03 column `coa_register`)      issued from a released batch.
--                                       Guarded by
--                                       trg_coa_section_role, which
--                                       asserts the coa_register
--                                       column. This is the register
--                                       screen.
--
--    material_certificates_of_analysis  The INCOMING supplier
--    (NO PM-03 column at all)           certificate, checked against
--                                       the material specification by
--                                       material_coa_verify(). This
--                                       is the act decision 2 is
--                                       about, and the column
--                                       material_lot_actor_duties
--                                       reads (verified_by).
--
--  They are different tables, different screens and different acts.
--  PM-03 tabulates the first and says nothing about the second.
--
--  So the pair is not derivable for a STRONGER reason than the one
--  recorded: not because two roles overlap on a column, but because
--  the matrix does not tabulate the act at all. The approval stands;
--  the label is corrected so that the next person does not go looking
--  for a role overlap that is beside the point.
--
--  ── AND A GAP, RECORDED NOT CLOSED ──
--
--  material_coa_verify() checks company membership and nothing else.
--  Any member of the company can verify an incoming certificate
--  today. No screen calls it, so nothing in the product exercises
--  that path — but the RPC is callable. Closing it means deciding
--  which role owns the act, which is the PM-03 change
--  docs/decision-note-coa-separation.md sets out. It is NOT closed
--  here, because choosing the role is the decision.
-- =====================================================================

UPDATE public.duty_conflicts
   SET section_a = 'incoming_coa_verification',
       approved_reference =
         'Decision 2, approved in the finalisation brief: independent CoA '
         || 'verification and QA disposition are required for critical release '
         || 'decisions. NOT derivable from PM-03 because the matrix has no '
         || 'column for incoming certificate verification at all — '
         || '`coa_register` is the outgoing register (certificate_of_analysis), '
         || 'a different table and a different act. See '
         || 'docs/decision-note-coa-separation.md for the PM-03 column that '
         || 'would have to be added, and docs/separation-of-duties.md §5.1.',
       note =
         'Enforced against the same material lot: whoever verified its '
         || 'incoming certificate may not then make its disposition. Read from '
         || 'material_certificates_of_analysis.verified_by, which '
         || 'material_coa_verify() sets from auth.uid(). section_a is a marker, '
         || 'not a PM-03 column: no PM-03 column governs this act, which is '
         || 'precisely why the pair carries an explicit approval.'
 WHERE scope = 'material_lot'
   AND duty_a = 'coa_verification' AND duty_b = 'disposition';


DO $assert$
DECLARE v_bad text;
BEGIN
  --  (a) The label is not a grid column, and must not be mistaken for
  --  one. duty_pair_is_derived() requires BOTH sections to exist in
  --  the grid, so it keeps returning false and the explicit approval
  --  keeps being required. Asserted, because if somebody ever adds a
  --  section with this name the pair silently becomes "derivable" and
  --  the approval stops being demanded.
  IF EXISTS (SELECT 1 FROM public.section_permissions
              WHERE section = 'incoming_coa_verification') THEN
    RAISE EXCEPTION
      'COA_MARKER_IS_NOW_A_COLUMN: incoming_coa_verification exists in PM-03. Decide its Act roles and reduce the pair to derived_from_pm03, or rename the marker.';
  END IF;

  IF public.duty_pair_is_derived('incoming_coa_verification', 'qa_disposition') THEN
    RAISE EXCEPTION 'COA_PAIR_UNEXPECTEDLY_DERIVABLE';
  END IF;

  --  (b) The pair is still enforced, and still on a named approval.
  --  `%s` on a boolean renders `t`, not `true`. Spelled out rather
  --  than relying on the cast.
  SELECT format('enforced=%s authority=%s',
                CASE WHEN enforced THEN 'true' ELSE 'false' END, authority)
    INTO v_bad
    FROM public.duty_conflicts
   WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition';
  IF v_bad IS DISTINCT FROM 'enforced=true authority=approved_by_quality' THEN
    RAISE EXCEPTION 'COA_PAIR_CHANGED_STATE: %', coalesce(v_bad,'(missing)');
  END IF;

  --  (c) The guard from 20261128000000 still holds for everything
  --  else: nothing claims PM-03 as its authority without being
  --  derivable from it.
  SELECT string_agg(format('%s %s/%s', scope, duty_a, duty_b), '; ') INTO v_bad
    FROM public.duty_conflicts
   WHERE enforced AND authority = 'derived_from_pm03'
     AND NOT public.duty_pair_is_derived(section_a, section_b);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DUTY_CONFLICT_NOT_DERIVED: %', v_bad;
  END IF;

  --  (d) AND THE OUTGOING REGISTER IS UNTOUCHED. coa_register still
  --  governs certificate_of_analysis and still gives Act to the two QA
  --  roles; this migration changed a label, not a permission.
  IF NOT EXISTS (SELECT 1 FROM public.section_permissions
                  WHERE section='coa_register' AND role='qa_manager' AND access='act')
     OR NOT EXISTS (SELECT 1 FROM public.section_permissions
                     WHERE section='coa_register' AND role='qa_officer' AND access='act')
  THEN
    RAISE EXCEPTION 'PM03_CHANGED: the outgoing CoA register column was altered, which this migration must not do';
  END IF;
END
$assert$;
