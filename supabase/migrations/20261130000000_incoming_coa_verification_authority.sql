-- =====================================================================
--  VERIFYING AN INCOMING CERTIFICATE NEEDS A QUALITY ROLE
--
--  ── THE FINDING ──
--
--  material_coa_verify() checked company membership and nothing else.
--  Demonstrated, not inferred: a member holding NO operational role,
--  with no Act on any quality column, in a non-service context,
--  called it and the certificate came back
--
--      verification_status = 'verified', verified_by = <their id>
--
--  EXECUTE is granted to `authenticated` (not anon, not PUBLIC) and
--  the function is SECURITY DEFINER owned by postgres, so the only
--  thing standing between any signed-in member and a verified
--  certificate was app_is_company_member().
--
--  That matters beyond the act itself. The material disposition gate
--  reads material_certificates_of_analysis.verified_by for decision 2,
--  so an unauthorised verification both records a quality judgement
--  nobody was entitled to make AND creates a duty conflict against the
--  person who made it.
--
--  ── THE CORRECTION, AND WHY IT IS THE SMALLEST ONE ──
--
--  Option B was accepted for this release: PM-03 is not redesigned and
--  no screen is built. So the authority cannot come from a new column.
--  It comes from the columns PM-03 already has.
--
--  Verifying an incoming certificate against the material
--  specification is quality work on a material lot. PM-03 already says
--  who does quality work on a material lot: `qc_testing` Act (the QC
--  Analyst) and `qa_disposition` Act (the QA Officer and QA Manager).
--  The check is computed from those columns at run time rather than
--  naming roles, so it follows the grid if the grid ever changes.
--
--  This adds no column, no screen and no new authority: every role it
--  admits already holds Act on a quality column today.
--
--  ── NO ABSTENTION, DELIBERATELY ──
--
--  Everywhere else a person holding no tabulated role abstains, so the
--  design declining to rule does not lock a workspace out of its own
--  work. Abstaining HERE would leave exactly the hole that was
--  demonstrated: the people with no role are the ones who could verify.
--
--  This is the same asymmetry 20261117000000 argued for specification
--  approval, and for the same reason.
--
--  ── WHAT IS NOT CHANGED ──
--
--  The duty conflict is untouched. Whoever verifies a lot's
--  certificate is still refused its disposition
--  (MATERIAL_DISPOSITION_SELF_VERIFIED). Narrowing who may verify does
--  not narrow that, and a QA Manager who verifies a certificate still
--  cannot disposition that lot — somebody else must.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.material_coa_verify_authority_error(
  p_company_id uuid,
  p_actor      uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_held text[];
BEGIN
  --  Derived from the grid, not from a list of role names. `= 'act'`
  --  rather than `<> 'none'` so a PM-04 restriction lowering somebody
  --  to view also refuses them here.
  IF public.app_section_access(p_company_id, 'qc_testing', p_actor) = 'act'
     OR public.app_section_access(p_company_id, 'qa_disposition', p_actor) = 'act'
  THEN
    RETURN NULL;
  END IF;

  v_held := public.app_work_roles(p_company_id, p_actor);

  RETURN
    'COA_VERIFY_FORBIDDEN: verifying an incoming certificate against the material '
    || 'specification is quality work, reserved to a role PM-03 gives Act on QC testing '
    || 'or QA disposition; your role is '
    || CASE
         WHEN v_held IS NULL OR array_length(v_held,1) IS NULL THEN '(none)'
         ELSE array_to_string(v_held, ', ')
       END;
END;
$$;

COMMENT ON FUNCTION public.material_coa_verify_authority_error(uuid, uuid) IS
  'The reason this caller may not verify an incoming certificate of analysis, or NULL when they may. Computed from PM-03''s qc_testing and qa_disposition columns; holding no operational role is a refusal, not an abstention.';

REVOKE ALL ON FUNCTION public.material_coa_verify_authority_error(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_coa_verify_authority_error(uuid, uuid)
  TO authenticated, service_role;


-- ── The check, inside the RPC ───────────────────────────────────────
--
-- Added to the existing membership check rather than replacing it:
-- a non-member must still be refused as a non-member, which is a
-- different and earlier question.
--
-- The whole function is not re-issued. It is 170 lines of verification
-- arithmetic that has its own tests, and re-stating it to add four
-- lines is how an unrelated regression gets in. Instead the authority
-- check is wrapped around it: material_coa_verify() keeps its name and
-- its body, and a BEFORE-UPDATE trigger on the row it writes refuses
-- the write when the caller has no authority.
--
-- The trigger is on material_certificates_of_analysis, so a direct
-- UPDATE setting verification_status meets the same refusal as the
-- RPC. That is the property worth having and the reason this is not
-- done by editing the function.

CREATE OR REPLACE FUNCTION public.fn_material_coa_verification_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_err text;
BEGIN
  IF public.app_is_service_context() THEN RETURN NEW; END IF;

  --  Only a VERIFICATION is a quality judgement. Uploading a
  --  certificate, correcting its document path or recording its
  --  number are clerical and stay open to any member, as they were.
  --
  --  The two operations are tested in separate IF statements, not one
  --  with a CASE in the condition: plpgsql reads an IF condition up to
  --  the first THEN, so a CASE's own THEN ends the condition early and
  --  the function will not even compile.
  IF TG_OP = 'INSERT' THEN
    --  'unverified' is the column default, so a row inserted without
    --  mentioning verification at all arrives in that state.
    IF NEW.verified_by IS NULL AND NEW.verification_status = 'unverified' THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by
       AND NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status THEN
      RETURN NEW;
    END IF;
  END IF;

  v_err := public.material_coa_verify_authority_error(NEW.company_id, auth.uid());
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION '%', v_err
      USING ERRCODE = 'P0001',
            HINT = 'Being a member of the company is not a quality role.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_coa_verification_authority
  ON public.material_certificates_of_analysis;
CREATE TRIGGER trg_material_coa_verification_authority
  BEFORE INSERT OR UPDATE ON public.material_certificates_of_analysis
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_coa_verification_authority();


-- ── Prove it, by attempting the thing that worked ───────────────────

DO $assert$
DECLARE
  c uuid; u_none uuid; u_an uuid; m uuid; spec uuid; lot uuid; coa uuid;
  v_hit boolean; r jsonb;
BEGIN
  BEGIN
    c := gen_random_uuid(); u_none := gen_random_uuid(); u_an := gen_random_uuid();

    INSERT INTO public.companies(id,name) VALUES (c,'CoA authority self test');
    INSERT INTO auth.users(id,email) VALUES
      (u_none,'coaauth-none@invalid.test'), (u_an,'coaauth-an@invalid.test');
    INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
      (u_none,'coaauth-none@invalid.test','Nobody',  c,'content_creator'),
      (u_an,  'coaauth-an@invalid.test',  'Analyst', c,'compliance_officer');
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (c,u_none,'viewer','active'), (c,u_an,'viewer','active');
    PERFORM public.operational_role_assign(c,u_an,'qc_analyst','self test');

    INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
    VALUES (c,'material_lot','{PREFIX}-{SEQ}','CA',4) ON CONFLICT DO NOTHING;

    INSERT INTO public.materials
      (id,company_id,code,name,material_type,criticality,unit_of_measure,created_by)
    VALUES (gen_random_uuid(),c,'CAM-1','Lactose','excipient','standard','kg',u_an)
    RETURNING id INTO m;
    INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
    VALUES (c,m,'1.0','effective',u_an) RETURNING id INTO spec;
    INSERT INTO public.material_specification_parameters
      (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical)
    VALUES (spec,'Assay','%','range',95.0,105.0,true);
    INSERT INTO public.material_lots(id,company_id,material_id,quantity_received,created_by)
    VALUES (gen_random_uuid(),c,m,10,u_an) RETURNING id INTO lot;
    INSERT INTO public.material_certificates_of_analysis
      (company_id,material_lot_id,supplier_results,uploaded_by)
    VALUES (c,lot,'[{"parameter":"Assay","stated_value":99.0}]'::jsonb,u_an)
    RETURNING id INTO coa;

    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_none::text, 'role','authenticated')::text, true);
    IF public.app_is_service_context() THEN RAISE EXCEPTION 'SELF_TEST_STILL_SERVICE'; END IF;

    --  (a) THE EXACT CALL THAT SUCCEEDED BEFORE.
    v_hit := false;
    BEGIN
      PERFORM public.material_coa_verify(coa);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'COA_VERIFY_FORBIDDEN%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN
      RAISE EXCEPTION 'COA_VERIFY_STILL_OPEN: a member with no quality role verified a certificate';
    END IF;

    --  (b) And a direct write of the same fields, which is the route
    --  the RPC would otherwise have been the only guard on.
    v_hit := false;
    BEGIN
      UPDATE public.material_certificates_of_analysis
         SET verification_status = 'verified', verified_by = u_none, verified_at = now()
       WHERE id = coa;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'COA_VERIFY_FORBIDDEN%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN
      RAISE EXCEPTION 'COA_VERIFY_DIRECT_WRITE_OPEN';
    END IF;

    --  (c) AND THE QC ANALYST STILL CAN. A control that refuses
    --  everybody is an outage, not a control.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_an::text, 'role','authenticated')::text, true);
    r := public.material_coa_verify(coa);
    IF r->>'verification_status' IS NULL THEN
      RAISE EXCEPTION 'COA_VERIFY_REFUSES_THE_ANALYST: %', coalesce(r::text,'NULL');
    END IF;

    --  (d) And the duty conflict still follows them.
    IF public.duty_conflict('material_lot', lot, 'disposition', u_an) IS NULL THEN
      RAISE EXCEPTION 'DECISION_2_LOST: the verifier is no longer refused the disposition';
    END IF;

    PERFORM set_config('role','none',true);
    RAISE EXCEPTION 'ROLLBACK_THE_ASSERTION';
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('role','none',true);
      IF SQLERRM <> 'ROLLBACK_THE_ASSERTION' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
END
$assert$;
