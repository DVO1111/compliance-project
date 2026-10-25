-- =====================================================================
--  SEPARATIONS PM-03 DOES NOT DERIVE, APPROVED EXPLICITLY
--
--  20261122000000 refuses to enforce a duty pair unless PM-03 already
--  separates the two sections. That guard exists to stop a migration
--  inventing a quality rule, and it did its job: decisions 2 and 3
--  were held unenforced because the matrix contemplates one person
--  doing both.
--
--  They have now been decided. So the model needs a second, narrower
--  way for a pair to be enforceable — one that cannot be used by
--  accident and that records who decided:
--
--    derived_from_pm03   PM-03 already separates the two columns.
--                        Needs no further authority.
--    approved_by_quality A named decision that goes BEYOND the matrix.
--                        Must carry a reference, and the reference
--                        must say where the decision is recorded.
--
--  The guard is not removed, it is narrowed: an enforced pair is still
--  refused unless it is one of those two, and the second demands a
--  written reference. A pair cannot become enforced by somebody
--  editing a seed and hoping.
--
--  ── A DIVERGENCE, RECORDED RATHER THAN HIDDEN ──
--
--  Decision 2 makes the gate STRICTER THAN PM-03. The matrix gives
--  coa_register and qa_disposition both to qa_manager and qa_officer,
--  so it still shows one person able to do both while the gate refuses
--  it on the same lot. That is a deliberate, authorised divergence —
--  not a transcription error — and it is recorded here, in
--  docs/separation-of-duties.md and in the conflict register. If the
--  matrix is ever changed to match, duty_pair_is_derived() starts
--  returning true and this pair needs no special authority.
-- =====================================================================

-- ── 1. Where a pair's authority comes from ──────────────────────────

ALTER TABLE public.duty_conflicts
  ADD COLUMN IF NOT EXISTS authority text NOT NULL DEFAULT 'derived_from_pm03',
  ADD COLUMN IF NOT EXISTS approved_reference text;

ALTER TABLE public.duty_conflicts
  DROP CONSTRAINT IF EXISTS duty_conflict_authority_known,
  DROP CONSTRAINT IF EXISTS duty_conflict_approval_has_a_reference;

ALTER TABLE public.duty_conflicts
  ADD CONSTRAINT duty_conflict_authority_known
    CHECK (authority IN ('derived_from_pm03', 'approved_by_quality')),
  --  AN APPROVAL WITHOUT A REFERENCE IS A CLAIM. The reference is what
  --  a reviewer follows to find who decided and on what basis.
  ADD CONSTRAINT duty_conflict_approval_has_a_reference
    CHECK (authority <> 'approved_by_quality'
           OR (approved_reference IS NOT NULL AND btrim(approved_reference) <> ''));


-- ── 2. Decision 2 — the CoA verifier may not disposition ────────────

UPDATE public.duty_conflicts
   SET enforced = true,
       decision_status = 'mandatory',
       authority = 'approved_by_quality',
       approved_reference =
         'Decision 2, approved in the finalisation brief: independent CoA '
         || 'verification and QA disposition are required for critical release '
         || 'decisions. Goes BEYOND PM-03, which gives coa_register and '
         || 'qa_disposition both to qa_manager and qa_officer. Recorded in '
         || 'docs/separation-of-duties.md §4 and conflict register §40.',
       note =
         'Enforced against the same material lot: whoever verified its '
         || 'certificate of analysis may not then make its disposition. The '
         || 'verifier and the certificate are evidence — '
         || 'material_certificates_of_analysis.verified_by and verified_at — and '
         || 'the duty is read from them.'
 WHERE scope = 'material_lot'
   AND duty_a = 'coa_verification' AND duty_b = 'disposition';


-- ── 3. Decision 3 — sampling, separated only where a procedure says so
--
-- The brief is explicit: "Require different actors only where the
-- approved quality procedure requires independence. Do not invent a
-- universal mandatory separation rule without evidence from the site's
-- procedure."
--
-- So the pair stays registered and unenforced, and what this adds is
-- the switch and what it would take to throw it. Sampling and testing
-- are already distinct activities with their own actor and timestamp —
-- material_lot_sampling.sampled_by / sampled_on and
-- material_test_results.analyst_id / test_date — so the attribution
-- the rule would read already exists and is already preserved.
--
-- Turning it on is one UPDATE, and the CHECK above will demand a
-- reference for it, because it is not derivable from PM-03 either.

UPDATE public.duty_conflicts
   SET note =
         'Decision 3: NOT enforced, and deliberately. Sampling has no PM-03 '
         || 'column, so the matrix rules neither way, and the brief requires '
         || 'evidence from the site procedure rather than a universal rule. '
         || 'The attribution it would read already exists and is preserved '
         || '(material_lot_sampling.sampled_by, material_test_results.analyst_id). '
         || 'TO ENFORCE: set enforced = true, decision_status = ''mandatory'', '
         || 'authority = ''approved_by_quality'' and name the procedure in '
         || 'approved_reference.'
 WHERE scope = 'material_lot'
   AND duty_a = 'qc_testing' AND duty_b = 'sampling';


-- ── 4. Decisions 1, 4 and 6 — confirmed ─────────────────────────────
--
-- They were enforced as conservative defaults pending confirmation.
-- The brief confirms all three, so they stop being provisional. The
-- distinction matters: `conservative_default` means nobody has ruled,
-- and leaving them there after a ruling would misreport the state.

UPDATE public.duty_conflicts
   SET decision_status = 'mandatory',
       note = coalesce(note,'') || ' CONFIRMED in the finalisation brief.'
 WHERE decision_status = 'conservative_default';

UPDATE public.duty_definitions
   SET decision_status = 'mandatory',
       note = coalesce(note,'')
              || ' CONFIRMED in the finalisation brief: decision 6, the broad reading stands.'
 WHERE decision_status = 'conservative_default';


-- ── 5. The guard, narrowed rather than removed ──────────────────────

DO $assert$
DECLARE v_bad text;
BEGIN
  --  (a) An enforced pair is derived from PM-03, OR carries a named
  --  approval. Nothing else is enforceable, which is what stops a seed
  --  edit becoming a quality rule.
  SELECT string_agg(format('%s %s/%s', c.scope, c.duty_a, c.duty_b), '; ') INTO v_bad
    FROM public.duty_conflicts c
   WHERE c.enforced
     AND c.authority = 'derived_from_pm03'
     AND NOT public.duty_pair_is_derived(c.section_a, c.section_b);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'DUTY_CONFLICT_NOT_DERIVED: % claims to come from PM-03 and does not. Approve it explicitly or do not enforce it.',
      v_bad;
  END IF;

  --  (b) Every explicit approval names where the decision is recorded.
  --  The CHECK enforces non-empty; this insists it is a reference and
  --  not a shrug.
  SELECT string_agg(format('%s %s/%s', c.scope, c.duty_a, c.duty_b), '; ') INTO v_bad
    FROM public.duty_conflicts c
   WHERE c.authority = 'approved_by_quality'
     AND length(coalesce(c.approved_reference,'')) < 40;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'DUTY_APPROVAL_NOT_REFERENCED: % is approved beyond PM-03 with no usable reference', v_bad;
  END IF;

  --  (c) THE DIVERGENCE IS REAL AND EXPECTED. If PM-03 is ever changed
  --  so that it does separate these two columns, this pair no longer
  --  needs special authority — and somebody should notice rather than
  --  leave an approval standing for a rule the matrix now derives.
  IF public.duty_pair_is_derived('coa_register', 'qa_disposition') THEN
    RAISE NOTICE
      'PM-03 now separates coa_register from qa_disposition. The CoA/disposition pair is derivable; its approved_by_quality authority can be reduced to derived_from_pm03.';
  END IF;

  --  (d) Nothing is left calling itself provisional after the brief
  --  confirmed it.
  IF EXISTS (SELECT 1 FROM public.duty_conflicts WHERE decision_status = 'conservative_default')
  THEN
    RAISE EXCEPTION 'CONSERVATIVE_DEFAULT_LEFT_STANDING: a confirmed decision still reads as provisional';
  END IF;
END
$assert$;


-- ── 6. And it bites, on the lot ─────────────────────────────────────

DO $assert2$
DECLARE
  v_c uuid; v_a uuid; v_b uuid; v_mat uuid; v_lot uuid;
BEGIN
  BEGIN
    v_c := gen_random_uuid(); v_a := gen_random_uuid(); v_b := gen_random_uuid();
    INSERT INTO public.companies(id,name) VALUES (v_c,'CoA separation self test');
    INSERT INTO auth.users(id,email) VALUES
      (v_a,'coa-a@invalid.test'), (v_b,'coa-b@invalid.test');
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (v_c,v_a,'admin','active'), (v_c,v_b,'viewer','active');
    INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
    VALUES (v_c,'material_lot','{PREFIX}-{SEQ}','CO',4)
    ON CONFLICT (company_id,scope) DO NOTHING;

    INSERT INTO public.materials
      (id,company_id,code,name,material_type,criticality,unit_of_measure,created_by)
    VALUES (gen_random_uuid(),v_c,'COM-1','Lactose','excipient','standard','kg',v_a)
    RETURNING id INTO v_mat;

    INSERT INTO public.material_lots
      (id,company_id,material_id,quantity_received,created_by)
    VALUES (gen_random_uuid(),v_c,v_mat,10,v_a) RETURNING id INTO v_lot;

    --  v_a verified the certificate.
    INSERT INTO public.material_certificates_of_analysis
      (company_id, material_lot_id, supplier_results, uploaded_by,
       verified_by, verified_at, verification_status)
    VALUES (v_c, v_lot, '[]'::jsonb, v_a, v_a, now(), 'verified');

    IF NOT (public.material_lot_actor_duties(v_lot, v_a) @> ARRAY['coa_verification']) THEN
      RAISE EXCEPTION 'COA_DUTY_NOT_SEEN';
    END IF;

    IF public.duty_conflict('material_lot', v_lot, 'disposition', v_a) IS NULL THEN
      RAISE EXCEPTION 'DECISION_2_UNREACHABLE: the CoA verifier is not refused the disposition';
    END IF;
    IF public.duty_conflict('material_lot', v_lot, 'disposition', v_b) IS NOT NULL THEN
      RAISE EXCEPTION 'DECISION_2_TOO_WIDE: somebody who verified nothing was refused';
    END IF;

    RAISE EXCEPTION 'ROLLBACK_THE_ASSERTION';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'ROLLBACK_THE_ASSERTION' THEN RAISE; END IF;
  END;
END
$assert2$;
